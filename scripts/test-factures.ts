/* update61 · Tests facturation : numérotation, totaux, acomptes, situations/solde, XML Factur-X, PDF/A-3.
   npm run test:factures   (aucun appel réseau, aucune écriture en base)
   FX_OUT=/tmp/fx npm run test:factures  → écrit aussi des exemples PDF Factur-X + XML pour validation externe. */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { acompteLines, cleanLines, computeFacture, r2, sequenceGaps, situationLines, soldeLines, unitCode, type FLine } from "../api/_lib/factureCalc"
import { buildCII, splitCity, toFacturX } from "../src/lib/facturx"
import { devisToFactureLines } from "../api/_lib/factureCalc"
import { computeTotals, toStored, type EdLine } from "../src/lib/devisCalc"
import { PDFDocument, PDFName, PDFDict, PDFArray } from "pdf-lib"

let ok = 0, ko = 0
const T = (name: string, pass: boolean, info?: unknown) => { pass ? ok++ : ko++; console.log(`${pass ? "✔" : "✘"} ${name}${pass || info === undefined ? "" : ` → ${JSON.stringify(info)}`}`) }
const sumTTC = (ls: FLine[][]) => r2(ls.reduce((a, l) => a + computeFacture(l).ttc, 0))
const sumHT = (ls: FLine[][]) => r2(ls.reduce((a, l) => a + computeFacture(l).ht, 0))

