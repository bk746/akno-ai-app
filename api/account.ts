import { adminClient, appUrl, env } from "./_lib/mail.js"
import { authed, header, isResult, parseBody, type ApiResult, type Headers, type Json, type Req, type Res } from "./_lib/http.js"
import { billingEnabled, can, loadEntitlements, PLAN_LABEL, TRIAL_DAYS, upgradeError, type PlanId } from "./_lib/plans.js"
import { consume, dayKey, monthKey, rateLimit } from "./_lib/limits.js"
import { annualAvailable, priceFor, priceIds, stripe, STRIPE_VERSION_ELEMENTS, type Interval } from "./_lib/stripe.js"
import { ensureDefaultPaymentMethod, syncSubscription } from "./_lib/stripeSync.js"
import { upgradeSubscription } from "./_lib/upgrade.js"
import { sendSmsMetered, smsConfigured } from "./_lib/sms.js"
import { reportError } from "./_lib/monitoring.js"

/* update45 · compte artisan : abonnement Stripe, réglages sensibles (clé Cal.com), recherche SIRET,
   acceptation des CGV, état d'usage. Une seule fonction Vercel pour rester sous la limite du plan. */

function origin(headers?: Headers) {
  const base = appUrl()
  if (base) return base
  const o = header(headers, "origin")
  return /^https?:\/\/[^/]+$/.test(o) ? o : ""
}

async function status(sb: import("@supabase/supabase-js").SupabaseClient, userId: string): Promise<ApiResult> {
  const ent = await loadEntitlements(sb, userId)
  const month = monthKey(), day = dayKey()
  const { data: counters } = await sb.from("usage_counters").select("metric, period, count").eq("artisan_id", userId).in("period", [month, day])
  const get = (m: string, p: string) => Number((counters || []).find(c => c.metric === m && c.period === p)?.count || 0)
  let calcom = false, twilioNumber = "", forwardTo = ""
  try {
    const { data } = await adminClient().from("artisan_secrets").select("calcom_api_key, twilio_number, forward_to").eq("artisan_id", userId).maybeSingle()
    calcom = !!(data as { calcom_api_key?: string } | null)?.calcom_api_key
    twilioNumber = String((data as { twilio_number?: string } | null)?.twilio_number || "")
    forwardTo = String((data as { forward_to?: string } | null)?.forward_to || "")
    // update56 : numéro Akno de la réceptionniste IA (table artisan_phone_numbers) en priorité
    const { data: num } = await adminClient().from("artisan_phone_numbers").select("phone_number").eq("artisan_id", userId).eq("active", true).limit(1).maybeSingle()
    if (num?.phone_number) { twilioNumber = String(num.phone_number); forwardTo = "" }
  } catch { /* pas de service role en local */ }
  const prices = priceIds()
  return {
    status: 200,
    body: {
      ok: true,
      entitlements: ent as unknown as Json,
      usage: {
        voice_minutes: Math.round(get("voice_seconds", month) / 60),
        devis_drafts: get("devis_drafts", month),
        sms: get("sms", month),
        voice_sessions_today: get("voice_sessions", day),
      },
      billing: {
        enabled: billingEnabled(),
        prices: { bureau: !!prices.bureau, clients: !!prices.clients, reception: !!prices.reception },
        // update46 : offre annuelle (-20 %) proposée seulement si les 3 prix annuels sont configurés
        annual: annualAvailable(),
        trial_days: TRIAL_DAYS(),
      },
      integrations: {
        calcom,
        calcom_global: !!env("CALCOM_API_KEY"),
        sms: smsConfigured(),
        resend: !!env("RESEND_API_KEY"),
        twilio_number: twilioNumber,
        forward_to: forwardTo ? `${forwardTo.slice(0, 5)}…${forwardTo.slice(-2)}` : "",
      },
    },
  }
}

/* update46 · Couleurs Akno de la page Stripe hébergée (repli si VITE_STRIPE_PUBLISHABLE_KEY manque).
   Le paiement intégré (ui_mode "elements") est stylé côté client (appearance, billing/StripePane.tsx). */
const BRANDING = { display_name: "Akno", background_color: "#0B0B0D", button_color: "#FFFFFF", border_style: "rounded", font_family: "inter" }

