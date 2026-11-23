import { isDuplicateCalBooking } from "../api/_lib/bookingIdem"
import { debriefFromTranscript } from "../src/lib/voice/callDebrief"

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
T("nom extrait", d.nom_client.includes("Marie"))
T("pas « Appel téléphonique » par défaut", d.nom_client !== "Appel téléphonique")
T("résumé structuré", d.resume.includes("fuite") && d.resume.length > 20)

console.log(`\n${ok} OK, ${ko} KO`)
if (ko) process.exit(1)