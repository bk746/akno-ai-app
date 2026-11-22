/* update71 · Chaîne devis → acompte → chantier → facture → encaissement (côté serveur).
   - afterSign : à la signature du devis, prépare la facture d'acompte (pourcentage réglable, 30 % par défaut) et crée le chantier
     (géolocalisé via la Base Adresse Nationale), sans doublon. Tout est facultatif : une erreur n'empêche jamais la signature.
   - Paiement en ligne : Stripe Connect (chaque artisan encaisse sur SON compte), derrière STRIPE_CONNECT_ENABLED=1 (désactivé par défaut).
   - Virement : IBAN + référence (numéro de facture), toujours disponible. */
import type { SupabaseClient } from "@supabase/supabase-js"
import { acompteLines, computeFacture, devisToFactureLines, r2 } from "./factureCalc.js"
import { appUrl, env } from "./mail.js"
import { stripe } from "./stripe.js"

type Json = Record<string, unknown>
export const connectEnabled = () => env("STRIPE_CONNECT_ENABLED") === "1" && !!env("STRIPE_SECRET_KEY")
export const payUrl = (token: string) => { const b = appUrl(); return b && token ? `${b}/payer/${token}` : "" }
/** Clé de fiche client (identique à ficheKey côté app) */
export const ficheKey = (n: string) => (n || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/^(m\.|mme|mr|monsieur|madame)\s+/, "").replace(/\s+/g, " ").trim()
export const clampPct = (v: unknown, dflt = 30) => { const n = Number(v); return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n * 100) / 100)) : dflt }

