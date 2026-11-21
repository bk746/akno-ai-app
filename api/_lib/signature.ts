/* update61 · Signature électronique simple des devis (eIDAS art. 25, Code civil 1366-1367) :
   empreinte SHA-256 du contenu exact du devis + journal de preuve chaîné (chaque entrée inclut l'empreinte précédente). */
import type { SupabaseClient } from "@supabase/supabase-js"
import { sha256Hex } from "./http.js"

/** JSON canonique : clés triées récursivement, pour une empreinte stable. */
export function canonical(v: unknown): string {
  if (v === null || v === undefined) return "null"
  if (typeof v === "number") return Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : "null"
  if (typeof v !== "object") return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`
}
/** Contenu signé : numéro, client, objet, lignes, totaux. */
export const devisContent = (d: Record<string, unknown>) => ({ numero: d.numero ?? null, client_nom: d.client_nom ?? null, objet: d.objet ?? null, lignes: Array.isArray(d.lignes) ? d.lignes : [], total_ht: Number(d.total_ht) || 0, total_ttc: Number(d.total_ttc) || 0 })
export const devisHash = (d: Record<string, unknown>) => sha256Hex(canonical(devisContent(d)))

export type SigEvent = "envoi" | "ouverture" | "consentement" | "signature" | "refus"
/** Ajoute une entrée au journal (clé serveur). Retourne null si la table n'existe pas encore (migration non appliquée). */
export async function logEvent(sb: SupabaseClient, e: { artisan_id: string; devis_id: string; event: SigEvent; ip?: string; ua?: string; signataire?: string; document_hash?: string; data?: Record<string, unknown>; at?: string }) {
  try {
    const { data: last } = await sb.from("signature_events").select("event_hash").eq("devis_id", e.devis_id).order("id", { ascending: false }).limit(1).maybeSingle()
    const prev = (last as { event_hash?: string } | null)?.event_hash || "GENESIS"
    const at = e.at || new Date().toISOString()
    const row = { artisan_id: e.artisan_id, devis_id: e.devis_id, event: e.event, at, ip: (e.ip || "").slice(0, 64) || null, ua: (e.ua || "").slice(0, 300) || null, signataire: e.signataire?.slice(0, 120) || null, document_hash: e.document_hash || null, data: e.data || {} }
    const event_hash = await sha256Hex(canonical({ ...row, prev_hash: prev }))
    const { error } = await sb.from("signature_events").insert({ ...row, prev_hash: prev, event_hash })
    return error ? null : event_hash
  } catch { return null }
}
