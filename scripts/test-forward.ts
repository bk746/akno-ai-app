/* update75 · Codes de renvoi GSM selon le mode et l'opérateur, lien tel:, risque de boucle.
   Usage : npm run test:forward (aucun appel réseau). */
import { DEFAULT_OPERATOR, FORWARD_DELAY_SEC, destForCodes, forwardCheck, forwardLoopRisk, forwardSteps, intendedForward, nationalFr, telHref } from "../src/lib/voice/forward"
import { normalizeConfig, serializeConfig } from "../src/lib/voice/receptionist"

let ok = 0, ko = 0
const T = (name: string, pass: boolean) => { pass ? ok++ : ko++; console.log(`${pass ? "✔" : "✘"} ${name}`) }

const dest = "+33973057824"
const e164 = "+33973057824"
const n = "0973057824"
T("numéro Akno en 10 chiffres nationaux", nationalFr(dest) === n && nationalFr("09 73 05 78 24") === n)
T("dest MMI en +33", destForCodes(dest) === e164 && destForCodes(n) === e164)

T("IA coupée → intention off", intendedForward(false, "direct") === "off" && intendedForward(false, "fallback") === "off")
T("IA on + à ma place → direct", intendedForward(true, "direct") === "direct")
T("IA on + si je ne décroche pas → fallback", intendedForward(true, "fallback") === "fallback")

// Réceptionniste désactivée : « Couper aussi le renvoi Orange » avec le code du renvoi qui était en place.
const offO = forwardSteps("orange", dest, "", "off", "fallback")
T("Orange, IA désactivée (si je ne décroche pas) : un seul code ##61#", offO.length === 1 && offO[0].code === "##61#")
T("bouton « Couper aussi le renvoi Orange »", offO[0].cta === "Couper aussi le renvoi Orange" && forwardSteps("sfr", dest, "", "off")[0].cta === "Couper aussi le renvoi SFR")
T("lien tel: encode chaque dièse en %23", offO[0].tel === "tel:%23%2361%23")
T("Orange, IA désactivée après un renvoi confirmé « si je ne décroche pas » : ##61#", forwardSteps("orange", dest, "fallback", "off", "direct")[0].code === "##61#")
T("Orange, IA désactivée (à ma place) : ##21#", forwardSteps("orange", dest, "direct", "off")[0].code === "##21#" && forwardSteps("orange", dest, "", "off", "direct")[0].code === "##21#")
T("renvoi déjà coupé et confirmé : aucun code", forwardSteps("orange", dest, "off", "off").length === 0)

// Réceptionniste réactivée : « Réactiver le renvoi » avec **61*<numéro Akno>**10#.
const onO = forwardSteps("orange", dest, "", "fallback", "fallback")
T("Orange, IA réactivée : **61*<numéro Akno>**10#", onO.length === 1 && onO[0].code === `**61*${e164}**10#` && onO[0].tel === `tel:**61*${e164}**10%23`)
T("bouton « Réactiver le renvoi »", onO[0].cta === "Réactiver le renvoi" && forwardSteps("orange", dest, "off", "direct")[0].cta === "Réactiver le renvoi")

// « Vérifier le renvoi »
T("vérifier le renvoi : *#61# (tel:*%2361%23)", forwardCheck().code === "*#61#" && forwardCheck("fallback").tel === "tel:*%2361%23")
T("vérifier le renvoi immédiat : *#21#", forwardCheck("direct").code === "*#21#" && forwardCheck("direct").tel === "tel:*%2321%23")

const dirO = forwardSteps("orange", dest, "off", "direct")
T("Orange, à ma place : **21*+33…#", dirO.length === 1 && dirO[0].code === `**21*${e164}#` && dirO[0].tel === `tel:**21*${e164}%23`)

const fbO = forwardSteps("orange", dest, "off", "fallback")
T(`Orange, si je ne décroche pas : **61*+33…**${FORWARD_DELAY_SEC}#`, fbO.length === 1 && fbO[0].code === `**61*${e164}**${FORWARD_DELAY_SEC}#`)

