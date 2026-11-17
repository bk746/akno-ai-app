import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import { CO, contactLine, e2, legalLine, legalName, pct } from "./devisDoc"

/* update46 · Facture / acompte / avoir conformes (art. 242 nonies A annexe II du CGI, L441-9 C. com.) */
export type FLine = { l: string; q: number; u?: string; pu: number; tv?: number }
export type Facture = {
  id: string; numero?: string | null; type: "facture" | "acompte" | "avoir"; statut: string
  client_nom?: string | null; client_email?: string | null; client_telephone?: string | null; client_adresse?: string | null
  client_pro?: boolean; client_siren?: string | null; client_tva?: string | null; adresse_chantier?: string | null
  objet?: string | null; nature?: string; lignes: FLine[]; total_ht: number; total_tva: number; total_ttc: number; acompte_deduit: number
  tva_sur_debits?: boolean; autoliquidation?: boolean; delai_paiement_jours?: number
  date_emission?: string | null; date_execution?: string | null; date_echeance?: string | null
  facture_origine_id?: string | null; envoyee_le?: string | null; payee_le?: string | null; devis_id?: string | null; created_at?: string
  origine_numero?: string
}
const fr = (iso?: string | null) => iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—"

export function factureTotals(f: Facture) {
  const by: Record<string, { base: number; tva: number }> = {}
  let ht = 0
  for (const x of f.lignes || []) {
    const base = Number(x.q) * Number(x.pu), r = f.autoliquidation || CO.tvaNA ? 0 : Number(x.tv ?? 20)
    ht += base
    const k = String(r); by[k] ??= { base: 0, tva: 0 }; by[k].base += base; by[k].tva += base * r / 100
  }
  const rates = Object.entries(by).map(([r, v]) => ({ r: +r, base: v.base, tva: Math.round(v.tva * 100) / 100 })).filter(x => x.r > 0).sort((a, b) => a.r - b.r)
  const tva = rates.reduce((a, x) => a + x.tva, 0), ttc = Math.round((ht + tva) * 100) / 100
  return { ht: Math.round(ht * 100) / 100, rates, tva, ttc, net: Math.round((ttc - Number(f.acompte_deduit || 0)) * 100) / 100 }
}

