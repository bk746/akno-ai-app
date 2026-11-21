/* update64 · Données Chantiers + Équipe (Supabase). Tant que la migration 20261121_11 n'est pas appliquée,
   l'état passe à « missing » : l'interface affiche « appliquez la migration » au lieu de planter. */
import { useSyncExternalStore } from "react"
import { supabase } from "./supabase"
import type { ChStatus } from "./chantierCalc"

export type Chantier = {
  id: string; title: string; client_id: string | null; client_nom: string | null; client_telephone: string | null
  address: string | null; lat: number | null; lng: number | null; start_date: string | null; end_date: string | null
  status: ChStatus; progress_override: number | null; notes: string | null; devis_id: string | null; created_at?: string; updated_at?: string
}
export type Employe = { id: string; first_name: string; last_name: string | null; role: string | null; phone: string | null; photo_path: string | null }
export type ChState = { ready: boolean; missing: boolean; error: string; rows: Chantier[]; employes: Employe[]; links: { chantier_id: string; employe_id: string }[] }

let state: ChState = { ready: false, missing: false, error: "", rows: [], employes: [], links: [] }
const subs = new Set<() => void>()
const emit = (p: Partial<ChState>) => { state = { ...state, ...p }; subs.forEach(f => f()) }
export const chState = () => state
export const useChantiers = () => useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f) } }, () => state, () => state)

/** Table absente (migration non appliquée) : codes PostgREST / Postgres. */
export const isMissing = (e: { code?: string; message?: string } | null | undefined) => !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST200" || /does not exist|schema cache|Could not find the table/i.test(e.message || ""))

let inflight: Promise<void> | null = null
export function loadChantiers(): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { emit({ ready: true }); return }
      const [c, e, l] = await Promise.all([
        supabase.from("chantiers").select("*").eq("artisan_id", user.id).order("start_date", { ascending: true, nullsFirst: false }).limit(1000),
        supabase.from("employes").select("id, first_name, last_name, role, phone, photo_path").eq("artisan_id", user.id).order("first_name").limit(500),
        supabase.from("chantier_employes").select("chantier_id, employe_id").eq("artisan_id", user.id).limit(5000),
      ])
      if (isMissing(c.error) || isMissing(e.error) || isMissing(l.error)) { emit({ ready: true, missing: true, error: "" }); return }
      if (c.error || e.error || l.error) { emit({ ready: true, error: "Chantiers indisponibles pour le moment." }); return }
      emit({ ready: true, missing: false, error: "", rows: (c.data || []) as Chantier[], employes: (e.data || []) as Employe[], links: (l.data || []) as ChState["links"] })
    } catch { emit({ ready: true, error: "Chantiers indisponibles (hors ligne ?)." }) }
    finally { inflight = null }
  })()
  return inflight
}

const fr = (e: { code?: string; message?: string } | null) => !e ? "" : isMissing(e) ? "Appliquez d'abord la migration Chantiers (voir LISEZMOI update64)." : /dates_ok/.test(e.message || "") ? "La date de fin doit suivre la date de début." : "Enregistrement impossible. Réessayez."
export type ChInput = Omit<Chantier, "id" | "created_at" | "updated_at">
export async function saveChantier(id: string | null, v: ChInput, team: string[]): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Session expirée." }
  const row = { ...v, title: v.title.trim(), artisan_id: user.id }
  const r = id ? await supabase.from("chantiers").update(row).eq("id", id).select("id").maybeSingle() : await supabase.from("chantiers").insert(row).select("id").maybeSingle()
  if (r.error || !r.data) return { ok: false, error: fr(r.error) || "Enregistrement impossible." }
  const cid = (r.data as { id: string }).id
  const cur = state.links.filter(x => x.chantier_id === cid).map(x => x.employe_id)
  const add = team.filter(x => !cur.includes(x)), del = cur.filter(x => !team.includes(x))
  if (del.length) { const d = await supabase.from("chantier_employes").delete().eq("chantier_id", cid).in("employe_id", del); if (d.error) return { ok: false, error: fr(d.error) } }
  if (add.length) { const a = await supabase.from("chantier_employes").insert(add.map(employe_id => ({ chantier_id: cid, employe_id, artisan_id: user.id }))); if (a.error) return { ok: false, error: fr(a.error) } }
  // mise à jour locale immédiate (pas d'attente du rechargement)
  const full: Chantier = { ...(state.rows.find(x => x.id === cid) || {} as Chantier), ...v, id: cid, title: row.title }
  emit({ rows: state.rows.some(x => x.id === cid) ? state.rows.map(x => x.id === cid ? full : x) : [...state.rows, full], links: [...state.links.filter(x => x.chantier_id !== cid), ...team.map(employe_id => ({ chantier_id: cid, employe_id }))] })
  void loadChantiers()
  return { ok: true, id: cid }
}
export async function patchChantier(id: string, p: Partial<ChInput>) {
  const prev = state.rows
  emit({ rows: state.rows.map(x => x.id === id ? { ...x, ...p } : x) })
  const { error } = await supabase.from("chantiers").update(p).eq("id", id)
  if (error) { emit({ rows: prev }); return fr(error) || "Enregistrement impossible." }
  return ""
}
export async function deleteChantier(id: string) {
  const { error } = await supabase.from("chantiers").delete().eq("id", id)
  if (error) return fr(error) || "Suppression impossible."
  emit({ rows: state.rows.filter(x => x.id !== id), links: state.links.filter(x => x.chantier_id !== id) })
  return ""
}

