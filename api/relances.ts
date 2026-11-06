import type { SupabaseClient } from "@supabase/supabase-js"
import {
  addDaysYmd, adminClient, appUrl, DEFAULT_REVIEW_URL, devisAcceptUrl, env,
  parisDayStart, parisYmd, reminderEmailHtml, replyToFor, reviewEmailHtml,
  samePhone, sendResend, stopDevisReminders,
} from "./mail"

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

async function processDueReminders(sb: SupabaseClient, now: Date) {
  const sent: string[] = []
  const stopped: string[] = []
  const marked: string[] = []
  const errors: string[] = []
  const { data: due } = await sb.from("relances")
    .select("id, devis_id, type, client")
    .eq("statut", "prog")
    .not("devis_id", "is", null)
    .lte("scheduled_for", now.toISOString())
    .limit(80)

  for (const row of due || []) {
    const devisId = String((row as { devis_id?: string }).devis_id || "")
    if (!devisId) continue
    const devis = await loadDevis(sb, devisId)
    if (!devis) {
      await sb.from("relances").update({ statut: "pause" }).eq("id", (row as { id: string }).id)
      continue
    }
    const stop = await shouldStop(sb, devis)
    if (stop) {
      await stopDevisReminders(sb, devis.id)
      stopped.push(devis.id)
      continue
    }
    const email = (devis.client_email || "").trim()
    if (!email) {
      await sb.from("relances").update({ statut: "pause" }).eq("id", (row as { id: string }).id)
      stopped.push(devis.id)
      continue
    }
    const { data: artisan } = await sb.from("artisans").select("entreprise_nom, nom_entreprise, entreprise_email, email").eq("id", devis.artisan_id).maybeSingle()
    const company = artisan?.entreprise_nom || artisan?.nom_entreprise || "votre artisan"
    const type = String((row as { type?: string }).type || "")
    const wave: 3 | 7 = /j\+7/i.test(type) ? 7 : 3
    const acceptUrl = devis.token ? devisAcceptUrl(devis.token) : appUrl()
    const html = reminderEmailHtml({
      client: devis.client_nom, numero: devis.numero, objet: devis.objet || undefined,
      company, acceptUrl, wave,
    })
    const mailed = await sendResend({
      to: email,
      subject: `Rappel — devis n° ${devis.numero} — ${company}`,
      html,
      replyTo: replyToFor(devis.token, artisan?.entreprise_email || artisan?.email || undefined),
    })
    if (!mailed.ok) {
      errors.push(`${devis.numero}: ${mailed.error}`)
      continue
    }
    const sentAt = now.toISOString()
    await sb.from("relances").update({ statut: "env", sent_at: sentAt, date_label: `Envoyée · J+${wave}` }).eq("id", (row as { id: string }).id)
    const count = Number(devis.relances || 0) + 1
    await sb.from("devis").update({ relances: count, derniere_relance: sentAt }).eq("id", devis.id)
    sent.push(devis.id)
    if (count >= 2) {
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

async function processReviews(sb: SupabaseClient, now: Date) {
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
    const email = await resolveEmail(sb, apt)
    if (!email) continue
    const { data: artisan } = await sb.from("artisans").select("entreprise_nom, nom_entreprise, avis_url").eq("id", apt.artisan_id).maybeSingle()
    const company = artisan?.entreprise_nom || artisan?.nom_entreprise || "votre artisan"
    const reviewUrl = (artisan?.avis_url || "").trim() || DEFAULT_REVIEW_URL
    const mailed = await sendResend({
      to: email,
      subject: `Votre avis compte — ${company}`,
      html: reviewEmailHtml({ client: apt.client || undefined, company, reviewUrl, title: apt.title || undefined }),
    })
    if (!mailed.ok) {
      errors.push(`${apt.client || apt.id}: ${mailed.error}`)
      continue
    }
    const sentAt = now.toISOString()
    await sb.from("appointments").update({ avis_envoye_le: sentAt }).eq("id", apt.id)
    await sb.from("relances").insert({
      artisan_id: apt.artisan_id,
      client: apt.client || "Client",
      type: "Demande d'avis",
      canal: "E-mail",
      statut: "env",
      date_label: "Envoyée",
      appointment_id: apt.id,
      sent_at: sentAt,
    })
    sent++
  }
  return { sent, errors }
}

export async function handleRelancesCron(authorization?: string): Promise<ApiResult> {
  const secret = env("CRON_SECRET")
  if (!secret) return { status: 503, body: { error: "CRON_SECRET n'est pas configuré." } }
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : ""
  if (token !== secret) return { status: 401, body: { error: "Non autorisé." } }

  let sb: SupabaseClient
  try { sb = adminClient() }
  catch { return { status: 503, body: { error: "SUPABASE_SERVICE_ROLE_KEY n'est pas configurée." } } }

  const now = new Date()
  try {
    const stopped = await sweepPending(sb)
    const reminders = await processDueReminders(sb, now)
    const reviews = await processReviews(sb, now)
    return {
      status: 200,
      body: {
        ok: true,
        reminders_sent: reminders.sent,
        reminders_stopped: reminders.stopped + stopped,
        sans_reponse: reminders.sans_reponse,
        reviews_sent: reviews.sent,
        errors: [...reminders.errors, ...reviews.errors],
      },
    }
  } catch (e) {
    return { status: 500, body: { error: e instanceof Error ? e.message : "Erreur cron." } }
  }
}

type Res = { status: (n: number) => Res; json: (b: unknown) => void; setHeader: (k: string, v: string) => void; end: () => void }

export default async function handler(req: { method?: string; headers: Record<string, string | string[] | undefined> }, res: Res) {
  res.setHeader("Cache-Control", "no-store")
  if (req.method === "OPTIONS") { res.status(204).end(); return }
  if (req.method !== "GET" && req.method !== "POST") { res.status(405).json({ error: "Méthode non autorisée." }); return }
  const raw = req.headers.authorization ?? req.headers.Authorization
  const auth = Array.isArray(raw) ? raw[0] : raw
  const { status, body } = await handleRelancesCron(auth)
  res.status(status).json(body)
}
