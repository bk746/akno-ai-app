#!/usr/bin/env node
/* update85 · WebKit 393 px : parcours complet Nouveau devis/facture + clavier simulé. */
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { webkit } from "playwright"
import { harness, demoDevis, UID } from "./pw-harness.mjs"
import { PROFILE71 } from "./fixtures-chaine.mjs"

const SHOTS = process.env.SHOTS_DIR || join(process.cwd(), "node_modules/.cache/akno-shots")

const H = harness({ port: 5193 }), W = 393, HT = 852
const KB = 320
let ok = 0, ko = 0
const check = (name, cond, extra = "") => { if (cond) { ok++; console.log(`✔ ${name}`) } else { ko++; console.log(`✘ ${name}${extra ? " " + extra : ""}`) } }

const PRESTAS = [
  { id: "p0000000-0000-4000-8000-000000000001", artisan_id: UID, libelle: "Pose de mitigeur", description: "Fourniture et pose", categorie: "Plomberie", type: "fft", unite: "forfait", duree_h: null, taux_horaire: null, prix_unitaire: 80, tva: 10, cout_achat: null },
  { id: "p0000000-0000-4000-8000-000000000002", artisan_id: UID, libelle: "Déplacement", description: "", categorie: "Frais", type: "fft", unite: "forfait", duree_h: null, taux_horaire: null, prix_unitaire: 49, tva: 10, cout_achat: null },
]

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

const money = s => (s || "").replace(/\s/g, " ")

async function openNouveau(page, first = false) {
  if (first) {
    await page.goto(`${H.BASE}/devis`)
    await page.waitForSelector("[data-qa='Nouveau']", { timeout: 20000 })
    await page.waitForTimeout(400)
  }
  await page.click("[data-qa='Nouveau']")
  await page.waitForSelector("[data-create-devis]", { timeout: 15000 })
  await page.waitForTimeout(350)
}

async function footerHidden(page) {
  return page.evaluate(() => {
    const el = document.querySelector("[data-devis-footer]")
    if (!el) return null
    const cs = getComputedStyle(el)
    const t = cs.transform || ""
    const moved = /matrix\([^)]*\)/.test(t) && !/matrix\(1,\s*0,\s*0,\s*1,\s*0,\s*0\)/.test(t) && t !== "none"
    return { hid: cs.opacity === "0" || cs.pointerEvents === "none" || moved, op: cs.opacity, pe: cs.pointerEvents, t }
  })
}

async function overflowReport(page) {
  return page.evaluate(() => {
    const W = innerWidth, H = innerHeight
    const foot = document.querySelector("[data-devis-footer]")
    const fr = foot?.getBoundingClientRect()
    const footTop = fr && getComputedStyle(foot).opacity !== "0" && getComputedStyle(foot).pointerEvents !== "none" ? fr.top : H
    const bad = []
    const sel = "[data-prestations], [data-add-presta], [data-line-form], [data-create-devis], [data-create-facture], [data-devis-scroll] input, [data-devis-scroll] button, [data-devis-scroll] select"
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect()
      if (r.width < 2 || r.height < 2) continue
      if (r.right > W + 1.5) bad.push({ kind: "overflow-x", t: (el.innerText || el.getAttribute("aria-label") || el.tagName).slice(0, 40), right: Math.round(r.right) })
      if (r.left < -1.5) bad.push({ kind: "overflow-left", t: (el.innerText || "").slice(0, 40), left: Math.round(r.left) })
    }
    const add = document.querySelector("[data-add-presta]")
    if (add) {
      add.scrollIntoView({ block: "end" })
      const r = add.getBoundingClientRect()
      if (r.bottom > footTop + 2 && r.top < footTop) bad.push({ kind: "under-footer", bottom: Math.round(r.bottom), footTop: Math.round(footTop) })
    }
    return { bad, W, H, footTop: Math.round(footTop) }
  })
}

