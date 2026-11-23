import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import { CO, accentRgb, contactLine, e2, legalLine, legalName, pct, sirenOf, tvaReduiteFacture } from "./devisDoc"
import { computeFacture, fmtPct, lineHT, type FLine, type FType } from "../../api/_lib/factureCalc"

/* update46 · Facture / acompte / avoir conformes (art. 242 nonies A annexe II du CGI, L441-9 C. com.)
   update61 · situations et solde, retenue de garantie, nouvelles mentions de la réforme (SIREN du client,
   adresse de livraison, nature des opérations, option TVA sur les débits), virement (IBAN/BIC/référence),
   certification du taux réduit, empreinte SHA-256, PDF Factur-X (PDF/A-3 + XML CII EN 16931). */
export type { FLine }
export type Facture = {
  id: string; numero?: string | null; type: FType; statut: string
  client_nom?: string | null; client_email?: string | null; client_telephone?: string | null; client_adresse?: string | null
  client_pro?: boolean; client_siren?: string | null; client_tva?: string | null; adresse_chantier?: string | null
  objet?: string | null; nature?: string; lignes: FLine[]; total_ht: number; total_tva: number; total_ttc: number; acompte_deduit: number
  tva_sur_debits?: boolean; autoliquidation?: boolean; delai_paiement_jours?: number
  date_emission?: string | null; date_execution?: string | null; date_echeance?: string | null
  facture_origine_id?: string | null; envoyee_le?: string | null; payee_le?: string | null; devis_id?: string | null; created_at?: string
  situation_numero?: number | null; avancement_pct?: number | null; retenue_garantie_pct?: number | null; reference_paiement?: string | null
  document_hash?: string | null; chaine_hash?: string | null; mode_paiement?: string | null
  origine_numero?: string; origine_date?: string | null; devis_numero?: string | null
}
const fr = (iso?: string | null) => iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—"
export const NATURE: Record<string, string> = { services: "Prestations de services", biens: "Livraisons de biens", mixte: "Livraisons de biens et prestations de services" }
export const TYPE_LABEL: Record<FType, string> = { facture: "Facture", acompte: "Facture d'acompte", situation: "Facture de situation", solde: "Facture de solde", avoir: "Avoir" }
export const zeroTva = (f: Pick<Facture, "autoliquidation">) => !!f.autoliquidation || CO.tvaNA

export function factureTotals(f: Facture) {
  return computeFacture(f.lignes || [], { zeroTva: zeroTva(f), acompteDeduit: f.acompte_deduit, retenuePct: f.retenue_garantie_pct || 0 })
}
export const titleOf = (f: Facture) => f.type === "situation" ? `FACTURE DE SITUATION${f.situation_numero ? ` N° ${f.situation_numero}` : ""}` : TYPE_LABEL[f.type].toUpperCase()

/** Textes de mentions (partagés PDF / XML). */
export function factureMentions(f: Facture) {
  const pro = !!f.client_pro
  const pmd = pro
    ? "Pénalités de retard au taux de 3 fois le taux d'intérêt légal, exigibles dès le lendemain de l'échéance (art. L441-10 du Code de commerce)."
    : "En cas de retard de paiement, des intérêts au taux légal pourront être appliqués après mise en demeure (art. 1231-6 du Code civil)."
  const pmt = pro ? "Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : 40 € (art. L441-10 et D441-5 du Code de commerce)." : "Indemnité forfaitaire de 40 € pour frais de recouvrement applicable aux seuls clients professionnels."
  const aab = "Pas d'escompte pour paiement anticipé."
  return { pmd, pmt, aab }
}

