/* update66 · Carnet d'adresses (calculs purs, testés dans scripts/test-clients.ts, aucun appel réseau).
   Un client = une fiche (client_fiches) et/ou un nom vu dans les devis, factures, chantiers, rendez-vous et appels.
   Rapprochement : clé de fiche explicite (chantiers.client_id) → téléphone → nom normalisé (même clé que ClientFiche.ficheKey). */
import { effectiveStatus, todayISO, daysBetween, type ChDates } from "./chantierCalc"

export type Kind = "particulier" | "pro" | "syndic"
export type Origin = "appel" | "bouche_a_oreille" | "site" | "google" | "autre"
export const ORIGINS: [Origin, string][] = [["appel", "Appel"], ["bouche_a_oreille", "Bouche-à-oreille"], ["site", "Site"], ["google", "Google"], ["autre", "Autre"]]
export const KIND_LABEL: Record<Kind, string> = { particulier: "Particulier", pro: "Professionnel", syndic: "Syndic" }

export type FicheRow = {
  cle: string; nom: string; telephone?: string | null; email?: string | null; adresse?: string | null; siren?: string | null; notes?: string | null; updated_at?: string | null
  type_client?: Kind | null; prenom?: string | null; nom_famille?: string | null; origine?: Origin | null; ville?: string | null; lat?: number | null; lng?: number | null; created_at?: string | null
}
export type CallIn = { id: string; name: string; phone?: string; createdAt?: string; note?: string; topic?: string; besoin?: string; addr?: string }
export type DevisIn = { id: string; num: number; client: string; objet: string; status: string; amount: number; at?: string; sentAt?: string; repliedAt?: string; reply?: string; phone?: string; email?: string; addr?: string; callId?: string }
export type FactIn = { id: string; numero: string | null; type: string; statut: string; client_nom: string | null; total_ttc?: number | null; acompte_deduit?: number | null; due: number; devis_id?: string | null; date_emission?: string | null; date_echeance?: string | null; envoyee_le?: string | null; payee_le?: string | null; created_at?: string | null; client_telephone?: string | null; objet?: string | null }
export type ChIn = ChDates & { id: string; title: string; client_id?: string | null; client_nom?: string | null; client_telephone?: string | null; address?: string | null; lat?: number | null; lng?: number | null }
export type EvIn = { id: string; date: string; name: string; topic?: string; phone?: string; callId?: string; addr?: string }
export type SigIn = { devis_id: string; at: string }

export type Client = {
  key: string; name: string; fiche?: FicheRow; kind: Kind; phone: string; email: string; addr: string; city: string; origin?: Origin | null
  since: string; last: string; calls: CallIn[]; devis: DevisIn[]; factures: FactIn[]; chantiers: ChIn[]; events: EvIn[]
}

/* ---------- normalisation ---------- */
export const norm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim()
/** Même clé que les fiches clients existantes (ClientFiche.ficheKey). */
export const ficheKey = (n: string) => (n || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/^(m\.|mme|mr|monsieur|madame)\s+/, "").replace(/\s+/g, " ").trim()
/** Téléphone comparable : 9 derniers chiffres (06…, +33 6…, 0033 6… donnent la même clé). "" si trop court. */
export const phoneKey = (p?: string | null) => { const d = (p || "").replace(/\D/g, ""); return d.length >= 9 ? d.slice(-9) : "" }
const realName = (n?: string | null) => { const t = (n || "").trim(); return !!t && !/^(inconnu|client|appelant|client inconnu\b.*)$/i.test(t) && !/^[+\d\s.()-]+$/.test(t) }
/** Ville d'une adresse française (« …, 74960 Cran-Gevrier » → « Cran-Gevrier »). */
export const cityOf = (a?: string | null) => { const m = (a || "").match(/\b\d{5}\s+([^,]+?)\s*(?:,|$)/); return m ? m[1].trim() : "" }
/** Adresse sur deux lignes : rue / « CP Ville ». */
export function addrLines(a?: string | null): [string, string] {
  const t = (a || "").trim(); if (!t) return ["", ""]
  const m = t.match(/^(.*?)[,\s]+(\d{5}\s+.+)$/); return m ? [m[1].replace(/,\s*$/, "").trim(), m[2].trim()] : [t, ""]
}
export function initials(name: string) {
  const w = name.replace(/^(m\.|mme|mr|monsieur|madame)\s+/i, "").replace(/[^\p{L}\s'-]/gu, " ").split(/[\s'-]+/).filter(Boolean)
  return ((w[0]?.[0] || "") + (w.length > 1 ? w[w.length - 1][0] : w[0]?.[1] || "")).toUpperCase() || "?"
}
export function kindOf(name: string, f?: FicheRow) {
  if (f?.type_client) return f.type_client
  if (/\b(syndic|copropri)/i.test(name)) return "syndic" as Kind
  if (f?.siren || /^(sci|sarl|sas|sasu|eurl|sa|snc|scp|scm|ste|société|societe|cabinet|agence|mairie|commune|ets|entreprise)\b/i.test(name.trim())) return "pro" as Kind
  return "particulier" as Kind
}
const day = (iso?: string | null) => !iso ? "" : /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : (() => { const d = new Date(iso); return isNaN(+d) ? "" : todayISO(d) })()