;(async () => {
  // 1) Numérotation continue
  T("séquence continue sans trou", sequenceGaps(["F-2026-0001", "F-2026-0002", "A-2026-0003", "F-2026-0004"]).length === 0)
  T("trou détecté", sequenceGaps(["F-2026-0001", "F-2026-0003"]).join() === "2026 : numéros 2 à 2 manquants")
  T("doublon détecté", sequenceGaps(["F-2026-0001", "F-2026-0001"]).some(x => x.includes("double")))
  T("séquence repart à 1 chaque année", sequenceGaps(["F-2025-0001", "F-2025-0002", "F-2026-0001"]).length === 0)
  T("première facture de l'année ≠ 1 détectée", sequenceGaps(["F-2026-0002"]).length === 1)

  // 2) Totaux (arrondi EN 16931 : TVA par taux)
  const L: FLine[] = [{ l: "Main d'œuvre", q: 7.5, u: "h", pu: 45, tv: 10 }, { l: "Mitigeur", q: 1, u: "u", pu: 89.9, tv: 10 }, { l: "Remise", q: 1, u: "u", pu: -20, tv: 10 }, { l: "Matériel 20 %", q: 3, u: "u", pu: 12.33, tv: 20 }]
  const t = computeFacture(L)
  T("total HT", t.ht === 444.39, t)
  T("TVA par taux", t.rates.length === 2 && t.rates[0].r === 10 && t.rates[0].base === 407.4 && t.rates[0].tva === 40.74 && t.rates[1].tva === 7.4, t.rates)
  T("TTC = HT + TVA", t.ttc === r2(t.ht + t.tva) && t.ttc === 492.53, t)
  T("franchise 293 B : TVA nulle", computeFacture(L, { zeroTva: true }).tva === 0)
  const tr = computeFacture(L, { acompteDeduit: 100, retenuePct: 5 })
  T("retenue de garantie 5 % du TTC et net à payer", tr.retenue === 24.63 && tr.net === r2(492.53 - 100 - 24.63), tr)
  T("retenue plafonnée à 5 %", computeFacture(L, { retenuePct: 12 }).retenue === 24.63)
  T("arrondi demi-centime au-dessus", r2(1.005) === 1.01 && r2(-1.005) === -1.01)
  const raw = cleanLines([{ k: "sec", l: "Section" }, { l: "A", q: 2, pu: 10, tv: 7 }, { l: "", q: 1, pu: 5 }, { l: "Rem", q: 1, pu: -5, tv: 0, k: "rem" }, ...Array.from({ length: 30 }, (_, i) => ({ l: `L${i}`, q: 1, pu: 1, tv: 20 }))])
  T("lignes nettoyées (sections ignorées, taux illégal → 20, 0 % gardé, > 16 lignes)", raw.length === 32 && raw[0].tv === 20 && raw[1].tv === 0 && raw[1].pu === -5)

  // 3) Acompte : une ligne par taux
  const ac = acompteLines(L, 30, "D-2026-0042")
  T("acompte : une ligne par taux de TVA", ac.length === 2 && ac[0].tv === 10 && ac[1].tv === 20, ac)
  T("acompte : 30 % du HT", r2(computeFacture(ac).ht) === r2(407.4 * .3 + 36.99 * .3), computeFacture(ac))

  // 4) Situations + solde = devis exactement (aucun écart d'arrondi)
  const D: FLine[] = [{ l: "Gros œuvre", q: 1, u: "fft", pu: 3333.33, tv: 10 }, { l: "Placo", q: 37.3, u: "m²", pu: 27.77, tv: 10 }, { l: "Fournitures", q: 1, u: "u", pu: 999.99, tv: 20 }]
  const s1 = situationLines(D, [], 33.33, 1), s2 = situationLines(D, [33.33], 66.67, 2), so = soldeLines(D, [33.33, 66.67])
  T("situations + solde : HT identique au devis", sumHT([s1, s2, so]) === computeFacture(D).ht, { parts: sumHT([s1, s2, so]), devis: computeFacture(D).ht })
  T("situations + solde : chaque ligne exacte", D.every((x, i) => r2(s1[i].pu + s2[i].pu + so[i].pu) === r2(x.q * x.pu)))
  T("situations + solde : TTC à ±1 centime par taux", Math.abs(sumTTC([s1, s2, so]) - computeFacture(D).ttc) <= .02, { parts: sumTTC([s1, s2, so]), devis: computeFacture(D).ttc })
  T("situation à 100 % = solde", JSON.stringify(situationLines(D, [40], 100, 2).map(x => x.pu)) === JSON.stringify(soldeLines(D, [40]).map(x => x.pu)))
  let threw = false; try { situationLines(D, [50], 40, 2) } catch { threw = true }
  T("avancement en recul refusé", threw)
  T("solde sans situation = devis complet", JSON.stringify(soldeLines(D, [])) === JSON.stringify(D))

  // 5) XML CII EN 16931
  T("unités UN/ECE", unitCode("h") === "HUR" && unitCode("m²") === "MTK" && unitCode("forfait") === "LS" && unitCode("u") === "C62")
  T("découpage adresse", splitCity("12 rue des Lilas, 69003 Lyon").cp === "69003" && splitCity("12 rue des Lilas, 69003 Lyon").rest === "12 rue des Lilas")
  const base = {
    numero: "F-2026-0007", type: "facture" as const, dateEmission: "2026-11-21", dateExecution: "2026-11-18", dateEcheance: "2026-12-21",
    seller: { name: "Plomberie Martin SARL", siren: "123456789", tva: "FR32123456789", addr: "4 rue de la Gare", cpVille: "69003 Lyon", email: "contact@martin.fr", iban: "FR7630006000011234567890189", bic: "AGRIFRPP" },
    buyer: { name: "Mme Durand", addr: "8 avenue Foch, 69006 Lyon", email: "durand@example.fr" },
    chantier: "2 impasse des Prés, 69100 Villeurbanne", nature: "services", objet: "Rénovation salle de bains", devisNumero: "D-2026-0042",
    lines: L, acompteDeduit: 100, retenuePct: 0, notes: { pmt: "Indemnité 40 €", pmd: "Pénalités", aab: "Pas d'escompte" }, paymentTerms: "Virement à 30 jours",
  }
  const xml = buildCII(base)
  T("XML : profil EN 16931", xml.includes("<ram:ID>urn:cen.eu:en16931:2017</ram:ID>"))
  T("XML : cadre de facturation S1 (services)", xml.includes("<ram:ID>S1</ram:ID>"))
  T("XML : SIREN vendeur (0002) et adresse électronique (0225)", xml.includes('schemeID="0002">123456789') && xml.includes('schemeID="0225">123456789'))
  T("XML : remise en quantité négative (BR-27)", xml.includes(">-1</ram:BilledQuantity>") && !xml.includes("<ram:ChargeAmount>-"))
  T("XML : totaux cohérents", xml.includes("<ram:GrandTotalAmount>492.53</ram:GrandTotalAmount>") && xml.includes("<ram:DuePayableAmount>392.53</ram:DuePayableAmount>") && xml.includes("<ram:TotalPrepaidAmount>100.00</ram:TotalPrepaidAmount>"))
  T("XML : adresse de livraison distincte", xml.includes("<ram:ShipToTradeParty>") && xml.includes("Villeurbanne"))
  T("XML : virement IBAN/BIC", xml.includes("<ram:TypeCode>58</ram:TypeCode>") && xml.includes("<ram:IBANID>FR7630006000011234567890189</ram:IBANID>"))
  T("XML : exigibilité TVA (encaissements 72 / débits 5)", xml.includes("<ram:DueDateTypeCode>72</ram:DueDateTypeCode>") && buildCII({ ...base, tvaSurDebits: true }).includes("<ram:DueDateTypeCode>5</ram:DueDateTypeCode>"))
  const xa = buildCII({ ...base, type: "avoir", numero: "A-2026-0008", origine: { numero: "F-2026-0007", date: "2026-11-21" } })
  T("XML : avoir 381 + facture d'origine", xa.includes("<ram:TypeCode>381</ram:TypeCode>") && xa.includes("<ram:InvoiceReferencedDocument><ram:IssuerAssignedID>F-2026-0007"))
  T("XML : acompte 386", buildCII({ ...base, type: "acompte" }).includes("<ram:TypeCode>386</ram:TypeCode>"))
  const xf = buildCII({ ...base, seller: { ...base.seller, franchise: true } })
  T("XML : franchise catégorie E + VATEX-FR-FRANCHISE", xf.includes("<ram:CategoryCode>E</ram:CategoryCode>") && xf.includes("VATEX-FR-FRANCHISE"))
  const xae = buildCII({ ...base, autoliquidation: true, buyer: { ...base.buyer, siren: "987654321", tva: "FR11987654321", pro: true } })
  T("XML : autoliquidation catégorie AE + SIREN client", xae.includes("<ram:CategoryCode>AE</ram:CategoryCode>") && xae.includes('schemeID="0002">987654321'))
  T("XML : caractères échappés", buildCII({ ...base, buyer: { ...base.buyer, name: "Dupont & Fils <SARL>" } }).includes("Dupont &amp; Fils &lt;SARL&gt;"))

  // 6) PDF/A-3 + XML joint
  const { jsPDF } = await import("jspdf")
  const pdf = new jsPDF({ unit: "mm", format: "a4" })
  pdf.addFileToVFS("DroidSans.ttf", readFileSync("public/facturx/DroidSans.ttf").toString("base64")); pdf.addFont("DroidSans.ttf", "DroidSans", "normal"); pdf.setFont("DroidSans", "normal")
  pdf.text("Facture F-2026-0007 · œ é € 40 €", 20, 20)
  const icc = new Uint8Array(readFileSync("public/facturx/sRGB2014.icc"))
  const fx = await toFacturX(pdf.output("arraybuffer"), xml, { title: "Facture F-2026-0007", author: "Plomberie Martin", icc })
  const doc = await PDFDocument.load(fx)
  const cat = doc.catalog
  const af = cat.lookup(PDFName.of("AF"), PDFArray)
  const oi = cat.lookup(PDFName.of("OutputIntents"), PDFArray)
  const names = cat.lookup(PDFName.of("Names"), PDFDict)
  T("PDF : /AF (fichier associé) présent", !!af && af.size() === 1)
  T("PDF : OutputIntent sRGB", !!oi && oi.size() === 1)
  T("PDF : factur-x.xml joint", !!names && Buffer.from(fx).includes(Buffer.from("factur-x.xml")))
  T("PDF : XMP PDF/A-3B + Factur-X EN 16931", Buffer.from(fx).includes(Buffer.from("<pdfaid:part>3</pdfaid:part>")) && Buffer.from(fx).includes(Buffer.from("<fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>")))
  T("PDF : aucune police standard non incorporée", !/\/BaseFont\s*\/Helvetica/.test(Buffer.from(fx).toString("latin1")))

  // update73 · remises : globale en € et remise sur une ligne, du devis jusqu'au Factur-X
  {
    const items: EdLine[] = [
      { id: "a", k: "mo", l: "Pose", d: "", q: 4, u: "h", pu: 55, tv: 10 },
      { id: "b", k: "fo", l: "Mitigeur", d: "", q: 2, u: "u", pu: 120, tv: 20, rl: { t: "pct", v: 10 } },
      { id: "c", k: "fft", l: "Déplacement", d: "", q: 1, u: "forfait", pu: 40, tv: 10, rl: { t: "eur", v: 15 } },
    ]
    const meta = { v: 2 as const, remise: { t: "eur" as const, v: 50 } }
    const tot = computeTotals(items, meta)
    // brut 220 + 240 + 40 = 500 ; remises lignes 24 + 15 = 39 ; net 461 ; remise globale 50 € répartie au prorata (10 % : 245 / 20 % : 216)
    T("remises : total HT avant remise = 500,00", tot.brut === 500, tot)
    T("remises : remise ligne 10 % + 15 € + globale 50 € = 89,00", tot.remise === 89, tot)
    T("remises : total HT = 411,00", tot.ht === 411, tot)
    const r10 = tot.rates.find(r => r.r === 10), r20 = tot.rates.find(r => r.r === 20)
    T("remises : TVA calculée après remise, juste pour chaque taux", !!r10 && !!r20 && r10.base === 218.43 && r20.base === 192.57 && r10.tva === 21.84 && r20.tva === 38.51, tot.rates)
    const stored = toStored(items, meta)
    T("remise de ligne : ligne négative juste sous la ligne, même taux", stored[2].k === "rem" && stored[2].pu === -24 && stored[2].tv === 20 && /Remise 10 %/.test(stored[2].l), stored.slice(0, 4))
    const fl = devisToFactureLines(stored), ft = computeFacture(fl)
    T("devis → facture : remises conservées, totaux identiques", ft.ht === tot.ht && ft.ttc === tot.ttc && fl.filter(l => l.pu < 0).length === 4, { ht: ft.ht, ttc: ft.ttc, n: fl.filter(l => l.pu < 0).length })
    const xr = buildCII({ ...base, lines: fl, acompteDeduit: 0 })
    T("Factur-X : remises en lignes à quantité négative (BR-27), aucun prix négatif", (xr.match(/>-1<\/ram:BilledQuantity>/g) || []).length === 4 && !xr.includes("<ram:ChargeAmount>-"))
    T("Factur-X : totaux après remise (HT 411,00 · TTC " + tot.ttc.toFixed(2) + ")", xr.includes("<ram:TaxBasisTotalAmount>411.00</ram:TaxBasisTotalAmount>") && xr.includes(`<ram:GrandTotalAmount>${tot.ttc.toFixed(2)}</ram:GrandTotalAmount>`))
  }

  if (process.env.FX_OUT) {
    mkdirSync(process.env.FX_OUT, { recursive: true })
    for (const [n, x] of [["facture", xml], ["avoir", xa], ["franchise", xf], ["autoliquidation", xae]] as const) writeFileSync(`${process.env.FX_OUT}/${n}.xml`, x)
    writeFileSync(`${process.env.FX_OUT}/facture-facturx.pdf`, fx)
    console.log(`exemples écrits dans ${process.env.FX_OUT}`)
  }
  console.log(`\n${ok}/${ok + ko} tests factures OK`)
  process.exit(ko ? 1 : 0)
})()