type Fonts = { regular: string; bold: string } | null
type PdfOpts = { fonts?: Fonts }
export function makeFacturePdf(f: Facture, o: PdfOpts = {}): jsPDF {
  const t = factureTotals(f), pdf = new jsPDF({ unit: "mm", format: "a4" }), W = 210, M = 16
  let FONT = "helvetica"
  if (o.fonts) { pdf.addFileToVFS("DroidSans.ttf", o.fonts.regular); pdf.addFont("DroidSans.ttf", "DroidSans", "normal"); pdf.addFileToVFS("DroidSans-Bold.ttf", o.fonts.bold); pdf.addFont("DroidSans-Bold.ttf", "DroidSans", "bold"); FONT = "DroidSans" }
  const ACC = accentRgb(), INK: [number, number, number] = [20, 20, 22], MUT: [number, number, number] = [110, 110, 118]
  const txt = (s: string, x: number, y: number, op: { sz?: number; b?: boolean; c?: number[]; al?: "right" | "left" | "center"; w?: number } = {}) => { pdf.setFont(FONT, op.b ? "bold" : "normal"); pdf.setFontSize(op.sz || 9); pdf.setTextColor(...((op.c || INK) as [number, number, number])); const lines = op.w ? pdf.splitTextToSize(s, op.w) : s; pdf.text(lines, x, y, { align: op.al || "left" }); return Array.isArray(lines) ? lines.length : 1 }
  const avoir = f.type === "avoir", title = titleOf(f)
  pdf.setFillColor(...ACC); pdf.rect(0, 0, W, 2.2, "F")
  let lx = M
  if (CO.logo) { try { pdf.addImage(CO.logo, /^data:image\/png/i.test(CO.logo) ? "PNG" : "JPEG", M, 12, 22, 22, undefined, "FAST"); lx = M + 27 } catch { lx = M } }
  const [c1, c2] = contactLine()
  txt(legalName(), lx, 16.5, { sz: 12, b: true }); txt([CO.form, CO.owner].filter(Boolean).join(" · "), lx, 21.5, { sz: 8, c: MUT }); txt(c1, lx, 26, { sz: 8, c: MUT }); txt(c2, lx, 30.5, { sz: 8, c: MUT })
  txt(title, W - M, 18, { sz: title.length > 12 ? 13 : 20, b: true, al: "right" })
  txt(f.numero ? `N° ${f.numero}` : "BROUILLON — non émise", W - M, 25, { sz: 10, b: true, c: f.numero ? ACC : [200, 60, 60], al: "right" })
  txt(`Date d'émission : ${fr(f.date_emission)}`, W - M, 30.5, { sz: 8, c: MUT, al: "right" })
  if (!avoir) txt(`Date d'échéance : ${fr(f.date_echeance)}`, W - M, 34.5, { sz: 8, c: MUT, al: "right" })
  const sir = sirenOf(CO.siret)
  txt([legalLine(), sir && `SIREN ${sir}`].filter(Boolean).join(" · "), M, 41, { sz: 7, c: MUT, w: W - 2 * M })
  pdf.setDrawColor(228, 228, 232); pdf.line(M, 44, W - M, 44)
  const bw = (W - 2 * M - 6) / 2
  // Encadrés à hauteur variable : chaque ligne peut passer sur 2 lignes sans chevaucher la suivante.
  const wrap = (a: string[]) => a.slice(0, 6).map((s, i) => { pdf.setFont(FONT, i ? "normal" : "bold"); pdf.setFontSize(i ? 8 : 10); return (pdf.splitTextToSize(s, bw - 8) as string[]).slice(0, 2) })
  const boxH = (w: string[][]) => 15 + w.reduce((n, l, i) => n + l.length * (i ? 3.5 : 4.3) + (i ? .8 : 1.2), 0)
  const box = (x: number, h: string, w: string[][], hh: number) => { pdf.setFillColor(246, 246, 248); pdf.roundedRect(x, 48, bw, hh, 2, 2, "F"); txt(h, x + 4, 54, { sz: 7, b: true, c: ACC }); let yy = 59.5; w.forEach((l, i) => { txt(l.join("\n"), x + 4, yy, { sz: i ? 8 : 10, b: !i, c: i ? MUT : INK }); yy += l.length * (i ? 3.5 : 4.3) + (i ? .8 : 1.2) }) }
  const left = wrap([f.client_nom || "", f.client_adresse || "", f.client_siren ? `SIREN ${f.client_siren}` : "", f.client_tva ? `TVA ${f.client_tva}` : ""].filter(Boolean))
  const chantier = f.adresse_chantier && f.adresse_chantier.trim() !== (f.client_adresse || "").trim() ? f.adresse_chantier : ""
  const right = wrap([f.objet || "", `Nature : ${NATURE[f.nature || "services"] || NATURE.services}`, chantier ? `Adresse d'exécution / livraison : ${chantier}` : "Adresse d'exécution : celle du client", `Date de réalisation : ${fr(f.date_execution || f.date_emission)}`,
    avoir && f.origine_numero ? `Avoir sur la facture n° ${f.origine_numero}${f.origine_date ? ` du ${fr(f.origine_date)}` : ""}` : f.devis_numero ? `Devis n° ${f.devis_numero}${f.type === "situation" && f.avancement_pct ? ` · avancement cumulé ${fmtPct(Number(f.avancement_pct))}` : ""}` : ""].filter(Boolean))
  const bh = Math.max(31, boxH(left), boxH(right))
  box(M, "FACTURÉ À", left, bh); box(M + bw + 6, "OPÉRATION", right, bh)
  const zero = zeroTva(f)
  autoTable(pdf, { startY: 48 + bh + 5, margin: { left: M, right: M, bottom: 22 }, head: [["Désignation", "Qté", "Unité", "PU HT", "TVA", "Total HT"]],
    body: (f.lignes || []).map(x => [x.l, String(x.q).replace(".", ","), x.u || "u", e2(Number(x.pu)), zero ? "—" : pct(Number(x.tv ?? 20)), e2(lineHT(x))]),
    styles: { font: FONT, fontSize: 8.5, textColor: INK, cellPadding: { top: 2.6, bottom: 2.6, left: 2.5, right: 2.5 }, lineColor: [232, 232, 236], lineWidth: { bottom: .2 } as never },
    headStyles: { font: FONT, fillColor: [246, 246, 248], textColor: MUT, fontStyle: "bold", fontSize: 7.5 },
    columnStyles: { 0: { cellWidth: "auto" }, 1: { halign: "right", cellWidth: 13 }, 2: { halign: "center", cellWidth: 14 }, 3: { halign: "right", cellWidth: 25 }, 4: { halign: "right", cellWidth: 15 }, 5: { halign: "right", cellWidth: 27 } } })
  let y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
  const sign = avoir ? "- " : ""
  const rows: [string, string, boolean?][] = [["Total HT", sign + e2(t.ht)], ...t.rates.map(r => [`TVA ${pct(r.r)} (base ${e2(r.base)})`, sign + e2(r.tva)] as [string, string])]
  if (zero) rows.push([CO.tvaNA ? "TVA (art. 293 B du CGI)" : "TVA due par le preneur", "0,00 €"])
  const extra = t.acompte > 0 || t.retenue > 0
  rows.push([avoir ? "Total TTC de l'avoir" : "Total TTC", sign + e2(t.ttc), !extra])
  if (t.acompte > 0) rows.push(["Acomptes et situations déjà facturés (TTC)", "- " + e2(t.acompte)])
  if (t.retenue > 0) rows.push([`Retenue de garantie ${fmtPct(Number(f.retenue_garantie_pct))} (loi n° 71-584)`, "- " + e2(t.retenue)])
  if (extra) rows.push(["Net à payer", e2(t.net), true])
  if (y + rows.length * 6 + 8 > 270) { pdf.addPage(); y = 20 }
  const tx0 = W - M - 92
  rows.forEach(([a, b, s]) => { if (s) { pdf.setFillColor(...ACC); pdf.roundedRect(tx0 - 2, y - 4.4, 94, 7.4, 1.5, 1.5, "F") } txt(a, tx0, y, { sz: s ? 10 : 8.2, b: !!s, c: s ? [255, 255, 255] : MUT }); txt(b, W - M - 1, y, { sz: s ? 10 : 8.5, b: !!s, c: s ? [255, 255, 255] : INK, al: "right" }); y += s ? 8 : 5.6 })
  y += 4
  const m = factureMentions(f), mentions: [string, string][] = []
  if (!avoir) {
    const ref = f.reference_paiement || f.numero || ""
    mentions.push(["Règlement par virement", [`Échéance : ${fr(f.date_echeance)}`, CO.iban && `IBAN ${CO.iban}`, CO.bic && `BIC ${CO.bic}`, legalName() && `Titulaire : ${legalName()}`, ref && `Référence à indiquer : ${ref}`].filter(Boolean).join(" · ") + `. ${m.aab}`])
    mentions.push(["Retard de paiement", `${m.pmd} ${f.client_pro ? m.pmt : ""}`.trim()])
  }
  if (CO.tvaNA) mentions.push(["TVA", "TVA non applicable, art. 293 B du CGI."])
  if (f.autoliquidation) mentions.push(["Autoliquidation", "Autoliquidation : TVA due par le preneur, art. 283-2 nonies du CGI (sous-traitance de travaux de construction)."])
  if (f.tva_sur_debits) mentions.push(["TVA", "Option pour le paiement de la taxe d'après les débits."])
  const red = zero ? [] : [...new Set((f.lignes || []).filter(x => x.tv === 10 || x.tv === 5.5).map(x => x.tv))]
  if (red.length && !f.client_pro && !avoir) mentions.push(["Taux réduit de TVA", tvaReduiteFacture(red.includes(5.5))])
  if (CO.ins.by || CO.ins.pol) mentions.push(["Assurance professionnelle (décennale / RC pro)", [CO.ins.by, CO.ins.addr, CO.ins.pol && `Police ${CO.ins.pol}`, CO.ins.zone && `Couverture : ${CO.ins.zone}`].filter(Boolean).join(" · ")])
  if (CO.mediateur && !f.client_pro) mentions.push(["Médiation", `Médiateur de la consommation : ${CO.mediateur} (art. L612-1 du Code de la consommation).`])
  if (f.numero) mentions.push(["Facture électronique", `${f.document_hash ? `Empreinte SHA-256 du contenu émis : ${f.document_hash}. ` : ""}Document Factur-X (PDF/A-3 + données structurées EN 16931). Numérotation chronologique continue ; une facture émise n'est plus modifiable, toute correction passe par un avoir. Conservation : 10 ans (art. L123-22 du Code de commerce).`])
  mentions.forEach(([h, s]) => { pdf.setFont(FONT, "normal"); pdf.setFontSize(7.5); const n = pdf.splitTextToSize(s, W - 2 * M).length; if (y + 5 + n * 3.5 > 276) { pdf.addPage(); y = 20 } txt(h, M, y, { sz: 7.5, b: true, c: ACC }); txt(s, M, y + 3.8, { sz: 7.5, c: MUT, w: W - 2 * M }); y += 5.5 + n * 3.4 })
  const n = pdf.getNumberOfPages()
  for (let i = 1; i <= n; i++) { pdf.setPage(i); pdf.setDrawColor(228, 228, 232); pdf.line(M, 284, W - M, 284); txt(CO.pied || [legalName(), CO.siret && `SIRET ${CO.siret}`, CO.rm].filter(Boolean).join(" · "), M, 288.5, { sz: 6.5, c: MUT, w: W - 2 * M - 22 }); txt(`Page ${i} / ${n}`, W - M, 288.5, { sz: 6.5, c: MUT, al: "right" }) }
  return pdf
}
export const factureFileName = (f: Facture) => `${f.type === "avoir" ? "Avoir" : "Facture"}-${f.numero || "brouillon"}.pdf`

