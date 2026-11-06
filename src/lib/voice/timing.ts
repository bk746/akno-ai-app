export type VoiceTiming = {
  at: number
  rel: number
  kind: "ttfa" | "tool" | "idle" | "vis" | "ws" | "note"
  label: string
  ms?: number
  extra?: string
}

const FLAG = "akno-voice-debug"
const FLAG_EVT = "akno-voice-debug"

export function isVoiceDebugEnabled() {
  try { return localStorage.getItem(FLAG) === "1" } catch { return false }
}

export function setVoiceDebugEnabled(on: boolean) {
  try { localStorage.setItem(FLAG, on ? "1" : "0") } catch { /* */ }
  try { dispatchEvent(new Event(FLAG_EVT)) } catch { /* */ }
}

export function subscribeVoiceDebugFlag(cb: () => void) {
  addEventListener(FLAG_EVT, cb)
  addEventListener("storage", cb)
  return () => {
    removeEventListener(FLAG_EVT, cb)
    removeEventListener("storage", cb)
  }
}

let sessionStart = 0
const buf: VoiceTiming[] = []
const listeners = new Set<() => void>()

function notify() { listeners.forEach(fn => { try { fn() } catch { /* */ } }) }

export function beginVoiceTimingSession() {
  sessionStart = Date.now()
  buf.length = 0
  notify()
}

export function logVoiceTiming(kind: VoiceTiming["kind"], label: string, extra?: { ms?: number; extra?: string }) {
  buf.push({
    at: Date.now(),
    rel: sessionStart ? Date.now() - sessionStart : 0,
    kind,
    label,
    ms: extra?.ms,
    extra: extra?.extra,
  })
  if (buf.length > 48) buf.shift()
  notify()
}

export function getVoiceTimings() { return buf.slice() }

export function formatVoiceTimings(rows = getVoiceTimings()) {
  if (!rows.length) return ""
  return rows.map(r => {
    const sec = Math.floor(r.rel / 1000)
    const ms = String(r.rel % 1000).padStart(3, "0")
    const dur = r.ms != null ? `${r.ms}ms` : ""
    return `${String(sec).padStart(3, " ")}.${ms}  ${r.kind.padEnd(4)}  ${r.label}${dur ? `  ${dur}` : ""}${r.extra ? `  ${r.extra}` : ""}`
  }).join("\n")
}

export function subscribeVoiceTimings(cb: () => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
