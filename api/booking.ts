import { nativeCors } from "./_lib/http.js"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { adminClient } from "./_lib/mail.js"
import { sendAptSms, confirmSmsText, companyOf as companyOfSms, artisanSmsOn } from "./_lib/agendaSms.js"
import { bridgeArtisan } from "./_lib/twilioVoice.js"

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
  kind?: string
  source?: string
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
  const today = todayParis()
  const tomorrow = addDaysYmd(today, 1)
  let from = input.date_from || pref.from || tomorrow
  let to = input.date_to || pref.to || addDaysYmd(from, 4)
  if (from < today) from = today
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
  const db = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${access}` } },
  })
  return { user, db }
}

/* update44 : un agenda par artisan.
   1) clé Cal.com propre à l'artisan (table artisan_secrets, jamais lisible par le navigateur) ;
   2) sinon clé globale CALCOM_API_KEY, réservée au compte CALCOM_OWNER_ARTISAN_ID s'il est défini ;
   3) sinon agenda interne Akno : créneaux libres calculés depuis ses propres rendez-vous. */
type CalCfg = { key: string; eventTypeId?: number }

async function resolveCalConfig(userId: string): Promise<CalCfg | null> {
  try {
    const admin = adminClient()
    const { data } = await admin.from("artisan_secrets").select("calcom_api_key, calcom_event_type_id").eq("artisan_id", userId).maybeSingle()
    const key = String((data as { calcom_api_key?: string } | null)?.calcom_api_key || "").trim()
    if (key) {
      const ev = Number((data as { calcom_event_type_id?: number } | null)?.calcom_event_type_id)
      return { key, eventTypeId: Number.isFinite(ev) && ev > 0 ? ev : undefined }
    }
  } catch { /* pas de service role : on passe à la clé globale */ }
  const global = (env("CALCOM_API_KEY") || "").trim()
  const owner = (env("CALCOM_OWNER_ARTISAN_ID") || "").trim()
  if (global && (!owner || owner === userId)) {
    const ev = Number(env("CALCOM_EVENT_TYPE_ID"))
    return { key: global, eventTypeId: Number.isFinite(ev) && ev > 0 ? ev : undefined }
  }
  return null
}

function calHeaders(cfg: CalCfg, version: string) {
  return {
    Authorization: `Bearer ${cfg.key}`,
    "Content-Type": "application/json",
    "cal-api-version": version,
  }
}

async function calFetch(cfg: CalCfg, path: string, version: string, init?: RequestInit) {
  const r = await fetch(`https://api.cal.com${path}`, { ...init, headers: { ...calHeaders(cfg, version), ...(init?.headers || {}) } })
  const payload = await r.json().catch(() => ({})) as Json
  return { r, payload }
}

