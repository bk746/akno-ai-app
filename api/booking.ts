import { createClient } from "@supabase/supabase-js"

type Json = Record<string, unknown>
const TZ = "Europe/Paris"
const env = (name: string) => (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name]
const DAYS_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"]

export type BookingSlot = { start: string; end?: string; label: string; date: string; heure: string }

type SlotsInput = { date_from?: string; date_to?: string; preferred_day?: string; duree_minutes?: number }
type BookInput = {
  client?: string
  telephone?: string
  email?: string
  date?: string
  heure?: string
  duree_minutes?: number
  objet?: string
  adresse?: string
  ville?: string
  notes?: string
}

function parisParts(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
  })
  const p = Object.fromEntries(fmt.formatToParts(d).filter(x => x.type !== "literal").map(x => [x.type, x.value]))
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour), minute: Number(p.minute), weekday: p.weekday || "" }
}

function pad(n: number) { return String(n).padStart(2, "0") }
function isoDay(y: number, m: number, d: number) { return `${y}-${pad(m)}-${pad(d)}` }

function zonedTimeToUtc(y: number, m: number, d: number, h: number, min: number) {
  const utcGuess = Date.UTC(y, m - 1, d, h, min, 0)
  const p = parisParts(new Date(utcGuess))
  const asIf = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
  return new Date(utcGuess + (Date.UTC(y, m - 1, d, h, min) - asIf))
}

function addDaysYmd(ymd: string, n: number) {
  const [y, m, d] = ymd.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return isoDay(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}

function todayParis() {
  const p = parisParts(new Date())
  return isoDay(p.year, p.month, p.day)
}

function formatParisLabel(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    timeZone: TZ, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  })
}

function slotView(startIso: string, endIso?: string): BookingSlot {
  const p = parisParts(new Date(startIso))
  return {
    start: new Date(startIso).toISOString(),
    end: endIso ? new Date(endIso).toISOString() : undefined,
    label: formatParisLabel(startIso),
    date: isoDay(p.year, p.month, p.day),
    heure: `${pad(p.hour)}:${pad(p.minute)}`,
  }
}

function isBusiness(startIso: string, endIso?: string) {
  const p = parisParts(new Date(startIso))
  const dow = new Date(startIso).toLocaleString("en-US", { timeZone: TZ, weekday: "short" })
  if (!["Mon", "Tue", "Wed", "Thu", "Fri"].includes(dow) || p.hour < 8) return false
  if (endIso) {
    const e = parisParts(new Date(endIso))
    if (e.hour > 18 || (e.hour === 18 && e.minute > 0)) return false
    return true
  }
  return p.hour < 17 || (p.hour === 17 && p.minute === 0)
}

function parsePreferredDay(raw?: string): { from?: string; to?: string; weekday?: number } {
  const v = (raw || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  if (!v) return {}
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return { from: v, to: v }
  const today = todayParis()
  if (v === "aujourd'hui" || v === "aujourdhui") return { from: today, to: today }
  if (v === "demain") { const t = addDaysYmd(today, 1); return { from: t, to: t } }
  const idx = DAYS_FR.findIndex(d => d.normalize("NFD").replace(/[\u0300-\u036f]/g, "") === v)
  if (idx >= 0) return { weekday: idx, from: today, to: addDaysYmd(today, 13) }
  return {}
}

function resolveRange(input: SlotsInput) {
  const pref = parsePreferredDay(input.preferred_day)
  let from = input.date_from || pref.from || todayParis()
  let to = input.date_to || pref.to || addDaysYmd(from, 13)
  if (from < todayParis()) from = todayParis()
  if (to < from) to = from
  return { from, to, weekday: pref.weekday }
}

function toE164(raw?: string) {
  if (!raw) return undefined
  const d = raw.replace(/[^\d+]/g, "")
  if (d.startsWith("+") && d.length >= 10) return d
  if (d.startsWith("0033")) return `+${d.slice(2)}`
  if (d.startsWith("33") && d.length >= 11) return `+${d}`
  if (/^0[1-9]\d{8}$/.test(d)) return `+33${d.slice(1)}`
  return undefined
}

async function verifyUser(authorization?: string) {
  const access = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : ""
  if (!access) return { error: { status: 401, body: { error: "Non authentifié." } } }
  const supabaseUrl = env("VITE_SUPABASE_URL") || env("SUPABASE_URL")
  const supabaseKey = env("VITE_SUPABASE_ANON_KEY") || env("SUPABASE_ANON_KEY")
  if (!supabaseUrl || !supabaseKey) return { error: { status: 503, body: { error: "Configuration Supabase manquante." } } }
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data: { user }, error } = await supabase.auth.getUser(access)
  if (error || !user) return { error: { status: 401, body: { error: "Session invalide." } } }
  return { user }
}

