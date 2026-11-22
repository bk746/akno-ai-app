/* update71 · Chaîne devis → acompte → chantier → facture → encaissement, côté app.
   Une seule « prochaine étape » à la fois, calculée ici (fonctions pures, testées par scripts/test-chaine.ts). */
import { useCallback, useEffect, useState } from "react"
import { supabase } from "./supabase"
import { api } from "./accountApi"

export type ChainFact = { id: string; numero?: string | null; type: string; statut: string; total_ttc: number; acompte_deduit?: number | null; retenue_garantie_pct?: number | null; avancement_pct?: number | null; token?: string | null; date_echeance?: string | null }
export type ChainChantier = { id: string; start_date?: string | null; status?: string | null; lat?: number | null }
export type ChainInput = { status: string; sentAt?: string; openedAt?: string; factures: ChainFact[]; chantier?: ChainChantier | null; acomptePct?: number }
export type NextKey = "send" | "wait_sign" | "refused" | "lost" | "acompte_create" | "acompte_send" | "acompte_wait" | "facture_create" | "facture_send" | "facture_wait" | "done"
export type Next = { key: NextKey; title: string; text: string; verb?: string; factureId?: string }

export const STEPS = ["Devis", "Signé", "Acompte", "Chantier", "Facturé", "Payé"] as const
const isLive = (f: ChainFact) => !!f.numero && f.statut !== "annulee"
const isFinal = (f: ChainFact) => f.type === "facture" || f.type === "solde" || (f.type === "situation" && Number(f.avancement_pct) >= 100)
const isBill = (f: ChainFact) => f.type === "facture" || f.type === "solde" || f.type === "situation"

export function chainProgress(c: ChainInput): { done: boolean[]; current: number; next: Next; sub: string[] } {
  const st = c.status, sent = ["env", "sans", "val", "ref", "perdu"].includes(st), signed = st === "val"
  const fs = c.factures.filter(f => f.type !== "avoir" && f.statut !== "annulee")
  const acompte = fs.find(f => f.type === "acompte")
  const bills = fs.filter(isBill), liveBills = bills.filter(isLive)
  const fullyBilled = liveBills.some(isFinal)
  const unpaid = liveBills.filter(f => f.statut !== "payee")
  const paid = fullyBilled && !unpaid.length
  const acompteDone = !!acompte && isLive(acompte) && acompte.statut === "payee"
  const skipAcompte = !acompte && (fullyBilled || (c.acomptePct ?? 30) <= 0)
  const done = [sent, signed, signed && (acompteDone || skipAcompte), signed && !!c.chantier, fullyBilled, paid]
  const sub = [
    st === "brouillon" || st === "aval" || st === "att" ? "Brouillon" : c.openedAt && st === "env" ? "Ouvert" : sent ? "Envoyé" : "",
    st === "ref" ? "Refusé" : st === "perdu" ? "Perdu" : signed ? "Oui" : "",
    acompte ? (acompteDone ? "Payé" : isLive(acompte) ? "Envoyé" : "Prêt") : skipAcompte && signed ? "Aucun" : "",
    c.chantier ? (c.chantier.start_date ? "Planifié" : "Créé") : "",
    fullyBilled ? "Oui" : liveBills.length ? "En partie" : "",
    paid ? "Oui" : "",
  ]
  let next: Next
  if (!sent) next = { key: "send", title: "Envoyez le devis au client", text: "Il le reçoit avec un lien pour le lire et le signer sur son téléphone.", verb: "Envoyer au client" }
  else if (st === "ref") next = { key: "refused", title: "Le client a refusé ce devis", text: "Vous pouvez le modifier et lui proposer une nouvelle version." }
  else if (st === "perdu") next = { key: "lost", title: "Devis perdu", text: "Pas de signature 30 jours après l'envoi. Relancez le client ou faites un nouveau devis." }
  else if (!signed) next = { key: "wait_sign", title: c.openedAt ? "Le client a ouvert le devis" : "En attente de signature", text: "Akno relance le client automatiquement. Vous serez prévenu dès qu'il signe." }
  else if (acompte && !isLive(acompte)) next = { key: "acompte_send", title: "Demandez l'acompte", text: `La facture d'acompte est prête (${Math.round(c.acomptePct ?? 30)} %). Vérifiez-la puis envoyez-la.`, verb: "Envoyer l'acompte", factureId: acompte.id }
  else if (!acompte && !skipAcompte && !liveBills.length) next = { key: "acompte_create", title: "Demandez un acompte", text: `Le devis est signé. Demandez ${Math.round(c.acomptePct ?? 30)} % avant de commencer, ou facturez directement.`, verb: "Demander l'acompte" }
  else {
    const draft = bills.find(f => !isLive(f))
    if (draft) next = { key: "facture_send", title: "Envoyez la facture", text: "Elle est prête. Une fois envoyée, elle ne peut plus être modifiée (on fait un avoir).", verb: "Envoyer la facture", factureId: draft.id }
    else if (!fullyBilled) next = { key: "facture_create", title: liveBills.length ? "Facturez la suite des travaux" : "Travaux terminés ? Facturez", text: acompte ? "L'acompte est déduit automatiquement." : "La facture reprend toutes les lignes du devis.", verb: "Transformer en facture" }
    else if (unpaid.length) next = { key: "facture_wait", title: "En attente de paiement", text: "Akno relance le client automatiquement si la date est dépassée.", verb: "Voir la facture", factureId: unpaid[0].id }
    else if (acompte && isLive(acompte) && acompte.statut !== "payee") next = { key: "acompte_wait", title: "Acompte en attente", text: "Marquez-le payé dès réception.", verb: "Voir l'acompte", factureId: acompte.id }
    else next = { key: "done", title: "Tout est réglé", text: "Devis signé, facturé et payé. Rien d'autre à faire." }
  }
  if (next.key === "facture_create" && acompte && isLive(acompte) && acompte.statut !== "payee" && !liveBills.length) next = { ...next, key: "acompte_wait", title: "Acompte envoyé, en attente de paiement", text: "Dès qu'il est réglé, marquez-le payé. Vous pourrez ensuite facturer les travaux.", verb: "Voir l'acompte", factureId: acompte.id }
  const current = done.findIndex(x => !x)
  return { done, current: current < 0 ? STEPS.length : current, next, sub }
}