/* ---------- construction du carnet ---------- */
export type DirIn = { fiches: FicheRow[]; calls: CallIn[]; devis: DevisIn[]; factures: FactIn[]; chantiers: ChIn[]; events: EvIn[] }
export function buildDirectory(inp: DirIn): Client[] {
  const by = new Map<string, Client>(), phones = new Map<string, string>(), names = new Map<string, string>()
  const mk = (key: string, name: string): Client => ({ key, name, kind: "particulier", phone: "", email: "", addr: "", city: "", since: "", last: "", calls: [], devis: [], factures: [], chantiers: [], events: [] })
  for (const f of inp.fiches) {
    const c = mk(f.cle, f.nom || f.cle); c.fiche = f; by.set(f.cle, c)
    names.set(ficheKey(f.nom || ""), f.cle); names.set(f.cle, f.cle)
    const p = phoneKey(f.telephone); if (p && !phones.has(p)) phones.set(p, f.cle)
  }
  const resolve = (name?: string | null, phone?: string | null, explicit?: string | null, create = true): Client | null => {
    if (explicit && by.has(explicit)) return by.get(explicit)!
    const p = phoneKey(phone)
    if (p && phones.has(p)) return by.get(phones.get(p)!)!
    if (!realName(name)) return null
    const k = ficheKey(name!), hit = names.get(k)
    if (hit && by.has(hit)) { const c = by.get(hit)!; if (p) phones.set(p, c.key); return c }
    if (!create) return null
    const c = mk(k, name!.trim()); by.set(k, c); names.set(k, k); if (p) phones.set(p, k)
    return c
  }
  const fill = (c: Client, x: { phone?: string | null; email?: string | null; addr?: string | null }) => { if (!c.phone && x.phone) c.phone = x.phone; if (!c.email && x.email) c.email = x.email; if (!c.addr && x.addr) c.addr = x.addr }
  for (const x of inp.chantiers) { const c = resolve(x.client_nom, x.client_telephone, x.client_id); if (c) { c.chantiers.push(x); fill(c, { phone: x.client_telephone, addr: x.address }) } }
  for (const x of inp.devis) { const c = resolve(x.client, x.phone); if (c) { c.devis.push(x); fill(c, x) } }
  for (const x of inp.factures) { const c = resolve(x.client_nom, x.client_telephone); if (c) { c.factures.push(x); fill(c, { phone: x.client_telephone }) } }
  const callIds = new Map<string, Client>()
  for (const x of inp.calls) { const c = resolve(x.name, x.phone); if (c) { c.calls.push(x); callIds.set(x.id, c); fill(c, { phone: x.phone, addr: x.addr }) } }
  for (const x of inp.events) {
    if (/^Chantier\b/i.test(x.name)) continue
    const c = (x.callId && callIds.get(x.callId)) || resolve(x.name, x.phone); if (c) { c.events.push(x); fill(c, { phone: x.phone, addr: x.addr }) }
  }
  for (const c of by.values()) {
    const f = c.fiche
    if (f) { c.phone = f.telephone || c.phone; c.email = f.email || c.email; c.addr = f.adresse || c.addr; c.origin = f.origine || null }
    c.kind = kindOf(c.name, f); c.city = f?.ville || cityOf(c.addr)
    const ds = [day(f?.created_at), ...c.calls.map(x => day(x.createdAt)), ...c.devis.map(x => day(x.at)), ...c.factures.map(x => day(x.date_emission || x.created_at)), ...c.chantiers.map(x => day(x.start_date)), ...c.events.map(x => x.date)].filter(Boolean).sort()
    const past = ds.filter(d => d <= todayISO())
    c.since = (past[0] || ds[0] || day(f?.updated_at) || "")
    c.last = past[past.length - 1] || day(f?.updated_at) || c.since
  }
  return [...by.values()]
}

