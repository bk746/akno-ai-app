import { adminClient, appUrl, escapeHtml } from "./_lib/mail.js"
import { verifyTwilioSignature, toE164 } from "./_lib/sms.js"
import { notifyArtisan } from "./_lib/push.js"
import { reportError } from "./_lib/monitoring.js"

/* update48 · Préparation de la vraie ligne téléphonique (débordement), SANS toucher à la
   réceptionniste vocale de l'app (xAI Grok Voice, inchangée).
   - Appel entrant sur le numéro Twilio de l'artisan  → POST /api/twilio?event=voice
     1) fait sonner le portable de l'artisan (forward_to) 20 s ;
     2) s'il ne décroche pas : message d'accueil + annonce d'enregistrement + messagerie ;
     3) le message vocal arrive dans Akno comme un appel (source « téléphone ») + notification.
   - Statuts des SMS envoyés               → POST /api/twilio?event=sms-status
   - SMS reçus (STOP = désinscription)     → POST /api/twilio?event=sms-in
   Toutes les requêtes sont vérifiées avec la signature X-Twilio-Signature. */

const xml = (body: string) => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" } })
const say = (t: string) => `<Say language="fr-FR" voice="Polly.Lea">${escapeHtml(t)}</Say>`

function publicUrl(request: Request) {
  const u = new URL(request.url)
  const base = appUrl()
  // Twilio signe l'URL exacte qu'il a appelée : on reconstruit avec le domaine public si défini.
  return base ? `${base}${u.pathname}${u.search}` : `${request.headers.get("x-forwarded-proto") || u.protocol.replace(":", "")}://${request.headers.get("x-forwarded-host") || u.host}${u.pathname}${u.search}`
}

async function findArtisan(to: string) {
  const sb = adminClient()
  const { data } = await sb.from("artisan_secrets").select("artisan_id, forward_to").eq("twilio_number", toE164(to) || to).maybeSingle()
  if (!data) return null
  const { data: a } = await sb.from("artisans").select("id, entreprise_nom, nom_entreprise, message_accueil").eq("id", data.artisan_id).maybeSingle()
  return { id: String(data.artisan_id), forward: String(data.forward_to || ""), company: a?.entreprise_nom || a?.nom_entreprise || "", accueil: a?.message_accueil || "" }
}

function voicemail(base: string, company: string, accueil: string) {
  const hello = accueil || `Bonjour, vous êtes bien chez ${company || "votre artisan"}. Nous ne pouvons pas répondre pour le moment.`
  return xml(`${say(`${hello} Cet appel peut être enregistré pour le suivi de votre demande. Laissez votre nom, votre numéro et votre besoin après le bip.`)}<Record maxLength="120" playBeep="true" timeout="5" action="${escapeHtml(`${base}/api/twilio?event=voicemail`)}" />${say("Nous n'avons pas reçu de message. Au revoir.")}`)
}

export async function POST(request: Request) {
  const url = new URL(request.url)
  const event = url.searchParams.get("event") || ""
  const raw = await request.text()
  const params = Object.fromEntries(new URLSearchParams(raw))
  const signed = await verifyTwilioSignature(publicUrl(request), params, request.headers.get("x-twilio-signature") || "")
  if (!signed) return new Response("Signature invalide", { status: 403 })
  const base = appUrl() || `${url.protocol}//${url.host}`
  try {
    if (event === "voice") {
      const a = await findArtisan(params.To || "")
      if (!a) return xml(say("Ce numéro n'est pas encore configuré. Au revoir.") + "<Hangup/>")
      if (a.forward) {
        return xml(`<Dial timeout="20" answerOnBridge="true" callerId="${escapeHtml(params.To || "")}" action="${escapeHtml(`${base}/api/twilio?event=voice-fallback`)}"><Number>${escapeHtml(a.forward)}</Number></Dial>`)
      }
      return voicemail(base, a.company, a.accueil)
    }
    if (event === "voice-fallback") {
      if (params.DialCallStatus === "completed") return xml("<Hangup/>")
      const a = await findArtisan(params.To || "")
      return voicemail(base, a?.company || "", a?.accueil || "")
    }
    if (event === "voicemail") {
      const a = await findArtisan(params.To || "")
      if (a && params.RecordingUrl) {
        const sb = adminClient()
        const { data: call } = await sb.from("calls").insert({
          artisan_id: a.id,
          nom_client: "Appel téléphonique",
          telephone_client: params.From || null,
          motif: "Message vocal",
          resume: `Message vocal laissé sur la ligne (${Number(params.RecordingDuration) || 0} s). Écoutez l'enregistrement et rappelez le client.`,
          recording_url: `${params.RecordingUrl}.mp3`,
          duration: Number(params.RecordingDuration) || 0,
          statut: "a_rappeler",
          rappel_souhaite: true,
          source: "telephone",
        }).select("id").maybeSingle()
        await notifyArtisan(a.id, { title: "Nouveau message vocal", body: params.From || "Numéro masqué", url: "/appels", tag: `vm-${call?.id || params.CallSid}` }, 1)
      }
      return xml(say("Merci, votre message a bien été transmis. Au revoir.") + "<Hangup/>")
    }
    if (event === "sms-status") {
      if (params.MessageSid) {
        const st = String(params.MessageStatus || "")
        const status = st === "delivered" ? "delivered" : st === "failed" || st === "undelivered" ? "failed" : "sent"
        await adminClient().from("sms_log").update({ status, ...(params.ErrorCode ? { error: `Twilio ${params.ErrorCode}` } : {}) }).eq("provider_id", params.MessageSid)
      }
      return new Response("", { status: 204 })
    }
    if (event === "sms-in") {
      const body = String(params.Body || "").trim().toUpperCase()
      const from = toE164(params.From) || params.From
      if (from && /^(STOP|STOPP|ARRET|ARRÊT|DESABONNER|UNSUBSCRIBE)\b/.test(body)) {
        await adminClient().from("sms_optout").upsert({ phone: from }, { onConflict: "phone" })
        return xml("<Message>Vous ne recevrez plus de SMS de notre part.</Message>")
      }
      if (from && /^(START|UNSTOP)\b/.test(body)) await adminClient().from("sms_optout").delete().eq("phone", from)
      return xml("")
    }
    return new Response("Événement inconnu", { status: 400 })
  } catch (e) {
    await reportError(e, { route: "twilio", event })
    return event.startsWith("voice") ? xml(say("Une erreur est survenue. Merci de rappeler plus tard.") + "<Hangup/>") : new Response("", { status: 500 })
  }
}
