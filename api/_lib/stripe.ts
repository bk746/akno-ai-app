import { env } from "./mail.js"

/** Client Stripe minimal (API REST, sans SDK) + vérification des webhooks signés. */
export type StripeObj = Record<string, unknown>

function flatten(obj: Record<string, unknown>, prefix = "", out: [string, string][] = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue
    const key = prefix ? `${prefix}[${k}]` : k
    if (Array.isArray(v)) v.forEach((item, i) => {
      if (item && typeof item === "object") flatten(item as Record<string, unknown>, `${key}[${i}]`, out)
      else out.push([`${key}[${i}]`, String(item)])
    })
    else if (typeof v === "object") flatten(v as Record<string, unknown>, key, out)
    else out.push([key, String(v)])
  }
  return out
}

export async function stripe(method: "GET" | "POST", path: string, params?: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: StripeObj }> {
  const key = (env("STRIPE_SECRET_KEY") || "").trim()
  if (!key) return { ok: false, status: 503, data: { error: { message: "STRIPE_SECRET_KEY manquante." } } }
  const qs = params ? new URLSearchParams(flatten(params)).toString() : ""
  const url = `https://api.stripe.com/v1${path}${method === "GET" && qs ? `?${qs}` : ""}`
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": "2024-06-20" },
    body: method === "POST" ? qs : undefined,
  })
  const data = await r.json().catch(() => ({})) as StripeObj
  return { ok: r.ok, status: r.status, data }
}

export function priceIds() {
  return {
    bureau: (env("STRIPE_PRICE_BUREAU") || "").trim(),
    clients: (env("STRIPE_PRICE_CLIENTS") || "").trim(),
    reception: (env("STRIPE_PRICE_RECEPTION") || "").trim(),
  }
}

/** Vérifie l'en-tête Stripe-Signature (t=…,v1=…) sur le corps BRUT. Tolérance 5 minutes. */
export async function verifyStripeSignature(raw: string, header: string, secret: string, toleranceSec = 300) {
  if (!header || !secret) return false
  const parts = Object.fromEntries(header.split(",").map(p => { const i = p.indexOf("="); return [p.slice(0, i).trim(), p.slice(i + 1).trim()] }))
  const sigs = header.split(",").filter(p => p.trim().startsWith("v1=")).map(p => p.trim().slice(3))
  const t = Number(parts.t)
  if (!Number.isFinite(t) || !sigs.length) return false
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${raw}`))
  const expected = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, "0")).join("")
  return sigs.some(s => {
    if (s.length !== expected.length) return false
    let r = 0
    for (let i = 0; i < s.length; i++) r |= s.charCodeAt(i) ^ expected.charCodeAt(i)
    return r === 0
  })
}
