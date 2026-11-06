import { createClient } from "@supabase/supabase-js"
import { handleBooking } from "./booking"

type Json = Record<string, unknown>
const env = (name: string) => (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name]

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
  const { data: artisan } = await authed
    .from("artisans")
    .select("prenom, nom_entreprise, entreprise_nom, entreprise_adresse, entreprise_cp_ville, entreprise_email, entreprise_telephone, email, telephone, tarifs")
    .eq("id", user.id)
    .maybeSingle()

  const [r, slotsRes] = await Promise.all([
    fetch("https://api.x.ai/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expires_after: { seconds: 300 } }),
    }),
    handleBooking(authorization, { action: "slots" }).catch(() => ({ status: 500, body: {} as Json })),
  ])
  const payload = await r.json().catch(() => ({})) as { value?: string; expires_at?: number }
  if (!r.ok || !payload.value) {
    return { status: 502, body: { error: "Impossible de créer la session vocale auprès de xAI." } }
  }
  const rawSlots = (slotsRes.body as { slots?: unknown }).slots
  const slots = Array.isArray(rawSlots) ? rawSlots : []

  return {
    status: 200,
    body: {
      value: payload.value,
      expires_at: payload.expires_at,
      profile: {
        prenom: artisan?.prenom || "",
        company: artisan?.nom_entreprise || artisan?.entreprise_nom || "",
        email: artisan?.entreprise_email || artisan?.email || user.email || "",
        phone: artisan?.entreprise_telephone || artisan?.telephone || "",
        address: artisan?.entreprise_adresse || "",
        city: artisan?.entreprise_cp_ville || "",
        tarifs: artisan?.tarifs && typeof artisan.tarifs === "object" ? artisan.tarifs : undefined,
      },
      slots,
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
