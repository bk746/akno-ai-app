// update72 · changer d'onglet ne crée plus d'entrée d'historique : history.back() (= geste iOS « bord gauche ») ne ramène
// jamais l'onglet précédent. Les feuilles gardent leur entrée (retour = fermeture). Usage : npm run test:history
import { webkit } from "playwright"
import { harness } from "./pw-harness.mjs"
const H = harness({ port: 5196 }); let ok = 0, ko = 0
const check = (l, c, d = "") => { c ? ok++ : ko++; console.log(`${c ? "✔" : "✘"} ${l}${c ? "" : " · " + d}`) }
await H.start(); const browser = await webkit.launch()
try {
  const { page } = await H.newPage(browser, { width: 390, height: 844 })
  const path = () => page.evaluate(() => location.pathname)
  const open = async p => { await page.goto(`${H.BASE}/${p}`); await page.waitForSelector("[data-tab]", { timeout: 20000 }); await page.waitForTimeout(1200) }
  for (const [from, tab, re] of [["chantiers", "fac", /factures|devis/], ["factures", "ag", /agenda/], ["agenda", "ch", /chantiers/], ["chantiers", "rec", /reception/]]) {
    await open(from); const len0 = await page.evaluate(() => history.length)
    await page.click(`[data-tab="${tab}"]`); await page.waitForTimeout(900)
    const p1 = await path(), len1 = await page.evaluate(() => history.length)
    check(`${from} → ${tab} : l'onglet change sans entrée d'historique`, re.test(p1) && len1 === len0, `${p1} ${len0}→${len1}`)
    await page.evaluate(() => history.back()); await page.waitForTimeout(900)
    const p2 = await path().catch(() => "?")
    check(`${tab} puis retour (geste bord gauche) : ne revient pas sur ${from}`, p2 !== `/${from}`, p2)
  }
  await open("agenda"); await page.click("[data-create-btn]"); await page.waitForTimeout(600)
  const opened = await page.locator("[data-create-menu]").count()
  await page.evaluate(() => history.back()); await page.waitForTimeout(900)
  check("feuille Créer : le retour la ferme et reste sur Agenda", opened > 0 && await page.locator("[data-create-menu]").count() === 0 && /agenda/.test(await path()), `${opened} ${await path()}`)
} catch (e) { check("exécution", false, String(e).slice(0, 200)) } finally { await browser.close(); H.stop() }
console.log(`${ok} ok, ${ko} en échec`); process.exit(ko ? 1 : 0)