/* ---------- statuts ---------- */
const OPEN = new Set(["env", "att"])
/** Devis envoyé, sans réponse du client (même règle que les relances automatiques). */
export const devisPending = (d: DevisIn) => OPEN.has(d.status) && !d.reply
export const factUnpaid = (f: FactIn) => !!f.numero && (f.statut === "emise" || f.statut === "envoyee") && f.type !== "avoir"
export const factLate = (f: FactIn, today = todayISO()) => factUnpaid(f) && !!f.date_echeance && f.date_echeance < today
const MO = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]
export const dmy = (d: string, today = todayISO()) => !d ? "" : `${+d.slice(8, 10)} ${MO[+d.slice(5, 7) - 1]}${d.slice(0, 4) !== today.slice(0, 4) ? ` ${d.slice(0, 4)}` : ""}`
export const RED = "#FF453A", ORANGE = "#FF9F0A", BLUE = "#2F7BFF"
export type Status = { tone: "late" | "onsite" | "next" | "devis"; label: string; color: string | null }
export function nextDate(c: Client, today = todayISO()) {
  const ds = [...c.chantiers.filter(x => effectiveStatus(x, today) === "upcoming" && x.start_date).map(x => x.start_date!), ...c.events.filter(x => x.date >= today).map(x => x.date)].sort()
  return ds[0] || ""
}
export function statusOf(c: Client, today = todayISO()): Status | null {
  if (c.factures.some(f => factLate(f, today))) return { tone: "late", label: "En retard", color: RED }
  if (c.chantiers.some(x => effectiveStatus(x, today) === "in_progress")) return { tone: "onsite", label: "En cours", color: ORANGE }
  const n = nextDate(c, today)
  if (n) { const k = daysBetween(today, n); return { tone: "next", label: k === 0 ? "Aujourd'hui" : k === 1 ? "Demain" : `Le ${dmy(n, today)}`, color: BLUE } }
  if (c.devis.some(devisPending)) return { tone: "devis", label: "Devis envoyé", color: null }
  return null
}
export type Filter = "all" | "onsite" | "devis" | "relance"
export const FILTERS: [Filter, string][] = [["all", "Tous"], ["onsite", "Chantier en cours"], ["devis", "Devis en attente"], ["relance", "À relancer"]]
/** À relancer : devis envoyé sans réponse depuis au moins `delay` jours (1er délai des relances, 3 j par défaut) ou facture en retard. */
export function toRelance(c: Client, today = todayISO(), delay = 3) {
  return c.factures.some(f => factLate(f, today)) || c.devis.some(d => devisPending(d) && !!d.sentAt && daysBetween(day(d.sentAt), today) >= delay)
}
export function matchFilter(c: Client, f: Filter, today = todayISO(), delay = 3) {
  return f === "all" ? true : f === "onsite" ? c.chantiers.some(x => effectiveStatus(x, today) === "in_progress") : f === "devis" ? c.devis.some(devisPending) : toRelance(c, today, delay)
}
/** Recherche « Nom, ville, téléphone » : sans accents ni casse ; les espaces / points / +33 des numéros sont ignorés. */
export function matchQuery(c: Client, q: string) {
  const t = norm(q); if (!t) return true
  if (norm(`${c.name} ${c.city} ${c.addr} ${c.email} ${c.fiche?.prenom || ""} ${c.fiche?.nom_famille || ""}`).includes(t)) return true
  const d = q.replace(/\D/g, "")
  if (d.length >= 3 && !/[a-z]/i.test(q)) { const p = c.phone.replace(/\D/g, "").replace(/^33/, "0").replace(/^0033/, "0"), dq = d.replace(/^33/, "0"); return p.includes(dq) || (dq.length >= 9 && phoneKey(p) === phoneKey(dq)) }
  return false
}

