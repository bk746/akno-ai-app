
/* Données d'entreprise : remplies depuis le profil artisan (table artisans) au chargement */
export const CO = {
  name: "", owner: "", form: "",
  addr: "", city: "", phone: "", email: "",
  siret: "", tva: "", rm: "", ape: "",
  ins: { by: "", pol: "", zone: "", addr: "" },
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setCO(a: Record<string, any>) {
  Object.assign(CO, { name: a.entreprise_nom || a.nom_entreprise || "", owner: a.prenom || "", form: a.entreprise_forme || "", addr: a.entreprise_adresse || "", city: a.entreprise_cp_ville || "", phone: a.entreprise_telephone || a.telephone || "", email: a.entreprise_email || a.email || "", siret: a.entreprise_siret || "", tva: a.entreprise_tva || "", rm: a.entreprise_rcs_rm || "" })
  Object.assign(CO.ins, { by: a.assurance_nom || "", pol: a.assurance_numero || "", zone: a.assurance_zone || "" })
}
export type DLine = { l: string; q: number; u: string; pu: number; tv: number }
export type DDoc = { num: number; date: string; valid: string; client: { name: string; addr?: string; phone?: string }; site: string; objet: string; lines: DLine[]; acompte: number }

export const e2 = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[\u202f\u00a0]/g, " ") + " €"
export const pct = (n: number) => String(n).replace(".", ",") + " %"
const fr = (d: Date) => d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })

export function buildDoc(dv: { num: number; objet: string; amount: number; client: string; lines?: { l: string; q: number; pu: number; u?: string; tv?: number }[] }, cl: { name: string; addr?: string; phone?: string } | undefined, tvDef: number, today: string): DDoc {
  const src = dv.lines?.length ? dv.lines : [{ l: dv.objet, q: 1, pu: dv.amount }]
  const d0 = new Date(today + "T12:00:00"), d1 = new Date(d0); d1.setDate(d1.getDate() + 30)
  return { num: dv.num, date: fr(d0), valid: fr(d1), client: cl ? { name: cl.name, addr: cl.addr, phone: cl.phone } : { name: dv.client }, site: cl?.addr || "Adresse du chantier à préciser", objet: dv.objet,
    lines: src.map(x => ({ l: x.l, q: x.q, pu: x.pu, u: x.u || (/main d|heure|pose/i.test(x.l) && x.q % 1 ? "h" : /main d/i.test(x.l) ? "h" : "u"), tv: x.tv ?? tvDef })), acompte: 30 }
}
export function totals(d: DDoc) {
  const ht = d.lines.reduce((a, x) => a + x.q * x.pu, 0), by: Record<string, { base: number; tva: number }> = {}
  d.lines.forEach(x => { const k = String(x.tv); by[k] ??= { base: 0, tva: 0 }; by[k].base += x.q * x.pu; by[k].tva += x.q * x.pu * x.tv / 100 })
  const rates = Object.entries(by).map(([r, v]) => ({ r: +r, base: v.base, tva: Math.round(v.tva * 100) / 100 })).sort((a, b) => a.r - b.r)
  const tva = rates.reduce((a, x) => a + x.tva, 0), ttc = ht + tva
  return { ht, rates, tva, ttc, acompte: Math.round(ttc * d.acompte) / 100 }
}
export const MENTIONS = (d: DDoc) => [
  ["Assurance décennale", `${CO.ins.by}, ${CO.ins.addr} · Police ${CO.ins.pol} · Couverture géographique : ${CO.ins.zone}.`],
  ["Conditions de paiement", `Acompte de ${d.acompte} % à la signature, solde à réception de facture en fin de travaux. Règlement par virement ou chèque. Pas d'escompte pour paiement anticipé.`],
  ["Pénalités de retard", "En cas de retard de paiement, pénalités au taux de 3 fois le taux d'intérêt légal, exigibles sans rappel, et indemnité forfaitaire pour frais de recouvrement de 40 € (art. L441-10 et D441-5 du Code de commerce)."],
  ["Validité", `Devis valable 30 jours, jusqu'au ${d.valid}. Devis gratuit. Les prix sont fermes pour la durée de validité.`],
]