export async function saveEmploye(id: string | null, v: Omit<Employe, "id">): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Session expirée." }
  const row = { first_name: v.first_name.trim(), last_name: v.last_name?.trim() || null, role: v.role?.trim() || null, phone: v.phone?.trim() || null, photo_path: v.photo_path || null }
  const r = id ? await supabase.from("employes").update(row).eq("id", id).select("id").maybeSingle() : await supabase.from("employes").insert({ ...row, artisan_id: user.id }).select("id").maybeSingle()
  if (r.error || !r.data) return { ok: false, error: fr(r.error) || "Enregistrement impossible." }
  const eid = (r.data as { id: string }).id, e: Employe = { id: eid, ...row }
  emit({ employes: (state.employes.some(x => x.id === eid) ? state.employes.map(x => x.id === eid ? e : x) : [...state.employes, e]).sort((a, b) => a.first_name.localeCompare(b.first_name, "fr")) })
  return { ok: true, id: eid }
}
export async function deleteEmploye(id: string) {
  const ph = state.employes.find(x => x.id === id)?.photo_path
  const { error } = await supabase.from("employes").delete().eq("id", id)
  if (error) return fr(error) || "Suppression impossible."
  if (ph) void supabase.storage.from("equipe").remove([ph])
  emit({ employes: state.employes.filter(x => x.id !== id), links: state.links.filter(x => x.employe_id !== id) })
  return ""
}

/** Photo d'un employé : réduite côté appareil (max 320 px, JPEG) puis envoyée dans le bucket privé « equipe ». */
export async function uploadPhoto(file: File): Promise<{ path?: string; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Session expirée." }
  if (!/^image\//.test(file.type)) return { error: "Choisissez une image." }
  let blob: Blob = file
  try {
    const bmp = await createImageBitmap(file), k = Math.min(1, 320 / Math.max(bmp.width, bmp.height))
    const cv = document.createElement("canvas"); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k)
    cv.getContext("2d")!.drawImage(bmp, 0, 0, cv.width, cv.height)
    blob = await new Promise<Blob>((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error("toBlob")), "image/jpeg", .85))
  } catch { /* image d'origine */ }
  const path = `${user.id}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from("equipe").upload(path, blob, { contentType: "image/jpeg", upsert: false })
  if (error) return { error: /bucket|not found/i.test(error.message) ? "Photos indisponibles : appliquez la migration update64." : "Envoi de la photo impossible." }
  return { path }
}
const urls = new Map<string, string>(), urlSubs = new Set<() => void>()
/** URL signée (1 h) mise en cache ; déclenche un rendu quand elle arrive. */
export function photoUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (urls.has(path)) return urls.get(path) || null
  urls.set(path, "")
  void supabase.storage.from("equipe").createSignedUrl(path, 3600).then(({ data }) => { if (data?.signedUrl) { urls.set(path, data.signedUrl); urlSubs.forEach(f => f()) } })
  return null
}
let urlV = 0
urlSubs.add(() => { urlV++ })
export const usePhotoTick = () => useSyncExternalStore(f => { urlSubs.add(f); return () => { urlSubs.delete(f) } }, () => urlV, () => urlV)

export const teamOf = (chantierId: string, s = state) => s.links.filter(x => x.chantier_id === chantierId).map(x => s.employes.find(e => e.id === x.employe_id)).filter(Boolean) as Employe[]
export const empName = (e: Employe) => `${e.first_name}${e.last_name ? " " + e.last_name : ""}`
export const empShort = (e: Employe) => `${e.first_name}${e.last_name ? " " + e.last_name[0] + "." : ""}`

/* Demande de création venant d'ailleurs (bouton « + » de la barre) : la page Chantiers l'ouvre en arrivant. */
let pendingNew = false
export const requestNewChantier = () => { pendingNew = true; dispatchEvent(new Event("akno-chantier-new")) }
export const takeNewRequest = () => { const p = pendingNew; pendingNew = false; return p }
