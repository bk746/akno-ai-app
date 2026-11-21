/* update61 · Facture électronique Factur-X (profil EN 16931) :
   - XML CII (UN/CEFACT Cross Industry Invoice D16B) conforme à la norme EN 16931
   - PDF/A-3 : polices incorporées, profil de couleur sRGB, métadonnées XMP Factur-X, XML joint (AFRelationship = Data)
   Formats « socle » de la réforme : Factur-X, UBL, CII. La transmission passe par une plateforme agréée (partenaire, à brancher). */
import { AFRelationship, PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, PDFRef, PDFString, decodePDFRawStream } from "pdf-lib"
import { computeFacture, unitCode, type FLine } from "../../api/_lib/factureCalc"

export type CiiParty = { name: string; siren?: string; tva?: string; addr?: string; cpVille?: string; email?: string }
export type CiiInput = {
  numero: string; type: "facture" | "acompte" | "situation" | "solde" | "avoir"; dateEmission: string; dateExecution?: string | null; dateEcheance?: string | null
  seller: CiiParty & { iban?: string; bic?: string; franchise?: boolean }
  buyer: CiiParty & { pro?: boolean }
  chantier?: string | null; nature?: string; objet?: string | null; devisNumero?: string | null
  lines: FLine[]; acompteDeduit?: number; retenuePct?: number; autoliquidation?: boolean; tvaSurDebits?: boolean
  origine?: { numero: string; date?: string | null } | null
  notes: { pmt: string; pmd: string; aab: string; other?: string[] }
  paymentTerms: string
}

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
const amt = (n: number) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2)
const qtyS = (n: number) => String(Math.round((Number(n) || 0) * 10000) / 10000)
const d102 = (iso?: string | null) => String(iso || "").slice(0, 10).replace(/-/g, "")
const digits = (s?: string) => String(s || "").replace(/\D/g, "")
const vatId = (s?: string) => String(s || "").replace(/\s/g, "").toUpperCase()
/** « 12 rue des Lilas, 69003 Lyon » ou « 69003 Lyon » → { cp, ville } */
export function splitCity(s?: string | null) {
  const t = String(s || "").trim(), m = /(\d{5})\s+([^,]+)\s*$/.exec(t)
  return m ? { cp: m[1], ville: m[2].trim(), rest: t.slice(0, m.index).replace(/[,\s]+$/, "") } : { cp: "", ville: "", rest: t }
}
const TYPE_CODE: Record<CiiInput["type"], string> = { facture: "380", situation: "380", solde: "380", acompte: "386", avoir: "381" }
/** Cadre de facturation (BT-23, spécification française) : B1 biens, S1 services, M1 mixte. */
const CADRE: Record<string, string> = { biens: "B1", services: "S1", mixte: "M1" }

function address(p: { addr?: string; cpVille?: string }) {
  const a = splitCity(p.cpVille || p.addr), street = p.cpVille ? (p.addr || "") : a.rest
  return `<ram:PostalTradeAddress>${a.cp ? `<ram:PostcodeCode>${esc(a.cp)}</ram:PostcodeCode>` : ""}${street ? `<ram:LineOne>${esc(street)}</ram:LineOne>` : ""}${a.ville ? `<ram:CityName>${esc(a.ville)}</ram:CityName>` : ""}<ram:CountryID>FR</ram:CountryID></ram:PostalTradeAddress>`
}

