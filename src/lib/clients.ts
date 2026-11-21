/* update66 · Fiches clients (table client_fiches, update61) : chargement, ajout, modification, suppression.
   Les colonnes de la migration 20261121_13 (type, prénom/nom, origine, ville, position, date de création) ne sont lues
   et écrites que si elles existent (sonde « ext ») : sans la migration, l'app enregistre nom, téléphone, e-mail, adresse, SIREN et notes. */
import { useSyncExternalStore } from "react"
import { supabase } from "./supabase"
import { dbErrorFr } from "./store"
import { cityOf, ficheKey, type FicheRow, type Kind, type Origin, type SigIn } from "./clientsCalc"

type CState = { ready: boolean; fiches: FicheRow[]; ext: boolean; missing: boolean; sigs: SigIn[] }
let state: CState = { ready: false, fiches: [], ext: false, missing: false, sigs: [] }
const subs = new Set<() => void>()
const emit = (p: Partial<CState>) => { state = { ...state, ...p }; subs.forEach(f => f()) }
export const clientsState = () => state
export const useClients = () => useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f) } }, () => state, () => state)
const EXT = "type_client, prenom, nom_famille, origine, ville, lat, lng, created_at"
let inflight: Promise<void> | null = null
export function loadClients(): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    const { data: { session } } = await supabase.auth.getSession(), uid = session?.user.id
    if (!uid) return
    const [f, x, s] = await Promise.all([
      supabase.from("client_fiches").select("*").eq("artisan_id", uid).order("updated_at", { ascending: false }).limit(2000),
      supabase.from("client_fiches").select(EXT).limit(1),
      supabase.from("signature_events").select("devis_id, at").eq("artisan_id", uid).eq("event", "signature").limit(2000),
    ])
    emit({ ready: true, fiches: (f.data || []) as FicheRow[], missing: !!f.error, ext: !f.error && !x.error, sigs: ((s.data || []) as SigIn[]).filter(r => r.devis_id && r.at) })
  })().catch(() => emit({ ready: true })).finally(() => { inflight = null })
  return inflight
}

export type ClientInput = { kind: Kind; prenom: string; nom_famille: string; societe: string; telephone: string; email: string; adresse: string; ville: string; lat: number | null; lng: number | null; siren: string; notes: string; origine: Origin | null }
/** Nom affiché (et clé) : « Prénom Nom » pour un particulier, raison sociale pour un pro / syndic. */
export const displayName = (v: Pick<ClientInput, "kind" | "prenom" | "nom_famille" | "societe">) => v.kind === "particulier" ? `${v.prenom.trim()} ${v.nom_famille.trim()}`.trim() : v.societe.trim() || `${v.prenom.trim()} ${v.nom_famille.trim()}`.trim()

/** Crée (cle = null) ou modifie une fiche. La clé d'une fiche existante ne change pas (devis, factures et chantiers y restent rattachés). */
export async function saveClient(cle: string | null, v: ClientInput): Promise<{ ok: true; cle: string } | { ok: false; error: string; existing?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Session expirée : reconnectez-vous." }
  const nom = displayName(v).slice(0, 160), key = cle || ficheKey(nom)
  if (!key) return { ok: false, error: "Indiquez un nom." }
  if (!cle && state.fiches.some(f => f.cle === key)) return { ok: false, error: "Un client porte déjà ce nom.", existing: key }
  const row: Record<string, unknown> = { artisan_id: user.id, cle: key, nom, telephone: v.telephone || null, email: v.email.trim() || null, adresse: v.adresse.trim() || null, siren: v.siren || null, notes: v.notes.trim().slice(0, 4000) || null, updated_at: new Date().toISOString() }
  if (state.ext) Object.assign(row, { type_client: v.kind, prenom: v.prenom.trim() || null, nom_famille: v.nom_famille.trim() || null, origine: v.origine, ville: (v.ville.trim() || cityOf(v.adresse)).slice(0, 120) || null, lat: v.lat, lng: v.lng, ...(state.fiches.some(f => f.cle === key) ? {} : { created_at: new Date().toISOString() }) })
  const r = await supabase.from("client_fiches").upsert(row, { onConflict: "artisan_id,cle" }).select("*").maybeSingle()
  if (r.error) return { ok: false, error: dbErrorFr(r.error, "l'enregistrement du client") }
  const saved = (r.data || row) as FicheRow
  emit({ fiches: [saved, ...state.fiches.filter(f => f.cle !== key)] })
  try { dispatchEvent(new Event("akno-clients")) } catch { /* */ }
  return { ok: true, cle: key }
}
export async function deleteClient(cle: string): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return "Session expirée : reconnectez-vous."
  const { error } = await supabase.from("client_fiches").delete().eq("artisan_id", user.id).eq("cle", cle)
  if (error) return dbErrorFr(error, "la suppression du client")
  emit({ fiches: state.fiches.filter(f => f.cle !== cle) })
  return null
}

/* ouverture d'une fiche depuis une autre page (même principe que requestOpenChantier) */
let openReq: string | null = null
export function requestOpenClient(p: { key?: string; name?: string; phone?: string }) { openReq = [p.key || "", p.name || "", p.phone || ""].join("\u0001"); try { dispatchEvent(new Event("akno-client-open")) } catch { /* */ } }
export function takeOpenClient() { const k = openReq; openReq = null; return k }
/* ajout depuis un appel de la réceptionniste (origine « Appel » préremplie) */
export type NewClientSeed = { name?: string; phone?: string; addr?: string; email?: string; origine?: Origin }
let seedReq: NewClientSeed | null = null
export function requestNewClient(seed: NewClientSeed) { seedReq = seed; try { dispatchEvent(new Event("akno-client-new")) } catch { /* */ } }
export function takeNewClient() { const k = seedReq; seedReq = null; return k }

/* géocodage d'une adresse (api-adresse, mis en cache) pour la vignette satellite quand la fiche n'a pas de position */
const geo = new Map<string, { lat: number; lng: number } | null>()
export async function geocode(addr: string): Promise<{ lat: number; lng: number } | null> {
  const k = addr.trim().toLowerCase(); if (k.length < 6) return null
  if (geo.has(k)) return geo.get(k)!
  try { const { searchAddress } = await import("./geo"); const p = (await searchAddress(addr))[0]; const v = p ? { lat: p.lat, lng: p.lng } : null; geo.set(k, v); return v } catch { return null }
}
