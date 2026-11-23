/* update75 · Codes de renvoi GSM selon le mode et l'opérateur, lien tel:, risque de boucle.
   Usage : npm run test:forward (aucun appel réseau). */
import { DEFAULT_OPERATOR, FORWARD_DELAY_SEC, destForCodes, forwardLoopRisk, forwardSteps, intendedForward, nationalFr, telHref } from "../src/lib/voice/forward"
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

const offO = forwardSteps("orange", dest, "direct", "off")
T("Orange, IA coupée : un seul code ##002#", offO.length === 1 && offO[0].code === "##002#")
T("lien tel: encode chaque dièse en %23", offO[0].tel === "tel:%23%23002%23")

const dirO = forwardSteps("orange", dest, "off", "direct")
T("Orange, à ma place : **21*+33…#", dirO.length === 1 && dirO[0].code === `**21*${e164}#` && dirO[0].tel === `tel:**21*${e164}%23`)

const fbO = forwardSteps("orange", dest, "off", "fallback")
T(`Orange, si je ne décroche pas : **61*+33…**${FORWARD_DELAY_SEC}#`, fbO.length === 1 && fbO[0].code === `**61*${e164}**${FORWARD_DELAY_SEC}#`)

const sfr = forwardSteps("sfr", dest, "off", "direct")
T("SFR, à ma place : *21*+33…#", sfr.length === 1 && sfr[0].code === `*21*${e164}#`)
T(`SFR, si je ne décroche pas : *61*+33…**${FORWARD_DELAY_SEC}#`, forwardSteps("sfr", dest, "off", "fallback")[0].code === `*61*${e164}**${FORWARD_DELAY_SEC}#`)

T("Bouygues, à ma place : *21*+33…#", forwardSteps("bouygues", dest, "off", "direct")[0].code === `*21*${e164}#`)
T(`Bouygues, si je ne décroche pas : *61*+33…**${FORWARD_DELAY_SEC}#`, forwardSteps("bouygues", dest, "off", "fallback")[0].code === `*61*${e164}**${FORWARD_DELAY_SEC}#`)
T("Bouygues, IA coupée : #002#", forwardSteps("bouygues", dest, "direct", "off")[0].code === "#002#")

T("Free, à ma place : *21*+33…#", forwardSteps("free", dest, "off", "direct")[0].code === `*21*${e164}#`)
T(`Free, si je ne décroche pas : **61*+33…**${FORWARD_DELAY_SEC}#`, forwardSteps("free", dest, "off", "fallback")[0].code === `**61*${e164}**${FORWARD_DELAY_SEC}#`)

const sw = forwardSteps("orange", dest, "direct", "fallback")
T("passage à ma place → si je ne décroche pas : 2 étapes (annuler puis activer)", sw.length === 2 && sw[0].code === "##21#" && sw[1].code === `**61*${e164}**${FORWARD_DELAY_SEC}#`)
T("déjà confirmé : aucun code à composer", forwardSteps("orange", dest, "fallback", "fallback").length === 0)
T("sans numéro Akno, pas de code d'activation", forwardSteps("orange", "", "off", "direct").length === 0)
T("sans numéro Akno, on peut quand même annuler", forwardSteps("orange", "", "direct", "off")[0].code === "##002#")
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