/* ---------- chiffres ---------- */
const net = (f: FactIn) => f.type === "avoir" ? -Math.abs(Number(f.total_ttc) || 0) : Number(f.total_ttc) || 0
const issued = (f: FactIn) => !!f.numero && f.statut !== "brouillon" && f.statut !== "annulee"
/** CA total, sans double comptage : devis acceptés (TTC) + factures émises qui ne dépendent pas d'un devis accepté
   (acompte + solde « acompte déduit » = total ; avoirs retirés). Une facture liée à un devis accepté n'est pas recomptée. */
export function caTotal(c: Client) {
  const acc = new Set(c.devis.filter(d => d.status === "val").map(d => d.id))
  const fromDevis = c.devis.filter(d => d.status === "val").reduce((a, d) => a + (Number(d.amount) || 0), 0)
  const fromFact = c.factures.filter(f => issued(f) && !(f.devis_id && acc.has(f.devis_id))).reduce((a, f) => a + net(f) - (f.type !== "avoir" ? Number(f.acompte_deduit) || 0 : 0), 0)
  return Math.round((fromDevis + fromFact) * 100) / 100
}
export const dueTotal = (fs: FactIn[]) => Math.round(fs.filter(factUnpaid).reduce((a, f) => a + Math.max(0, f.due), 0) * 100) / 100
export function chantiersCount(c: Client, today = todayISO()) {
  const st = c.chantiers.map(x => effectiveStatus(x, today)), on = st.filter(s => s === "in_progress").length, up = st.filter(s => s === "upcoming").length
  return on ? { n: on, l: "en cours" } : up ? { n: up, l: "à venir" } : { n: st.length, l: st.length > 1 ? "terminés" : st.length ? "terminé" : "" }
}
export const currentSite = (c: Client, today = todayISO()) => c.chantiers.filter(x => effectiveStatus(x, today) === "in_progress").sort((a, b) => (b.start_date || "").localeCompare(a.start_date || ""))[0]
  || c.chantiers.filter(x => effectiveStatus(x, today) === "upcoming").sort((a, b) => (a.start_date || "9").localeCompare(b.start_date || "9"))[0]
export function summary(cs: Client[], chantiers: ChIn[], factures: FactIn[], today = todayISO()) {
  return { clients: cs.length, onsite: chantiers.filter(x => effectiveStatus(x, today) === "in_progress").length, due: dueTotal(factures) }
}

