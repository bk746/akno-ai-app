/* update52 · Modèle et calculs de l'éditeur de devis (fonctions pures, sans React).
   Format stocké dans devis.lignes (jsonb), rétrocompatible :
   - ligne classique : { l, q, pu, u, tv }  ← les anciens devis et ceux générés par l'IA
   - champs ajoutés (facultatifs) : k (type), d (description), pid (prestation), ca (coût d'achat)
     k = "mo" main-d'œuvre (q = heures, pu = taux horaire) · "fo" fourniture · "fft" forfait
       · "sec" titre de section (q = pu = 0) · "rem" remise calculée (pu négatif, par taux de TVA)
       · "meta" réglages du devis (adresse du chantier, remise, acompte, validité, conditions)
   Toute somme Σ q × pu sur ce tableau reste juste (sections = 0, remises négatives). */

export type LineKind = "mo" | "fo" | "fft"
export type DevisMeta = { v: 2; site?: string; remise?: { t: "pct" | "eur"; v: number }; acompte?: number; validite?: number; conditions?: string; notes?: string }
export type StoredLine = { l: string; q: number; pu: number; u?: string; tv?: number; k?: LineKind | "sec" | "rem" | "meta"; d?: string; pid?: string; ca?: number; m?: DevisMeta }
export type EdLine = { id: string; k: LineKind | "sec"; l: string; d: string; q: number; u: string; pu: number; tv: number; pid?: string; ca?: number }

export const TVA_RATES = [5.5, 10, 20] as const
export const UNITS = ["u", "h", "m²", "ml", "m³", "kg", "forfait", "lot", "j", "ens."] as const
export const KIND_LABEL: Record<LineKind, string> = { mo: "Main-d'œuvre", fo: "Fourniture", fft: "Forfait" }
export const KIND_SHORT: Record<LineKind, string> = { mo: "MO", fo: "Fourn.", fft: "Forfait" }

export const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100
export const lid = () => Math.random().toString(36).slice(2, 10)

/** Montant « 1 234,50 € » (espaces simples, compatibles PDF). */
export const fmtE = (n: number) => r2(n).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[\u202f\u00a0]/g, " ") + " €"
/** Nombre « 3,5 » (jusqu'à 2 décimales, sans zéros inutiles). */
export const fmtN = (n: number) => (Number(n) || 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 }).replace(/[\u202f\u00a0]/g, " ")
/** Saisie française : « 1 234,5 » → 1234.5 ; vide ou invalide → NaN. */
export const parseN = (s: string) => { const t = String(s ?? "").replace(/[\s\u202f\u00a0€%]/g, "").replace(",", "."); return t === "" || t === "-" ? NaN : Number(t) }

