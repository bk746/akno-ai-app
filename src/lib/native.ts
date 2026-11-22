/* update70 · Application native (Capacitor iOS / Android).
   - L'app native embarque le build local (dist) : les appels /api/* partent vers le serveur Vercel (API_ORIGIN).
   - Les liens publics (devis, dossier, formulaire) utilisent toujours l'adresse web, jamais capacitor://localhost.
   - Abonnement : aucun achat, prix ni lien de paiement dans l'app native (App Store 3.1.1 / Google Play Payments).
   - Simulation pour les tests : en développement uniquement, ?native=ios|android (mémorisé pour l'onglet). */
import { Capacitor } from "@capacitor/core"
import cfg from "../../app.config.json"

const env = (import.meta.env || {}) as Record<string, string | boolean | undefined>
export const APP_ID: string = cfg.appId
export const APP_SCHEME: string = cfg.urlScheme
/** Serveur web/API utilisé par l'app native (et pour les liens publics). */
export const API_ORIGIN: string = String(env.VITE_API_ORIGIN || cfg.apiOrigin).replace(/\/+$/, "")

function simulated(): "ios" | "android" | "" {
  if (!env.DEV || typeof window === "undefined") return ""
  try {
    const q = new URLSearchParams(location.search).get("native")
    if (q === "ios" || q === "android") sessionStorage.setItem("akno-sim-native", q)
    if (q === "0") sessionStorage.removeItem("akno-sim-native")
    const s = sessionStorage.getItem("akno-sim-native")
    return s === "ios" || s === "android" ? s : ""
  } catch { return "" }
}
const SIM = simulated()
/** Vrai dans l'app iOS / Android (ou en simulation de développement). */
export const isNative: boolean = Capacitor.isNativePlatform() || !!SIM
/** Vrai seulement dans une vraie app native (plugins disponibles). */
export const isRealNative: boolean = Capacitor.isNativePlatform()
export const nativePlatform: "ios" | "android" | "web" = SIM || (Capacitor.getPlatform() as "ios" | "android" | "web")
/** L'abonnement (offres, prix, paiement Stripe) n'est jamais affiché dans l'app native. */
export const billingHidden = isNative

/** Adresse publique de l'app web (liens envoyés aux clients, retours d'e-mail). */
export const webOrigin = () => isRealNative || typeof location === "undefined" ? API_ORIGIN : location.origin

/** Adresse de retour OAuth : schéma de l'app en natif, page web sinon. */
export const authRedirect = () => isRealNative ? `${APP_SCHEME}://auth/callback` : location.origin + "/"

let installed = false
/** À appeler au démarrage : redirige /api/* vers le serveur, gère les liens profonds et l'écran de démarrage. */
export function initNative() {
  if (installed || !isRealNative || typeof window === "undefined") return
  installed = true
  document.documentElement.classList.add("native", `native-${nativePlatform}`)
  const orig = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string" && input.startsWith("/api/")) return orig(API_ORIGIN + input, init)
    if (input instanceof URL && input.origin === location.origin && input.pathname.startsWith("/api/")) return orig(API_ORIGIN + input.pathname + input.search, init)
    return orig(input, init)
  }
  void (async () => {
    try {
      const { App } = await import("@capacitor/app")
      // Lien profond : com.akno.app://auth/callback?code=… (OAuth) ou https://<app>/accept/… (liens universels)
      await App.addListener("appUrlOpen", ({ url }) => { void handleDeepLink(url) })
      await App.addListener("backButton", ({ canGoBack }) => { if (canGoBack) history.back(); else if (dispatchEvent(new Event("akno:back", { cancelable: true }))) void App.minimizeApp() })
    } catch { /* plugin absent */ }
    try { const { StatusBar, Style } = await import("@capacitor/status-bar"); await StatusBar.setStyle({ style: Style.Dark }) } catch { /* ignore */ }
    try { const { SplashScreen } = await import("@capacitor/splash-screen"); setTimeout(() => void SplashScreen.hide(), 300) } catch { /* ignore */ }
  })()
}

export async function handleDeepLink(url: string) {
  let u: URL
  try { u = new URL(url) } catch { return }
  try { const { Browser } = await import("@capacitor/browser"); await Browser.close() } catch { /* déjà fermé */ }
  const isAuth = u.protocol === `${APP_SCHEME}:` && (u.host === "auth" || u.pathname.includes("auth"))
  if (isAuth) {
    const code = u.searchParams.get("code")
    const err = u.searchParams.get("error_description") || u.searchParams.get("error")
    if (code) {
      const { supabase } = await import("./supabase")
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) location.replace("/reception?oauth_error=" + encodeURIComponent(error.message))
      else location.replace("/reception")
    } else if (err) location.replace("/reception?oauth_error=" + encodeURIComponent(err))
    return
  }
  // Lien universel vers une page de l'app web : on l'ouvre dans l'app (même chemin)
  if (u.origin === API_ORIGIN && u.pathname !== "/") location.assign(u.pathname + u.search)
}

/** Ouvre la page OAuth dans le navigateur système (natif). Le retour arrive par handleDeepLink. */
export async function openOAuth(url: string) {
  const { Browser } = await import("@capacitor/browser")
  await Browser.open({ url, presentationStyle: "popover" })
}
