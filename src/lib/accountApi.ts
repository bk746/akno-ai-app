import { useEffect, useState } from "react"
import { supabase } from "./supabase"

/* update45 · appels authentifiés aux fonctions serveur (compte, abonnement, factures). */
export type ApiRes = { ok: boolean; status: number; error?: string; [k: string]: unknown }

export async function api(path: "/api/account" | "/api/devis" | "/api/booking", body: Record<string, unknown>): Promise<ApiRes> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return { ok: false, status: 401, error: "Non authentifié." }
  try {
    const res = await fetch(path, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const payload = await res.json().catch(() => ({})) as Record<string, unknown>
    return { ...payload, ok: res.ok && payload.ok !== false, status: res.status, error: typeof payload.error === "string" ? payload.error : res.ok ? undefined : "Service indisponible." }
  } catch {
    return { ok: false, status: 0, error: "Connexion impossible. Vérifiez votre réseau." }
  }
}

export type Plan = "bureau" | "clients"
export type Entitlements = {
  billingEnabled: boolean; access: boolean; status: "trial" | "active" | "past_due" | "expired" | "free" | "none"; plan: Plan | null; reception: boolean
  features: string[]; trialEndsAt: string | null; periodEnd: string | null; cancelAtPeriodEnd: boolean; hasStripeCustomer: boolean
  /** update46 · essai de 30 jours encore possible (jamais abonné) */
  trialEligible?: boolean
  /** update48 · compte avec plan_override : rien n'est verrouillé dans l'interface */
  override?: boolean
  quotas: { devis_drafts: number; voice_sessions_day: number; voice_minutes: number; sms: number }
}
export type AccountStatus = {
  entitlements: Entitlements
  usage: { voice_minutes: number; devis_drafts: number; sms: number; voice_sessions_today: number }
  billing: { enabled: boolean; prices: { bureau: boolean; clients: boolean; reception: boolean }; annual?: boolean; trial_days: number }
  integrations: { calcom: boolean; calcom_global: boolean; sms: boolean; resend: boolean; twilio_number: string; forward_to: string }
}

let cache: AccountStatus | null = null
let settled = false
let inflight: Promise<void> | null = null
const subs = new Set<() => void>()

export function reloadAccount() {
  inflight = (async () => {
    const r = await api("/api/account", { action: "status" })
    if (r.ok && r.entitlements) cache = r as unknown as AccountStatus
    else if (!cache) {
      // Fonction serveur absente (ex. `vite` sans API) : on reste en mode ouvert, comme avant l'update44.
      cache = null
    }
    inflight = null
    settled = true
    subs.forEach(f => f())
  })()
  return inflight
}

/** État du compte (offre, droits, usage). null tant que non chargé ou si le serveur ne répond pas. */
export function useAccount() {
  const [, tick] = useState(0)
  useEffect(() => {
    const f = () => tick(x => x + 1)
    subs.add(f)
    if (!cache && !inflight) void reloadAccount()
    const r = () => void reloadAccount()
    addEventListener("akno-account-refresh", r)
    return () => { subs.delete(f); removeEventListener("akno-account-refresh", r) }
  }, [])
  return cache
}

export const canUse = (a: AccountStatus | null, f: string) => !a || !a.entitlements.billingEnabled || (a.entitlements.access && a.entitlements.features.includes(f))

/* update48 · droits appliqués à l'interface.
   Tout reste ouvert : compte non chargé / serveur absent, paiement désactivé, ou plan_override. */
export type Rights = { ready: boolean; has: (f: string) => boolean; reception: boolean; clients: boolean; canUpgrade: boolean; plan: Plan | null; annual: boolean }
export function rights(a: AccountStatus | null): Rights {
  const e = a?.entitlements
  const open = !e || !e.billingEnabled || !!e.override
  const has = (f: string) => open || (!!e && e.access && e.features.includes(f))
  // Montée en gamme directe : abonnement Stripe en essai ou actif (pas d'override, pas d'impayé)
  const canUpgrade = !!e && e.billingEnabled && !e.override && e.hasStripeCustomer && (e.status === "trial" || e.status === "active") && !e.cancelAtPeriodEnd
  return { ready: settled, has, reception: has("reception"), clients: has("avis") && has("leads"), canUpgrade, plan: e?.plan ?? null, annual: !!a?.billing.annual }
}
export function useRights() { return rights(useAccount()) }
export const accountSettled = () => settled

/** Ouvre l'écran « Ajouter l'option » / « Passer en Clients » (monté une fois dans l'app). */
export type UpgradeKind = "reception" | "clients"
export const openUpgrade = (kind: UpgradeKind) => dispatchEvent(new CustomEvent("akno-upgrade", { detail: kind }))
