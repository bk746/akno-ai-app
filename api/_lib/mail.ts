import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export type Json = Record<string, unknown>
const TZ = "Europe/Paris"

export const env = (name: string) => (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name]
/** update44 : plus de lien d'avis par défaut. Sans lien propre à l'artisan, aucune demande d'avis ne part. */
export function reviewUrlOf(raw?: string | null) {
  const u = (raw || "").trim()
  if (!u || u === "https://g.page/r/CUFA_AEl10CzECE/review") return ""
  return /^https?:\/\//i.test(u) ? u : ""
}

export function looksLikeEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] || ch))
}

export function appUrl() {
  const explicit = (env("APP_URL") || "").trim().replace(/\/$/, "")
  if (explicit) return explicit
  const vercel = (env("VERCEL_URL") || "").trim().replace(/\/$/, "")
  if (vercel) return vercel.startsWith("http") ? vercel : `https://${vercel}`
  return ""
}

export function resendFrom(company?: string | null) {
  const raw = (env("RESEND_FROM") || "Akno <onboarding@resend.dev>").trim()
  const name = (company || "").replace(/["<>\r\n]/g, "").trim().slice(0, 60)
  if (!name) return raw
  const m = raw.match(/<([^>]+)>/)
  const addr = m ? m[1] : raw
  // « Plomberie Martin via Akno » <notifications@akno.ai> : le client reconnaît son artisan
  return `"${name} via Akno" <${addr}>`
}

export function devisAcceptUrl(token: string) {
  const base = appUrl()
  return base ? `${base}/accept/${token}` : ""
}

export function replyToFor(token?: string | null, artisanEmail?: string) {
  const domain = (env("RESEND_INBOUND_DOMAIN") || "").trim().replace(/^@/, "")
  if (domain && token) return `devis+${token}@${domain}`
  if (artisanEmail && looksLikeEmail(artisanEmail)) return artisanEmail.trim()
  return undefined
}

export function adminClient() {
  const url = env("VITE_SUPABASE_URL") || env("SUPABASE_URL")
  const key = env("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !key) throw new Error("Configuration Supabase service role manquante.")
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

export async function sendResend(input: {
  to: string
  subject: string
  html: string
  replyTo?: string
  company?: string | null
  attachments?: { filename: string; content: string }[]
}): Promise<{ ok: true } | { ok: false; missingKey?: boolean; error: string }> {
  const key = env("RESEND_API_KEY")
  if (!key) {
    return { ok: false, missingKey: true, error: "L'envoi d'e-mail n'est pas configuré (RESEND_API_KEY manquante)." }
  }
  const payload: Json = { from: resendFrom(input.company), to: [input.to], subject: input.subject, html: input.html }
  if (input.replyTo) payload.reply_to = input.replyTo
  if (input.attachments?.length) payload.attachments = input.attachments
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) return { ok: false, error: "L'e-mail n'a pas pu être envoyé." }
  return { ok: true }
}

function ctaBlock(acceptUrl: string, company: string) {
  if (!acceptUrl) {
    return `<p>Le devis PDF est joint ou vous a déjà été transmis. Pour toute question, répondez simplement à cet e-mail.</p>`
  }
  return `<p style="margin:28px 0 12px">
  <a href="${escapeHtml(acceptUrl)}" style="display:inline-block;background:#0E8F8F;color:#ffffff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;font-size:15px">Accepter le devis</a>
</p>
<p style="color:#555;font-size:14px">Vous pouvez aussi <a href="${escapeHtml(acceptUrl)}" style="color:#0E8F8F">consulter le devis</a> et le refuser en ligne, ou répondre à cet e-mail pour échanger avec ${escapeHtml(company)}.</p>`
}

export function devisEmailHtml(input: { client?: string; numero: string; objet?: string; company: string; acceptUrl: string }) {
  const who = input.client ? ` ${escapeHtml(input.client)}` : ""
  return `<p>Bonjour${who},</p>
<p>Veuillez trouver ci-joint le devis n° ${escapeHtml(String(input.numero))}${input.objet ? ` concernant « ${escapeHtml(input.objet)} »` : ""}.</p>
${ctaBlock(input.acceptUrl, input.company)}
<p>Cordialement,<br/>${escapeHtml(input.company)}</p>`
}

export function reminderEmailHtml(input: { client?: string; numero: string; objet?: string; company: string; acceptUrl: string; wave?: number; last?: boolean }) {
  const who = input.client ? ` ${escapeHtml(input.client)}` : ""
  const intro = !input.last
    ? `Nous nous permettons de revenir vers vous au sujet du devis n° ${escapeHtml(String(input.numero))}${input.objet ? ` concernant « ${escapeHtml(input.objet)} »` : ""}. Avez-vous pu le consulter ?`
    : `Nous vous envoyons un dernier rappel au sujet du devis n° ${escapeHtml(String(input.numero))}${input.objet ? ` (« ${escapeHtml(input.objet)} »)` : ""}. Il reste à votre disposition si vous souhaitez l'accepter ou l'ajuster.`
  return `<p>Bonjour${who},</p>
<p>${intro}</p>
${ctaBlock(input.acceptUrl, input.company)}
<p>Cordialement,<br/>${escapeHtml(input.company)}</p>`
}

export function reviewEmailHtml(input: { client?: string; company: string; reviewUrl: string; title?: string }) {
  const who = input.client ? ` ${escapeHtml(input.client)}` : ""
  const about = input.title ? ` concernant « ${escapeHtml(input.title)} »` : ""
  return `<p>Bonjour${who},</p>
<p>Merci pour votre confiance${about}. Si l'intervention vous a convenu, votre avis aide d'autres clients à nous trouver.</p>
<p style="margin:28px 0 12px">
  <a href="${escapeHtml(input.reviewUrl)}" style="display:inline-block;background:#0E8F8F;color:#ffffff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;font-size:15px">Laisser un avis</a>
</p>
<p>Merci encore,<br/>${escapeHtml(input.company)}</p>`
}

function parisParts(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  })
  return Object.fromEntries(fmt.formatToParts(d).filter(x => x.type !== "literal").map(x => [x.type, x.value])) as Record<string, string>
}

function pad(n: number) { return String(n).padStart(2, "0") }

export function parisYmd(d = new Date()) {
  const p = parisParts(d)
  return `${p.year}-${p.month}-${p.day}`
}

export function addDaysYmd(ymd: string, n: number) {
  const [y, m, d] = ymd.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

export function zonedTimeToUtc(y: number, m: number, d: number, h: number, min: number) {
  const utcGuess = Date.UTC(y, m - 1, d, h, min, 0)
  const p = parisParts(new Date(utcGuess))
  const asIf = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute))
  return new Date(utcGuess + (Date.UTC(y, m - 1, d, h, min) - asIf))
}