async function checkout(sb: import("@supabase/supabase-js").SupabaseClient, userId: string, email: string | undefined, body: Json, headers?: Headers): Promise<ApiResult> {
  if (!billingEnabled()) return { status: 503, body: { error: "Le paiement en ligne n'est pas encore activé (STRIPE_SECRET_KEY manquante)." } }
  const plan = body.plan === "bureau" ? "bureau" : body.plan === "clients" ? "clients" : null
  if (!plan) return { status: 400, body: { error: "Offre inconnue." } }
  const interval: Interval = body.interval === "year" ? "year" : "month"
  if (interval === "year" && !annualAvailable()) return { status: 503, body: { error: "L'offre annuelle n'est pas encore disponible. Choisissez le paiement mensuel." } }
  const suffix = interval === "year" ? "_ANNUAL" : ""
  const price = priceFor(plan, interval)
  if (!price) return { status: 503, body: { error: `Prix Stripe manquant pour ${PLAN_LABEL[plan]} (STRIPE_PRICE_${plan.toUpperCase()}${suffix}).` } }
  const reception = body.reception === true
  const receptionPrice = priceFor("reception", interval)
  if (reception && !receptionPrice) return { status: 503, body: { error: `Prix Stripe de l'option Réceptionniste manquant (STRIPE_PRICE_RECEPTION${suffix}).` } }
  const embedded = body.embedded === true
  const base = origin(headers)
  if (!base) return { status: 503, body: { error: "APP_URL manquante." } }

  let admin
  try { admin = adminClient() } catch { return { status: 503, body: { error: "SUPABASE_SERVICE_ROLE_KEY manquante." } } }
  const { data: sub } = await admin.from("subscriptions").select("stripe_customer_id, stripe_subscription_id, status").eq("artisan_id", userId).maybeSingle()
  const active = sub?.stripe_subscription_id && ["active", "trialing", "past_due"].includes(String(sub.status))
  if (active) return { status: 409, body: { error: "Un abonnement est déjà actif. Utilisez « Gérer mon abonnement » pour changer d'offre.", portal: true } }

  const { data: artisan } = await sb.from("artisans").select("entreprise_nom, nom_entreprise, prenom, created_at, entreprise_email, email").eq("id", userId).maybeSingle()
  let customer = String(sub?.stripe_customer_id || "")
  if (!customer) {
    const c = await stripe("POST", "/customers", {
      email: artisan?.entreprise_email || artisan?.email || email,
      name: artisan?.entreprise_nom || artisan?.nom_entreprise || undefined,
      preferred_locales: ["fr"],
      metadata: { artisan_id: userId },
    })
    if (!c.ok) return { status: 502, body: { error: "Stripe : création du client impossible." } }
    customer = String(c.data.id)
    await admin.from("subscriptions").upsert({ artisan_id: userId, stripe_customer_id: customer, updated_at: new Date().toISOString() }, { onConflict: "artisan_id" })
  }

  // update46 · 30 jours d'essai sur toutes les offres, une seule fois par compte :
  // pas d'essai si un abonnement a déjà existé (ligne subscriptions ou historique Stripe du client).
  let trialEligible = !sub?.stripe_subscription_id && !sub?.status
  if (trialEligible) {
    const past = await stripe("GET", "/subscriptions", { customer, status: "all", limit: 1 })
    if (past.ok && Array.isArray(past.data.data) && past.data.data.length) trialEligible = false
  }
  const params = checkoutParams({
    userId, customer, plan, interval, price, receptionPrice: reception ? receptionPrice : "", embedded, base,
    trialDays: trialEligible ? TRIAL_DAYS() : 0,
    taxRate: (env("STRIPE_TAX_RATE_ID") || "").trim(), autoTax: env("STRIPE_AUTOMATIC_TAX") === "1",
  })
  let s = await stripe("POST", "/checkout/sessions", params, embedded ? STRIPE_VERSION_ELEMENTS : undefined)
  // update55 · PayPal pas (encore) activé sur le compte Stripe (ex. passage en live) : on retombe sur carte + Apple Pay / Google Pay
  if (!s.ok && /paypal/i.test(String((s.data.error as { message?: string } | undefined)?.message || ""))) {
    await reportError(new Error("Stripe : PayPal indisponible, repli sur la carte"), { route: "account", action: "checkout_paypal_fallback" })
    const cardOnly = embedded ? { ...params, allowed_payment_method_types: ["card"] } : { ...params, payment_method_types: ["card"] }
    s = await stripe("POST", "/checkout/sessions", cardOnly, embedded ? STRIPE_VERSION_ELEMENTS : undefined)
  }
  if (!s.ok || !(embedded ? s.data.client_secret : s.data.url)) {
    const msg = (s.data.error as { message?: string } | undefined)?.message
    return { status: 502, body: { error: `Stripe : impossible d'ouvrir le paiement${msg ? ` (${msg})` : ""}.` } }
  }
  return { status: 200, body: { ok: true, session_id: String(s.data.id), trial_days: trialEligible ? TRIAL_DAYS() : 0, ...(embedded ? { client_secret: String(s.data.client_secret) } : { url: String(s.data.url) }) } }
}

