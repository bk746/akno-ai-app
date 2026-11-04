import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import { CO, MENTIONS, e2, pct, totals, type DDoc } from "./devisDoc"

export function makePdf(d: DDoc): jsPDF {
  const t = totals(d), pdf = new jsPDF({ unit: "mm", format: "a4" }), W = 210, M = 16, TEAL: [number, number, number] = [14, 143, 143], INK: [number, number, number] = [20, 20, 22], MUT: [number, number, number] = [110, 110, 118]
  const txt = (s: string, x: number, y: number, o: { sz?: number; b?: boolean; c?: number[]; al?: "right" | "left" | "center"; w?: number } = {}) => { pdf.setFont("helvetica", o.b ? "bold" : "normal"); pdf.setFontSize(o.sz || 9); pdf.setTextColor(...((o.c || INK) as [number, number, number])); const lines = o.w ? pdf.splitTextToSize(s, o.w) : s; pdf.text(lines, x, y, { align: o.al || "left" }); return Array.isArray(lines) ? lines.length : 1 }
  pdf.setFillColor(...TEAL); pdf.rect(0, 0, W, 2.2, "F")
  // logo placeholder
  pdf.setDrawColor(200, 200, 205); pdf.setLineDashPattern([1, 1], 0); pdf.roundedRect(M, 12, 22, 22, 2, 2); pdf.setLineDashPattern([], 0); txt("LOGO", M + 11, 24.5, { sz: 7, c: MUT, al: "center" })
  txt(CO.name, M + 27, 16.5, { sz: 12, b: true }); txt(`${CO.form} · ${CO.owner}`, M + 27, 21.5, { sz: 8, c: MUT })
  txt(`${CO.addr}, ${CO.city}`, M + 27, 26, { sz: 8, c: MUT }); txt(`${CO.phone} · ${CO.email}`, M + 27, 30.5, { sz: 8, c: MUT })
  txt("DEVIS", W - M, 18, { sz: 20, b: true, al: "right" }); txt(`N° ${d.num}`, W - M, 25, { sz: 10, b: true, c: TEAL, al: "right" })
  txt(`Date d'émission : ${d.date}`, W - M, 30.5, { sz: 8, c: MUT, al: "right" }); txt(`Validité : 30 jours (${d.valid})`, W - M, 34.5, { sz: 8, c: MUT, al: "right" })
  txt(`SIRET ${CO.siret} · TVA intracom. ${CO.tva} · ${CO.rm} · APE ${CO.ape}`, M, 41, { sz: 7, c: MUT })
  pdf.setDrawColor(228, 228, 232); pdf.line(M, 44, W - M, 44)
  const bw = (W - 2 * M - 6) / 2, box = (x: number, h: string, a: string[]) => { pdf.setFillColor(246, 246, 248); pdf.roundedRect(x, 48, bw, 27, 2, 2, "F"); txt(h, x + 4, 54, { sz: 7, b: true, c: TEAL }); a.forEach((s, i) => txt(s, x + 4, 60 + i * 4.6, { sz: i ? 8.5 : 10, b: !i, c: i ? MUT : INK, w: bw - 8 })) }
  box(M, "CLIENT", [d.client.name, d.client.addr || "", d.client.phone ? `Tél. ${d.client.phone}` : ""].filter(Boolean))
  box(M + bw + 6, "ADRESSE DU CHANTIER", [d.site, "Objet des travaux :", d.objet])
  txt("Objet", M, 84, { sz: 7, b: true, c: TEAL }); txt(d.objet, M + 12, 84, { sz: 9.5, b: true })
  autoTable(pdf, { startY: 88, margin: { left: M, right: M, bottom: 22 }, head: [["Désignation", "Qté", "Unité", "PU HT", "TVA", "Total HT"]],
    body: d.lines.map(x => [x.l, String(x.q).replace(".", ","), x.u, e2(x.pu), pct(x.tv), e2(x.q * x.pu)]),
    styles: { font: "helvetica", fontSize: 8.5, textColor: INK, cellPadding: { top: 2.6, bottom: 2.6, left: 2.5, right: 2.5 }, lineColor: [232, 232, 236], lineWidth: { bottom: .2 } as any },
    headStyles: { fillColor: [246, 246, 248], textColor: MUT, fontStyle: "bold", fontSize: 7.5 },
    columnStyles: { 0: { cellWidth: "auto" }, 1: { halign: "right", cellWidth: 13 }, 2: { halign: "center", cellWidth: 14 }, 3: { halign: "right", cellWidth: 25 }, 4: { halign: "right", cellWidth: 15 }, 5: { halign: "right", cellWidth: 27 } } })
  let y = (pdf as any).lastAutoTable.finalY + 6
  const rows: [string, string, boolean?][] = [["Total HT", e2(t.ht)], ...t.rates.map(r => [`TVA ${pct(r.r)} (base ${e2(r.base)})`, e2(r.tva)] as [string, string]), ["Total TTC", e2(t.ttc), true], [`Acompte à la signature (${d.acompte} %)`, e2(t.acompte)]]
  if (y + rows.length * 6 + 8 > 275) { pdf.addPage(); y = 20 }
  const tx0 = W - M - 78; rows.forEach(([a, b, s]) => { if (s) { pdf.setFillColor(...TEAL); pdf.roundedRect(tx0 - 2, y - 4.4, 80, 7.4, 1.5, 1.5, "F") } txt(a, tx0, y, { sz: s ? 10 : 8.5, b: !!s, c: s ? [255, 255, 255] : MUT }); txt(b, W - M - 1, y, { sz: s ? 10 : 8.5, b: !!s, c: s ? [255, 255, 255] : INK, al: "right" }); y += s ? 8 : 5.6 })
  y += 4
  MENTIONS(d).forEach(([h, s]) => { const n = pdf.splitTextToSize(s, W - 2 * M).length; if (y + 5 + n * 3.5 > 272) { pdf.addPage(); y = 20 } txt(h, M, y, { sz: 7.5, b: true, c: TEAL }); txt(s, M, y + 3.8, { sz: 7.5, c: MUT, w: W - 2 * M }); y += 5.5 + n * 3.4 })
  if (y + 40 > 278) { pdf.addPage(); y = 20 }
  y += 2; pdf.setDrawColor(210, 210, 215); pdf.roundedRect(W - M - 85, y, 85, 36, 2, 2)
  txt("Bon pour accord", W - M - 81, y + 6, { sz: 9, b: true }); txt("Date : ____ / ____ / ________", W - M - 81, y + 12, { sz: 8, c: MUT }); txt("Signature précédée de la mention manuscrite", W - M - 81, y + 17, { sz: 7, c: MUT }); txt("« Devis reçu avant l'exécution des travaux, bon pour accord »", W - M - 81, y + 21, { sz: 7, c: MUT })
  txt("Devis gratuit", M, y + 6, { sz: 9, b: true, c: TEAL }); txt("Le client reconnaît avoir pris connaissance du présent devis et en accepte les conditions.", M, y + 11, { sz: 7.5, c: MUT, w: W - 2 * M - 95 })
  const n = pdf.getNumberOfPages()
  for (let i = 1; i <= n; i++) { pdf.setPage(i); pdf.setDrawColor(228, 228, 232); pdf.line(M, 284, W - M, 284); txt(`${CO.name} · SIRET ${CO.siret} · ${CO.rm} · Données de démonstration`, M, 288.5, { sz: 6.5, c: MUT }); txt(`Page ${i} / ${n}`, W - M, 288.5, { sz: 6.5, c: MUT, al: "right" }) }
  return pdf
}
export const downloadPdf = (d: DDoc) => makePdf(d).save(`Devis-${d.num}.pdf`)