function calHeaders(version: string) {
  return {
    Authorization: `Bearer ${env("CALCOM_API_KEY") || ""}`,
    "Content-Type": "application/json",
    "cal-api-version": version,
  }
}

async function calFetch(path: string, version: string, init?: RequestInit) {
  const r = await fetch(`https://api.cal.com${path}`, { ...init, headers: { ...calHeaders(version), ...(init?.headers || {}) } })
  const payload = await r.json().catch(() => ({})) as Json
  return { r, payload }
}

type CalEventType = { id?: number; hidden?: boolean; lengthInMinutes?: number; length?: number }

function collectEventTypes(data: unknown): CalEventType[] {
  if (!data) return []
  if (Array.isArray(data)) return data as CalEventType[]
  if (typeof data !== "object") return []
  const o = data as { eventTypes?: CalEventType[]; eventTypeGroups?: { eventTypes?: CalEventType[] }[] }
  if (Array.isArray(o.eventTypes)) return o.eventTypes
  if (Array.isArray(o.eventTypeGroups)) return o.eventTypeGroups.flatMap(g => g.eventTypes || [])
  return []
}

let cachedEventType: { id: number; lengthInMinutes?: number } | null = null

async function resolveEventType() {
  if (cachedEventType) return cachedEventType
  const raw = env("CALCOM_EVENT_TYPE_ID")
  const n = raw ? Number(raw) : NaN
  if (Number.isFinite(n) && n > 0) {
    cachedEventType = { id: n }
    return cachedEventType
  }
  let { r, payload } = await calFetch("/v2/event-types", "2026-06-12")
  let list = collectEventTypes(payload.data)
  if (!list.length) {
    const me = await calFetch("/v2/me", "2024-06-14")
    const username = (me.payload.data as { username?: string } | undefined)?.username
    if (username) {
      ({ r, payload } = await calFetch(`/v2/event-types?username=${encodeURIComponent(username)}`, "2026-06-12"))
      list = collectEventTypes(payload.data)
    }
  }
  if (!r.ok && !list.length) throw new Error("Impossible de lire les types d'événement Cal.com.")
  const first = list.find(x => !x.hidden && x.id) || list.find(x => x.id)
  if (!first?.id) throw new Error("Aucun type d'événement Cal.com n'a été trouvé. Ajoute CALCOM_EVENT_TYPE_ID.")
  cachedEventType = { id: first.id, lengthInMinutes: first.lengthInMinutes || first.length }
  return cachedEventType
}

function flattenSlots(data: unknown): BookingSlot[] {
  const out: BookingSlot[] = []
  if (!data || typeof data !== "object") return out
  for (const items of Object.values(data as Record<string, unknown>)) {
    if (!Array.isArray(items)) continue
    for (const item of items) {
      const start = typeof item === "string" ? item : (item as { start?: string })?.start
      const end = typeof item === "object" && item ? (item as { end?: string }).end : undefined
      if (!start) continue
      if (new Date(start).getTime() <= Date.now()) continue
      if (!isBusiness(start, end)) continue
      out.push(slotView(start, end))
    }
  }
  out.sort((a, b) => a.start.localeCompare(b.start))
  return out
}

