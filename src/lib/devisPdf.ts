import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import { CO, MENTIONS, accentRgb, contactLine, devisGratuitLabel, e2, legalLine, legalName, pct, qty, totals, type DDoc } from "./devisDoc"

/** update61 · Preuve de signature électronique (journal de la page publique de signature). */
export type SignProof = { png?: string | null; nom: string; at: string; ip?: string | null; ua?: string | null; hash: string; certifTva?: boolean | null; events?: { event: string; at: string; ip?: string | null; ua?: string | null; event_hash: string; prev_hash?: string | null; document_hash?: string | null }[] }
const frDT = (iso: string) => new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " (heure de Paris)"
const EV: Record<string, string> = { envoi: "Devis envoyé", ouverture: "Devis consulté", consentement: "Consentement « Bon pour accord » coché", signature: "Signature électronique apposée", refus: "Devis refusé" }

/* update73 · gabarit de devis épuré (même structure que l'aperçu DevisPaper et la page publique de signature) :
   en-tête entreprise · ligne n° / date / validité · blocs Client et Chantier · objet · tableau des lignes (sections) ·
   totaux (HT, TVA par taux, TTC, acompte) + conditions · zone de signature · mentions légales discrètes · pied paginé.
   Une seule couleur d'accent, hauteurs calculées (aucun débordement), sauts de page propres sur plusieurs pages. */