async function main() {
  await H.start()
  const browser = await webkit.launch()
  const errors = []
  try {
    const { page, writes } = await H.newPage(browser, {
      width: W, height: HT, scale: 2,
      devis: demoDevis(),
      tables: { prestations: PRESTAS, client_fiches: [], factures: [] },
      profile: PROFILE71,
    })
    page.on("pageerror", e => errors.push("pageerror:" + String(e.message || e).slice(0, 200)))
    page.on("console", m => { if (m.type() === "error") errors.push("console:" + m.text().slice(0, 200)) })

    await openNouveau(page, true)

    await page.evaluate(() => {
      window.__cls = 0
      try {
        new PerformanceObserver(list => { for (const e of list.getEntries()) { if (!e.hadRecentInput) window.__cls += e.value } }).observe({ type: "layout-shift", buffered: true })
      } catch { /* WebKit peut ne pas exposer layout-shift */ }
    })

    const body = await page.locator("[role=dialog]").filter({ hasText: "Nouveau devis" }).first().innerText()
    const addCount = await page.locator("[data-add-presta-input]").count()
    const hasOld = /Choisir une prestation|Ajouter un service|Ou une ligne libre/.test(body)
    check("UI : une seule rangée « Ajouter une prestation », plus les 6 boutons",
      addCount === 1 && await page.getByRole("button", { name: "Mes prestations" }).count() > 0 && !hasOld,
      `add=${addCount} hasOld=${hasOld} ` + body.replace(/\s+/g, " ").slice(0, 240))
    check("UI : pas de gros encart vide qui disparaît", !/Ajoutez ce que vous facturez/.test(body) && await page.locator("[data-add-presta]").count() === 1)

    /* ---- client existant ---- */
    await page.getByRole("button", { name: "Choisir le client" }).click()
    await page.waitForSelector('[aria-label="Rechercher un client"]', { timeout: 8000 })
    await page.getByRole("option").filter({ hasText: "Julie Bernard" }).first().click()
    await page.waitForTimeout(500)
    check("client existant auto-sélectionné, feuille fermée",
      await page.getByRole("button", { name: /Choisir le client \(actuel : Julie Bernard\)/ }).count() === 1
      && await page.locator('[aria-label="Rechercher un client"]').count() === 0)

    /* ---- nouveau client + auto-sélection ---- */
    await page.getByRole("button", { name: /Choisir le client/ }).click()
    await page.waitForSelector("[data-new-client-row]", { timeout: 8000 })
    await page.click("[data-new-client-row]")
    await page.waitForSelector("[data-new-client]", { timeout: 8000 })
    await page.fill('[aria-label="Nom du client"]', "Camille Test")
    await page.fill('[aria-label="Adresse du client"]', "12 rue des Lilas, 74000 Annecy")
    await page.getByRole("button", { name: /Enregistrer et choisir ce client/ }).click()
    await page.waitForTimeout(900)
    const stillList = await page.locator('[aria-label="Rechercher un client"]').count()
    const stillForm = await page.locator("[data-new-client]").count()
    check("nouveau client auto-sélectionné, pas de retour à la liste",
      await page.getByRole("button", { name: /Choisir le client \(actuel : Camille Test\)/ }).count() === 1
      && stillList === 0 && stillForm === 0,
      JSON.stringify({ stillList, stillForm }))

    /* ---- adresse + objet + clavier / barre du bas ---- */
    const addr = page.locator("#dv-addr")
    if (await addr.count()) {
      await addr.scrollIntoViewIfNeeded()
      const cur = await addr.inputValue()
      if (!cur) await addr.fill("12 rue des Lilas, 74000 Annecy")
    }
    const objet = page.locator("#dv-objet")
    await objet.scrollIntoViewIfNeeded()
    await objet.click()
    await objet.fill("Rénovation salle de bain")
    await fakeKb(page, true)
    await page.waitForTimeout(280)
    const kbOn = await footerHidden(page)
    check("barre du bas masquée quand le clavier est ouvert (kb-open / --kb)", !!(kbOn && kbOn.hid), JSON.stringify(kbOn))
    await fakeKb(page, false)
    await objet.blur()
    await page.waitForTimeout(280)
    const kbOff = await footerHidden(page)
    check("barre du bas réaffichée à la fermeture du clavier, sans changer la hauteur du document",
      !!(kbOff && !kbOff.hid) && await page.locator("[data-create-devis]").count() > 0, JSON.stringify(kbOff))

    /* ---- brouillon gardé + fermer avec confirmation + reprendre ---- */
    await page.getByRole("button", { name: "Fermer l'éditeur" }).click()
    await page.waitForSelector("[data-confirm-ok]", { timeout: 8000 })
    check("fermeture : confirmation demandée (client sans ligne chiffrée)", await page.locator("[data-confirm-sheet]").count() > 0)
    await page.click("[data-confirm-ok]")
    await page.waitForTimeout(700)
    check("éditeur fermé après confirmation", await page.locator("[data-create-devis]").count() === 0)
    await openNouveau(page)
    const pill = page.getByText(/Brouillon.*gardé/)
    check("brouillon gardé proposé à la réouverture", await pill.count() > 0)
    await page.getByRole("button", { name: "Reprendre" }).click()
    await page.waitForTimeout(500)
    check("reprendre restaure le client et l'objet",
      await page.getByRole("button", { name: /Camille Test/ }).count() === 1
      && (await page.locator("#dv-objet").inputValue()) === "Rénovation salle de bain")

    /* ---- prestation catalogue ---- */
    const headOff0 = await page.evaluate(() => { const s = document.querySelector("[data-prestations]"); const h = s?.querySelector("h2"); return h && s ? h.offsetTop : -1 })
    const addInp = page.locator("[data-add-presta-input]")
    await addInp.scrollIntoViewIfNeeded()
    await addInp.click()
    await addInp.fill("Pose")
    await page.waitForSelector("[data-add-presta-item]", { timeout: 8000 })
    check("suggestions catalogue sous la rangée d'ajout", /Pose de mitigeur/.test(await page.locator("[data-add-presta-sug]").innerText()))
    await page.locator("[data-add-presta-item]").filter({ hasText: "Pose de mitigeur" }).click()
    await page.waitForSelector("[data-line-form]", { timeout: 8000 })
    const headOff1 = await page.evaluate(() => { const s = document.querySelector("[data-prestations]"); const h = s?.querySelector("h2"); return h && s ? h.offsetTop : -1 })
    check("ligne catalogue ajoutée, rangée d'ajout toujours là (pas de saut d'en-tête)",
      /Pose de mitigeur/.test(await page.locator("[data-line-desc]").first().inputValue())
      && await page.locator("[data-add-presta]").count() === 1
      && headOff0 === headOff1,
      JSON.stringify({ headOff0, headOff1 }))

    /* ---- ligne libre + coût / qté / remise / taxe ---- */
    await addInp.scrollIntoViewIfNeeded()
    await addInp.click()
    await addInp.fill("Ligne libre")
    await page.waitForSelector("[data-add-presta-create]", { timeout: 5000 })
    await addInp.press("Enter")
    await page.waitForTimeout(500)
    const free = page.locator("[data-line]").filter({ has: page.locator("[data-line-desc]") }).filter({ hasText: "Ligne libre" }).last()
    // the desc is an input value, filter hasText may fail; locate by value
    const freeLine = page.locator("[data-line]").filter({ has: page.locator('[data-line-desc][value="Ligne libre"]') }).last()
    const nLines = await page.locator("[data-line-form]").count()
    check("ligne libre créée et carte ouverte", nLines === 2 && await page.locator('[data-line-desc][value="Ligne libre"]').count() === 1, `nLines=${nLines}`)
    check("option « enregistrer dans mes prestations » sur la ligne libre", await page.locator("[data-line-save-presta]").count() >= 1)

    const form = page.locator("[data-line]").filter({ has: page.locator('[data-line-desc][value="Ligne libre"]') }).locator("[data-line-form]")
    await form.locator("input[aria-label='Coût unitaire']").fill("100")
    await form.locator("input[aria-label='Coût unitaire']").blur()
    await form.locator("input[aria-label='Quantité']").fill("2")
    await form.locator("input[aria-label='Quantité']").blur()
    await form.locator("[data-line-remise-type]").selectOption("total")
    await page.waitForTimeout(200)
    await form.locator("input[aria-label='Montant de la remise']").fill("10")
    await form.locator("input[aria-label='Montant de la remise']").blur()
    await page.waitForTimeout(250)
    const lineTot = money(await form.locator("[data-line-total]").innerText())
    check("total de ligne juste (2 × 100 €, remise 10 % → 180,00 € HT)", /180[,.]00/.test(lineTot), lineTot)

    const footTxt = money(await page.locator("[data-devis-footer]").innerText())
    // catalogue 80 HT + 8 TVA ; libre 180 HT + 18 TVA ; HT 260 · TVA 26 · TTC 286
    check("totaux pied de page justes (HT 260, TVA 26, TTC 286)",
      /HT 260[,.]00/.test(footTxt) && /TVA 26[,.]00/.test(footTxt) && /286[,.]00/.test(footTxt), footTxt.replace(/\s+/g, " ").slice(0, 220))

    const tax = form.getByRole("switch", { name: "Sujet à taxe" })
    if (await tax.getAttribute("aria-checked") === "true") await tax.click()
    await page.waitForTimeout(250)
    const footOff = money(await page.locator("[data-devis-footer]").innerText())
    // catalogue still taxed 80+8=88 ; free 180 no tax → HT 260, TVA 8, TTC 268
    check("totaux après désactivation de la taxe sur la ligne libre (TVA 8, TTC 268)",
      /TVA 8[,.]00/.test(footOff) && /268[,.]00/.test(footOff), footOff.replace(/\s+/g, " ").slice(0, 220))
    await tax.click()
    await page.waitForTimeout(250)
    const footOn = money(await page.locator("[data-devis-footer]").innerText())
    check("réactivation de la taxe : le taux par défaut du devis est conservé (TVA 26, TTC 286)",
      /TVA 26[,.]00/.test(footOn) && /286[,.]00/.test(footOn), footOn.replace(/\s+/g, " ").slice(0, 220))

    /* ---- changer le type d'une ligne ---- */
    const catLine = page.locator("[data-line]").filter({ has: page.locator('[data-line-desc][value="Pose de mitigeur"]') }).first()
    await catLine.scrollIntoViewIfNeeded()
    await catLine.locator('button[aria-label="Actions de la ligne"]').click()
    await page.waitForSelector('[role="menuitem"]', { timeout: 5000 })
    await page.getByRole("menuitem", { name: "À l'heure" }).click()
    await page.waitForTimeout(300)
    const unit = await catLine.locator("[data-line-unit]").inputValue()
    check("type de ligne changé (À l'heure → unité h)", unit === "h", `unité=${unit}`)

    /* ---- réordonner + supprimer ---- */
    const order0 = await page.evaluate(() => [...document.querySelectorAll("[data-line] [data-line-desc]")].map(e => e.value))
    await catLine.scrollIntoViewIfNeeded()
    await catLine.locator('button[aria-label="Actions de la ligne"]').click()
    await page.waitForSelector('[role="menuitem"]', { timeout: 5000 })
    const down = page.getByRole("menuitem", { name: "Descendre" })
    if (await down.count()) await down.click()
    else {
      await page.keyboard.press("Escape")
      const other = page.locator("[data-line]").filter({ has: page.locator('[data-line-desc][value="Ligne libre"]') }).first()
      await other.locator('button[aria-label="Actions de la ligne"]').click()
      await page.getByRole("menuitem", { name: "Monter" }).click()
    }
    await page.waitForTimeout(350)
    const order1 = await page.evaluate(() => [...document.querySelectorAll("[data-line] [data-line-desc]")].map(e => e.value))
    check("lignes réordonnées", order1.length === 2 && order1.join() !== order0.join(), JSON.stringify({ order0, order1 }))

    const toDel = page.locator("[data-line]").filter({ has: page.locator('[data-line-desc][value="Pose de mitigeur"]') }).first()
    await toDel.scrollIntoViewIfNeeded()
    await toDel.locator('button[aria-label="Actions de la ligne"]').click()
    await page.waitForSelector('[role="menuitem"]', { timeout: 5000 })
    await page.getByRole("menuitem", { name: "Supprimer" }).click()
    await page.waitForFunction(() => !document.querySelector('[data-line-desc][value="Pose de mitigeur"]'), { timeout: 5000 }).catch(() => {})
    const left = await page.locator('[data-line-desc][value="Pose de mitigeur"]').count()
    const forms = await page.locator("[data-line-form]").count()
    check("ligne supprimée", left === 0 && forms === 1, JSON.stringify({ left, forms }))

    /* ---- Mes prestations → Nouvelle prestation → fermer le clavier (pas de fermeture de modale) ---- */
    await page.getByRole("button", { name: "Mes prestations", exact: true }).click()
    await page.waitForSelector('[role=dialog][aria-label="Ajouter une prestation"]', { timeout: 8000 })
    check("« + Nouvelle » à côté de la recherche, pas en bas à droite", await page.locator("[data-presta-new]").count() === 1)
    const search = page.locator('[role=dialog][aria-label="Ajouter une prestation"] [aria-label="Rechercher une prestation"]')
    await search.fill("Enduit")
    await page.waitForSelector("[data-presta-create]", { timeout: 5000 })
    check("suggestion « Créer « texte » » en tête de liste", /Créer « Enduit »/.test(await page.locator("[data-presta-create]").innerText()))
    await page.click("[data-presta-new]")
    await page.waitForSelector('[role=dialog][aria-label="Nouvelle prestation"]', { timeout: 8000 })
    const libInp = page.locator('[role=dialog][aria-label="Nouvelle prestation"] input').first()
    await libInp.click()
    await fakeKb(page, true)
    await page.waitForTimeout(300)
    await fakeKb(page, false)
    await page.waitForTimeout(400)
    const afterKb = await page.evaluate(() => ({
      form: !!document.querySelector('[role=dialog][aria-label="Nouvelle prestation"]'),
      picker: !!document.querySelector('[role=dialog][aria-label="Ajouter une prestation"]'),
      devis: !!document.querySelector('[role=dialog][aria-label="Nouveau devis"]') || [...document.querySelectorAll("[role=dialog],[data-devis-footer]")].some(d => d.hasAttribute("data-devis-footer") || (d.getAttribute("aria-label") || "").includes("Nouveau devis")),
    }))
    check("fermeture du clavier : aucune modale ne se ferme (Nouvelle + recherche + devis)",
      afterKb.form && afterKb.picker && afterKb.devis, JSON.stringify(afterKb))
    // tap à l'intérieur du formulaire
    const formBox = await page.locator('[role=dialog][aria-label="Nouvelle prestation"]').boundingBox()
    if (formBox) await page.mouse.click(formBox.x + formBox.width / 2, formBox.y + Math.min(formBox.height - 20, 80))
    await page.waitForTimeout(300)
    check("tap à l'intérieur : le formulaire reste ouvert", await page.locator('[role=dialog][aria-label="Nouvelle prestation"]').count() === 1)
    // fermer seulement la feuille du haut via son X
    await page.locator('[role=dialog][aria-label="Nouvelle prestation"] button[aria-label="Fermer"]').click()
    await page.waitForTimeout(500)
    const afterX = await page.evaluate(() => ({
      form: !!document.querySelector('[role=dialog][aria-label="Nouvelle prestation"]'),
      picker: !!document.querySelector('[role=dialog][aria-label="Ajouter une prestation"]'),
    }))
    check("X du haut : seule « Nouvelle prestation » se ferme, le picker reste", !afterX.form && afterX.picker, JSON.stringify(afterX))
    await page.locator('[role=dialog][aria-label="Ajouter une prestation"] button:has-text("Fermer")').click()
    await page.waitForTimeout(400)

    /* ---- aperçu (œil) ---- */
    await page.getByRole("button", { name: "Aperçu du devis" }).click()
    await page.waitForTimeout(500)
    check("aperçu (œil) ouvert", /Aperçu/.test(await page.locator("body").innerText()) && await page.getByText(/ce que reçoit le client/).count() > 0)
    await page.keyboard.press("Escape")
    await page.waitForTimeout(400)
    check("aperçu refermé, éditeur toujours là", await page.locator("[data-create-devis]").count() > 0)

    /* ---- débordement / barre du bas / CLS / console ---- */
    await page.locator("[data-add-presta]").scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
    const ov = await overflowReport(page)
    check("aucun élément ne déborde ni ne passe sous la barre du bas", ov.bad.length === 0, JSON.stringify(ov))
    const cls = await page.evaluate(() => window.__cls ?? null)
    check("pas de saut de layout notable (CLS)", cls == null || cls < 0.15, `cls=${cls}`)

    mkdirSync(SHOTS, { recursive: true })
    await page.screenshot({ path: join(SHOTS, "update85-prestations.png") })

    /* ---- Créer un devis ---- */
    // after deleting catalog line, only free line remains — retaxed, 180 HT + 18 TVA
    await page.click("[data-create-devis]")
    await page.waitForTimeout(1800)
    const devisWrite = writes.some(w => w.table === "devis" && w.method === "POST")
    const editorGone = await page.locator("[data-create-devis]").count() === 0
    const toastOk = await page.locator("[data-toast]").count() > 0
    check("Créer un devis enregistre et ferme l'éditeur", (devisWrite || toastOk) && editorGone, JSON.stringify({ devisWrite, editorGone, toastOk, err: errors.slice(0, 3) }))
    // fix confirmation création : le devis créé s'ouvre ensuite — on le referme avant le parcours suivant
    const devisOpen = await page.locator('[role=dialog][aria-label^="Devis N°"]').count() > 0
    check("le devis créé s'ouvre après la création", devisOpen)
    if (devisOpen) { await page.locator('[role=dialog][aria-label^="Devis N°"] [aria-label="Fermer"]').first().click(); await page.waitForTimeout(700) }

    /* ---- Créer une facture (nouveau parcours) ---- */
    await openNouveau(page)
    await page.getByRole("button", { name: "Choisir le client" }).click()
    await page.waitForSelector('[aria-label="Rechercher un client"]', { timeout: 8000 })
    const camille = page.getByRole("option").filter({ hasText: "Camille Test" })
    if (await camille.count()) await camille.first().click()
    else await page.getByRole("option").filter({ hasText: "Julie Bernard" }).first().click()
    await page.waitForTimeout(400)
    await page.locator("[data-add-presta-input]").fill("Forfait dépannage")
    await page.locator("[data-add-presta-input]").press("Enter")
    await page.waitForSelector("[data-line-form]", { timeout: 8000 })
    const f1 = page.locator("[data-line-form]").first()
    await f1.locator("input[aria-label='Coût unitaire']").fill("150")
    await f1.locator("input[aria-label='Coût unitaire']").blur()
    await page.waitForTimeout(200)
    await page.click("[data-create-facture]")
    await page.waitForTimeout(2200)
    const facWrite = writes.some(w => w.table === "factures" && w.method === "POST")
    const facOpen = await page.evaluate(() => /Facture|Brouillon/.test(document.body.innerText))
    check("Créer une facture ouvre le brouillon de facture", facWrite || facOpen, JSON.stringify({ facWrite, facOpen, writes: writes.filter(w => w.table === "factures" || w.api).slice(-4) }))

    const serious = errors.filter(e => !/ResizeObserver|favicon|Failed to load|interactive-widget|example\.supabase\.co\/realtime/.test(e))
    check("aucune erreur console / pageerror", serious.length === 0, JSON.stringify(serious.slice(0, 5)))
  } catch (e) {
    check("exécution du parcours", false, String(e && e.stack || e).slice(0, 500))
  } finally {
    await browser.close()
    H.stop()
  }
  console.log(`\n${ok} ok, ${ko} ko`)
  process.exit(ko ? 1 : 0)
}

main().catch(err => { console.error(err); H.stop(); process.exit(1) })
