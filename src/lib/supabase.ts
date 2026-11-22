import { createClient } from "@supabase/supabase-js"
// import.meta.env est absent hors Vite (ex. npm run test:assistant sous Node) : on retombe sur {}
const env = (import.meta.env || {}) as Record<string, string | undefined>
const url = env.VITE_SUPABASE_URL as string, key = env.VITE_SUPABASE_ANON_KEY as string
if (!url || !key) console.error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquants")
// update70 · app native (Capacitor) : flux PKCE (le retour OAuth arrive par le lien profond com.akno.app://auth/callback?code=…)
const native = typeof window !== "undefined" && !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
export const supabase = createClient(url || "http://localhost", key || "missing", { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: !native, ...(native ? { flowType: "pkce" as const } : {}) } })
