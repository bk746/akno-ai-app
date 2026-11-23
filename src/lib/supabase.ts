import { createClient } from "@supabase/supabase-js"
// import.meta.env est absent hors Vite (ex. npm run test:assistant sous Node) : on retombe sur {}
const env = (import.meta.env || {}) as Record<string, string | undefined>
const url = env.VITE_SUPABASE_URL as string, key = env.VITE_SUPABASE_ANON_KEY as string
if (!url || !key) console.error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquants")
// update70 · app native (Capacitor) : flux PKCE (le retour OAuth arrive par le lien profond com.akno.app://auth/callback?code=…)
const native = typeof window !== "undefined" && !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
export const supabase = createClient(url || "http://localhost", key || "missing", { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: !native, ...(native ? { flowType: "pkce" as const } : {}) } })

import type { User } from "@supabase/supabase-js"

/** Une seule requête /auth/v1/user partagée (évite les getUser en double au démarrage). */
let _userP: Promise<User | null> | null = null
let _user: { at: number; user: User | null } | null = null
export function getAuthUser(force = false): Promise<User | null> {
  if (!force && _user && Date.now() - _user.at < 4000) return Promise.resolve(_user.user)
  if (!force && _userP) return _userP
  _userP = supabase.auth.getUser().then(r => {
    _user = { at: Date.now(), user: r.data.user }; _userP = null; return r.data.user
  }, e => { _userP = null; throw e })
  return _userP
}
if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange(() => { _user = null; _userP = null })
}