/** Factures et chantier liés à un devis (lecture seule ; renvoie des listes vides si une table manque). */
export function useChain(devisId: string | undefined, enabled = true) {
  const [factures, setFactures] = useState<ChainFact[]>([]), [chantier, setChantier] = useState<ChainChantier | null>(null), [ready, setReady] = useState(false)
  const load = useCallback(async () => {
    if (!devisId || !/^[0-9a-f-]{36}$/i.test(devisId)) { setReady(true); return }
    const [f, c] = await Promise.all([
      supabase.from("factures").select("id, numero, type, statut, total_ttc, acompte_deduit, retenue_garantie_pct, avancement_pct, token, date_echeance").eq("devis_id", devisId).order("created_at"),
      supabase.from("chantiers").select("id, start_date, status, lat").eq("devis_id", devisId).limit(1),
    ])
    setFactures(((f.data || []) as ChainFact[])); setChantier(((c.data || [])[0] as ChainChantier) || null); setReady(true)
  }, [devisId])
  useEffect(() => { if (enabled) void load() }, [load, enabled])
  return { factures, chantier, ready, reload: load }
}

export const sendDevisSms = (devisId: string, phone: string) => api("/api/devis", { action: "send_sms", devis_id: devisId, phone })
export const sendFactureSms = (factureId: string, phone: string) => api("/api/devis", { action: "facture_send_sms", facture_id: factureId, phone })
export const connectStatus = () => api("/api/account", { action: "connect_status" })
export const connectOnboard = () => api("/api/account", { action: "connect_onboard" })
/** Paiement en ligne visible dans l'app seulement si VITE_STRIPE_CONNECT=1 (désactivé par défaut). */
export const connectUi = () => import.meta.env.VITE_STRIPE_CONNECT === "1"
export const payLink = (origin: string, token?: string | null) => token ? `${origin}/payer/${token}` : ""
export const looksPhone = (s: string) => /^(\+33|0)[67]\d{8}$/.test(s.replace(/[\s.-]/g, "")) || /^\+\d{10,14}$/.test(s.replace(/[\s.-]/g, ""))
