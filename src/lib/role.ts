/* update78 · Rôle de session : patron (fiche artisans) ou employé (employes.user_id). */
import { useSyncExternalStore } from "react"
import { getAuthUser, supabase } from "./supabase"

export type AppRole = { kind: "patron" } | { kind: "employe"; employeId: string; artisanId: string; firstName: string; accessRole?: string | null }

let role: AppRole | null = null
let ready = false
const subs = new Set<() => void>()
const emit = () => subs.forEach(f => f())

export function roleState() { return { role, ready } }

let roleInflight: Promise<AppRole | null> | null = null
export async function loadRole(): Promise<AppRole | null> {
  if (roleInflight) return roleInflight
  roleInflight = (async () => {
  const user = await getAuthUser()
  if (!user) { role = null; ready = true; emit(); return null }
  try {
    const { data, error } = await supabase.from("employes").select("id, artisan_id, first_name, access_role, user_id").eq("user_id", user.id).maybeSingle()
    if (error && /user_id|column/i.test(error.message || "")) { role = { kind: "patron" }; ready = true; emit(); return role }
    if (data?.id) role = { kind: "employe", employeId: data.id, artisanId: data.artisan_id, firstName: data.first_name, accessRole: data.access_role }
    else role = { kind: "patron" }
  } catch { role = { kind: "patron" } }
  ready = true
  emit()
  return role
  })()
  try { return await roleInflight } finally { roleInflight = null }
}

export const useAppRole = () => useSyncExternalStore(f => { subs.add(f); if (!ready) void loadRole(); return () => { subs.delete(f) } }, () => role, () => role)
export const useRoleReady = () => useSyncExternalStore(f => { subs.add(f); if (!ready) void loadRole(); return () => { subs.delete(f) } }, () => ready, () => ready)

if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange((e) => { if (e === "INITIAL_SESSION") return; ready = false; role = null; emit(); void loadRole() })
}
