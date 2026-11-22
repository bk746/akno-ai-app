#!/usr/bin/env node
/* update81 · WebKit 393 px : feuille + fond couvrent jusqu'au clavier ; entrée Relances dans le menu +.
   Supabase simulé, aucune écriture en prod. */
import { webkit } from "playwright"
import { harness } from "./pw-harness.mjs"

const H = harness({ port: 5185 }), W = 393, HT = 852
const KB = 320
let ok = 0, ko = 0
const check = (name, cond, extra = "") => { if (cond) { ok++; console.log(`✔ ${name}`) } else { ko++; console.log(`✘ ${name}${extra ? " " + extra : ""}`) } }

async function fakeKb(page, on, px = KB) {
  await page.evaluate(({ on, px }) => {
    const vv = window.visualViewport
    if (!window.__aknoVV) {
      window.__aknoVV = { on: false, px: 0 }
      if (vv) {
        const proto = Object.getPrototypeOf(vv)
        const hDesc = Object.getOwnPropertyDescriptor(proto, "height") || Object.getOwnPropertyDescriptor(vv, "height")
        const tDesc = Object.getOwnPropertyDescriptor(proto, "offsetTop") || Object.getOwnPropertyDescriptor(vv, "offsetTop")
        const hGet = hDesc?.get ? hDesc.get.bind(vv) : () => innerHeight
        const tGet = tDesc?.get ? tDesc.get.bind(vv) : () => 0
        try {
          Object.defineProperty(vv, "height", { configurable: true, get() { return window.__aknoVV.on ? Math.max(120, hGet() - window.__aknoVV.px) : hGet() } })
          Object.defineProperty(vv, "offsetTop", { configurable: true, get() { return window.__aknoVV.on ? 0 : tGet() } })
        } catch { /* */ }
      }
    }
    window.__aknoVV.on = !!on
    window.__aknoVV.px = px
    const r = document.documentElement
    r.style.setProperty("--kb", on ? `${px}px` : "0px")
    r.classList.toggle("kb-open", !!on)
    r.style.setProperty("--vvh", `${Math.round(on ? window.innerHeight - px : window.innerHeight)}px`)
    vv?.dispatchEvent(new Event("resize"))
    window.dispatchEvent(new Event("resize"))
  }, { on, px })
}

async function main() {
  await H.start()
  const browser = await webkit.launch()
  try {
    const { page } = await H.newPage(browser, { width: W, height: HT, scale: 2 })

    /* ---- Feuille Nouveau chantier + clavier : pas de trou, fond jusqu'au clavier ---- */
    await page.goto(`${H.BASE}/chantiers`)
    await page.waitForSelector("[data-create-btn]", { timeout: 20000 })
    await page.waitForTimeout(500)
    await page.click("[data-create-btn]")
    await page.waitForSelector("[data-create-menu]", { timeout: 8000 })
    await page.locator("[data-create-menu] button").filter({ hasText: "Nouveau chantier" }).click()
    await page.waitForSelector("#cf-title", { timeout: 15000 })
    await page.click("#cf-title")
    await fakeKb(page, true)
    await page.waitForTimeout(350)
    const cov = await page.evaluate((KB) => {
      const root = document.querySelector("[data-sheet-root]")
      const backdrop = document.querySelector("[data-sheet-backdrop]")
      const panel = document.querySelector("[role=dialog]")
      const vh = innerHeight, kbTop = vh - KB
      const rr = root?.getBoundingClientRect(), br = backdrop?.getBoundingClientRect(), pr = panel?.getBoundingClientRect()
      const rootFull = !!rr && rr.top <= 1 && rr.bottom >= vh - 2 && rr.height >= vh - 2
      const backdropFull = !!br && br.top <= 1 && br.bottom >= vh - 2
      const gap = pr ? kbTop - pr.bottom : 999
      const panelToKb = !!pr && pr.bottom <= kbTop + 8 && pr.bottom >= kbTop - 24 && pr.height > 120
      const midY = pr && gap > 8 ? pr.bottom + gap / 2 : kbTop - 8
      const el = document.elementFromPoint(Math.round(innerWidth / 2), Math.round(midY))
      const covered = gap <= 8 || !!(el && (el.closest("[data-sheet-root]") || el.closest("[role=dialog]")))
      const mapHit = !!(el && (el.closest(".ch-map") || el.closest(".leaflet-container") || el.closest("[data-ch-peek]")))
      return {
        rootFull, backdropFull, panelToKb, covered, mapHit, gap: Math.round(gap),
        panelTop: pr ? Math.round(pr.top) : null, panelBottom: pr ? Math.round(pr.bottom) : null,
        kbTop, vh, hit: el ? (el.getAttribute("data-sheet-root") || el.getAttribute("data-sheet-backdrop") || el.className || el.tagName).toString().slice(0, 80) : null,
      }
    }, KB)
    check("feuille : l'overlay (fond) couvre tout l'écran, y compris derrière le clavier", cov.rootFull && cov.backdropFull, JSON.stringify(cov))
    check("feuille : le panneau descend jusqu'au clavier (pas de trou au milieu)", cov.panelToKb, JSON.stringify(cov))
    check("feuille : aucun bout de la page (carte) n'est visible entre la feuille et le clavier", cov.covered && !cov.mapHit, JSON.stringify(cov))
    await fakeKb(page, false)
    await page.evaluate(() => document.querySelector('[aria-label="Fermer"], [aria-label="Annuler"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })))
    await page.getByRole("button", { name: /Annuler|Fermer/ }).first().click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(400)

    /* ---- Menu + : entrée Relances ouvre la page existante ---- */
    await page.goto(`${H.BASE}/reception`)
    await page.waitForSelector("[data-create-btn]", { timeout: 20000 })
    await page.waitForTimeout(300)
    await page.click("[data-create-btn]")
    await page.waitForSelector("[data-create-menu]", { timeout: 8000 })
    const hasRel = await page.locator("[data-create-menu] button").filter({ hasText: "Relances" }).count()
    check("menu + : l'entrée Relances est présente", hasRel === 1)
    await page.locator("[data-create-menu] button").filter({ hasText: "Relances" }).click()
    await page.waitForFunction(() => document.querySelector("[data-page]")?.getAttribute("data-page") === "rel", { timeout: 10000 })
    const onRel = await page.evaluate(() => document.querySelector("[data-page]")?.getAttribute("data-page") === "rel")
    check("menu + : Relances ouvre la page Relances existante", !!onRel && page.url().includes("relance"))
  } finally {
    await browser.close()
    H.stop()
  }
  console.log(`\n${ok} ok, ${ko} ko`)
  if (ko) process.exit(1)
}

main().catch(e => { console.error(e); try { H.stop() } catch { /* */ } process.exit(1) })