export function parisDayStart(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number)
  return zonedTimeToUtc(y, m, d, 0, 0)
}

function nineParis(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number)
  return zonedTimeToUtc(y, m, d, 9, 0).toISOString()
}

function formatRelLabel(n: number, ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number)
  const label = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })
  return `J+${n} · ${label}`
}

export function reminderDelays(raw?: unknown): number[] {
  const arr = Array.isArray(raw) ? raw.map(Number).filter(n => Number.isFinite(n) && n >= 1 && n <= 60) : []
  const uniq = [...new Set(arr)].sort((a, b) => a - b).slice(0, 3)
  return uniq.length ? uniq : [3, 7]
}

export async function scheduleDevisReminders(sb: SupabaseClient, input: {
  artisanId: string
  devisId: string
  client: string
  envoyeLe: string
  delays?: number[]
  canal?: string
}) {
  const sentYmd = parisYmd(new Date(input.envoyeLe))
  const rows = reminderDelays(input.delays).map(n => {
    const ymd = addDaysYmd(sentYmd, n)
    return {
      artisan_id: input.artisanId,
      client: input.client,
      type: `Relance devis J+${n}`,
      canal: input.canal || "E-mail",
      statut: "prog",
      date_label: formatRelLabel(n, ymd),
      devis_id: input.devisId,
      scheduled_for: nineParis(ymd),
    }
  })
  const { data: existing } = await sb.from("relances").select("type").eq("devis_id", input.devisId)
  const have = new Set((existing || []).map(r => String((r as { type?: string }).type)))
  const toInsert = rows.filter(r => !have.has(r.type))
  if (toInsert.length) await sb.from("relances").insert(toInsert)
}

