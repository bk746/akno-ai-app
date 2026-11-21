import { supabase } from "./supabase"

/* Données d'entreprise : remplies depuis le profil artisan (table artisans) au chargement.
   update44 : plus aucune donnée de démonstration ; seules les mentions renseignées s'impriment. */
export const CO = {
  name: "", owner: "", form: "", capital: "",
  addr: "", city: "", phone: "", email: "",
  siret: "", tva: "", rm: "", ape: "", mediateur: "",
  ei: false, tvaNA: false, devisGratuit: true as boolean | undefined,
  iban: "", delai: 30,
  // update52 : réglages de devis (configuration de la page Devis)
  validite: 30, conditions: "", taux: null as number | null,
  logo: "" as string, logoPath: "",
  ins: { by: "", pol: "", zone: "", addr: "" },
  // update61 : virement, TVA sur les débits, personnalisation des documents
  bic: "", tvaDebits: false, accent: "#0E8F8F", pied: "",
}
/** Couleur d'accent des documents (Réglages → Entreprise), « #RRGGBB » → [r, g, b]. */
export const accentRgb = (): [number, number, number] => { const m = /^#?([0-9a-f]{6})$/i.exec(CO.accent || ""); const h = m ? m[1] : "0E8F8F"; return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)] }
/** SIREN = 9 premiers chiffres du SIRET. */
export const sirenOf = (siret?: string) => { const d = String(siret || "").replace(/\D/g, ""); return d.length >= 9 ? d.slice(0, 9) : "" }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setCO(a: Record<string, any>) {
  const tarifs = a.tarifs && typeof a.tarifs === "object" ? a.tarifs as { devisGratuit?: boolean } : {}
  Object.assign(CO, {
    name: a.entreprise_nom || a.nom_entreprise || "", owner: a.prenom || "", form: a.entreprise_forme || "", capital: a.entreprise_capital || "",
    addr: a.entreprise_adresse || "", city: a.entreprise_cp_ville || "", phone: a.entreprise_telephone || a.telephone || "", email: a.entreprise_email || a.email || "",
    siret: a.entreprise_siret || "", tva: a.entreprise_tva || "", rm: a.entreprise_rcs_rm || "", ape: a.entreprise_ape || "", mediateur: a.entreprise_mediateur || "",
    ei: !!a.entreprise_ei, tvaNA: !!a.tva_non_applicable, devisGratuit: typeof tarifs.devisGratuit === "boolean" ? tarifs.devisGratuit : undefined,
    iban: a.iban || "", delai: Number(a.delai_paiement_jours) || 30,
    validite: Number(a.devis_validite_jours) > 0 ? Number(a.devis_validite_jours) : 30,
    conditions: typeof a.devis_conditions === "string" ? a.devis_conditions.trim() : "",
    taux: (() => { const v = (tarifs as { tauxHoraire?: unknown }).tauxHoraire; const n = v == null || v === "" ? NaN : Number(String(v).replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : null })(),
  })
  Object.assign(CO, { bic: a.bic || "", tvaDebits: !!a.tva_sur_debits, accent: /^#[0-9a-f]{6}$/i.test(String(a.devis_couleur || "")) ? String(a.devis_couleur) : "#0E8F8F", pied: typeof a.devis_pied === "string" ? a.devis_pied.trim() : "" })
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
  else if (!CO.ins.zone) m.push("couverture géographique de l'assurance")
  if (!CO.mediateur) m.push("médiateur de la consommation")
  if (kind === "facture" && !CO.iban) m.push("IBAN (paiement par virement)")
  return m
}
export type DLine = { l: string; q: number; u: string; pu: number; tv: number; k?: string; d?: string }
export type DDoc = { num: number; date: string; valid: string; validite: number; client: { name: string; addr?: string; phone?: string; email?: string }; site: string; objet: string; lines: DLine[]; acompte: number; conditions: string; notes?: string }

export const e2 = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[\u202f\u00a0]/g, " ") + " €"
export const pct = (n: number) => String(n).replace(".", ",") + " %"
export const qty = (n: number) => (Number(n) || 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 }).replace(/[\u202f\u00a0]/g, " ")
const fr = (d: Date) => d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })
type SrcLine = { l: string; q: number; pu: number; u?: string; tv?: number; k?: string; d?: string; m?: { site?: string; acompte?: number; validite?: number; conditions?: string; notes?: string } }
const DEFAULT_COND = "Acompte de 30 % à la signature, solde à réception de facture en fin de travaux."