async function providerGetSlots(input: SlotsInput): Promise<{ ok: boolean; timezone: string; slots: BookingSlot[]; error?: string }> {
  const eventType = await resolveEventType()
  const eventTypeId = eventType.id
  const range = resolveRange(input)
  const duration = Math.max(15, Number(input.duree_minutes) || eventType.lengthInMinutes || 60)
  const q = new URLSearchParams({
    eventTypeId: String(eventTypeId),
    start: range.from,
    end: range.to,
    timeZone: TZ,
    format: "range",
  })
  if (input.duree_minutes || eventType.lengthInMinutes) q.set("duration", String(duration))
  const { r, payload } = await calFetch(`/v2/slots?${q}`, "2024-09-04")
  if (!r.ok) {
    const msg = String((payload as { error?: { message?: string }; message?: string }).error?.message || payload.message || "Impossible de lire les créneaux Cal.com.")
    return { ok: false, timezone: TZ, slots: [], error: msg }
  }
  let slots = flattenSlots(payload.data)
  if (range.weekday != null) slots = slots.filter(s => parisParts(new Date(s.start)).weekday && new Date(s.start).toLocaleString("en-US", { timeZone: TZ, weekday: "short" }) === ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][range.weekday!])
  return { ok: true, timezone: TZ, slots: slots.slice(0, 16) }
}

function parseBookStart(input: BookInput) {
  const d = (input.date || "").trim()
  const h = (input.heure || "").trim().replace("h", ":")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { error: "La date doit être au format AAAA-MM-JJ." }
  const hm = h.match(/^(\d{1,2}):(\d{2})$/)
  if (!hm) return { error: "L'heure doit être au format HH:MM." }
  const hours = Number(hm[1]), mins = Number(hm[2])
  if (hours < 8 || hours > 17 || (hours === 17 && mins > 0)) return { error: "Les rendez-vous sont possibles de 8 h à 18 h." }
  const start = zonedTimeToUtc(Number(d.slice(0, 4)), Number(d.slice(5, 7)), Number(d.slice(8, 10)), hours, mins)
  if (Number.isNaN(start.getTime())) return { error: "Date ou heure invalide." }
  const dow = start.toLocaleString("en-US", { timeZone: TZ, weekday: "short" })
  if (!["Mon", "Tue", "Wed", "Thu", "Fri"].includes(dow)) return { error: "Les rendez-vous sont du lundi au vendredi." }
  return { start }
}

