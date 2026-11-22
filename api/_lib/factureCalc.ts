/* update61 · Calculs de facturation (fonctions pures, partagées par l'API, l'app et les tests).
   Arrondis conformes à la norme EN 16931 (Factur-X) :
   - montant de ligne = arrondi(q × pu, 2) ; total HT = Σ montants de lignes
   - TVA par taux = arrondi(base du taux × taux, 2) ; total TVA = Σ TVA par taux ; TTC = HT + TVA */

export type FLine = { l: string; q: number; u?: string; pu: number; tv?: number }
export type FType = "facture" | "acompte" | "situation" | "solde" | "avoir"
export type Rate = { r: number; base: number; tva: number }
export type FTotals = { ht: number; rates: Rate[]; tva: number; ttc: number; acompte: number; retenue: number; net: number }

export const r2 = (n: number) => Math.round((Number(n) || 0) * 100 + (n >= 0 ? 1e-9 : -1e-9)) / 100
export const TVA_OK = [0, 2.1, 5.5, 10, 20]
export const lineHT = (x: FLine) => r2((Number(x.q) || 0) * (Number(x.pu) || 0))

/** Lignes propres : désignation obligatoire, quantité > 0, remises (pu négatif) autorisées, taux légaux uniquement. */
export function cleanLines(raw: unknown, max = 200): FLine[] {
  if (!Array.isArray(raw)) return []
  const out: FLine[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const o = item as Record<string, unknown>
    if (o.k === "sec" || o.k === "meta") continue
    const base = String(o.l ?? o.designation ?? o.libelle ?? "").trim()
    const d = typeof o.d === "string" ? o.d.trim() : ""
    const q = Number(o.q ?? o.qty ?? o.quantite), pu = Number(o.pu ?? o.prix ?? o.prix_ht), tv = Number(o.tv ?? o.tva ?? o.tva_taux)
    if (!base || !Number.isFinite(q) || q <= 0 || !Number.isFinite(pu)) continue
    out.push({ l: (d ? `${base}\n${d}` : base).slice(0, 1200), q: Math.round(q * 1000) / 1000, u: String(o.u ?? o.unite ?? "u").trim().slice(0, 12) || "u", pu: r2(pu), tv: TVA_OK.includes(tv) ? tv : 20 })
  }
  return out.slice(0, max)
}

/** Totaux d'une facture. zeroTva : franchise en base (293 B) ou autoliquidation (283-2 nonies). */
export function computeFacture(lines: FLine[], o: { zeroTva?: boolean; acompteDeduit?: number; retenuePct?: number } = {}): FTotals {
  const by = new Map<number, number>()
  let ht = 0
  for (const x of lines) {
    const m = lineHT(x), r = o.zeroTva ? 0 : Number(x.tv ?? 20)
    ht = r2(ht + m)
    by.set(r, r2((by.get(r) || 0) + m))
  }
  const rates = [...by.entries()].map(([r, base]) => ({ r, base, tva: r2(base * r / 100) })).filter(x => x.base !== 0).sort((a, b) => a.r - b.r)
  const tva = r2(rates.reduce((a, x) => a + x.tva, 0)), ttc = r2(ht + tva)
  const acompte = r2(Math.max(0, Number(o.acompteDeduit) || 0))
  const pct = Math.min(5, Math.max(0, Number(o.retenuePct) || 0))
  const retenue = r2(ttc * pct / 100)
  return { ht, rates, tva, ttc, acompte, retenue, net: r2(ttc - acompte - retenue) }
}

/** Acompte : une ligne par taux de TVA (pourcentage du devis). */
export function acompteLines(devis: FLine[], pct: number, devisNum: string, objet?: string): FLine[] {
  const p = Math.min(100, Math.max(1, Number(pct) || 30))
  const t = computeFacture(devis)
  const label = `Acompte de ${fmtPct(p)} sur devis n° ${devisNum}${objet ? ` — ${objet}` : ""}`
  return t.rates.filter(x => x.base > 0).map(x => ({ l: t.rates.length > 1 ? `${label} (part TVA ${fmtPct(x.r)})` : label, q: 1, u: "forfait", pu: r2(x.base * p / 100), tv: x.r }))
}

/** Montants déjà facturés par ligne pour une suite d'avancements cumulés (recalcul déterministe). */
function invoicedSoFar(devis: FLine[], cumPcts: number[]) {
  const sorted = [...cumPcts].filter(n => n > 0).sort((a, b) => a - b)
  return devis.map(x => { let prev = 0, sum = 0; for (const c of sorted) { sum = r2(sum + r2(lineHT(x) * (c - prev) / 100)); prev = c } return sum })
}