/** Vérifie une clé Cal.com (utilisé par Réglages → Agenda). */
export async function checkCalcomKey(key: string) {
  const me = await calFetch({ key }, "/v2/me", "2024-06-14")
  return me.r.ok
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

const eventTypeCache = new Map<string, { id: number; lengthInMinutes?: number }>()
const SLOTS_CACHE_MS = 30_000
const slotsCache = new Map<string, { at: number; value: { ok: boolean; timezone: string; slots: BookingSlot[]; error?: string } }>()

async function resolveEventType(cfg: CalCfg): Promise<{ id: number; lengthInMinutes?: number }> {
  const cacheId = `${cfg.key.slice(-10)}|${cfg.eventTypeId || ""}`
  const hit = eventTypeCache.get(cacheId)
  if (hit) return hit
  const n = cfg.eventTypeId || NaN
  if (Number.isFinite(n) && n > 0) {
    const v: { id: number; lengthInMinutes?: number } = { id: n }
    eventTypeCache.set(cacheId, v)
    return v
  }
  let { r, payload } = await calFetch(cfg, "/v2/event-types", "2026-06-12")
  let list = collectEventTypes(payload.data)
  if (!list.length) {
    const me = await calFetch(cfg, "/v2/me", "2024-06-14")
    const username = (me.payload.data as { username?: string } | undefined)?.username
    if (username) {
      ({ r, payload } = await calFetch(cfg, `/v2/event-types?username=${encodeURIComponent(username)}`, "2026-06-12"))
      list = collectEventTypes(payload.data)
    }
  }
  if (!r.ok && !list.length) throw new Error("Impossible de lire les types d'événement Cal.com.")
  const first = list.find(x => !x.hidden && x.id) || list.find(x => x.id)
  if (!first?.id) throw new Error("Aucun type d'événement Cal.com n'a été trouvé. Ajoute CALCOM_EVENT_TYPE_ID.")
  const v = { id: first.id, lengthInMinutes: first.lengthInMinutes || first.length }
  eventTypeCache.set(cacheId, v)
  return v
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

async function providerGetSlots(cfg: CalCfg, input: SlotsInput, opts?: { fresh?: boolean }): Promise<{ ok: boolean; timezone: string; slots: BookingSlot[]; error?: string }> {
  const eventType = await resolveEventType(cfg)
  const eventTypeId = eventType.id
  const range = resolveRange(input)
  const duration = Math.max(15, Number(input.duree_minutes) || eventType.lengthInMinutes || 60)
  const cacheKey = `${cfg.key.slice(-10)}|${eventTypeId}|${range.from}|${range.to}|${range.weekday ?? ""}|${duration}`
  if (!opts?.fresh) {
    const hit = slotsCache.get(cacheKey)
    if (hit && Date.now() - hit.at < SLOTS_CACHE_MS) return hit.value
  }
  const q = new URLSearchParams({
    eventTypeId: String(eventTypeId),
    start: range.from,
    end: range.to,
    timeZone: TZ,
    format: "range",
  })
  if (input.duree_minutes || eventType.lengthInMinutes) q.set("duration", String(duration))
  const { r, payload } = await calFetch(cfg, `/v2/slots?${q}`, "2024-09-04")
  if (!r.ok) {
    const msg = String((payload as { error?: { message?: string }; message?: string }).error?.message || payload.message || "Impossible de lire les créneaux Cal.com.")
    const value = { ok: false, timezone: TZ, slots: [] as BookingSlot[], error: msg }
    slotsCache.set(cacheKey, { at: Date.now(), value })
    return value
  }
  let slots = flattenSlots(payload.data)
  if (range.weekday != null) slots = slots.filter(s => parisParts(new Date(s.start)).weekday && new Date(s.start).toLocaleString("en-US", { timeZone: TZ, weekday: "short" }) === ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][range.weekday!])
  const value = { ok: true, timezone: TZ, slots: slots.slice(0, 16) }
  slotsCache.set(cacheKey, { at: Date.now(), value })
  return value
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

async function providerBook(cfg: CalCfg, input: BookInput) {
  const parsed = parseBookStart(input)
  if ("error" in parsed) {
    const alts = await providerGetSlots(cfg, { date_from: input.date, date_to: input.date || addDaysYmd(input.date || todayParis(), 7), duree_minutes: input.duree_minutes }).catch(() => ({ slots: [] as BookingSlot[] }))
    return { ok: false, reason: "invalid", error: parsed.error, alternatives: alts.slots.slice(0, 4) }
  }
  const eventType = await resolveEventType(cfg)
  const duration = Math.max(15, Number(input.duree_minutes) || eventType.lengthInMinutes || 60)
  const daySlots = await providerGetSlots(cfg, { date_from: input.date, date_to: input.date, duree_minutes: duration }, { fresh: true })
  // update60 : Cal.com injoignable ≠ créneau pris (sinon la réceptionniste annonçait à tort « créneau déjà pris »)
  if (!daySlots.ok) return { ok: false, reason: "error", error: daySlots.error || "Impossible de lire l'agenda Cal.com.", alternatives: [] }
  const match = daySlots.slots.find(s => Math.abs(new Date(s.start).getTime() - parsed.start.getTime()) < 60_000)
  if (!match) {
    const wider = daySlots.slots.length ? daySlots : await providerGetSlots(cfg, { date_from: input.date || todayParis(), date_to: addDaysYmd(input.date || todayParis(), 7), duree_minutes: duration })
    return { ok: false, reason: "taken", error: "Ce créneau n'est plus disponible.", alternatives: wider.slots.slice(0, 4) }
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
    return { ok: false, reason: "invalid", error: hint, alternatives: [] }
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

  const attempt = async (payload: Json) => calFetch(cfg, "/v2/bookings", "2026-02-25", { method: "POST", body: JSON.stringify(payload) })
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
    // Cal.com refuse : créneau réellement indisponible (message explicite) ou erreur technique.
    const taken = r.status === 409 || /not available|no available|already ha(s|ve) (a )?booking|unavailable|booked|disponible/i.test(msg)
    const alts = taken ? await providerGetSlots(cfg, { date_from: input.date || todayParis(), date_to: addDaysYmd(input.date || todayParis(), 7), duree_minutes: duration }).catch(() => ({ slots: [] as BookingSlot[] })) : { slots: [] as BookingSlot[] }
    return { ok: false, reason: taken ? "taken" : "error", error: msg, alternatives: alts.slots.slice(0, 4) }
  }
  const data = (payload.data && !Array.isArray(payload.data) ? payload.data : Array.isArray(payload.data) ? payload.data[0] : payload.data) as {
    start?: string; end?: string; uid?: string; duration?: number; title?: string
  } | undefined
  const start = data?.start || match.start
  const end = data?.end || match.end || new Date(new Date(start).getTime() + duration * 60_000).toISOString()
  slotsCache.clear()
  return {
    ok: true,
    confirmation: `Rendez-vous confirmé ${formatParisLabel(start)} pour ${attendee.name}.`,
    start,
    end,
    cal_uid: data?.uid,
    label: formatParisLabel(start),
  }
}

/* ---------- Agenda interne (sans Cal.com) ---------- */
const OPEN_H = 8, CLOSE_H = 18

async function busyRanges(db: SupabaseClient, userId: string, fromIso: string, toIso: string) {
  const { data } = await db.from("appointments").select("start, end").eq("artisan_id", userId).lt("start", toIso).gt("end", fromIso).limit(500)
  return (data || []).map(r => ({ a: new Date(String((r as { start: string }).start)).getTime(), b: new Date(String((r as { end?: string }).end || (r as { start: string }).start)).getTime() }))
}

async function internalSlots(db: SupabaseClient, userId: string, input: SlotsInput) {
  const range = resolveRange(input)
  const duration = Math.max(30, Number(input.duree_minutes) || 60)
  const startUtc = parisDay(range.from, 0, 0), endUtc = parisDay(addDaysYmd(range.to, 1), 0, 0)
  const busy = await busyRanges(db, userId, startUtc.toISOString(), endUtc.toISOString())
  const minStart = Date.now() + 2 * 3600e3
  const out: BookingSlot[] = []
  for (let day = range.from; day <= range.to && out.length < 16; day = addDaysYmd(day, 1)) {
    for (let h = OPEN_H; h * 60 + duration <= CLOSE_H * 60; h++) {
      const a = parisDay(day, h, 0)
      const dow = a.toLocaleString("en-US", { timeZone: TZ, weekday: "short" })
      if (!["Mon", "Tue", "Wed", "Thu", "Fri"].includes(dow)) break
      if (range.weekday != null && ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][range.weekday] !== dow) break
      const b = new Date(a.getTime() + duration * 60_000)
      if (a.getTime() < minStart) continue
      if (busy.some(x => x.a < b.getTime() && x.b > a.getTime())) continue
      out.push(slotView(a.toISOString(), b.toISOString()))
      if (out.length >= 16) break
    }
  }
  return { ok: true, timezone: TZ, slots: out, provider: "akno" }
}

function parisDay(ymd: string, h: number, m: number) {
  return zonedTimeToUtc(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)), Number(ymd.slice(8, 10)), h, m)
}

