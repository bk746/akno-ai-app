import { isDuplicateCalBooking } from "../api/_lib/bookingIdem"
import { UNKNOWN_CLIENT, cleanAddress, cleanClientName, closingLine, debriefFromTranscript, rdvNote, rdvShort, sameUtterance } from "../src/lib/voice/callDebrief"
import { payloadFrom } from "../api/_lib/pushPayload"

let ok = 0, ko = 0
const T = (name: string, pass: boolean) => { pass ? ok++ : ko++; console.log(`${pass ? "✔" : "✘"} ${name}`) }

T("409 = duplicate Cal.com", isDuplicateCalBooking(409, "error") === true)
T("already has a booking", isDuplicateCalBooking(400, "User already has a booking") === true)
T("not available ≠ duplicate", isDuplicateCalBooking(400, "Slot not available") === false)

const lines = [
  { role: "user" as const, text: "Bonjour, je m'appelle Marie Dupont" },
  { role: "assistant" as const, text: "Bonjour, comment puis-je vous aider ?" },
  { role: "user" as const, text: "J'ai une fuite sous l'évier" },
  { role: "user" as const, text: "Mon numéro c'est 06 12 34 56 78" },
]
const d = debriefFromTranscript(lines, "+33123456789", { start: "2026-11-27T13:00:00.000Z" })
// Appel 44 : le nom n'est plus deviné dans la transcription (« c'est quelle voie là » devenait le nom du client).
T("bilan de secours : nom jamais deviné dans la transcription", d.nom_client === UNKNOWN_CLIENT)
T("bilan de secours : adresse jamais devinée", debriefFromTranscript([{ role: "user", text: "17 allée Paul Gauguin. Gauguin, c'est G A U G U I N." }], "+33123456789").adresse === "")
T("bilan de secours : téléphone dicté, sinon numéro de l'appelant", d.telephone_client === "+33612345678" && debriefFromTranscript([{ role: "user", text: "Euh, c'est quelle voie là ?" }], "+33781990761").telephone_client === "+33781990761")
T("résumé structuré", d.resume.includes("fuite") && d.resume.length > 20)

T("nom de save_call gardé tel quel", cleanClientName(" Keryan  Bouzerda ") === "Keryan Bouzerda" && cleanClientName("Jean-Pierre de La Fontaine") === "Jean-Pierre de La Fontaine" && cleanClientName("O'Brien") === "O'Brien")
T("une phrase n'est jamais un nom", ["quelle voie là ?", "c'est quelle voie là", "Je ne sais pas", "euh bonjour"].every(x => cleanClientName(x) === ""))
T("nom absent ou générique → inconnu", ["", "inconnu", "Client inconnu", "non communiqué", "Appel téléphonique", "+33781990761", "07 81 99 07 61", "Madame"].every(x => cleanClientName(x) === ""))
T("adresse sans l'épellation dictée", cleanAddress("17 allée Paul Gauguin. Gauguin, c'est G A U G U I N.") === "17 allée Paul Gauguin" && cleanAddress("12 B rue des Lilas, bât. C") === "12 B rue des Lilas, bât. C" && cleanAddress("") === "")
T("RDV en heure de Paris : mardi 24/11 à 8h30", rdvShort("2026-11-24T07:30:00+00:00") === "mardi 24/11 à 8h30" && rdvShort("2026-07-03T07:00:00Z") === "vendredi 03/07 à 9h" && rdvShort("") === "")
T("phrase de fin unique", closingLine("2026-11-24T07:30:00+00:00") === "C'est noté, rendez-vous confirmé mardi à 8 h 30. Merci, au revoir.")
T("note de la fiche quand le RDV est créé", rdvNote("2026-11-24T07:30:00+00:00") === "Rendez-vous confirmé mardi 24/11 à 8h30.")
T("transcription : partielle et finale = même tour", sameUtterance("Euh, c'est", "Euh, c'est quelle voie là ?") && sameUtterance("Oui, bonjour.", "Oui, bonjour.") && sameUtterance("Euh, ouais, je.", "Euh ouais, j'ai plus de chauffage") && !sameUtterance("C'est ça.", "17 allée") && !sameUtterance("Oui.", "Non."))

// Notification push d'un appel (api/notify)
const push = (b: Record<string, unknown>) => payloadFrom({ type: "call", call_id: 44, ...b })
const withRdv = push({ client: "Keryan Bouzerda", motif: "Chaudière en panne", resume: "Plus de chauffage.", rdv_start: "2026-11-24T07:30:00+00:00" })
T("push · titre « Nouvel appel · Prénom Nom »", withRdv?.title === "Nouvel appel · Keryan Bouzerda")
T("push · RDV créé : « RDV mardi 24/11 à 8h30 · Chaudière en panne »", withRdv?.body === "RDV mardi 24/11 à 8h30 · Chaudière en panne" && withRdv?.tag === "call-44")
T("push · pas de RDV : « À rappeler · motif »", push({ client: "Marie Dupont", motif: "fuite sous évier", rappel_souhaite: true })?.body === "À rappeler · Fuite sous évier")
T("push · créneau de rappel conservé", push({ client: "Marie Dupont", motif: "Devis", rappel_souhaite: true, rappel_creneau: "demain matin" })?.body === "À rappeler (demain matin) · Devis")
T("push · ni RDV ni rappel : le motif, sinon le résumé", push({ client: "Marie Dupont", motif: "Renseignement" })?.body === "Renseignement" && push({ client: "Marie Dupont", resume: "Question sur un devis." })?.body === "Question sur un devis.")
T("push · urgence signalée sans changer le titre", push({ client: "Marie Dupont", motif: "Fuite", urgent: true, rappel_souhaite: true })?.title === "Nouvel appel · Marie Dupont" && push({ client: "Marie Dupont", motif: "Fuite", urgent: true, rappel_souhaite: true })?.body === "URGENT · À rappeler · Fuite")
T("push · pas de nom : « Client inconnu » + téléphone", push({ client: "Client inconnu", telephone: "+33781990761", motif: "Renseignement" })?.title === "Nouvel appel · Client inconnu · 07 81 99 07 61" && push({ client: "quelle voie là ?", motif: "x" })?.title === "Nouvel appel · Client inconnu")

console.log(`\n${ok} OK, ${ko} KO`)
if (ko) process.exit(1)