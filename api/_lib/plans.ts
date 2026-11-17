import type { SupabaseClient } from "@supabase/supabase-js"
import { env } from "./mail.js"

/** Offres Akno. Les prix sont indicatifs : la vérité est dans Stripe (STRIPE_PRICE_*). */
export type PlanId = "bureau" | "clients"
export type Feature =
  | "devis" | "relances_devis" | "factures" | "relances_impayes" | "conformite" | "agenda"
  | "avis" | "leads" | "rapport_mensuel" | "sms" | "reception"

export const PLAN_FEATURES: Record<PlanId, Feature[]> = {
  bureau: ["devis", "relances_devis", "factures", "relances_impayes", "conformite", "agenda", "sms"],
  clients: ["devis", "relances_devis", "factures", "relances_impayes", "conformite", "agenda", "sms", "avis", "leads", "rapport_mensuel"],
}

export const PLAN_LABEL: Record<PlanId, string> = { bureau: "Akno Bureau", clients: "Akno Clients + Bureau" }

/** Quotas mensuels (0 = illimité). */
export const QUOTAS = {
  trial: { devis_drafts: 30, voice_sessions_day: 30, voice_minutes: 60, sms: 50 },
  bureau: { devis_drafts: 300, voice_sessions_day: 20, voice_minutes: 0, sms: 200 },
  clients: { devis_drafts: 600, voice_sessions_day: 20, voice_minutes: 0, sms: 500 },
  reception: { voice_minutes: 100, voice_sessions_day: 120 },
} as const

export const TRIAL_DAYS = () => Math.max(1, Number(env("STRIPE_TRIAL_DAYS") || 30) || 30)

export type Entitlements = {
  billingEnabled: boolean
  access: boolean
  status: "trial" | "active" | "past_due" | "expired" | "free"
  plan: PlanId | null
  reception: boolean
  features: Feature[]
  trialEndsAt: string | null
  periodEnd: string | null
  cancelAtPeriodEnd: boolean
  hasStripeCustomer: boolean
  quotas: { devis_drafts: number; voice_sessions_day: number; voice_minutes: number; sms: number }
}

const ALL: Feature[] = [...PLAN_FEATURES.clients, "reception"]

export function billingEnabled() {
  return !!(env("STRIPE_SECRET_KEY") || "").trim()
}

type SubRow = {
  plan?: string | null; reception_option?: boolean | null; status?: string | null; trial_end?: string | null
  current_period_end?: string | null; cancel_at_period_end?: boolean | null; plan_override?: string | null
  override_reception?: boolean | null; stripe_customer_id?: string | null
}

function asPlan(x?: string | null): PlanId | null {
  return x === "bureau" || x === "clients" ? x : null
}

/** Droits d'un artisan. Tant que Stripe n'est pas configuré, tout est ouvert (comportement d'avant l'update44). */
export function computeEntitlements(sub: SubRow | null, artisanCreatedAt?: string | null, now = new Date()): Entitlements {
  const enabled = billingEnabled()
  const base = { billingEnabled: enabled, hasStripeCustomer: !!sub?.stripe_customer_id, cancelAtPeriodEnd: !!sub?.cancel_at_period_end, periodEnd: sub?.current_period_end || null }
  const override = asPlan(sub?.plan_override)
  if (!enabled) {
    return { ...base, access: true, status: "free", plan: override || "clients", reception: true, features: ALL, trialEndsAt: null, quotas: { ...QUOTAS.clients, voice_minutes: QUOTAS.reception.voice_minutes, voice_sessions_day: QUOTAS.reception.voice_sessions_day } }
  }
  if (override) {
    const reception = !!sub?.override_reception
    return { ...base, access: true, status: "active", plan: override, reception, features: reception ? [...PLAN_FEATURES[override], "reception"] : PLAN_FEATURES[override], trialEndsAt: null, quotas: quotasFor(override, reception) }
  }
  const plan = asPlan(sub?.plan)
  const st = String(sub?.status || "")
  if (plan && (st === "active" || st === "trialing" || st === "past_due")) {
    const reception = !!sub?.reception_option
    return {
      ...base, access: true, status: st === "trialing" ? "trial" : st === "past_due" ? "past_due" : "active", plan, reception,
      features: reception ? [...PLAN_FEATURES[plan], "reception"] : PLAN_FEATURES[plan],
      trialEndsAt: st === "trialing" ? sub?.trial_end || null : null,
      quotas: quotasFor(plan, reception),
    }
  }
  // Essai interne de 30 jours sans carte, compté depuis la création du compte
  const created = artisanCreatedAt ? new Date(artisanCreatedAt) : now
  const end = new Date(created.getTime() + TRIAL_DAYS() * 86400e3)
  if (end > now && !st) {
    return { ...base, access: true, status: "trial", plan: "clients", reception: true, features: ALL, trialEndsAt: end.toISOString(), quotas: { ...QUOTAS.trial } }
  }
  return { ...base, access: false, status: "expired", plan: plan || null, reception: false, features: [], trialEndsAt: end.toISOString(), quotas: { devis_drafts: 0, voice_sessions_day: 0, voice_minutes: 0, sms: 0 } }
}

function quotasFor(plan: PlanId, reception: boolean) {
  const q = QUOTAS[plan]
  return {
    devis_drafts: q.devis_drafts,
    sms: q.sms,
    voice_minutes: reception ? QUOTAS.reception.voice_minutes : QUOTAS.trial.voice_minutes,
    voice_sessions_day: reception ? QUOTAS.reception.voice_sessions_day : q.voice_sessions_day,
  }
}

/** Lit l'abonnement (table protégée, lecture autorisée à l'artisan) et calcule les droits. */
export async function loadEntitlements(sb: SupabaseClient, artisanId: string): Promise<Entitlements> {
  const [{ data: sub }, { data: artisan }] = await Promise.all([
    sb.from("subscriptions").select("plan, reception_option, status, trial_end, current_period_end, cancel_at_period_end, plan_override, override_reception, stripe_customer_id").eq("artisan_id", artisanId).maybeSingle(),
    sb.from("artisans").select("created_at").eq("id", artisanId).maybeSingle(),
  ])
  return computeEntitlements((sub || null) as SubRow | null, (artisan as { created_at?: string } | null)?.created_at)
}

export function can(e: Entitlements, f: Feature) {
  return e.access && e.features.includes(f)
}

export function upgradeError(f: Feature, e: Entitlements) {
  if (!e.access) return "Votre période d'essai est terminée. Choisissez une offre dans Réglages → Abonnement pour continuer."
  const need = f === "reception" ? "l'option Réceptionniste IA" : PLAN_FEATURES.bureau.includes(f) ? "l'offre Akno Bureau" : "l'offre Akno Clients + Bureau"
  return `Cette fonctionnalité est incluse dans ${need}. Rendez-vous dans Réglages → Abonnement.`
}