async function internalBook(db: SupabaseClient, userId: string, input: BookInput) {
  const parsed = parseBookStart(input)
  const duration = Math.max(30, Number(input.duree_minutes) || 60)
  if ("error" in parsed) {
    const alts = await internalSlots(db, userId, { date_from: input.date, date_to: addDaysYmd(input.date || todayParis(), 7), duree_minutes: duration })
    return { ok: false, reason: "invalid", error: parsed.error, alternatives: alts.slots.slice(0, 4) }
  }
  const start = parsed.start, end = new Date(start.getTime() + duration * 60_000)
  if (start.getTime() < Date.now()) return { ok: false, reason: "invalid", error: "Ce créneau est déjà passé.", alternatives: [] }
  const busy = await busyRanges(db, userId, start.toISOString(), end.toISOString())
  if (busy.some(x => x.a < end.getTime() && x.b > start.getTime())) {
    const alts = await internalSlots(db, userId, { date_from: input.date, date_to: addDaysYmd(input.date || todayParis(), 7), duree_minutes: duration })
    return { ok: false, reason: "taken", error: "Ce créneau n'est plus disponible.", alternatives: alts.slots.slice(0, 4) }
  }
  const name = (input.client || "Client").trim()
  const saved = await persistAppointment(db, userId, input, start, end, (input as BookInput & { source?: string }).source || "akno")
  return {
    ok: true,
    confirmation: `Rendez-vous confirmé ${formatParisLabel(start.toISOString())} pour ${name}.`,
    start: start.toISOString(),
    end: end.toISOString(),
    label: formatParisLabel(start.toISOString()),
    provider: "akno",
    appointment_id: saved.id,
  }
}


