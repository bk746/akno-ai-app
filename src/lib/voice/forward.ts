/* update75 · Codes de renvoi GSM France : le client appelle le portable de l'artisan,
   qui renvoie (ou non) vers le numéro Akno selon le réglage de la réceptionniste.
   Sources (pages d'assistance, 2026) :
   - Orange Pro : **21*n°*11# / **61*n°*11# (défaut ~20 s) ; annulation ##002# / ##21# / ##61#
   - SFR / RED : *21*n°# / *61*n°# (délai : *61*n°**20#) ; annulation #21# / #61# ; ##002# pour tout
   - Bouygues : *21*n°# / *61*n°# ; annulation #002# / #21# / #61# (le 610 reste une alternative)
   - Free Pro : *21*n°# / #21# ; Free Mobile ne publie pas les codes, on utilise la norme GSM
     (**61*n°**20# et ##002#). */

export type ForwardOperator = "orange" | "sfr" | "bouygues" | "free"
export type ForwardApplied = "off" | "direct" | "fallback" | ""
export const OPERATORS: { id: ForwardOperator; l: string }[] = [
  { id: "orange", l: "Orange" },
  { id: "sfr", l: "SFR" },
  { id: "bouygues", l: "Bouygues" },
  { id: "free", l: "Free" },
]
export const DEFAULT_OPERATOR: ForwardOperator = "orange"
export const FORWARD_DELAY_SEC = 20

export const isForwardOperator = (v: unknown): v is ForwardOperator => v === "orange" || v === "sfr" || v === "bouygues" || v === "free"
export const isForwardApplied = (v: unknown): v is Exclude<ForwardApplied, ""> => v === "off" || v === "direct" || v === "fallback"

/** 10 chiffres nationaux 0XXXXXXXXX, pour les codes MMI français. */
export function nationalFr(raw?: string | null) {
  let d = String(raw || "").replace(/\D/g, "")
  if (d.startsWith("33") && d.length >= 11) d = "0" + d.slice(2)
  return /^0[1-9]\d{8}$/.test(d) ? d : ""
}

export function sameFrNumber(a?: string | null, b?: string | null) {
  const x = nationalFr(a), y = nationalFr(b)
  return !!x && x === y
}

/** Lien tel: : le # doit être encodé (%23). L'étoile reste lisible (*). iOS peut bloquer ces liens. */
export function telHref(code: string) {
  return "tel:" + code.replace(/#/g, "%23")
}

export type ForwardStep = { id: string; label: string; hint: string; code: string; tel: string }

export function intendedForward(enabled: boolean, pickup: "direct" | "fallback"): Exclude<ForwardApplied, ""> {
  return !enabled ? "off" : pickup
}

function codes(op: ForwardOperator, dest: string) {
  switch (op) {
    case "orange":
      return { direct: `**21*${dest}*11#`, fallback: `**61*${dest}*11#`, off: "##002#", cancelDirect: "##21#", cancelFallback: "##61#" }
    case "sfr":
      return { direct: `*21*${dest}#`, fallback: `*61*${dest}**${FORWARD_DELAY_SEC}#`, off: "##002#", cancelDirect: "#21#", cancelFallback: "#61#" }
    case "bouygues":
      return { direct: `*21*${dest}#`, fallback: `*61*${dest}#`, off: "#002#", cancelDirect: "#21#", cancelFallback: "#61#" }
    case "free":
      return { direct: `*21*${dest}#`, fallback: `**61*${dest}**${FORWARD_DELAY_SEC}#`, off: "##002#", cancelDirect: "#21#", cancelFallback: "##61#" }
  }
}

export function forwardSteps(operator: ForwardOperator, dest: string, from: ForwardApplied, to: Exclude<ForwardApplied, "">): ForwardStep[] {
  const n = nationalFr(dest)
  if (to !== "off" && !n) return []
  const c = codes(operator, n || "0000000000")
  if (from === to) return []
  const step = (id: string, label: string, hint: string, code: string): ForwardStep => ({ id, label, hint, code, tel: telHref(code) })
  const activate = to === "direct"
    ? step("direct", "Composer le code", "Renvoi immédiat vers Akno. L'IA répond à votre place.", c.direct)
    : to === "fallback"
      ? step("fallback", "Composer le code", `Votre portable sonne environ ${FORWARD_DELAY_SEC} s, puis l'IA prend la demande.`, c.fallback)
      : step("off", "Composer le code", "Annule le renvoi. Votre portable sonne normalement, personne d'autre ne répond.", c.off)
  if (to === "off") return [activate]
  if (!from || from === "off") return [activate]
  const cancel = from === "direct"
    ? step("cancel", "D'abord annuler le renvoi immédiat", "Puis composez le code suivant.", c.cancelDirect)
    : step("cancel", "D'abord annuler le renvoi si vous ne décrochez pas", "Puis composez le code suivant.", c.cancelFallback)
  return [cancel, activate]
}

/** Risque de boucle si on fait sonner le portable depuis la ligne Akno alors qu'il renvoie encore vers Akno. */
export function forwardLoopRisk(opts: {
  artisanMobile?: string | null
  forwardedFrom?: string | null
  from?: string | null
  forwardApplied: ForwardApplied
}) {
  const mobile = nationalFr(opts.artisanMobile)
  if (opts.forwardApplied !== "off") return true
  if (mobile && (sameFrNumber(opts.forwardedFrom, mobile) || sameFrNumber(opts.from, mobile))) return true
  return false
}