/* ---------------- Factur-X ---------------- */
let assets: Promise<{ fonts: Fonts; icc: Uint8Array | null }> | null = null
const toB64 = (buf: ArrayBuffer) => { const u = new Uint8Array(buf); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s) }
function loadAssets() {
  assets ??= (async () => {
    try {
      const [r, b, i] = await Promise.all(["/facturx/DroidSans.ttf", "/facturx/DroidSans-Bold.ttf", "/facturx/sRGB2014.icc"].map(u => fetch(u).then(x => { if (!x.ok) throw new Error(u); return x.arrayBuffer() })))
      return { fonts: { regular: toB64(r), bold: toB64(b) }, icc: new Uint8Array(i) }
    } catch { assets = null; return { fonts: null, icc: null } }
  })()
  return assets
}

/** Données XML CII de la facture (profil EN 16931). */
export async function factureXml(f: Facture) {
  const { buildCII } = await import("./facturx")
  const m = factureMentions(f)
  return buildCII({
    numero: String(f.numero), type: f.type, dateEmission: f.date_emission || new Date().toISOString().slice(0, 10), dateExecution: f.date_execution, dateEcheance: f.date_echeance,
    seller: { name: legalName(), siren: sirenOf(CO.siret), tva: CO.tva, addr: CO.addr, cpVille: CO.city, email: CO.email, iban: CO.iban, bic: CO.bic, franchise: CO.tvaNA },
    buyer: { name: f.client_nom || "", siren: f.client_siren || "", tva: f.client_tva || "", addr: f.client_adresse || "", email: f.client_email || "", pro: !!f.client_pro },
    chantier: f.adresse_chantier, nature: f.nature, objet: f.objet, devisNumero: f.devis_numero || null,
    lines: f.lignes || [], acompteDeduit: f.acompte_deduit, retenuePct: f.retenue_garantie_pct || 0, autoliquidation: !!f.autoliquidation, tvaSurDebits: !!f.tva_sur_debits,
    origine: f.type === "avoir" && f.origine_numero ? { numero: f.origine_numero, date: f.origine_date } : null,
    notes: { pmt: m.pmt, pmd: m.pmd, aab: m.aab, other: [f.tva_sur_debits ? "Option pour le paiement de la taxe d'après les débits." : "", f.autoliquidation ? "Autoliquidation : TVA due par le preneur, art. 283-2 nonies du CGI." : "", Number(f.retenue_garantie_pct) > 0 ? `Retenue de garantie de ${fmtPct(Number(f.retenue_garantie_pct))} du TTC (loi n° 71-584), déduite du règlement : ${e2(factureTotals(f).retenue)}.` : ""].filter(Boolean) },
    paymentTerms: `Virement à ${Number(f.delai_paiement_jours ?? 30)} jours${f.date_echeance ? `, échéance le ${fr(f.date_echeance)}` : ""}. Référence : ${f.reference_paiement || f.numero}.`,
  })
}

