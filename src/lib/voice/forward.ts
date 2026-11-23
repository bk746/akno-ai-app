/* update75 · Codes de renvoi GSM France : le client appelle le portable de l'artisan,
   qui renvoie (ou non) vers le numéro Akno selon le réglage de la réceptionniste.
   Orange (2026) : **21*+33…# / **61*+33…**DÉLAI# — pas de *11# sur le fallback.
   Réceptionniste désactivée : on coupe le renvoi qui était en place (##61# si « si je ne décroche pas », ##21# si « à ma place ») ;
   réactivée : on le remet (**61*<numéro Akno>**10#). Vérification : *#61# (ou *#21#). */

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

/** label = titre de l'étape ; cta = texte du bouton qui ouvre le composeur avec le code. */
export type ForwardStep = { id: string; label: string; cta: string; hint: string; code: string; tel: string }

export function intendedForward(enabled: boolean, pickup: "direct" | "fallback"): Exclude<ForwardApplied, ""> {
  return !enabled ? "off" : pickup
}

function codes(op: ForwardOperator, destRaw: string) {
  const d = destForCodes(destRaw) || destRaw
  switch (op) {
    case "orange":
      return { direct: `**21*${d}#`, fallback: `**61*${d}**${FORWARD_DELAY_SEC}#`, cancelDirect: "##21#", cancelFallback: "##61#" }
    case "sfr":
      return { direct: `*21*${d}#`, fallback: `*61*${d}**${FORWARD_DELAY_SEC}#`, cancelDirect: "#21#", cancelFallback: "#61#" }
    case "bouygues":
      return { direct: `*21*${d}#`, fallback: `*61*${d}**${FORWARD_DELAY_SEC}#`, cancelDirect: "#21#", cancelFallback: "#61#" }
    case "free":
      return { direct: `*21*${d}#`, fallback: `**61*${d}**${FORWARD_DELAY_SEC}#`, cancelDirect: "#21#", cancelFallback: "##61#" }
  }
}

/** from = dernier renvoi confirmé sur le portable ("" = inconnu) ; to = renvoi voulu ; pickup = mode réglé dans l'app
    (sert à savoir quel renvoi couper quand rien n'est confirmé). */
export function forwardSteps(operator: ForwardOperator, dest: string, from: ForwardApplied, to: Exclude<ForwardApplied, "">, pickup: "direct" | "fallback" = "fallback"): ForwardStep[] {
  const d = destForCodes(dest)
  if (to !== "off" && !d) return []
  const c = codes(operator, dest)
  if (from === to) return []
  const op = OPERATORS.find(o => o.id === operator)?.l || "opérateur"
  const step = (id: string, label: string, cta: string, hint: string, code: string): ForwardStep => ({ id, label, cta, hint, code, tel: telHref(code) })
  if (to === "off") {
    // On coupe le renvoi qui était en place : celui confirmé, sinon celui du mode réglé.
    const direct = from === "direct" || (from !== "fallback" && pickup === "direct")
    return [step("off", "Le renvoi vers Akno est encore actif", `Couper aussi le renvoi ${op}`, "Tant que ce code n'est pas composé, vos appels partent encore vers Akno. Ensuite, votre portable sonne normalement.", direct ? c.cancelDirect : c.cancelFallback)]
  }
  const activate = to === "direct"
    ? step("direct", "Renvoi vers Akno à remettre", "Réactiver le renvoi", "Renvoi immédiat vers Akno. L'IA répond à votre place.", c.direct)
    : step("fallback", "Renvoi vers Akno à remettre", "Réactiver le renvoi", `Votre portable sonne environ ${FORWARD_DELAY_SEC} s, puis l'IA prend la demande.`, c.fallback)
  if (!from || from === "off") return [activate]
  const cancel = from === "direct"
    ? step("cancel", "D'abord annuler le renvoi immédiat", "Annuler l'ancien renvoi", "Puis composez le code suivant.", c.cancelDirect)
    : step("cancel", "D'abord annuler le renvoi si vous ne décrochez pas", "Annuler l'ancien renvoi", "Puis composez le code suivant.", c.cancelFallback)
  return [cancel, activate]
}

/** Code d'interrogation : le téléphone affiche si le renvoi est actif et vers quel numéro (identique chez tous les opérateurs). */
export function forwardCheck(pickup: "direct" | "fallback" = "fallback") {
  const code = pickup === "direct" ? "*#21#" : "*#61#"
  return { code, tel: telHref(code) }
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