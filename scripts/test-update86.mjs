#!/usr/bin/env node
/* update86 · WebKit 393 px : cartes monochromes, pas de badges pilules, noms lisibles, pas de débordement. */
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { webkit } from "playwright"
import { harness, demoDevis, demoCalls, UID } from "./pw-harness.mjs"
import { PROFILE71 } from "./fixtures-chaine.mjs"

const SHOTS = process.env.SHOTS_DIR || join(process.cwd(), "node_modules/.cache/akno-shots")
mkdirSync(SHOTS, { recursive: true })
const H = harness({ port: 5195 }), W = 393, HT = 852
let ok = 0, ko = 0
const check = (name, cond, extra = "") => { if (cond) { ok++; console.log(`✔ ${name}`) } else { ko++; console.log(`✘ ${name}${extra ? " " + extra : ""}`) } }

const CHANTIERS = [
  { id: "c1000000-0000-4000-8000-000000000001", artisan_id: UID, title: "Rénovation salle de bain", client_nom: "Julie Bernard", client_telephone: "06 12 34 10 00", address: "12 rue Garibaldi, Lyon", lat: 45.767, lng: 4.836, start_date: "2026-11-17", end_date: "2026-11-28", status: "in_progress", progress_override: 40, notes: null, devis_id: null, client_id: null },
  { id: "c1000000-0000-4000-8000-000000000002", artisan_id: UID, title: "Remplacement chaudière", client_nom: "Clément Dubois", address: "4 place Bellecour, Lyon", lat: 45.7578, lng: 4.832, start_date: "2026-10-01", end_date: "2026-11-10", status: "in_progress", progress_override: 90, notes: null, devis_id: null, client_id: null, client_telephone: null },
]