async function persistAppointment(db: SupabaseClient, artisanId: string, input: BookInput & { kind?: string }, start: Date, end: Date, source: string) {
  const name = (input.client || "Client").trim()
  const row: Record<string, unknown> = {
    artisan_id: artisanId,
    title: (input.objet || "Rendez-vous").trim() || "Rendez-vous",
    client: name,
    start: start.toISOString(),
    end: end.toISOString(),
    telephone_client: input.telephone || null,
    email_client: input.email || null,
    adresse: input.adresse || null,
    ville: input.ville || null,
    notes: input.notes || null,
    kind: input.kind || "rdv",
    status: "prevu",
    booking_source: source,
  }
  let { data, error } = await db.from("appointments").insert(row).select("id").maybeSingle()
  if (error && /column|kind|booking_source|status/i.test(error.message || "")) {
    const core = { artisan_id: artisanId, title: row.title, client: name, start: row.start, end: row.end, telephone_client: row.telephone_client, email_client: row.email_client, adresse: row.adresse, ville: row.ville, notes: row.notes }
    ;({ data, error } = await db.from("appointments").insert(core).select("id").maybeSingle())
  }
  if (error || !data) return { id: null as string | null, error: error?.message }
  // confirmation SMS (no-op propre sans clés)
  try {
    const { artisan } = await artisanSmsOn(db, artisanId)
    const company = companyOfSms(artisan)
    const tel = artisan?.entreprise_telephone || artisan?.telephone || ""
    if (input.telephone) {
      const sms = await sendAptSms(db, artisanId, input.telephone, confirmSmsText(company, start.toISOString(), { adresse: input.adresse, ville: input.ville }, tel), "confirm_rdv")
      if (sms.ok && data.id) await db.from("appointments").update({ sms_confirm_at: new Date().toISOString() }).eq("id", data.id)
    }
  } catch { /* SMS facultatif */ }
  return { id: data.id as string, error: undefined }
}

async function publicArtisan(token: string) {
  const raw = (token || "").trim()
  if (!raw || raw.length < 8) return { error: { status: 400, body: { error: "Lien de réservation invalide." } } }
  const admin = adminClient()
  const { data, error } = await admin.from("artisans").select("id, entreprise_nom, nom_entreprise, booking_on, booking_token, agenda_sms").eq("booking_token", raw).maybeSingle()
  if (error && /booking_token|column/i.test(error.message || "")) return { error: { status: 409, body: { error: "Le lien de réservation n'est pas encore actif (migration update78)." } } }
  if (!data) return { error: { status: 404, body: { error: "Lien de réservation introuvable." } } }
  if (data.booking_on === false) return { error: { status: 403, body: { error: "Les réservations en ligne sont désactivées pour le moment." } } }
  const company = String(data.entreprise_nom || data.nom_entreprise || "l'artisan").trim()
  return { admin, artisanId: String(data.id), company }
}

