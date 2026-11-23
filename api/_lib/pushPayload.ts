/* Contenu des notifications push (appel, rendez-vous, test). Module pur : aucun accès réseau ni base. */
import { cleanClientName, rdvShort, UNKNOWN_CLIENT } from "../../src/lib/voice/callDebrief.js"
import { formatPhonePairs } from "../../src/lib/phone.js"
import type { PushPayload } from "./push.js"

type Json = Record<string, unknown>

function shortDebrief(body: Json) {
  const raw = [body.resume, body.besoin_detail, body.motif, body.body]
    .map(v => typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "")
    .find(Boolean) || ""
  if (raw.length <= 120) return raw
  const cut = raw.slice(0, 117)
  const sp = cut.lastIndexOf(" ")
  return `${(sp > 80 ? cut.slice(0, sp) : cut).trim()}…`
}

const capFirst = (v: string) => v ? v.charAt(0).toUpperCase() + v.slice(1) : v

export function payloadFrom(body: Json): PushPayload | null {
  const type = String(body.type || "")
  if (type === "test") {
    return {
      title: "Test de notification",
      body: "Si vous voyez ceci, les notifications Akno fonctionnent.",
      url: "/parametres",
      tag: "akno-test",
    }
  }
  if (type === "call") {
    // Titre : « Nouvel appel · Prénom Nom » (sans nom : « Client inconnu » + téléphone, jamais une phrase).
    // Corps : « RDV mardi 24/11 à 8h30 · motif » si le rendez-vous est créé, sinon « À rappeler · motif ».
    const name = cleanClientName(body.client)
    const phone = name ? "" : formatPhonePairs(typeof body.telephone === "string" ? body.telephone : "")
    const who = name || [UNKNOWN_CLIENT, phone].filter(Boolean).join(" · ")
    const urgent = body.urgent === true || body.urgence === "urgent" || body.type_demande === "urgence"
    const rappel = body.rappel_souhaite === true
    const creneau = String(body.rappel_creneau || "").trim()
    const rdv = typeof body.rdv_start === "string" ? rdvShort(body.rdv_start) : ""
    const motif = capFirst(String(body.motif || "").replace(/\s+/g, " ").trim()).slice(0, 90)
    const lead = rdv ? `RDV ${rdv}` : rappel ? (creneau ? `À rappeler (${creneau})` : "À rappeler") : ""
    const detail = motif || shortDebrief(body)
    return {
      title: `Nouvel appel · ${who}`,
      body: [urgent ? "URGENT" : "", lead, detail].filter(Boolean).join(" · ") || "Nouvel appel",
      url: "/reception",
      tag: `call-${body.call_id || Date.now()}`,
    }
  }
  if (type === "appointment") {
    const client = String(body.client || "Client")
    const when = String(body.when || "Nouveau rendez-vous")
    return { title: "Nouveau rendez-vous", body: `${client} · ${when}`, url: "/agenda", tag: `rdv-${body.appointment_id || Date.now()}` }
  }
  return null
}
