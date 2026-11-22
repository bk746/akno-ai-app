// update73 · sélecteur de client : « + Nouveau client » toujours visible, création rapide, client choisi pour le document.
// Usage : npm run test:client-picker
import { webkit } from "playwright"
import { harness } from "./pw-harness.mjs"
const H = harness({ port: 5194 }); let ok = 0, ko = 0
const check = (l, c, d = "") => { c ? ok++ : ko++; console.log(`${c ? "✔" : "✘"} ${l}${c ? "" : " · " + d}`) }
await H.start(); const browser = await webkit.launch()
try {
  const { page, writes } = await H.newPage(browser, { width: 375, height: 812, tables: { client_fiches: [] } })
  const openPicker = async () => { await page.locator('button[aria-label^="Choisir le client"]').first().click(); await page.waitForSelector("[data-new-client-row]", { timeout: 5000 }); await page.waitForTimeout(400) }
  const noFocus = () => page.evaluate(() => document.activeElement?.tagName !== "INPUT")
  // 1. Nouveau devis → Client → « Nouveau client » → création → choisi
  await page.goto(`${H.BASE}/devis`); await page.waitForSelector("[data-create-btn]", { timeout: 20000 }); await page.waitForTimeout(1200)
  await page.getByRole("button", { name: "Nouveau", exact: true }).first().click(); await page.waitForTimeout(1500)
  // 0. « Choisir une prestation » : la feuille du devis reste affichée (atténuée) dessous, pas de clavier automatique, pas de saut
  const ed = () => page.evaluate(() => { const d = [...document.querySelectorAll("[role=dialog]")].find(e => /Nouveau devis/.test(e.innerText || "")); const r = d?.getBoundingClientRect(); return d ? { top: Math.round(r.top), h: Math.round(r.height), vis: getComputedStyle(d).visibility } : null })
  const e0 = await ed(); const watch = page.evaluate(() => new Promise(res => { const seen = []; const t0 = performance.now(); const tick = () => { const d = [...document.querySelectorAll("[role=dialog]")].find(e => /Nouveau devis/.test(e.innerText || "")); seen.push(d ? Math.round(d.getBoundingClientRect().top) : null); if (performance.now() - t0 < 1500) requestAnimationFrame(tick); else res({ seen, sy: scrollY, focus: document.activeElement?.tagName }) }; tick() }))
  await page.locator("button").filter({ hasText: "Choisir une prestation" }).first().click()
  const wv = await watch, e1 = await ed()
  check("prestation : la feuille « Nouveau devis » reste montée et immobile sous la feuille prestations", !!e0 && !!e1 && wv.seen.every(t => t === e0.top) && await page.locator('[role=dialog][aria-label="Ajouter une prestation"]').count() === 1, JSON.stringify({ e0, e1, seen: [...new Set(wv.seen)] }))
  check("prestation : aucun champ ne prend le focus (pas de clavier iOS automatique), page non défilée", wv.focus !== "INPUT" && wv.sy === 0, JSON.stringify({ focus: wv.focus, sy: wv.sy }))
  await page.keyboard.press("Escape"); await page.waitForTimeout(700)
  await openPicker()
  check("client : feuille ouverte sans clavier automatique, devis toujours monté dessous", await noFocus() && await page.locator("[role=dialog]").filter({ hasText: "Nouveau devis" }).count() >= 1)
  check("devis : « Nouveau client » visible en tête de la liste", await page.locator("[data-new-client-row]").innerText().then(t => /Nouveau client/.test(t)))
  await page.click("[data-new-client-row]"); await page.waitForSelector("[data-new-client]")
  await page.fill('[aria-label="Nom du client"]', "Paul Martin"); await page.fill('[aria-label="Téléphone du client"]', "06 11 22 33 44"); await page.fill('[aria-label="Adresse du client"]', "5 rue Sommeiller, Annecy")
  await page.getByRole("button", { name: /Enregistrer et choisir/ }).click(); await page.waitForTimeout(1200)
  check("devis : retour au formulaire après l'enregistrement", await page.locator("[data-new-client]").count() === 0)
  check("devis : client créé et choisi", await page.locator('button[aria-label="Choisir le client (actuel : Paul Martin)"]').count() === 1)
  const w = writes.find(x => x.table === "client_fiches")
  check("devis : fiche client enregistrée (nom, téléphone, adresse)", !!w && JSON.stringify(w.body).includes("Paul Martin") && JSON.stringify(w.body).includes("06 11 22 33 44"), JSON.stringify(w || writes.map(x => x.table || x.api)).slice(0, 200))
  // 2. recherche tapée : « Créer "<texte>" », préremplissage téléphone
  await openPicker(); await page.fill('[aria-label="Rechercher un client"]', "07 98 76 54 32"); await page.waitForTimeout(300)
  check("recherche : « Créer « texte » » proposé", /Créer « 07 98 76 54 32 »/.test(await page.locator("[data-new-client-row]").innerText()))
  await page.click("[data-new-client-row]"); await page.waitForSelector("[data-new-client]")
  check("recherche numéro : téléphone prérempli, nom vide", await page.inputValue('[aria-label="Téléphone du client"]') === "07 98 76 54 32" && await page.inputValue('[aria-label="Nom du client"]') === "")
  await page.click("[data-new-client] button:has-text('Retour')"); await page.fill('[aria-label="Rechercher un client"]', "Lucie Bernard"); await page.click("[data-new-client-row]")
  check("recherche nom : nom prérempli", await page.inputValue('[aria-label="Nom du client"]') === "Lucie Bernard")
  await page.screenshot({ path: "/tmp/akno-u73-new-client.png" })
  // 3. même sélecteur depuis « Nouveau chantier » (menu +)
  await page.goto(`${H.BASE}/chantiers`); await page.waitForSelector("[data-create-btn]", { timeout: 20000 }); await page.waitForTimeout(1200)
  await page.click("[data-create-btn]"); await page.waitForTimeout(500); await page.locator("[data-create-menu] button").filter({ hasText: "Nouveau chantier" }).click(); await page.waitForTimeout(1500)
  await openPicker(); await page.click("[data-new-client-row]"); await page.fill('[aria-label="Nom du client"]', "Jean Roux")
  await page.getByRole("button", { name: /Enregistrer et choisir/ }).click(); await page.waitForTimeout(1200)
  check("chantier : client créé et choisi", await page.locator('button[aria-label="Choisir le client (actuel : Jean Roux)"]').count() === 1)
} catch (e) { check("exécution", false, String(e).slice(0, 300)) } finally { await browser.close(); H.stop() }
console.log(`${ok} ok, ${ko} en échec`); process.exit(ko ? 1 : 0)
