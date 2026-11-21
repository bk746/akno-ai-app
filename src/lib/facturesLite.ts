/* update62 · Factures « légères » pour la barre d'onglets (pastille) et la page Factures.
   Lecture seule, sans jsPDF (le PDF reste chargé à la demande par FacturesSheet). */
import { useSyncExternalStore } from "react"
import { supabase } from "./supabase"
import { CO } from "./devisDoc"
import { computeFacture, type FLine, type FType } from "../../api/_lib/factureCalc"

export type FactureLite = {
  id: string; numero: string | null; type: FType; statut: string; client_nom: string | null; objet?: string | null
  lignes: FLine[] | null; acompte_deduit?: number | null; retenue_garantie_pct?: number | null; autoliquidation?: boolean | null
  situation_numero?: number | null; date_emission?: string | null; date_echeance?: string | null; created_at?: string | null
}
type State = { rows: FactureLite[] | null; error: boolean }
let state: State = { rows: null, error: false }
const subs = new Set<() => void>()
const emit = (s: State) => { state = s; subs.forEach(f => f()) }
let inflight: Promise<void> | null = null, again = false

const todayParis = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" })
export const isUnpaid = (f: FactureLite) => (f.statut === "emise" || f.statut === "envoyee") && f.type !== "avoir"
export const isLate = (f: FactureLite) => isUnpaid(f) && !!f.date_echeance && f.date_echeance < todayParis()
export const dueOf = (f: FactureLite) => Math.max(0, computeFacture(f.lignes || [], { zeroTva: !!f.autoliquidation || CO.tvaNA, acompteDeduit: Number(f.acompte_deduit) || 0, retenuePct: Number(f.retenue_garantie_pct) || 0 }).net)

/** Recharge (dédoublonné : un seul appel réseau à la fois, un rappel si on redemande pendant le chargement). */
export function refreshFactures(): Promise<void> {
  if (inflight) { again = true; return inflight }
  inflight = (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user.id
      if (!uid) return
      const { data, error } = await supabase.from("factures")
        .select("id, numero, type, statut, client_nom, objet, lignes, acompte_deduit, retenue_garantie_pct, autoliquidation, situation_numero, date_emission, date_echeance, created_at")
        .eq("artisan_id", uid).order("created_at", { ascending: false }).limit(300)
      if (error) emit({ rows: state.rows || [], error: true })
      else emit({ rows: (data || []) as FactureLite[], error: false })
    } catch { emit({ rows: state.rows || [], error: true }) }
  })().finally(() => { inflight = null; if (again) { again = false; void refreshFactures() } })
  return inflight
}
export const useFacturesLite = () => useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f) } }, () => state, () => state)
/** Pastille de l'onglet Factures : factures émises non payées (dont en retard). 0 = pastille masquée. */
export const unpaidCount = (s: State) => (s.rows || []).filter(isUnpaid).length

/** Lecture ponctuelle (hors React), ex. réponses de l'assistant. */
export const factureState = () => state
/* update63 · dernier mode choisi dans l'onglet Factures (Devis | Factures) */
const DOC_KEY = "akno-docmode"
export const lastDocMode = (): "dev" | "fac" => { try { return localStorage.getItem(DOC_KEY) === "fac" ? "fac" : "dev" } catch { return "dev" } }
export const rememberDocMode = (m: "dev" | "fac") => { try { localStorage.setItem(DOC_KEY, m) } catch { /* navigation privée */ } }
