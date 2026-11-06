import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export type Json = Record<string, unknown>
const TZ = "Europe/Paris"

export const env = (name: string) => (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name]
export const DEFAULT_REVIEW_URL = "https://g.page/r/CUFA_AEl10CzECE/review"

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

export function resendFrom() {
  return (env("RESEND_FROM") || "Akno <onboarding@resend.dev>").trim()
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
  attachments?: { filename: string; content: string }[]
}): Promise<{ ok: true } | { ok: false; missingKey?: boolean; error: string }> {
  const key = env("RESEND_API_KEY")
  if (!key) {
    return { ok: false, missingKey: true, error: "L'envoi d'e-mail n'est pas configuré (RESEND_API_KEY manquante)." }
  }
  const payload: Json = { from: resendFrom(), to: [input.to], subject: input.subject, html: input.html }
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

export function reminderEmailHtml(input: { client?: string; numero: string; objet?: string; company: string; acceptUrl: string; wave: 3 | 7 }) {
  const who = input.client ? ` ${escapeHtml(input.client)}` : ""
  const intro = input.wave === 3
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

export async function scheduleDevisReminders(sb: SupabaseClient, input: {
  artisanId: string
  devisId: string
  client: string
  envoyeLe: string
}) {
  const sentYmd = parisYmd(new Date(input.envoyeLe))
  const rows = [3, 7].map(n => {
    const ymd = addDaysYmd(sentYmd, n)
    return {
      artisan_id: input.artisanId,
      client: input.client,
      type: `Relance devis J+${n}`,
      canal: "E-mail",
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
