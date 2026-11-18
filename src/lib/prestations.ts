/* update52 · Bibliothèque de prestations de l'artisan.
   Stockage : table public.prestations (migration 20261118_07, RLS artisan_id = auth.uid()).
   Tant que la migration n'est pas appliquée, repli automatique sur l'appareil (localStorage) ;
   dès que la table existe, les prestations locales y sont transférées une fois. */
import { useEffect, useSyncExternalStore } from "react"
import { supabase } from "./supabase"
import { dbErrorFr } from "./store"
import type { LineKind } from "./devisCalc"

export type Prestation = { id: string; libelle: string; description: string; categorie: string; type: LineKind; unite: string; duree_h: number | null; taux_horaire: number | null; prix_unitaire: number; tva: number | null; cout_achat: number | null }
export type PrestaInput = Omit<Prestation, "id">
type State = { items: Prestation[]; ready: boolean; mode: "db" | "local"; error: string }

let st: State = { items: [], ready: false, mode: "db", error: "" }
let uid = "", loading: Promise<void> | null = null
const subs = new Set<() => void>()
const emit = (p: Partial<State>) => { st = { ...st, ...p }; subs.forEach(f => f()) }
const LKEY = () => `akno-prestations:${uid}`
const readL = (): Prestation[] => { try { const x = JSON.parse(localStorage.getItem(LKEY()) || "[]"); return Array.isArray(x) ? x : [] } catch { return [] } }
const writeL = (xs: Prestation[]) => { try { localStorage.setItem(LKEY(), JSON.stringify(xs)) } catch { /* */ } }
const isMissingTable = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST204" || /prestations/i.test(String(e.message || "")) && /(schema cache|does not exist|not find)/i.test(String(e.message || "")))
const num = (v: unknown) => v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null
const norm = (r: Record<string, unknown>): Prestation => ({
  id: String(r.id), libelle: String(r.libelle || ""), description: String(r.description || ""), categorie: String(r.categorie || ""),
  type: r.type === "mo" || r.type === "fft" ? r.type : "fo", unite: String(r.unite || (r.type === "mo" ? "h" : r.type === "fft" ? "forfait" : "u")),
  duree_h: num(r.duree_h), taux_horaire: num(r.taux_horaire), prix_unitaire: Number(r.prix_unitaire) || 0, tva: num(r.tva), cout_achat: num(r.cout_achat),
})
const sortP = (xs: Prestation[]) => [...xs].sort((a, b) => (a.categorie || "~").localeCompare(b.categorie || "~", "fr") || a.libelle.localeCompare(b.libelle, "fr"))
const clean = (p: PrestaInput) => ({
  libelle: p.libelle.trim().slice(0, 200), description: p.description.trim().slice(0, 1000), categorie: p.categorie.trim().slice(0, 60), type: p.type,
  unite: (p.unite || "u").slice(0, 12), duree_h: p.type === "mo" ? p.duree_h : null, taux_horaire: p.type === "mo" ? p.taux_horaire : null,
  prix_unitaire: p.type === "mo" ? 0 : Math.max(0, p.prix_unitaire || 0), tva: p.tva, cout_achat: p.cout_achat,
})

export async function loadPrestations(force = false) {
  if (loading && !force) return loading
  loading = (async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    uid = user.id
    const { data, error } = await supabase.from("prestations").select("*").eq("artisan_id", user.id).order("categorie").order("libelle").limit(2000)
    if (error) {
      if (isMissingTable(error)) { emit({ items: sortP(readL()), ready: true, mode: "local", error: "" }); return }
      emit({ ready: true, error: dbErrorFr(error, "le chargement de vos prestations"), items: st.items.length ? st.items : sortP(readL()) })
      return
    }
    let items = (data || []).map(r => norm(r as Record<string, unknown>))
    // Transfert unique des prestations gardées sur l'appareil vers la base
    const local = readL()
    if (local.length) {
      const { data: up, error: e2 } = await supabase.from("prestations").insert(local.map(x => ({ ...clean(x), artisan_id: user.id }))).select("*")
      if (!e2) { items = [...items, ...(up || []).map(r => norm(r as Record<string, unknown>))]; try { localStorage.removeItem(LKEY()) } catch { /* */ } }
    }
    emit({ items: sortP(items), ready: true, mode: "db", error: "" })
  })()
  try { await loading } finally { loading = null }
}

export type PResult = { ok: true; item?: Prestation } | { ok: false; error: string }