/* ---------- historique ---------- */
export type HKind = "call" | "devis" | "chantier" | "facture"
export type HItem = { id: string; kind: HKind; at: string; title: string; sub: string }
const eurS = (n: number) => `${Math.round(n).toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ")} €`
const TL: Record<string, string> = { facture: "facture", acompte: "acompte", situation: "situation", solde: "solde", avoir: "avoir" }
const clip = (s: string, n = 64) => { const t = s.replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1).replace(/[\s,.;:]+\S*$/, "") + "…" : t }
const at8 = (d: string) => `${d}T08:00:00`
export function history(c: Client, sigs: SigIn[] = [], today = todayISO()): HItem[] {
  const out: HItem[] = [], signed = new Map(sigs.map(s => [s.devis_id, s.at]))
  for (const x of c.calls) {
    if (!x.createdAt) continue
    const ev = c.events.find(e => e.callId === x.id)
    const sub = ev ? `RDV ${/visite/i.test(ev.topic || "") ? "de visite " : ""}calé le ${dmy(ev.date, today)}` : clip(x.besoin || x.note || x.topic || "")
    out.push({ id: `c${x.id}`, kind: "call", at: x.createdAt, title: "Appel pris par la réceptionniste", sub })
  }
  for (const d of c.devis) {
    const n = `Devis N° ${d.num || "—"}`, amt = eurS(d.amount)
    // une ligne par devis, à sa dernière étape : accepté / refusé > envoyé > créé (comme la maquette)
    const sAt = signed.get(d.id)
    if (d.status === "val") out.push({ id: `da${d.id}`, kind: "devis", at: sAt || d.repliedAt || d.sentAt || d.at || "", title: `${n} accepté`, sub: `${amt}${sAt ? " · signé en ligne" : ""}` })
    else if (d.status === "ref" && (d.repliedAt || d.sentAt)) out.push({ id: `dr${d.id}`, kind: "devis", at: d.repliedAt || d.sentAt!, title: `${n} refusé`, sub: amt })
    else if (d.sentAt) out.push({ id: `de${d.id}`, kind: "devis", at: d.sentAt, title: `${n} envoyé`, sub: `${amt} · ${clip(d.objet, 40)}` })
    else if (d.at) out.push({ id: `dc${d.id}`, kind: "devis", at: d.at, title: `${n} créé`, sub: `${amt} · ${clip(d.objet, 40)}` })
  }
  for (const x of c.chantiers) {
    const st = effectiveStatus(x, today)
    if (st !== "upcoming" && x.start_date) out.push({ id: `hs${x.id}`, kind: "chantier", at: at8(x.start_date), title: "Chantier démarré", sub: x.title })
    if (st === "done" && x.end_date && x.end_date <= today) out.push({ id: `he${x.id}`, kind: "chantier", at: `${x.end_date}T18:00:00`, title: "Chantier terminé", sub: x.title })
  }
  for (const f of c.factures) {
    if (!f.numero) continue
    const what = f.type === "avoir" ? "Avoir" : "Facture", sub = `${eurS(Math.abs(Number(f.total_ttc) || 0))} · ${TL[f.type] || "facture"}`
    const sent = f.envoyee_le || (f.date_emission ? at8(f.date_emission) : "")
    if (sent) out.push({ id: `fe${f.id}`, kind: "facture", at: sent, title: `${what} ${f.numero} ${f.envoyee_le ? "envoyée" : "émise"}`, sub })
    if (f.payee_le) out.push({ id: `fp${f.id}`, kind: "facture", at: f.payee_le, title: `${what} ${f.numero} payée`, sub })
  }
  return out.filter(x => x.at).sort((a, b) => +new Date(b.at) - +new Date(a.at) || b.id.localeCompare(a.id))
}
export const histDate = (iso: string, today = todayISO()) => dmy(day(iso), today)

/* ---------- documents ---------- */
export type Doc = { id: string; kind: "devis" | "facture"; title: string; sub: string; amount: number; status: string; tone: "ok" | "late" | "muted"; date: string }
const DST: Record<string, string> = { brouillon: "Brouillon", aval: "À valider", att: "En attente", env: "Envoyé", val: "Accepté", ref: "Refusé", sans: "Sans réponse" }
const FST: Record<string, string> = { brouillon: "Brouillon", emise: "Émise", envoyee: "Envoyée", payee: "Payée", annulee: "Annulée" }
const FTL: Record<string, string> = { facture: "Facture", acompte: "Acompte", situation: "Situation", solde: "Solde", avoir: "Avoir" }
export function documents(c: Client, today = todayISO()): Doc[] {
  const ds: Doc[] = c.devis.map(d => ({ id: d.id, kind: "devis", title: `Devis N° ${d.num || "—"}`, sub: [clip(d.objet, 26), dmy(day(d.sentAt || d.at), today)].filter(Boolean).join(" · "), amount: d.amount, status: DST[d.status] || "Brouillon", tone: d.status === "val" ? "ok" : "muted", date: day(d.sentAt || d.at) }))
  const fs: Doc[] = c.factures.map(f => ({ id: f.id, kind: "facture", title: `${f.type === "avoir" ? "Avoir" : "Facture"} ${f.numero || "(brouillon)"}`, sub: [FTL[f.type] || "Facture", dmy(day(f.date_emission || f.created_at), today)].filter(Boolean).join(" · "), amount: f.type === "avoir" ? -Math.abs(Number(f.total_ttc) || 0) : Number(f.total_ttc) || 0, status: factLate(f, today) ? "En retard" : FST[f.statut] || "Brouillon", tone: factLate(f, today) ? "late" : f.statut === "payee" ? "ok" : "muted", date: day(f.date_emission || f.created_at) }))
  return [...fs, ...ds].sort((a, b) => b.date.localeCompare(a.date))
}

