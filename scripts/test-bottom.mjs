#!/usr/bin/env node
/* update71 · Bas d'écran sur iPhone (WebKit) : 375, 393 et 430 px, PWA avec safe area simulée (encoche 47 px, home indicator 34 px).
   Parcourt toutes les pages, les feuilles des Réglages, les feuilles ouvertes depuis les listes et le menu +,
   scrolle tout en bas et vérifie que le dernier élément est ENTIÈREMENT visible au-dessus de la barre flottante et du home indicator ;
   dans les feuilles, le pied de page / la zone de saisie respectent la safe area et restent au-dessus du clavier (simulé).
   Supabase et /api simulés, aucune écriture en prod. Usage : npm run test:bottom   (SHOTS_DIR=… pour les captures) */
import { mkdirSync } from "node:fs"
import { webkit } from "playwright"
import { harness } from "./pw-harness.mjs"
import { chainTables, PROFILE71 } from "./fixtures-chaine.mjs"

const SHOTS = process.env.SHOTS_DIR || ""; if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const H = harness({ port: 5197 }), SAT = 47, SAB = 34
const SIZES = [[375, 812], [393, 852], [430, 932]].filter(([w]) => !process.env.ONLY || process.env.ONLY.split(",").includes(String(w)))
const PAGES = ["reception", "agenda", "chantiers", "devis", "factures", "clients", "equipe", "relance", "parametres"]
let ok = 0, ko = 0
const check = (name, cond, extra = "") => { if (cond) { ok++; console.log(`✔ ${name}`) } else { ko++; console.log(`✘ ${name} ${extra}`) } }

/* Mesure dans la page : racine = [data-page] actif ou feuille du dessus. Scrolle chaque zone de défilement tout en bas puis
   renvoie le bas du dernier élément visible (texte, bouton, champ), la limite (haut de la barre ou bas sûr) et le pied de feuille. */
const MEASURE = async (page, kind) => page.evaluate(async ([kind, SAB]) => {
  const vh = innerHeight, vis = el => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false
    for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity < .05 || e.getAttribute("aria-hidden") === "true") return false } return true }
  let root
  if (kind === "page") root = [...document.querySelectorAll("[data-page]")].filter(vis).pop()
  else root = [...document.querySelectorAll("[role=dialog][aria-modal=true], [role=alertdialog]")].filter(vis).pop()
  if (!root) return { err: "racine introuvable" }
  const scrollers = [...root.querySelectorAll("*")].filter(e => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 2 && vis(e))
  for (const s of scrollers) s.scrollTop = s.scrollHeight
  await new Promise(r => setTimeout(r, 450))
  for (const s of scrollers) s.scrollTop = s.scrollHeight
  await new Promise(r => setTimeout(r, 150))
  const bar = document.querySelector("[data-bar-pill]"), barTop = bar && vis(bar) && kind === "page" ? bar.getBoundingClientRect().top : vh
  const limit = Math.min(barTop - 2, vh - SAB + 1)
  const leaves = [...root.querySelectorAll("button, a, input, textarea, select, [role=button], [role=switch], p, span, h1, h2, h3, li, label, img, svg")]
    .filter(e => !e.closest("[data-bar-pill]") && !e.closest("[data-sheet-grab]") && !e.closest(".maplibregl-map, .leaflet-container, .mapboxgl-map, [data-map]") && vis(e))
    .filter(e => { const sc = e.closest("*"); for (let p = e.parentElement; p && p !== root.parentElement; p = p.parentElement) { const cs = getComputedStyle(p); if (/(hidden|auto|scroll|clip)/.test(cs.overflowY) && p !== e) { const pr = p.getBoundingClientRect(), r = e.getBoundingClientRect(); if (r.top >= pr.bottom - 1 || r.bottom <= pr.top + 1) return false } } return !!sc })
  let last = null, lb = -1
  for (const e of leaves) { const r = e.getBoundingClientRect(); if (r.bottom > lb && r.top < vh) { lb = r.bottom; last = e } }
  const rootR = root.getBoundingClientRect()
  const field = [...root.querySelectorAll("textarea, input[type=text], input:not([type])")].filter(vis).pop()
  return { lastBottom: Math.round(lb), limit: Math.round(limit), rootBottom: Math.round(rootR.bottom), vh, label: root.getAttribute("aria-label") || root.getAttribute("data-page") || "",
    txt: last ? (last.getAttribute("aria-label") || last.innerText || last.tagName).trim().slice(0, 40) : "", field: field ? Math.round(field.getBoundingClientRect().bottom) : null }
}, [kind, SAB])

