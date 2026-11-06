import { createClient } from "@supabase/supabase-js"
import { env } from "./_lib/mail.js"
import { sendPushToArtisan, type PushPayload } from "./_lib/push.js"

type Json = Record<string, unknown>
type ApiResult = { status: number; body: Json }

async function authed(authorization?: string): Promise<{ userId: string } | { status: number; body: Json }> {
  const access = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : ""
  if (!access) return { status: 401, body: { error: "Non authentifié." } }
  const supabaseUrl = env("VITE_SUPABASE_URL") || env("SUPABASE_URL")
  const supabaseKey = env("VITE_SUPABASE_ANON_KEY") || env("SUPABASE_ANON_KEY")
  if (!supabaseUrl || !supabaseKey) return { status: 503, body: { error: "Configuration Supabase manquante." } }
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data: { user }, error } = await supabase.auth.getUser(access)
  if (error || !user) return { status: 401, body: { error: "Session invalide." } }
  return { userId: user.id }
}

function shortDebrief(body: Json) {
  const raw = [body.resume, body.besoin_detail, body.motif, body.body]
    .map(v => typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "")
    .find(Boolean) || ""
  if (raw.length <= 120) return raw
  const cut = raw.slice(0, 117)
  const sp = cut.lastIndexOf(" ")
  return `${(sp > 80 ? cut.slice(0, sp) : cut).trim()}…`
}

function payloadFrom(body: Json): PushPayload | null {
  const type = String(body.type || "")
  if (type === "test") {
    return {
      title: "Test de notification",
      body: "Si vous voyez ceci, les notifications Akno fonctionnent.",
      url: "/parametres",
      tag: "akno-test",
    }
  }
  if (type === "call") {
    const client = String(body.client || "Client").trim() || "Client"
    const urgent = body.urgent === true || body.urgence === "urgent" || body.type_demande === "urgence"
    const rappel = body.rappel_souhaite === true
    const creneau = String(body.rappel_creneau || "").trim()
    const debrief = shortDebrief(body) || "Nouvel appel"
    const extra = rappel ? (creneau ? `À rappeler (${creneau})` : "À rappeler") : ""
    return {
      title: urgent ? `URGENT · ${client}` : `Nouvel appel · ${client}`,
      body: extra ? `${debrief} · ${extra}` : debrief,
      url: "/reception",
      tag: `call-${body.call_id || Date.now()}`,
    }
  }
  if (type === "appointment") {
    const client = String(body.client || "Client")
    const when = String(body.when || "Nouveau rendez-vous")
    return { title: "Nouveau rendez-vous", body: `${client} · ${when}`, url: "/agenda", tag: `rdv-${body.appointment_id || Date.now()}` }
  }
  return null
}

export async function handleNotify(authorization?: string, body?: unknown): Promise<ApiResult> {
  const session = await authed(authorization)
  if ("status" in session) return session
  const input = (body && typeof body === "object" ? body : {}) as Json
  const payload = payloadFrom(input)
  if (!payload) return { status: 400, body: { error: "Type de notification inconnu." } }
  const result = await sendPushToArtisan(session.userId, payload)
  if (result.skipped) return { status: 503, body: { ok: false, error: result.error || "Notifications non configurées." } }
  return {
    status: result.ok ? 200 : 502,
    body: { ok: result.ok, sent: result.sent, error: result.error },
  }
}

type Res = { status: (n: number) => Res; json: (b: unknown) => void; setHeader: (k: string, v: string) => void; end: () => void }

export default async function handler(req: { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown }, res: Res) {
  res.setHeader("Cache-Control", "no-store")
  if (req.method === "OPTIONS") { res.status(204).end(); return }
  if (req.method !== "POST") { res.status(405).json({ error: "Méthode non autorisée." }); return }
  const raw = req.headers.authorization ?? req.headers.Authorization
  const auth = Array.isArray(raw) ? raw[0] : raw
  let body = req.body
  if (typeof body === "string") { try { body = JSON.parse(body) } catch { body = {} } }
  const { status, body: payload } = await handleNotify(auth, body)
  res.status(status).json(payload)
}
