/* update59 · Détection d'une nouvelle version déployée (Vercel) et mise à jour en un geste.
   - L'identifiant de build est figé dans le bundle (__AKNO_BUILD__) et publié dans /version.json.
   - On relit /version.json (sans cache) au retour au premier plan, au focus, au réveil et toutes les 60 s.
   - Un échec de chargement de morceau (chunk) après un déploiement recharge une fois, sinon affiche le bouton. */
import { useSyncExternalStore } from "react"
import { isVoiceCallActive } from "./voice/wakeLock"

declare const __AKNO_BUILD__: string
export const BUILD_ID: string = typeof __AKNO_BUILD__ === "string" ? __AKNO_BUILD__ : "dev"

let available = false
const subs = new Set<() => void>()
const emit = () => subs.forEach(f => f())
function markAvailable() { if (available) return; available = true; emit(); void swUpdate() }

export const useUpdateAvailable = () => useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f) } }, () => available, () => false)

async function swUpdate() {
  // Le service worker (notifications push) n'a pas de cache : on lui demande juste de se mettre à jour.
  try { const reg = await navigator.serviceWorker?.getRegistration(); await reg?.update() } catch { /* ignore */ }
}

let checking = false
export async function checkForUpdate() {
  if (checking || available || BUILD_ID === "dev" || document.visibilityState === "hidden") return available
  checking = true
  try {
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store", headers: { accept: "application/json" } })
    if (r.ok) { const j = await r.json() as { build?: unknown }; if (typeof j.build === "string" && j.build && j.build !== BUILD_ID) markAvailable() }
  } catch { /* hors ligne : on réessaiera */ } finally { checking = false }
  return available
}

const withTimeout = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<undefined>(r => setTimeout(() => r(undefined), ms))])

/** Applique la mise à jour : service worker éventuel, puis rechargement sur un index.html frais. */
export async function applyUpdate() {
  try {
    const reg = await withTimeout(navigator.serviceWorker?.getRegistration() ?? Promise.resolve(undefined), 1500)
    if (reg) {
      await withTimeout(reg.update(), 2500)
      // Le SW Akno fait déjà skipWaiting à l'installation ; par sécurité on débloque un worker en attente.
      reg.waiting?.postMessage({ type: "SKIP_WAITING" })
    }
  } catch { /* ignore */ }
  try { await withTimeout(fetch("/", { cache: "reload" }), 3000) } catch { /* ignore */ }
  location.reload()
}

const RELOAD_KEY = "akno-chunk-reload"
const CHUNK_RE = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError|Unable to preload CSS/i
export const isChunkError = (e: unknown) => CHUNK_RE.test(String((e as { message?: string })?.message || e || ""))

/** Morceau introuvable (ancienne version encore ouverte) : recharge une seule fois (pas pendant un appel), sinon bouton. */
export function recoverChunkError() {
  let last = 0
  try { last = Number(sessionStorage.getItem(RELOAD_KEY) || 0) } catch { /* ignore */ }
  if (!isVoiceCallActive() && Date.now() - last > 60_000) {
    try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())) } catch { /* ignore */ }
    location.reload()
    return true
  }
  markAvailable()
  return false
}

let started = false
export function initAppUpdate() {
  if (started || typeof window === "undefined") return
  started = true
  // On ne masque l'erreur que si on recharge ; sinon elle remonte jusqu'à l'écran « nouvelle version ».
  window.addEventListener("vite:preloadError", e => { if (recoverChunkError()) e.preventDefault() })
  window.addEventListener("unhandledrejection", e => { if (isChunkError(e.reason)) recoverChunkError() })
  if (BUILD_ID === "dev") return
  const check = () => { void checkForUpdate() }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check() })
  window.addEventListener("focus", check)
  window.addEventListener("pageshow", check)
  window.addEventListener("online", check)
  setInterval(check, 60_000)
  setTimeout(check, 5_000)
}
