// update74 · Accueil Réception : le bouton « Réglages » (ex-Assistant) ouvre le menu réceptionniste,
// le réglage se sauvegarde, la feuille se ferme sans fond noir ni clavier fantôme.
// Usage : npm run test:rec-reglages
import { webkit } from "playwright"
import { harness } from "./pw-harness.mjs"

const H = harness({ port: 5194 })
let ok = 0, ko = 0
const check = (l, c, d = "") => { c ? ok++ : ko++; console.log(`${c ? "✔" : "✘"} ${l}${c ? "" : " · " + d}`) }

await H.start()
const browser = await webkit.launch()
try {
  const { page, writes } = await H.newPage(browser, { width: 393, height: 852, integrations: { twilio_number: "+33973057824" } })
  await page.goto(`${H.BASE}/reception`)
  await page.waitForSelector("[data-tab]", { timeout: 20000 })
  await page.waitForTimeout(1200)

  const assistantQa = await page.locator("button", { hasText: /^Assistant$/ }).count()
  const openBtn = page.getByRole("button", { name: "Réglages de la réceptionniste" })
  check("le bouton Assistant de l'accueil a disparu", assistantQa === 0, `reste ${assistantQa}`)
  check("le bouton Réglages de la réceptionniste est visible à côté d'Appels", await openBtn.count() === 1)

  await openBtn.click()
  await page.waitForTimeout(500)
  const dlg = page.getByRole("dialog")
  check("la feuille Réceptionniste s'ouvre", await dlg.getByText("Réceptionniste").count() > 0 && await dlg.locator("[data-rec-reglages]").count() === 1)

  const ia = dlg.getByRole("switch", { name: "L'IA répond aux appels" })
  check("le interrupteur « L'IA répond » est allumé par défaut", await ia.getAttribute("aria-checked") === "true")
  check("le mode « Si je ne décroche pas » est proposé", await dlg.locator("[data-pickup=fallback]").count() === 1)
  check("le mode « À ma place » est proposé", await dlg.locator("[data-pickup=direct]").count() === 1)
  const codeFb = await dlg.locator("[data-forward-code=fallback]").textContent()
  const telFb = await dlg.locator("[data-forward-tel=fallback]").getAttribute("href")
  check("mode par défaut : code Orange **61*+33973057824**10# (si je ne décroche pas)", (codeFb || "").trim() === "**61*+33973057824**10#", JSON.stringify(codeFb))
  check("le lien tel: encode # en %23", telFb === "tel:**61*+33973057824**10%23", String(telFb))
  check("le bouton Copier est proposé (repli iOS)", await dlg.getByRole("button", { name: /Copier/ }).count() >= 1)

  await dlg.locator("[data-pickup=direct]").click()
  await page.waitForTimeout(800)
  const saved2 = writes.filter(w => w.table === "artisans" && w.method === "PATCH" && w.body?.reception_config)
  const last2 = saved2[saved2.length - 1]
  check("choisir « À ma place » enregistre pickup = direct", !!last2 && last2.body.reception_config.pickup === "direct", JSON.stringify(last2?.body?.reception_config))
  const codeDir = await dlg.locator("[data-forward-code=direct]").textContent()
  check("à ma place : code Orange **21*+33973057824#", (codeDir || "").trim() === "**21*+33973057824#", JSON.stringify(codeDir))

  // Voix par défaut : Ara (le libellé accessible de la ligne est « Voix Ara »).
  await dlg.getByRole("button", { name: /^Voix Ara/ }).first().click({ timeout: 5000 }).catch(async () => {
    await dlg.getByText("Ara", { exact: true }).first().click({ timeout: 5000 })
  })
  await page.waitForTimeout(400)
  const aurora = dlg.getByRole("radio", { name: "Voix Aurora" })
  check("la liste des voix s'ouvre", await aurora.count() === 1)
  await aurora.click()
  await page.waitForTimeout(800)
  const saved3 = writes.filter(w => w.table === "artisans" && w.method === "PATCH" && w.body?.reception_config)
  const last3 = saved3[saved3.length - 1]
  check("changer la voix enregistre reception_config.voice = aurora", !!last3 && last3.body.reception_config.voice === "aurora", JSON.stringify(last3?.body?.reception_config))

  const before = writes.length
  await ia.click()
  await page.waitForTimeout(800)
  const saved = writes.filter(w => w.table === "artisans" && w.method === "PATCH" && w.body?.reception_config)
  const last = saved[saved.length - 1]
  check("couper l'IA enregistre en base (reception_config.enabled = false)", !!last && last.body.reception_config.enabled === false, JSON.stringify(last?.body?.reception_config || writes.slice(before)))
  check("l'interrupteur passe à off", await ia.getAttribute("aria-checked") === "false")
  const codeOff = await dlg.locator("[data-forward-code=off]").textContent()
  // Réceptionniste désactivée : on coupe le renvoi qui était en place (ici « à ma place » → ##21#).
  check("IA coupée : code du renvoi à couper ##21#", (codeOff || "").trim() === "##21#", JSON.stringify(codeOff))
  const offBtn = dlg.locator("[data-forward-tel=off]")
  check("IA coupée : bouton « Couper aussi le renvoi Orange » (lien tel: avec # encodé)", ((await offBtn.textContent()) || "").trim() === "Couper aussi le renvoi Orange" && await offBtn.getAttribute("href") === "tel:%23%2321%23", `${await offBtn.textContent()} ${await offBtn.getAttribute("href")}`)
  check("secours iOS : code affiché, Copier, « Colle-le dans Téléphone puis appelle »", await dlg.locator("[data-forward-fallback=off]").getByRole("button", { name: /Copier/ }).count() === 1 && /Colle-le dans Téléphone puis appelle/.test((await dlg.locator("[data-forward-fallback=off]").textContent()) || ""))
  const chk = dlg.locator("[data-forward-tel=check]")
  check("bouton « Vérifier le renvoi » (code d'interrogation)", ((await chk.textContent()) || "").trim() === "Vérifier le renvoi" && /^tel:\*%23(61|21)%23$/.test((await chk.getAttribute("href")) || ""), String(await chk.getAttribute("href")))
  check("la confirmation « Renvoi coupé ? » s'affiche", await dlg.locator("[data-forward-confirm]").count() === 1 && /Renvoi coupé \?/.test((await dlg.locator("[data-forward-confirm]").textContent()) || ""))
  await dlg.getByRole("button", { name: "Oui" }).click()
  await page.waitForTimeout(800)
  const saved4 = writes.filter(w => w.table === "artisans" && w.method === "PATCH" && w.body?.reception_config)
  const last4 = saved4[saved4.length - 1]
  check("Oui enregistre forwardApplied = off", !!last4 && last4.body.reception_config.forwardApplied === "off", JSON.stringify(last4?.body?.reception_config))

  // Réceptionniste réactivée : « Réactiver le renvoi », puis retour à l'état désactivé pour la suite du test.
  await ia.click()
  await page.waitForTimeout(800)
  const onBtn = dlg.locator("[data-forward-tel=direct]")
  check("IA réactivée : bouton « Réactiver le renvoi » avec le numéro Akno", ((await onBtn.textContent()) || "").trim() === "Réactiver le renvoi" && await onBtn.getAttribute("href") === "tel:**21*+33973057824%23", `${await onBtn.textContent()} ${await onBtn.getAttribute("href")}`)
  await dlg.locator("[data-pickup=fallback]").click()
  await page.waitForTimeout(800)
  const fbBtn = dlg.locator("[data-forward-tel=fallback]")
  check("IA réactivée (si je ne décroche pas) : **61*<numéro Akno>**10#", ((await fbBtn.textContent()) || "").trim() === "Réactiver le renvoi" && await fbBtn.getAttribute("href") === "tel:**61*+33973057824**10%23", String(await fbBtn.getAttribute("href")))
  await ia.click()
  await page.waitForTimeout(800)
  check("IA recoupée (si je ne décroche pas) : ##61# et vérification *#61#", ((await dlg.locator("[data-forward-code=off]").textContent()) || "").trim() === "##61#" && await dlg.locator("[data-forward-tel=off]").getAttribute("href") === "tel:%23%2361%23" && await dlg.locator("[data-forward-tel=check]").getAttribute("href") === "tel:*%2361%23")

  const vv0 = await page.evaluate(() => window.visualViewport ? { h: window.visualViewport.height, kb: document.documentElement.style.getPropertyValue("--kb") } : { h: innerHeight, kb: "" })
  const focused = await page.evaluate(() => {
    const a = document.activeElement
    return !!(a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT"))
  })
  check("pas de champ focus / clavier fantôme dans la feuille", !focused && (!vv0.kb || Number.parseFloat(vv0.kb) === 0), JSON.stringify(vv0) + ` focused=${focused}`)

  await dlg.getByRole("button", { name: "Fermer" }).click()
  await page.waitForTimeout(600)
  check("la feuille se ferme", await page.getByRole("dialog").count() === 0)
  const recVisible = await page.getByRole("button", { name: "Appeler ma réceptionniste" }).isVisible()
  const black = await page.evaluate(() => {
    const op = document.querySelector("[data-page]")
    if (!op) return true
    const r = op.getBoundingClientRect(), cs = getComputedStyle(op)
    return r.height < 100 || cs.visibility === "hidden" || Number(cs.opacity) === 0
  })
  check("la page Réception réapparaît, pas de fond noir", recVisible && !black, `visible=${recVisible} black=${black}`)
} catch (e) {
  check("exécution", false, String(e).stack || String(e).slice(0, 400))
} finally {
  await browser.close(); H.stop()
}
console.log(`${ok} ok, ${ko} en échec`)
process.exit(ko ? 1 : 0)