export function makeFacturePdf(f: Facture): jsPDF {
  const t = factureTotals(f), pdf = new jsPDF({ unit: "mm", format: "a4" }), W = 210, M = 16
  const ACC: [number, number, number] = [14, 143, 143], INK: [number, number, number] = [20, 20, 22], MUT: [number, number, number] = [110, 110, 118]
  const txt = (s: string, x: number, y: number, o: { sz?: number; b?: boolean; c?: number[]; al?: "right" | "left" | "center"; w?: number } = {}) => { pdf.setFont("helvetica", o.b ? "bold" : "normal"); pdf.setFontSize(o.sz || 9); pdf.setTextColor(...((o.c || INK) as [number, number, number])); const lines = o.w ? pdf.splitTextToSize(s, o.w) : s; pdf.text(lines, x, y, { align: o.al || "left" }); return Array.isArray(lines) ? lines.length : 1 }
  const title = f.type === "avoir" ? "AVOIR" : f.type === "acompte" ? "FACTURE D'ACOMPTE" : "FACTURE"
  pdf.setFillColor(...ACC); pdf.rect(0, 0, W, 2.2, "F")
  let lx = M
  if (CO.logo) { try { pdf.addImage(CO.logo, /^data:image\/png/i.test(CO.logo) ? "PNG" : "JPEG", M, 12, 22, 22, undefined, "FAST"); lx = M + 27 } catch { lx = M } }
  const [c1, c2] = contactLine()
  txt(legalName(), lx, 16.5, { sz: 12, b: true }); txt([CO.form, CO.owner].filter(Boolean).join(" · "), lx, 21.5, { sz: 8, c: MUT }); txt(c1, lx, 26, { sz: 8, c: MUT }); txt(c2, lx, 30.5, { sz: 8, c: MUT })
  txt(title, W - M, 18, { sz: f.type === "acompte" ? 15 : 20, b: true, al: "right" })
  txt(f.numero ? `N° ${f.numero}` : "BROUILLON — non émise", W - M, 25, { sz: 10, b: true, c: f.numero ? ACC : [200, 60, 60], al: "right" })
  txt(`Date d'émission : ${fr(f.date_emission)}`, W - M, 30.5, { sz: 8, c: MUT, al: "right" })
  if (f.type !== "avoir") txt(`Date d'échéance : ${fr(f.date_echeance)}`, W - M, 34.5, { sz: 8, c: MUT, al: "right" })
  txt(legalLine(), M, 41, { sz: 7, c: MUT, w: W - 2 * M })
  pdf.setDrawColor(228, 228, 232); pdf.line(M, 44, W - M, 44)
  const bw = (W - 2 * M - 6) / 2, box = (x: number, h: string, a: string[]) => { pdf.setFillColor(246, 246, 248); pdf.roundedRect(x, 48, bw, 29, 2, 2, "F"); txt(h, x + 4, 54, { sz: 7, b: true, c: ACC }); a.slice(0, 5).forEach((s, i) => txt(s, x + 4, 60 + i * 4.3, { sz: i ? 8.2 : 10, b: !i, c: i ? MUT : INK, w: bw - 8 })) }
  box(M, "FACTURÉ À", [f.client_nom || "", f.client_adresse || "", f.client_pro && f.client_siren ? `SIREN ${f.client_siren}` : "", f.client_pro && f.client_tva ? `TVA ${f.client_tva}` : ""].filter(Boolean))
  box(M + bw + 6, "PRESTATION", [f.objet || "", `Adresse d'exécution : ${f.adresse_chantier || f.client_adresse || "—"}`, `Date de réalisation : ${fr(f.date_execution || f.date_emission)}`, f.type === "avoir" && f.origine_numero ? `Avoir sur la facture n° ${f.origine_numero}` : ""].filter(Boolean))
  autoTable(pdf, { startY: 82, margin: { left: M, right: M, bottom: 22 }, head: [["Désignation", "Qté", "Unité", "PU HT", "TVA", "Total HT"]],
    body: (f.lignes || []).map(x => [x.l, String(x.q).replace(".", ","), x.u || "u", e2(Number(x.pu)), f.autoliquidation || CO.tvaNA ? "—" : pct(Number(x.tv ?? 20)), e2(Number(x.q) * Number(x.pu))]),
    styles: { font: "helvetica", fontSize: 8.5, textColor: INK, cellPadding: { top: 2.6, bottom: 2.6, left: 2.5, right: 2.5 }, lineColor: [232, 232, 236], lineWidth: { bottom: .2 } as never },
    headStyles: { fillColor: [246, 246, 248], textColor: MUT, fontStyle: "bold", fontSize: 7.5 },
    columnStyles: { 0: { cellWidth: "auto" }, 1: { halign: "right", cellWidth: 13 }, 2: { halign: "center", cellWidth: 14 }, 3: { halign: "right", cellWidth: 25 }, 4: { halign: "right", cellWidth: 15 }, 5: { halign: "right", cellWidth: 27 } } })
  let y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
  const sign = f.type === "avoir" ? "- " : ""
  const rows: [string, string, boolean?][] = [["Total HT", sign + e2(t.ht)], ...t.rates.map(r => [`TVA ${pct(r.r)} (base ${e2(r.base)})`, sign + e2(r.tva)] as [string, string]), ["Total TTC", sign + e2(t.ttc), !Number(f.acompte_deduit)]]
  if (Number(f.acompte_deduit)) { rows.push(["Acomptes déjà facturés", "- " + e2(Number(f.acompte_deduit))]); rows.push(["Net à payer", e2(t.net), true]) }
  if (y + rows.length * 6 + 8 > 270) { pdf.addPage(); y = 20 }
  const tx0 = W - M - 78
  rows.forEach(([a, b, s]) => { if (s) { pdf.setFillColor(...ACC); pdf.roundedRect(tx0 - 2, y - 4.4, 80, 7.4, 1.5, 1.5, "F") } txt(a, tx0, y, { sz: s ? 10 : 8.5, b: !!s, c: s ? [255, 255, 255] : MUT }); txt(b, W - M - 1, y, { sz: s ? 10 : 8.5, b: !!s, c: s ? [255, 255, 255] : INK, al: "right" }); y += s ? 8 : 5.6 })
  y += 4
  const mentions: [string, string][] = []
  if (CO.tvaNA) mentions.push(["TVA", "TVA non applicable, art. 293 B du CGI."])
  if (f.autoliquidation) mentions.push(["Autoliquidation", "Autoliquidation de la TVA : TVA due par le preneur, art. 283-2 nonies du CGI (sous-traitance de travaux de construction)."])
  if (f.tva_sur_debits) mentions.push(["TVA", "Option pour le paiement de la TVA d'après les débits."])
  if (f.type !== "avoir") {
    mentions.push(["Paiement", `Échéance : ${fr(f.date_echeance)}${CO.iban ? ` · Virement : IBAN ${CO.iban}` : ""}. Pas d'escompte pour paiement anticipé.`])
    mentions.push(["Retard de paiement", f.client_pro
      ? "Pénalités de retard au taux de 3 fois le taux d'intérêt légal, exigibles dès le lendemain de l'échéance, et indemnité forfaitaire pour frais de recouvrement de 40 € (art. L441-10 et D441-5 du Code de commerce)."
      : "En cas de retard, des intérêts au taux légal pourront être appliqués après mise en demeure."])
  }
  if (CO.ins.by || CO.ins.pol) mentions.push(["Assurance professionnelle", [CO.ins.by, CO.ins.addr, CO.ins.pol && `Police ${CO.ins.pol}`, CO.ins.zone && `Couverture : ${CO.ins.zone}`].filter(Boolean).join(" · ")])
  if (CO.mediateur && !f.client_pro) mentions.push(["Médiation", `Médiateur de la consommation : ${CO.mediateur}.`])
  mentions.forEach(([h, s]) => { const n = pdf.splitTextToSize(s, W - 2 * M).length; if (y + 5 + n * 3.5 > 276) { pdf.addPage(); y = 20 } txt(h, M, y, { sz: 7.5, b: true, c: ACC }); txt(s, M, y + 3.8, { sz: 7.5, c: MUT, w: W - 2 * M }); y += 5.5 + n * 3.4 })
  const n = pdf.getNumberOfPages()
  for (let i = 1; i <= n; i++) { pdf.setPage(i); pdf.setDrawColor(228, 228, 232); pdf.line(M, 284, W - M, 284); txt([legalName(), CO.siret && `SIRET ${CO.siret}`, CO.rm].filter(Boolean).join(" · "), M, 288.5, { sz: 6.5, c: MUT }); txt(`Page ${i} / ${n}`, W - M, 288.5, { sz: 6.5, c: MUT, al: "right" }) }
  return pdf
}
export const factureFileName = (f: Facture) => `${f.type === "avoir" ? "Avoir" : "Facture"}-${f.numero || "brouillon"}.pdf`
