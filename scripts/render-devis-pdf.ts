// update73 · rendu du gabarit de devis (court et long, 2+ pages) pour contrôle visuel et test : npm run test:devis-pdf
import { writeFileSync, mkdirSync } from "node:fs"
import { CO, type DDoc } from "../src/lib/devisDoc"
import { makePdf } from "../src/lib/devisPdf"
const OUT = process.env.OUT || "/tmp/akno-devis-pdf"; mkdirSync(OUT, { recursive: true })
Object.assign(CO, { name: "Alpes Rénovation Annecy", owner: "Keryan", form: "SARL", capital: "10 000 €", addr: "3 rue Royale", city: "74000 Annecy", phone: "04 50 00 00 00", email: "contact@alpes-renovation.fr", siret: "99999900600003", tva: "FR12999999006", rm: "RM 740 999 999", ape: "4322A", mediateur: "CM2C, 14 rue Saint-Jean, 75017 Paris", conditions: "Solde à la réception des travaux", accent: "#2F6BFF" })
Object.assign(CO.ins, { by: "MAAF Pro", pol: "DEC-123456", zone: "France métropolitaine", addr: "Chaban, 79180 Chauray" })
const base = { date: "22/11/2026", valid: "22/12/2026", validite: 30, acompte: 30, conditions: "Solde à la réception des travaux", client: { name: "Isabelle Fournier", addr: "14 avenue d'Albigny, 74000 Annecy", phone: "06 39 98 00 09", email: "isabelle.fournier@example.com" }, site: "14 avenue d'Albigny, 74000 Annecy" }
const short: DDoc = { ...base, num: 20260049, objet: "Remplacement d'un mitigeur de cuisine", lines: [
  { k: "mo", l: "Dépose et pose du mitigeur", d: "Coupure d'eau, dépose de l'ancien mitigeur, pose et raccordement du neuf, essais d'étanchéité.", q: 1.5, u: "h", pu: 55, tv: 10 },
  { k: "fo", l: "Mitigeur thermostatique Grohe", q: 1, u: "u", pu: 129.9, tv: 10 },
  { k: "fft", l: "Déplacement", q: 1, u: "forfait", pu: 35, tv: 10 } ] }
const long: DDoc = { ...base, num: 20260050, objet: "Rénovation complète de la salle de bain et mise aux normes de l'installation électrique de l'appartement (logement de plus de deux ans)", notes: "Accès au chantier par la cour. Les travaux démarrent sous 3 semaines après signature. Évacuation des gravats comprise.", lines: [] }
for (const [si, sec] of ["Démolition", "Plomberie", "Électricité", "Carrelage et faïence", "Finitions"].entries()) {
  long.lines.push({ k: "sec", l: sec, q: 0, u: "", pu: 0, tv: 10 })
  for (let i = 0; i < 6; i++) long.lines.push({ k: i % 3 === 0 ? "mo" : i % 3 === 1 ? "fo" : "fft", l: `${sec} — poste ${i + 1} avec un libellé volontairement long pour vérifier le retour à la ligne dans la colonne désignation`, d: i % 2 ? "Description détaillée : fourniture et pose conformes aux règles de l'art (DTU), protection des sols, nettoyage du chantier en fin d'intervention." : "", q: 1 + i, u: i % 3 === 0 ? "h" : i % 3 === 1 ? "u" : "forfait", pu: 40 + si * 10 + i * 7.5, tv: i === 4 ? 20 : si === 2 ? 5.5 : 10 })
}
let ok = 0, ko = 0; const check = (l: string, c: boolean, d = "") => { c ? ok++ : ko++; console.log(`${c ? "✔" : "✘"} ${l}${c ? "" : " · " + d}`) }
for (const [name, d] of [["court", short], ["long", long]] as const) {
  const pdf = makePdf(d), pages = pdf.getNumberOfPages(), buf = Buffer.from(pdf.output("arraybuffer"))
  writeFileSync(`${OUT}/devis-${name}.pdf`, buf)
  check(`devis ${name} : PDF généré (${pages} page${pages > 1 ? "s" : ""})`, buf.length > 3000 && (name === "court" ? pages === 1 : pages >= 2), String(pages))
  const signed = makePdf(d, { nom: "Isabelle Fournier", at: "2026-11-22T12:29:00Z", hash: "ab".repeat(32), events: [] })
  check(`devis ${name} signé : page certificat ajoutée`, signed.getNumberOfPages() === pages + 1)
}
console.log(`${ok} ok, ${ko} en échec`); process.exit(ko ? 1 : 0)