/** update55 · Moyens de paiement proposés (ordre d'affichage géré côté Payment Element). */
const PAY_METHODS = ["card", "paypal"]

/** Paramètres de la session Stripe Checkout (exporté pour le test local scripts/test-checkout.ts). */
export function checkoutParams(o: { methods?: string[]; userId: string; customer: string; plan: PlanId; interval: Interval; price: string; receptionPrice: string; embedded: boolean; base: string; trialDays: number; taxRate: string; autoTax: boolean }) {
  const line = (p: string) => ({ price: p, quantity: 1, ...(o.taxRate && !o.autoTax ? { tax_rates: [o.taxRate] } : {}) })
  const back = `${o.base}/reception?billing=ok&session_id={CHECKOUT_SESSION_ID}`
  const first = o.trialDays ? new Date(Date.now() + o.trialDays * 86400e3).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }) : ""
  return {
    mode: "subscription",
    customer: o.customer,
    client_reference_id: o.userId,
    line_items: [line(o.price), ...(o.receptionPrice ? [line(o.receptionPrice)] : [])],
    ...(o.embedded
      // Paiement intégré dans l'écran Akno (Checkout Sessions + Elements).
      // update55 · carte + PayPal. Apple Pay et Google Pay passent par « card » (portefeuilles, domaine enregistré chez Stripe).
      // Liste explicite plutôt que la config Dashboard, qui ajouterait Klarna, Amazon Pay… PayPal revient sur return_url.
      ? { ui_mode: "elements", return_url: back, allowed_payment_method_types: o.methods || PAY_METHODS }
      : { success_url: back, cancel_url: `${o.base}/reception?billing=cancel`, payment_method_types: o.methods || PAY_METHODS, branding_settings: BRANDING,
          ...(first ? { custom_text: { submit: { message: `0 € aujourd'hui. Premier prélèvement le ${first}, sauf résiliation avant cette date depuis Akno.` } } } : {}) }),
    locale: "fr",
    allow_promotion_codes: true,
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    customer_update: { name: "auto", address: "auto" },
    metadata: { artisan_id: o.userId, plan: o.plan, interval: o.interval, reception: o.receptionPrice ? "1" : "0" },
    subscription_data: {
      metadata: { artisan_id: o.userId, plan: o.plan, interval: o.interval },
      ...(o.trialDays ? { trial_period_days: o.trialDays, trial_settings: { end_behavior: { missing_payment_method: "cancel" } } } : {}),
    },
    ...(o.autoTax ? { automatic_tax: { enabled: true } } : {}),
  }
}

/** update46 · Retour de paiement : relit la session chez Stripe (côté serveur) et met à jour l'abonnement tout de suite,
    sans attendre le webhook. Le navigateur ne transmet que l'identifiant de session. */
async function checkoutSync(sb: import("@supabase/supabase-js").SupabaseClient, userId: string, body: Json): Promise<ApiResult> {
  if (!billingEnabled()) return { status: 503, body: { error: "Paiement non activé." } }
  const id = String(body.session_id || "")
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) return { status: 400, body: { error: "Session de paiement invalide." } }
  const s = await stripe("GET", `/checkout/sessions/${id}`)
  if (!s.ok) return { status: 404, body: { error: "Session de paiement introuvable." } }
  if (String(s.data.client_reference_id || "") !== userId) return { status: 403, body: { error: "Cette session ne correspond pas à votre compte." } }
  const done = s.data.status === "complete"
  if (done && s.data.subscription) {
    try { await syncSubscription(String(s.data.subscription), userId) } catch (e) { await reportError(e, { route: "account", action: "checkout_sync" }) }
    try { await ensureDefaultPaymentMethod(String(s.data.subscription)) } catch (e) { await reportError(e, { route: "account", action: "default_pm" }) }
  }
  const ent = await loadEntitlements(sb, userId)
  return { status: 200, body: { ok: true, complete: done, entitlements: ent as unknown as Json } }
}

