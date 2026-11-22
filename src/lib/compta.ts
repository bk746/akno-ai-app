/* update71 · Pilotage (CA signé, encaissé, reste à encaisser, taux de transformation) et exports comptables (CSV, FEC).
   Fonctions pures, testées par scripts/test-chaine.ts. Le FEC suit l'article A47 A-1 du LPF : 18 colonnes, séparateur « | »,
   dates AAAAMMJJ, montants à virgule. Les écritures ne concernent que les factures émises (numérotées). */
export type DevisLite = { status: string; amount: number; at?: string; sentAt?: string }
export type FactLite = {
  id: string; numero?: string | null; type: string; statut: string; client_nom?: string | null; nature?: string | null; devis_id?: string | null
  total_ht: number; total_tva: number; total_ttc: number; acompte_deduit?: number | null; retenue_garantie_pct?: number | null
  date_emission?: string | null; payee_le?: string | null; mode_paiement?: string | null; objet?: string | null
}
const r2 = (n: number) => Math.round((Number(n) || 0) * 100 + (n >= 0 ? 1e-9 : -1e-9)) / 100
const live = (f: FactLite) => !!f.numero && f.statut !== "brouillon" && f.statut !== "annulee"
/** Net à payer d'une facture (TTC − acomptes déduits − retenue de garantie). */
export const netOf = (f: FactLite) => Math.max(0, r2(Number(f.total_ttc || 0) - Number(f.acompte_deduit || 0) - r2(Number(f.total_ttc || 0) * (Number(f.retenue_garantie_pct) || 0) / 100)))
const inYear = (iso: string | null | undefined, y?: number) => !y || (!!iso && iso.slice(0, 4) === String(y))

export function pilotage(devis: DevisLite[], factures: FactLite[], year?: number) {
  const dv = devis.filter(d => inYear(d.sentAt || d.at, year))
  const signed = dv.filter(d => d.status === "val")
  const decided = dv.filter(d => ["env", "val", "ref", "sans", "perdu"].includes(d.status))
  const fs = factures.filter(live)
  const enc = fs.filter(f => f.type !== "avoir" && f.statut === "payee" && inYear(f.payee_le || f.date_emission, year))
  const avoirs = fs.filter(f => f.type === "avoir" && inYear(f.date_emission, year))
  const open = fs.filter(f => f.type !== "avoir" && (f.statut === "emise" || f.statut === "envoyee"))
  return {
    caSigne: r2(signed.reduce((a, d) => a + Number(d.amount || 0), 0)),
    caEncaisse: r2(enc.reduce((a, f) => a + netOf(f), 0) - avoirs.filter(a => a.statut === "payee").reduce((a, f) => a + Number(f.total_ttc || 0), 0)),
    resteAEncaisser: r2(open.reduce((a, f) => a + netOf(f), 0)),
    tauxTransformation: decided.length ? Math.round(signed.length / decided.length * 100) : 0,
    nbSignes: signed.length, nbEnvoyes: decided.length, nbAEncaisser: open.length,
  }
}

const fr2 = (n: number) => r2(n).toFixed(2).replace(".", ",")
const csvCell = (v: unknown) => { const s = String(v ?? ""); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
const TYPE: Record<string, string> = { facture: "Facture", acompte: "Acompte", situation: "Situation", solde: "Solde", avoir: "Avoir" }
const STAT: Record<string, string> = { emise: "Émise", envoyee: "Envoyée", payee: "Payée", annulee: "Annulée" }

/** Journal des ventes en CSV (Excel FR : « ; », virgule décimale, BOM UTF-8). */
export function exportCsv(factures: FactLite[]) {
  const head = ["Date", "Numéro", "Type", "Client", "Objet", "Total HT", "TVA", "Total TTC", "Acompte déduit", "Net à payer", "Statut", "Payée le", "Mode de paiement"]
  const rows = factures.filter(live).sort((a, b) => String(a.numero).localeCompare(String(b.numero))).map(f => {
    const s = f.type === "avoir" ? -1 : 1
    return [f.date_emission || "", f.numero, TYPE[f.type] || f.type, f.client_nom || "", f.objet || "", fr2(s * f.total_ht), fr2(s * f.total_tva), fr2(s * f.total_ttc), fr2(Number(f.acompte_deduit || 0)), fr2(s * netOf(f)), STAT[f.statut] || f.statut, (f.payee_le || "").slice(0, 10), f.mode_paiement || ""]
  })
  return "\uFEFF" + [head, ...rows].map(r => r.map(csvCell).join(";")).join("\r\n") + "\r\n"
}

export const FEC_COLS = ["JournalCode", "JournalLib", "EcritureNum", "EcritureDate", "CompteNum", "CompteLib", "CompAuxNum", "CompAuxLib", "PieceRef", "PieceDate", "EcritureLib", "Debit", "Credit", "EcritureLet", "DateLet", "ValidDate", "Montantdevise", "Idevise"] as const
const ymd8 = (iso?: string | null) => String(iso || "").slice(0, 10).replace(/-/g, "")
const aux = (name?: string | null) => "C" + (String(name || "CLIENT").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16) || "CLIENT")
const clean = (s: unknown) => String(s ?? "").replace(/[|\r\n\t]+/g, " ").trim()

