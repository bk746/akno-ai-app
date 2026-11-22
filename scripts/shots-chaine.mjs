/* update71 · Captures avant/après (iPhone 375 et 430 px) : aperçu du devis n° 9 et facture F-2026-0003.
   Usage : node scripts/shots-chaine.mjs <dossier-projet> <préfixe> */
import { webkit } from "playwright"
import { harness } from "./pw-harness.mjs"
import { chainTables, PROFILE71 } from "./fixtures-chaine.mjs"
const cwd = process.argv[2] || process.cwd(), pre = process.argv[3] || "apres", OUT = "/workspace/akno-docs/update71-screens"
const h = harness({ cwd, port: 5203 })
await h.start()
const browser = await webkit.launch()
try {
  for (const width of [375, 430]) {
    const height = width === 375 ? 812 : 932
    const { page, ctx } = await h.newPage(browser, { width, height, tables: chainTables(), profile: PROFILE71, scale: 2 })
    await page.goto(h.BASE + "/devis"); await page.waitForTimeout(2500)
    await page.getByText("Cuisine : plomberie").first().click(); await page.waitForTimeout(1200)
    if (await page.getByText("Fiche client", { exact: true }).count()) { await page.getByText("Devis N° 9").first().click(); await page.waitForTimeout(1500) }
    await page.screenshot({ path: `${OUT}/${pre}-devis9-${width}.png` })
    await ctx.close()
    const b = await h.newPage(browser, { width, height, tables: chainTables(), profile: PROFILE71, scale: 2 })
    await b.page.goto(h.BASE + "/factures"); await b.page.waitForTimeout(2500)
    await b.page.getByText("F-2026-0003").first().click(); await b.page.waitForTimeout(1500)
    await b.page.screenshot({ path: `${OUT}/${pre}-facture3-${width}.png` })
    await b.ctx.close()
  }
} finally { await browser.close(); h.stop() }
console.log("ok")
