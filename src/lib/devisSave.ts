/* update52 · Enregistrement direct d'un devis depuis l'éditeur pro.
   Chaque écriture est vérifiée : en cas d'échec, un message en français est renvoyé (jamais de disparition silencieuse),
   et le brouillon reste gardé sur l'appareil (localStorage) jusqu'à ce qu'il soit enregistré. */
import { supabase } from "./supabase"
import { dbErrorFr, mapStatut, type Devis, type DevisLine } from "./store"

export type DevisInput = { num: number; client: string; email: string; phone: string; addr: string; objet: string; lines: DevisLine[]; ht: number; ttc: number; tva: number }
type Row = Record<string, unknown>

const toRow = (d: DevisInput) => ({
  numero: String(d.num), client_nom: d.client.trim() || "Client à préciser", client_email: d.email.trim(), client_telephone: d.phone.trim() || null,
  client_adresse: d.addr.trim() || null, objet: d.objet.trim() || "Travaux", lignes: d.lines, total_ht: d.ht, total_ttc: d.ttc, tva_taux: d.tva,
})

export const rowToDevis = (r: Row, created = Date.now()): Devis => ({
  id: String(r.id), num: parseInt(String(r.numero || "").replace(/\D/g, ""), 10) || 0, client: String(r.client_nom || ""), objet: String(r.objet || ""),
  status: mapStatut(String(r.statut || "")), amount: Number(r.total_ttc ?? r.total_ht ?? 0), created, lines: Array.isArray(r.lignes) ? r.lignes as DevisLine[] : undefined,
  at: r.created_at ? String(r.created_at) : undefined, email: r.client_email ? String(r.client_email) : undefined, callId: r.call_id != null ? String(r.call_id) : undefined,
  ai: r.call_id != null, sentAt: r.envoye_le ? String(r.envoye_le) : undefined, token: r.token ? String(r.token) : undefined, remindersOff: !!r.relances_off,
  reply: r.reponse_client ? String(r.reponse_client) : undefined, repliedAt: r.repondu_le ? String(r.repondu_le) : undefined, reminderCount: Number(r.relances || 0),
  phone: r.client_telephone ? String(r.client_telephone) : undefined, addr: r.client_adresse ? String(r.client_adresse) : undefined,
})

/** Numéro suivant : compteur atomique en base (next_numero), sinon max + 1 des devis connus. */
export async function nextDevisNum(known: number[]): Promise<number> {
  try {
    const { data, error } = await supabase.rpc("next_numero", { p_kind: "devis" })
    const n = parseInt(String(data ?? "").replace(/\D/g, ""), 10)
    if (!error && Number.isFinite(n) && n > 0) return n
  } catch { /* repli */ }
  return Math.max(9087, ...known.filter(n => Number.isFinite(n) && n < 1e9)) + 1
}

export type SaveResult = { ok: true; devis: Devis } | { ok: false; error: string }

export async function saveDevis(id: string | null, input: DevisInput): Promise<SaveResult> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: "Votre session a expiré. Reconnectez-vous pour enregistrer le devis." }
    const row = toRow(input)
    const q = id
      ? supabase.from("devis").update(row).eq("id", id).select("*").maybeSingle()
      : supabase.from("devis").insert({ ...row, artisan_id: user.id, statut: "brouillon" }).select("*").maybeSingle()
    const { data, error } = await q
    if (error) { console.error("saveDevis", error); return { ok: false, error: dbErrorFr(error, "l'enregistrement du devis") } }
    if (!data) return { ok: false, error: id ? "Ce devis n'existe plus (supprimé depuis un autre appareil ?)." : "Le devis n'a pas pu être créé. Réessayez." }
    return { ok: true, devis: rowToDevis(data as Row) }
  } catch (e) {
    console.error("saveDevis", e)
    return { ok: false, error: dbErrorFr({ message: String((e as Error)?.message || e) }, "l'enregistrement du devis") }
  }
}

/* Sauvegarde locale de secours (brouillon en cours, tant qu'il n'est pas confirmé par la base) */
const LK = (key: string) => `akno-devis-draft:${key}`
export const keepLocal = (key: string, v: unknown) => { try { localStorage.setItem(LK(key), JSON.stringify({ at: Date.now(), v })) } catch { /* */ } }
export const readLocal = <T,>(key: string): T | null => { try { const x = JSON.parse(localStorage.getItem(LK(key)) || "null"); return x && Date.now() - x.at < 14 * 864e5 ? x.v as T : null } catch { return null } }
export const dropLocal = (key: string) => { try { localStorage.removeItem(LK(key)) } catch { /* */ } }