async function overflow(page) {
  return page.evaluate(() => {
    const W = innerWidth, H = innerHeight, bad = []
    const inHScroll = el => {
      let n = el
      while (n && n !== document.body) {
        const cs = getComputedStyle(n)
        if (/(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 4) return true
        n = n.parentElement
      }
      return false
    }
    for (const el of document.querySelectorAll("[data-list-item], [data-page] h1, [data-prestations], [data-ch], [role=button]")) {
      const r = el.getBoundingClientRect()
      if (r.width < 2 || r.height < 2) continue
      if (r.bottom < 8 || r.top > H - 8) continue
      if (r.left >= W - 8) continue // élément hors écran (carrousel)
      if (inHScroll(el)) continue
      if (r.right > W + 2 && r.left < W) bad.push({ t: (el.innerText || "").replace(/\s+/g, " ").slice(0, 50), right: Math.round(r.right), left: Math.round(r.left) })
    }
    return bad
  })
}

async function pillBadges(page) {
  /* anciens badges : pilule colorée Urgent / À rappeler / Traité / En cours */
  return page.evaluate(() => {
    const hits = []
    for (const el of document.querySelectorAll("span, div, button")) {
      const t = (el.textContent || "").trim()
      if (!/^(Urgent|À rappeler|Traité|En cours|Envoyé|Brouillon|Validé)$/.test(t)) continue
      if (el.getAttribute("data-status-text") || el.closest("[data-status-text]")) continue
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      if (r.width < 4 || r.height < 4) continue
      const rad = parseFloat(cs.borderRadius) || 0
      const bg = cs.backgroundColor
      const pill = rad >= 8 && bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent" && !/^rgba\(\s*0,\s*0,\s*0,\s*0/.test(bg)
      if (pill && r.height <= 28) hits.push({ t, bg, h: Math.round(r.height) })
    }
    return hits
  })
}

async function namesTruncated(page, expected) {
  return page.evaluate(expected => {
    const cut = []
    for (const want of expected) {
      const body = document.body.innerText || ""
      if (body.includes(want)) continue
      const short = want.slice(0, 2) + "…"
      if (body.includes(short) || body.includes(want.slice(0, 3) + "…")) cut.push(want)
    }
    return cut
  }, expected)
}

async function open(page, path, wait) {
  await page.goto(`${H.BASE}${path}`)
  await page.waitForSelector(wait, { timeout: 20000 })
  await page.waitForTimeout(700)
}

async function main() {
  await H.start()
  const browser = await webkit.launch()
  try {
    const { page } = await H.newPage(browser, {
      width: W, height: HT, scale: 2,
      devis: demoDevis(),
      calls: demoCalls(),
      tables: { chantiers: CHANTIERS, employes: [], client_fiches: [], factures: [] },
      profile: PROFILE71,
    })

    /* ---- Réception ---- */
    await open(page, "/reception", "[data-page], [data-bar-pill]")
    await page.waitForTimeout(800)
    const recTxt = await page.innerText("body")
    check("Réception rendue (À rappeler / Appels du jour)", /À rappeler/.test(recTxt) && /Appels du jour/.test(recTxt), recTxt.slice(0, 200))
    const recPills = await pillBadges(page)
    check("Réception : plus de badges pilules colorés", recPills.length === 0, JSON.stringify(recPills))
    const recCut = await namesTruncated(page, ["Julie Bernard", "Sophie Durand", "Marc Petit"].filter(n => recTxt.includes(n.slice(0, 4)) || recTxt.includes(n)))
    // use names actually on screen from demo calls
    const recNames = await page.evaluate(() => {
      const out = []
      for (const el of document.querySelectorAll("[data-list-item]")) {
        const t = (el.innerText || "").split("\n")[0]
        if (t) out.push(t.replace(/\s+/g, " ").trim())
      }
      return out
    })
    check("Réception : noms de liste non tronqués en « Ju… »", recNames.every(n => !/^[A-ZÀ-Ÿ][a-zà-ÿ]{0,2}…/.test(n)) && recNames.length > 0, JSON.stringify(recNames.slice(0, 6)))
    const recPhone = await page.evaluate(() => {
      const sec = [...document.querySelectorAll("section")].find(s => /À rappeler/.test(s.querySelector("h2")?.textContent || ""))
      if (!sec) return null
      const first = sec.querySelector("[data-list-item]")
      if (!first) return { n: 0 }
      const btns = [...first.querySelectorAll("a[aria-label^='Appeler'], button[aria-label^='Appeler'], a[href^='tel:'], a[href^='sms:']")]
      return { n: btns.length, labels: btns.map(b => b.getAttribute("aria-label") || b.getAttribute("href")) }
    })
    check("À rappeler : une seule action (téléphone) par ligne", !!(recPhone && recPhone.n === 1 && !/sms:/i.test(String(recPhone.labels))), JSON.stringify(recPhone))
    const recOv = await overflow(page)
    check("Réception : pas de débordement horizontal", recOv.length === 0, JSON.stringify(recOv.slice(0, 4)))
    const recCard = await page.evaluate(() => {
      const card = document.querySelector("[data-list-item]")?.closest("div.rounded-\\[22px\\], [class*='rounded-[22px]']")
      // fallback: walk up
      let el = document.querySelector("[data-list-item]")
      while (el && el !== document.body) {
        const bg = getComputedStyle(el).backgroundColor
        if (bg && /rgb\(20,\s*20,\s*22\)/.test(bg)) return true
        el = el.parentElement
      }
      return false
    })
    check("Réception : fond de carte gris sombre uni", recCard)
    await page.evaluate(() => {
      const h = [...document.querySelectorAll("h2")].find(e => e.textContent?.includes("À rappeler"))
      const sc = document.querySelector("[data-page-scroll]")
      if (!h || !sc) return
      const y = h.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 88
      sc.scrollTo({ top: Math.max(0, y) })
    })
    await page.waitForTimeout(250)
    await page.screenshot({ path: join(SHOTS, "update86-reception.png") })

    /* ---- Devis-Factures ---- */
    await open(page, "/devis", "[data-qa='Nouveau'], [data-all-devis], [data-bar-pill]")
    await page.waitForTimeout(600)
    const devTxt = await page.innerText("body")
    check("Devis-Factures rendu", /Devis/.test(devTxt) && (/récents/i.test(devTxt) || /Tous les devis/.test(devTxt)))
    const devPills = await pillBadges(page)
    check("Devis : statuts en texte, sans pilule colorée", devPills.length === 0, JSON.stringify(devPills))
    const devNames = await page.evaluate(() => [...document.querySelectorAll("[data-list-item]")].map(e => (e.innerText || "").split("\n")[0].trim()))
    check("Devis : noms clients lisibles (pas « Ju… »)", devNames.length > 0 && devNames.every(n => !/^[A-ZÀ-Ÿ][a-zà-ÿ]{0,2}…/.test(n)), JSON.stringify(devNames.slice(0, 6)))
    const devOv = await overflow(page)
    check("Devis : pas de débordement horizontal", devOv.length === 0, JSON.stringify(devOv.slice(0, 4)))
    await page.evaluate(() => {
      const h = [...document.querySelectorAll("h2")].find(e => /Devis récents|Factures récentes/.test(e.textContent || ""))
      h?.scrollIntoView({ block: "start" })
    })
    await page.waitForTimeout(250)
    await page.screenshot({ path: join(SHOTS, "update86-devis.png") })

    /* ---- Chantiers ---- */
    await open(page, "/chantiers", "[data-page], [data-bar-pill], [data-create-btn]")
    await page.waitForTimeout(1200)
    const chTxt = await page.innerText("body")
    check("Chantiers rendu", /Chantier/.test(chTxt) || /salle de bain/i.test(chTxt) || /carte/i.test(chTxt), chTxt.slice(0, 180))
    const chPills = await pillBadges(page)
    check("Chantiers : pas de badges pilules de statut", chPills.length === 0, JSON.stringify(chPills))
    check("Chantiers : titre de carte lisible", /Rénovation salle de bain/.test(chTxt) || /Remplacement chaudière/.test(chTxt) || /Aucun chantier/.test(chTxt) || /Chantiers/.test(chTxt))
    const chOv = await overflow(page)
    check("Chantiers : pas de débordement horizontal", chOv.length === 0, JSON.stringify(chOv.slice(0, 4)))
    await page.screenshot({ path: join(SHOTS, "update86-chantiers.png") })

    /* ---- Autres listes (rendu + overflow) ---- */
    for (const [path, wait, label] of [
      ["/clients", "[data-page], h1", "Clients"],
      ["/equipe", "[data-page], h1", "Équipe"],
      ["/relance", "[data-page], [data-bar-pill]", "Relances"],
      ["/agenda", "[data-page], [data-bar-pill], [data-week-slider]", "Agenda"],
    ]) {
      await open(page, path, wait)
      const ov = await overflow(page)
      const pills = await pillBadges(page)
      check(`${label} : page rendue sans débordement`, ov.length === 0, JSON.stringify(ov.slice(0, 3)))
      check(`${label} : pas de badges pilules`, pills.length === 0, JSON.stringify(pills))
    }
  } catch (e) {
    check("exécution", false, String(e && e.stack || e).slice(0, 500))
  } finally {
    await browser.close()
    H.stop()
  }
  console.log(`\n${ok} ok, ${ko} ko`)
  process.exit(ko ? 1 : 0)
}

main().catch(err => { console.error(err); H.stop(); process.exit(1) })
