/* update78 · SMS agenda : confirmation, rappel veille, « on arrive ». Désactivés proprement sans clés Twilio. */
import type { SupabaseClient } from "@supabase/supabase-js"
import { sendSms, smsConfigured, type SmsKind } from "./sms.js"
import { consume, monthKey } from "./limits.js"
import { loadEntitlements } from "./plans.js"

const TZ = "Europe/Paris"

function companyOf(a: Record<string, unknown> | null | undefined) {
  return String(a?.entreprise_nom || a?.nom_entreprise || a?.sms_sender || "Votre artisan").trim() || "Votre artisan"
}

function hourOf(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })
}

function placeOf(apt: { adresse?: string | null; ville?: string | null }) {
  const p = [apt.adresse, apt.ville].filter(Boolean).join(", ")
  return p ? ` (${p})` : ""
}

export function confirmSmsText(company: string, startIso: string, apt: { adresse?: string | null; ville?: string | null }, tel?: string) {
  return `${company} : rendez-vous confirmé ${hourLabel(startIso)}${placeOf(apt)}.${tel ? ` Un empêchement ? Appelez le ${tel}.` : ""}`
}

export function eveSmsText(company: string, startIso: string, apt: { adresse?: string | null; ville?: string | null }, tel?: string) {
  return `${company} : rappel de votre rendez-vous demain à ${hourOf(startIso)}${placeOf(apt)}.${tel ? ` Un empêchement ? Appelez le ${tel}.` : ""}`
}

export function onArriveSmsText(company: string, etaMin?: number | null, who?: string) {
  const eta = etaMin && etaMin > 0 ? `dans environ ${Math.max(5, Math.round(etaMin / 5) * 5)} min` : "sous peu"
  const from = (who || "").trim() || "Nous"
  return `${company} : ${from} arrivons ${eta}.`
}

function hourLabel(iso: string) {
  const d = new Date(iso)
  const day = d.toLocaleDateString("fr-FR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" })
  return `le ${day} à ${hourOf(iso)}`
}

export async function artisanSmsOn(sb: SupabaseClient, artisanId: string) {
  const { data } = await sb.from("artisans").select("sms_enabled, sms_sender, entreprise_nom, nom_entreprise, entreprise_telephone, telephone, agenda_sms").eq("id", artisanId).maybeSingle()
  const a = (data || null) as { sms_enabled?: boolean; sms_sender?: string | null; entreprise_nom?: string | null; nom_entreprise?: string | null; entreprise_telephone?: string | null; telephone?: string | null; agenda_sms?: boolean | null } | null
  if (!a) return { on: false as const, artisan: null }
  // agenda_sms : si la colonne n'est pas encore là, on laisse le comportement historique (activé)
  const on = a.agenda_sms !== false && a.sms_enabled !== false
  return { on, artisan: a }
}

/** Envoi unique. Sans clés Twilio, ou si SMS / agenda_sms désactivés : skipped, pas d'erreur bloquante. */
export async function sendAptSms(
  sb: SupabaseClient,
  artisanId: string,
  to: string | null | undefined,
  body: string,
  kind: Extract<SmsKind, "rappel_rdv" | "confirm_rdv" | "on_arrive">,
): Promise<{ ok: boolean; skipped?: boolean }> {
  if (!smsConfigured() || !to) return { ok: false, skipped: true }
  const { on, artisan } = await artisanSmsOn(sb, artisanId)
  if (!on || !artisan) return { ok: false, skipped: true }
  try {
    const ent = await loadEntitlements(sb, artisanId)
    if (!await consume(artisanId, "sms", monthKey(), ent.quotas.sms)) return { ok: false, skipped: true }
  } catch { /* quota illisible : on tente quand même une fois, sendSms gère le reste */ }
  const r = await sendSms(sb, { artisanId, to, body, kind, sender: artisan.sms_sender || companyOf(artisan) })
  return { ok: r.ok, skipped: r.ok ? undefined : ("skipped" in r ? r.skipped : undefined) }
}

export { companyOf, hourOf }
