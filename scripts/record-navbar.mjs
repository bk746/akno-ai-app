#!/usr/bin/env node
/* update70 · Même parcours (WebKit iPhone 390×844, données simulées) pour la vidéo avant/après de la barre.
   Usage : node scripts/record-navbar.mjs <dossier-projet> <port> <dossier-sortie> */
import { webkit, chromium } from "playwright"
import { harness } from "./pw-harness.mjs"
const [cwd = process.cwd(), port = "5197", out = "/tmp/nav-video"] = process.argv.slice(2)
const H = harness({ cwd, port: +port })
const SC = `(() => { const slot = document.querySelector("[data-page]"); if (!slot) return null
  for (const el of slot.querySelectorAll("*")) { const cs = getComputedStyle(el); if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) return el } return null })()`
const scroll = (page, to, ms = 900) => page.evaluate(([sc, to, ms]) => new Promise(res => { const el = eval(sc); if (!el) return res(); const a = el.scrollTop, b = to < 0 ? el.scrollHeight - el.clientHeight : to, t0 = performance.now()
  const f = () => { const k = Math.min(1, (performance.now() - t0) / ms), e = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; el.scrollTop = a + (b - a) * e; k < 1 ? requestAnimationFrame(f) : res() }; requestAnimationFrame(f) }), [SC, to, ms])
await H.start()
const browser = await (process.env.REC_BROWSER === "chromium" ? chromium : webkit).launch()
try {
  const { ctx, page } = await H.newPage(browser, { video: out })
  await page.goto(`${H.BASE}/reception`); await page.waitForSelector('nav button[aria-label="Agenda"]', { timeout: 30000 }); await page.waitForTimeout(6500)
  await scroll(page, -1, 1600); await page.waitForTimeout(900); await scroll(page, 0, 1000); await page.waitForTimeout(600)
  for (const l of ["Agenda", "Chantiers", "Factures", "Réception", "Agenda", "Réception"]) { await page.click(`nav button[aria-label^="${l}"]`); await page.waitForTimeout(l === "Chantiers" ? 1300 : 900) }
  await scroll(page, -1, 1400); await page.waitForTimeout(700)
  await page.click('nav button[aria-label="Créer"]'); await page.waitForTimeout(1100); await page.keyboard.press("Escape"); await page.waitForTimeout(900)
  await ctx.close()
  console.log("vidéo :", await page.video().path())
} finally { await browser.close(); H.stop() }