const sfr = forwardSteps("sfr", dest, "off", "direct")
T("SFR, à ma place : *21*+33…#", sfr.length === 1 && sfr[0].code === `*21*${e164}#`)
T(`SFR, si je ne décroche pas : *61*+33…**${FORWARD_DELAY_SEC}#`, forwardSteps("sfr", dest, "off", "fallback")[0].code === `*61*${e164}**${FORWARD_DELAY_SEC}#`)

T("Bouygues, à ma place : *21*+33…#", forwardSteps("bouygues", dest, "off", "direct")[0].code === `*21*${e164}#`)
T(`Bouygues, si je ne décroche pas : *61*+33…**${FORWARD_DELAY_SEC}#`, forwardSteps("bouygues", dest, "off", "fallback")[0].code === `*61*${e164}**${FORWARD_DELAY_SEC}#`)
T("Bouygues, IA désactivée : #61# (ou #21# en renvoi immédiat)", forwardSteps("bouygues", dest, "", "off")[0].code === "#61#" && forwardSteps("bouygues", dest, "direct", "off")[0].code === "#21#")

T("Free, à ma place : *21*+33…#", forwardSteps("free", dest, "off", "direct")[0].code === `*21*${e164}#`)
T(`Free, si je ne décroche pas : **61*+33…**${FORWARD_DELAY_SEC}#`, forwardSteps("free", dest, "off", "fallback")[0].code === `**61*${e164}**${FORWARD_DELAY_SEC}#`)

const sw = forwardSteps("orange", dest, "direct", "fallback")
T("passage à ma place → si je ne décroche pas : 2 étapes (annuler puis activer)", sw.length === 2 && sw[0].code === "##21#" && sw[1].code === `**61*${e164}**${FORWARD_DELAY_SEC}#`)
T("déjà confirmé : aucun code à composer", forwardSteps("orange", dest, "fallback", "fallback").length === 0)
T("sans numéro Akno, pas de code d'activation", forwardSteps("orange", "", "off", "direct").length === 0)
T("sans numéro Akno, on peut quand même couper le renvoi", forwardSteps("orange", "", "direct", "off")[0].code === "##21#" && forwardSteps("orange", "", "", "off")[0].code === "##61#")
T("opérateur par défaut = Orange", DEFAULT_OPERATOR === "orange")
T("telHref laisse les étoiles, encode seulement #", telHref(`**21*${e164}#`) === `tel:**21*${e164}%23`)

T("boucle si le renvoi est encore actif (direct)", forwardLoopRisk({ artisanMobile: "+33600000000", from: "+33611111111", forwardApplied: "direct" }) === true)
T("boucle si le renvoi n'est pas confirmé annulé", forwardLoopRisk({ artisanMobile: "+33600000000", from: "+33611111111", forwardApplied: "" }) === true)
T("boucle si l'appel arrive déjà du portable (ForwardedFrom)", forwardLoopRisk({ artisanMobile: "+33600000000", forwardedFrom: "0600000000", from: "+33611111111", forwardApplied: "off" }) === true)
T("pas de boucle si le renvoi est bien annulé et l'appel ne vient pas du portable", forwardLoopRisk({ artisanMobile: "+33600000000", forwardedFrom: "", from: "+33611111111", forwardApplied: "off" }) === false)

T("reception_config : operator et forwardApplied normalisés", normalizeConfig({}).operator === "orange" && normalizeConfig({}).forwardApplied === "" && normalizeConfig({ operator: "sfr", forwardApplied: "direct" }).operator === "sfr" && normalizeConfig({ operator: "x", forwardApplied: "nope" }).forwardApplied === "")
T("serialize conserve operator et forwardApplied", serializeConfig(normalizeConfig({ operator: "free", forwardApplied: "off" })).operator === "free" && serializeConfig(normalizeConfig({ operator: "free", forwardApplied: "off" })).forwardApplied === "off")

console.log(`\n${ok} OK, ${ko} KO`)
if (ko) process.exit(1)