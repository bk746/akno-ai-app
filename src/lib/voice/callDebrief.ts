/* Fiche d'un appel téléphonique (relais voice-bridge) : nom et adresse fiables, libellés du rendez-vous,
   et bilan de secours quand l'IA n'a pas pu appeler save_call (appelant qui raccroche).
   Le nom et l'adresse ne sont JAMAIS devinés dans la transcription : ils viennent de save_call
   (ou, à défaut, de book_appointment). Indépendant du prompt Grok (script.ts inchangé). */

export type DebriefLine = { role: "user" | "assistant"; text: string }

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim()

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i
const PHONE_DICT = /(?:zéro|zero|\d)[\s.\-·,]*(zéro|zero|un|deux|trois|quatre|cinq|six|sept|huit|neuf|\d)/gi
const SLOT = /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain)?\s*(?:\d{1,2}\s*(?:\/|janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s*\d{0,4})?\s*(?:à\s*)?(\d{1,2})\s*(?:h|heures?)\s*(\d{0,2})?/i

export function pickEmail(lines: DebriefLine[]) {
  for (const l of [...lines].reverse()) {
    const m = l.text.match(EMAIL)
    if (m) return m[0].toLowerCase()
  }
  return ""
}

export function pickPhone(lines: DebriefLine[], fallbackFrom = "") {
  for (const l of [...lines].reverse()) {
    const digits = l.text.replace(/[^\d+]/g, "")
    if (digits.length >= 10) {
      let d = digits.replace(/^00/, "+")
      if (/^0[1-9]\d{8}$/.test(d)) d = `+33${d.slice(1)}`
      if (/^\+33\d{9}$/.test(d) || /^0[1-9]\d{8}$/.test(d)) return d.startsWith("+") ? d : `+33${d.slice(1)}`
    }
  }
  const fb = fallbackFrom.replace(/[^\d+]/g, "")
  if (fb.length >= 11 && fb.startsWith("+")) return fb
  return ""
}

/** Nom affiché quand l'appelant n'a pas donné le sien. Le téléphone reste dans telephone_client. */
export const UNKNOWN_CLIENT = "Client inconnu"
export const isUnknownClient = (v: unknown) => /^(client inconnu|inconnue?|appelant|appel téléphonique|appel test)?$/i.test(String(v ?? "").trim())

const NOT_A_NAME = /^(?:client|cliente|inconnue?|anonyme|appelant|appelante|n\/?a|non (?:communiqu|renseign|pr[ée]cis|donn|fourni|identifi)\p{L}*|pas (?:de nom|donn[ée]|communiqu[ée])|aucun|nom|pr[ée]nom|monsieur|madame|m\.|mme)$/iu

/** Nom donné par l'IA dans save_call / book_appointment : prénom + nom, ou "" si ce n'est pas un nom
    (vide, « inconnu », numéro, phrase). Jamais une phrase dans la fiche. */
export function cleanClientName(raw: unknown) {
  const s = String(raw ?? "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").replace(/^[\s,;:.\-–—]+|[\s,;:\-–—]+$/g, "").trim()
  if (!s || s.length > 60) return ""
  if (NOT_A_NAME.test(s) || isUnknownClient(s)) return ""
  if (!/\p{L}{2}/u.test(s)) return "" // numéro de téléphone, initiale seule
  if (/[?!…«»"()@]|\d{3}/.test(s)) return ""
  const words = norm(s).split(" ")
  if (words.length > 5) return ""
  // Début ou morceau de phrase (« c'est quelle voie là », « je ne sais pas ») : ce n'est pas un nom.
  if (/^(c'est|c’est|cest|ce|je|j'|j’|il|elle|on|quel|quelle|quoi|oui|non|euh|heu|bonjour|bonsoir|allo|merci|pour|alors|ben|bah|voila)$/.test(words[0]) || words.some(w => /^(est|suis|sais|pas|c'est|c’est|m'appelle|m’appelle)$/.test(w) && words.length > 2)) return ""
  return s
}

/** Adresse donnée par l'IA : espaces normalisés, sans l'épellation dictée (« Gauguin, c'est G A U G U I N »). */
export function cleanAddress(raw: unknown) {
  let s = String(raw ?? "").replace(/\s+/g, " ").trim()
  const spelled = s.search(/(?:(?<![\p{L}\d'’])\p{L}[\s,.\-]+){3,}/u)
  if (spelled > 0) {
    const head = s.slice(0, spelled), dot = head.lastIndexOf(".")
    s = dot > 5 ? head.slice(0, dot) : head
  }
  return s.replace(/[\s,;:.\-–—]+$/g, "").slice(0, 200)
}

const rdvParts = (iso: string) => {
  const d = new Date(iso)
  if (!iso || Number.isNaN(d.getTime())) return null
  const parts = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "2-digit", month: "2-digit", hour: "numeric", minute: "2-digit", hourCycle: "h23" }).formatToParts(d)
  const g = (t: string) => parts.find(x => x.type === t)?.value || ""
  return { weekday: g("weekday"), day: g("day"), month: g("month"), hour: String(Number(g("hour"))), minute: g("minute") }
}

/** « mardi 24/11 à 8h30 » (heure de Paris) — notification push et note de la fiche. */
export function rdvShort(iso: string) {
  const p = rdvParts(iso)
  return p ? `${p.weekday} ${p.day}/${p.month} à ${p.hour}h${p.minute === "00" ? "" : p.minute}` : ""
}

/** « mardi à 8 h 30 » (heure de Paris) — forme dite à voix haute. */
export function rdvSpoken(iso: string) {
  const p = rdvParts(iso)
  return p ? `${p.weekday} à ${p.hour} h${p.minute === "00" ? "" : ` ${p.minute}`}` : ""
}

/** Unique phrase de fin d'un appel dont le rendez-vous est créé. */
export function closingLine(rdvIso: string) {
  const when = rdvSpoken(rdvIso)
  return `C'est noté, rendez-vous confirmé${when ? ` ${when}` : ""}. Merci, au revoir.`
}

/** Note de la fiche d'appel quand le rendez-vous est créé. */
export function rdvNote(rdvIso: string) {
  const when = rdvShort(rdvIso)
  return `Rendez-vous confirmé${when ? ` ${when}` : ""}.`
}

/** Deux transcriptions du même tour de parole (la partielle puis la finale, ou la finale reçue deux fois). */
export function sameUtterance(a: string, b: string) {
  const x = norm(a).replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim(), y = norm(b).replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim()
  if (!x || !y) return false
  let i = 0
  const short = Math.min(x.length, y.length)
  while (i < short && x[i] === y[i]) i++
  return i === short || i >= Math.max(3, Math.ceil(short * 0.6))
}

function pickMotif(lines: DebriefLine[]) {
  const user = lines.filter(l => l.role === "user").map(l => l.text).join(" ")
  const m = user.match(/(?:fuite|chaudière|ballon|dépannage|devis|robinet|évier|salle de bain|chauffage|électricité|plomberie|rénovation)[^.!?]{0,80}/i)
  return m ? m[0].trim() : ""
}

function pickSlot(lines: DebriefLine[]) {
  for (const l of [...lines].reverse()) {
    const m = l.text.match(SLOT)
    if (m) return [m[1], m[2], m[3]].filter(Boolean).join(" ").replace(/\s+/g, " ").trim()
  }
  return ""
}

export type DebriefFields = {
  nom_client: string; telephone_client: string; email_client: string; adresse: string
  ville: string; motif: string; resume: string; besoin_detail: string; type_demande: string; rappel_souhaite: boolean
}

export function debriefFromTranscript(lines: DebriefLine[], from: string, booked?: { start: string } | null): DebriefFields {
  // Bilan de secours (save_call jamais appelé). Ni nom ni adresse : on ne les devine pas dans la transcription.
  const tel = pickPhone(lines, from)
  const email = pickEmail(lines)
  const motif = pickMotif(lines) || "Demande d'intervention"
  const slot = pickSlot(lines)
  const rdv = booked?.start
    ? new Date(booked.start).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
    : slot
  const issue = booked ? `Rendez-vous confirmé${rdv ? ` : ${rdv}` : ""}.` : /pris|indisponible|alternativ/i.test(lines.slice(-4).map(l => l.text).join(" "))
    ? "Créneau demandé : à confirmer avec le client."
    : "À rappeler pour finaliser."
  const resume = [motif, tel ? `Tél. ${tel}` : "", email ? `E-mail ${email}` : "", !booked && slot ? `Créneau : ${slot}` : "", issue]
    .filter(Boolean).join(" · ").slice(0, 600)
  const type_demande = /devis/i.test(norm(lines.map(l => l.text).join(" "))) ? "devis" : "autre"
  return {
    nom_client: UNKNOWN_CLIENT, telephone_client: tel || from || "", email_client: email, adresse: "", ville: "",
    motif, resume, besoin_detail: motif, type_demande,
    rappel_souhaite: !booked,
  }
}