export const conditionsText = (d: DDoc) => (MENTIONS(d).find(([h]) => h === "Conditions de paiement") || ["", ""])[1]
export function makePdf(d: DDoc, sig?: SignProof): jsPDF {
  const t = totals(d), pdf = new jsPDF({ unit: "mm", format: "a4" }), W = 210, M = 16, CW = W - 2 * M, BOT = 278
  const ACC: [number, number, number] = accentRgb(), INK: [number, number, number] = [22, 22, 26], MUT: [number, number, number] = [108, 108, 116], LINE: [number, number, number] = [228, 228, 233], SOFT: [number, number, number] = [247, 247, 249]
  const font = (sz: number, b = false, c: number[] = INK) => { pdf.setFont("helvetica", b ? "bold" : "normal"); pdf.setFontSize(sz); pdf.setTextColor(...(c as [number, number, number])) }
  const lh = (sz: number) => sz * .3528 * 1.38 // hauteur de ligne en mm
  const wrap = (s: string, w: number, sz: number, b = false) => { font(sz, b); return pdf.splitTextToSize(s || "", w) as string[] }
  const txt = (s: string | string[], x: number, y: number, o: { sz?: number; b?: boolean; c?: number[]; al?: "right" | "left" | "center"; w?: number } = {}) => { const sz = o.sz || 9; const lines = typeof s === "string" ? (o.w ? wrap(s, o.w, sz, o.b) : [s]) : s; font(sz, o.b, o.c || INK); pdf.text(lines, x, y, { align: o.al || "left", lineHeightFactor: 1.38 }); return lines.length * lh(sz) }
  let y = 0
  const newPage = () => { pdf.addPage(); pdf.setFillColor(...ACC); pdf.rect(0, 0, W, 1.6, "F"); y = 18 }
  const ensure = (h: number) => { if (y + h > BOT) newPage() }
  const cap = (s: string, x: number, yy: number) => txt(s.toUpperCase(), x, yy, { sz: 7, b: true, c: ACC })

  // 1. en-tête : entreprise (logo, nom, forme, coordonnées, mentions d'identification) · « Devis » + numéro
  pdf.setFillColor(...ACC); pdf.rect(0, 0, W, 1.6, "F")
  let lx = M
  if (CO.logo) { try { const fmt = /^data:image\/png/i.test(CO.logo) ? "PNG" : "JPEG"; pdf.addImage(CO.logo, fmt, M, 13, 20, 20, undefined, "FAST"); lx = M + 25 } catch { lx = M } }
  const [cl1, cl2] = contactLine(), lw = 112 - (lx - M)
  let hy = 17.5
  hy += txt(legalName() || "Votre entreprise", lx, hy, { sz: 13, b: true, w: lw }) - lh(13) + 5.2
  for (const s of [[CO.form, CO.owner].filter(Boolean).join(" · "), cl1, cl2].filter(Boolean) as string[]) hy += txt(s, lx, hy, { sz: 8.3, c: MUT, w: lw })
  const legal = legalLine(); if (legal) hy += 1 + txt(legal, lx, hy + 1, { sz: 7, c: MUT, w: lw })
  txt("DEVIS", W - M, 18.5, { sz: 9, b: true, c: ACC, al: "right" })
  txt(`N° ${d.num}`, W - M, 27, { sz: 18, b: true, al: "right" })
  y = Math.max(hy, 34) + 3

  // 2. une seule ligne : numéro · date · validité
  pdf.setFillColor(...SOFT); pdf.roundedRect(M, y, CW, 9, 1.6, 1.6, "F")
  const meta: [string, string][] = [["Devis n°", String(d.num)], ["Émis le", d.date], ["Valable jusqu'au", `${d.valid} (${d.validite} jours)`]]
  let mx = M + 4; meta.forEach(([a, b]) => { txt(a, mx, y + 5.8, { sz: 7.6, c: MUT }); font(7.6); const aw = pdf.getTextWidth(a) + 1.8; txt(b, mx + aw, y + 5.8, { sz: 8.4, b: true }); font(8.4, true); mx += aw + pdf.getTextWidth(b) + 9 })
  y += 13

  // 3. blocs Client / Chantier (hauteur = contenu le plus long)
  const bw = (CW - 6) / 2
  const cliL = [d.client.addr, d.client.phone && `Tél. ${d.client.phone}`, d.client.email].filter(Boolean) as string[]
  const cName = wrap(d.client.name || "Client", bw - 10, 10.5, true), cRest = cliL.flatMap(s => wrap(s, bw - 10, 8.5)), site = wrap(d.site || d.client.addr || "Adresse à préciser", bw - 10, 9.2, true)
  const bh = Math.max(9 + cName.length * lh(10.5) + cRest.length * lh(8.5), 9 + site.length * lh(9.2)) + 2
  ensure(bh)
  ;[M, M + bw + 6].forEach(x => { pdf.setDrawColor(...LINE); pdf.setLineWidth(.25); pdf.roundedRect(x, y, bw, bh, 2, 2, "S") })
  cap("Client", M + 5, y + 6); let cy = y + 11.2; cy += txt(cName, M + 5, cy, { sz: 10.5, b: true }); txt(cRest, M + 5, cy, { sz: 8.5, c: MUT })
  cap("Adresse du chantier", M + bw + 11, y + 6); txt(site, M + bw + 11, y + 11.2, { sz: 9.2, b: true })
  y += bh + 7

  // 4. objet des travaux
  const obj = wrap(d.objet || "Travaux", CW, 12, true); ensure(8 + obj.length * lh(12))
  cap("Objet des travaux", M, y); y += 5.2; y += txt(obj, M, y, { sz: 12, b: true }) + 1

  // 5. lignes (sections, description en dessous du libellé, en-tête répété à chaque page)
  autoTable(pdf, { theme: "plain", startY: y, margin: { left: M, right: M, top: 18, bottom: 300 - BOT }, showHead: "everyPage", rowPageBreak: "avoid",
    head: [["Désignation", "Qté", "Unité", "PU HT", "TVA", "Total HT"]],
    body: d.lines.map(x => x.k === "sec"
      ? [{ content: x.l, colSpan: 6, styles: { fontStyle: "bold", fontSize: 9.2, textColor: ACC, cellPadding: { top: 5, bottom: 2.2, left: 2.5, right: 2.5 } } }] as any
      : x.k === "rem" ? [{ content: x.l, styles: { fontStyle: "italic" } }, "", "", "", pct(x.tv), e2(x.q * x.pu)] as any
      : [{ content: x.d ? `${x.l}\n${x.d}` : x.l, _desc: !!x.d } as any, qty(x.q), x.u, e2(x.pu), pct(x.tv), e2(x.q * x.pu)]),
    styles: { font: "helvetica", fontSize: 8.8, textColor: INK, valign: "top", overflow: "linebreak", cellPadding: { top: 2.8, bottom: 2.8, left: 2.5, right: 2.5 }, lineColor: LINE, lineWidth: { bottom: .2 } as any },
    headStyles: { fillColor: SOFT, textColor: MUT, fontStyle: "bold", fontSize: 7.4, cellPadding: { top: 2.6, bottom: 2.6, left: 2.5, right: 2.5 } },
    columnStyles: { 0: { cellWidth: "auto" }, 1: { halign: "right", cellWidth: 14 }, 2: { halign: "center", cellWidth: 15 }, 3: { halign: "right", cellWidth: 25 }, 4: { halign: "right", cellWidth: 15 }, 5: { halign: "right", cellWidth: 27, fontStyle: "bold" } },
    didParseCell: (h: any) => { if (h.section === "head" && h.column.index > 0) h.cell.styles.halign = h.column.index === 2 ? "center" : "right" },
    // description : 2e ligne et suivantes en gris, plus petites (le libellé reste en noir)
    willDrawCell: (h: any) => { if (h.section === "body" && h.column.index === 0 && h.cell.raw?._desc) { const [first] = String(h.cell.raw.content).split("\n"); h.cell.__first = first } },
    didDrawCell: (h: any) => {
      if (h.section !== "body" || h.column.index !== 0 || !h.cell.__first) return
      const c = h.cell, pad = 2.5, x = c.x + pad, w = c.width - 2 * pad
      pdf.setFillColor(255, 255, 255); pdf.rect(c.x + .1, c.y + .1, c.width - .2, c.height - .4, "F")
      let yy = c.y + 2.8 + lh(8.8) * .72
      const l1 = wrap(c.__first, w, 8.8); txt(l1, x, yy, { sz: 8.8 }); yy += l1.length * lh(8.8) + .4
      const desc = String(c.raw.content).split("\n").slice(1).join("\n"); txt(wrap(desc, w, 7.8), x, yy, { sz: 7.8, c: MUT })
    },
  } as any)
  y = (pdf as any).lastAutoTable.finalY + 5

  // 6. totaux (à droite) + conditions de paiement (à gauche), gardés ensemble
  const rows: [string, string, number?][] = [
    ...(t.remise > 0.004 ? [["Total HT avant remise", e2(t.brut)], ["Remise", `- ${e2(t.remise)}`]] as [string, string][] : []),
    ["Total HT", e2(t.ht)],
    ...(CO.tvaNA ? [] : t.rates.map(r => [`TVA ${pct(r.r)} sur ${e2(r.base)}`, e2(r.tva)] as [string, string])),
    ["Total TTC", e2(t.ttc), 1],
    ...(d.acompte > 0 ? [[`Acompte à la signature (${String(d.acompte).replace(".", ",")} %)`, e2(t.acompte), 2]] as [string, string, number][] : []),
  ]
  const TW = 82, tx = W - M - TW, condW = CW - TW - 10, cond = wrap(conditionsText(d), condW, 8), notes = d.notes ? wrap(d.notes, condW, 8) : []
  const totH = rows.reduce((h, r) => h + (r[2] === 1 ? 11 : 6), 0) + 2, leftH = 6 + cond.length * lh(8) + (notes.length ? 8 + notes.length * lh(8) : 0)
  ensure(Math.max(totH, leftH) + 2)
  let ty = y + 1
  rows.forEach(([a, b, k]) => {
    if (k === 1) { pdf.setFillColor(...ACC); pdf.roundedRect(tx, ty - .5, TW, 9.5, 1.6, 1.6, "F"); txt(a, tx + 4, ty + 5.7, { sz: 10.5, b: true, c: [255, 255, 255] }); txt(b, W - M - 4, ty + 5.7, { sz: 10.5, b: true, c: [255, 255, 255], al: "right" }); ty += 11; return }
    txt(a, tx + 4, ty + 4, { sz: 8.4, c: k === 2 ? INK : MUT, b: k === 2 }); txt(b, W - M - 4, ty + 4, { sz: 8.6, b: k === 2, al: "right" })
    if (k !== 2) { pdf.setDrawColor(...LINE); pdf.setLineWidth(.2); pdf.line(tx + 4, ty + 6, W - M - 4, ty + 6) }
    ty += 6
  })
  let ly = y + 4; cap("Conditions de paiement", M, ly); ly += 4.6; ly += txt(cond, M, ly, { sz: 8, c: INK })
  if (notes.length) { ly += 3; cap("Remarques", M, ly); ly += 4.6; ly += txt(notes, M, ly, { sz: 8 }) }
  y = Math.max(ty, ly) + 4

  // 7. signature (bloc gardé entier)
  ensure(34)
  const sx = W - M - 86
  txt(devisGratuitLabel(), M, y + 5, { sz: 9, b: true, c: ACC })
  txt("Le client reconnaît avoir pris connaissance du présent devis et en accepte les conditions.", M, y + 10, { sz: 8, c: MUT, w: sx - M - 8 })
  pdf.setDrawColor(200, 200, 206); pdf.setLineWidth(.3); pdf.roundedRect(sx, y, 86, 30, 2, 2, "S")
  txt("Bon pour accord", sx + 5, y + 6.5, { sz: 9.5, b: true })
  if (sig) {
    txt(`Signé électroniquement par ${sig.nom}`, sx + 5, y + 12, { sz: 8, b: true, w: 76 })
    txt(`le ${frDT(sig.at)}`, sx + 5, y + 16.2, { sz: 7, c: MUT, w: 76 })
    if (sig.png) { try { pdf.addImage(sig.png, "PNG", sx + 48, y + 3, 34, 12, undefined, "FAST") } catch { /* image facultative */ } }
  } else {
    txt("Date :  ____ / ____ / ________", sx + 5, y + 13, { sz: 8, c: MUT })
    txt("Signature précédée de la mention « Devis reçu avant l'exécution des travaux, bon pour accord »", sx + 5, y + 23.5, { sz: 6.6, c: MUT, w: 76 })
  }
  y += 36

  // 8. mentions légales : conservées, mais discrètes (petites, grises, sur deux colonnes, à la fin)
  const ms = MENTIONS(d).filter(([h]) => h !== "Conditions de paiement")
  if (ms.length) {
    const SZ = 6.3, colW = (CW - 8) / 2, L = lh(SZ) * .96
    // flux ligne par ligne sur deux colonnes équilibrées (un paragraphe peut continuer en haut de la colonne suivante)
    const items: { s: string; b: boolean; gap: number }[] = []
    ms.forEach(([h, s0]) => { items.push({ s: h, b: true, gap: 0 }); wrap(s0, colW, SZ).forEach((l, i, arr) => items.push({ s: l, b: false, gap: i === arr.length - 1 ? 1.8 : 0 })) })
    ensure(14); pdf.setDrawColor(...LINE); pdf.setLineWidth(.2); pdf.line(M, y, W - M, y); y += 5
    txt("MENTIONS LÉGALES", M, y, { sz: 6.4, b: true, c: MUT }); y += 4
    let i = 0
    while (i < items.length) {
      const y0 = y, rest = items.slice(i).reduce((a2, it) => a2 + L + it.gap, 0), room = BOT - y0
      const target = Math.min(room, rest / 2 + L)
      let yc = y0, col = 0, maxY = y0
      while (i < items.length) {
        const it = items[i], lim = col === 0 ? y0 + target : BOT
        if (yc + L > lim && !(it.b === false && items[i - 1]?.b)) { if (col === 0) { col = 1; yc = y0; continue } break }
        font(SZ, it.b, MUT); pdf.text(it.s, M + col * (colW + 8), yc); yc += L + it.gap; maxY = Math.max(maxY, yc); i++
      }
      y = maxY
      if (i < items.length) newPage()
    }
  }
  if (sig) certificate(pdf, d, sig, (s, x, yy, o) => Math.round(txt(s, x, yy, o) / lh(o?.sz || 9)), { W, M, ACC, MUT })
  const n = pdf.getNumberOfPages()
  for (let i = 1; i <= n; i++) { pdf.setPage(i); pdf.setDrawColor(...LINE); pdf.setLineWidth(.2); pdf.line(M, 285, W - M, 285); txt(CO.pied || [legalName(), CO.siret && `SIRET ${CO.siret}`, CO.rm].filter(Boolean).join(" · "), M, 289, { sz: 6.5, c: MUT, w: CW - 26 }); txt(`Devis n° ${d.num} · page ${i} / ${n}`, W - M, 289, { sz: 6.5, c: MUT, al: "right" }) }
  return pdf
}
export const downloadPdf = (d: DDoc, sig?: SignProof) => makePdf(d, sig).save(`Devis-${d.num}${sig ? "-signe" : ""}.pdf`)