/* update48 · Ajouter la Réceptionniste IA / passer en Clients sur l'abonnement EXISTANT (même pendant l'essai).
   confirm=false → aperçu des montants ; confirm=true → modification Stripe + synchro directe des droits (sans attendre le webhook). */
async function upgrade(sb: import("@supabase/supabase-js").SupabaseClient, userId: string, body: Json): Promise<ApiResult> {
  if (!billingEnabled()) return { status: 503, body: { error: "Paiement non activé." } }
  const kind = body.add === "reception" ? "reception" : body.add === "clients" ? "clients" : null
  if (!kind) return { status: 400, body: { error: "Option inconnue." } }
  let admin
  try { admin = adminClient() } catch { return { status: 503, body: { error: "SUPABASE_SERVICE_ROLE_KEY manquante." } } }
  const { data: row } = await admin.from("subscriptions").select("stripe_subscription_id, stripe_customer_id").eq("artisan_id", userId).maybeSingle()
  if (!row?.stripe_subscription_id) return { status: 409, body: { error: "Aucun abonnement en cours : choisissez d'abord une offre.", offers: true } }
  const r = await upgradeSubscription(String(row.stripe_subscription_id), kind, { confirm: body.confirm === true, customer: String(row.stripe_customer_id || "") || undefined, artisanId: userId })
  if (!r.ok) return { status: r.status, body: { error: r.error } }
  if (body.confirm !== true) return { status: 200, body: { ok: true, preview: r.preview as unknown as Json } }
  try { await syncSubscription(String(row.stripe_subscription_id), userId) } catch (e) { await reportError(e, { route: "account", action: "upgrade_sync" }) }
  const ent = await loadEntitlements(sb, userId)
  return { status: 200, body: { ok: true, done: true, preview: r.preview as unknown as Json, entitlements: ent as unknown as Json } }
}

async function portal(userId: string, headers?: Headers): Promise<ApiResult> {
  if (!billingEnabled()) return { status: 503, body: { error: "Le paiement en ligne n'est pas encore activé." } }
  let admin
  try { admin = adminClient() } catch { return { status: 503, body: { error: "SUPABASE_SERVICE_ROLE_KEY manquante." } } }
  const { data: sub } = await admin.from("subscriptions").select("stripe_customer_id").eq("artisan_id", userId).maybeSingle()
  if (!sub?.stripe_customer_id) return { status: 404, body: { error: "Aucun abonnement Stripe pour ce compte." } }
  const base = origin(headers)
  const s = await stripe("POST", "/billing_portal/sessions", { customer: sub.stripe_customer_id, return_url: `${base}/reception?billing=portal`, locale: "fr" })
  if (!s.ok || !s.data.url) return { status: 502, body: { error: "Stripe : portail client indisponible (activez-le dans Stripe → Paramètres → Portail client)." } }
  return { status: 200, body: { ok: true, url: String(s.data.url) } }
}

async function saveCalcom(userId: string, body: Json): Promise<ApiResult> {
  const key = String(body.key || "").trim()
  const ev = Number(body.event_type_id)
  let admin
  try { admin = adminClient() } catch { return { status: 503, body: { error: "SUPABASE_SERVICE_ROLE_KEY manquante." } } }
  if (!key) {
    await admin.from("artisan_secrets").upsert({ artisan_id: userId, calcom_api_key: null, calcom_event_type_id: null, updated_at: new Date().toISOString() }, { onConflict: "artisan_id" })
    return { status: 200, body: { ok: true, removed: true } }
  }
  if (!/^cal_(live|test)_[A-Za-z0-9]+$/.test(key) && key.length < 20) return { status: 400, body: { error: "Clé Cal.com invalide (elle commence par cal_live_)." } }
  const r = await fetch("https://api.cal.com/v2/me", { headers: { Authorization: `Bearer ${key}`, "cal-api-version": "2024-06-14" } })
  if (!r.ok) return { status: 400, body: { error: "Cal.com refuse cette clé. Vérifiez-la dans Cal.com → Réglages → Développeur → Clés API." } }
  await admin.from("artisan_secrets").upsert({ artisan_id: userId, calcom_api_key: key, calcom_event_type_id: Number.isFinite(ev) && ev > 0 ? ev : null, updated_at: new Date().toISOString() }, { onConflict: "artisan_id" })
  return { status: 200, body: { ok: true } }
}

