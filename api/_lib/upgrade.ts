import { env } from "./mail.js"
import { planFromPrices, priceFor, stripe, type Interval } from "./stripe.js"

/* update48 · Montée en gamme d'un abonnement EXISTANT (y compris pendant l'essai) :
   - « reception » : ajoute l'option Réceptionniste IA (nouvel article, même intervalle que l'abonnement) ;
   - « clients »   : remplace l'article Bureau par Clients (même intervalle).
   Pendant l'essai : create_prorations, rien n'est facturé et l'essai continue.
   Hors essai : always_invoice + error_if_incomplete, le prorata est facturé et débité TOUT DE SUITE ;
   si le paiement échoue, Stripe refuse la modification (rien ne change). Tout est relu chez Stripe côté serveur. */

export type UpgradeKind = "reception" | "clients"
type Item = { id: string; price: string; amount: number; qty: number }

export type UpgradePreview = {
  kind: UpgradeKind
  interval: Interval
  trialing: boolean
  trialEnd: string | null
  periodEnd: string | null
  /** montants HT en centimes, par période (mois ou an) */
  current: number
  next: number
  added: number
  /** ajustement au prorata HT (centimes) débité immédiatement hors essai, 0 pendant l'essai */
  proration: number
  taxPct: number
}

const iso = (sec: unknown) => typeof sec === "number" && sec > 0 ? new Date(sec * 1000).toISOString() : null
const fail = (status: number, error: string) => ({ ok: false as const, status, error })

export async function upgradeSubscription(subId: string, kind: UpgradeKind, opts: { confirm: boolean; customer?: string; artisanId?: string }) {
  const r = await stripe("GET", `/subscriptions/${subId}`)
  if (!r.ok) return fail(404, "Abonnement Stripe introuvable.")
  const sub = r.data as Record<string, any>
  // Garde-fou : l'abonnement doit appartenir au client Stripe enregistré pour ce compte.
  if (opts.customer && String(sub.customer || "") !== opts.customer) return fail(403, "Cet abonnement ne correspond pas à votre compte.")
  const st = String(sub.status || "")
  if (st !== "trialing" && st !== "active") return fail(409, st === "past_due" ? "Réglez d'abord le paiement en attente." : "Aucun abonnement en cours.")
  if (sub.cancel_at_period_end) return fail(409, "Votre abonnement est en cours de résiliation : réactivez-le d'abord.")
  const items: Item[] = ((sub.items?.data || []) as any[]).map(i => ({ id: String(i.id), price: String(i.price?.id || ""), amount: Number(i.price?.unit_amount || 0), qty: Number(i.quantity || 1) }))
  const { plan, reception, interval } = planFromPrices(items.map(i => i.price))
  if (!plan || !interval) return fail(409, "Offre actuelle non reconnue : passez par le portail de facturation.")
  if (kind === "reception" && reception) return fail(409, "La Réceptionniste IA est déjà incluse.")
  if (kind === "clients" && plan === "clients") return fail(409, "Vous êtes déjà sur l'offre Clients.")
  const newPrice = priceFor(kind, interval)
  if (!newPrice) return fail(503, "Prix Stripe non configuré pour cette option.")
  const bureauItem = kind === "clients" ? items.find(i => i.price === priceFor("bureau", interval)) : undefined
  if (kind === "clients" && !bureauItem) return fail(409, "Article Bureau introuvable : passez par le portail de facturation.")
  const p = await stripe("GET", `/prices/${newPrice}`)
  if (!p.ok) return fail(503, "Prix Stripe introuvable.")
  const added = Number((p.data as any).unit_amount || 0)
  const current = items.reduce((t, i) => t + i.amount * i.qty, 0)
  const next = current - (bureauItem ? bureauItem.amount * bureauItem.qty : 0) + added

  const taxRate = (env("STRIPE_TAX_RATE_ID") || "").trim(), autoTax = env("STRIPE_AUTOMATIC_TAX") === "1"
  const taxes = taxRate && !autoTax ? { tax_rates: [taxRate] } : {}
  const change = kind === "clients" ? [{ id: bureauItem!.id, price: newPrice, ...taxes }] : [{ price: newPrice, quantity: 1, ...taxes }]
  const trialing = st === "trialing"
  const prorationDate = Math.floor(Date.now() / 1000)

  let proration = 0
  if (!trialing) {
    const up = await stripe("GET", "/invoices/upcoming", {
      customer: String(sub.customer), subscription: subId,
      subscription_items: change, subscription_proration_behavior: "always_invoice", subscription_proration_date: prorationDate,
    })
    if (up.ok) proration = (((up.data as any).lines?.data || []) as any[]).filter(l => l.proration).reduce((t, l) => t + Number(l.amount || 0), 0)
  }
  const preview: UpgradePreview = {
    kind, interval, trialing, trialEnd: iso(sub.trial_end), periodEnd: iso(sub.current_period_end) || iso(sub.items?.data?.[0]?.current_period_end),
    current, next, added, proration, taxPct: taxRate || autoTax ? 20 : 0,
  }
  if (!opts.confirm) return { ok: true as const, preview }

  const u = await stripe("POST", `/subscriptions/${subId}`, {
    items: change,
    ...(trialing ? { proration_behavior: "create_prorations" } : { proration_behavior: "always_invoice", payment_behavior: "error_if_incomplete", proration_date: prorationDate }),
    metadata: { ...(opts.artisanId ? { artisan_id: opts.artisanId } : {}), plan: kind === "clients" ? "clients" : plan, reception: kind === "reception" ? "1" : reception ? "1" : "0", interval },
  })
  if (!u.ok) {
    const e = (u.data as any)?.error
    if (e?.type === "card_error" || u.status === 402) return fail(402, "Le paiement du prorata a échoué : mettez à jour votre carte dans le portail de facturation. Rien n'a été modifié.")
    return fail(502, String(e?.message || "Stripe a refusé la modification."))
  }
  return { ok: true as const, preview, subscription: u.data }
}