export async function savePrestation(id: string | null, p: PrestaInput): Promise<PResult> {
  if (!p.libelle.trim()) return { ok: false, error: "Donnez un nom à la prestation." }
  if (!uid) await loadPrestations()
  const row = clean(p)
  if (st.mode === "local") {
    const item: Prestation = { ...row, id: id || `l-${Math.random().toString(36).slice(2, 10)}` }
    const items = sortP(id ? st.items.map(x => x.id === id ? item : x) : [...st.items, item])
    writeL(items); emit({ items }); return { ok: true, item }
  }
  try {
    const q = id ? supabase.from("prestations").update(row).eq("id", id).select("*").maybeSingle() : supabase.from("prestations").insert({ ...row, artisan_id: uid }).select("*").maybeSingle()
    const { data, error } = await q
    if (error) {
      if (isMissingTable(error)) { emit({ mode: "local" }); return savePrestation(id, p) }
      return { ok: false, error: dbErrorFr(error, "l'enregistrement de la prestation") }
    }
    if (!data) return { ok: false, error: "La prestation n'a pas pu être enregistrée." }
    const item = norm(data as Record<string, unknown>)
    emit({ items: sortP(id ? st.items.map(x => x.id === id ? item : x) : [...st.items, item]) })
    return { ok: true, item }
  } catch (e) { return { ok: false, error: dbErrorFr({ message: String((e as Error)?.message || e) }, "l'enregistrement de la prestation") } }
}

export async function deletePrestation(id: string): Promise<PResult> {
  if (st.mode === "local" || id.startsWith("l-")) { const items = st.items.filter(x => x.id !== id); if (st.mode === "local") writeL(items); emit({ items }); return { ok: true } }
  const { error } = await supabase.from("prestations").delete().eq("id", id)
  if (error) return { ok: false, error: dbErrorFr(error, "la suppression de la prestation") }
  emit({ items: st.items.filter(x => x.id !== id) })
  return { ok: true }
}

/** Ajout groupé (prestations types proposées à la première ouverture). */
export async function addMany(xs: PrestaInput[]): Promise<PResult> {
  if (!uid) await loadPrestations()
  if (st.mode === "local") { const items = sortP([...st.items, ...xs.map(x => ({ ...clean(x), id: `l-${Math.random().toString(36).slice(2, 10)}` }))]); writeL(items); emit({ items }); return { ok: true } }
  const { data, error } = await supabase.from("prestations").insert(xs.map(x => ({ ...clean(x), artisan_id: uid }))).select("*")
  if (error) { if (isMissingTable(error)) { emit({ mode: "local" }); return addMany(xs) } return { ok: false, error: dbErrorFr(error, "l'ajout des prestations") } }
  emit({ items: sortP([...st.items, ...(data || []).map(r => norm(r as Record<string, unknown>))]) })
  return { ok: true }
}

export function usePrestations() {
  const s = useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f) } }, () => st, () => st)
  useEffect(() => { if (!s.ready) void loadPrestations() }, [s.ready])
  return s
}
/** Réinitialise le cache (changement de compte). */
export const resetPrestations = () => { uid = ""; emit({ items: [], ready: false, mode: "db", error: "" }) }

