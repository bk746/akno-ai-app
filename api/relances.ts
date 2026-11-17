import type { SupabaseClient } from "@supabase/supabase-js"
import {
  addDaysYmd, adminClient, appUrl, devisAcceptUrl, env, formatEuro, frDate, impayeTemplate, monthlyReportHtml,
  parisDayStart, parisYmd, reminderEmailHtml, replyToFor, reviewEmailHtml, reviewUrlOf,
  samePhone, sendResend, simpleHtml, stopDevisReminders,
} from "./_lib/mail.js"
import { can, loadEntitlements, type Entitlements, type Feature } from "./_lib/plans.js"
import { sendSms, smsConfigured } from "./_lib/sms.js"
import { consume, monthKey } from "./_lib/limits.js"
import { notifyArtisan } from "./_lib/push.js"
import { reportError } from "./_lib/monitoring.js"

type Json = Record<string, unknown>
type ApiResult = { status: number; body: Json }
type DevisRow = {
  id: string
  artisan_id: string
  numero: string
  client_nom: string
  client_email: string | null
  client_telephone: string | null
  objet: string | null
  statut: string
  token: string
  envoye_le: string | null
  relances: number | null
  relances_off: boolean | null
  reponse_client: string | null
  repondu_le: string | null
}

type ArtisanRow = {
  id: string; prenom?: string | null; email?: string | null; entreprise_email?: string | null; entreprise_nom?: string | null
  nom_entreprise?: string | null; entreprise_telephone?: string | null; telephone?: string | null; avis_url?: string | null
  sms_enabled?: boolean | null; sms_sender?: string | null; rapport_mensuel?: boolean | null; iban?: string | null
  conservation_enregistrements_jours?: number | null
}

/** Cache par exécution : profil et droits de chaque artisan. */
function makeCtx(sb: SupabaseClient) {
  const artisans = new Map<string, ArtisanRow | null>()
  const ents = new Map<string, Entitlements>()
  return {
    async artisan(id: string) {
      if (!artisans.has(id)) {
        const { data } = await sb.from("artisans").select("id, prenom, email, entreprise_email, entreprise_nom, nom_entreprise, entreprise_telephone, telephone, avis_url, sms_enabled, sms_sender, rapport_mensuel, iban, conservation_enregistrements_jours").eq("id", id).maybeSingle()
        artisans.set(id, (data || null) as ArtisanRow | null)
      }
      return artisans.get(id) || null
    },
    async can(id: string, f: Feature) {
      if (!ents.has(id)) ents.set(id, await loadEntitlements(sb, id))
      return can(ents.get(id)!, f)
    },
    async ent(id: string) {
      if (!ents.has(id)) ents.set(id, await loadEntitlements(sb, id))
      return ents.get(id)!
    },
  }
}
type Ctx = ReturnType<typeof makeCtx>
const companyOf = (a: ArtisanRow | null) => a?.entreprise_nom || a?.nom_entreprise || "votre artisan"

/** SMS seulement si Twilio est configuré, que l'artisan a activé les SMS, que son offre les inclut et qu'il reste du quota. */
async function trySms(sb: SupabaseClient, ctx: Ctx, artisanId: string, to: string | null | undefined, body: string, kind: Parameters<typeof sendSms>[1]["kind"]) {
  if (!smsConfigured() || !to) return false
  const a = await ctx.artisan(artisanId)
  if (!a?.sms_enabled || !await ctx.can(artisanId, "sms")) return false
  const ent = await ctx.ent(artisanId)
  if (!await consume(artisanId, "sms", monthKey(), ent.quotas.sms)) return false
  const r = await sendSms(sb, { artisanId, to, body, kind, sender: a.sms_sender || companyOf(a) })
  return r.ok
}

const CLOSED = new Set(["val", "ref", "sans_reponse", "sans", "sans réponse", "brouillon"])

