import { nosleepMedia } from "./nosleepMedia"

type WakeSentinel = {
  released?: boolean
  release: () => Promise<void>
  addEventListener?: (type: string, fn: () => void) => void
}

const ACTIVE = "akno-voice-active"

export function setVoiceCallActive(on: boolean) {
  try {
    if (on) sessionStorage.setItem(ACTIVE, "1")
    else sessionStorage.removeItem(ACTIVE)
  } catch { /* private mode */ }
}

export function isVoiceCallActive() {
  try { return sessionStorage.getItem(ACTIVE) === "1" } catch { return false }
}

let video: HTMLVideoElement | null = null
let sentinel: WakeSentinel | null = null
let released = true
let usingVideo = false

function ensureVideo() {
  if (video) return video
  const el = document.createElement("video")
  el.setAttribute("title", "Akno")
  el.setAttribute("playsinline", "")
  el.setAttribute("webkit-playsinline", "")
  el.setAttribute("muted", "")
  el.muted = true
  el.playsInline = true
  el.setAttribute("aria-hidden", "true")
  Object.assign(el.style, {
    position: "fixed", width: "1px", height: "1px", opacity: "0",
    pointerEvents: "none", bottom: "0", left: "0",
  })
  const add = (type: "webm" | "mp4", src: string) => {
    const source = document.createElement("source")
    source.src = src
    source.type = `video/${type}`
    el.appendChild(source)
  }
  add("webm", nosleepMedia.webm)
  add("mp4", nosleepMedia.mp4)
  el.addEventListener("loadedmetadata", () => {
    if (el.duration <= 1) el.setAttribute("loop", "")
    else {
      el.addEventListener("timeupdate", () => {
        if (el.currentTime > 0.5) el.currentTime = Math.random()
      })
    }
  })
  document.body.appendChild(el)
  video = el
  return el
}

async function acquire() {
  if (released) return
  const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeSentinel> } }
  if (nav.wakeLock?.request) {
    try {
      try { await sentinel?.release() } catch { /* */ }
      const lock = await nav.wakeLock.request("screen")
      sentinel = lock
      usingVideo = false
      lock.addEventListener?.("release", () => {
        if (!released && document.visibilityState === "visible") void acquire()
      })
      return
    } catch {
      sentinel = null
    }
  }
  usingVideo = true
  const el = ensureVideo()
  try { await el.play() } catch { /* autoplay / gesture */ }
}

/** Call from the tap that starts the call so iOS still has a user gesture. */
export function primeCallWakeLock() {
  released = false
  setVoiceCallActive(true)
  void acquire()
}

export function startCallWakeLock() {
  released = false
  setVoiceCallActive(true)
  void acquire()
  const onVis = () => {
    if (document.visibilityState === "visible" && !released) void acquire()
  }
  document.addEventListener("visibilitychange", onVis)
  return {
    mode: () => (!released && sentinel && !sentinel.released ? "native" : usingVideo ? "video" : "none") as "native" | "video" | "none",
    reacquire: () => acquire(),
    release() {
      released = true
      document.removeEventListener("visibilitychange", onVis)
      try { void sentinel?.release() } catch { /* */ }
      sentinel = null
      if (video) { try { video.pause() } catch { /* */ } }
      setVoiceCallActive(false)
    },
  }
}
