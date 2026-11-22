/* update77 · Règles de suppression devis / factures (RLS + triggers existants, pas de migration).
   Devis non signé : suppression autorisée (policy devis_delete_own).
   Devis signé (statut val ou signe_le) : bloqué par le trigger devis_no_delete_signed (preuve à conserver).
   Facture brouillon (sans numéro) : suppression autorisée (policy factures_delete_own + trigger factures_no_delete).
   Facture émise / envoyée / payée : jamais de suppression — on crée un avoir. */
import { supabase } from "./supabase"
import { isMissing } from "./chantiers"

export const isSignedDevis = (d: { status?: string; signedAt?: string | null }) => d.status === "val" || !!d.signedAt

/** Bouton révélé par le swipe d'une facture. */
export function factureSwipeAction(f: { numero?: string | null; type?: string }): "delete" | "avoir" | "blocked" {
  if (!f.numero) return "delete"
  if (f.type === "avoir") return "blocked"
  return "avoir"
}

function joinFr(xs: string[]) {
  if (xs.length <= 1) return xs[0] || ""
  return `${xs.slice(0, -1).join(", ")} et ${xs[xs.length - 1]}`
}

/** null = suppression possible. Sinon le motif à afficher (devis signé, éventuellement lié). */
export async function devisDeleteReason(d: { id: string; status?: string; signedAt?: string | null }): Promise<string | null> {
  if (!isSignedDevis(d)) return null
  const links: string[] = []
  try {
    const { data: fac } = await supabase.from("factures").select("id, numero, type, statut").eq("devis_id", d.id)
    const live = (fac || []).filter(x => x.numero)
    if (live.some(x => x.type === "acompte")) links.push("une facture d'acompte")
    else if (live.length) links.push(live.length > 1 ? "des factures" : "une facture")
  } catch { /* table absente ou hors ligne : on bloque quand même le devis signé */ }
  try {
    const { data: ch, error } = await supabase.from("chantiers").select("id").eq("devis_id", d.id).limit(1)
    if (!isMissing(error) && (ch || []).length) links.push("un chantier")
  } catch { /* idem */ }
  if (links.length) return `Ce devis est signé et lié à ${joinFr(links)}. Il ne peut pas être supprimé : c'est une preuve à conserver.`
  return "Ce devis est signé électroniquement : c'est une preuve à conserver, il ne peut pas être supprimé."
}
