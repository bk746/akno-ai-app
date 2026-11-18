import { createHmac, timingSafeEqual } from "node:crypto"

/** Même jeton que api/_lib/twilioVoice.ts (HMAC-SHA256 hex de « artisan.callSid.exp »). */
export function signToken(secret: string, artisanId: string, callSid: string, exp: number) {
  return createHmac("sha256", secret).update(`${artisanId}.${callSid}.${exp}`).digest("hex")
}

export function verifyToken(secret: string, p: Record<string, string | undefined>, now = Date.now()) {
  const exp = Number(p.exp)
  if (!secret || !p.token || !p.artisan_id || !p.call_sid || !Number.isFinite(exp) || exp * 1000 < now) return false
  const a = Buffer.from(signToken(secret, p.artisan_id, p.call_sid, exp)), b = Buffer.from(String(p.token))
  return a.length === b.length && timingSafeEqual(a, b)
}
