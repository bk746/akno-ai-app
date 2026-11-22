/* update71 · Données simulées de la chaîne devis → facture (comme le compte de démo : devis n° 9, facture F-2026-0003). */
import { UID } from "./pw-harness.mjs"
const iso = (d) => new Date(Date.now() - d * 86400e3).toISOString()
const ymd = (d) => iso(d).slice(0, 10)
export const LIGNES = [
  { k: "sec", l: "Plomberie", q: 0, pu: 0 },
  { l: "Dépose évier et raccordements existants", q: 1, u: "forfait", pu: 180, tv: 10 },
  { l: "Fourniture et pose mitigeur cuisine", d: "Mitigeur bec haut, finition inox brossé", q: 1, u: "u", pu: 245, tv: 10 },
  { l: "Alimentation lave-vaisselle et évacuation", q: 1, u: "forfait", pu: 160, tv: 10 },
  { k: "sec", l: "Électricité", q: 0, pu: 0 },
  { l: "Création circuit plaque de cuisson 32 A", q: 1, u: "u", pu: 390, tv: 10 },
  { l: "Prises plan de travail", q: 4, u: "u", pu: 68, tv: 10 },
  { l: "Isolation sous rampants (laine de bois)", q: 12, u: "m²", pu: 42, tv: 5.5 },
  { l: "Fourniture hotte décorative", q: 1, u: "u", pu: 520, tv: 20 },
]
const HT = 180 + 245 + 160 + 390 + 4 * 68 + 12 * 42 + 520 // 2271
const TVA = Math.round(((180 + 245 + 160 + 390 + 272) * .10 + 504 * .055 + 520 * .20) * 100) / 100
export const TOTALS = { ht: HT, tva: TVA, ttc: Math.round((HT + TVA) * 100) / 100 }
export const DEVIS9 = { id: "d9000000-0000-4000-8000-000000000009", artisan_id: UID, numero: "9", client_nom: "Isabelle Fournier", client_email: "isabelle.fournier@example.com", client_telephone: "06 39 98 00 09", client_adresse: "14 avenue d'Albigny, 74000 Annecy",
  objet: "Cuisine : plomberie et électricité", statut: "brouillon", lignes: LIGNES, total_ht: TOTALS.ht, total_ttc: TOTALS.ttc, tva_taux: 10, token: "7c1d2e3f-0000-4000-8000-00000000d009", created_at: iso(2) }
export const FACT3 = { id: "f3000000-0000-4000-8000-000000000003", artisan_id: UID, devis_id: null, numero: "F-2026-0003", type: "facture", statut: "emise", client_nom: "Isabelle Fournier", client_email: "isabelle.fournier@example.com",
  client_telephone: "06 39 98 00 09", client_adresse: "14 avenue d'Albigny, 74000 Annecy", adresse_chantier: "14 avenue d'Albigny, 74000 Annecy", objet: "Cuisine : plomberie et électricité",
  lignes: LIGNES.filter(l => l.k !== "sec").map(({ l, d, q, u, pu, tv }) => ({ l: d ? `${l}\n${d}` : l, q, u, pu, tv })), total_ht: TOTALS.ht, total_tva: TOTALS.tva, total_ttc: TOTALS.ttc, acompte_deduit: 0,
  date_emission: ymd(3), date_echeance: ymd(-27), delai_paiement_jours: 30, token: "8d2e3f40-0000-4000-8000-00000000f003", relances_off: false, created_at: iso(3) }
export const chainTables = (over = {}) => ({ devis: [{ ...DEVIS9, ...(over.devis || {}) }], factures: over.factures || [{ ...FACT3 }], chantiers: over.chantiers || [], facture_relances: [], signature_events: over.events || [], payment_accounts: [] })
export const PROFILE71 = { entreprise_nom: "Alpes Rénovation Annecy", entreprise_siret: "99999900600003", entreprise_adresse: "3 rue Royale", entreprise_cp_ville: "74000 Annecy", iban: "FR76 3000 6000 0112 3456 7890 189", acompte_pct: 30, relances_auto: true }
