import { supabase } from "./supabase"
import type { St } from "./store"

const SW_URL = "/sw.js"

export function isIos() {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent || ""
  const iPhone = /iPad|iPhone|iPod/.test(ua)
  const iPadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1
  return iPhone || iPadOs
}

export function isStandalone() {
  if (typeof window === "undefined") return false
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true
}

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
}

export function attentionCount(s: Pick<St, "calls" | "devis">) {
  const drafts = s.devis.filter(d => d.status === "aval" || (d.status === "brouillon" && d.ai)).length
  const callbacks = s.calls.filter(c => c.callback).length
  const replies = s.devis.filter(d => {
    if (d.reply && d.status !== "val" && d.status !== "ref") return true
    if ((d.status === "val" || d.status === "ref") && d.repliedAt) {
      try { return !sessionStorage.getItem("akno-seen-" + d.id) } catch { return true }
    }
    return false
  }).length
  return drafts + callbacks + replies
}

export function updateAppBadge(count: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
  try {
    if (count > 0) void nav.setAppBadge?.(count)
    else void nav.clearAppBadge?.()
  } catch { /* ignore */ }
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - base64.length % 4) % 4)
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function registerPushWorker() {
  if (!pushSupported()) return null
  return navigator.serviceWorker.register(SW_URL)
}

function publicKey() {
  return String(import.meta.env.VITE_VAPID_PUBLIC_KEY || "").trim()
}

async function persistSubscription(sub: PushSubscription) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const json = sub.toJSON()
  const p256dh = json.keys?.p256dh || ""
  const auth = json.keys?.auth || ""
  await supabase.from("push_subscriptions").upsert({
    artisan_id: user.id,
    user_id: user.id,
    endpoint: sub.endpoint,
    p256dh,
    auth,
    keys: { p256dh, auth },
    ua: navigator.userAgent,
  }, { onConflict: "endpoint" })
}

export async function enablePush(): Promise<{ ok: boolean; error?: string }> {
  if (isIos() && !isStandalone()) {
    return { ok: false, error: "Ajoute Akno à l’écran d’accueil depuis Safari" }
  }
  if (!pushSupported()) return { ok: false, error: "Notifications non prises en charge sur cet appareil." }
  const key = publicKey()
  if (!key) return { ok: false, error: "Notifications non configurées." }
  const perm = await Notification.requestPermission()
  if (perm !== "granted") return { ok: false, error: "Notifications bloquées par le navigateur." }
  await registerPushWorker()
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) })
  }
  await persistSubscription(sub)
  return { ok: true }
}

export async function disablePush() {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint)
    try { await sub.unsubscribe() } catch { /* ignore */ }
  }
}

export async function ensurePush() {
  if (!pushSupported() || Notification.permission !== "granted") return
  if (isIos() && !isStandalone()) return
  const key = publicKey()
  if (!key) return
  try {
    await registerPushWorker()
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) })
    await persistSubscription(sub)
  } catch { /* ignore */ }
}

export async function sendTestNotification(): Promise<{ ok: boolean; sent?: number; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return { ok: false, error: "Non authentifié." }
  try {
    const res = await fetch("/api/notify", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "test" }),
    })
    const payload = await res.json().catch(() => ({})) as { ok?: boolean; sent?: number; error?: string }
    if (!res.ok || payload.ok === false) {
      return { ok: false, sent: payload.sent, error: payload.error || `Échec du test (HTTP ${res.status}).` }
    }
    return { ok: true, sent: payload.sent }
  } catch {
    return { ok: false, error: "Impossible de joindre le serveur de notifications." }
  }
}
