// update73 · parcours Devis/Factures sur iPhone (WebKit 375/393/430) : aucune feuille ne disparaît, la feuille du dessous reste
// montée et immobile, aucun champ ne prend le focus tout seul (pas de clavier iOS automatique), le pied de feuille ne recouvre
// jamais le champ en cours de saisie (clavier 300 px simulé), « Nouveau client », bibliothèque de prestations, lignes, section,
// remise, aperçu. Usage : npm run test:devis-ui   (ONLY=375 pour une taille)
import { webkit } from "playwright"
import { harness } from "./pw-harness.mjs"
import { chainTables, PROFILE71 } from "./fixtures-chaine.mjs"
const H = harness({ port: 5192 }); let ok = 0, ko = 0
const check = (l, c, d = "") => { c ? ok++ : ko++; console.log(`${c ? "✔" : "✘"} ${l}${c ? "" : " · " + d}`) }
const SIZES = [[375, 812], [393, 852], [430, 932]].filter(([w]) => !process.env.ONLY || String(w) === process.env.ONLY)
await H.start(); const browser = await webkit.launch()
try {
  for (const [W, HT] of SIZES) {
    const { ctx, page, writes } = await H.newPage(browser, { width: W, height: HT, scale: 2, tables: { ...chainTables(), client_fiches: [], prestations: [] }, profile: PROFILE71 })
    // sondes : focus non provoqué par un geste (= clavier automatique), clavier simulé via visualViewport
    await ctx.addInitScript(() => {
      // focus « voulu » = le doigt a touché ce champ (ou son libellé), ou nouvelle ligne de devis créée par le bouton « + … »
      window.__kbH = 0; window.__auto = []; let tgt = null, kt = 0
      addEventListener("pointerdown", e => { tgt = e.target }, true); addEventListener("keydown", e => { if (e.key === "Tab") kt = performance.now() }, true)
      addEventListener("focusin", e => { const el = e.target; if (!el?.matches?.("input:not([type=checkbox]):not([type=radio]),textarea,select")) return
        const touched = tgt && (tgt === el || el.contains(tgt) || tgt.closest?.("label")?.contains(el)), tab = performance.now() - kt < 500, newLine = el.matches("[data-line] [data-f]")
        if (!touched && !tab && !newLine) window.__auto.push((el.getAttribute("aria-label") || el.placeholder || el.tagName).slice(0, 40)) }, true)
      const vv = window.visualViewport; if (vv) Object.defineProperty(vv, "height", { configurable: true, get: () => innerHeight - window.__kbH })
    })
    const T = `${W}`
    const dlg = name => page.locator("[role=dialog]").filter({ hasText: name })
    const edBox = () => page.evaluate(() => { const d = [...document.querySelectorAll("[role=dialog]")].find(e => /Nouveau devis|Devis n°|DEVIS/i.test(e.getAttribute("aria-label") || "") || /Choisir une prestation|Ajouter une prestation/.test(e.innerText || "")); if (!d) return null; const r = d.getBoundingClientRect(); return { top: Math.round(r.top), vis: getComputedStyle(d).visibility, op: getComputedStyle(d).opacity } })
    const watchEd = () => page.evaluate(() => { window.__edSeen = []; const f = () => { const d = [...document.querySelectorAll("[role=dialog]")].find(e => /Choisir une prestation|Ajouter une prestation|Choisir le client/.test(e.innerText || "")); window.__edSeen.push(d ? Math.round(d.getBoundingClientRect().top) : null); if (window.__edSeen.length < 140) requestAnimationFrame(f) }; f() })
    const edSeen = () => page.evaluate(() => window.__edSeen)
    const auto = () => page.evaluate(() => window.__auto.splice(0))
    const kb = async on => { await page.evaluate(h => { window.__kbH = h; visualViewport?.dispatchEvent(new Event("resize")); dispatchEvent(new Event("resize")) }, on ? 300 : 0); await page.waitForTimeout(600) }
    const typeIn = async (sel, txt) => { const l = page.locator(sel).last(); await l.click(); await l.fill(txt) }

    await page.goto(`${H.BASE}/devis`); await page.waitForSelector("[data-tab]", { timeout: 20000 }); await page.waitForTimeout(1500)
    await page.getByRole("button", { name: "Nouveau", exact: true }).first().click(); await page.waitForTimeout(1400)
    const e0 = await edBox()
    check(`${T} · « Nouveau devis » ouvert, sans clavier automatique`, !!e0 && (await auto()).length === 0, JSON.stringify(e0))

    // 1. client : sélecteur + « Nouveau client »
    if (!process.env.SKIP_CLIENT) { await watchEd(); await page.locator('button[aria-label^="Choisir le client"]').first().click(); await page.waitForSelector("[data-new-client-row]"); await page.waitForTimeout(500)
    check(`${T} · client : « Nouveau client » en tête, aucun clavier automatique`, /Nouveau client/.test(await page.locator("[data-new-client-row]").innerText()) && (await auto()).length === 0)
    await page.click("[data-new-client-row]"); await page.waitForSelector("[data-new-client]")
    check(`${T} · client : formulaire rapide sans clavier automatique`, (await auto()).length === 0)
    await typeIn('[aria-label="Nom du client"]', "Paul Martin"); await typeIn('[aria-label="Téléphone du client"]', "06 11 22 33 44")
    await page.getByRole("button", { name: /Enregistrer et choisir/ }).click(); await page.waitForTimeout(1200)
    const s1 = await edSeen()
    check(`${T} · client : « Nouveau devis » reste monté et immobile dessous`, s1.length > 20 && s1.every(t => t === s1[0]), JSON.stringify([...new Set(s1)]))
    check(`${T} · client : créé (fiche enregistrée) et choisi`, await page.locator('button[aria-label="Choisir le client (actuel : Paul Martin)"]').count() === 1 && writes.some(w => w.table === "client_fiches")) }

    // 2. prestation : bibliothèque vide → « Créer une prestation »
    await watchEd(); await page.locator("button").filter({ hasText: "Choisir une prestation" }).first().click(); await page.waitForTimeout(900)
    check(`${T} · prestations : feuille ouverte par-dessus, aucun clavier automatique`, await page.locator('[role=dialog][aria-label="Ajouter une prestation"]').count() === 1 && (await auto()).length === 0)
    await page.locator('[role=dialog][aria-label="Ajouter une prestation"] button').filter({ hasText: /Créer une prestation|Nouvelle/ }).first().click(); await page.waitForTimeout(1000)
    const pf = dlg("Nouvelle prestation")
    check(`${T} · « Nouvelle prestation » ouverte sans clavier automatique`, await pf.count() >= 1 && (await auto()).length === 0)
    const s2 = await edSeen()
    check(`${T} · prestations : « Nouveau devis » toujours monté et immobile dessous (pas de fond noir)`, s2.every(t => t === s2[0]) && s2[s2.length - 1] != null, JSON.stringify([...new Set(s2)]))
    await typeIn('[placeholder="Ex. Pose de ballon d\'eau chaude"]', "Pose mitigeur")
    // clavier 300 px : le champ en cours de saisie reste au-dessus du pied
    await page.locator('textarea[placeholder="Détail des travaux compris"]').click(); await kb(true)
    const ov = await page.evaluate(() => { const a = document.activeElement.getBoundingClientRect(), f = document.querySelector("[data-sheet-footer]")?.getBoundingClientRect(); return { a: Math.round(a.bottom), aTop: Math.round(a.top), f: f ? Math.round(f.top) : null, vh: innerHeight } })
    const eK = await page.evaluate(() => { const d = [...document.querySelectorAll("[role=dialog]")].find(e => /Nouveau devis|Devis n°/i.test(e.getAttribute("aria-label") || "")); return d ? Math.round(d.getBoundingClientRect().top) : null })
    check(`${T} · clavier ouvert : seule la feuille du dessus remonte, le devis dessous ne bouge pas (pas de fond noir)`, eK != null && eK === e0.top, JSON.stringify({ eK, top: e0.top }))
    check(`${T} · clavier ouvert : le pied ne recouvre pas le champ Description`, ov.f != null && ov.a <= ov.f + 1 && ov.f <= ov.vh - 300 + 2, JSON.stringify(ov))
    await page.locator('[aria-label="Type de prestation"] button, [aria-label="Type de prestation"] [role=radio]').filter({ hasText: "Fourniture" }).first().click(); await page.waitForTimeout(300)
    const typeVis = await page.evaluate(() => { const t = document.querySelector('[aria-label="Type de prestation"]')?.getBoundingClientRect(), f = document.querySelector("[data-sheet-footer]")?.getBoundingClientRect(); return t && f ? t.bottom <= f.top + 1 : false })
    check(`${T} · clavier ouvert : le choix « Type » n'est pas caché par le pied`, typeVis)
    await kb(false)
    check(`${T} · Fourniture : récapitulatif « 1 u × … » dans le pied`, /1 u × /.test(await page.locator("[data-presta-footer]").innerText()))
    const fb = await page.evaluate(() => { const f = document.querySelector("[data-sheet-footer]"); const bs = [...f.querySelectorAll("button")].map(b => b.getBoundingClientRect()); return { bg: getComputedStyle(f).backgroundColor, sameRow: bs.length === 2 && Math.abs(bs[0].top - bs[1].top) < 2, gap: bs.length === 2 ? Math.round(bs[1].left - bs[0].right) : -1, left: bs[0] ? Math.round(bs[0].left - f.getBoundingClientRect().left) : -1 } })
    check(`${T} · pied plein, boutons alignés côte à côte`, fb.bg !== "rgba(0, 0, 0, 0)" && fb.sameRow && fb.gap >= 4 && fb.gap <= 16, JSON.stringify(fb))
    await page.locator('[aria-label="Prix unitaire HT"]').last().click(); await page.locator('[aria-label="Prix unitaire HT"]').last().fill("120")
    await page.locator("[data-sheet-footer] button").filter({ hasText: "Ajouter à mes prestations" }).click(); await page.waitForTimeout(1300)
    check(`${T} · prestation créée, ajoutée au devis, sans clavier resté ouvert`, await page.locator('[data-f="l"]').evaluateAll(els => els.some(e => e.value === "Pose mitigeur")) && await page.evaluate(() => !document.activeElement?.matches?.("input,textarea")), await page.evaluate(() => document.activeElement?.outerHTML?.slice(0, 80)))

    // 3. lignes : main-d'œuvre, fourniture, forfait, section ; remise ; aperçu
    for (const k of ["À l'heure", "Fourniture", "Forfait", "Titre de partie"]) { await page.locator("button").filter({ hasText: new RegExp(`^${k}$`) }).last().click(); await page.waitForTimeout(350); await page.keyboard.type(k === "Titre de partie" ? "Salle de bain" : `Ligne ${k}`) }
    const nl = await page.locator('[data-f="l"]').count()
    check(`${T} · lignes main-d'œuvre / fourniture / forfait / section ajoutées`, nl >= 5, String(nl))
    // remise globale en € (bouton « Ajouter une remise », bascule % / €) et remise sur une ligne (menu « … » de la ligne)
    await page.locator("button").filter({ hasText: "Ajouter une remise" }).first().click(); await page.waitForTimeout(300)
    await page.locator('[data-remise-globale] [aria-label="Type de remise"] button, [data-remise-globale] [aria-label="Type de remise"] [role=radio]').filter({ hasText: "€" }).first().click()
    const rem = page.locator('[aria-label="Montant de la remise"]'); await rem.last().click(); await rem.last().fill("20"); await page.waitForTimeout(400)
    const txtEd = await page.locator("[role=dialog]").last().innerText()
    check(`${T} · remise globale 20 € : « Remise » puis « Total HT après remise »`, /Remise\s*\n?\s*− 20,00 €/.test(txtEd) && /Total HT après remise/.test(txtEd), txtEd.match(/Remise[^\n]*\n?[^\n]*/g)?.join(" | "))
    await page.locator('[aria-label="Actions de la ligne"]').first().click(); await page.waitForTimeout(300)
    await page.getByRole("menuitem", { name: /Faire une remise sur cette ligne/ }).or(page.locator("button").filter({ hasText: "Faire une remise sur cette ligne" })).first().click(); await page.waitForTimeout(300)
    const lr = page.locator('[aria-label="Remise de la ligne"]').first(); await lr.click(); await lr.fill("10"); await page.waitForTimeout(400)
    check(`${T} · remise sur une ligne : montant retiré affiché sous la ligne`, /− \d/.test(await page.locator("[data-line-remise]").first().innerText()))
    await page.evaluate(() => document.activeElement?.blur?.())
    const e1 = await edBox()
    check(`${T} · « Nouveau devis » n'a jamais bougé ni disparu pendant tout le parcours`, !!e1 && e1.top === e0.top && e1.vis === "visible", JSON.stringify({ e0, e1 }))
    await page.locator('[aria-label="Aperçu du devis"]').first().click(); await page.waitForTimeout(900)
    check(`${T} · aperçu du devis affiché`, await page.locator('[aria-label="Fermer l\'aperçu"]').count() === 1)
    await page.locator('[aria-label="Fermer l\'aperçu"]').click(); await page.waitForTimeout(500)
    check(`${T} · aucun focus automatique sur tout le parcours`, (await auto()).length === 0)
    const cut = await page.evaluate(() => [...document.querySelectorAll("[role=dialog] button, [role=dialog] label span")].filter(e => e.offsetParent && e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).textOverflow !== "ellipsis" && getComputedStyle(e).overflow !== "visible").map(e => e.innerText.slice(0, 30)).slice(0, 5))
    check(`${T} · aucun texte coupé dans l'éditeur`, cut.length === 0, JSON.stringify(cut))
    await page.screenshot({ path: `/tmp/akno-u73-devis-${W}.png` })
    await ctx.close()
  }
} catch (e) { check("exécution", false, String(e).slice(0, 400)) } finally { await browser.close(); H.stop() }
console.log(`${ok} ok, ${ko} en échec`); process.exit(ko ? 1 : 0)
