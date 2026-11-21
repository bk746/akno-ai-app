import type { SupabaseClient } from "@supabase/supabase-js"
import { adminClient, appUrl, env } from "./mail.js"
import { consume, monthKey } from "./limits.js"

export type SmsKind = "rappel_rdv" | "relance_devis" | "relance_facture" | "avis" | "lead" | "test" | "invite_equipe"
export type SmsResult = { ok: true; id?: string } | { ok: false; skipped?: boolean; error: string }

/** SMS réels via Twilio, actifs seulement si les variables Twilio sont renseignées. */
export function smsConfigured() {
  return !!(env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN") && (env("TWILIO_MESSAGING_SERVICE_SID") || env("TWILIO_FROM")))
}

export function toE164(raw?: string | null) {
  if (!raw) return ""
  const d = raw.replace(/[^\d+]/g, "")
  if (d.startsWith("+") && d.length >= 10) return d
  if (d.startsWith("0033")) return `+${d.slice(2)}`
  if (d.startsWith("33") && d.length === 11) return `+${d}`
  if (/^0[1-9]\d{8}$/.test(d)) return `+33${d.slice(1)}`
  return ""
}

/** Nom d'expéditeur alphanumérique (11 caractères max, lettres/chiffres/espaces, au moins une lettre). */
export function senderName(raw?: string | null) {
  const s = (raw || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 ]/g, "").trim().slice(0, 11).trim()
  return /[A-Za-z]/.test(s) ? s : ""
}

export function isMobileFr(e164: string) {
  return /^\+33[67]\d{8}$/.test(e164)
}

export async function sendSms(sb: SupabaseClient, input: { artisanId: string; to?: string | null; body: string; kind: SmsKind; sender?: string | null }): Promise<SmsResult> {
  if (!smsConfigured()) return { ok: false, skipped: true, error: "SMS non configurés (variables TWILIO_* manquantes)." }
  const to = toE164(input.to)
  if (!to) return { ok: false, skipped: true, error: "Numéro de téléphone invalide." }
  const { data: optout } = await sb.from("sms_optout").select("phone").eq("phone", to).maybeSingle()
  if (optout) return { ok: false, skipped: true, error: "Ce client a demandé à ne plus recevoir de SMS (STOP)." }

  const sid = env("TWILIO_ACCOUNT_SID")!, token = env("TWILIO_AUTH_TOKEN")!
  const service = (env("TWILIO_MESSAGING_SERVICE_SID") || "").trim()
  const fromNumber = (env("TWILIO_FROM") || "").trim()
  const alpha = senderName(input.sender) || senderName(env("TWILIO_SENDER_NAME"))
  let body = input.body.trim()
  // Avec un expéditeur numérique, le client peut répondre STOP : on le rappelle pour les messages non urgents.
  if (!alpha && (input.kind === "avis" || input.kind === "relance_devis")) body += "\nSTOP : répondez STOP"
  const form = new URLSearchParams({ To: to, Body: body.slice(0, 900) })
  if (service) form.set("MessagingServiceSid", service)
  if (alpha) form.set("From", alpha)
  else if (!service && fromNumber) form.set("From", fromNumber)
  const base = appUrl()
  if (base) form.set("StatusCallback", `${base}/api/twilio?event=sms-status`)

  const { data: log } = await sb.from("sms_log").insert({ artisan_id: input.artisanId, kind: input.kind, to_number: to, body, status: "queued" }).select("id").maybeSingle()
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    })
    const payload = await r.json().catch(() => ({})) as { sid?: string; message?: string; num_segments?: string; status?: string }
    if (!r.ok) {
      if (log?.id) await sb.from("sms_log").update({ status: "failed", error: String(payload.message || r.status).slice(0, 300) }).eq("id", log.id)
      return { ok: false, error: "Le SMS n'a pas pu être envoyé." }
    }
    if (log?.id) await sb.from("sms_log").update({ status: "sent", provider_id: payload.sid || null, segments: Number(payload.num_segments) || null }).eq("id", log.id)
    return { ok: true, id: payload.sid }
  } catch {
    if (log?.id) await sb.from("sms_log").update({ status: "failed", error: "network" }).eq("id", log.id)
    return { ok: false, error: "Le SMS n'a pas pu être envoyé." }
  }
}

/** Vérifie X-Twilio-Signature (HMAC-SHA1 de l'URL complète + paramètres POST triés). */
export async function verifyTwilioSignature(url: string, params: Record<string, string>, signature: string) {
  const token = env("TWILIO_AUTH_TOKEN")
  if (!token || !signature) return false
  const data = url + Object.keys(params).sort().map(k => k + params[k]).join("")
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(token), { name: "HMAC", hash: "SHA-1" }, false, ["sign"])
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))
  let bin = ""
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b)
  const expected = btoa(bin)
  if (expected.length !== signature.length) return false
  let r = 0
  for (let i = 0; i < expected.length; i++) r |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return r === 0
}

/** Envoi avec le client service_role + décompte du quota SMS mensuel de l'offre. */
export async function sendSmsMetered(input: { artisanId: string; to?: string | null; body: string; kind: SmsKind; sender?: string | null }, monthlyQuota: number): Promise<SmsResult> {
  if (!smsConfigured()) return { ok: false, skipped: true, error: "SMS non configurés (variables TWILIO_* manquantes)." }
  let admin: SupabaseClient
  try { admin = adminClient() } catch { return { ok: false, skipped: true, error: "SUPABASE_SERVICE_ROLE_KEY manquante : SMS désactivés." } }
  if (!await consume(input.artisanId, "sms", monthKey(), monthlyQuota)) return { ok: false, skipped: true, error: "Quota de SMS du mois atteint." }
  return sendSms(admin, input)
}
