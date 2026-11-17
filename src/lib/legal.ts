/** Version des CGV acceptée à l'inscription (à changer quand les CGV changent : les comptes la réaccepteront). */
export const CGV_VERSION = "2026-11"

/** Informations de l'éditeur d'Akno, affichées dans les pages légales.
    À COMPLÉTER par Keryan (ou via les variables VITE_LEGAL_* sur Vercel). */
const e = import.meta.env
export const EDITOR = {
  name: (e.VITE_LEGAL_NAME as string) || "[Raison sociale à compléter]",
  form: (e.VITE_LEGAL_FORM as string) || "[Forme juridique et capital à compléter]",
  address: (e.VITE_LEGAL_ADDRESS as string) || "[Adresse du siège à compléter]",
  siret: (e.VITE_LEGAL_SIRET as string) || "[SIRET à compléter]",
  tva: (e.VITE_LEGAL_TVA as string) || "[N° TVA à compléter]",
  director: (e.VITE_LEGAL_DIRECTOR as string) || "[Directeur de la publication à compléter]",
  email: (e.VITE_LEGAL_EMAIL as string) || (e.VITE_SUPPORT_EMAIL as string) || "[E-mail de contact à compléter]",
  dpo: (e.VITE_LEGAL_DPO_EMAIL as string) || (e.VITE_LEGAL_EMAIL as string) || "[E-mail RGPD à compléter]",
}
