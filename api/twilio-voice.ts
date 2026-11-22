import { adminClient, appUrl, env } from "./_lib/mail.js"
import { verifyTwilioSignature, toE164 } from "./_lib/sms.js"
import { can, loadEntitlements } from "./_lib/plans.js"
import { monthKey, usage } from "./_lib/limits.js"
import { reportError } from "./_lib/monitoring.js"
import { bridgeStreamUrl, connectStreamTwiml, sayHangup, signBridgeToken } from "./_lib/twilioVoice.js"

/* update56 · Vrais appels : la réceptionniste IA (xAI Grok Voice) décroche sur le numéro Akno.
   L'artisan active sur son portable un renvoi CONDITIONNEL (non-réponse / occupé / injoignable)
   vers son numéro Akno : son téléphone sonne normalement, l'IA ne prend que les appels manqués.
   - POST /api/twilio-voice               → appel entrant (voice_url du numéro Twilio) : TwiML <Connect><Stream>
   - POST /api/twilio-voice?event=status  → fin d'appel (status_callback) : durée + numéro dans « calls »
   Un seul fichier pour rester sous la limite de 12 fonctions du plan Vercel Hobby.
   Toutes les requêtes sont vérifiées avec X-Twilio-Signature (TWILIO_AUTH_TOKEN). */

const twiml = (body: string) => new Response(body, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" } })

function publicUrl(request: Request) {
  const u = new URL(request.url)
  const base = appUrl()
  return base ? `${base}${u.pathname}${u.search}` : `${request.headers.get("x-forwarded-proto") || u.protocol.replace(":", "")}://${request.headers.get("x-forwarded-host") || u.host}${u.pathname}${u.search}`
}

/** Numéro appelé → artisan : table artisan_phone_numbers (update56), sinon artisan_secrets.twilio_number (update48). */
export async function artisanForNumber(to: string): Promise<string | null> {
  const num = toE164(to) || to
  if (!num) return null
  const sb = adminClient()
  const { data } = await sb.from("artisan_phone_numbers").select("artisan_id").eq("phone_number", num).eq("active", true).maybeSingle()
  if (data?.artisan_id) return String(data.artisan_id)
  const { data: old } = await sb.from("artisan_secrets").select("artisan_id").eq("twilio_number", num).maybeSingle()
  return old?.artisan_id ? String(old.artisan_id) : null
}

async function incoming(p: Record<string, string>) {
  const artisanId = await artisanForNumber(p.To || "")
  if (!artisanId) return sayHangup("Bonjour, ce numéro n'est pas encore activé. Merci de rappeler plus tard. Au revoir.")
  const ent = await loadEntitlements(adminClient(), artisanId)
  if (!can(ent, "reception")) return sayHangup("Bonjour, l'assistante n'est pas disponible pour le moment. Merci de rappeler plus tard ou de laisser un message à l'entreprise par un autre moyen. Au revoir.")
  // update74 · même règle as ReceptionConfig.enabled (absent = l'IA répond). En cas d'erreur lecture, on laisse l'appel passer.
  const { data: rec, error: recErr } = await adminClient().from("artisans").select("reception_config").eq("id", artisanId).maybeSingle()
  const raw = rec?.reception_config
  const iaOn = !raw || typeof raw !== "object" || Array.isArray(raw) || (raw as { enabled?: unknown }).enabled !== false
  if (!recErr && rec && !iaOn) return sayHangup("Bonjour, l'assistante n'est pas disponible pour le moment. Merci de rappeler plus tard ou de laisser un message à l'entreprise par un autre moyen. Au revoir.")
  if (ent.quotas.voice_minutes > 0 && await usage(artisanId, "voice_seconds", monthKey()) >= ent.quotas.voice_minutes * 60) {
    return sayHangup("Bonjour, l'assistante a atteint sa limite d'appels ce mois-ci. Merci de rappeler l'entreprise un peu plus tard. Au revoir.")
  }
  const url = bridgeStreamUrl(), secret = (env("BRIDGE_SECRET") || "").trim()
  if (!url || !secret) return sayHangup("Bonjour, l'assistante est en cours d'installation. Merci de rappeler plus tard. Au revoir.")
  const callSid = p.CallSid || ""
  const exp = Math.floor(Date.now() / 1000) + 120
  const token = await signBridgeToken(secret, artisanId, callSid, exp)
  return connectStreamTwiml(url, { artisan_id: artisanId, call_sid: callSid, from: p.From || "", exp: String(exp), token })
    // Après la fin du flux (le relais raccroche), rien d'autre : l'appel se termine.
}

async function status(p: Record<string, string>) {
  const st = p.CallStatus || ""
  if (!["completed", "busy", "no-answer", "failed", "canceled"].includes(st) || !p.CallSid) return
  const artisanId = await artisanForNumber(p.To || "")
  if (!artisanId) return
  const sb = adminClient()
  const duration = Math.max(0, Number(p.CallDuration) || 0)
  // Upsert minimal : si le relais a déjà enregistré la fiche, on ne touche qu'à la durée et au numéro.
  const { data } = await sb.from("calls").upsert({
    artisan_id: artisanId, twilio_call_sid: p.CallSid, telephone_client: p.From || null, duration, source: "ia_telephone",
  }, { onConflict: "twilio_call_sid" }).select("id, resume").maybeSingle()
  if (data && !data.resume) {
    // Le relais n'a rien enregistré (appel trop court, coupure) : fiche « à rappeler ».
    await sb.from("calls").update({
      nom_client: "Appel téléphonique", motif: "Appel", statut: "a_rappeler", rappel_souhaite: true, urgence: "normal", type_demande: "autre",
      resume: `Appel de ${p.From || "numéro masqué"} (${duration} s), sans informations recueillies par l'assistante. Rappelez le client.`,
    }).eq("id", data.id).is("resume", null)
  }
}

export async function POST(request: Request) {
  const url = new URL(request.url)
  const event = url.searchParams.get("event") || "voice"
  const raw = await request.text()
  const params = Object.fromEntries(new URLSearchParams(raw))
  const signed = await verifyTwilioSignature(publicUrl(request), params, request.headers.get("x-twilio-signature") || "")
  if (!signed) return new Response("Signature invalide", { status: 403 })
  try {
    if (event === "status") { await status(params); return new Response("", { status: 204 }) }
    return twiml(await incoming(params))
  } catch (e) {
    await reportError(e, { route: "twilio-voice", event })
    return event === "status" ? new Response("", { status: 500 }) : twiml(sayHangup("Une erreur est survenue. Merci de rappeler dans quelques minutes. Au revoir."))
  }
}
