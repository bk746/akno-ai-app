/** Version des CGV acceptée à l'inscription (à changer quand les CGV changent : les comptes la réaccepteront). */
export const CGV_VERSION = "2026-11"

/** Informations de l'éditeur d'Akno, affichées dans les pages légales.
    update70 : à renseigner via les variables VITE_LEGAL_* sur Vercel (et pour le build natif). Tant qu'elles sont vides,
    les pages restent présentables : la ligne correspondante n'est simplement pas affichée (aucun « [à compléter] »). */
const e = (import.meta.env || {}) as Record<string, string | undefined>
const v = (x?: string) => (x || "").trim()
export const EDITOR = {
  name: v(e.VITE_LEGAL_NAME) || "Akno",
  form: v(e.VITE_LEGAL_FORM),
  address: v(e.VITE_LEGAL_ADDRESS),
  siret: v(e.VITE_LEGAL_SIRET),
  tva: v(e.VITE_LEGAL_TVA),
  director: v(e.VITE_LEGAL_DIRECTOR),
  email: v(e.VITE_LEGAL_EMAIL) || v(e.VITE_SUPPORT_EMAIL),
  dpo: v(e.VITE_LEGAL_DPO_EMAIL) || v(e.VITE_LEGAL_EMAIL) || v(e.VITE_SUPPORT_EMAIL),
}
/** Contact affiché quand aucune adresse e-mail n'est configurée. */
export const CONTACT_FALLBACK = "le support Akno (dans l'app : Réglages › Aide & support)"
export const contactRgpd = () => EDITOR.dpo || CONTACT_FALLBACK
