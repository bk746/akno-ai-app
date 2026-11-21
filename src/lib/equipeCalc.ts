/* update65 · Calculs de la page Équipe (purs, testés dans scripts/test-equipe.ts) :
   statut du jour, regroupement, prochain chantier, semaine prochaine, téléphone, libellés. */
import { addDaysISO, daysBetween, effectiveStatus, todayISO, type ChDates } from "./chantierCalc"

export type AccessRole = "ouvrier" | "chef" | "admin"
export type Member = { id: string; first_name: string; last_name: string | null; role: string | null; phone?: string | null; email?: string | null; hired_on?: string | null; created_at?: string | null; access_role?: AccessRole | null; invite_status?: "pending" | "accepted" | null; invited_at?: string | null }
export type Site = ChDates & { id: string; title: string; client_nom?: string | null; address?: string | null; lat?: number | null; lng?: number | null }
export type Link = { chantier_id: string; employe_id: string }

export const ROLE_LABEL: Record<AccessRole, string> = { ouvrier: "Ouvrier", chef: "Chef d'équipe", admin: "Admin" }
export const METIERS = ["Plombier", "Électricien", "Maçon", "Carreleur", "Peintre", "Menuisier"] as const
const MO = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]
const MOL = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
const WD = ["Lun", "Mar", "Mer", "Jeu", "Ven"]
const isD = (d?: string | null): d is string => !!d && /^\d{4}-\d{2}-\d{2}/.test(d)

/** « Julien D. » */
export const shortName = (m: Pick<Member, "first_name" | "last_name">) => `${m.first_name.trim()}${m.last_name?.trim() ? " " + m.last_name.trim()[0].toUpperCase() + "." : ""}`
export const initialsOf = (m: Pick<Member, "first_name" | "last_name">) => `${m.first_name.trim()[0] || ""}${m.last_name?.trim()[0] || ""}`.toUpperCase() || "?"

/** Chantiers d'un membre. */
export const sitesOf = (id: string, sites: Site[], links: Link[]) => { const ids = new Set(links.filter(l => l.employe_id === id).map(l => l.chantier_id)); return sites.filter(s => ids.has(s.id)) }

export type Today = { kind: "pending" | "onsite" | "free"; current: Site | null; next: Site | null }
/** Statut du jour : invitation en attente, sur chantier (chantier en cours), ou disponible (avec son prochain chantier). */
export function memberToday(m: Member, sites: Site[], links: Link[], today = todayISO()): Today {
  const mine = sitesOf(m.id, sites, links)
  const cur = mine.filter(s => effectiveStatus(s, today) === "in_progress").sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""))[0] || null
  const next = mine.filter(s => effectiveStatus(s, today) === "upcoming").sort((a, b) => (a.start_date || "9999").localeCompare(b.start_date || "9999"))[0] || null
  return { kind: m.invite_status === "pending" ? "pending" : cur ? "onsite" : "free", current: cur, next }
}

/** Groupes de la page : sur chantier aujourd'hui, disponibles, invitations en attente (+ résumé). */
export function groupTeam(ms: Member[], sites: Site[], links: Link[], today = todayISO(), q = "") {
  const n = norm(q)
  const all = ms.map(m => ({ m, t: memberToday(m, sites, links, today) }))
  // ancienneté d'abord (comme la maquette : chef de chantier, puis les plus anciens), puis prénom
  const byName = (a: { m: Member }, b: { m: Member }) => (a.m.hired_on || "9999").localeCompare(b.m.hired_on || "9999") || a.m.first_name.localeCompare(b.m.first_name, "fr")
  const vis = all.filter(x => !n || norm(`${x.m.first_name} ${x.m.last_name || ""} ${x.m.role || ""}`).includes(n))
  return {
    onsite: vis.filter(x => x.t.kind === "onsite").sort(byName), free: vis.filter(x => x.t.kind === "free").sort(byName), pending: vis.filter(x => x.t.kind === "pending").sort(byName),
    total: ms.length, onsiteN: all.filter(x => x.t.current).length, freeN: all.filter(x => x.t.kind === "free").length,
  }
}
export const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()