async function shouldStop(sb: SupabaseClient, d: DevisRow): Promise<string | null> {
  if (d.relances_off) return "off"
  if (CLOSED.has(d.statut)) return "status"
  if (d.reponse_client) return "reply"
  if (d.repondu_le && (d.statut === "val" || d.statut === "ref")) return "decided"
  if (d.client_telephone && d.envoye_le) {
    const { data: calls } = await sb.from("calls")
      .select("telephone_client")
      .eq("artisan_id", d.artisan_id)
      .gt("created_at", d.envoye_le)
      .limit(80)
    if ((calls || []).some(c => samePhone((c as { telephone_client?: string }).telephone_client, d.client_telephone))) {
      return "callback"
    }
  }
  return null
}

async function loadDevis(sb: SupabaseClient, id: string) {
  const { data } = await sb.from("devis").select("id, artisan_id, numero, client_nom, client_email, client_telephone, objet, statut, token, envoye_le, relances, relances_off, reponse_client, repondu_le").eq("id", id).maybeSingle()
  return (data || null) as DevisRow | null
}

async function processDueReminders(sb: SupabaseClient, ctx: Ctx, now: Date) {
  const sent: string[] = []
  const stopped: string[] = []
  const marked: string[] = []
  const errors: string[] = []
  const { data: due } = await sb.from("relances")
    .select("id, devis_id, type, client, artisan_id")
    .eq("statut", "prog")
    .not("devis_id", "is", null)
    .lte("scheduled_for", now.toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(80)

  for (const row of due || []) {
    const relId = (row as { id: string }).id
    const devisId = String((row as { devis_id?: string }).devis_id || "")
    if (!devisId) continue
    const devis = await loadDevis(sb, devisId)
    if (!devis) {
      await sb.from("relances").update({ statut: "pause" }).eq("id", relId)
      continue
    }
    if (!await ctx.can(devis.artisan_id, "relances_devis")) continue   // offre expirée : on garde la relance en attente
    const stop = await shouldStop(sb, devis)
    if (stop) {
      await stopDevisReminders(sb, devis.id)
      stopped.push(devis.id)
      continue
    }
    const artisan = await ctx.artisan(devis.artisan_id)
    const company = companyOf(artisan)
    const type = String((row as { type?: string }).type || "")
    const wave = Number(/j\+(\d+)/i.exec(type)?.[1] || 0)
    const { count: remaining } = await sb.from("relances").select("id", { count: "exact", head: true }).eq("devis_id", devis.id).eq("statut", "prog").neq("id", relId)
    const last = !remaining
    const acceptUrl = devis.token ? devisAcceptUrl(devis.token) : appUrl()
    const email = (devis.client_email || "").trim()
    let ok = false
    let canal = ""
    if (email) {
      const mailed = await sendResend({
        to: email,
        subject: `Rappel — devis n° ${devis.numero} — ${company}`,
        html: reminderEmailHtml({ client: devis.client_nom, numero: devis.numero, objet: devis.objet || undefined, company, acceptUrl, wave, last }),
        replyTo: replyToFor(devis.token, artisan?.entreprise_email || artisan?.email || undefined),
        company,
      })
      if (mailed.ok) { ok = true; canal = "E-mail" } else errors.push(`${devis.numero}: ${mailed.error}`)
    }
    // Complément SMS (update47) : seulement si activé et configuré
    const smsOk = await trySms(sb, ctx, devis.artisan_id, devis.client_telephone,
      `${company} : petit rappel concernant notre devis n° ${devis.numero}. Vous pouvez le consulter et l'accepter ici : ${acceptUrl}`, "relance_devis")
    if (smsOk) { ok = true; canal = canal ? "E-mail + SMS" : "SMS" }
    if (!ok) {
      if (!email && !devis.client_telephone) {
        await sb.from("relances").update({ statut: "pause" }).eq("id", relId)
        stopped.push(devis.id)
      }
      continue
    }
    const sentAt = now.toISOString()
    await sb.from("relances").update({ statut: "env", sent_at: sentAt, canal, date_label: wave ? `Envoyée · J+${wave}` : "Envoyée" }).eq("id", relId)
    const count = Number(devis.relances || 0) + 1
    await sb.from("devis").update({ relances: count, derniere_relance: sentAt }).eq("id", devis.id)
    sent.push(devis.id)
    if (last && wave) {
      const again = await loadDevis(sb, devis.id)
      if (again && !await shouldStop(sb, again) && again.statut === "env") {
        await sb.from("devis").update({ statut: "sans_reponse" }).eq("id", devis.id)
        marked.push(devis.id)
      }
    }
  }
  return { sent: sent.length, stopped: stopped.length, sans_reponse: marked.length, errors }
}

async function sweepPending(sb: SupabaseClient) {
  const { data: pending } = await sb.from("relances").select("devis_id").eq("statut", "prog").not("devis_id", "is", null).limit(200)
  const ids = [...new Set((pending || []).map(r => String((r as { devis_id?: string }).devis_id || "")).filter(Boolean))]
  let stopped = 0
  for (const id of ids) {
    const devis = await loadDevis(sb, id)
    if (!devis) continue
    const stop = await shouldStop(sb, devis)
    if (stop) {
      await stopDevisReminders(sb, devis.id)
      stopped++
    }
  }
  return stopped
}

async function resolveEmail(sb: SupabaseClient, apt: { artisan_id: string; client?: string | null; telephone_client?: string | null; email_client?: string | null }) {
  if (apt.email_client && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(apt.email_client)) return apt.email_client.trim()
  if (apt.client) {
    const { data: fromDevis } = await sb.from("devis").select("client_email, client_telephone, client_nom").eq("artisan_id", apt.artisan_id).ilike("client_nom", apt.client).not("client_email", "is", null).limit(8)
    const rows = fromDevis || []
    const byPhone = apt.telephone_client ? rows.find(d => d.client_email && samePhone(d.client_telephone, apt.telephone_client)) : undefined
    const hit = byPhone || rows.find(d => d.client_email)
    if (hit?.client_email) return String(hit.client_email)
    const { data: fromCalls } = await sb.from("calls").select("email_client, telephone_client, nom_client").eq("artisan_id", apt.artisan_id).ilike("nom_client", apt.client).not("email_client", "is", null).limit(8)
    const call = (fromCalls || []).find(c => c.email_client)
    if (call?.email_client) return String(call.email_client)
  }
  if (apt.telephone_client) {
    const { data: calls } = await sb.from("calls").select("email_client, telephone_client").eq("artisan_id", apt.artisan_id).not("email_client", "is", null).limit(40)
    const match = (calls || []).find(c => c.email_client && samePhone(c.telephone_client, apt.telephone_client))
    if (match?.email_client) return String(match.email_client)
  }
  return ""
}

async function processReviews(sb: SupabaseClient, ctx: Ctx, now: Date) {
  const today = parisYmd(now)
  const yesterday = addDaysYmd(today, -1)
  const from = parisDayStart(yesterday).toISOString()
  const to = parisDayStart(today).toISOString()
  const { data: apts } = await sb.from("appointments")
    .select("id, artisan_id, client, telephone_client, email_client, title, avis_envoye_le")
    .is("avis_envoye_le", null)
    .gte("end", from)
    .lt("end", to)
    .limit(80)

  let sent = 0
  const errors: string[] = []
  for (const apt of apts || []) {
    if (!await ctx.can(apt.artisan_id, "avis")) continue
    const artisan = await ctx.artisan(apt.artisan_id)
    // update44 : plus de lien par défaut. Sans lien Google propre à l'artisan, on n'envoie rien.
    const reviewUrl = reviewUrlOf(artisan?.avis_url)
    if (!reviewUrl) continue
    const company = companyOf(artisan)
    const email = await resolveEmail(sb, apt)
    let canal = ""
    if (email) {
      const mailed = await sendResend({
        to: email,
        subject: `Votre avis compte — ${company}`,
        html: reviewEmailHtml({ client: apt.client || undefined, company, reviewUrl, title: apt.title || undefined }),
        company,
      })
      if (mailed.ok) canal = "E-mail"
      else errors.push(`${apt.client || apt.id}: ${mailed.error}`)
    }
    if (!canal) {
      const smsOk = await trySms(sb, ctx, apt.artisan_id, apt.telephone_client,
        `${company} : merci pour votre confiance ! Si l'intervention vous a plu, votre avis nous aide beaucoup : ${reviewUrl}`, "avis")
      if (smsOk) canal = "SMS"
    }
    if (!canal) continue
    const sentAt = now.toISOString()
    await sb.from("appointments").update({ avis_envoye_le: sentAt }).eq("id", apt.id)
    await sb.from("relances").insert({
      artisan_id: apt.artisan_id,
      client: apt.client || "Client",
      type: "Demande d'avis",
      canal,
      statut: "env",
      date_label: "Envoyée",
      appointment_id: apt.id,
      sent_at: sentAt,
    })
    sent++
  }
  return { sent, errors }
}

/* ---------- update47 : rappel SMS la veille du rendez-vous ---------- */
async function processAppointmentReminders(sb: SupabaseClient, ctx: Ctx, now: Date) {
  if (!smsConfigured()) return { sent: 0 }
  const tomorrow = addDaysYmd(parisYmd(now), 1)
  const { data: apts } = await sb.from("appointments")
    .select("id, artisan_id, client, telephone_client, start, adresse, ville")
    .is("rappel_sms_le", null)
    .gte("start", parisDayStart(tomorrow).toISOString())
    .lt("start", parisDayStart(addDaysYmd(tomorrow, 1)).toISOString())
    .limit(150)
  let sent = 0
  for (const apt of apts || []) {
    if (!apt.telephone_client) continue
    const artisan = await ctx.artisan(apt.artisan_id)
    const company = companyOf(artisan)
    const hour = new Date(apt.start).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" })
    const tel = artisan?.entreprise_telephone || artisan?.telephone || ""
    const ok = await trySms(sb, ctx, apt.artisan_id, apt.telephone_client,
      `${company} : rappel de votre rendez-vous demain à ${hour}${apt.adresse ? ` (${apt.adresse}${apt.ville ? `, ${apt.ville}` : ""})` : ""}.${tel ? ` Un empêchement ? Appelez le ${tel}.` : ""}`, "rappel_rdv")
    if (ok) {
      await sb.from("appointments").update({ rappel_sms_le: now.toISOString() }).eq("id", apt.id)
      sent++
    }
  }
  return { sent }
}

/* ---------- update46 : relances d'impayés PRÉPARÉES, validées par l'artisan ---------- */
const IMPAYE_STEPS = [{ niveau: 1, days: 1 }, { niveau: 2, days: 8 }, { niveau: 3, days: 15 }, { niveau: 4, days: 30 }]

async function prepareFactureRelances(sb: SupabaseClient, ctx: Ctx, now: Date) {
  const today = parisYmd(now)
  const { data: due } = await sb.from("factures")
    .select("id, artisan_id, numero, client_nom, client_pro, total_ttc, acompte_deduit, date_echeance, type")
    .in("statut", ["emise", "envoyee"])
    .eq("relances_off", false)
    .neq("type", "avoir")
    .lt("date_echeance", today)
    .limit(200)
  let prepared = 0
  for (const f of due || []) {
    if (!f.numero || !f.date_echeance) continue
    if (!await ctx.can(f.artisan_id, "relances_impayes")) continue
    const late = Math.round((parisDayStart(today).getTime() - parisDayStart(String(f.date_echeance)).getTime()) / 86400e3)
    const { data: existing } = await sb.from("facture_relances").select("niveau, statut").eq("facture_id", f.id)
    if ((existing || []).some(r => r.statut === "a_valider")) continue   // l'artisan n'a pas encore traité la précédente
    const maxLevel = Math.max(0, ...(existing || []).map(r => Number(r.niveau)))
    const next = IMPAYE_STEPS.find(s => s.niveau === maxLevel + 1)
    if (!next || late < next.days) continue
    const artisan = await ctx.artisan(f.artisan_id)
    const company = companyOf(artisan)
    const ttc = Number(f.total_ttc || 0) - Number(f.acompte_deduit || 0)
    const tpl = impayeTemplate({ niveau: next.niveau, client: f.client_nom || undefined, numero: f.numero, company, ttc, echeance: f.date_echeance, pro: !!f.client_pro, iban: artisan?.iban })
    const { error } = await sb.from("facture_relances").insert({ artisan_id: f.artisan_id, facture_id: f.id, niveau: next.niveau, statut: "a_valider", sujet: tpl.sujet, corps: tpl.corps })
    if (error) continue
    prepared++
    await notifyArtisan(f.artisan_id, {
      title: next.niveau === 4 ? "Mise en demeure à valider" : "Relance d'impayé à valider",
      body: `Facture ${f.numero} · ${f.client_nom || "Client"} · ${formatEuro(ttc)} · ${late} j de retard`,
      url: "/factures",
      tag: `impaye-${f.id}`,
    })
  }
  return { prepared }
}

/* ---------- update46 : alertes d'expiration du dossier de conformité ---------- */
const DOC_LABEL: Record<string, string> = { urssaf: "Attestation de vigilance Urssaf", kbis: "Extrait Kbis", decennale: "Attestation d'assurance décennale", rc_pro: "Attestation RC Pro", rge: "Certificat RGE", qualibat: "Qualification Qualibat", fiscale: "Attestation de régularité fiscale", autre: "Document" }

async function conformiteAlerts(sb: SupabaseClient, ctx: Ctx, now: Date) {
  const today = parisYmd(now)
  const horizon = addDaysYmd(today, 30)
  const { data: docs } = await sb.from("documents_conformite")
    .select("id, artisan_id, type, libelle, date_expiration, alerte_j30_le, alerte_j7_le, alerte_expire_le")
    .not("date_expiration", "is", null)
    .lte("date_expiration", horizon)
    .limit(300)
  let alerts = 0
  for (const d of docs || []) {
    if (!await ctx.can(d.artisan_id, "conformite")) continue
    const days = Math.round((parisDayStart(String(d.date_expiration)).getTime() - parisDayStart(today).getTime()) / 86400e3)
    let col: "alerte_expire_le" | "alerte_j7_le" | "alerte_j30_le" | null = null
    if (days < 0 && !d.alerte_expire_le) col = "alerte_expire_le"
    else if (days >= 0 && days <= 7 && !d.alerte_j7_le) col = "alerte_j7_le"
    else if (days > 7 && days <= 30 && !d.alerte_j30_le) col = "alerte_j30_le"
    if (!col) continue
    const name = d.libelle || DOC_LABEL[d.type] || "Document"
    const msg = days < 0 ? `${name} a expiré le ${frDate(d.date_expiration)}.` : `${name} expire le ${frDate(d.date_expiration)} (dans ${days} jour${days > 1 ? "s" : ""}).`
    await notifyArtisan(d.artisan_id, { title: "Dossier de conformité", body: msg, url: "/conformite", tag: `conf-${d.id}` })
    const artisan = await ctx.artisan(d.artisan_id)
    const to = artisan?.entreprise_email || artisan?.email
    if (to) {
      await sendResend({
        to,
        subject: days < 0 ? `Document expiré : ${name}` : `À renouveler : ${name}`,
        html: simpleHtml(days < 0 ? "Un document de votre dossier a expiré" : "Un document de votre dossier arrive à échéance", [msg, "Téléversez la nouvelle version dans Akno → Réglages → Dossier de conformité pour que vos donneurs d'ordre disposent toujours d'un dossier à jour."], { label: "Ouvrir Akno", url: appUrl() }),
      })
    }
    await sb.from("documents_conformite").update({ [col]: now.toISOString() }).eq("id", d.id)
    alerts++
  }
  return { alerts }
}

/* ---------- Rapport mensuel (le 1er du mois, heure de Paris) ---------- */
async function monthlyReports(sb: SupabaseClient, ctx: Ctx, now: Date, force = false) {
  const today = parisYmd(now)
  if (!force && !today.endsWith("-01")) return { sent: 0 }
  const firstThis = `${today.slice(0, 7)}-01`
  const prevYmd = addDaysYmd(firstThis, -1)
  const period = prevYmd.slice(0, 7)
  const from = parisDayStart(`${period}-01`).toISOString()
  const to = parisDayStart(firstThis).toISOString()
  const monthLabel = new Date(`${period}-15T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
  const { data: list } = await sb.from("artisans").select("id").eq("rapport_mensuel", true).limit(500)
  let sent = 0
  for (const { id } of list || []) {
    if (!await ctx.can(id, "rapport_mensuel")) continue
    const { data: done } = await sb.from("rapports_mensuels").select("period").eq("artisan_id", id).eq("period", period).maybeSingle()
    if (done) continue
    const artisan = await ctx.artisan(id)
    const email = artisan?.entreprise_email || artisan?.email
    if (!email) continue
    const [calls, urgent, rdv, devisSent, devisAcc, relances, factures, payees, avis, leads, usage] = await Promise.all([
      sb.from("calls").select("id", { count: "exact", head: true }).eq("artisan_id", id).gte("created_at", from).lt("created_at", to),
      sb.from("calls").select("id", { count: "exact", head: true }).eq("artisan_id", id).gte("created_at", from).lt("created_at", to).in("urgence", ["urgent", "Urgent", "haute", "oui"]),
      sb.from("appointments").select("id", { count: "exact", head: true }).eq("artisan_id", id).gte("created_at", from).lt("created_at", to),
      sb.from("devis").select("id", { count: "exact", head: true }).eq("artisan_id", id).gte("envoye_le", from).lt("envoye_le", to),
      sb.from("devis").select("total_ttc").eq("artisan_id", id).eq("statut", "val").gte("repondu_le", from).lt("repondu_le", to),
      sb.from("relances").select("id", { count: "exact", head: true }).eq("artisan_id", id).eq("statut", "env").gte("sent_at", from).lt("sent_at", to),
      sb.from("factures").select("total_ttc, type").eq("artisan_id", id).not("numero", "is", null).gte("date_emission", `${period}-01`).lt("date_emission", firstThis),
      sb.from("factures").select("total_ttc, acompte_deduit").eq("artisan_id", id).eq("statut", "payee").gte("payee_le", from).lt("payee_le", to),
      sb.from("appointments").select("id", { count: "exact", head: true }).eq("artisan_id", id).gte("avis_envoye_le", from).lt("avis_envoye_le", to),
      sb.from("leads").select("id", { count: "exact", head: true }).eq("artisan_id", id).gte("created_at", from).lt("created_at", to),
      sb.from("usage_counters").select("count").eq("artisan_id", id).eq("metric", "voice_seconds").eq("period", period).maybeSingle(),
    ])
    const sum = (rows: unknown, key = "total_ttc") => (Array.isArray(rows) ? rows : []).reduce((a: number, r) => a + Number((r as Record<string, unknown>)[key] || 0), 0)
    const facturesRows = (factures.data || []).filter(f => f.type !== "avoir")
    const stats = {
      calls: calls.count || 0, urgent: urgent.count || 0, rdv: rdv.count || 0,
      devis_sent: devisSent.count || 0, devis_accepted: (devisAcc.data || []).length, devis_accepted_ttc: sum(devisAcc.data),
      relances: relances.count || 0, factures: facturesRows.length, factures_ttc: sum(facturesRows),
      encaisse_ttc: sum(payees.data) - sum(payees.data, "acompte_deduit"),
      avis: avis.count || 0, leads: leads.count || 0,
      minutes: Math.round(Number((usage.data as { count?: number } | null)?.count || 0) / 60),
    }
    const mailed = await sendResend({ to: email, subject: `Votre mois avec Akno — ${monthLabel}`, html: monthlyReportHtml({ company: companyOf(artisan), monthLabel, stats, appUrl: appUrl() }) })
    if (!mailed.ok) continue
    await sb.from("rapports_mensuels").insert({ artisan_id: id, period, stats })
    sent++
  }
  return { sent }
}

/* ---------- RGPD : purge des enregistrements au-delà de la durée de conservation ---------- */
async function purgeRecordings(sb: SupabaseClient, now: Date) {
  const { data: list } = await sb.from("artisans").select("id, conservation_enregistrements_jours").limit(1000)
  let purged = 0
  for (const a of list || []) {
    const days = Math.max(1, Number(a.conservation_enregistrements_jours) || 180)
    const before = new Date(now.getTime() - days * 86400e3).toISOString()
    const { data: calls } = await sb.from("calls").select("id, recording_url").eq("artisan_id", a.id).not("recording_url", "is", null).lt("created_at", before).limit(100)
    const rows = (calls || []).filter(c => c.recording_url && !/^https?:/i.test(String(c.recording_url)))
    if (!rows.length) continue
    await sb.storage.from("recordings").remove(rows.map(c => String(c.recording_url)))
    await sb.from("calls").update({ recording_url: null }).in("id", rows.map(c => c.id))
    purged += rows.length
  }
  return { purged }
}

export async function handleRelancesCron(authorization?: string, opts?: { forceReport?: boolean }): Promise<ApiResult> {
  const secret = env("CRON_SECRET")
  if (!secret) return { status: 503, body: { error: "CRON_SECRET n'est pas configuré." } }
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : ""
  if (token !== secret) return { status: 401, body: { error: "Non autorisé." } }

  let sb: SupabaseClient
  try { sb = adminClient() }
  catch { return { status: 503, body: { error: "SUPABASE_SERVICE_ROLE_KEY n'est pas configurée." } } }

  const now = new Date()
  const ctx = makeCtx(sb)
  // Chaque étape est isolée : une erreur sur l'une n'empêche pas les suivantes.
  const step = async <T,>(name: string, fn: () => Promise<T>): Promise<T | { error: string }> => {
    try { return await fn() } catch (e) {
      await reportError(e, { route: "relances", step: name })
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }
  const stopped = await step("sweep", () => sweepPending(sb))
  const reminders = await step("devis", () => processDueReminders(sb, ctx, now))
  const reviews = await step("avis", () => processReviews(sb, ctx, now))
  const rdv = await step("rappel_rdv", () => processAppointmentReminders(sb, ctx, now))
  const impayes = await step("impayes", () => prepareFactureRelances(sb, ctx, now))
  const conformite = await step("conformite", () => conformiteAlerts(sb, ctx, now))
  const rapports = await step("rapport", () => monthlyReports(sb, ctx, now, !!opts?.forceReport))
  const purge = await step("purge", () => purgeRecordings(sb, now))
  await step("rate_limits", async () => { await sb.rpc("purge_rate_limits"); return true })
  return {
    status: 200,
    body: { ok: true, sweep_stopped: stopped, reminders, reviews, rdv, impayes, conformite, rapports, purge },
  }
}

type Res = { status: (n: number) => Res; json: (b: unknown) => void; setHeader: (k: string, v: string) => void; end: () => void }

export default async function handler(req: { method?: string; headers: Record<string, string | string[] | undefined> }, res: Res) {
  res.setHeader("Cache-Control", "no-store")
  if (req.method === "OPTIONS") { res.status(204).end(); return }
  if (req.method !== "GET" && req.method !== "POST") { res.status(405).json({ error: "Méthode non autorisée." }); return }
  const raw = req.headers.authorization ?? req.headers.Authorization
  const auth = Array.isArray(raw) ? raw[0] : raw
  const { status, body } = await handleRelancesCron(auth, { forceReport: /[?&]report=1/.test(String((req as { url?: string }).url || "")) })
  res.status(status).json(body)
}