export function buildCII(x: CiiInput): string {
  const zero = !!x.autoliquidation || !!x.seller.franchise
  const t = computeFacture(x.lines, { zeroTva: zero, acompteDeduit: x.acompteDeduit, retenuePct: x.retenuePct })
  const cat = (r: number) => x.seller.franchise ? "E" : x.autoliquidation ? "AE" : r === 0 ? "Z" : "S"
  const exemption = (c: string) => c === "E" ? "<ram:ExemptionReason>TVA non applicable, art. 293 B du CGI</ram:ExemptionReason>" : c === "AE" ? "<ram:ExemptionReason>Autoliquidation</ram:ExemptionReason>" : ""
  const exemptionCode = (c: string) => c === "E" ? "<ram:ExemptionReasonCode>VATEX-FR-FRANCHISE</ram:ExemptionReasonCode>" : c === "AE" ? "<ram:ExemptionReasonCode>VATEX-EU-AE</ram:ExemptionReasonCode>" : ""
  const sellerSiren = digits(x.seller.siren).slice(0, 9), buyerSiren = digits(x.buyer.siren).slice(0, 9)
  const notes: [string, string][] = [["PMT", x.notes.pmt], ["PMD", x.notes.pmd], ["AAB", x.notes.aab], ...(x.notes.other || []).map(s => ["TXD", s] as [string, string])]
  const lines = x.lines.map((l, i) => {
    const neg = Number(l.pu) < 0, q = neg ? -Number(l.q) : Number(l.q), pu = Math.abs(Number(l.pu)), r = zero ? 0 : Number(l.tv ?? 20), c = cat(r)
    const [name, ...desc] = String(l.l || "").split("\n")
    return `<ram:IncludedSupplyChainTradeLineItem><ram:AssociatedDocumentLineDocument><ram:LineID>${i + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>`
      + `<ram:SpecifiedTradeProduct><ram:Name>${esc(name.slice(0, 250) || "Prestation")}</ram:Name>${desc.join(" ").trim() ? `<ram:Description>${esc(desc.join(" ").trim().slice(0, 1000))}</ram:Description>` : ""}</ram:SpecifiedTradeProduct>`
      + `<ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${amt(pu)}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>`
      + `<ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="${unitCode(l.u)}">${qtyS(q)}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>`
      + `<ram:SpecifiedLineTradeSettlement><ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${c}</ram:CategoryCode><ram:RateApplicablePercent>${r}</ram:RateApplicablePercent></ram:ApplicableTradeTax>`
      + `<ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${amt(Math.round(Number(l.q) * Number(l.pu) * 100) / 100)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement></ram:IncludedSupplyChainTradeLineItem>`
  }).join("")
  let dueCode = false // CII-SR-462 : un seul DueDateTypeCode (exigibilité) par facture
  const rates = (t.rates.length ? t.rates : [{ r: 0, base: 0, tva: 0 }]).map(r => {
    const c = cat(r.r), withDue = c === "S" && !dueCode
    if (withDue) dueCode = true
    return `<ram:ApplicableTradeTax><ram:CalculatedAmount>${amt(r.tva)}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode>${exemption(c)}<ram:BasisAmount>${amt(r.base)}</ram:BasisAmount><ram:CategoryCode>${c}</ram:CategoryCode>${exemptionCode(c)}${withDue ? `<ram:DueDateTypeCode>${x.tvaSurDebits ? "5" : "72"}</ram:DueDateTypeCode>` : ""}<ram:RateApplicablePercent>${r.r}</ram:RateApplicablePercent></ram:ApplicableTradeTax>`
  }).join("")
  const shipTo = x.chantier && x.chantier.trim() && x.chantier.trim() !== String(x.buyer.addr || "").trim()
    ? `<ram:ShipToTradeParty>${address({ addr: x.chantier })}</ram:ShipToTradeParty>` : ""
  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">`
    + `<rsm:ExchangedDocumentContext><ram:BusinessProcessSpecifiedDocumentContextParameter><ram:ID>${CADRE[x.nature || "services"] || "S1"}</ram:ID></ram:BusinessProcessSpecifiedDocumentContextParameter><ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter></rsm:ExchangedDocumentContext>`
    + `<rsm:ExchangedDocument><ram:ID>${esc(x.numero)}</ram:ID><ram:TypeCode>${TYPE_CODE[x.type]}</ram:TypeCode><ram:IssueDateTime><udt:DateTimeString format="102">${d102(x.dateEmission)}</udt:DateTimeString></ram:IssueDateTime>`
    + notes.filter(([, s]) => s && s.trim()).map(([k, s]) => `<ram:IncludedNote><ram:Content>${esc(s)}</ram:Content><ram:SubjectCode>${k}</ram:SubjectCode></ram:IncludedNote>`).join("")
    + `</rsm:ExchangedDocument><rsm:SupplyChainTradeTransaction>${lines}`
    + `<ram:ApplicableHeaderTradeAgreement>`
    + `<ram:SellerTradeParty><ram:Name>${esc(x.seller.name)}</ram:Name>${sellerSiren ? `<ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${sellerSiren}</ram:ID></ram:SpecifiedLegalOrganization>` : ""}${address(x.seller)}`
    + (sellerSiren ? `<ram:URIUniversalCommunication><ram:URIID schemeID="0225">${sellerSiren}</ram:URIID></ram:URIUniversalCommunication>` : x.seller.email ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${esc(x.seller.email)}</ram:URIID></ram:URIUniversalCommunication>` : "")
    + (x.seller.tva && !x.seller.franchise ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(vatId(x.seller.tva))}</ram:ID></ram:SpecifiedTaxRegistration>` : sellerSiren ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${sellerSiren}</ram:ID></ram:SpecifiedTaxRegistration>` : "")
    + `</ram:SellerTradeParty>`
    + `<ram:BuyerTradeParty><ram:Name>${esc(x.buyer.name)}</ram:Name>${buyerSiren ? `<ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${buyerSiren}</ram:ID></ram:SpecifiedLegalOrganization>` : ""}${address({ addr: x.buyer.addr })}`
    + (buyerSiren ? `<ram:URIUniversalCommunication><ram:URIID schemeID="0225">${buyerSiren}</ram:URIID></ram:URIUniversalCommunication>` : x.buyer.email ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${esc(x.buyer.email)}</ram:URIID></ram:URIUniversalCommunication>` : "")
    + (x.buyer.tva ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(vatId(x.buyer.tva))}</ram:ID></ram:SpecifiedTaxRegistration>` : "")
    + `</ram:BuyerTradeParty>`
    + (x.devisNumero ? `<ram:ContractReferencedDocument><ram:IssuerAssignedID>${esc(x.devisNumero)}</ram:IssuerAssignedID></ram:ContractReferencedDocument>` : "")
    + `</ram:ApplicableHeaderTradeAgreement>`
    + `<ram:ApplicableHeaderTradeDelivery>${shipTo}${x.dateExecution ? `<ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime><udt:DateTimeString format="102">${d102(x.dateExecution)}</udt:DateTimeString></ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent>` : ""}</ram:ApplicableHeaderTradeDelivery>`
    + `<ram:ApplicableHeaderTradeSettlement><ram:PaymentReference>${esc(x.numero)}</ram:PaymentReference><ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>`
    + (x.seller.iban && x.type !== "avoir" ? `<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${esc(x.seller.iban.replace(/\s/g, "").toUpperCase())}</ram:IBANID></ram:PayeePartyCreditorFinancialAccount>${x.seller.bic ? `<ram:PayeeSpecifiedCreditorFinancialInstitution><ram:BICID>${esc(x.seller.bic.replace(/\s/g, "").toUpperCase())}</ram:BICID></ram:PayeeSpecifiedCreditorFinancialInstitution>` : ""}</ram:SpecifiedTradeSettlementPaymentMeans>` : "")
    + rates
    + `<ram:SpecifiedTradePaymentTerms><ram:Description>${esc(x.paymentTerms)}</ram:Description>${x.dateEcheance && x.type !== "avoir" ? `<ram:DueDateDateTime><udt:DateTimeString format="102">${d102(x.dateEcheance)}</udt:DateTimeString></ram:DueDateDateTime>` : ""}</ram:SpecifiedTradePaymentTerms>`
    + `<ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:LineTotalAmount>${amt(t.ht)}</ram:LineTotalAmount><ram:TaxBasisTotalAmount>${amt(t.ht)}</ram:TaxBasisTotalAmount><ram:TaxTotalAmount currencyID="EUR">${amt(t.tva)}</ram:TaxTotalAmount><ram:GrandTotalAmount>${amt(t.ttc)}</ram:GrandTotalAmount>${t.acompte ? `<ram:TotalPrepaidAmount>${amt(t.acompte)}</ram:TotalPrepaidAmount>` : ""}<ram:DuePayableAmount>${amt(t.ttc - t.acompte)}</ram:DuePayableAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation>`
    + (x.origine?.numero ? `<ram:InvoiceReferencedDocument><ram:IssuerAssignedID>${esc(x.origine.numero)}</ram:IssuerAssignedID>${x.origine.date ? `<ram:FormattedIssueDateTime><qdt:DateTimeString format="102">${d102(x.origine.date)}</qdt:DateTimeString></ram:FormattedIssueDateTime>` : ""}</ram:InvoiceReferencedDocument>` : "")
    + `</ram:ApplicableHeaderTradeSettlement></rsm:SupplyChainTradeTransaction></rsm:CrossIndustryInvoice>`
}

/* ---------------- PDF/A-3 + XML joint ---------------- */
const xmpDate = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z")
function xmp(o: { title: string; author: string; producer: string; creator: string; date: Date; docId: string }) {
  const D = xmpDate(o.date)
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"><pdfaid:part>3</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance></rdf:Description>
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
   <dc:format>application/pdf</dc:format>
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${esc(o.title)}</rdf:li></rdf:Alt></dc:title>
   <dc:creator><rdf:Seq><rdf:li>${esc(o.author)}</rdf:li></rdf:Seq></dc:creator>
   <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${esc(o.title)}</rdf:li></rdf:Alt></dc:description>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/"><pdf:Producer>${esc(o.producer)}</pdf:Producer></rdf:Description>
  <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/"><xmp:CreatorTool>${esc(o.creator)}</xmp:CreatorTool><xmp:CreateDate>${D}</xmp:CreateDate><xmp:ModifyDate>${D}</xmp:ModifyDate><xmp:MetadataDate>${D}</xmp:MetadataDate></rdf:Description>
  <rdf:Description rdf:about="" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/"><xmpMM:DocumentID>uuid:${o.docId}</xmpMM:DocumentID></rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
   <pdfaExtension:schemas><rdf:Bag><rdf:li rdf:parseType="Resource">
    <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
    <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
    <pdfaSchema:prefix>fx</pdfaSchema:prefix>
    <pdfaSchema:property><rdf:Seq>
     <rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentFileName</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The name of the embedded XML document</pdfaProperty:description></rdf:li>
     <rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentType</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The type of the hybrid document in capital letters, e.g. INVOICE or ORDER</pdfaProperty:description></rdf:li>
     <rdf:li rdf:parseType="Resource"><pdfaProperty:name>Version</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The actual version of the standard applying to the embedded XML document</pdfaProperty:description></rdf:li>
     <rdf:li rdf:parseType="Resource"><pdfaProperty:name>ConformanceLevel</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The conformance level of the embedded XML document</pdfaProperty:description></rdf:li>
    </rdf:Seq></pdfaSchema:property>
   </rdf:li></rdf:Bag></pdfaExtension:schemas>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#"><fx:DocumentType>INVOICE</fx:DocumentType><fx:DocumentFileName>factur-x.xml</fx:DocumentFileName><fx:Version>1.0</fx:Version><fx:ConformanceLevel>EN 16931</fx:ConformanceLevel></rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`
}

