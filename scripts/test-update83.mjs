#!/usr/bin/env node
/* update83 · WebKit 393 px : carte de ligne pleine largeur, valeurs à droite, padding sous le footer. */
import { webkit } from "playwright"
import { mkdirSync } from "node:fs"
import { harness } from "./pw-harness.mjs"

const H = harness({ port: 5187 }), W = 393, HT = 852
let ok = 0, ko = 0
const check = (name, cond, extra = "") => { if (cond) { ok++; console.log(`✔ ${name}`) } else { ko++; console.log(`✘ ${name}${extra ? " " + extra : ""}`) } }

async function openLine(page) {
  await page.goto(`${H.BASE}/devis`)
  await page.waitForSelector("[data-qa='Nouveau']", { timeout: 20000 })
  await page.click("[data-qa='Nouveau']")
  await page.waitForSelector("[data-create-devis]", { timeout: 15000 })
  const form = page.locator("[data-line-form]")
  if (await form.count() === 0) {
    const add = page.getByRole("button", { name: /Ajouter un service/ })
    if (await add.count()) await add.first().click()
    await page.waitForSelector("[data-line-form]", { timeout: 8000 })
  }
}

async function main() {
  await H.start()
  const browser = await webkit.launch()
  try {
    const { page } = await H.newPage(browser, { width: W, height: HT, scale: 2 })
    await openLine(page)

    const geo = await page.evaluate(() => {
      const card = document.querySelector("[data-line-form]")
      const other = document.querySelector("#dv-g-client")?.closest("section")?.querySelector(".ig") || document.querySelector(".ig:not([data-line-form])")
      const head = document.querySelector("[data-line-head]")
      const handle = head?.querySelector("[aria-label='Déplacer la ligne']")
      const menu = head?.querySelector("[aria-label='Actions de la ligne']")
      const cr = card.getBoundingClientRect(), or_ = other.getBoundingClientRect()
      const pu = document.querySelector("[aria-label='Coût unitaire']")
      const unit = document.querySelector("[data-line-unit]")
      const rem = document.querySelector("[data-line-remise-type]")
      const chev = document.querySelector("[data-line-remise-chevron]")
      const desc = document.querySelector("[data-line-desc]")
      const style = el => el ? getComputedStyle(el) : null
      const rightOf = el => style(el)?.textAlign
      return {
        cardLeft: Math.round(cr.left), otherLeft: Math.round(or_.left),
        cardRight: Math.round(cr.right), otherRight: Math.round(or_.right),
        cardW: Math.round(cr.width), otherW: Math.round(or_.width),
        handleIn: !!(handle && head.contains(handle)),
        menuIn: !!(menu && head.contains(menu)),
        title: (head?.textContent || "").trim(),
        pu: (pu?.value || pu?.textContent || "").replace(/\s/g, " "),
        unitAlign: rightOf(unit), descAlign: rightOf(desc), remAlign: rightOf(rem),
        puAlign: rightOf(pu),
        chev: !!chev,
      }
    })
    check("carte alignée sur les autres (pleine largeur)", Math.abs(geo.cardLeft - geo.otherLeft) <= 2 && Math.abs(geo.cardRight - geo.otherRight) <= 2, JSON.stringify(geo))
    check("poignée et … dans l'en-tête « Ligne 1 »", geo.handleIn && geo.menuIn && /Ligne 1/.test(geo.title), JSON.stringify(geo))
    check("valeurs à droite, coût « 0,00 € », chevron Remise", geo.puAlign === "right" && geo.unitAlign === "right" && geo.descAlign === "right" && /0,00\s*€/.test(geo.pu) && geo.chev, JSON.stringify({ pu: geo.pu, puAlign: geo.puAlign, unit: geo.unitAlign, desc: geo.descAlign, chev: geo.chev }))

    /* Padding : les puces « Ou une ligne libre » ne passent pas sous le footer */
    const overlap = await page.evaluate(() => {
      const label = [...document.querySelectorAll("div")].find(el => (el.childNodes[0]?.textContent || "").trim() === "Ou une ligne libre :" || el.textContent.trim() === "Ou une ligne libre :")
      const chips = label?.nextElementSibling
      const target = chips || label
      const foot = document.querySelector("[data-devis-footer]")
      const scroll = document.querySelector("[data-devis-scroll]")
      if (scroll && target && foot) {
        const need = target.getBoundingClientRect().bottom - foot.getBoundingClientRect().top + 16
        if (need > 0) scroll.scrollTop += need
      }
      const a = target.getBoundingClientRect(), f = foot.getBoundingClientRect()
      const max = scroll ? scroll.scrollHeight - scroll.clientHeight : 0
      return { hidden: a.bottom > f.top + 2, aBottom: Math.round(a.bottom), fTop: Math.round(f.top), footH: Math.round(f.height), scrollTop: Math.round(scroll?.scrollTop || 0), max: Math.round(max), pad: scroll ? getComputedStyle(scroll).paddingBottom : "" }
    })
    check("ligne libre accessible au-dessus du footer", !overlap.hidden, JSON.stringify(overlap))

    mkdirSync("/workspace/akno-docs", { recursive: true })
    const shot = await page.evaluate(() => {
      const card = document.querySelector("[data-line-form]")
      const r = card.getBoundingClientRect()
      return { x: Math.max(0, r.x - 16), y: Math.max(0, r.y - 24), width: Math.min(innerWidth, r.width + 32), height: Math.min(innerHeight - 8, r.height + 48) }
    })
    await page.screenshot({ path: "/workspace/akno-docs/update83-ligne.png", clip: { x: 0, y: Math.max(0, shot.y), width: W, height: Math.min(HT, Math.max(420, shot.height + 80)) } })
  } finally {
    await browser.close()
    H.stop()
  }
  console.log(`\n${ok} ok, ${ko} ko`)
  process.exit(ko ? 1 : 0)
}

main().catch(err => { console.error(err); H.stop(); process.exit(1) })