function tvaFromSiren(siren: string) {
  const n = Number(siren)
  if (!/^\d{9}$/.test(siren) || !Number.isFinite(n)) return ""
  const key = (12 + 3 * (n % 97)) % 97
  return `FR${String(key).padStart(2, "0")}${siren}`
}

async function siretLookup(body: Json): Promise<ApiResult> {
  const q = String(body.siret || "").replace(/\s/g, "")
  if (!/^\d{9}(\d{5})?$/.test(q)) return { status: 400, body: { error: "SIRET (14 chiffres) ou SIREN (9 chiffres) attendu." } }
  try {
    const r = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${q}&page=1&per_page=1`, { headers: { Accept: "application/json" } })
    if (!r.ok) return { status: 502, body: { error: "Annuaire des entreprises indisponible. Remplissez à la main." } }
    const data = await r.json() as { results?: Array<Record<string, unknown>> }
    const e = data.results?.[0]
    if (!e) return { status: 404, body: { error: "Aucune entreprise trouvée pour ce numéro." } }
    const siege = (e.siege || {}) as Record<string, unknown>
    const matching = Array.isArray(e.matching_etablissements) ? e.matching_etablissements as Array<Record<string, unknown>> : []
    const etab = matching.find(m => String(m.siret) === q) || siege
    const siren = String(e.siren || q.slice(0, 9))
    const adresse = [etab.numero_voie, etab.indice_repetition, etab.type_voie, etab.libelle_voie].filter(Boolean).join(" ") || String(etab.adresse || "").replace(/\s\d{5}\s.*$/, "")
    const naf = String(e.activite_principale || etab.activite_principale || "")
    const complements = (e.complements || {}) as Record<string, unknown>
    const nature = String(e.nature_juridique || "")
    return {
      status: 200,
      body: {
        ok: true,
        nom: String(e.nom_raison_sociale || e.nom_complet || ""),
        siret: String(etab.siret || (q.length === 14 ? q : "")),
        siren,
        tva: tvaFromSiren(siren),
        adresse,
        cp_ville: [etab.code_postal, etab.libelle_commune].filter(Boolean).join(" "),
        ape: naf,
        entrepreneur_individuel: complements.est_entrepreneur_individuel === true || nature === "1000",
        nature_juridique: nature,
      },
    }
  } catch {
    return { status: 502, body: { error: "Annuaire des entreprises indisponible. Remplissez à la main." } }
  }
}

/* update57 · « Ma réceptionniste » : aperçu d'une voix Grok (API Text to Speech xAI, POST /v1/tts, même liste de voix
   que le temps réel — https://docs.x.ai/developers/model-capabilities/audio/text-to-speech). Réservé à l'option
   Réceptionniste, 40 aperçus / jour / artisan (~0,004 $ l'aperçu : 15 $ / 1 M caractères). Rien n'est stocké. */
const TTS_VOICES = new Set(["altair", "ara", "atlas", "aurora", "carina", "castor", "celeste", "cosmo", "eve", "helios", "helix", "iris", "kepler", "leo", "liora", "lumen", "luna", "lux", "naksh", "orion", "perseus", "rex", "rigel", "sal", "sirius", "ursa", "zagan", "zenith"])
async function voicePreview(sb: import("@supabase/supabase-js").SupabaseClient, userId: string, body: Json): Promise<ApiResult> {
  const key = env("XAI_API_KEY")
  if (!key) return { status: 503, body: { error: "La clé XAI_API_KEY n'est pas configurée sur le serveur." } }
  const ent = await loadEntitlements(sb, userId)
  if (!can(ent, "reception")) return { status: 402, body: { error: upgradeError("reception", ent), code: "upgrade" } }
  const voice = String(body.voice || "").toLowerCase()
  if (!TTS_VOICES.has(voice)) return { status: 400, body: { error: "Voix inconnue." } }
  const text = String(body.text || "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 320)
  if (text.length < 4) return { status: 400, body: { error: "Texte d'aperçu manquant." } }
  const phone = body.quality === "phone"
  const speed = Math.min(1.2, Math.max(0.85, Number(body.speed) || 1))
  if (!await consume(userId, "voice_previews", dayKey(), 40)) return { status: 429, body: { error: "Limite d'aperçus atteinte pour aujourd'hui. Utilisez « Tester ma réceptionniste »." } }
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 15000)
  try {
    const r = await fetch("https://api.x.ai/v1/tts", {
      method: "POST", signal: ctl.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      // « Son téléphone » : WAV 8 kHz, la bande passante d'une vraie ligne (Twilio G.711) ; sinon MP3 24 kHz.
      body: JSON.stringify({ text, voice_id: voice, language: "fr", speed, output_format: phone ? { codec: "wav", sample_rate: 8000 } : { codec: "mp3", sample_rate: 24000, bit_rate: 64000 } }),
    })
    if (!r.ok) return { status: 502, body: { error: `Aperçu indisponible (xAI ${r.status}).` } }
    const bytes = new Uint8Array(await r.arrayBuffer())
    let bin = ""
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return { status: 200, body: { ok: true, mime: phone ? "audio/wav" : "audio/mpeg", audio: btoa(bin) } }
  } catch {
    return { status: 504, body: { error: "xAI met trop de temps à répondre. Réessayez." } }
  } finally { clearTimeout(t) }
}

export async function handleAccount(authorization?: string, body?: unknown, headers?: Headers): Promise<ApiResult> {
  const session = await authed(authorization)
  if (isResult(session)) return session
  const input = parseBody(body)
  const { supabase, userId } = session
  try {
    const action = String(input.action || "status")
    if (action === "status") return await status(supabase, userId)
    if (!await rateLimit(userId, "account", 20)) return { status: 429, body: { error: "Trop de requêtes. Patientez une minute." } }
    if (action === "checkout") return await checkout(supabase, userId, session.email, input, headers)
    if (action === "checkout_sync") return await checkoutSync(supabase, userId, input)
    if (action === "upgrade") return await upgrade(supabase, userId, input)
    if (action === "portal") return await portal(userId, headers)
    if (action === "save_calcom") return await saveCalcom(userId, input)
    if (action === "siret_lookup") return await siretLookup(input)
    if (action === "voice_preview") return await voicePreview(supabase, userId, input)
    if (action === "accept_cgv") {
      const version = String(input.version || "").slice(0, 20)
      if (!version) return { status: 400, body: { error: "Version manquante." } }
      const { error } = await supabase.from("artisans").update({ cgv_version: version, cgv_accepted_at: new Date().toISOString() }).eq("id", userId)
      return error ? { status: 500, body: { error: "Enregistrement impossible." } } : { status: 200, body: { ok: true } }
    }
    if (action === "sms_test") {
      const ent = await loadEntitlements(supabase, userId)
      const { data: a } = await supabase.from("artisans").select("telephone, entreprise_telephone, sms_sender, entreprise_nom, nom_entreprise").eq("id", userId).maybeSingle()
      const to = String(input.to || a?.telephone || a?.entreprise_telephone || "")
      const r = await sendSmsMetered({ artisanId: userId, to, body: "Akno : ceci est un SMS de test. Vos SMS clients sont prêts.", kind: "test", sender: a?.sms_sender || a?.entreprise_nom || a?.nom_entreprise }, ent.quotas.sms)
      return r.ok ? { status: 200, body: { ok: true } } : { status: r.skipped ? 503 : 502, body: { error: r.error } }
    }
    return { status: 400, body: { error: "Action inconnue." } }
  } catch (e) {
    await reportError(e, { route: "account", action: String(input.action || "") })
    return { status: 500, body: { error: "Erreur serveur." } }
  }
}

export default async function handler(req: Req, res: Res) {
  res.setHeader("Cache-Control", "no-store")
  if (req.method === "OPTIONS") { res.status(204).end(); return }
  if (req.method !== "POST") { res.status(405).json({ error: "Méthode non autorisée." }); return }
  const { status: code, body } = await handleAccount(header(req.headers, "authorization") || undefined, req.body, req.headers)
  res.status(code).json(body)
}

export type { PlanId }
