#!/usr/bin/env node
/* update79 · Sélecteur Jour/Semaine/Mois/Équipe/Année à 393 px (WebKit) :
   plus de chevauchement avec les flèches, vue Année visible. Supabase simulé. */
import { webkit } from "playwright"
import { harness, UID } from "./pw-harness.mjs"

const H = harness({ port: 5191 }), W = 393, HT = 852
let ok = 0, ko = 0
const check = (name, cond, extra = "") => { if (cond) { ok++; console.log(`✔ ${name}`) } else { ko++; console.log(`✘ ${name}${extra ? " " + extra : ""}`) } }

const overlap = (a, b) => a && b && a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1

async function measure(page) {
  return page.evaluate(() => {
    const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, left: r.left, top: r.top, bottom: r.bottom, text: (el.textContent || "").trim() } }
    const tabs = [...document.querySelectorAll('[role="tablist"][aria-label="Vue du calendrier"] [role="tab"]')].map(t => {
      const r = box(t), span = t.querySelector("span.relative, span") || t
      const sr = span.getBoundingClientRect()
      return { ...r, label: (t.textContent || "").trim(), clipped: sr.width + 1 < span.scrollWidth }
    })
    const tools = document.querySelector("[data-cal-tools]")
    const prev = box(tools?.querySelector('[aria-label="Précédent"]'))
    const next = box(tools?.querySelector('[aria-label="Suivant"]'))
    const today = box([...tools?.querySelectorAll("button") || []].find(b => (b.textContent || "").trim() === "Aujourd'hui"))
    const list = box(document.querySelector('[data-cal-head] [role="tablist"][aria-label="Vue du calendrier"]'))
    const year = box(document.querySelector("[data-year-grid]"))
    const months = year ? [...document.querySelectorAll("[data-year-grid] button")].map(b => (b.querySelector("div")?.textContent || "").trim()) : []
    return { tabs, prev, next, today, list, year, months, vw: window.innerWidth }
  })
}

async function main() {
  await H.start()
  const browser = await webkit.launch()
  try {
    const yday = new Date(); yday.setDate(yday.getDate() - 1)
    const { page } = await H.newPage(browser, {
      width: W, height: HT, scale: 2,
      tables: { appointments: [{ id: "a0000000-0000-4000-8000-000000000001", artisan_id: UID, title: "Entretien", client: "Julie Bernard", start: yday.toISOString(), end: new Date(yday.getTime() + 3600e3).toISOString() }] },
    })
    await page.goto(`${H.BASE}/agenda`)
    await page.waitForSelector("[data-bar-pill]", { timeout: 20000 })
    await page.waitForSelector('[role="tablist"][aria-label="Vue du calendrier"]', { timeout: 15000 })
    await page.waitForTimeout(300)

    const labels = ["Jour", "Semaine", "Mois", "Équipe", "Année"]
    let info = await measure(page)
    check("les 5 onglets sont présents", labels.every(l => info.tabs.some(t => t.label === l)), JSON.stringify(info.tabs.map(t => t.label)))
    check("aucun onglet ne chevauche un autre", labels.every((_, i) => !info.tabs.some((t, j) => i !== j && overlap(info.tabs[i], t))), JSON.stringify(info.tabs))
    check("les flèches ne chevauchent aucun onglet", info.tabs.every(t => !overlap(t, info.prev) && !overlap(t, info.next)), JSON.stringify({ tabs: info.tabs, prev: info.prev, next: info.next }))
    check("les libellés des 5 onglets ne sont pas coupés", info.tabs.every(t => t.label && !t.clipped && t.w >= 40), JSON.stringify(info.tabs.map(t => ({ l: t.label, w: Math.round(t.w), clipped: t.clipped }))))
    check("les flèches sont sur la ligne d'Aujourd'hui, pas à côté des onglets", !!(info.today && info.prev && info.next && Math.abs(info.today.y - info.prev.y) <= 6 && info.list && info.prev.y + info.prev.h <= info.list.y + 2), JSON.stringify({ today: info.today, prev: info.prev, list: info.list }))

    await page.getByRole("tab", { name: "Année" }).click()
    await page.waitForSelector("[data-year-grid]", { timeout: 8000 })
    info = await measure(page)
    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]
    check("la vue Année affiche les 12 mois", !!(info.year && info.year.w > 100 && info.year.h > 100 && monthNames.every(m => info.months.includes(m))), JSON.stringify({ months: info.months, year: info.year }))

    await page.setViewportSize({ width: 375, height: HT })
    await page.waitForTimeout(250)
    // rester en vue année : les onglets doivent encore tenir
    info = await measure(page)
    check("à 375 px, les 5 onglets tiennent sans chevauchement ni coupe", info.vw === 375 && info.tabs.length === 5 && info.tabs.every(t => t.label && !t.clipped) && labels.every((_, i) => !info.tabs.some((t, j) => i !== j && overlap(info.tabs[i], t))) && info.tabs.every(t => !overlap(t, info.prev) && !overlap(t, info.next)), JSON.stringify({ vw: info.vw, tabs: info.tabs.map(t => ({ l: t.label, w: Math.round(t.w), clipped: t.clipped, y: Math.round(t.y) })), prev: info.prev }))
    check("à 375 px, la vue Année reste visible", !!(info.year && info.year.h > 80 && info.months.length === 12), JSON.stringify({ months: info.months, year: info.year }))
  } finally {
    await browser.close()
    H.stop()
  }
  console.log(`\n${ok} ok, ${ko} ko`)
  if (ko) process.exit(1)
}

main().catch(e => { console.error(e); try { H.stop() } catch { /* */ } process.exit(1) })