/** PDF final : Factur-X (PDF/A-3 + factur-x.xml) pour une facture émise ; PDF simple pour un brouillon ou en cas d'échec. */
export async function factureFile(f: Facture): Promise<{ bytes: Uint8Array; base64: string; filename: string; facturx: boolean }> {
  const filename = factureFileName(f)
  if (f.numero) {
    const a = await loadAssets()
    if (a.fonts && a.icc) {
      try {
        const [{ toFacturX, b64 }, xml] = await Promise.all([import("./facturx"), factureXml(f)])
        const raw = makeFacturePdf(f, { fonts: a.fonts }).output("arraybuffer")
        const bytes = await toFacturX(raw, xml, { title: `${TYPE_LABEL[f.type]} ${f.numero}`, author: legalName() || "Akno", icc: a.icc })
        return { bytes, base64: b64(bytes), filename, facturx: true }
      } catch (e) { console.error("[Akno · Factur-X]", e) }
    }
  }
  const bytes = new Uint8Array(makeFacturePdf(f).output("arraybuffer"))
  const { b64 } = await import("./facturx")
  return { bytes, base64: b64(bytes), filename, facturx: false }
}
export async function downloadFacture(f: Facture) {
  const r = await factureFile(f)
  const url = URL.createObjectURL(new Blob([r.bytes as BlobPart], { type: "application/pdf" }))
  const a = document.createElement("a"); a.href = url; a.download = r.filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000)
  return r
}
export async function downloadFactureXml(f: Facture) {
  const xml = await factureXml(f)
  const url = URL.createObjectURL(new Blob([xml], { type: "application/xml" }))
  const a = document.createElement("a"); a.href = url; a.download = `${f.numero || "facture"}-factur-x.xml`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000)
}