/** update52 : gère aussi les sections, descriptions, remises et réglages (ligne « meta ») de l'éditeur pro.
    Les anciens devis et ceux générés par l'IA ({ l, q, pu, u, tv }) s'affichent comme avant. */
export function buildDoc(dv: { num: number; objet: string; amount: number; client: string; lines?: SrcLine[]; addr?: string; email?: string; phone?: string; at?: string }, cl: { name: string; addr?: string; phone?: string; email?: string } | undefined, tvDef: number, today: string): DDoc {
  const all = dv.lines?.length ? dv.lines : [{ l: dv.objet, q: 1, pu: dv.amount }]
  const meta = all.find(x => x && x.k === "meta")?.m || {}
  const src = all.filter(x => x && x.k !== "meta")
  const validite = Number(meta.validite) > 0 ? Number(meta.validite) : CO.validite || 30
  const d0 = new Date(today + "T12:00:00"), d1 = new Date(d0); d1.setDate(d1.getDate() + validite)
  const conditions = (meta.conditions || CO.conditions || DEFAULT_COND).trim()
  const acompte = meta.acompte != null && Number.isFinite(Number(meta.acompte)) ? Number(meta.acompte) : (() => { const m = conditions.match(/acompte\s+de\s+(\d{1,3}(?:[.,]\d+)?)\s*%/i); return m ? Number(m[1].replace(",", ".")) : 30 })()
  const client = { name: dv.client || cl?.name || "", addr: dv.addr || cl?.addr, phone: dv.phone || cl?.phone, email: dv.email || cl?.email }
  return { num: dv.num, date: fr(d0), valid: fr(d1), validite, client, site: meta.site || client.addr || "Adresse du chantier à préciser", objet: dv.objet, conditions, notes: meta.notes,
    lines: src.map(x => x.k === "sec" ? { l: x.l, q: 0, pu: 0, u: "", tv: 0, k: "sec" } : ({ l: x.l, q: Number(x.q) || 0, pu: Number(x.pu) || 0, u: x.u ?? (/main d|heure|pose/i.test(x.l) && x.q % 1 ? "h" : /main d/i.test(x.l) ? "h" : "u"), tv: CO.tvaNA ? 0 : x.tv ?? tvDef, ...(x.k ? { k: x.k } : {}), ...(x.d ? { d: x.d } : {}) })), acompte }
}
export function totals(d: DDoc) {
  const lines = d.lines.filter(x => x.k !== "sec")
  const ht = lines.reduce((a, x) => a + x.q * x.pu, 0), by: Record<string, { base: number; tva: number }> = {}
  lines.forEach(x => { const k = String(x.tv); by[k] ??= { base: 0, tva: 0 }; by[k].base += x.q * x.pu; by[k].tva += x.q * x.pu * x.tv / 100 })
  const rates = Object.entries(by).filter(([r, v]) => (!CO.tvaNA || +r > 0) && Math.abs(v.base) > 0.004).map(([r, v]) => ({ r: +r, base: Math.round(v.base * 100) / 100, tva: Math.round(v.tva * 100) / 100 })).sort((a, b) => a.r - b.r)
  const brut = lines.filter(x => x.k !== "rem").reduce((a, x) => a + x.q * x.pu, 0), remise = -lines.filter(x => x.k === "rem").reduce((a, x) => a + x.q * x.pu, 0)
  const tva = rates.reduce((a, x) => a + x.tva, 0), ttc = ht + tva
  return { ht, brut, remise, rates, tva, ttc, acompte: Math.round(ttc * d.acompte) / 100 }
}
export const devisGratuitLabel = () => CO.devisGratuit === false ? "Devis payant" : "Devis gratuit"
export const MENTIONS = (d: DDoc) => {
  const out: [string, string][] = []
  if (CO.ins.by || CO.ins.pol) out.push(["Assurance professionnelle (décennale / RC pro)", [CO.ins.by, CO.ins.addr, CO.ins.pol && `Police ${CO.ins.pol}`, CO.ins.zone && `Couverture géographique : ${CO.ins.zone}`].filter(Boolean).join(" · ") + "."])
  const cond = /[.!]$/.test(d.conditions) ? d.conditions : `${d.conditions}.`
  out.push(["Conditions de paiement", `${cond}${/acompte/i.test(cond) ? "" : ` Acompte de ${String(d.acompte).replace(".", ",")} % à la signature.`} Règlement par virement ou chèque. Pas d'escompte pour paiement anticipé.`])
  out.push(["Pénalités de retard", "Entre professionnels : pénalités au taux de 3 fois le taux d'intérêt légal, exigibles sans rappel, et indemnité forfaitaire pour frais de recouvrement de 40 € (art. L441-10 et D441-5 du Code de commerce). Pour un particulier : intérêts au taux légal après mise en demeure."])
  out.push(["Validité", `Devis valable ${d.validite} jours, jusqu'au ${d.valid}. ${devisGratuitLabel()}. Les prix sont fermes pour la durée de validité.`])
  out.push(["Droit de rétractation", "Si le client est un particulier et que le devis est signé à distance ou hors établissement, il dispose d'un délai de 14 jours pour se rétracter (art. L221-18 du Code de la consommation). Les travaux ne commencent avant la fin de ce délai qu'à sa demande expresse."])
  if (CO.tvaNA) out.push(["TVA", "TVA non applicable, art. 293 B du CGI."])
  const red = !CO.tvaNA ? [...new Set(d.lines.filter(x => x.k !== "sec" && (x.tv === 10 || x.tv === 5.5)).map(x => x.tv))] : []
  if (red.length) out.push(["Certification du client (TVA à taux réduit)", tvaReduiteDevis(red.includes(5.5))])
  if (CO.mediateur) out.push(["Médiation de la consommation", `En cas de litige, le client particulier peut recourir gratuitement au médiateur : ${CO.mediateur} (art. L612-1 du Code de la consommation).`])
  return out
}

