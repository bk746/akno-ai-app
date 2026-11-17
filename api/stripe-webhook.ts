import { adminClient, env } from "./_lib/mail.js"
import { jsonResponse, type ApiResult, type Headers } from "./_lib/http.js"
import { priceIds, stripe, verifyStripeSignature, type StripeObj } from "./_lib/stripe.js"
import { notifyArtisan } from "./_lib/push.js"
import { reportError } from "./_lib/monitoring.js"

/* update45 · Webhook Stripe signé. Met à jour la table subscriptions (seule source de vérité des droits).
   À déclarer dans Stripe → Développeurs → Webhooks : https://VOTRE-DOMAINE/api/stripe-webhook
   Événements : checkout.session.completed, customer.subscription.created, customer.subscription.updated,
   customer.subscription.deleted, invoice.payment_failed, invoice.paid */

const iso = (sec: unknown) => typeof sec === "number" && sec > 0 ? new Date(sec * 1000).toISOString() : null

function headerOf(h: Headers, name: string) {
  const k = Object.keys(h).find(x => x.toLowerCase() === name)
  const v = k ? h[k] : ""
  return (Array.isArray(v) ? v[0] : v) || ""
}

async function syncSubscription(subId: string, hintArtisan?: string) {
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
  const prices = priceIds()
  const items = ((sub.items as { data?: Array<{ price?: { id?: string } }> } | undefined)?.data || []).map(i => String(i.price?.id || ""))
  const plan = items.includes(prices.clients) ? "clients" : items.includes(prices.bureau) ? "bureau" : null
  const reception = !!prices.reception && items.includes(prices.reception)
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
  return { artisanId, plan, status }
}

export async function handleStripeWebhook(raw: string, headers: Headers): Promise<ApiResult> {
  const secret = (env("STRIPE_WEBHOOK_SECRET") || "").trim()
  if (!secret || !env("STRIPE_SECRET_KEY")) return { status: 503, body: { error: "Stripe n'est pas configuré." } }
  if (!await verifyStripeSignature(raw, headerOf(headers, "stripe-signature"), secret)) return { status: 400, body: { error: "Signature invalide." } }
  let event: { id?: string; type?: string; data?: { object?: StripeObj } }
  try { event = JSON.parse(raw) } catch { return { status: 400, body: { error: "Payload invalide." } } }
  const obj = event.data?.object || {}
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const artisan = String(obj.client_reference_id || ((obj.metadata || {}) as Record<string, string>).artisan_id || "")
        if (artisan && obj.customer) {
          await adminClient().from("subscriptions").upsert({ artisan_id: artisan, stripe_customer_id: String(obj.customer), updated_at: new Date().toISOString() }, { onConflict: "artisan_id" })
        }
        if (obj.subscription) return { status: 200, body: { ok: true, ...(await syncSubscription(String(obj.subscription), artisan)) } }
        return { status: 200, body: { ok: true } }
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.trial_will_end":
        return { status: 200, body: { ok: true, ...(await syncSubscription(String(obj.id))) } }
      case "invoice.paid":
      case "invoice.payment_failed": {
        const subId = String(obj.subscription || ((obj.parent as { subscription_details?: { subscription?: string } } | undefined)?.subscription_details?.subscription) || "")
        const res = subId ? await syncSubscription(subId) : {}
        if (event.type === "invoice.payment_failed" && "artisanId" in res && res.artisanId) {
          await notifyArtisan(String(res.artisanId), { title: "Paiement Akno refusé", body: "Mettez à jour votre carte dans Réglages → Abonnement pour garder l'accès.", url: "/reglages", tag: "billing" })
        }
        return { status: 200, body: { ok: true } }
      }
      default:
        return { status: 200, body: { ok: true, ignored: event.type } }
    }
  } catch (e) {
    await reportError(e, { route: "stripe-webhook", type: event.type, id: event.id })
    // 500 => Stripe réessaiera automatiquement
    return { status: 500, body: { error: "Traitement impossible." } }
  }
}

/* Corps brut obligatoire pour vérifier la signature : format Web standard (Request → Response). */
export async function POST(request: Request) {
  const raw = await request.text()
  const headers: Headers = {}
  request.headers.forEach((v, k) => { headers[k] = v })
  const { status, body } = await handleStripeWebhook(raw, headers)
  return jsonResponse(status, body)
}

export function GET() {
  return jsonResponse(405, { error: "Méthode non autorisée." })
}
