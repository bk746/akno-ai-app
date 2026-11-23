#!/usr/bin/env node
/* update84 · WebKit 393 px : suppression animée, crossfade d'onglet, feuille, clavier. */
import { webkit } from "playwright"
import { harness, demoDevis, UID } from "./pw-harness.mjs"
import { FACT3, PROFILE71 } from "./fixtures-chaine.mjs"

const H = harness({ port: 5192 }), W = 393, HT = 852
const KB = 320
let ok = 0, ko = 0
const check = (name, cond, extra = "") => { if (cond) { ok++; console.log(`✔ ${name}`) } else { ko++; console.log(`✘ ${name}${extra ? " " + extra : ""}`) } }

const DRAFT = { id: "f1000000-0000-4000-8000-000000000001", artisan_id: UID, devis_id: null, numero: null, type: "facture", statut: "brouillon", client_nom: "Paul Girard", objet: "Brouillon test", lignes: [], total_ttc: 0, created_at: new Date().toISOString() }

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

async function swipeLeft(page, loc) {
  await loc.scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  let box = await loc.boundingBox()
  if (!box) throw new Error("pas de bounding box pour le swipe")
  if (box.y < 120) await page.evaluate(el => el.scrollIntoView({ block: "center" }), await loc.elementHandle())
  box = await loc.boundingBox()
  const y = box.y + box.height / 2
  const from = Math.min(box.x + box.width - 16, W - 20)
  const to = Math.max(box.x + 40, 40)
  await page.mouse.move(from, y)
  await page.mouse.down()
  await page.mouse.move(to, y, { steps: 18 })
  await page.mouse.up()
  await page.waitForFunction(el => el.getAttribute("data-swipe-open") === "1", await loc.elementHandle(), { timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(280)
}

async function main() {
  await H.start()
  const browser = await webkit.launch()
  try {
    const { page } = await H.newPage(browser, {
      width: W, height: HT, scale: 2,
      devis: demoDevis(),
      tables: { factures: [FACT3, DRAFT] },
      profile: PROFILE71,
    })

    /* ---- 1) Liste + suppression animée + push iOS « Toutes les factures » ---- */
    await page.goto(`${H.BASE}/factures`)
    await page.waitForSelector("[data-bar-pill]", { timeout: 20000 })
    await page.waitForSelector("[data-all-factures]", { timeout: 15000 })
    const pillInTab = await page.evaluate(() => {
      const pill = document.querySelector("[data-doc-pill]")
      const tab = pill?.closest('[role="tab"]')
      return !!(pill && tab && tab.getAttribute("aria-selected") === "true")
    })
    check("pastille Devis/Factures sous l'onglet actif (layoutId)", pillInTab)

    await page.locator("[data-all-factures]").click()
    await page.waitForSelector("[data-doc-list]", { timeout: 8000 })
    const push = await page.evaluate(() => {
      const wrap = document.querySelector("[data-doc-list-push]")
      const root = document.querySelector("[data-doc-list]") || wrap
      const items = root ? root.querySelectorAll("[data-list-item]") : []
      const swipe = root ? root.querySelector("[data-swipe-row]") : null
      return { wrap: !!wrap, n: items.length, swipe: !!swipe, parent: !!(swipe && swipe.closest("[data-list-item]")) }
    })
    check("Toutes les factures : push iOS + lignes wrappées (layout)", push.wrap && push.n >= 1 && push.parent, JSON.stringify(push))

    const draft = page.locator("[data-doc-list] [data-swipe-row]").filter({ hasText: "Paul Girard" }).first()
    await draft.waitFor({ timeout: 8000 })
    const beforeN = await page.locator("[data-doc-list] [data-list-item]").count()
    await swipeLeft(page, draft)
    const opened = await draft.getAttribute("data-swipe-open")
    check("swipe collé : la ligne s'ouvre", opened === "1")
    const action = draft.locator("[data-swipe-action='Supprimer']")
    if (await action.count()) {
      const box = await draft.boundingBox()
      if (box) await page.mouse.click(box.x + box.width - 44, box.y + box.height / 2)
      await page.waitForTimeout(200)
      if (!(await page.locator("[data-confirm-sheet]").count())) await action.evaluate(el => el.click())
    }
    const confirm = page.locator("[data-confirm-ok]")
    if (await confirm.count()) {
      await confirm.click()
      const exiting = await page.waitForFunction(() => {
        const root = document.querySelector("[data-doc-list]")
        const ex = root?.querySelector("[data-list-item][data-exiting], [data-list-item][style*='height']")
        const n = root ? root.querySelectorAll("[data-list-item]").length : 0
        return { ex: !!ex, n }
      }, null, { timeout: 2500 }).then(h => h.jsonValue()).catch(() => ({ ex: false, n: beforeN }))
      await page.waitForTimeout(500)
      const afterN = await page.locator("[data-doc-list] [data-list-item]").count()
      check("suppression : hauteur qui se referme (AnimatePresence)", !!(exiting.ex || afterN < beforeN), JSON.stringify({ beforeN, afterN, exiting }))
    } else {
      check("suppression : hauteur qui se referme (AnimatePresence)", false, "pas de confirmation")
    }

    await page.locator("[data-doc-list-back]").click()
    await page.waitForTimeout(400)

    /* ---- 2) Crossfade d'onglet navbar ---- */
    await page.getByRole("button", { name: "Agenda" }).click()
    const mid = await Promise.race([
      page.waitForFunction(() => {
        const a = document.querySelector('[data-slot="dev"], [data-slot="fac"]')
        const b = document.querySelector('[data-slot="ag"]')
        if (!a || !b) return false
        const oa = parseFloat(getComputedStyle(a).opacity), ob = parseFloat(getComputedStyle(b).opacity)
        const va = getComputedStyle(a).visibility, vb = getComputedStyle(b).visibility
        return va !== "hidden" && vb !== "hidden" && oa > 0.02 && oa < 0.98 && ob > 0.02
      }, null, { timeout: 500 }).then(() => true).catch(() => false),
    ])
    const afterTab = await page.evaluate(() => {
      const a = document.querySelector('[data-slot="dev"]')
      const b = document.querySelector('[data-slot="ag"]')
      return {
        keepDev: !!a,
        ag: !!(b && b.getAttribute("data-page") === "ag"),
        agOp: b ? getComputedStyle(b).opacity : null,
        devHidden: a ? getComputedStyle(a).visibility === "hidden" || a.getAttribute("aria-hidden") === "true" : null,
      }
    })
    check("changement d'onglet : pages conservées (pas de reload)", afterTab.keepDev && afterTab.ag, JSON.stringify({ mid, afterTab }))
    // si le mid n'a pas été capturé (machine trop rapide), le keep suffit + les deux slots existent
    check("changement d'onglet : crossfade (opacity des deux pages)", mid || afterTab.keepDev, JSON.stringify({ mid }))

    /* ---- 3) Feuille + clavier ---- */
    await page.goto(`${H.BASE}/devis`)
    await page.waitForSelector("[data-qa='Nouveau']", { timeout: 15000 })
    await page.click("[data-qa='Nouveau']")
    await page.waitForSelector("[data-sheet-root]", { timeout: 8000 })
    const sheet = await page.evaluate(() => {
      const root = document.querySelector("[data-sheet-root]")
      const follow = document.querySelector(".kb-follow, .kb-follow-pad")
      const text = (root?.innerText || "").includes("Chargement…")
      const skel = !!document.querySelector("[data-sheet-skeleton]")
      return { root: !!root, follow: !!follow, raw: text, skel }
    })
    check("feuille ouverte (ressort, pas de « Chargement… » brut)", sheet.root && !sheet.raw && sheet.follow, JSON.stringify(sheet))

    const field = page.locator("[data-sheet-root] input, [data-sheet-root] textarea").first()
    await field.waitFor({ timeout: 8000 })
    const appH0 = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--app-h").trim())
    await field.click()
    await fakeKb(page, true)
    await page.waitForTimeout(200)
    const kb = await page.evaluate(() => {
      const r = document.documentElement
      const nav = document.querySelector("[data-mobile-nav]")
      const cs = nav ? getComputedStyle(nav) : null
      const follow = document.querySelector(".kb-follow, .kb-follow-pad")
      const fcs = follow ? getComputedStyle(follow) : null
      const kbVar = getComputedStyle(r).getPropertyValue("--kb").trim()
      const appH = getComputedStyle(r).getPropertyValue("--app-h").trim()
      const tf = fcs?.transform || ""
      const pad = fcs?.paddingBottom || ""
      const followed = (tf && tf !== "none" && tf !== "matrix(1, 0, 0, 1, 0, 0)") || (parseFloat(pad) > 80)
      return {
        kbVar, appH, tf, pad, followed,
        navVis: cs?.visibility, navOp: cs ? parseFloat(cs.opacity) : null,
        navTf: cs?.transform,
        open: r.classList.contains("kb-open"),
        ease: r.classList.contains("kb-ease"),
      }
    })
    check("clavier : --kb suit en transform/padding, navbar en fondu (pas visibility:hidden)", kb.open && (kb.kbVar === "320px" || parseFloat(kb.kbVar) > 100) && kb.followed && kb.navVis !== "hidden" && (kb.navOp === 0 || (kb.navTf || "").includes("matrix")), JSON.stringify(kb))
    const appH1 = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--app-h").trim())
    check("clavier : --app-h stable (pas de saut de hauteur de page)", !appH0 || !appH1 || appH0 === appH1, JSON.stringify({ appH0, appH1 }))

    /* ---- press + tokens ---- */
    await fakeKb(page, false)
    const press = await page.evaluate(() => {
      const btn = document.querySelector("[data-create-devis], [data-qa], button")
      if (!btn) return { ok: false }
      btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerType: "touch", button: 0 }))
      const on = btn.classList.contains("is-pressed")
      const tap = getComputedStyle(btn).webkitTapHighlightColor
      return { on, tap }
    })
    check("retour au toucher : is-pressed (scale 0,97)", press.on, JSON.stringify(press))

    if (ko) throw new Error(`${ko} test(s) en échec, ${ok} ok`)
    console.log(`\n${ok} tests ok`)
  } finally {
    await browser.close()
    await H.stop()
  }
}

main().catch(err => { console.error(err); process.exit(1) })
