#!/usr/bin/env node
/* update76 · Haut d'écran iPhone (WebKit 393×852) : le fond / la carte vont jusqu'en haut,
   les boutons et en-têtes restent sous l'encoche (safe-area 47 px), la navbar et une feuille ne régressent pas.
   PWA simulée (standalone + --sat/--sab). Aucune capture par défaut. */
import { webkit } from "playwright"
import { harness } from "./pw-harness.mjs"

const H = harness({ port: 5196 }), W = 393, HT = 852, SAT = 47, SAB = 34
let ok = 0, ko = 0
const check = (name, cond, extra = "") => { if (cond) { ok++; console.log(`✔ ${name}`) } else { ko++; console.log(`✘ ${name}${extra ? " " + extra : ""}`) } }

async function main() {
  await H.start()
  const browser = await webkit.launch()
  try {
    const { ctx, page } = await H.newPage(browser, { width: W, height: HT, scale: 2, integrations: { twilio_number: "+33973057824" } })
    await ctx.addInitScript(([t, b]) => {
      try { Object.defineProperty(navigator, "standalone", { get: () => true }) } catch { /* */ }
      const st = () => { const s = document.createElement("style"); s.id = "akno-sat-sim"; s.textContent = `:root{--sat:${t}px!important;--sab:${b}px!important}`; document.head.appendChild(s) }
      if (document.head) st(); else document.addEventListener("DOMContentLoaded", st)
    }, [SAT, SAB])

    await page.goto(`${H.BASE}/reception`)
    await page.waitForSelector("[data-bar-pill]", { timeout: 20000 })
    await page.waitForTimeout(1200)

    const metas = await page.evaluate(() => ({
      viewport: document.querySelector('meta[name="viewport"]')?.content || "",
      capable: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content || "",
      bar: document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.content || "",
    }))
    check("viewport-fit=cover", /viewport-fit=cover/.test(metas.viewport), metas.viewport)
    check("apple-mobile-web-app-capable", metas.capable === "yes")
    check("apple-mobile-web-app-status-bar-style black-translucent", metas.bar === "black-translucent", metas.bar)

    const rec = await page.evaluate((SAT) => {
      const pageEl = [...document.querySelectorAll("[data-page]")].find(e => e.getAttribute("data-page") === "rec") || document.querySelector("[data-page]")
      const head = document.querySelector("[data-mobile-head]")
      const logoOrBtn = head && [...head.querySelectorAll("button, a, img, [role=button]")].find(e => e.getBoundingClientRect().height > 8)
      const bar = document.querySelector("[data-bar-pill]")
      const pr = pageEl?.getBoundingClientRect(), hr = head?.getBoundingClientRect(), br = bar?.getBoundingClientRect(), ir = logoOrBtn?.getBoundingClientRect()
      return { pageTop: pr?.top ?? 99, pageH: pr?.height ?? 0, headTop: hr?.top ?? 99, headPad: head ? parseFloat(getComputedStyle(head).paddingTop) : 0, innerTop: ir?.top ?? 0, barBottom: br?.bottom ?? 0, barTop: br?.top ?? 0, vh: innerHeight }
    }, SAT)
    check("Réception : la page remplit l'écran jusqu'en haut", rec.pageTop <= 1, JSON.stringify(rec))
    check("Réception : l'en-tête (fond) commence à y=0, pas en-dessous de la barre d'état", rec.headTop <= 1, JSON.stringify(rec))
    check("Réception : padding-top de l'en-tête ≥ safe-area", rec.headPad >= SAT, JSON.stringify(rec))
    check("Réception : logo / boutons sous l'heure", rec.innerTop >= SAT - 1, JSON.stringify(rec))
    check("Réception : navbar visible et décollée du bas (comme d'habitude, écart ≥ 10 px)", rec.barTop < rec.vh && rec.vh - rec.barBottom >= 10, JSON.stringify(rec))

    await page.goto(`${H.BASE}/chantiers`)
    await page.waitForSelector("[data-bar-pill]", { timeout: 20000 })
    await page.waitForTimeout(1800)
    const ch = await page.evaluate((SAT) => {
      const pageEl = [...document.querySelectorAll("[data-page]")].find(e => e.getAttribute("data-page") === "ch") || document.querySelector("[data-page]")
      const map = document.querySelector(".ch-map, .leaflet-container") || pageEl?.querySelector(":scope > div")
      const header = pageEl?.querySelector("header")
      const btn = header && [...header.querySelectorAll("button")].find(e => e.getBoundingClientRect().height > 8)
      const bar = document.querySelector("[data-bar-pill]")
      const pr = pageEl?.getBoundingClientRect(), mr = map?.getBoundingClientRect(), br = bar?.getBoundingClientRect(), ir = btn?.getBoundingClientRect(), hr = header?.getBoundingClientRect()
      return { pageTop: pr?.top ?? 99, mapTop: mr?.top ?? 99, mapH: mr?.height ?? 0, headerTop: hr?.top ?? 99, headerPad: header ? parseFloat(getComputedStyle(header).paddingTop) : 0, btnTop: ir?.top ?? 0, barBottom: br?.bottom ?? 0, vh: innerHeight }
    }, SAT)
    check("Chantiers : la page remplit l'écran jusqu'en haut", ch.pageTop <= 1, JSON.stringify(ch))
    check("Chantiers : la carte va jusqu'en haut (pas de bande sous la barre d'état)", ch.mapTop <= 1, JSON.stringify(ch))
    check("Chantiers : en-tête en overlay dès le haut, padding-top ≥ safe-area", ch.headerTop <= 1 && ch.headerPad >= SAT, JSON.stringify(ch))
    check("Chantiers : boutons sous l'heure", ch.btnTop >= SAT - 1, JSON.stringify(ch))
    check("Chantiers : navbar visible et décollée du bas (écart ≥ 10 px)", ch.barBottom < ch.vh && ch.vh - ch.barBottom >= 10, JSON.stringify(ch))

    // feuille : Réglages réceptionniste depuis Réception, la navbar de la page derrière ne doit pas casser le haut
    await page.goto(`${H.BASE}/reception`)
    await page.waitForSelector("[data-bar-pill]", { timeout: 20000 })
    await page.waitForTimeout(800)
    await page.getByRole("button", { name: "Réglages de la réceptionniste" }).click()
    await page.waitForSelector("[data-rec-reglages]", { timeout: 10000 })
    await page.waitForTimeout(500)
    const sheet = await page.evaluate((SAT) => {
      const dlg = document.querySelector("[data-rec-reglages]")?.closest("[role=dialog]")
      const closeBtn = dlg && [...dlg.querySelectorAll("button")].find(b => (b.getAttribute("aria-label") || "") === "Fermer")
      const r = dlg?.getBoundingClientRect(), cr = closeBtn?.getBoundingClientRect()
      const bar = document.querySelector("[data-bar-pill]")
      return { top: r?.top ?? -1, closeTop: cr?.top ?? 0, barVisible: !!(bar && bar.getBoundingClientRect().height > 0), vh: innerHeight }
    }, SAT)
    check("feuille : le bouton Fermer reste sous l'encoche", sheet.closeTop >= SAT - 1 || sheet.top > SAT, JSON.stringify(sheet))
    await page.getByRole("button", { name: "Fermer" }).click()
    await page.waitForTimeout(700)
    check("feuille : se ferme, navbar encore visible", await page.getByRole("dialog").count() === 0 && await page.locator("[data-bar-pill]").isVisible())

    console.log(`\n${ok} ok, ${ko} ko`)
    if (ko) process.exitCode = 1
  } finally {
    await browser.close()
    H.stop()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
