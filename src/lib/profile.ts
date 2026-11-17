import { useCallback, useEffect, useState } from "react"
import { supabase } from "./supabase"
import { setCO } from "./devisDoc"

/* update44 · fiche artisan complète (écran Entreprise, onboarding, réglages réception…).
   Un seul chargement partagé entre tous les composants (cache module + abonnés). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Profile = Record<string, any> & { id: string }

let cur: Profile | null = null
let inflight: Promise<void> | null = null
const subs = new Set<(p: Profile | null) => void>()

function loadProfile(force = false) {
  if (inflight && !force) return inflight
  inflight = (async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { cur = null; subs.forEach(f => f(null)); return }
    const { data } = await supabase.from("artisans").select("*").eq("id", user.id).maybeSingle()
    if (data) { cur = data as Profile; setCO(data); subs.forEach(f => f(cur)) }
  })().finally(() => { inflight = null })
  return inflight
}
if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange((_e, ses) => {
    if (!ses || (cur && cur.id !== ses.user.id)) { cur = null; subs.forEach(f => f(null)); if (ses && subs.size) void loadProfile(true) }
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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return "Session expirée."
    const { error } = await supabase.from("artisans").update(patch).eq("id", user.id)
    if (error) return "Enregistrement impossible."
    dispatchEvent(new Event("akno-refresh"))
    return ""
  }, [])
  return { p, save, reload: load }
}
