#!/usr/bin/env node
/* update70 · Tests WebKit iPhone de la barre flottante façon Revolut (Supabase et /api simulés, aucune écriture en prod).
   - la barre flotte (marges latérales, décollée du bas, fond translucide flouté) ;
   - le contenu défile SOUS la barre et l'en-tête, et le dernier élément reste atteignable ;
   - la pastille de l'onglet actif glisse d'un onglet à l'autre ;
   - changement d'onglet : fondu court sur place, aucune coupure (pas de glissement, jamais de trou noir) ;
   - non-régression update69 : onglets gardés montés (défilement conservé), menu « + » ancré à la barre ; squelette au chargement.
   Usage : npm run test:navbar   (SHOTS_DIR=… pour les captures) */
import { mkdirSync } from "node:fs"
import { webkit } from "playwright"
import { harness } from "./pw-harness.mjs"

const SHOTS = process.env.SHOTS_DIR || ""; if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const H = harness({ port: 5198 }), W = 390, HT = 844
let ok = 0, ko = 0
const check = (name, cond, extra = "") => { if (cond) { ok++; console.log(`✔ ${name}`) } else { ko++; console.log(`✘ ${name} ${extra}`) } }
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }) }

/** conteneur de défilement de la page affichée */
const SCROLLER = `(() => { const slot = document.querySelector("[data-page]"); if (!slot) return null
  for (const el of slot.querySelectorAll("*")) { const cs = getComputedStyle(el); if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) return el } return null })()`