/** Fichier des écritures comptables (ventes VE + encaissements BQ) d'un exercice. Chaque écriture est équilibrée. */
export function exportFec(factures: FactLite[], o: { siren: string; year: number }) {
  const fs = factures.filter(live).filter(f => inYear(f.date_emission, o.year)).sort((a, b) => String(a.numero).localeCompare(String(b.numero)))
  // acomptes déjà facturés, par devis (pour solder le compte 4191 sur la facture finale)
  const acByDevis = new Map<string, { ht: number; tva: number }>()
  for (const f of factures.filter(live)) if (f.type === "acompte" && f.devis_id) {
    const p = acByDevis.get(f.devis_id) || { ht: 0, tva: 0 }; acByDevis.set(f.devis_id, { ht: r2(p.ht + f.total_ht), tva: r2(p.tva + f.total_tva) })
  }
  const lines: string[][] = []
  let ve = 0, bq = 0
  const push = (j: "VE" | "BQ", num: number, date: string, compte: string, lib: string, f: FactLite, txt: string, d: number, c: number) => {
    if (r2(d) === 0 && r2(c) === 0) return
    const isClient = compte.startsWith("411")
    lines.push([j, j === "VE" ? "Journal des ventes" : "Banque", `${j}${String(num).padStart(5, "0")}`, ymd8(date), compte, lib, isClient ? aux(f.client_nom) : "", isClient ? clean(f.client_nom || "Client") : "", clean(f.numero), ymd8(f.date_emission), clean(txt), fr2(d), fr2(c), "", "", ymd8(date), "", ""])
  }
  for (const f of fs) {
    const date = f.date_emission || ""
    const txt = `${TYPE[f.type] || "Facture"} ${f.numero} ${f.client_nom || ""}`
    const prod = f.nature === "biens" ? ["707000", "Ventes de marchandises"] : ["706000", "Prestations de services"]
    const ht = r2(f.total_ht), tva = r2(f.total_tva), ttc = r2(f.total_ttc), sign = f.type === "avoir" ? -1 : 1
    ve++
    const D = (a: number) => sign > 0 ? [a, 0] : [0, a], C = (a: number) => sign > 0 ? [0, a] : [a, 0]
    if (f.type === "acompte") {
      push("VE", ve, date, "411000", "Clients", f, txt, ...D(ttc) as [number, number])
      push("VE", ve, date, "419100", "Clients - avances et acomptes reçus", f, txt, ...C(ht) as [number, number])
      push("VE", ve, date, "445710", "TVA collectée", f, txt, ...C(tva) as [number, number])
    } else {
      const deduit = r2(Number(f.acompte_deduit || 0))
      const ac = f.devis_id && deduit > 0 ? acByDevis.get(f.devis_id) : undefined
      const acHt = deduit > 0 ? (ac && r2(ac.ht + ac.tva) === deduit ? ac.ht : r2(deduit * (ttc ? ht / ttc : 1))) : 0
      const acTva = r2(deduit - acHt)
      push("VE", ve, date, "411000", "Clients", f, txt, ...D(r2(ttc - deduit)) as [number, number])
      if (deduit > 0) { push("VE", ve, date, "419100", "Clients - avances et acomptes reçus", f, `${txt} acompte déduit`, ...D(acHt) as [number, number]); push("VE", ve, date, "445710", "TVA collectée", f, `${txt} TVA sur acompte`, ...D(acTva) as [number, number]) }
      push("VE", ve, date, prod[0], prod[1], f, txt, ...C(ht) as [number, number])
      push("VE", ve, date, "445710", "TVA collectée", f, txt, ...C(tva) as [number, number])
    }
    if (f.statut === "payee" && f.type !== "avoir") {
      bq++
      const pd = (f.payee_le || date).slice(0, 10), amt = f.type === "acompte" ? ttc : netOf(f)
      push("BQ", bq, pd, "512000", "Banque", f, `Règlement ${f.numero}`, amt, 0)
      push("BQ", bq, pd, "411000", "Clients", f, `Règlement ${f.numero}`, 0, amt)
    }
  }
  const body = [FEC_COLS.join("|"), ...lines.map(l => l.join("|"))].join("\r\n") + "\r\n"
  const siren = String(o.siren || "").replace(/\D/g, "").slice(0, 9) || "000000000"
  return { filename: `${siren}FEC${o.year}1231.txt`, content: body, lines: lines.length }
}

/** Contrôle : chaque écriture (journal + numéro) est équilibrée au centime. */
export function fecBalanced(content: string) {
  const sums = new Map<string, number>()
  for (const row of content.trim().split(/\r?\n/).slice(1)) {
    const c = row.split("|"), k = c[2], d = Number(c[11].replace(",", ".")), cr = Number(c[12].replace(",", "."))
    sums.set(k, r2((sums.get(k) || 0) + d - cr))
  }
  return [...sums.values()].every(v => v === 0)
}
