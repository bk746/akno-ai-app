import http2 from "node:http2"
import crypto from "node:crypto"
import { env } from "./mail.js"

export type ApnsCfg = { key: string; keyId: string; teamId: string; bundleId: string; host: string }

let jwtCache = { token: "", at: 0 }

function b64url(data: string | Buffer) {
  const buf = typeof data === "string" ? Buffer.from(data) : data
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

export function apnsConfig(): ApnsCfg | null {
  const key = (env("APNS_KEY_P8") || "").replace(/\\n/g, "\n").trim()
  const keyId = (env("APNS_KEY_ID") || "").trim()
  const teamId = (env("APNS_TEAM_ID") || "").trim()
  const bundleId = (env("APNS_BUNDLE_ID") || "").trim()
  const apnsEnv = (env("APNS_ENV") || "sandbox").trim().toLowerCase()
  if (!key || !keyId || !teamId || !bundleId) return null
  const host = apnsEnv === "production" ? "api.push.apple.com" : "api.sandbox.push.apple.com"
  return { key, keyId, teamId, bundleId, host }
}

function apnsJwt(cfg: ApnsCfg): string {
  const now = Math.floor(Date.now() / 1000)
  if (jwtCache.token && now - jwtCache.at < 3000) return jwtCache.token
  const header = b64url(JSON.stringify({ alg: "ES256", kid: cfg.keyId }))
  const body = b64url(JSON.stringify({ iss: cfg.teamId, iat: now }))
  const unsigned = `${header}.${body}`
  const sig = crypto.sign("sha256", Buffer.from(unsigned), {
    key: crypto.createPrivateKey({ key: cfg.key, format: "pem" }),
    dsaEncoding: "ieee-p1363",
  })
  jwtCache = { token: `${unsigned}.${b64url(sig)}`, at: now }
  return jwtCache.token
}

export async function sendApns(
  deviceToken: string,
  alert: { title: string; body: string },
  extra: { url?: string; tag?: string; badge?: number },
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const cfg = apnsConfig()
  if (!cfg) return { ok: false, error: "Clés APNs manquantes (APNS_KEY_P8, APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID)." }
  const token = deviceToken.replace(/[^a-fA-F0-9]/g, "")
  if (token.length < 32) return { ok: false, error: "Jeton APNs invalide." }

  const aps: Record<string, unknown> = { alert, sound: "default" }
  if (extra.badge != null) aps.badge = extra.badge
  const payload = JSON.stringify({ aps, url: extra.url || "/", tag: extra.tag || "akno" })

  return new Promise(resolve => {
    const client = http2.connect(`https://${cfg.host}`)
    const fail = (error: string, status?: number) => { try { client.close() } catch { /* ignore */ }; resolve({ ok: false, error, status }) }
    client.on("error", () => fail("Connexion APNs impossible."))
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${apnsJwt(cfg)}`,
      "apns-topic": cfg.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    })
    let status = 0
    let errBody = ""
    req.on("response", h => { status = Number(h[":status"] || 0) })
    req.on("data", c => { errBody += String(c) })
    req.on("end", () => {
      try { client.close() } catch { /* ignore */ }
      if (status === 200) resolve({ ok: true, status })
      else resolve({ ok: false, status, error: errBody ? `APNs ${status} : ${errBody.slice(0, 200)}` : `APNs ${status}.` })
    })
    req.on("error", () => fail("Envoi APNs interrompu."))
    req.end(payload)
  })
}