/** update61 · Certification du taux réduit (loi n° 2025-127, art. 41 ; BOI-TVA-LIQ-30-20-90-40) : remplace l'attestation 1300/1301-SD. */
export const tvaReduiteDevis = (energie: boolean) => `En signant ce devis, le client certifie, en qualité de preneur de la prestation, que les travaux réalisés concernent des locaux à usage d'habitation achevés depuis plus de deux ans, qu'ils n'auront pas pour effet, sur une période de deux ans au plus, de concourir à la production d'un immeuble neuf au sens du 2° du 2 du I de l'article 257 du CGI, ni d'entraîner une augmentation de la surface de plancher des locaux existants supérieure à 10 %${energie ? " et, pour les postes à 5,5 %, qu'ils ont la nature de travaux de rénovation énergétique (art. 278-0 bis A du CGI)" : ""} (art. 279-0 bis du CGI).`
export const tvaReduiteFacture = (energie: boolean) => `Par le règlement de la présente facture, le client certifie, en qualité de preneur de la prestation, que les travaux réalisés concernent des locaux à usage d'habitation achevés depuis plus de deux ans, qu'ils n'ont pas eu pour effet, sur une période de deux ans au plus, de concourir à la production d'un immeuble neuf au sens du 2° du 2 du I de l'article 257 du CGI, ni d'entraîner une augmentation de la surface de plancher des locaux existants supérieure à 10 %${energie ? " et, pour les postes à 5,5 %, qu'ils ont la nature de travaux de rénovation énergétique" : ""}.`
