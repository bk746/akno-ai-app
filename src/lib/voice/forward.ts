/* update75 · Codes de renvoi GSM France : le client appelle le portable de l'artisan,
   qui renvoie (ou non) vers le numéro Akno selon le réglage de la réceptionniste.
   Orange (2026) : **21*+33…# / **61*+33…**DÉLAI# — pas de *11# sur le fallback. */

export type ForwardOperator = "orange" | "sfr" | "bouygues" | "free"
export type ForwardApplied = "off" | "direct" | "fallback" | ""
export const OPERATORS: { id: ForwardOperator; l: string }[] = [
  { id: "orange", l: "Orange" },
  { id: "sfr", l: "SFR" },
  { id: "bouygues", l: "Bouygues" },
  { id: "free", l: "Free" },
]
export const DEFAULT_OPERATOR: ForwardOperator = "orange"
export const FORWARD_DELAY_SEC = 10

export const isForwardOperator = (v: unknown): v is ForwardOperator => v === "orange" || v === "sfr" || v === "bouygues" || v === "free"
export const isForwardApplied = (v: unknown): v is Exclude<ForwardApplied, ""> => v === "off" || v === "direct" || v === "fallback"

/** 10 chiffres nationaux 0XXXXXXXXX, pour comparaisons et affichage. */
export function nationalFr(raw?: string | null) {
  let d = String(raw || "").replace(/\D/g, "")
  if (d.startsWith("33") && d.length >= 11) d = "0" + d.slice(2)
  return /^0[1-9]\d{8}$/.test(d) ? d : ""
}

/** Destination MMI en E.164 (+33XXXXXXXXX) — obligatoire pour Orange et recommandé ailleurs. */
export function destForCodes(raw?: string | null) {
  const n = nationalFr(raw)
  return n ? `+33${n.slice(1)}` : String(raw || "").replace(/\s/g, "").startsWith("+33") ? String(raw).replace(/\s/g, "") : ""
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

function codes(op: ForwardOperator, destRaw: string) {
  const d = destForCodes(destRaw) || destRaw
  switch (op) {
    case "orange":
      return { direct: `**21*${d}#`, fallback: `**61*${d}**${FORWARD_DELAY_SEC}#`, off: "##002#", cancelDirect: "##21#", cancelFallback: "##61#" }
    case "sfr":
      return { direct: `*21*${d}#`, fallback: `*61*${d}**${FORWARD_DELAY_SEC}#`, off: "##002#", cancelDirect: "#21#", cancelFallback: "#61#" }
    case "bouygues":
      return { direct: `*21*${d}#`, fallback: `*61*${d}**${FORWARD_DELAY_SEC}#`, off: "#002#", cancelDirect: "#21#", cancelFallback: "#61#" }
    case "free":
      return { direct: `*21*${d}#`, fallback: `**61*${d}**${FORWARD_DELAY_SEC}#`, off: "##002#", cancelDirect: "#21#", cancelFallback: "##61#" }
  }
}

export function forwardSteps(operator: ForwardOperator, dest: string, from: ForwardApplied, to: Exclude<ForwardApplied, "">): ForwardStep[] {
  const d = destForCodes(dest)
  if (to !== "off" && !d) return []
  const c = codes(operator, dest)
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