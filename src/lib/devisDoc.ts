import { supabase } from "./supabase"

/* Données d'entreprise : remplies depuis le profil artisan (table artisans) au chargement.
   update44 : plus aucune donnée de démonstration ; seules les mentions renseignées s'impriment. */
export const CO = {
  name: "", owner: "", form: "", capital: "",
  addr: "", city: "", phone: "", email: "",
  siret: "", tva: "", rm: "", ape: "", mediateur: "",
  ei: false, tvaNA: false, devisGratuit: true as boolean | undefined,
  iban: "", delai: 30,
  logo: "" as string, logoPath: "",
  ins: { by: "", pol: "", zone: "", addr: "" },
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setCO(a: Record<string, any>) {
  const tarifs = a.tarifs && typeof a.tarifs === "object" ? a.tarifs as { devisGratuit?: boolean } : {}
  Object.assign(CO, {
    name: a.entreprise_nom || a.nom_entreprise || "", owner: a.prenom || "", form: a.entreprise_forme || "", capital: a.entreprise_capital || "",
    addr: a.entreprise_adresse || "", city: a.entreprise_cp_ville || "", phone: a.entreprise_telephone || a.telephone || "", email: a.entreprise_email || a.email || "",
    siret: a.entreprise_siret || "", tva: a.entreprise_tva || "", rm: a.entreprise_rcs_rm || "", ape: a.entreprise_ape || "", mediateur: a.entreprise_mediateur || "",
    ei: !!a.entreprise_ei, tvaNA: !!a.tva_non_applicable, devisGratuit: typeof tarifs.devisGratuit === "boolean" ? tarifs.devisGratuit : undefined,
    iban: a.iban || "", delai: Number(a.delai_paiement_jours) || 30,
  })
  Object.assign(CO.ins, { by: a.assurance_nom || "", pol: a.assurance_numero || "", zone: a.assurance_zone || "", addr: a.assurance_adresse || "" })
  const path = a.logo_path || ""
  if (path !== CO.logoPath) { CO.logoPath = path; CO.logo = ""; if (path) void loadLogo(path) }
}

/** Logo (bucket privé « logos ») converti en data URL pour l'aperçu et le PDF. */
async function loadLogo(path: string) {
  try {
    const { data } = await supabase.storage.from("logos").download(path)
    if (!data || CO.logoPath !== path) return
    CO.logo = await new Promise<string>((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = ko; r.readAsDataURL(data) })
    dispatchEvent(new Event("akno-logo"))
  } catch { /* logo facultatif */ }
}

/** Nom légal affiché : « Nom EI » pour un entrepreneur individuel (obligatoire depuis 2022). */
export const legalName = () => CO.name ? (CO.ei && !/\bEI\b/.test(CO.name) ? `${CO.name} EI` : CO.name) : ""
/** Ligne d'identification : seules les informations renseignées. */
export const legalLine = () => [
  CO.form && CO.capital ? `${CO.form} au capital de ${CO.capital}` : CO.form,
  CO.siret && `SIRET ${CO.siret}`,
  CO.tvaNA ? "TVA non applicable, art. 293 B du CGI" : CO.tva && `TVA intracom. ${CO.tva}`,
  CO.rm, CO.ape && `APE ${CO.ape}`,
].filter(Boolean).join(" · ")
export const contactLine = () => [CO.addr && CO.city ? `${CO.addr}, ${CO.city}` : CO.addr || CO.city, [CO.phone, CO.email].filter(Boolean).join(" · ")]
/** Informations obligatoires manquantes (affichées dans l'app avant l'envoi). */
export function missingLegal(kind: "devis" | "facture" = "devis") {
  const m: string[] = []
  if (!CO.name) m.push("raison sociale")
  if (!CO.addr || !CO.city) m.push("adresse")
  if (!CO.siret) m.push("SIRET")
  if (!CO.tvaNA && !CO.tva) m.push("n° de TVA (ou « TVA non applicable »)")
  if (!CO.ins.by || !CO.ins.pol) m.push("assurance décennale / RC pro")
  if (kind === "facture" && !CO.iban) m.push("IBAN (conseillé)")
  return m
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
    lines: src.map(x => ({ l: x.l, q: x.q, pu: x.pu, u: x.u || (/main d|heure|pose/i.test(x.l) && x.q % 1 ? "h" : /main d/i.test(x.l) ? "h" : "u"), tv: CO.tvaNA ? 0 : x.tv ?? tvDef })), acompte: 30 }
}
export function totals(d: DDoc) {
  const ht = d.lines.reduce((a, x) => a + x.q * x.pu, 0), by: Record<string, { base: number; tva: number }> = {}
  d.lines.forEach(x => { const k = String(x.tv); by[k] ??= { base: 0, tva: 0 }; by[k].base += x.q * x.pu; by[k].tva += x.q * x.pu * x.tv / 100 })
  const rates = Object.entries(by).filter(([r]) => !CO.tvaNA || +r > 0).map(([r, v]) => ({ r: +r, base: v.base, tva: Math.round(v.tva * 100) / 100 })).sort((a, b) => a.r - b.r)
  const tva = rates.reduce((a, x) => a + x.tva, 0), ttc = ht + tva
  return { ht, rates, tva, ttc, acompte: Math.round(ttc * d.acompte) / 100 }
}
export const devisGratuitLabel = () => CO.devisGratuit === false ? "Devis payant" : "Devis gratuit"
export const MENTIONS = (d: DDoc) => {
  const out: [string, string][] = []
  if (CO.ins.by || CO.ins.pol) out.push(["Assurance professionnelle (décennale / RC pro)", [CO.ins.by, CO.ins.addr, CO.ins.pol && `Police ${CO.ins.pol}`, CO.ins.zone && `Couverture géographique : ${CO.ins.zone}`].filter(Boolean).join(" · ") + "."])
  out.push(["Conditions de paiement", `Acompte de ${d.acompte} % à la signature, solde à réception de facture en fin de travaux. Règlement par virement ou chèque. Pas d'escompte pour paiement anticipé.`])
  out.push(["Pénalités de retard", "Entre professionnels : pénalités au taux de 3 fois le taux d'intérêt légal, exigibles sans rappel, et indemnité forfaitaire pour frais de recouvrement de 40 € (art. L441-10 et D441-5 du Code de commerce). Pour un particulier : intérêts au taux légal après mise en demeure."])
  out.push(["Validité", `Devis valable 30 jours, jusqu'au ${d.valid}. ${devisGratuitLabel()}. Les prix sont fermes pour la durée de validité.`])
  out.push(["Droit de rétractation", "Si le client est un particulier et que le devis est signé à distance ou hors établissement, il dispose d'un délai de 14 jours pour se rétracter (art. L221-18 du Code de la consommation). Les travaux ne commencent avant la fin de ce délai qu'à sa demande expresse."])
  if (CO.tvaNA) out.push(["TVA", "TVA non applicable, art. 293 B du CGI."])
  if (CO.mediateur) out.push(["Médiation de la consommation", `En cas de litige, le client particulier peut recourir gratuitement au médiateur : ${CO.mediateur} (art. L612-1 du Code de la consommation).`])
  return out
}