const topSheet = page => page.evaluate(() => { const d = [...document.querySelectorAll("[role=dialog][aria-modal=true]")].filter(e => e.getBoundingClientRect().height > 40).pop(); return d ? (d.getAttribute("aria-label") || "feuille") : null })
async function closeSheets(page) {
  for (let i = 0; i < 4 && await topSheet(page); i++) {
    const btn = page.locator("[role=dialog][aria-modal=true]").last().getByRole("button", { name: /^(Fermer|Retour|Annuler)$/ }).first()
    if (await btn.count() && await btn.isVisible().catch(() => false)) await btn.click({ timeout: 2000 }).catch(() => {}); else await page.keyboard.press("Escape")
    await page.waitForTimeout(450)
  }
}
async function sheetCheck(page, tag, W) {
  const m = await MEASURE(page, "sheet")
  if (m.err) return check(`${W} · feuille ${tag} : ouverte`, false, m.err)
  check(`${W} · feuille « ${m.label || tag} » : ne dépasse pas le bas de l'écran`, m.rootBottom <= m.vh + 1, JSON.stringify(m))
  check(`${W} · feuille « ${m.label || tag} » : dernier élément au-dessus du home indicator`, m.lastBottom <= m.limit, JSON.stringify(m))
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/bas-${W}-feuille-${tag.replace(/\W+/g, "-")}.png` })
}

async function main() {
  await H.start()
  const browser = await webkit.launch()
  try {
    for (const [W, HT] of SIZES) {
      const { ctx, page } = await H.newPage(browser, { width: W, height: HT, scale: 2, tables: chainTables(), profile: PROFILE71 })
      await ctx.addInitScript(([t, b]) => { try { Object.defineProperty(navigator, "standalone", { get: () => true }) } catch { /* */ }
        const st = () => { const s = document.createElement("style"); s.textContent = `:root{--sat:${t}px!important;--sab:${b}px!important}`; document.head.appendChild(s) }
        if (document.head) st(); else document.addEventListener("DOMContentLoaded", st) }, [SAT, SAB])
      // 1. pages
      for (const p of PAGES) {
        await page.goto(`${H.BASE}/${p}`); await page.waitForSelector(p === "parametres" ? "[data-page-scroll]" : "[data-bar-pill]", { timeout: 20000 }) // passe 2 : Réglages sans barre d'onglets; await page.waitForTimeout(3200) /* passe 2 : laisse le préchargement des onglets finir avant de mesurer */
        await closeSheets(page)
        const m = await MEASURE(page, "page")
        check(`${W} · page ${p} : dernier élément entièrement visible au-dessus de la barre et du home indicator`, !m.err && m.lastBottom <= m.limit, JSON.stringify(m))
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/bas-${W}-page-${p}.png` })
      }
      // 2. feuilles des Réglages (Entreprise, Clients, Équipe, Relances, Factures, conformité, agents…)
      // passe 2 : Réglages est une page sans barre d'onglets (maquette 08-Reglages)
      await page.goto(`${H.BASE}/parametres`); await page.waitForSelector("[data-page-scroll]"); await page.waitForTimeout(1500)
      const rows = await page.locator("[data-page] [role=button][aria-label], [data-page] button[aria-label]").evaluateAll(els => els.filter(e => e.getBoundingClientRect().height > 30).map(e => e.getAttribute("aria-label")))
      const seen = new Set()
      for (const name of rows.filter((v, i, a) => a.indexOf(v) === i && !/Réglages|Fermer|Retour|Déconnexion|Se déconnecter|Supprimer|Tester|Activer|Désactiver/i.test(v)).slice(0, 18)) {
        const el = page.locator(`[data-page] [aria-label="${name.replace(/"/g, '\\"')}"]`).first()
        if (!await el.isVisible().catch(() => false)) continue
        await el.scrollIntoViewIfNeeded().catch(() => {}); await el.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(700)
        const t = await topSheet(page)
        if (t && !seen.has(t)) { seen.add(t); await sheetCheck(page, `reglages-${name}`, W) }
        await closeSheets(page)
        if (!page.url().includes("/parametres")) { await page.goto(`${H.BASE}/parametres`); await page.waitForTimeout(1200) }
      }
      check(`${W} · Réglages : au moins 4 feuilles parcourues`, seen.size >= 4, [...seen].join(", "))
      // 3. assistant (zone de saisie) + clavier simulé
      await page.goto(`${H.BASE}/reception?chat`); await page.waitForTimeout(1800)
      await sheetCheck(page, "assistant", W)
      const a = await MEASURE(page, "sheet")
      check(`${W} · assistant : zone de saisie au-dessus du home indicator`, a.field != null && a.field <= HT - SAB, JSON.stringify(a))
      await page.evaluate(() => { document.documentElement.style.setProperty("--kb", "300px"); document.documentElement.classList.add("kb-open") }); await page.waitForTimeout(500)
      const k = await MEASURE(page, "sheet")
      check(`${W} · assistant : zone de saisie au-dessus du clavier (300 px simulés)`, k.field != null && k.field <= HT - 300 + 1, JSON.stringify(k))
      await page.evaluate(() => { document.documentElement.style.setProperty("--kb", "0px"); document.documentElement.classList.remove("kb-open") })
      // 4. feuilles ouvertes depuis les listes : devis, facture, client
      for (const [p, sel, tag] of [["devis", "[data-page] [role=button], [data-page] li button, [data-page] button", "devis"], ["factures", "[data-page] [role=button], [data-page] button", "facture"], ["clients", "[data-page] button, [data-page] [role=button]", "client"]]) {
        await page.goto(`${H.BASE}/${p}`); await page.waitForTimeout(1800)
        const cands = page.locator(sel)
        const n = Math.min(await cands.count(), 40)
        let opened = false
        for (let i = 0; i < n && !opened; i++) { const c = cands.nth(i); const b = await c.boundingBox().catch(() => null); if (!b || b.height < 48 || b.y < 120) continue
          if (tag !== "client" && !/€/.test(await c.innerText().catch(() => ""))) continue
          const before = page.url()
          await c.click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(800); if (await topSheet(page)) opened = true
          else if (tag === "client" && await page.locator("[data-page]").last().innerText().then(t => /Appeler|Nouveau devis|Historique|Modifier/.test(t)).catch(() => false)) opened = "page"
          if (!opened && page.url() !== before) await page.goto(before) }
        if (opened === "page") { const m = await MEASURE(page, "page"); check(`${W} · fiche client : dernier élément visible au-dessus de la barre`, !m.err && m.lastBottom <= m.limit, JSON.stringify(m)); if (SHOTS) await page.screenshot({ path: `${SHOTS}/bas-${W}-fiche-client.png` }) }
        else if (opened) await sheetCheck(page, tag, W); else check(`${W} · feuille ${tag} : ouverte depuis la liste`, false)
        if (tag === "devis") { const t = await page.locator("[role=dialog]").last().innerText().catch(() => ""); check(`${W} · liste Devis → aperçu du devis (et non la fiche client)`, /Devis\s*N°|DEVIS N°/i.test(t) && /Voir le PDF|Envoyer|Autres actions/.test(t), t.slice(0, 160).replace(/\n/g, " | ")) }
        await closeSheets(page)
      }
      // 5. passe 2 (maquettes) : création depuis la capsule + de chaque page (plus de menu + dans la barre)
      for (const [pg, re] of [["agenda", /Nouveau rendez-vous/], ["equipe", /Ajouter|Inviter|Nouveau/], ["clients", /Nouveau|Ajouter/]]) {
        await page.goto(`${H.BASE}/${pg}`); await page.waitForTimeout(1500); await closeSheets(page)
        const b = page.getByRole("button", { name: re }).first()
        if (!await b.isVisible().catch(() => false)) continue
        await b.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(1000)
        if (await topSheet(page)) await sheetCheck(page, `creer-${pg}`, W)
        await closeSheets(page)
      }
      // 6. Réglages → retour : fondu sur place, aucune page ne glisse horizontalement, jamais d'écran vide
      if (W === 393) {
        await page.goto(`${H.BASE}/reception`); await page.waitForTimeout(1500)
        const sample = () => page.evaluate(() => new Promise(res => { const out = []; let n = 0
          const f = () => { const ps = [...document.querySelectorAll("[data-slot]")].filter(e => getComputedStyle(e).visibility !== "hidden" && +getComputedStyle(e).opacity > .02 && e.getBoundingClientRect().height > 0)
            out.push({ n: ps.length, x: Math.max(0, ...ps.map(e => Math.abs(e.getBoundingClientRect().left))) }); if (++n < 24) requestAnimationFrame(f); else res(out) }; requestAnimationFrame(f) }))
        await page.getByRole("button", { name: "Réglages" }).first().click(); const go = await sample(); await page.waitForTimeout(600)
        await page.getByRole("button", { name: /^(Retour|Terminé)$/ }).first().click(); const back = await sample(); await page.waitForTimeout(600)
        const all = [...go, ...back]
        check(`${W} · Réglages ↔ retour : aucun glissement horizontal (fondu)`, all.every(f => f.x < 2), JSON.stringify(all.filter(f => f.x >= 2).slice(0, 3)))
        check(`${W} · Réglages ↔ retour : jamais d'écran vide`, all.every(f => f.n >= 1), JSON.stringify(all.map(f => f.n)))
      }
      await ctx.close()
    }
  } finally { await browser.close(); await H.stop() }
  console.log(`\n${ok} ok, ${ko} en échec`); process.exit(ko ? 1 : 0)
}
main().catch(e => { console.error(e); H.stop?.(); process.exit(1) })
