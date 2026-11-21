/* update64 · Calculs des chantiers (purs, testés dans scripts/test-chantiers.ts) :
   statut effectif, avancement (dates ou valeur manuelle), « Jour X sur Y », « Dans X jours », libellés de dates. */
export type ChStatus = "upcoming" | "in_progress" | "done"
export type ChDates = { status: ChStatus; start_date?: string | null; end_date?: string | null; progress_override?: number | null }

const MO = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]
const isD = (d?: string | null): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d)
const ut = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
/** Date du jour (fuseau de l'appareil) au format AAAA-MM-JJ. */
export const todayISO = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
/** Nombre de jours calendaires de a à b (indépendant des changements d'heure). */
export const daysBetween = (a: string, b: string) => Math.round((ut(b) - ut(a)) / 864e5)
export const addDaysISO = (d: string, n: number) => { const x = new Date(ut(d) + n * 864e5); return x.toISOString().slice(0, 10) }

/** Statut affiché : « Terminé » reste terminé ; sinon il découle des dates (à venir avant le début, en cours ensuite). */
export function effectiveStatus(c: ChDates, today = todayISO()): ChStatus {
  if (c.status === "done") return "done"
  if (isD(c.start_date)) return daysBetween(today, c.start_date) > 0 ? "upcoming" : "in_progress"
  return c.status === "in_progress" ? "in_progress" : "upcoming"
}

/** Durée en jours (début et fin inclus), au moins 1. */
export const durationDays = (c: ChDates) => isD(c.start_date) && isD(c.end_date) ? Math.max(1, daysBetween(c.start_date, c.end_date) + 1) : isD(c.start_date) ? 1 : 0

/** Jour courant du chantier (1 = premier jour), borné à [0, durée]. */
export function dayIndex(c: ChDates, today = todayISO()) {
  const total = durationDays(c)
  if (!total || !isD(c.start_date)) return 0
  return Math.min(total, Math.max(0, daysBetween(c.start_date, today) + 1))
}

/** Avancement en % : valeur manuelle si renseignée, sinon jours écoulés / durée. 100 si terminé, 0 si à venir. */
export function progressPct(c: ChDates, today = todayISO()): number {
  const st = effectiveStatus(c, today)
  if (c.progress_override != null && Number.isFinite(Number(c.progress_override))) return Math.min(100, Math.max(0, Math.round(Number(c.progress_override))))
  if (st === "done") return 100
  if (st === "upcoming") return 0
  const total = durationDays(c)
  if (!total) return 0
  return Math.min(100, Math.max(0, Math.round(dayIndex(c, today) / total * 100)))
}

/** Jours avant le début (0 = aujourd'hui) ; null sans date de début. */
export const daysUntil = (c: ChDates, today = todayISO()) => isD(c.start_date) ? daysBetween(today, c.start_date) : null
export function untilLabel(c: ChDates, today = todayISO()) {
  const n = daysUntil(c, today)
  if (n == null) return "Date à fixer"
  if (n <= 0) return "Aujourd'hui"
  if (n === 1) return "Demain"
  return `Dans ${n} jours`
}
/** En retard : en cours et date de fin dépassée. */
export const isLateCh = (c: ChDates, today = todayISO()) => effectiveStatus(c, today) === "in_progress" && isD(c.end_date) && daysBetween(c.end_date, today) > 0

const dm = (d: string) => `${+d.slice(8, 10)} ${MO[+d.slice(5, 7) - 1]}`
/** « 18 – 29 nov. », « 28 nov. – 3 déc. », « 18 nov. », « Dates à fixer ». */
export function rangeLabel(c: ChDates) {
  const a = isD(c.start_date) ? c.start_date : null, b = isD(c.end_date) ? c.end_date : null
  if (!a && !b) return "Dates à fixer"
  if (a && (!b || a === b)) return dm(a)
  if (!a) return `Jusqu'au ${dm(b!)}`
  const yr = a.slice(0, 4) !== b!.slice(0, 4)
  if (!yr && a.slice(5, 7) === b!.slice(5, 7)) return `${+a.slice(8, 10)} – ${dm(b!)}`
  return `${dm(a)}${yr ? " " + a.slice(0, 4) : ""} – ${dm(b!)}${yr ? " " + b!.slice(0, 4) : ""}`
}
/** « Du 18 au 29 nov. », « Le 18 nov. », « Du 28 nov. au 3 déc. ». */
export function rangeLong(c: ChDates) {
  const a = isD(c.start_date) ? c.start_date : null, b = isD(c.end_date) ? c.end_date : null
  if (!a && !b) return "Dates à fixer"
  if (a && (!b || a === b)) return `Le ${dm(a)}`
  if (!a) return `Jusqu'au ${dm(b!)}`
  if (a.slice(0, 7) === b!.slice(0, 7)) return `Du ${+a.slice(8, 10)} au ${dm(b!)}`
  return `Du ${dm(a)} au ${dm(b!)}`
}
export const endLabel = (c: ChDates) => isD(c.end_date) ? `Fin prévue le ${dm(c.end_date)}` : "Fin à fixer"
export const STATUS_LABEL: Record<ChStatus, string> = { upcoming: "À venir", in_progress: "En cours", done: "Terminé" }
export const STATUS_COLOR: Record<ChStatus, string> = { upcoming: "#2F7BFF", in_progress: "#FF9F0A", done: "#D9D9DE" }