export async function stopDevisReminders(sb: SupabaseClient, devisId: string, opts?: { markResponded?: boolean }) {
  await sb.from("relances").update({ statut: "pause" }).eq("devis_id", devisId).eq("statut", "prog")
  if (opts?.markResponded) {
    await sb.from("relances").update({ statut: "rep" }).eq("devis_id", devisId).eq("statut", "env")
  }
}

export function samePhone(a?: string | null, b?: string | null) {
  const norm = (p?: string | null) => (p || "").replace(/\D/g, "").replace(/^33/, "0")
  const x = norm(a), y = norm(b)
  if (!x || !y || x.length < 8 || y.length < 8) return false
  return x === y || x.slice(-9) === y.slice(-9)
}

const euro = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[\u202f\u00a0]/g, " ")} €`
export const formatEuro = euro
export const frDate = (iso?: string | null) => iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("fr-FR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }) : ""

export function factureEmailHtml(input: { client?: string; numero: string; objet?: string; company: string; ttc: number; echeance?: string | null; iban?: string | null; avoir?: boolean }) {
  const who = input.client ? ` ${escapeHtml(input.client)}` : ""
  const what = input.avoir ? "l'avoir" : "la facture"
  return `<p>Bonjour${who},</p>
<p>Veuillez trouver ci-joint ${what} n° ${escapeHtml(input.numero)}${input.objet ? ` concernant « ${escapeHtml(input.objet)} »` : ""}, d'un montant de <strong>${euro(input.ttc)} TTC</strong>.</p>
${!input.avoir && input.echeance ? `<p>Date d'échéance : <strong>${escapeHtml(frDate(input.echeance))}</strong>.</p>` : ""}
${!input.avoir && input.iban ? `<p>Règlement par virement : IBAN ${escapeHtml(input.iban)}</p>` : ""}
<p>Cordialement,<br/>${escapeHtml(input.company)}</p>`
}

/** Modèles de relance d'impayé. Niveau 1 : rappel courtois · 2 : relance · 3 : relance ferme · 4 : mise en demeure. */
export function impayeTemplate(input: { niveau: number; client?: string; numero: string; company: string; ttc: number; echeance?: string | null; pro: boolean; iban?: string | null }) {
  const who = input.client ? ` ${input.client}` : ""
  const due = frDate(input.echeance)
  const penal = input.pro
    ? "\n\nConformément aux articles L441-10 et D441-5 du Code de commerce, tout retard de paiement entraîne des pénalités de retard au taux de trois fois le taux d'intérêt légal ainsi qu'une indemnité forfaitaire pour frais de recouvrement de 40 €."
    : ""
  const pay = input.iban ? `\n\nRèglement possible par virement : IBAN ${input.iban}` : ""
  const sign = `\n\nCordialement,\n${input.company}`
  const amount = euro(input.ttc)
  if (input.niveau <= 1) return {
    sujet: `Rappel — facture n° ${input.numero}`,
    corps: `Bonjour${who},\n\nSauf erreur de notre part, la facture n° ${input.numero} d'un montant de ${amount} TTC, arrivée à échéance le ${due}, reste à régler.\n\nSi le paiement a été effectué entre-temps, merci de ne pas tenir compte de ce message.${pay}${sign}`,
  }
  if (input.niveau === 2) return {
    sujet: `Relance — facture n° ${input.numero} impayée`,
    corps: `Bonjour${who},\n\nNous revenons vers vous au sujet de la facture n° ${input.numero} (${amount} TTC), échue depuis le ${due}, qui demeure impayée à ce jour.\n\nMerci de procéder au règlement dans les meilleurs délais ou de nous contacter en cas de difficulté.${pay}${penal}${sign}`,
  }
  if (input.niveau === 3) return {
    sujet: `Dernière relance avant procédure — facture n° ${input.numero}`,
    corps: `Bonjour${who},\n\nMalgré nos précédentes relances, la facture n° ${input.numero} d'un montant de ${amount} TTC, échue le ${due}, n'a toujours pas été réglée.\n\nNous vous demandons de régulariser cette situation sous 8 jours. À défaut, nous serons contraints d'engager une procédure de recouvrement.${pay}${penal}${sign}`,
  }
  return {
    sujet: `Mise en demeure de payer — facture n° ${input.numero}`,
    corps: `Bonjour${who},\n\nPar la présente, nous vous mettons en demeure de régler sous 8 jours la somme de ${amount} TTC correspondant à la facture n° ${input.numero}, échue le ${due}.\n\nÀ défaut de paiement dans ce délai, nous saisirons la juridiction compétente (injonction de payer) sans autre avis.${penal}${pay}\n\nPour une mise en demeure ayant valeur de preuve, nous vous recommandons de doubler ce message d'un envoi en recommandé avec accusé de réception.${sign}`,
  }
}

