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

/** update46 · version d'API récente, utilisée seulement pour créer la session de paiement intégré (ui_mode "elements"). */
export const STRIPE_VERSION_ELEMENTS = "2026-10-28.endive"

/** update71 · `account` : appel au nom d'un compte connecté (Stripe Connect, en-tête Stripe-Account). */
export async function stripe(method: "GET" | "POST" | "DELETE", path: string, params?: Record<string, unknown>, version = "2024-06-20", account?: string): Promise<{ ok: boolean; status: number; data: StripeObj }> {
  const key = (env("STRIPE_SECRET_KEY") || "").trim()
  if (!key) return { ok: false, status: 503, data: { error: { message: "STRIPE_SECRET_KEY manquante." } } }
  const qs = params ? new URLSearchParams(flatten(params)).toString() : ""
  const url = `https://api.stripe.com/v1${path}${method !== "POST" && qs ? `?${qs}` : ""}`
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": version, ...(account ? { "Stripe-Account": account } : {}) },
    body: method === "POST" ? qs : undefined,
  })
  const data = await r.json().catch(() => ({})) as StripeObj
  return { ok: r.ok, status: r.status, data }
}

export type Interval = "month" | "year"

/** update46 · prix mensuels + annuels (-20 %). Un prix annuel absent => l'offre annuelle est simplement masquée. */
export function priceIds() {
  const v = (k: string) => (env(k) || "").trim()
  return {
    bureau: v("STRIPE_PRICE_BUREAU"),
    clients: v("STRIPE_PRICE_CLIENTS"),
    reception: v("STRIPE_PRICE_RECEPTION"),
    bureau_annual: v("STRIPE_PRICE_BUREAU_ANNUAL"),
    clients_annual: v("STRIPE_PRICE_CLIENTS_ANNUAL"),
    reception_annual: v("STRIPE_PRICE_RECEPTION_ANNUAL"),
  }
}

/** Prix Stripe d'une offre pour un intervalle donné ("" si non configuré). */
export function priceFor(item: "bureau" | "clients" | "reception", interval: Interval) {
  const p = priceIds()
  return interval === "year" ? p[`${item}_annual`] : p[item]
}

/** Annuel disponible seulement si les 3 prix annuels sont configurés (sinon l'option Réception serait bancale). */
export function annualAvailable() {
  const p = priceIds()
  return !!(p.bureau_annual && p.clients_annual && p.reception_annual)
}

/** Déduit l'offre, l'option Réception et l'intervalle des price IDs d'un abonnement (mensuels ET annuels). */
export function planFromPrices(items: string[]) {
  const p = priceIds()
  const has = (...ids: string[]) => ids.some(id => !!id && items.includes(id))
  const plan = has(p.clients, p.clients_annual) ? "clients" as const : has(p.bureau, p.bureau_annual) ? "bureau" as const : null
  const reception = has(p.reception, p.reception_annual)
  const interval: Interval | null = has(p.bureau_annual, p.clients_annual, p.reception_annual) ? "year" : plan ? "month" : null
  return { plan, reception, interval }
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
