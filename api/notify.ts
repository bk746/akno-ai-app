import { nativeCors } from "./_lib/http.js"
import { createClient } from "@supabase/supabase-js"
import { adminClient, env } from "./_lib/mail.js"
import { sendPushToArtisan } from "./_lib/push.js"
import { bridgeArtisan } from "./_lib/twilioVoice.js"
import { payloadFrom } from "./_lib/pushPayload.js"

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

/** Inscrit cet appareil aux notifications du compte connecté. Fait côté serveur : un même appareil (même endpoint)
    peut avoir été inscrit sous un autre compte ; l'écriture directe depuis l'app était alors refusée par la RLS,
    en silence, et le compte courant restait sans aucun appareil. L'appareil suit le dernier compte connecté. */
async function subscribe(userId: string, input: Json): Promise<ApiResult> {
  const endpoint = String(input.endpoint || "").trim()
  const p256dh = String(input.p256dh || "").trim(), auth = String(input.auth || "").trim()
  if (!/^https:\/\/[^\s]{10,2000}$/.test(endpoint) || !p256dh || !auth || p256dh.length > 300 || auth.length > 100) return { status: 400, body: { ok: false, error: "Abonnement de notification invalide. Désactivez puis réactivez les notifications." } }
  let sb: ReturnType<typeof adminClient>
  try { sb = adminClient() }
  catch { return { status: 503, body: { ok: false, error: "Configuration Supabase service (SUPABASE_SERVICE_ROLE_KEY) manquante." } } }
  const { error } = await sb.from("push_subscriptions").upsert({
    artisan_id: userId, user_id: userId, endpoint, p256dh, auth, keys: { p256dh, auth },
    ua: String(input.ua || "").slice(0, 300),
  }, { onConflict: "endpoint" })
  if (error) return { status: 502, body: { ok: false, error: "L'appareil n'a pas pu être inscrit aux notifications. Réessayez." } }
  const { count } = await sb.from("push_subscriptions").select("id", { count: "exact", head: true }).or(`artisan_id.eq.${userId},user_id.eq.${userId}`)
  return { status: 200, body: { ok: true, devices: count ?? 1 } }
}

export async function handleNotify(authorization?: string, body?: unknown, bridgeId?: string | null): Promise<ApiResult> {
  const input = (body && typeof body === "object" ? body : {}) as Json
  if (input.type === "subscribe") {
    // Inscription d'un appareil : uniquement l'artisan connecté dans l'app, jamais le relais téléphonique.
    if (bridgeId) return { status: 403, body: { ok: false, error: "Action réservée à l'application." } }
    const me = await authed(authorization)
    if ("status" in me) return me
    return subscribe(me.userId, input)
  }
  // update56 : notifications envoyées par le relais téléphonique (BRIDGE_SECRET) pour l'artisan appelé.
  const session = bridgeId ? { userId: bridgeId } : await authed(authorization)
  if ("status" in session) return session
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
  nativeCors(req.headers, res) // update70 · app native (Capacitor)
  if (req.method === "OPTIONS") { res.status(204).end(); return }
  if (req.method !== "POST") { res.status(405).json({ error: "Méthode non autorisée." }); return }
  const raw = req.headers.authorization ?? req.headers.Authorization
  const auth = Array.isArray(raw) ? raw[0] : raw
  let body = req.body
  if (typeof body === "string") { try { body = JSON.parse(body) } catch { body = {} } }
  const { status, body: payload } = await handleNotify(auth, body, bridgeArtisan(req.headers))
  res.status(status).json(payload)
}
