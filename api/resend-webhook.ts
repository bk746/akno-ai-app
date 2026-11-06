import { adminClient, env, stopDevisReminders } from "./mail"

type Json = Record<string, unknown>
type ApiResult = { status: number; body: Json }
type Headers = Record<string, string | string[] | undefined>

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

function header(h: Headers, name: string) {
  const key = Object.keys(h).find(k => k.toLowerCase() === name.toLowerCase())
  if (!key) return ""
  const v = h[key]
  return (Array.isArray(v) ? v[0] : v) || ""
}

function b64ToBytes(b64: string) {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToB64(buf: ArrayBuffer) {
  const b = new Uint8Array(buf)
  let s = ""
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s)
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

async function verifySvix(secret: string, raw: string, headers: Headers) {
  const id = header(headers, "svix-id")
  const ts = header(headers, "svix-timestamp")
  const sig = header(headers, "svix-signature")
  if (!id || !ts || !sig) return false
  const age = Math.abs(Date.now() - Number(ts) * 1000)
  if (!Number.isFinite(Number(ts)) || age > 5 * 60 * 1000) return false
  try {
    const keyBytes = secret.startsWith("whsec_") ? b64ToBytes(secret.slice(6)) : new TextEncoder().encode(secret)
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${raw}`))
    const expected = bytesToB64(signed)
    return sig.split(" ").some(part => {
      const value = part.includes(",") ? part.slice(part.indexOf(",") + 1) : part
      return !!value && timingSafeEqual(value, expected)
    })
  } catch {
    return false
  }
}

function extractToken(addresses: string[]) {
  for (const a of addresses) {
    const plus = a.match(/devis\+([0-9a-f-]{36})@/i)
    if (plus) return plus[1]
    const any = a.match(UUID)
    if (any) return any[0]
  }
  return ""
}

function stripHtml(s: string) {
  return s.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

async function fetchReceivedBody(emailId: string) {
  const key = env("RESEND_API_KEY")
  if (!key) return ""
  const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: { Authorization: `Bearer ${key}` },
  })
  if (!res.ok) return ""
  const data = await res.json() as { text?: string; html?: string }
  return (data.text || stripHtml(data.html || "")).trim()
}

export async function handleResendWebhook(raw: string, headers: Headers): Promise<ApiResult> {
  const secret = env("RESEND_WEBHOOK_SECRET")
  if (!secret) return { status: 503, body: { error: "RESEND_WEBHOOK_SECRET n'est pas configuré." } }
  if (!await verifySvix(secret, raw, headers)) return { status: 401, body: { error: "Signature invalide." } }

  let event: { type?: string; data?: Record<string, unknown> }
  try { event = JSON.parse(raw) }
  catch { return { status: 400, body: { error: "Payload invalide." } } }
  if (event.type !== "email.received") return { status: 200, body: { ok: true, ignored: true } }

  const data = event.data || {}
  const to = [...(Array.isArray(data.to) ? data.to : []), ...(Array.isArray(data.received_for) ? data.received_for : [])].map(String)
  const token = extractToken(to)
  let sb
  try { sb = adminClient() }
  catch { return { status: 503, body: { error: "Configuration Supabase manquante." } } }

  let devis: { id: string; statut: string; client_email?: string | null } | null = null
  if (token) {
    const { data: found } = await sb.from("devis").select("id, statut, client_email").eq("token", token).maybeSingle()
    devis = found
  }
  if (!devis && data.subject) {
    const num = String(data.subject).match(/devis\s*n[°o]?\s*(\d+)/i)
    const from = String(data.from || "").toLowerCase()
    if (num) {
      const { data: rows } = await sb.from("devis").select("id, statut, client_email").ilike("numero", `%${num[1]}%`).limit(10)
      devis = (rows || []).find(r => r.client_email && from.includes(String(r.client_email).toLowerCase())) || null
    }
  }
  if (!devis) return { status: 200, body: { ok: true, unmatched: true } }

  const emailId = String(data.email_id || "")
  const text = (emailId ? await fetchReceivedBody(emailId) : "") || (data.subject ? `Re: ${data.subject}` : "Réponse reçue par e-mail.")
  const now = new Date().toISOString()
  await sb.from("devis").update({ reponse_client: text.slice(0, 4000), repondu_le: now }).eq("id", devis.id)
  await stopDevisReminders(sb, devis.id, { markResponded: true })
  return { status: 200, body: { ok: true, devis_id: devis.id } }
}

type Res = { status: (n: number) => Res; json: (b: unknown) => void; setHeader: (k: string, v: string) => void; end: () => void }

export default async function handler(req: { method?: string; headers: Headers; body?: unknown; on?: (ev: string, cb: (x?: unknown) => void) => void }, res: Res) {
  res.setHeader("Cache-Control", "no-store")
  if (req.method === "OPTIONS") { res.status(204).end(); return }
  if (req.method !== "POST") { res.status(405).json({ error: "Méthode non autorisée." }); return }
  let raw = ""
  if (typeof req.body === "string") raw = req.body
  else if (req.body && typeof req.body === "object") raw = JSON.stringify(req.body)
  else if (req.on) {
    raw = await new Promise<string>((resolve, reject) => {
      const parts: string[] = []
      req.on!("data", chunk => { parts.push(typeof chunk === "string" ? chunk : String(chunk)) })
      req.on!("end", () => resolve(parts.join("")))
      req.on!("error", reject)
    })
  }
  const { status, body } = await handleResendWebhook(raw, req.headers)
  res.status(status).json(body)
}