const T = (libelle: string, categorie: string, type: LineKind, o: Partial<PrestaInput> = {}): PrestaInput => ({ libelle, categorie, type, description: "", unite: type === "mo" ? "h" : type === "fft" ? "forfait" : "u", duree_h: type === "mo" ? 1 : null, taux_horaire: null, prix_unitaire: 0, tva: null, cout_achat: null, ...o })
/** Prestations types pour démarrer, selon le métier (prix indicatifs, à ajuster). */
export function starterPack(metier = ""): PrestaInput[] {
  const m = metier.toLowerCase()
  const common = [T("Déplacement", "Frais", "fft", { prix_unitaire: 49 }), T("Diagnostic sur place", "Frais", "mo", { duree_h: 1 })]
  if (/plomb|chauff|sanit|clim|pac/.test(m)) return [...common,
    T("Remplacement de mitigeur", "Plomberie", "mo", { duree_h: 1.5, description: "Dépose de l'ancien mitigeur, pose et raccordement du nouveau, essais d'étanchéité." }),
    T("Mitigeur lavabo", "Fournitures", "fo", { prix_unitaire: 89, cout_achat: 52 }),
    T("Pose de ballon d'eau chaude", "Chauffage", "mo", { duree_h: 3.5, description: "Dépose et évacuation de l'ancien ballon, pose, raccordements, mise en service." }),
    T("Recherche de fuite", "Plomberie", "fft", { prix_unitaire: 180 }),
    T("Tube multicouche Ø16", "Fournitures", "fo", { unite: "ml", prix_unitaire: 6.5, cout_achat: 3.2 })]
  if (/[ée]lec/.test(m)) return [...common,
    T("Création d'un point lumineux", "Électricité", "mo", { duree_h: 1.5 }),
    T("Remplacement de tableau électrique", "Électricité", "mo", { duree_h: 6, description: "Dépose de l'ancien tableau, pose d'un tableau aux normes NF C 15-100, repérage des circuits." }),
    T("Prise de courant 16 A", "Fournitures", "fo", { prix_unitaire: 14, cout_achat: 6 }),
    T("Câble R2V 3G2,5", "Fournitures", "fo", { unite: "ml", prix_unitaire: 2.4, cout_achat: 1.1 }),
    T("Mise en sécurité électrique", "Électricité", "fft", { prix_unitaire: 390 })]
  if (/peint|d[ée]co|plaqu|pl[âa]tr/.test(m)) return [...common,
    T("Préparation des murs", "Peinture", "fo", { unite: "m²", prix_unitaire: 9, description: "Lessivage, rebouchage, ponçage." }),
    T("Peinture murs 2 couches", "Peinture", "fo", { unite: "m²", prix_unitaire: 22 }),
    T("Peinture plafond 2 couches", "Peinture", "fo", { unite: "m²", prix_unitaire: 26 }),
    T("Pose de toile de verre", "Peinture", "fo", { unite: "m²", prix_unitaire: 18 }),
    T("Protection et nettoyage du chantier", "Peinture", "mo", { duree_h: 2 })]
  if (/carrel|fa[iï]en|sol/.test(m)) return [...common,
    T("Dépose de carrelage existant", "Carrelage", "fo", { unite: "m²", prix_unitaire: 25 }),
    T("Ragréage", "Carrelage", "fo", { unite: "m²", prix_unitaire: 18 }),
    T("Pose de carrelage sol", "Carrelage", "fo", { unite: "m²", prix_unitaire: 45 }),
    T("Pose de faïence murale", "Carrelage", "fo", { unite: "m²", prix_unitaire: 50 }),
    T("Joints et finitions", "Carrelage", "mo", { duree_h: 2 })]
  if (/menuis|charpen|bois|ébén|eben/.test(m)) return [...common,
    T("Pose de porte intérieure", "Menuiserie", "mo", { duree_h: 2.5 }),
    T("Pose de fenêtre PVC", "Menuiserie", "mo", { duree_h: 3, description: "Dépose de l'ancienne menuiserie, pose en rénovation, calfeutrement, réglages." }),
    T("Bloc-porte 83 cm", "Fournitures", "fo", { prix_unitaire: 210, cout_achat: 120 }),
    T("Plinthes bois", "Fournitures", "fo", { unite: "ml", prix_unitaire: 9, cout_achat: 4 }),
    T("Ajustement et réglages", "Menuiserie", "mo", { duree_h: 1 })]
  if (/ma[çc]on|gros|b[ée]ton/.test(m)) return [...common,
    T("Démolition de cloison", "Maçonnerie", "fo", { unite: "m²", prix_unitaire: 35 }),
    T("Montage de mur en parpaings", "Maçonnerie", "fo", { unite: "m²", prix_unitaire: 75 }),
    T("Dalle béton", "Maçonnerie", "fo", { unite: "m²", prix_unitaire: 85 }),
    T("Évacuation des gravats", "Frais", "fft", { prix_unitaire: 180 }),
    T("Main-d'œuvre maçon", "Maçonnerie", "mo", { duree_h: 8 })]
  return [...common, T("Main-d'œuvre", "Travaux", "mo", { duree_h: 1 }), T("Petites fournitures", "Fournitures", "fft", { prix_unitaire: 25 }), T("Évacuation des déchets", "Frais", "fft", { prix_unitaire: 60 })]
}

// Changement de compte : on ne garde jamais la bibliothèque d'un autre artisan en mémoire
try { supabase.auth.onAuthStateChange((_e, ses) => { const id = ses?.user?.id || ""; if (uid && id !== uid) resetPrestations() }) } catch { /* */ }