/** Situation de travaux : avancement cumulé `cum` (%) après les situations précédentes (`prev`, cumulés). */
export function situationLines(devis: FLine[], prev: number[], cum: number, n: number): FLine[] {
  const last = Math.max(0, ...prev)
  if (!(cum > last) || cum > 100) throw new Error(`L'avancement cumulé doit être compris entre ${fmtPct(last)} et 100 %.`)
  if (cum === 100) return soldeLines(devis, prev, n)
  const before = invoicedSoFar(devis, prev)
  const after = invoicedSoFar(devis, [...prev, cum])
  return devis.map((x, i) => ({ l: `${firstLine(x.l)} — situation n° ${n} : ${fmtPct(cum)} cumulé (précédent ${fmtPct(last)})`, q: 1, u: "forfait", pu: r2(after[i] - before[i]), tv: x.tv })).filter(x => x.pu !== 0)
}

/** Solde : le reste exact à facturer (devis − situations déjà émises), sans écart d'arrondi. */
export function soldeLines(devis: FLine[], prev: number[], n?: number): FLine[] {
  if (!prev.some(x => x > 0)) return devis.map(x => ({ ...x }))
  const before = invoicedSoFar(devis, prev), last = Math.max(0, ...prev)
  return devis.map((x, i) => ({ l: `${firstLine(x.l)} — ${n ? `situation n° ${n}, ` : ""}solde : 100 % cumulé (précédent ${fmtPct(last)})`, q: 1, u: "forfait", pu: r2(lineHT(x) - before[i]), tv: x.tv })).filter(x => x.pu !== 0)
}

/** Numéros émis d'une année : la séquence doit être continue (F-AAAA-0001, 0002…, avoirs A- compris). */
export function sequenceGaps(numeros: string[]): string[] {
  const byYear = new Map<string, number[]>()
  for (const n of numeros) { const m = /^[FA]-(\d{4})-(\d+)$/.exec(n || ""); if (m) byYear.set(m[1], [...(byYear.get(m[1]) || []), Number(m[2])]) }
  const gaps: string[] = []
  for (const [y, list] of byYear) {
    const s = [...list].sort((a, b) => a - b)
    for (let i = 0; i < s.length; i++) {
      if (i > 0 && s[i] === s[i - 1]) gaps.push(`${y} : numéro ${s[i]} en double`)
      const expected = i === 0 ? 1 : s[i - 1] + 1
      if (s[i] > expected) gaps.push(`${y} : numéros ${expected} à ${s[i] - 1} manquants`)
    }
  }
  return gaps
}

export const fmtPct = (n: number) => `${String(Math.round(n * 100) / 100).replace(".", ",")} %`
const firstLine = (s: string) => String(s || "").split("\n")[0].slice(0, 160)

/** Code d'unité UN/ECE Rec. 20 pour la facture électronique. */
export function unitCode(u?: string) {
  const k = String(u || "").toLowerCase().replace(/\.$/, "")
  return ({ h: "HUR", heure: "HUR", heures: "HUR", "m²": "MTK", m2: "MTK", ml: "MTR", m: "MTR", "m³": "MTQ", m3: "MTQ", kg: "KGM", l: "LTR", j: "DAY", jour: "DAY", forfait: "LS", fft: "LS", lot: "LS", ens: "SET", "%": "P1" } as Record<string, string>)[k] || "C62"
}

/** update52/71 · lignes d'un devis pour une facture : garde les remises, ignore titres de section et réglages, ajoute la description. */
export function devisToFactureLines(raw: unknown): FLine[] {
  if (!Array.isArray(raw)) return []
  const out: FLine[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const o = item as Record<string, unknown>
    if (o.k === "sec" || o.k === "meta") continue
    const base = String(o.l ?? o.designation ?? o.libelle ?? "").trim()
    const d = typeof o.d === "string" ? o.d.trim() : ""
    const q = Number(o.q ?? o.qty ?? o.quantite), pu = Number(o.pu ?? o.prix ?? o.prix_ht), tv = Number(o.tv ?? o.tva ?? o.tva_taux)
    if (!base || !Number.isFinite(q) || q <= 0 || !Number.isFinite(pu) || (pu < 0 && o.k !== "rem")) continue
    out.push({ l: (d ? `${base}\n${d}` : base).slice(0, 1200), q: r2(q), u: String(o.u ?? o.unite ?? "u").trim().slice(0, 12) || "u", pu: r2(pu), tv: tv === 5.5 || tv === 10 || tv === 20 || tv === 0 ? tv : 20 })
  }
  return out.slice(0, 200)
}