/** Géocodage d'une adresse française (Base Adresse Nationale, sans clé). null si introuvable ou trop lent. */
export async function geocodeFr(addr?: string | null): Promise<{ lat: number; lng: number } | null> {
  const q = String(addr || "").trim()
  if (q.length < 6) return null
  try {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 2500)
    const r = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1`, { signal: ctl.signal })
    clearTimeout(t)
    const j = await r.json() as { features?: { geometry?: { coordinates?: [number, number] }; properties?: { score?: number } }[] }
    const f = j.features?.[0], c = f?.geometry?.coordinates
    if (!c || (f?.properties?.score ?? 0) < 0.4) return null
    return { lng: c[0], lat: c[1] }
  } catch { return null }
}

/** Facture d'acompte (brouillon prêt à envoyer) pour un devis signé. Ne crée rien s'il existe déjà un acompte. */
export async function ensureAcompte(sb: SupabaseClient, devis: Json, artisan: Json | null): Promise<string | null> {
  const pct = clampPct(artisan?.acompte_pct, 30)
  if (pct <= 0) return null
  const { data: prev } = await sb.from("factures").select("id, type").eq("devis_id", devis.id as string).eq("artisan_id", devis.artisan_id as string)
  const found = (prev || []).find(f => f.type === "acompte")
  if (found) return String(found.id)
  const lines = devisToFactureLines(devis.lignes)
  if (!lines.length) return null
  const lignes = acompteLines(lines, pct, String(devis.numero || ""), (devis.objet as string) || undefined)
  const t = computeFacture(lignes, { zeroTva: !!artisan?.tva_non_applicable })
  const { data, error } = await sb.from("factures").insert({
    artisan_id: devis.artisan_id, devis_id: devis.id, type: "acompte", statut: "brouillon",
    client_nom: devis.client_nom || "Client", client_email: devis.client_email || null, client_telephone: devis.client_telephone || null,
    client_adresse: devis.client_adresse || null, adresse_chantier: devis.client_adresse || null, objet: devis.objet || null,
    lignes, total_ht: t.ht, total_tva: t.tva, total_ttc: t.ttc, acompte_deduit: 0, delai_paiement_jours: 0,
    ...(artisan?.tva_sur_debits ? { tva_sur_debits: true } : {}),
  }).select("id").maybeSingle()
  return error || !data ? null : String(data.id)
}

/** Chantier créé depuis le devis signé (carte + fiche), sans doublon. */
export async function ensureChantier(sb: SupabaseClient, devis: Json): Promise<string | null> {
  const { data: prev } = await sb.from("chantiers").select("id").eq("devis_id", devis.id as string).eq("artisan_id", devis.artisan_id as string).limit(1)
  if (prev?.length) return String(prev[0].id)
  const geo = await geocodeFr(devis.client_adresse as string)
  const client = String(devis.client_nom || "").trim()
  const { data, error } = await sb.from("chantiers").insert({
    artisan_id: devis.artisan_id, devis_id: devis.id, status: "upcoming",
    title: String(devis.objet || `Chantier ${client}`).slice(0, 160) || "Chantier",
    client_id: client ? ficheKey(client) : null, client_nom: client || null, client_telephone: devis.client_telephone || null,
    address: devis.client_adresse || null, lat: geo?.lat ?? null, lng: geo?.lng ?? null,
    notes: `Créé à la signature du devis n° ${devis.numero}. Planifiez les dates depuis le devis.`,
  }).select("id").maybeSingle()
  return error || !data ? null : String(data.id)
}

/** update78 · un devis signé crée aussi l'événement chantier dans l'agenda (journée 8 h–17 h, prochain jour ouvré). */
export async function ensureChantierAgenda(sb: SupabaseClient, devis: Json, chantierId: string | null) {
  const devisId = String(devis.id || "")
  if (!devisId) return
  const q = sb.from("appointments").select("id").eq("artisan_id", devis.artisan_id as string)
  const { data: prev } = chantierId
    ? await q.or(`chantier_id.eq.${chantierId},devis_id.eq.${devisId}`).limit(1)
    : await q.eq("devis_id", devisId).limit(1)
  if (prev?.length) {
    if (chantierId) await sb.from("appointments").update({ chantier_id: chantierId }).eq("id", prev[0].id)
    return
  }
  const now = new Date()
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hourCycle: "h23" })
  const parts = Object.fromEntries(fmt.formatToParts(now).filter(x => x.type !== "literal").map(x => [x.type, x.value]))
  let y = Number(parts.year), m = Number(parts.month), d = Number(parts.day)
  const addDays = (n: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d + n))
    y = dt.getUTCFullYear(); m = dt.getUTCMonth() + 1; d = dt.getUTCDate()
  }
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday as string] ?? 1
  if (dow === 6) addDays(2)
  else if (dow === 0) addDays(1)
  const pad = (n: number) => String(n).padStart(2, "0")
  const ymd = `${y}-${pad(m)}-${pad(d)}`
  // 8 h / 17 h Europe/Paris → ISO via décalage local approximé puis corrigé
  const toUtc = (h: number) => {
    const guess = Date.UTC(y, m - 1, d, h, 0, 0)
    const shown = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(guess))
    const hour = Number(shown.find(p => p.type === "hour")?.value || h)
    return new Date(guess + (h - hour) * 3600e3).toISOString()
  }
  const client = String(devis.client_nom || "Client").trim() || "Client"
  const row: Record<string, unknown> = {
    artisan_id: devis.artisan_id,
    title: String(devis.objet || `Chantier ${client}`).slice(0, 160) || "Chantier",
    client,
    start: toUtc(8),
    end: toUtc(17),
    adresse: devis.client_adresse || null,
    telephone_client: devis.client_telephone || null,
    email_client: devis.client_email || null,
    kind: "chantier",
    status: "prevu",
    devis_id: devisId,
    chantier_id: chantierId,
    client_id: devis.client_id || null,
    notes: `Créé à la signature du devis n° ${devis.numero}.`,
    booking_source: "devis_signe",
  }
  const { error } = await sb.from("appointments").insert(row)
  if (error && /column|kind|devis_id|chantier_id/i.test(error.message || "")) {
    await sb.from("appointments").insert({ artisan_id: row.artisan_id, title: row.title, client, start: row.start, end: row.end, adresse: row.adresse, telephone_client: row.telephone_client, notes: row.notes })
  }
}

export async function afterSign(sb: SupabaseClient, devis: Json): Promise<{ acompte: string | null; chantier: string | null }> {
  let artisan: Json | null = null
  try { const { data } = await sb.from("artisans").select("*").eq("id", devis.artisan_id as string).maybeSingle(); artisan = data as Json | null } catch { /* facultatif */ }
  let acompte: string | null = null, chantier: string | null = null
  try { acompte = await ensureAcompte(sb, devis, artisan) } catch { /* facultatif */ }
  try { chantier = await ensureChantier(sb, devis) } catch { /* facultatif */ }
  try { await ensureChantierAgenda(sb, devis, chantier) } catch { /* facultatif : l'agenda ne doit pas bloquer la signature */ }
  return { acompte, chantier }
}

/** Reste à payer d'une facture (TTC − acomptes déduits − retenue de garantie). */
export const dueOfRow = (f: Json) => Math.max(0, r2(Number(f.total_ttc || 0) - Number(f.acompte_deduit || 0) - r2(Number(f.total_ttc || 0) * (Number(f.retenue_garantie_pct) || 0) / 100)))

/* ---------------- Stripe Connect (désactivé par défaut) ---------------- */
export async function connectAccount(sb: SupabaseClient, artisanId: string): Promise<{ id: string | null; charges: boolean; details: boolean }> {
  const { data, error } = await sb.from("payment_accounts").select("stripe_account_id, charges_enabled, details_submitted").eq("artisan_id", artisanId).maybeSingle()
  if (error || !data) return { id: null, charges: false, details: false }
  return { id: data.stripe_account_id || null, charges: !!data.charges_enabled, details: !!data.details_submitted }
}

/** Onboarding Express : crée le compte connecté si besoin et renvoie le lien Stripe (KYC, IBAN de versement). */
export async function connectOnboard(sb: SupabaseClient, artisanId: string, email: string | undefined, returnUrl: string) {
  if (!connectEnabled()) return { status: 409, body: { error: "Le paiement en ligne n'est pas encore activé." } }
  let { id } = await connectAccount(sb, artisanId)
  if (!id) {
    const r = await stripe("POST", "/accounts", { type: "express", country: "FR", email, business_type: "individual", capabilities: { card_payments: { requested: true }, sepa_debit_payments: { requested: true }, transfers: { requested: true } }, metadata: { artisan_id: artisanId } })
    if (!r.ok) return { status: 502, body: { error: "Stripe a refusé la création du compte." } }
    id = String(r.data.id)
    const { error } = await sb.from("payment_accounts").upsert({ artisan_id: artisanId, stripe_account_id: id, updated_at: new Date().toISOString() }, { onConflict: "artisan_id" })
    if (error) return { status: 503, body: { error: "Appliquez la migration 20261122_14 (paiement en ligne)." } }
  }
  const link = await stripe("POST", "/account_links", { account: id, type: "account_onboarding", refresh_url: returnUrl, return_url: returnUrl })
  if (!link.ok) return { status: 502, body: { error: "Lien Stripe indisponible." } }
  return { status: 200, body: { ok: true, url: String(link.data.url) } }
}

export async function connectRefresh(sb: SupabaseClient, artisanId: string) {
  const acc = await connectAccount(sb, artisanId)
  if (!acc.id || !connectEnabled()) return { enabled: connectEnabled(), connected: !!acc.id, charges: acc.charges }
  const r = await stripe("GET", `/accounts/${acc.id}`)
  if (r.ok) {
    const charges = !!r.data.charges_enabled, details = !!r.data.details_submitted
    await sb.from("payment_accounts").update({ charges_enabled: charges, details_submitted: details, updated_at: new Date().toISOString() }).eq("artisan_id", artisanId)
    return { enabled: true, connected: true, charges }
  }
  return { enabled: true, connected: true, charges: acc.charges }
}

/** Session de paiement (CB + prélèvement SEPA) sur le compte de l'artisan, pour le reste à payer d'une facture émise. */
export async function checkoutForFacture(sb: SupabaseClient, f: Json, returnBase: string) {
  if (!connectEnabled()) return { status: 409, body: { error: "Paiement en ligne indisponible : réglez par virement." } }
  const acc = await connectAccount(sb, String(f.artisan_id))
  if (!acc.id || !acc.charges) return { status: 409, body: { error: "Paiement en ligne indisponible : réglez par virement." } }
  const due = dueOfRow(f)
  if (due <= 0 || f.statut === "payee") return { status: 409, body: { error: "Cette facture est déjà réglée." } }
  const r = await stripe("POST", "/checkout/sessions", {
    mode: "payment", payment_method_types: ["card", "sepa_debit"], locale: "fr",
    line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: Math.round(due * 100), product_data: { name: `${f.type === "acompte" ? "Acompte" : "Facture"} n° ${f.numero}` } } }],
    customer_email: f.client_email || undefined,
    payment_intent_data: { description: `Facture ${f.numero}`, metadata: { akno_facture_id: String(f.id), akno_artisan_id: String(f.artisan_id) } },
    metadata: { akno_facture_id: String(f.id), akno_artisan_id: String(f.artisan_id) },
    success_url: `${returnBase}?paye=1`, cancel_url: returnBase,
  }, "2024-06-20", acc.id)
  if (!r.ok) return { status: 502, body: { error: "Paiement indisponible pour le moment." } }
  return { status: 200, body: { ok: true, url: String(r.data.url) } }
}

/** Webhook Connect : paiement confirmé → facture payée (rapprochement automatique). */
export async function markPaidFromStripe(sb: SupabaseClient, obj: Json, account?: string) {
  const meta = (obj.metadata || {}) as Record<string, string>
  const id = meta.akno_facture_id
  if (!id) return { ignored: true }
  const { data: f } = await sb.from("factures").select("id, artisan_id, statut, numero").eq("id", id).maybeSingle()
  if (!f || !f.numero) return { ignored: true }
  if (account) { const acc = await connectAccount(sb, String(f.artisan_id)); if (acc.id && acc.id !== account) return { ignored: true } }
  if (f.statut === "payee") return { already: true }
  const pm = Array.isArray(obj.payment_method_types) ? String(obj.payment_method_types[0]) : ""
  await sb.from("factures").update({ statut: "payee", payee_le: new Date().toISOString(), mode_paiement: pm === "sepa_debit" ? "Prélèvement SEPA" : "Carte (en ligne)" }).eq("id", id)
  await sb.from("facture_relances").update({ statut: "ignoree" }).eq("facture_id", id).eq("statut", "a_valider")
  return { paid: id, artisan: String(f.artisan_id), numero: String(f.numero) }
}
