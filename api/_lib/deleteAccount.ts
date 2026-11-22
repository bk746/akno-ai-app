/* update70 · Suppression du compte artisan (App Store 5.1.1(v), Google Play « Account deletion »).
   Appelée par /api/account { action: "delete_account", confirm: "SUPPRIMER" } avec le jeton de l'artisan.
   - Abonnement Stripe résilié immédiatement, client Stripe supprimé (Stripe conserve ses propres factures).
   - Fichiers supprimés : enregistrements d'appels, dossier de conformité, photos d'équipe, logo.
   - Cas 1 (aucune facture émise, aucun devis signé) : suppression complète du compte Auth (cascade sur toutes les tables).
   - Cas 2 (factures émises ou devis signés, à conserver 10 ans : art. L123-22 C. com., preuve de signature) :
     toutes les autres données sont supprimées, le compte Auth est anonymisé et bloqué (connexion impossible).
   Aucune migration SQL nécessaire. Les déclencheurs de protection (factures émises, devis signés) restent actifs. */
import type { SupabaseClient } from "@supabase/supabase-js"
import { billingEnabled } from "./plans.js"
import { stripe } from "./stripe.js"

export const DELETE_WORD = "SUPPRIMER"
const BUCKETS = ["recordings", "conformite", "equipe", "logos"] as const
// Ordre important : les tables qui en référencent d'autres sans ON DELETE d'abord.
const TABLES_RETAINED_MODE = [
  "facture_relances", "relances", "appointments", "leads", "client_fiches", "chantier_employes", "chantiers", "employes",
  "devis_modeles", "prestations", "documents_conformite", "push_subscriptions", "sms_log", "usage_counters",
  "rapports_mensuels", "artisan_secrets", "artisan_phone_numbers", "subscriptions",
] as const

type Result = { status: number; body: Record<string, unknown> }
type Step = { step: string; ok: boolean; error?: string }

async function removeFolder(admin: SupabaseClient, bucket: string, prefix: string, log: Step[]) {
  try {
    for (let round = 0; round < 20; round++) {
      const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 })
      if (error) { log.push({ step: `storage:${bucket}`, ok: false, error: error.message }); return }
      const files = (data || []).filter(f => f.name && f.id).map(f => `${prefix}/${f.name}`)
      if (!files.length) break
      const { error: e2 } = await admin.storage.from(bucket).remove(files)
      if (e2) { log.push({ step: `storage:${bucket}`, ok: false, error: e2.message }); return }
      if (files.length < 1000) break
    }
    log.push({ step: `storage:${bucket}`, ok: true })
  } catch (e) { log.push({ step: `storage:${bucket}`, ok: false, error: String((e as Error)?.message || e) }) }
}

async function cancelStripe(admin: SupabaseClient, userId: string, log: Step[]) {
  if (!billingEnabled()) return
  const { data: sub } = await admin.from("subscriptions").select("stripe_customer_id, stripe_subscription_id").eq("artisan_id", userId).maybeSingle()
  const s = sub as { stripe_customer_id?: string | null; stripe_subscription_id?: string | null } | null
  if (s?.stripe_subscription_id) {
    const r = await stripe("DELETE", `/subscriptions/${encodeURIComponent(s.stripe_subscription_id)}`)
    log.push({ step: "stripe:subscription", ok: r.ok || r.status === 404, error: r.ok ? undefined : `HTTP ${r.status}` })
  }
  if (s?.stripe_customer_id) {
    const r = await stripe("DELETE", `/customers/${encodeURIComponent(s.stripe_customer_id)}`)
    log.push({ step: "stripe:customer", ok: r.ok || r.status === 404, error: r.ok ? undefined : `HTTP ${r.status}` })
  }
}

export async function deleteAccount(admin: SupabaseClient, userId: string, input: Record<string, unknown>): Promise<Result> {
  if (String(input.confirm || "").trim().toUpperCase() !== DELETE_WORD) return { status: 400, body: { error: `Tapez ${DELETE_WORD} pour confirmer.` } }
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return { status: 400, body: { error: "Compte invalide." } }
  const log: Step[] = []

  // 1. Paiement : plus aucun prélèvement
  try { await cancelStripe(admin, userId, log) } catch (e) { log.push({ step: "stripe", ok: false, error: String((e as Error)?.message || e) }) }
  if (log.some(s => s.step.startsWith("stripe") && !s.ok)) return { status: 502, body: { error: "La résiliation de l'abonnement a échoué. Rien n'a été supprimé, réessayez dans un instant.", log } }

  // 2. Fichiers
  for (const b of BUCKETS) await removeFolder(admin, b, userId, log)

  // 3. Pièces à conserver ?
  const [{ count: emitted }, { count: signed }] = await Promise.all([
    admin.from("factures").select("id", { count: "exact", head: true }).eq("artisan_id", userId).not("numero", "is", null),
    admin.from("devis").select("id", { count: "exact", head: true }).eq("artisan_id", userId).not("signe_le", "is", null),
  ])
  const retain = (emitted || 0) > 0 || (signed || 0) > 0

  // Devis non signés d'abord (leur journal de signature part avec eux), puis brouillons de factures
  const del = async (table: string, f: (q: any) => any = q => q) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const { error } = await f(admin.from(table).delete().eq("artisan_id", userId))
    log.push({ step: `db:${table}`, ok: !error, error: error?.message })
    return !error
  }
  await del("devis", q => q.is("signe_le", null))
  await del("factures", q => q.is("numero", null))

  if (!retain) {
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) return { status: 500, body: { error: "La suppression du compte a échoué. Contactez le support.", log: [...log, { step: "auth:delete", ok: false, error: error.message }] } }
    return { status: 200, body: { ok: true, mode: "deleted" } }
  }

  // 4. Conservation légale : on supprime tout le reste, puis on anonymise et bloque le compte
  await admin.from("devis").update({ call_id: null }).eq("artisan_id", userId)
  for (const t of TABLES_RETAINED_MODE) await del(t)
  await del("calls")
  const rnd = crypto.getRandomValues(new Uint8Array(24)).reduce((a, b) => a + b.toString(16).padStart(2, "0"), "")
  const { error } = await admin.auth.admin.updateUserById(userId, {
    email: `supprime+${userId}@akno.invalid`, email_confirm: true, password: rnd,
    ban_duration: "876000h", user_metadata: { deleted: true, deleted_at: new Date().toISOString() },
  })
  if (error) return { status: 500, body: { error: "Vos données ont été supprimées mais le compte n'a pas pu être fermé. Contactez le support.", log: [...log, { step: "auth:ban", ok: false, error: error.message }] } }
  return { status: 200, body: { ok: true, mode: "retained", retained: { factures: emitted || 0, devis_signes: signed || 0 } } }
}