async function handlePublicBooking(input: BookInput & SlotsInput & { action?: string; token?: string }) {
  const found = await publicArtisan(String(input.token || ""))
  if ("error" in found && found.error) return found.error
  const { admin, artisanId, company } = found as { admin: SupabaseClient; artisanId: string; company: string }
  if (input.action === "public_slots") {
    const slots = await internalSlots(admin, artisanId, input)
    return { status: 200, body: { ...slots, company } }
  }
  const result = await internalBook(admin, artisanId, { ...input, source: "public" } as BookInput)
  if (!result.ok) return { status: 409, body: result }
  return { status: 200, body: { ...result, company } }
}

export async function handleBooking(authorization: string | undefined, body: unknown, bridgeId?: string | null): Promise<{ status: number; body: Json }> {
  const input = (body && typeof body === "object" ? body : {}) as Json & SlotsInput & BookInput & { action?: string; token?: string }
  // update78 · lien public /reserver/:token — pas de session
  if (input.action === "public_slots" || input.action === "public_book") {
    try { return await handlePublicBooking({ ...input, action: input.action === "public_book" ? "public_book" : "public_slots" }) } catch {
      return { status: 503, body: { error: "Réservation indisponible pour le moment." } }
    }
  }
  // update56 : le relais téléphonique (voice-bridge) agit pour l'artisan appelé, authentifié par BRIDGE_SECRET.
  const auth = bridgeId ? { user: { id: bridgeId }, db: adminClient() } : await verifyUser(authorization)
  if ("error" in auth && auth.error) return auth.error
  const { user, db } = auth as { user: { id: string }; db: SupabaseClient }

  try {
    const cfg = await resolveCalConfig(user.id)
    if (!cfg) {
      if (input.action === "slots") return { status: 200, body: await internalSlots(db, user.id, input) }
      if (input.action === "book") {
        const result = await internalBook(db, user.id, { ...input, source: "reception" } as BookInput)
        return { status: result.ok ? 200 : 409, body: result }
      }
      return { status: 400, body: { error: "Action inconnue." } }
    }
    // update60 : 409 seulement si le créneau est vraiment pris ou invalide ; une panne Cal.com renvoie 502.
    if (input.action === "slots") {
      const result = await providerGetSlots(cfg, input)
      return { status: result.ok ? 200 : 502, body: result }
    }
    if (input.action === "book") {
      const result = await providerBook(cfg, input)
      if (result.ok && "start" in result && result.start) {
        try {
          await persistAppointment(db, user.id, { ...input, source: "calcom" } as BookInput, new Date(String(result.start)), new Date(String(result.end || result.start)), "calcom")
        } catch { /* l'agenda Cal.com reste la source, le miroir Akno est facultatif */ }
      }
      return { status: result.ok ? 200 : "reason" in result && result.reason === "error" ? 502 : 409, body: result }
    }
    return { status: 400, body: { error: "Action inconnue." } }
  } catch (e) {
    return { status: 502, body: { ok: false, reason: "error", error: e instanceof Error ? e.message : "Erreur agenda." } }
  }
}

type Res = { status: (n: number) => Res; json: (b: unknown) => void; setHeader: (k: string, v: string) => void; end: () => void }

export default async function handler(req: { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown }, res: Res) {
  res.setHeader("Cache-Control", "no-store")
  nativeCors(req.headers, res) // update70 · app native (Capacitor)
  if (req.method === "OPTIONS") { res.status(204).end(); return }
  if (req.method !== "POST") { res.status(405).json({ error: "Méthode non autorisée." }); return }
  const raw = req.headers.authorization ?? req.headers.Authorization
  const auth = Array.isArray(raw) ? raw[0] : raw
  let body = req.body
  if (typeof body === "string") { try { body = JSON.parse(body) } catch { body = {} } }
  const { status, body: payload } = await handleBooking(auth, body, bridgeArtisan(req.headers))
  res.status(status).json(payload)
}
