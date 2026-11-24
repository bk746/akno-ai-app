import { Capacitor } from "@capacitor/core"
import { supabase } from "./supabase"
import { isRealNative, nativePlatform } from "./native"
import type { St } from "./store"

const SW_URL = "/sw.js"
const APNS_STORE = "akno-apns-token"

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

export function nativeIosPush() {
  return isRealNative && nativePlatform === "ios"
}

export function pushSupported() {
  if (nativeIosPush()) return true
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
}

/** Bandeau d'activation : navigateur prêt mais pas d'abonnement push actif. */
export function pushNeedsActivation(settingsOn: boolean) {
  if (nativeIosPush()) return !settingsOn
  if (!pushSupported()) return false
  if (isIos() && !isStandalone()) return true
  if (typeof Notification === "undefined") return true
  if (Notification.permission !== "granted") return true
  return !settingsOn
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
  if (!pushSupported() || nativeIosPush()) return null
  return navigator.serviceWorker.register(SW_URL)
}

function publicKey() {
  return String(import.meta.env.VITE_VAPID_PUBLIC_KEY || "").trim()
}

type RegWait = { resolve: (t: string) => void; reject: (e: string) => void }
let nativeListeners = false
let regWait: RegWait | null = null

export async function initNativePushListeners() {
  if (!nativeIosPush() || nativeListeners) return
  nativeListeners = true
  const { PushNotifications } = await import("@capacitor/push-notifications")
  await PushNotifications.addListener("registration", token => {
    const v = token.value
    try { localStorage.setItem(APNS_STORE, v) } catch { /* ignore */ }
    regWait?.resolve(v)
    regWait = null
  })
  await PushNotifications.addListener("registrationError", err => {
    regWait?.reject(err.error || "Inscription APNs refusée.")
    regWait = null
  })
  await PushNotifications.addListener("pushNotificationActionPerformed", action => {
    const url = (action.notification.data?.url as string | undefined) || action.notification.data?.aps?.url
    if (url && typeof url === "string") location.assign(url)
  })
}

function waitNativeToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (regWait) {
        regWait = null
        reject(new Error("Délai dépassé pour l'inscription aux notifications."))
      }
    }, 20000)
    regWait = {
      resolve: t => { clearTimeout(timer); resolve(t) },
      reject: e => { clearTimeout(timer); reject(new Error(e)) },
    }
  })
}

async function persistIosToken(deviceToken: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) return "Connectez-vous pour activer les notifications."
  const token = deviceToken.replace(/[^a-fA-F0-9]/g, "")
  if (token.length < 32) return "Jeton de notification incomplet. Réessayez."
  try {
    const res = await fetch("/api/notify", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "subscribe", platform: "ios", device_token: token, ua: navigator.userAgent }),
    })
    const out = await res.json().catch(() => ({})) as { ok?: boolean; error?: string }
    if (res.ok && out.ok) return ""
    return out.error || `Inscription refusée (HTTP ${res.status}).`
  } catch { return "Impossible de joindre le serveur de notifications." }
}

/** Enregistre l'abonnement push de cet appareil pour le compte connecté. Renvoie "" si c'est fait, sinon l'erreur à afficher.
    Passe par le serveur : si l'appareil était déjà inscrit sous un autre compte (même endpoint), l'écriture directe
    était refusée par la RLS sans rien dire, et le compte courant n'avait aucun appareil (aucune notification). */
async function persistSubscription(sub: PushSubscription): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) return "Connectez-vous pour activer les notifications."
  const json = sub.toJSON()
  const p256dh = json.keys?.p256dh || ""
  const auth = json.keys?.auth || ""
  if (!sub.endpoint || !p256dh || !auth) return "Abonnement incomplet. Désactivez puis réactivez les notifications."
  let serverError = ""
  try {
    const res = await fetch("/api/notify", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "subscribe", endpoint: sub.endpoint, p256dh, auth, ua: navigator.userAgent, platform: "web" }),
    })
    const out = await res.json().catch(() => ({})) as { ok?: boolean; error?: string }
    if (res.ok && out.ok) return ""
    serverError = out.error || `Inscription refusée (HTTP ${res.status}).`
  } catch { serverError = "Impossible de joindre le serveur de notifications." }
  const { error } = await supabase.from("push_subscriptions").upsert({
    artisan_id: user.id,
    user_id: user.id,
    platform: "web",
    endpoint: sub.endpoint,
    p256dh,
    auth,
    keys: { p256dh, auth },
    ua: navigator.userAgent,
  }, { onConflict: "endpoint" })
  return error ? serverError : ""
}

