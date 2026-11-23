/* Extraction des infos client / résumé depuis le transcript d'un appel téléphonique (relais voice-bridge, finish).
   Indépendant du prompt Grok (script.ts inchangé). */

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

export function pickName(lines: DebriefLine[]) {
  const patts = [
    /(?:je m['’]?appelle|mon nom est|c'est|je suis)\s+([A-ZÀ-ÖØ-Þ][\p{L}'-]+(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'-]+){0,2})/iu,
    /(?:nom|prénom)\s*[,:]?\s*([A-ZÀ-ÖØ-Þ][\p{L}'-]+(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'-]+){0,2})/iu,
  ]
  for (const l of lines) {
    if (l.role !== "user") continue
    for (const p of patts) {
      const m = l.text.match(p)
      if (m?.[1] && m[1].length > 2 && !/^(oui|non|bonjour|merci)$/i.test(m[1])) return m[1].trim()
    }
  }
  return ""
}

export function pickAddress(lines: DebriefLine[]) {
  for (const l of [...lines].reverse()) {
    const t = l.text
    if (/^\d+\s+(rue|avenue|boulevard|impasse|place|chemin|allée)/i.test(t) || /\d{5}\s+[A-Za-zÀ-ÿ]/.test(t)) return t.slice(0, 220)
    const m = t.match(/(?:adresse|habite|situé)[^.]*?(\d+[^.]{8,80})/i)
    if (m?.[1]) return m[1].trim()
  }
  return ""
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
  const nom = pickName(lines)
  const tel = pickPhone(lines, from)
  const email = pickEmail(lines)
  const adresse = pickAddress(lines)
  const motif = pickMotif(lines) || "Demande d'intervention"
  const slot = pickSlot(lines)
  const rdv = booked?.start
    ? new Date(booked.start).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
    : slot
  const issue = booked ? `Rendez-vous confirmé${rdv ? ` : ${rdv}` : ""}.` : /pris|indisponible|alternativ/i.test(lines.slice(-4).map(l => l.text).join(" "))
    ? "Créneau demandé : à confirmer avec le client."
    : "À rappeler pour finaliser."
  const resume = [motif, tel ? `Tél. ${tel}` : "", email ? `E-mail ${email}` : "", adresse ? `Adresse : ${adresse}` : "", rdv || slot ? `Créneau : ${rdv || slot}` : "", issue]
    .filter(Boolean).join(" · ").slice(0, 600)
  const nom_client = nom || (tel ? tel : from ? "Appelant" : "Appel téléphonique")
  const type_demande = /devis/i.test(norm(lines.map(l => l.text).join(" "))) ? "devis" : "autre"
  return {
    nom_client, telephone_client: tel || from || "", email_client: email, adresse, ville: "",
    motif, resume, besoin_detail: motif, type_demande,
    rappel_souhaite: !booked,
  }
}