type Txt = (s: string, x: number, y: number, o?: { sz?: number; b?: boolean; c?: number[]; al?: "right" | "left" | "center"; w?: number }) => number
/** Page « Certificat de signature électronique » : identité déclarée, horodatage, IP, navigateur, empreinte SHA-256, journal chaîné. */
function certificate(pdf: jsPDF, d: DDoc, sig: SignProof, txt: Txt, k: { W: number; M: number; ACC: [number, number, number]; MUT: [number, number, number] }) {
  const { W, M, ACC, MUT } = k
  pdf.addPage(); pdf.setFillColor(...ACC); pdf.rect(0, 0, W, 2.2, "F")
  txt("Certificat de signature électronique", M, 22, { sz: 16, b: true })
  txt(`Devis n° ${d.num} — ${legalName() || "Entreprise"} · client : ${d.client.name}`, M, 29, { sz: 9.5, c: MUT })
  let y = 40
  const row = (a: string, b: string) => { txt(a, M, y, { sz: 8, b: true, c: ACC }); const n = txt(b, M + 52, y, { sz: 8.5, w: W - 2 * M - 52 }); y += Math.max(6, n * 4.2 + 1.8) }
  row("Signataire (nom déclaré)", sig.nom)
  row("Date et heure", frDT(sig.at))
  const sev = [...(sig.events || [])].reverse().find(e => e.event === "signature")
  row("Adresse IP", sig.ip || sev?.ip || "—")
  row("Navigateur", (sig.ua || sev?.ua || "—").slice(0, 240))
  row("Empreinte du devis", `SHA-256 ${sig.hash}`)
  row("Procédé", "Signature électronique simple au sens du règlement (UE) n° 910/2014 « eIDAS » (art. 3 et 25) : signature tracée à l'écran, nom saisi, case « Bon pour accord » cochée, horodatage serveur et journal de preuve chaîné (art. 1366 et 1367 du Code civil).")
  if (sig.certifTva) row("Taux réduit de TVA", "Le client a certifié les conditions du taux réduit (mention reproduite sur le devis).")
  if (sig.png) { txt("Signature", M, y + 2, { sz: 8, b: true, c: ACC }); try { pdf.addImage(sig.png, "PNG", M + 52, y - 3, 60, 20, undefined, "FAST") } catch { /* */ } y += 24 }
  y += 4; txt("Journal de preuve (chaque entrée inclut l'empreinte de la précédente)", M, y, { sz: 9, b: true }); y += 6
  for (const e of sig.events || []) {
    if (y > 268) { pdf.addPage(); y = 20 }
    txt(`${frDT(e.at)} · ${EV[e.event] || e.event}${e.ip ? ` · IP ${e.ip}` : ""}`, M, y, { sz: 8 })
    txt(`empreinte ${e.event_hash}`, M, y + 3.8, { sz: 6.5, c: MUT }); y += 9
  }
  y += 4; txt("Pour vérifier l'intégrité : recalculer l'empreinte SHA-256 du contenu du devis (numéro, client, lignes, totaux) et la comparer à celle ci-dessus. Le document et son journal sont conservés par l'artisan pendant au moins 10 ans.", M, y, { sz: 7.5, c: MUT, w: W - 2 * M })
}