const STD_FONTS = /^(Helvetica|Times|Courier|Symbol|ZapfDingbats)/
/** Transforme un PDF (polices incorporées) en Factur-X : PDF/A-3B + factur-x.xml joint. */
export async function toFacturX(pdfBytes: ArrayBuffer | Uint8Array, xml: string, meta: { title: string; author: string; icc: Uint8Array }): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { updateMetadata: false })
  const ctx = doc.context, now = new Date(Math.floor(Date.now() / 1000) * 1000)
  // 1. Polices standard non incorporées déclarées par jsPDF mais inutilisées : retirées des ressources (PDF/A exige des polices incorporées)
  const pages = doc.getPages()
  let allContent = "", unreadable = false
  for (const page of pages) {
    try {
      const content = page.node.Contents()
      const streams = content instanceof PDFArray ? content.asArray().map(r => ctx.lookup(r)) : [content]
      for (const s of streams) if (s instanceof PDFRawStream) allContent += new TextDecoder("latin1").decode(decodePDFRawStream(s).decode()) + "\n"
    } catch { unreadable = true }
  }
  if (!unreadable) for (const page of pages) {
    const fonts = page.node.Resources()?.lookupMaybe(PDFName.of("Font"), PDFDict)
    if (!fonts) continue
    for (const [k, v] of fonts.entries()) {
      const f = ctx.lookup(v)
      const base = f instanceof PDFDict ? f.get(PDFName.of("BaseFont")) : undefined
      if (base instanceof PDFName && STD_FONTS.test(base.decodeText()) && !allContent.includes(`/${k.decodeText()} `)) {
        fonts.delete(k)
        if (v instanceof PDFRef) ctx.delete(v)
      }
    }
  }
  // 2. Métadonnées (Info + XMP identiques)
  const producer = "Akno (jsPDF + pdf-lib)", creator = "Akno"
  doc.setTitle(meta.title); doc.setAuthor(meta.author); doc.setProducer(producer); doc.setCreator(creator); doc.setCreationDate(now); doc.setModificationDate(now)
  doc.setSubject(meta.title)
  const docId = crypto.randomUUID()
  const xmpBytes = new TextEncoder().encode(xmp({ title: meta.title, author: meta.author, producer, creator, date: now, docId }))
  const metaStream = ctx.stream(xmpBytes, { Type: "Metadata", Subtype: "XML", Length: xmpBytes.length })
  doc.catalog.set(PDFName.of("Metadata"), ctx.register(metaStream))
  // 3. Profil de couleur sRGB (OutputIntent)
  const icc = ctx.stream(meta.icc, { N: 3, Length: meta.icc.length })
  const intent = ctx.obj({ Type: "OutputIntent", S: "GTS_PDFA1", OutputConditionIdentifier: PDFString.of("sRGB IEC61966-2.1"), Info: PDFString.of("sRGB IEC61966-2.1"), DestOutputProfile: ctx.register(icc) })
  doc.catalog.set(PDFName.of("OutputIntents"), ctx.obj([ctx.register(intent)]))
  // 4. XML joint (relation « Data ») et tableau /AF du catalogue
  await doc.attach(new TextEncoder().encode(xml), "factur-x.xml", { mimeType: "text/xml", description: "Factur-X Invoice", creationDate: now, modificationDate: now, afRelationship: AFRelationship.Data })
  await doc.flush()
  const names = doc.catalog.lookupMaybe(PDFName.of("Names"), PDFDict)?.lookupMaybe(PDFName.of("EmbeddedFiles"), PDFDict)?.lookupMaybe(PDFName.of("Names"), PDFArray)
  const specRef = names ? names.get(names.size() - 1) : undefined
  if (specRef) doc.catalog.set(PDFName.of("AF"), ctx.obj([specRef]))
  doc.catalog.set(PDFName.of("MarkInfo"), ctx.obj({ Marked: true }))
  // 5. Identifiant de fichier (trailer /ID)
  const id = PDFHexString.of(docId.replace(/-/g, ""))
  ctx.trailerInfo.ID = ctx.obj([id, id])
  return doc.save({ useObjectStreams: false })
}

export const b64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s) }