/** Abonnement push du navigateur (créé si besoin) puis inscription de l'appareil pour le compte connecté. */
async function subscribeDevice(key: string): Promise<string> {
  await registerPushWorker()
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) })
  return persistSubscription(sub)
}

async function enableNativeIosPush(): Promise<{ ok: boolean; error?: string }> {
  await initNativePushListeners()
  const { PushNotifications } = await import("@capacitor/push-notifications")
  let perm = await PushNotifications.checkPermissions()
  if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") perm = await PushNotifications.requestPermissions()
  if (perm.receive !== "granted") {
    return { ok: false, error: perm.receive === "denied" ? "Notifications bloquées pour Akno. Autorisez-les dans Réglages › Notifications › Akno, puis réessayez." : "Notifications non autorisées." }
  }
  try {
    const pending = waitNativeToken()
    await PushNotifications.register()
    const deviceToken = await pending
    const error = await persistIosToken(deviceToken)
    return error ? { ok: false, error } : { ok: true }
  } catch (e) {
    return { ok: false, error: String(e instanceof Error ? e.message : e) || "L'inscription aux notifications a échoué." }
  }
}

export async function nativePushPermission(): Promise<boolean> {
  if (!nativeIosPush()) return false
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications")
    const perm = await PushNotifications.checkPermissions()
    return perm.receive === "granted"
  } catch { return false }
}

export async function enablePush(): Promise<{ ok: boolean; error?: string }> {
  if (nativeIosPush()) return enableNativeIosPush()
  if (Capacitor.isNativePlatform()) return { ok: false, error: "Les notifications push natives ne sont pas encore disponibles sur cet appareil." }
  if (isIos() && !isStandalone()) {
    return { ok: false, error: "Ajoute Akno à l'écran d'accueil depuis Safari" }
  }
  if (!pushSupported()) return { ok: false, error: "Notifications non prises en charge sur cet appareil." }
  const key = publicKey()
  if (!key) return { ok: false, error: "Notifications non configurées." }
  const perm = await Notification.requestPermission()
  if (perm !== "granted") return { ok: false, error: perm === "denied" ? "Notifications bloquées pour Akno. Autorisez-les dans les réglages du téléphone (Réglages › Notifications › Akno), puis réessayez." : "Notifications non autorisées." }
  try {
    const error = await subscribeDevice(key)
    return error ? { ok: false, error } : { ok: true }
  } catch {
    return { ok: false, error: "L'abonnement aux notifications a échoué sur cet appareil. Réessaie." }
  }
}

export async function disablePush() {
  if (nativeIosPush()) {
    let token = ""
    try { token = localStorage.getItem(APNS_STORE) || "" } catch { /* ignore */ }
    if (token) await supabase.from("push_subscriptions").delete().eq("device_token", token.replace(/[^a-fA-F0-9]/g, ""))
    try { localStorage.removeItem(APNS_STORE) } catch { /* ignore */ }
    return
  }
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint)
    try { await sub.unsubscribe() } catch { /* ignore */ }
  }
}

/** Au lancement et avant un test : réinscrit cet appareil pour le compte connecté (changement de compte, abonnement renouvelé). */
export async function ensurePush(): Promise<string> {
  if (nativeIosPush()) {
    const ok = await nativePushPermission()
    if (!ok) return ""
    await initNativePushListeners()
    let stored = ""
    try { stored = localStorage.getItem(APNS_STORE) || "" } catch { /* ignore */ }
    if (stored) return persistIosToken(stored)
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications")
      const pending = waitNativeToken()
      await PushNotifications.register()
      const deviceToken = await pending
      return persistIosToken(deviceToken)
    } catch { return "L'inscription aux notifications a échoué sur cet appareil." }
  }
  if (!pushSupported() || Notification.permission !== "granted") return ""
  if (isIos() && !isStandalone()) return ""
  const key = publicKey()
  if (!key) return ""
  try { return await subscribeDevice(key) } catch { return "L'abonnement aux notifications a échoué sur cet appareil." }
}

export async function sendTestNotification(): Promise<{ ok: boolean; sent?: number; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return { ok: false, error: "Non authentifié." }
  const subError = await ensurePush()
  if (subError) return { ok: false, error: subError }
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