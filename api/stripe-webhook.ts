import { adminClient, env } from "./_lib/mail.js"
import { jsonResponse, type ApiResult, type Headers } from "./_lib/http.js"
import { verifyStripeSignature, type StripeObj } from "./_lib/stripe.js"
import { syncSubscription } from "./_lib/stripeSync.js"
import { notifyArtisan } from "./_lib/push.js"
import { reportError } from "./_lib/monitoring.js"

/* update45 · Webhook Stripe signé. Met à jour la table subscriptions (seule source de vérité des droits).
   À déclarer dans Stripe → Développeurs → Webhooks : https://VOTRE-DOMAINE/api/stripe-webhook
   Événements : checkout.session.completed, customer.subscription.created, customer.subscription.updated,
   customer.subscription.deleted, invoice.payment_failed, invoice.paid
   update46 : la synchro (prix mensuels ET annuels) est dans _lib/stripeSync.ts, partagée avec le retour de paiement. */

function headerOf(h: Headers, name: string) {
  const k = Object.keys(h).find(x => x.toLowerCase() === name)
  const v = k ? h[k] : ""
  return (Array.isArray(v) ? v[0] : v) || ""
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
