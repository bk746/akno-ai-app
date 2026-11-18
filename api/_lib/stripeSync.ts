import { adminClient } from "./mail.js"
import { planFromPrices, stripe } from "./stripe.js"

/* update46 · Synchronisation Stripe → table subscriptions, partagée par le webhook signé et le retour de paiement
   (/api/account action « checkout_sync »). On relit TOUJOURS l'abonnement chez Stripe côté serveur :
   le navigateur ne fait que donner un identifiant, jamais l'état. */

const iso = (sec: unknown) => typeof sec === "number" && sec > 0 ? new Date(sec * 1000).toISOString() : null

export async function syncSubscription(subId: string, hintArtisan?: string) {
  // On relit toujours l'abonnement chez Stripe : robuste aux événements reçus dans le désordre.
  const r = await stripe("GET", `/subscriptions/${subId}`)
  if (!r.ok) throw new Error(`Stripe subscription ${subId} introuvable`)
  const sub = r.data
  const sb = adminClient()
  const customer = String(sub.customer || "")
  let artisanId = String(((sub.metadata || {}) as Record<string, string>).artisan_id || hintArtisan || "")
  if (!artisanId && customer) {
    const { data } = await sb.from("subscriptions").select("artisan_id").eq("stripe_customer_id", customer).maybeSingle()
    artisanId = String(data?.artisan_id || "")
  }
  if (!artisanId) return { skipped: "artisan inconnu" }
  // Prix mensuels ET annuels (update46)
  const items = ((sub.items as { data?: Array<{ price?: { id?: string } }> } | undefined)?.data || []).map(i => String(i.price?.id || ""))
  const { plan, reception, interval } = planFromPrices(items)
  const status = String(sub.status || "")
  const ended = status === "canceled" || status === "incomplete_expired"
  const row = {
    artisan_id: artisanId,
    stripe_customer_id: customer || null,
    stripe_subscription_id: ended ? null : String(sub.id),
    plan,
    reception_option: reception,
    status,
    trial_end: iso(sub.trial_end),
    current_period_end: iso(sub.current_period_end) || iso((sub.items as { data?: Array<{ current_period_end?: number }> } | undefined)?.data?.[0]?.current_period_end),
    cancel_at_period_end: !!sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  }
  const { error } = await sb.from("subscriptions").upsert(row, { onConflict: "artisan_id" })
  if (error) throw new Error(error.message)
  return { artisanId, plan, status, interval }
}

/** update55 · Le moyen de paiement choisi au paiement (carte, Apple Pay, Google Pay ou PayPal) doit rester celui
    de l'abonnement après l'essai, pour les montées en gamme et dans le portail. Checkout le pose déjà sur
    l'abonnement ; on le reporte aussi sur le client Stripe (invoice_settings) et sur l'abonnement s'il manque. */
export async function ensureDefaultPaymentMethod(subId: string) {
  const r = await stripe("GET", `/subscriptions/${subId}`)
  if (!r.ok) return
  const sub = r.data as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  const customer = String(sub.customer || "")
  let pm = typeof sub.default_payment_method === "string" ? sub.default_payment_method : String(sub.default_payment_method?.id || "")
  if (!pm && sub.pending_setup_intent) {
    const si = await stripe("GET", `/setup_intents/${typeof sub.pending_setup_intent === "string" ? sub.pending_setup_intent : sub.pending_setup_intent.id}`)
    if (si.ok && (si.data as any).status === "succeeded") pm = String((si.data as any).payment_method || "") // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  if (!pm || !customer) return
  if (!sub.default_payment_method) await stripe("POST", `/subscriptions/${subId}`, { default_payment_method: pm })
  const c = await stripe("GET", `/customers/${customer}`)
  if (c.ok && !(c.data as any).invoice_settings?.default_payment_method) // eslint-disable-line @typescript-eslint/no-explicit-any
    await stripe("POST", `/customers/${customer}`, { invoice_settings: { default_payment_method: pm } })
}
