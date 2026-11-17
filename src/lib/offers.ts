/* update46 · Offres Akno affichées dans l'app (choix d'offre, récapitulatif).
   Les prix facturés viennent de Stripe (STRIPE_PRICE_*) ; ces montants HT servent à l'affichage et doivent rester alignés.
   Fonctionnalités et quotas : repris du code (api/_lib/plans.ts → PLAN_FEATURES, QUOTAS). Rien d'inventé. */
import type { Plan } from "./accountApi"

export type Interval = "month" | "year"
export const ANNUAL_DISCOUNT = .2
export const TVA = .2
export const RECEPTION = { name: "Réceptionniste IA", monthly: 50, minutes: 100, desc: "Décroche, qualifie, prend RDV et prépare le devis." }

export type Offer = { id: Plan; name: string; full: string; monthly: number; tagline: string; items: { t: string; k?: "rec" | "dev" | "rel" | "ag" }[]; quotas: { devis: number; sms: number } }
export const OFFERS: Offer[] = [
  {
    id: "bureau", name: "Bureau", full: "Akno Bureau", monthly: 89, tagline: "Devis, factures et relances, sans paperasse.",
    items: [
      { t: "Devis IA conformes, envoi et signature en ligne", k: "dev" },
      { t: "Relances de devis automatiques", k: "rel" },
      { t: "Factures, acomptes, avoirs et relances d'impayés", k: "dev" },
      { t: "Dossier de conformité (Urssaf, Kbis, décennale)" },
      { t: "Agenda et rappels SMS", k: "ag" },
    ],
    quotas: { devis: 300, sms: 200 },
  },
  {
    id: "clients", name: "Clients + Bureau", full: "Akno Clients + Bureau", monthly: 199, tagline: "Tout Bureau, plus vos avis et vos demandes entrantes.",
    items: [
      { t: "Tout Akno Bureau" },
      { t: "Demandes d'avis Google automatiques", k: "rel" },
      { t: "Formulaire du site → demandes dans Akno" },
      { t: "Rapport mensuel par e-mail" },
      { t: "Quotas SMS et devis plus élevés" },
    ],
    quotas: { devis: 600, sms: 500 },
  },
]

const round2 = (n: number) => Math.round(n * 100) / 100
/** Prix annuel HT (12 mois -20 %). */
export const yearly = (monthly: number) => round2(monthly * 12 * (1 - ANNUAL_DISCOUNT))
/** Équivalent mensuel HT selon l'intervalle. */
export const perMonth = (monthly: number, i: Interval) => i === "year" ? round2(yearly(monthly) / 12) : monthly
/** Montant HT prélevé à chaque échéance. */
export const perPeriod = (monthly: number, i: Interval) => i === "year" ? yearly(monthly) : monthly

export const eur = (n: number, dec: "auto" | 2 = "auto") => n.toLocaleString("fr-FR", { minimumFractionDigits: dec === 2 || n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + " €"
export const dateFr = (d: Date, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }) => d.toLocaleDateString("fr-FR", { ...opts, timeZone: "Europe/Paris" })
