import { useCallback, useEffect, useState } from "react"
import { getAuthUser, supabase } from "./supabase"
import { setCO } from "./devisDoc"

/* update44 · fiche artisan complète (écran Entreprise, onboarding, réglages réception…).
   Un seul chargement partagé entre tous les composants (cache module + abonnés). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Profile = Record<string, any> & { id: string }

let cur: Profile | null = null
/* update49 · état du chargement, pour que le parcours d'accueil ne laisse jamais entrer sur une erreur */
let pstate: "idle" | "ok" | "missing" | "error" = "idle"
let puid = ""
let inflight: Promise<void> | null = null
const subs = new Set<(p: Profile | null) => void>()

function loadProfile(force = false) {
  if (inflight && !force) return inflight
  inflight = (async () => {
    const user = await getAuthUser()
    if (!user) { cur = null; pstate = "idle"; subs.forEach(f => f(null)); return }
    puid = user.id
    const { data, error } = await supabase.from("artisans").select("*").eq("id", user.id).maybeSingle()
    if (data) { cur = data as Profile; pstate = "ok"; setCO(data); subs.forEach(f => f(cur)) }
    else { pstate = error ? "error" : "missing"; subs.forEach(f => f(cur)) }
  })().catch(() => { pstate = "error"; subs.forEach(f => f(cur)) }).finally(() => { inflight = null })
  return inflight
}
if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange((_e, ses) => {
    if (!ses || (cur && cur.id !== ses.user.id) || (puid && puid !== ses.user.id)) { puid = ses?.user.id || ""; cur = null; pstate = "idle"; subs.forEach(f => f(null)); if (ses && subs.size) void loadProfile(true) }
  })
  addEventListener("akno-refresh", () => { if (subs.size) void loadProfile(true) })
}

export function useProfile() {
  const [p, setP] = useState<Profile | null>(cur)
  useEffect(() => {
    subs.add(setP)
    if (!cur) void loadProfile()
    return () => { subs.delete(setP) }
  }, [])
  const load = useCallback(() => loadProfile(true), [])
  const save = useCallback(async (patch: Record<string, unknown>) => {
    const user = await getAuthUser()
    if (!user) return "Session expirée."
    const { error } = await supabase.from("artisans").update(patch).eq("id", user.id)
    if (error) return "Enregistrement impossible."
    dispatchEvent(new Event("akno-refresh"))
    return ""
  }, [])
  return { p, save, reload: load }
}

/** update49 · fiche + état : "loading" | "ok" | "missing" (pas encore de ligne artisans) | "error". */
export function useProfileState() {
  const { p, save, reload } = useProfile()
  const [, tick] = useState(0)
  useEffect(() => { const f = () => tick(x => x + 1); subs.add(f); return () => { subs.delete(f) } }, [])
  const state = p && pstate === "ok" ? "ok" : pstate === "missing" ? "missing" : pstate === "error" ? "error" : "loading"
  return { p, state, save, reload }
}
