/* update51 · Configuration obligatoire des pages (Réception, Agenda, Relance, Devis).
   L'état « page configurée » est stocké côté serveur, par compte, dans les métadonnées Supabase Auth
   (auth.users.raw_user_meta_data → akno_setup = { dev: "2026-11-18T…", … }) : aucune migration nécessaire.
   Une copie locale (localStorage) sert seulement à ouvrir la page instantanément au prochain chargement ;
   elle n'est écrite qu'après la confirmation du serveur. */
import { useSyncExternalStore } from "react"
import type { User } from "@supabase/supabase-js"
import { getAuthUser, supabase } from "./supabase"

export type SK = "rec" | "ag" | "rel" | "dev"
export type SetupFlags = Partial<Record<SK, string>>
type Snap = { loaded: boolean; flags: SetupFlags }

let uid = ""
let server: SetupFlags | null = null
let local: SetupFlags = {}
let snap: Snap = { loaded: false, flags: {} }
const subs = new Set<() => void>()
const KEYS: SK[] = ["rec", "ag", "rel", "dev"]

const lsKey = (u: string) => `akno-setup:${u}`
const clean = (x: unknown): SetupFlags => {
  const o: SetupFlags = {}
  if (x && typeof x === "object") for (const k of KEYS) { const v = (x as Record<string, unknown>)[k]; if (typeof v === "string" && v) o[k] = v; else if (v === true) o[k] = "1" }
  return o
}
const readLocal = (u: string): SetupFlags => { try { return clean(JSON.parse(localStorage.getItem(lsKey(u)) || "{}")) } catch { return {} } }
const writeLocal = (u: string, f: SetupFlags) => { try { localStorage.setItem(lsKey(u), JSON.stringify(f)) } catch { /* navigation privée */ } }
const fromUser = (u?: User | null) => clean(u?.user_metadata?.akno_setup)
function emit() { snap = { loaded: server !== null, flags: { ...local, ...(server || {}) } }; subs.forEach(f => f()) }
function adopt(u: User) {
  if (u.id !== uid) { uid = u.id; local = readLocal(uid) }
  server = fromUser(u)
  local = { ...local, ...server }
  writeLocal(uid, local)
  emit()
}

let inflight: Promise<void> | null = null
function load() {
  if (inflight) return inflight
  inflight = (async () => {
    const user = await getAuthUser()
    if (user) { adopt(user); return }
    const { data: s } = await supabase.auth.getSession(); if (s.session) adopt(s.session.user)
  })().catch(() => { /* réseau : on réessaiera au prochain abonnement */ }).finally(() => { inflight = null })
  return inflight
}

if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange((e, ses) => {
    if (!ses) { uid = ""; server = null; local = {}; emit(); return }
    if (ses.user.id !== uid) { uid = ses.user.id; local = readLocal(uid); server = null; emit(); if (subs.size) void load() }
    else if (e === "USER_UPDATED") adopt(ses.user)
  })
}

export function useSetupFlags(): Snap {
  return useSyncExternalStore(
    f => { subs.add(f); if (!snap.loaded) void load(); return () => { subs.delete(f) } },
    () => snap,
    () => snap,
  )
}

/** Marque la page comme configurée (côté serveur). Renvoie "" si OK, sinon un message d'erreur. */
export async function markSetupDone(k: SK): Promise<string> {
  const next: SetupFlags = { ...local, ...(server || {}), [k]: new Date().toISOString() }
  const { data, error } = await supabase.auth.updateUser({ data: { akno_setup: next } })
  if (error || !data.user) return "La page n'a pas pu être débloquée. Vérifiez votre connexion et réessayez."
  adopt(data.user)
  return ""
}

/* Page actuellement verrouillée (lue par la barre du haut : « + » et raccourci N ouvrent la configuration). */
let lockedPage: string | null = null
const lsubs = new Set<() => void>()
export const setLockedPage = (p: string | null) => { if (p !== lockedPage) { lockedPage = p; lsubs.forEach(f => f()) } }
export const isPageLocked = (p: string) => lockedPage === p
export const useLockedPage = () => useSyncExternalStore(f => { lsubs.add(f); return () => { lsubs.delete(f) } }, () => lockedPage, () => null)
export const openSetup = () => dispatchEvent(new Event("akno-setup-open"))
