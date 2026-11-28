/* update78 · Types d'événements, conflits, trajet approximatif, récurrence, ICS, occupation, export paie. */
export type EvKind = "chantier" | "rdv" | "visite" | "sav" | "urgence" | "absence"
export type AbsenceKind = "conges" | "maladie" | "formation"
export type EvStatus = "prevu" | "en_route" | "arrive" | "termine" | "annule"

export const EV_KIND: { id: EvKind; label: string; color: string }[] = [
  { id: "chantier", label: "Chantier", color: "#FF9F0A" },
  { id: "rdv", label: "RDV / visite", color: "#0A84FF" },
  { id: "visite", label: "Visite technique", color: "#64D2FF" },
  { id: "sav", label: "SAV", color: "#FF375F" },
  { id: "urgence", label: "Urgence", color: "#FF453A" },
  { id: "absence", label: "Absence", color: "#8E8E93" },
]
export const ABSENCE_KIND: { id: AbsenceKind; label: string }[] = [
  { id: "conges", label: "Congés" },
  { id: "maladie", label: "Maladie" },
  { id: "formation", label: "Formation" },
]
export const kindMeta = (k?: string) => EV_KIND.find(x => x.id === k) || EV_KIND[1]
export const kindColor = (k?: string) => kindMeta(k).color
export const kindLabel = (k?: string, abs?: string | null) => {
  if (k === "absence") return ABSENCE_KIND.find(x => x.id === abs)?.label || "Absence"
  if (k === "visite") return "Visite technique"
  return kindMeta(k).label
}

export type AgendaEv = {
  id: string
  date: string
  start: number
  dur: number
  name: string
  topic: string
  addr?: string
  kind?: EvKind
  absenceKind?: AbsenceKind
  employeId?: string
  clientId?: string
  devisId?: string
  factureId?: string
  chantierId?: string
  status?: EvStatus
  lat?: number
  lng?: number
  rrule?: string
  parentId?: string
  phone?: string
  email?: string
  notes?: string
  notesTerrain?: string
  arrivedAt?: string
  departedAt?: string
  travelMin?: number
  photos?: string[]
  signature?: string
  virtual?: boolean
}