async function main() {
  await H.start()
  const browser = await webkit.launch()
  try {
    const { ctx, page } = await H.newPage(browser)
    await page.goto(`${H.BASE}/reception`); await page.waitForSelector("[data-bar-pill]", { timeout: 20000 }); await page.waitForTimeout(2500)
    await shot(page, "navbar-reception")
    // 1. barre flottante
    const bar = await page.evaluate(() => { const el = document.querySelector("[data-bar-pill]"), r = el.getBoundingClientRect(), cs = getComputedStyle(el)
      return { l: r.left, r: r.right, b: r.bottom, t: r.top, h: r.height, rad: parseFloat(cs.borderTopLeftRadius), bf: cs.backdropFilter || cs.webkitBackdropFilter || "", bg: cs.backgroundColor } })
    check("barre : marges latérales 16 px", bar.l >= 14 && bar.l <= 22 && W - bar.r >= 14 && W - bar.r <= 22, JSON.stringify(bar))
    check("barre : décollée du bas", HT - bar.b >= 10, `écart ${HT - bar.b}`)
    check("barre : pilule (coins entièrement arrondis)", bar.rad >= bar.h / 2 - 1, `${bar.rad}/${bar.h}`)
    check("barre : fine (≤ 66 px)", bar.h <= 66, String(bar.h))
    check("barre : fond translucide + flou", /blur/.test(bar.bf) && /(rgba\(.*,\s*0?\.\d+\)|\/\s*0?\.\d+\))/.test(bar.bg), `${bar.bf} ${bar.bg}`)
    check("barre : bouton + intégré dans la pilule", await page.evaluate(() => { const p = document.querySelector("[data-bar-pill]").getBoundingClientRect(), b = document.querySelector("[data-create-btn]").getBoundingClientRect(); return b.top >= p.top && b.bottom <= p.bottom && Math.abs((b.left + b.right) / 2 - (p.left + p.right) / 2) < 2 }))
    // 2. contenu edge-to-edge : la zone de défilement va jusqu'en bas de l'écran (sous la barre) et le dernier élément est atteignable
    const sc = await page.evaluate(`(() => { const el = ${SCROLLER}; if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, sh: el.scrollHeight, ch: el.clientHeight } })()`)
    check("contenu : la page défile (données de démo)", !!sc && sc.sh > sc.ch, JSON.stringify(sc))
    check("contenu : zone de défilement jusqu'en bas de l'écran, sous la barre", !!sc && sc.bottom >= HT - 1 && sc.top <= 1, JSON.stringify(sc))
    await page.evaluate(`(() => { const el = ${SCROLLER}; el.scrollTop = 180 })()`); await page.waitForTimeout(300)
    const head = await page.evaluate(() => { const h = document.querySelector("[data-page] [data-mobile-head]"); if (!h) return null; const r = h.getBoundingClientRect(), cs = getComputedStyle(h); return { top: r.top, bf: cs.backdropFilter || cs.webkitBackdropFilter || "", bg: cs.backgroundColor } })
    check("en-tête : reste fixe en haut pendant le défilement", !!head && Math.abs(head.top) < 1, JSON.stringify(head))
    check("en-tête : translucide flouté (le contenu passe dessous)", !!head && /blur/.test(head.bf) && /(rgba\(.*,\s*0?\.\d+\)|\/\s*0?\.\d+\))/.test(head.bg), JSON.stringify(head))
    await shot(page, "navbar-reception-scroll-sous-entete")
    // sous la barre : en milieu de défilement, un élément de contenu se trouve derrière la barre (rien n'est coupé par un fond opaque)
    const under = await page.evaluate(() => { const p = document.querySelector("[data-bar-pill]").getBoundingClientRect(); const x = p.left + 30, y = (p.top + p.bottom) / 2
      return document.elementsFromPoint(x, y).some(e => !!e.closest("[data-page]") && !e.matches("[data-page]")) })
    check("contenu : visible derrière la barre translucide", under)
    await shot(page, "navbar-contenu-sous-la-barre")
    await page.evaluate(`(() => { const el = ${SCROLLER}; el.scrollTop = el.scrollHeight })()`); await page.waitForTimeout(400)
    const last = await page.evaluate(`(() => { const el = ${SCROLLER}; const p = document.querySelector("[data-bar-pill]").getBoundingClientRect()
      const items = [...el.querySelectorAll("button, a, [role=button]")].filter(e => { const r = e.getBoundingClientRect(); return r.height > 0 && r.width > 0 })
      const r = items[items.length - 1].getBoundingClientRect(); return { lastBottom: r.bottom, barTop: p.top, txt: (items[items.length - 1].innerText || "").slice(0, 40) } })()`)
    check("contenu : le dernier élément reste atteignable au-dessus de la barre", last.lastBottom <= last.barTop - 4, JSON.stringify(last))
    await shot(page, "navbar-reception-bas-de-page")
    await page.evaluate(`(() => { const el = ${SCROLLER}; el.scrollTop = 300 })()`)
    await page.waitForTimeout(6000) // pages principales préparées au repos (update69) : on mesure un changement d'onglet « à chaud »

    // 3. pastille glissante + 4. fondu sans coupure (échantillonné à chaque image)
    const tr = await page.evaluate(() => new Promise(res => {
      const pill = () => document.querySelector("[data-tab-pill]")?.getBoundingClientRect()
      const x0 = pill().left, target = document.querySelector('[data-tab="ag"]'), xt = target.getBoundingClientRect().left
      const frames = [], t0 = performance.now()
      target.click()
      const tick = () => {
        const t = performance.now() - t0, p = pill()
        const vis = [...document.querySelectorAll("[data-slot]")].filter(e => getComputedStyle(e).visibility !== "hidden")
        frames.push({ t, px: p ? p.left : null, slots: vis.map(e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e), m = new DOMMatrixReadOnly(cs.transform === "none" ? undefined : cs.transform); return { k: e.dataset.slot, l: r.left, r: r.right, t: r.top, b: r.bottom, o: +cs.opacity, tx: m.m41 } }) })
        if (t < 520) requestAnimationFrame(tick); else res({ x0, xt, frames })
      }
      requestAnimationFrame(tick)
    }))
    const mids = tr.frames.filter(f => f.px != null && Math.abs(f.px - tr.x0) > 3 && Math.abs(f.px - tr.xt) > 3)
    check("pastille : glisse (positions intermédiaires entre les deux onglets)", mids.length >= 2, `x0=${tr.x0} xt=${tr.xt} intermédiaires=${mids.length} images=${tr.frames.length}`)
    const endPx = tr.frames[tr.frames.length - 1].px
    check("pastille : arrive sur l'onglet Agenda", Math.abs(endPx - tr.xt) < 2, `${endPx} vs ${tr.xt}`)
    const during = tr.frames.filter(f => f.slots.length > 1)
    check("fondu : les deux pages restent plein écran (aucun glissement horizontal)", tr.frames.every(f => f.slots.every(s => Math.abs(s.l) < .5 && Math.abs(s.r - W) < .5 && Math.abs(s.tx) < .5 && Math.abs(s.t) < .5 && Math.abs(s.b - HT) < .5)),
      JSON.stringify(tr.frames.find(f => f.slots.some(s => Math.abs(s.l) >= .5 || Math.abs(s.tx) >= .5)) || {}))
    check("fondu : jamais de trou (une page toujours opaque dessous)", tr.frames.every(f => f.slots.some(s => s.o >= .999)), JSON.stringify(tr.frames.find(f => !f.slots.some(s => s.o >= .999)) || {}))
    const endT = (during[during.length - 1]?.t ?? 0)
    check("fondu : court (≤ 320 ms tap compris) puis une seule page visible", endT <= 320 && tr.frames[tr.frames.length - 1].slots.length === 1, `fin du fondu à ${Math.round(endT)} ms`)
    check("fondu : la page Agenda s'affiche", await page.evaluate(() => document.querySelector("[data-page]")?.getAttribute("data-page") === "ag"))
    await page.waitForTimeout(300); await shot(page, "navbar-agenda-pastille")
    // 5. onglets gardés montés : retour sur Réception, défilement conservé
    await page.click('[data-tab="rec"]'); await page.waitForTimeout(500)
    const kept = await page.evaluate(`(() => { const el = ${SCROLLER}; return { st: el ? el.scrollTop : -1, ag: !!document.querySelector('[data-slot="ag"]') } })()`)
    check("update69 : Agenda reste monté et Réception garde sa position de défilement", kept.ag && kept.st >= 290, JSON.stringify(kept))
    // 6. Factures puis Chantiers (carte) : pastille et page suivent
    await page.click('[data-tab="fac"]'); await page.waitForTimeout(500)
    check("onglet Factures : page Devis | Factures affichée", await page.evaluate(() => ["dev", "fac"].includes(document.querySelector("[data-page]")?.getAttribute("data-page"))))
    await page.click('[data-tab="ch"]'); await page.waitForTimeout(900)
    check("onglet Chantiers : page affichée sous la barre flottante", await page.evaluate(() => document.querySelector("[data-page]")?.getAttribute("data-page") === "ch" && !!document.querySelector("[data-bar-pill]")))
    await shot(page, "navbar-chantiers")
    // 7. menu « + » ancré à la barre (update69)
    await page.click("[data-create-btn]"); await page.waitForTimeout(600)
    const menu = await page.evaluate(() => { const m = document.querySelector("[data-create-menu]")?.getBoundingClientRect(), p = document.querySelector("[data-bar-pill]").getBoundingClientRect(); return m ? { mb: m.bottom, pt: p.top, mc: (m.left + m.right) / 2, pc: (p.left + p.right) / 2 } : null })
    check("menu + : ouvert juste au-dessus de la barre, centré", !!menu && menu.mb <= menu.pt - 6 && menu.mb >= menu.pt - 24 && Math.abs(menu.mc - menu.pc) < 2, JSON.stringify(menu))
    await shot(page, "navbar-menu-plus")
    await page.keyboard.press("Escape"); await page.waitForTimeout(600)
    check("menu + : se referme", !(await page.$("[data-create-menu]")))
    await ctx.close()
    // 8. squelette pendant le chargement d'une page (module encore en téléchargement) au lieu d'un écran vide
    {
      const { ctx, page } = await H.newPage(browser)
      await ctx.route(u => /\/chantiers\/ChantiersPage\.tsx/.test(u.pathname), async route => { await new Promise(r => setTimeout(r, 3000)); await route.continue() })
      await page.goto(`${H.BASE}/chantiers`); await page.waitForSelector("[data-bar-pill]", { timeout: 20000 }); await page.waitForTimeout(400)
      const sk = await page.evaluate(() => { const e = document.querySelector("[data-skeleton]"); return !!e && getComputedStyle(e).visibility !== "hidden" && e.getBoundingClientRect().height > 400 })
      check("chargement : squelette affiché (pas d'écran vide)", sk)
      await shot(page, "navbar-squelette-chargement")
      await page.waitForTimeout(5000)
      check("chargement : squelette retiré une fois la page prête", !(await page.$("[data-page] [data-skeleton]")) && await page.evaluate(() => document.querySelector("[data-page]")?.getAttribute("data-page") === "ch"))
      await ctx.close()
    }
  } finally { await browser.close(); H.stop() }
  console.log(`\n${ok} OK · ${ko} KO`)
  process.exit(ko ? 1 : 0)
}
main().catch(e => { console.error(e); H.stop(); process.exit(1) })