/* ---------- saisie ---------- */
export function frPhone(raw?: string | null) {
  let d = (raw || "").replace(/[\s.\-()]/g, "")
  if (d.startsWith("+33")) d = "0" + d.slice(3); else if (d.startsWith("0033")) d = "0" + d.slice(4)
  if (!/^0[1-9]\d{8}$/.test(d)) return ""
  return d.replace(/(\d{2})(?=\d)/g, "$1 ")
}
export const validEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim()) && e.trim().length <= 254
/** SIREN (9 chiffres) depuis un SIREN ou un SIRET (14 chiffres = SIREN + NIC) ; "" si invalide. */
export function sirenOf(raw: string) { const d = raw.replace(/\s/g, ""); return /^\d{9}$/.test(d) ? d : /^\d{14}$/.test(d) ? d.slice(0, 9) : "" }
/** Partie tapée mise en gras : renvoie [début, gras, fin] (comparaison sans accents ni casse). */
export function boldMatch(label: string, q: string): [string, string, string] {
  const L = norm(label), Q = norm(q); if (!Q) return ["", "", label]
  const i = L.indexOf(Q)
  if (i < 0) { let n = 0; while (n < Q.length && n < L.length && L[n] === Q[n]) n++; return n >= 2 ? ["", label.slice(0, n), label.slice(n)] : ["", "", label] }
  return [label.slice(0, i), label.slice(i, i + Q.length), label.slice(i + Q.length)]
}
/** Import d'une fiche vCard (.vcf) : premier contact du fichier. */
export type Picked = { first: string; last: string; company: string; phone: string; email: string; addr: string }
export function parseVcf(text: string): Picked | null {
  const raw = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, ""), card = raw.split(/BEGIN:VCARD/i)[1]; if (!card) return null
  const lines = card.split("\n"), get = (k: string) => lines.filter(l => new RegExp(`^(item\\d+\\.)?${k}[;:]`, "i").test(l))
  const val = (l?: string) => (l ? l.slice(l.indexOf(":") + 1) : "").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/gi, " ").trim()
  const n = val(get("N")[0]).split(";"), fn = val(get("FN")[0])
  const tels = get("TEL"), tel = tels.find(l => /CELL|MOBILE/i.test(l.slice(0, l.indexOf(":")))) || tels[0]
  const adr = val(get("ADR")[0]).split(";"), addr = adr.length >= 6 ? [adr[2], [adr[5], adr[3]].filter(Boolean).join(" ")].filter(Boolean).join(", ") : ""
  let first = (n[1] || "").trim(), last = (n[0] || "").trim()
  if (!first && !last && fn) { const w = fn.split(/\s+/); first = w[0] || ""; last = w.slice(1).join(" ") }
  const out = { first, last, company: val(get("ORG")[0]).split(";")[0].trim(), phone: val(tel).replace(/^tel:/i, ""), email: val(get("EMAIL")[0]), addr }
  return out.first || out.last || out.company || out.phone ? out : null
}
export function fromPicker(c: { name?: string[]; tel?: string[]; email?: string[]; address?: { addressLine?: string[]; postalCode?: string; city?: string }[] } | undefined): Picked | null {
  if (!c) return null
  const nm = (c.name?.[0] || "").trim(), w = nm.split(/\s+/), a = c.address?.[0]
  const addr = a ? [(a.addressLine || []).join(" "), [a.postalCode, a.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") : ""
  const out = { first: w[0] || "", last: w.slice(1).join(" "), company: "", phone: c.tel?.[0] || "", email: c.email?.[0] || "", addr }
  return out.first || out.phone ? out : null
}
