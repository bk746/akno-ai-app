import { env, escapeHtml } from "./mail.js"
import { timingSafeEqual } from "./http.js"

/* update56 · Helpers purs (testés par scripts/test-twilio.ts) pour les vrais appels :
   Twilio → /api/twilio-voice → TwiML <Connect><Stream> → relais voice-bridge → xAI Grok Voice. */

export const xml = (body: string) => `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`
export const say = (t: string) => `<Say language="fr-FR" voice="Polly.Lea">${escapeHtml(t)}</Say>`

/** Message vocal poli puis raccroche (hors forfait, numéro inconnu, panne). */
export function sayHangup(text: string) {
  return xml(`${say(text)}<Hangup/>`)
}

async function hmacHex(secret: string, data: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("")
}

/** Jeton court (2 min) prouvant au relais que le flux vient bien de notre webhook. */
export async function signBridgeToken(secret: string, artisanId: string, callSid: string, exp: number) {
  return hmacHex(secret, `${artisanId}.${callSid}.${exp}`)
}

export async function verifyBridgeToken(secret: string, artisanId: string, callSid: string, exp: number, token: string, now = Date.now()) {
  if (!secret || !token || !Number.isFinite(exp) || exp * 1000 < now) return false
  return timingSafeEqual(await signBridgeToken(secret, artisanId, callSid, exp), token)
}

/** TwiML qui relie l'appel au relais WebSocket (audio μ-law 8 kHz). */
export function connectStreamTwiml(bridgeUrl: string, params: Record<string, string>) {
  const p = Object.entries(params).map(([k, v]) => `<Parameter name="${escapeHtml(k)}" value="${escapeHtml(v)}"/>`).join("")
  return xml(`<Connect><Stream url="${escapeHtml(bridgeUrl)}">${p}</Stream></Connect>`)
}

/** URL wss du relais : VOICE_BRIDGE_URL peut être https://… ou wss://… ; on vise /twilio. */
export function bridgeStreamUrl(raw = env("VOICE_BRIDGE_URL") || "") {
  const t = raw.trim().replace(/\/$/, "")
  if (!t) return ""
  const ws = t.replace(/^http(s?):\/\//i, (_m, s) => `ws${s}://`)
  if (!/^wss?:\/\//i.test(ws)) return ""
  return /\/twilio$/.test(ws) ? ws : `${ws}/twilio`
}

/** Appel serveur à serveur du relais (prise de RDV, notification) : en-têtes x-akno-bridge + x-akno-artisan. */
export function bridgeArtisan(headers: Record<string, string | string[] | undefined> | undefined): string | null {
  const secret = (env("BRIDGE_SECRET") || "").trim()
  if (!secret || !headers) return null
  const get = (n: string) => { const k = Object.keys(headers).find(x => x.toLowerCase() === n); const v = k ? headers[k] : ""; return (Array.isArray(v) ? v[0] : v) || "" }
  const given = get("x-akno-bridge"), artisan = get("x-akno-artisan")
  if (!given || !/^[0-9a-f-]{36}$/i.test(artisan)) return null
  return timingSafeEqual(given, secret) ? artisan : null
}