export function textToHtml(text: string) {
  return text.split(/\n{2,}/).map(p => `<p>${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`).join("\n")
}

export function simpleHtml(title: string, lines: string[], cta?: { label: string; url: string }) {
  return `<p style="font-size:17px;font-weight:600">${escapeHtml(title)}</p>
${lines.map(l => `<p>${escapeHtml(l)}</p>`).join("\n")}
${cta?.url ? `<p style="margin:24px 0"><a href="${escapeHtml(cta.url)}" style="display:inline-block;background:#111;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600">${escapeHtml(cta.label)}</a></p>` : ""}
<p style="color:#888;font-size:12px">Akno · message automatique</p>`
}

export function monthlyReportHtml(input: { company: string; monthLabel: string; stats: Record<string, number>; appUrl: string }) {
  const s = input.stats
  const rows: [string, string][] = [
    ["Appels reçus par la réceptionniste", String(s.calls || 0)],
    ["Dont urgences", String(s.urgent || 0)],
    ["Rendez-vous pris", String(s.rdv || 0)],
    ["Devis envoyés", String(s.devis_sent || 0)],
    ["Devis acceptés", `${s.devis_accepted || 0} (${euro(s.devis_accepted_ttc || 0)} TTC)`],
    ["Relances envoyées", String(s.relances || 0)],
    ["Factures émises", `${s.factures || 0} (${euro(s.factures_ttc || 0)} TTC)`],
    ["Factures encaissées", euro(s.encaisse_ttc || 0)],
    ["Demandes d'avis envoyées", String(s.avis || 0)],
    ["Demandes arrivées par le site", String(s.leads || 0)],
    ["Minutes de réceptionniste", String(s.minutes || 0)],
  ]
  return `<p style="font-size:20px;font-weight:600">Votre mois avec Akno — ${escapeHtml(input.monthLabel)}</p>
<p>Bonjour ${escapeHtml(input.company)}, voici le résumé de votre activité.</p>
<table style="border-collapse:collapse;width:100%;max-width:520px;font-size:14px">${rows.map(([a, b]) => `<tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#555">${escapeHtml(a)}</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600">${escapeHtml(b)}</td></tr>`).join("")}</table>
${input.appUrl ? `<p style="margin:24px 0"><a href="${escapeHtml(input.appUrl)}" style="display:inline-block;background:#111;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600">Ouvrir Akno</a></p>` : ""}
<p style="color:#888;font-size:12px">Vous recevez ce rapport car il est activé dans Réglages → Rapport mensuel.</p>`
}