const pad = (n: number) => String(n).padStart(2, "0")
export const addDaysYmd = (ymd: string, n: number) => {
  const d = new Date(ymd + "T12:00:00")
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** RRule très simple : FREQ=WEEKLY|MONTHLY|YEARLY ; INTERVAL ; COUNT ou UNTIL=YYYY-MM-DD. */
export function parseRRule(raw?: string | null) {
  if (!raw) return null
  const o: { freq: "WEEKLY" | "MONTHLY" | "YEARLY"; interval: number; count?: number; until?: string } = { freq: "WEEKLY", interval: 1 }
  for (const part of raw.split(";")) {
    const [k, v] = part.split("=")
    if (k === "FREQ" && (v === "WEEKLY" || v === "MONTHLY" || v === "YEARLY")) o.freq = v
    if (k === "INTERVAL") o.interval = Math.max(1, Number(v) || 1)
    if (k === "COUNT") o.count = Math.max(1, Number(v) || 1)
    if (k === "UNTIL") o.until = v.slice(0, 10)
  }
  return o
}
export function rruleLabel(raw?: string | null) {
  const r = parseRRule(raw)
  if (!r) return ""
  const ev = r.interval === 1 ? (r.freq === "WEEKLY" ? "Chaque semaine" : r.freq === "MONTHLY" ? "Chaque mois" : "Chaque année") : `Tous les ${r.interval} ${r.freq === "WEEKLY" ? "semaines" : r.freq === "MONTHLY" ? "mois" : "ans"}`
  if (r.until) return `${ev} jusqu'au ${r.until.split("-").reverse().join("/")}`
  if (r.count) return `${ev} · ${r.count} fois`
  return ev
}
function nextDate(ymd: string, freq: "WEEKLY" | "MONTHLY" | "YEARLY", interval: number) {
  const d = new Date(ymd + "T12:00:00")
  if (freq === "WEEKLY") d.setDate(d.getDate() + 7 * interval)
  else if (freq === "MONTHLY") d.setMonth(d.getMonth() + interval)
  else d.setFullYear(d.getFullYear() + interval)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
/** Déplie les événements récurrents dans [from, to] (dates ISO). */
export function expandRecurring<T extends AgendaEv>(events: T[], from: string, to: string): T[] {
  const out: T[] = []
  for (const e of events) {
    const rule = parseRRule(e.rrule)
    if (!rule || e.parentId) { if (e.date >= from && e.date <= to) out.push(e); continue }
    let d = e.date, n = 0
    const max = rule.count || 80
    while (n < max && d <= to && (!rule.until || d <= rule.until)) {
      if (d >= from) out.push({ ...e, id: n === 0 ? e.id : `${e.id}:${d}`, date: d, parentId: e.id, virtual: n > 0 } as T)
      d = nextDate(d, rule.freq, rule.interval)
      n++
    }
  }
  return out
}


/** Découpe un chantier (ou tout événement) qui dépasse minuit en occurrences affichables, une par jour. */
export function expandForGrid<T extends AgendaEv>(events: T[]): T[] {
  const out: T[] = []
  for (const e of events) {
    const endH = e.start + e.dur
    if (endH <= 24) { out.push(e); continue }
    let remain = e.dur, date = e.date, start = e.start, first = true
    while (remain > 0.01) {
      const chunk = Math.min(remain, 24 - start)
      out.push({ ...e, id: first ? e.id : `${e.id}~${date}`, date, start, dur: chunk, virtual: !first, parentId: first ? e.parentId : e.id })
      remain -= chunk
      date = addDaysYmd(date, 1)
      start = 0
      first = false
    }
  }
  return out
}

export type Conflict = { a: string; b: string; reason: "chevauchement" | "absence" }
/** Conflit : même personne à deux endroits, ou prévue alors qu'elle est en congé. */
export function findConflicts(events: AgendaEv[]): Conflict[] {
  const out: Conflict[] = []
  const by = new Map<string, AgendaEv[]>()
  for (const e of events) {
    if (e.status === "annule" || !e.employeId) continue
    const k = e.employeId + ":" + e.date
    const arr = by.get(k) || []
    arr.push(e)
    by.set(k, arr)
  }
  for (const arr of by.values()) {
    const abs = arr.filter(e => e.kind === "absence")
    const work = arr.filter(e => e.kind !== "absence")
    for (const a of work) for (const b of abs) {
      if (overlap(a, b)) out.push({ a: a.id, b: b.id, reason: "absence" })
    }
    for (let i = 0; i < work.length; i++) for (let j = i + 1; j < work.length; j++) {
      if (overlap(work[i], work[j])) out.push({ a: work[i].id, b: work[j].id, reason: "chevauchement" })
    }
  }
  return out
}
const overlap = (a: AgendaEv, b: AgendaEv) => a.start < b.start + b.dur && b.start < a.start + a.dur

/** Distance à vol d'oiseau (km). */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}
/** Temps de trajet approximatif : 35 km/h + 5 min (pas d'API externe). */
export function travelMinutes(a?: { lat?: number; lng?: number }, b?: { lat?: number; lng?: number }) {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return null
  const km = haversineKm({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng })
  return Math.round(5 + (km / 35) * 60)
}
export function attachTravel<T extends AgendaEv>(events: T[]): T[] {
  const by = new Map<string, T[]>()
  for (const e of events) {
    if (e.kind === "absence" || e.status === "annule") continue
    const k = (e.employeId || "_") + ":" + e.date
    const arr = by.get(k) || []
    arr.push(e)
    by.set(k, arr)
  }
  const extra = new Map<string, number>()
  for (const arr of by.values()) {
    arr.sort((a, b) => a.start - b.start)
    for (let i = 1; i < arr.length; i++) {
      const m = travelMinutes(arr[i - 1], arr[i])
      if (m != null) extra.set(arr[i].id, m)
    }
  }
  return events.map(e => extra.has(e.id) ? { ...e, travelMin: extra.get(e.id) } : e)
}

export const plannedHours = (e: AgendaEv) => e.kind === "absence" ? 0 : e.dur
export function actualHours(e: AgendaEv) {
  if (!e.arrivedAt || !e.departedAt) return null
  return Math.max(0, (new Date(e.departedAt).getTime() - new Date(e.arrivedAt).getTime()) / 3600e3)
}
/** Taux d'occupation d'une personne sur une journée (heures de travail / amplitude 8–18, absences exclues). */
export function occupationRate(events: AgendaEv[], employeId: string | undefined, date: string, dayHours = 10) {
  const list = events.filter(e => e.date === date && (employeId ? e.employeId === employeId : !e.employeId) && e.kind !== "absence" && e.status !== "annule")
  const h = list.reduce((a, e) => a + e.dur, 0)
  return dayHours ? Math.min(1, h / dayHours) : 0
}

export function payrollRows(events: AgendaEv[], names: Record<string, string>, from: string, to: string) {
  const map = new Map<string, { name: string; planned: number; actual: number; days: number }>()
  for (const e of events) {
    if (e.date < from || e.date > to || e.kind === "absence" || e.status === "annule") continue
    const id = e.employeId || "patron"
    const row = map.get(id) || { name: names[id] || (id === "patron" ? "Patron" : "Employé"), planned: 0, actual: 0, days: 0 }
    row.planned += plannedHours(e)
    const act = actualHours(e)
    if (act != null) row.actual += act
    row.days += 1
    map.set(id, row)
  }
  return [...map.entries()].map(([id, r]) => ({ id, ...r }))
}
export function payrollCsv(rows: ReturnType<typeof payrollRows>) {
  const head = "Employé;Heures prévues;Heures réelles;Interventions"
  const lines = rows.map(r => [r.name, r.planned.toFixed(2).replace(".", ","), r.actual.toFixed(2).replace(".", ","), r.days].join(";"))
  return "\ufeff" + [head, ...lines].join("\n")
}

function icsDate(ymd: string, hours: number) {
  const d = new Date(`${ymd}T00:00:00`)
  d.setMinutes(Math.round(hours * 60))
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return z.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
}
export function toIcs(events: AgendaEv[], calName = "Akno") {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Akno//Agenda//FR", `X-WR-CALNAME:${calName}`]
  for (const e of events) {
    if (e.status === "annule" || e.virtual) continue
    lines.push("BEGIN:VEVENT", `UID:${e.id}@akno.app`, `DTSTAMP:${icsDate(e.date, e.start)}`, `DTSTART:${icsDate(e.date, e.start)}`, `DTEND:${icsDate(e.date, e.start + e.dur)}`, `SUMMARY:${(e.topic || e.name || "Rendez-vous").replace(/\n/g, " ")}`, `DESCRIPTION:${[e.name, kindLabel(e.kind, e.absenceKind), e.notes].filter(Boolean).join(" — ").replace(/\n/g, " \\n")}`, e.addr ? `LOCATION:${e.addr.replace(/\n/g, " ")}` : "", e.rrule ? `RRULE:${e.rrule}` : "", "END:VEVENT")
  }
  lines.push("END:VCALENDAR")
  return lines.filter(Boolean).join("\r\n")
}
export function downloadIcs(events: AgendaEv[], filename = "akno-agenda.ics") {
  const blob = new window.Blob([toIcs(events)], { type: "text/calendar;charset=utf-8" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
}

export function mapsUrl(addr: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`
}
export function wazeUrl(addr: string, lat?: number, lng?: number) {
  if (lat != null && lng != null) return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
  return `https://waze.com/ul?q=${encodeURIComponent(addr)}&navigate=yes`
}