/** Titre court pour une ligne : « Rénovation salle de bain » → « Salle de bain », « Pose cuisine équipée » → « Cuisine ». */
export function shortTitle(t: string) {
  let s = t.trim().replace(/^(rénovation|renovation|réfection|refection|pose|création|creation|installation|remplacement|mise aux normes|mise en conformité|réparation|reparation|isolation|aménagement|amenagement|ravalement|travaux|chantier)\s+(d[eu]s?\s+|de la\s+|de l'|d'|la\s+|le\s+|les\s+|l')?/i, "").trim()
  if (!s) s = t.trim()
  if (s.length > 14) s = s.split(/\s+/)[0]
  return s.charAt(0).toUpperCase() + s.slice(1)
}
const dm = (d: string) => `${+d.slice(8, 10)} ${MO[+d.slice(5, 7) - 1]}`
/** Libellé à droite d'une ligne : « Salle de bain » (en cours) ou « Cuisine · 2 déc. » (prochain). */
export function rowSite(t: Today) {
  if (t.current) return { color: "#FF9F0A", text: shortTitle(t.current.title) }
  if (t.next) return { color: "#2F7BFF", text: `${shortTitle(t.next.title)}${isD(t.next.start_date) ? " · " + dm(t.next.start_date) : ""}` }
  return null
}

/** Ville d'une adresse française (« …, 74960 Cran-Gevrier » → « Cran-Gevrier »). */
export const cityOf = (a?: string | null) => { const m = (a || "").match(/\b\d{5}\s+([^,]+)$/); return m ? m[1].trim() : (a || "").split(",").pop()?.trim() || "" }
/** Nom court d'un client pour les cases de la semaine (« Mme Lefèvre » → « Lefèvre »). */
export const clientShort = (n?: string | null) => { const s = (n || "").replace(/^(m\.|mme|mlle|mr|monsieur|madame|sci|sarl|sas)\s+/i, "").trim(); return s.split(/\s+/).slice(-1)[0] || "" }

/** Lundi de la semaine qui suit `today` (« Semaine prochaine »). */
export function nextMonday(today = todayISO()) {
  const wd = (new Date(today + "T12:00:00Z").getUTCDay() + 6) % 7 // 0 = lundi
  return addDaysISO(today, 7 - wd)
}
export type DayCell = { date: string; wd: string; num: number; site: Site | null; color: string | null; client: string }
/** Les 5 jours ouvrés de la semaine prochaine, avec le chantier du membre ce jour-là. */
export function weekPlan(id: string, sites: Site[], links: Link[], today = todayISO()): DayCell[] {
  const mine = sitesOf(id, sites, links).filter(s => s.status !== "done" && isD(s.start_date))
  const mon = nextMonday(today)
  return WD.map((wd, i) => {
    const date = addDaysISO(mon, i)
    const site = mine.filter(s => s.start_date! <= date && (isD(s.end_date) ? s.end_date >= date : s.start_date === date)).sort((a, b) => (b.start_date || "").localeCompare(a.start_date || ""))[0] || null // le plus récent : une intervention d'un jour passe devant le long chantier
    const st = site ? effectiveStatus(site, date) : null
    return { date, wd, num: +date.slice(8, 10), site, color: site ? (st === "in_progress" && effectiveStatus(site, today) === "in_progress" ? "#FF9F0A" : "#2F7BFF") : null, client: site ? clientShort(site.client_nom) || shortTitle(site.title) : "" }
  })
}
/** « 23 – 27 nov. » */
export function weekRange(cells: DayCell[]) {
  const a = cells[0].date, b = cells[cells.length - 1].date
  return a.slice(5, 7) === b.slice(5, 7) ? `${+a.slice(8, 10)} – ${dm(b)}` : `${dm(a)} – ${dm(b)}`
}

/** Téléphone français : 10 chiffres commençant par 0 (ou +33 / 0033). Renvoie la forme « 06 41 22 87 15 » ou "" si invalide. */
export function frPhone(raw?: string | null) {
  let d = (raw || "").replace(/[\s.\-()]/g, "")
  if (d.startsWith("+33")) d = "0" + d.slice(3)
  else if (d.startsWith("0033")) d = "0" + d.slice(4)
  if (!/^0[1-9]\d{8}$/.test(d)) return ""
  return d.replace(/(\d\d)(?=\d)/g, "$1 ")
}
export const isMobile = (p?: string | null) => /^0[67]/.test(frPhone(p))
export const validEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim()) && e.trim().length <= 254

/** « invité aujourd'hui », « invité hier », « invité il y a 2 j » ; « invitation à envoyer » sans date. */
export function invitedAgo(iso?: string | null, now = new Date()) {
  if (!iso) return "invitation à envoyer"
  const n = daysBetween(todayISO(new Date(iso)), todayISO(now))
  return n <= 0 ? "invité aujourd'hui" : n === 1 ? "invité hier" : `invité il y a ${n} j`
}
/** Date d'entrée (ou date d'ajout) : « 3 mars 2021 », année « 2021 ». */
export const entryDate = (m: Member) => (m.hired_on && isD(m.hired_on) ? m.hired_on : m.created_at && isD(m.created_at) ? m.created_at.slice(0, 10) : "")
export const longDate = (d: string) => isD(d) ? `${+d.slice(8, 10)} ${MOL[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : ""
export const sinceLabel = (m: Member) => { const d = entryDate(m); return d ? `depuis ${d.slice(0, 4)}` : "" }
/** Date du jour AAAA-MM-JJ (fuseau de l'appareil). */
export const todayISOsafe = () => todayISO()
