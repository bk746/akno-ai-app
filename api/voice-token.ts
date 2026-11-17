import { createClient } from "@supabase/supabase-js"
import { can, loadEntitlements, upgradeError } from "./_lib/plans.js"
import { consume, dayKey, monthKey, rateLimit, usage } from "./_lib/limits.js"
type Json = Record<string, unknown>
const env = (name: string) => (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name]
const PLACEHOLDER_COMPANY = /^l['\u2019]entreprise$/i
function companyName(...vals: Array<string | null | undefined>) {
  for (const v of vals) {
    const t = (v ?? "").trim()
    if (t && !PLACEHOLDER_COMPANY.test(t)) return t
  }
  return "Akno"
}

export async function mintVoiceToken(authorization?: string): Promise<{ status: number; body: Json }> {
  const apiKey = env("XAI_API_KEY")
  if (!apiKey) {
    return {
      status: 503,
      body: { error: "La clé XAI_API_KEY n'est pas encore configurée sur Vercel." },
    }
  }

  const access = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : ""
  if (!access) return { status: 401, body: { error: "Non authentifié." } }

  const supabaseUrl = env("VITE_SUPABASE_URL") || env("SUPABASE_URL")
  const supabaseKey = env("VITE_SUPABASE_ANON_KEY") || env("SUPABASE_ANON_KEY")
  if (!supabaseUrl || !supabaseKey) {
    return { status: 503, body: { error: "Configuration Supabase manquante." } }
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data: { user }, error } = await supabase.auth.getUser(access)
  if (error || !user) return { status: 401, body: { error: "Session invalide." } }

  const authed = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${access}` } },
  })
  // update45 : offre (option Réceptionniste), limite de débit, quota de sessions et plafond de minutes
  const ent = await loadEntitlements(authed, user.id)
  if (!can(ent, "reception")) return { status: 402, body: { error: upgradeError("reception", ent), code: "upgrade" } }
  if (!await rateLimit(user.id, "voice-token", 6)) return { status: 429, body: { error: "Trop d'appels d'affilée. Patientez une minute." } }
  if (ent.quotas.voice_minutes > 0) {
    const used = await usage(user.id, "voice_seconds", monthKey())
    if (used >= ent.quotas.voice_minutes * 60) {
      return { status: 429, body: { error: `Plafond de ${ent.quotas.voice_minutes} minutes de réceptionniste atteint ce mois-ci.`, code: "minutes" } }
    }
  }
  if (!await consume(user.id, "voice_sessions", dayKey(), ent.quotas.voice_sessions_day)) {
    return { status: 429, body: { error: "Nombre maximum d'appels de test atteint pour aujourd'hui." } }
  }

  const { data: artisan } = await authed
    .from("artisans")
    .select("*")
    .eq("id", user.id)
    .maybeSingle()

  // Ne pas importer ./booking ici : sur Vercel, un import d'une autre
  // fonction API fait planter le module au chargement (FUNCTION_INVOCATION_FAILED).
  // Les créneaux sont préchargés côté client, avec un timeout court.
  const r = await fetch("https://api.x.ai/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expires_after: { seconds: 300 } }),
  })
  const payload = await r.json().catch(() => ({})) as { value?: string; expires_at?: number }
  if (!r.ok || !payload.value) {
    return { status: 502, body: { error: "Impossible de créer la session vocale auprès de xAI." } }
  }

  return {
    status: 200,
    body: {
      value: payload.value,
      expires_at: payload.expires_at,
      profile: {
        prenom: artisan?.prenom || "",
        company: companyName(artisan?.nom_entreprise, artisan?.entreprise_nom),
        email: artisan?.entreprise_email || artisan?.email || user.email || "",
        phone: artisan?.entreprise_telephone || artisan?.telephone || "",
        address: artisan?.entreprise_adresse || "",
        city: artisan?.entreprise_cp_ville || "",
        tarifs: artisan?.tarifs && typeof artisan.tarifs === "object" ? artisan.tarifs : undefined,
        telephoneUrgence: typeof artisan?.telephone_urgence === "string" ? artisan.telephone_urgence : "",
        accueil: typeof artisan?.message_accueil === "string" ? artisan.message_accueil.slice(0, 300) : "",
      },
      plan: { status: ent.status, minutes: ent.quotas.voice_minutes },
    },
  }
}

type Res = { status: (n: number) => Res; json: (b: unknown) => void; setHeader: (k: string, v: string) => void; end: () => void }

export default async function handler(req: { method?: string; headers: Record<string, string | string[] | undefined> }, res: Res) {
  res.setHeader("Cache-Control", "no-store")
  if (req.method === "OPTIONS") { res.status(204).end(); return }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Méthode non autorisée." })
    return
  }
  const raw = req.headers.authorization ?? req.headers.Authorization
  const auth = Array.isArray(raw) ? raw[0] : raw
  const { status, body } = await mintVoiceToken(auth)
  res.status(status).json(body)
}