async function providerBook(input: BookInput) {
  const parsed = parseBookStart(input)
  if ("error" in parsed) {
    const alts = await providerGetSlots({ date_from: input.date, date_to: input.date || addDaysYmd(input.date || todayParis(), 7), duree_minutes: input.duree_minutes })
    return { ok: false, error: parsed.error, alternatives: alts.slots.slice(0, 4) }
  }
  const eventType = await resolveEventType()
  const duration = Math.max(15, Number(input.duree_minutes) || eventType.lengthInMinutes || 60)
  const daySlots = await providerGetSlots({ date_from: input.date, date_to: input.date, duree_minutes: duration })
  const match = daySlots.slots.find(s => Math.abs(new Date(s.start).getTime() - parsed.start.getTime()) < 60_000)
  if (!match) {
    const wider = daySlots.slots.length ? daySlots : await providerGetSlots({ date_from: input.date || todayParis(), date_to: addDaysYmd(input.date || todayParis(), 7), duree_minutes: duration })
    return { ok: false, error: "Ce créneau n'est plus disponible.", alternatives: wider.slots.slice(0, 4) }
  }

  const eventTypeId = eventType.id
  const address = [input.adresse, input.ville].filter(Boolean).join(", ")
  const attendee: Json = {
    name: (input.client || "Client").trim(),
    timeZone: TZ,
    language: "fr",
  }
  const phone = toE164(input.telephone)
  if (phone) attendee.phoneNumber = phone
  const email = (input.email || "").trim()
  if (email && email.includes("@")) attendee.email = email
  if (!attendee.email && !attendee.phoneNumber) {
    const hint = (input.telephone || "").trim()
      ? "Le numéro de téléphone n'est pas valide. Demande-le à nouveau chiffre par chiffre, ou un e-mail."
      : "Il faut un numéro de téléphone ou un e-mail pour confirmer le rendez-vous."
    return { ok: false, error: hint, alternatives: [] }
  }

  const body: Json = {
    eventTypeId,
    start: match.start,
    attendee,
    ...(input.duree_minutes ? { lengthInMinutes: duration } : {}),
  }
  if (address) body.location = { type: "attendeeAddress", address }
  const notes = [input.objet, input.notes, address && `Adresse : ${address}`].filter(Boolean).join(" — ")
  if (notes) body.bookingFieldsResponses = { notes }

  const attempt = async (payload: Json) => calFetch("/v2/bookings", "2026-02-25", { method: "POST", body: JSON.stringify(payload) })
  let { r, payload } = await attempt(body)
  if (!r.ok && body.location) {
    const retry = { ...body }
    delete retry.location
    ;({ r, payload } = await attempt(retry))
  }
  if (!r.ok && body.bookingFieldsResponses) {
    const retry = { ...body }
    delete retry.location
    delete retry.bookingFieldsResponses
    ;({ r, payload } = await attempt(retry))
  }
  if (!r.ok) {
    const msg = String((payload as { error?: { message?: string }; message?: string }).error?.message || payload.message || "Impossible de réserver ce créneau.")
    const alts = await providerGetSlots({ date_from: input.date || todayParis(), date_to: addDaysYmd(input.date || todayParis(), 7), duree_minutes: duration })
    return { ok: false, error: msg, alternatives: alts.slots.slice(0, 4) }
  }
  const data = (payload.data && !Array.isArray(payload.data) ? payload.data : Array.isArray(payload.data) ? payload.data[0] : payload.data) as {
    start?: string; end?: string; uid?: string; duration?: number; title?: string
  } | undefined
  const start = data?.start || match.start
  const end = data?.end || match.end || new Date(new Date(start).getTime() + duration * 60_000).toISOString()
  return {
    ok: true,
    confirmation: `Rendez-vous confirmé ${formatParisLabel(start)} pour ${attendee.name}.`,
    start,
    end,
    cal_uid: data?.uid,
    label: formatParisLabel(start),
  }
}

export async function handleBooking(authorization: string | undefined, body: unknown): Promise<{ status: number; body: Json }> {
  const apiKey = env("CALCOM_API_KEY")
  if (!apiKey) {
    return { status: 503, body: { error: "La clé CALCOM_API_KEY n'est pas encore configurée sur Vercel." } }
  }
  const auth = await verifyUser(authorization)
  if ("error" in auth && auth.error) return auth.error

  const input = (body && typeof body === "object" ? body : {}) as Json & SlotsInput & BookInput & { action?: string }
  try {
    if (input.action === "slots") {
      const result = await providerGetSlots(input)
      return { status: result.ok ? 200 : 502, body: result }
    }
    if (input.action === "book") {
      const result = await providerBook(input)
      return { status: result.ok ? 200 : 409, body: result }
    }
    return { status: 400, body: { error: "Action inconnue." } }
  } catch (e) {
    return { status: 502, body: { error: e instanceof Error ? e.message : "Erreur agenda." } }
  }
}

type Res = { status: (n: number) => Res; json: (b: unknown) => void; setHeader: (k: string, v: string) => void; end: () => void }

export default async function handler(req: { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown }, res: Res) {
  res.setHeader("Cache-Control", "no-store")
  if (req.method === "OPTIONS") { res.status(204).end(); return }
  if (req.method !== "POST") { res.status(405).json({ error: "Méthode non autorisée." }); return }
  const raw = req.headers.authorization ?? req.headers.Authorization
  const auth = Array.isArray(raw) ? raw[0] : raw
  let body = req.body
  if (typeof body === "string") { try { body = JSON.parse(body) } catch { body = {} } }
  const { status, body: payload } = await handleBooking(auth, body)
  res.status(status).json(payload)
}