const guessKind = (x: StoredLine): LineKind => {
  if (x.k === "mo" || x.k === "fo" || x.k === "fft") return x.k
  const u = String(x.u || "").toLowerCase()
  if (u === "h" || u === "heure" || u === "heures") return "mo"
  if (u === "forfait" || u === "fft") return "fft"
  if (!x.u && /main[- ]d['’]?\s?(œ|oe)uvre/i.test(x.l || "")) return "mo"
  return "fo"
}

/** Lignes stockées (anciennes, IA ou update52) → lignes d'édition + réglages. */
export function fromStored(raw: unknown, tvDef: number, fallback?: { objet?: string; amount?: number }): { items: EdLine[]; meta: DevisMeta } {
  const arr = Array.isArray(raw) ? raw as StoredLine[] : []
  const metaLine = arr.find(x => x && x.k === "meta")
  const meta: DevisMeta = { v: 2, ...(metaLine?.m || {}) }
  const items: EdLine[] = []
  for (const x of arr) {
    if (!x || typeof x !== "object" || x.k === "meta" || x.k === "rem") continue
    if (x.k === "sec") { items.push({ id: lid(), k: "sec", l: String(x.l || ""), d: "", q: 0, u: "", pu: 0, tv: tvDef }); continue }
    const k = guessKind(x)
    items.push({ id: lid(), k, l: String(x.l || ""), d: String(x.d || ""), q: Number(x.q) || 0, u: String(x.u || (k === "mo" ? "h" : k === "fft" ? "forfait" : "u")), pu: Number(x.pu) || 0, tv: x.tv == null ? tvDef : Number(x.tv), ...(x.pid ? { pid: x.pid } : {}), ...(x.ca != null && Number.isFinite(Number(x.ca)) ? { ca: Number(x.ca) } : {}) })
  }
  if (!items.length && fallback?.amount) items.push({ id: lid(), k: "fft", l: fallback.objet || "Travaux", d: "", q: 1, u: "forfait", pu: r2(fallback.amount / (1 + tvDef / 100)), tv: tvDef })
  return { items, meta }
}

const lineHT = (x: EdLine) => x.k === "sec" ? 0 : r2(x.q * x.pu)

/** Remise répartie par taux de TVA (obligatoire pour une TVA juste). */
export function discountLines(items: EdLine[], meta: DevisMeta): StoredLine[] {
  const rem = meta.remise
  if (!rem || !(rem.v > 0)) return []
  const base: Record<string, number> = {}
  for (const x of items) if (x.k !== "sec") base[String(x.tv)] = (base[String(x.tv)] || 0) + lineHT(x)
  const rates = Object.keys(base).filter(k => base[k] > 0).sort((a, b) => Number(a) - Number(b))
  const total = rates.reduce((a, k) => a + base[k], 0)
  if (!total) return []
  const want = rem.t === "pct" ? r2(total * Math.min(100, rem.v) / 100) : r2(Math.min(rem.v, total))
  const label = rem.t === "pct" ? `Remise ${fmtN(Math.min(100, rem.v))} %` : "Remise commerciale"
  let left = want
  return rates.map((k, i) => {
    const part = i === rates.length - 1 ? left : r2(want * base[k] / total)
    left = r2(left - part)
    return { k: "rem" as const, l: rates.length > 1 ? `${label} (TVA ${fmtN(Number(k))} %)` : label, q: 1, u: "", pu: -part, tv: Number(k) }
  }).filter(x => x.pu !== 0)
}

/** Lignes d'édition + réglages → tableau stocké dans devis.lignes. */
export function toStored(items: EdLine[], meta: DevisMeta): StoredLine[] {
  const out: StoredLine[] = items.filter(x => x.k === "sec" ? x.l.trim() : x.l.trim() || x.q * x.pu).map(x => x.k === "sec"
    ? { k: "sec", l: x.l.trim(), q: 0, pu: 0 }
    : { k: x.k, l: x.l.trim() || KIND_LABEL[x.k], ...(x.d.trim() ? { d: x.d.trim() } : {}), q: r2(x.q), u: x.u || "u", pu: r2(x.pu), tv: x.tv, ...(x.pid ? { pid: x.pid } : {}), ...(x.ca != null ? { ca: r2(x.ca) } : {}) })
  out.push(...discountLines(items, meta))
  const m: DevisMeta = { v: 2 }
  if (meta.site?.trim()) m.site = meta.site.trim()
  if (meta.remise && meta.remise.v > 0) m.remise = meta.remise
  if (meta.acompte != null) m.acompte = meta.acompte
  if (meta.validite) m.validite = meta.validite
  if (meta.conditions?.trim()) m.conditions = meta.conditions.trim()
  if (meta.notes?.trim()) m.notes = meta.notes.trim()
  out.push({ k: "meta", l: "", q: 0, pu: 0, m })
  return out
}

export type Totals = { brut: number; remise: number; ht: number; rates: { r: number; base: number; tva: number }[]; tva: number; ttc: number; acompte: number; cout: number; marge: number | null }
/** Totaux en temps réel (mêmes arrondis que l'aperçu, le PDF et la base). */
export function computeTotals(items: EdLine[], meta: DevisMeta, opts: { tvaNA?: boolean; acompteDef?: number } = {}): Totals {
  const rems = discountLines(items, meta)
  const brut = r2(items.reduce((a, x) => a + lineHT(x), 0))
  const remise = r2(-rems.reduce((a, x) => a + x.pu, 0))
  const by: Record<string, number> = {}
  for (const x of items) if (x.k !== "sec") by[String(x.tv)] = (by[String(x.tv)] || 0) + lineHT(x)
  for (const x of rems) by[String(x.tv)] = (by[String(x.tv)] || 0) + x.pu
  const rates = Object.entries(by).map(([r, base]) => ({ r: Number(r), base: r2(base), tva: opts.tvaNA ? 0 : r2(base * Number(r) / 100) })).filter(x => x.base !== 0 && (!opts.tvaNA || x.r > 0)).sort((a, b) => a.r - b.r)
  const ht = r2(brut - remise), tva = r2(rates.reduce((a, x) => a + x.tva, 0)), ttc = r2(ht + tva)
  const pct = meta.acompte ?? opts.acompteDef ?? 30
  const withCost = items.filter(x => x.k !== "sec" && x.ca != null)
  const cout = r2(withCost.reduce((a, x) => a + (x.ca || 0) * x.q, 0))
  return { brut, remise, ht, rates, tva, ttc, acompte: r2(ttc * pct / 100), cout, marge: withCost.length ? r2(ht - cout) : null }
}

/** Pourcentage d'acompte lu dans un texte de conditions (« Acompte de 30 % … »). */
export const acompteFrom = (txt?: string) => { const m = String(txt || "").match(/acompte\s+de\s+(\d{1,3}(?:[.,]\d+)?)\s*%/i); return m ? Math.min(100, Number(m[1].replace(",", "."))) : undefined }
/** Met à jour le % d'acompte dans le texte de conditions s'il y figure. */
export const withAcompte = (txt: string, pct: number) => /acompte\s+de\s+\d{1,3}(?:[.,]\d+)?\s*%/i.test(txt) ? txt.replace(/(acompte\s+de\s+)\d{1,3}(?:[.,]\d+)?(\s*%)/i, `$1${fmtN(pct)}$2`) : txt
