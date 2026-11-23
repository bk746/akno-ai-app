#!/usr/bin/env node
/* fix clavier · WebKit 393 px, clavier simulé (visualViewport rétréci, sans toucher à --kb : c'est lib/mobile.ts qui le calcule).
   1) feuille « Nouveau client » : ne bouge pas, en-tête et champs visibles, une seule compensation
   2) barre du bas du devis : cachée tant que le clavier est ouvert (aussi d'un champ à l'autre), sans saut de layout
   3) Créer un devis / une facture : bouton en chargement, toast en haut, ouverture du document, erreur = formulaire gardé
   Supabase et /api simulés, aucune écriture réelle. Usage : npm run test:kb-sheets  (SHOTS_DIR=… pour les captures) */
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { webkit } from "playwright"
import { harness, demoDevis, UID } from "./pw-harness.mjs"
import { PROFILE71 } from "./fixtures-chaine.mjs"

const SHOTS = process.env.SHOTS_DIR || join(process.cwd(), "node_modules/.cache/akno-shots")
mkdirSync(SHOTS, { recursive: true })
const H = harness({ port: 5197 }), W = 393, HT = 852, KB = 336
let ok = 0, ko = 0
const check = (name, cond, extra = "") => { if (cond) { ok++; console.log(`✔ ${name}`) } else { ko++; console.log(`✘ ${name}${extra ? " " + extra : ""}`) } }
const PRESTAS = [{ id: "p0000000-0000-4000-8000-000000000001", artisan_id: UID, libelle: "Pose de mitigeur", description: "Fourniture et pose", categorie: "Plomberie", type: "fft", unite: "forfait", duree_h: null, taux_horaire: null, prix_unitaire: 80, tva: 10, cout_achat: null }]

/** Clavier simulé : seul visualViewport change (hauteur, et décalage `top` = page poussée par iOS). */
async function kbd(page, on, { px = KB, top = 0 } = {}) {
  await page.evaluate(({ on, px, top }) => {
    const vv = window.visualViewport
    if (!window.__kb) {
      window.__kb = { on: false, px: 0, top: 0 }
      const proto = Object.getPrototypeOf(vv)
      const hGet = Object.getOwnPropertyDescriptor(proto, "height").get.bind(vv)
      Object.defineProperty(vv, "height", { configurable: true, get() { return window.__kb.on ? hGet() - window.__kb.px : hGet() } })
      Object.defineProperty(vv, "offsetTop", { configurable: true, get() { return window.__kb.on ? window.__kb.top : 0 } })
    }
    Object.assign(window.__kb, { on: !!on, px, top })
    vv.dispatchEvent(new Event("resize")); vv.dispatchEvent(new Event("scroll"))
  }, { on, px, top })
}
const rootKb = page => page.evaluate(() => ({ kb: document.documentElement.style.getPropertyValue("--kb").trim(), open: document.documentElement.classList.contains("kb-open") }))
/** Suit un élément image par image pendant `ms` : écart maximal de son bord haut (détecte les sauts). */
const track = (page, sel, ms) => page.evaluate(({ sel, ms }) => new Promise(res => {
  const el = document.querySelector(sel); if (!el) return res(null)
  const t0 = performance.now(), tops = []
  const f = () => { tops.push(Math.round(el.getBoundingClientRect().top)); if (performance.now() - t0 < ms) requestAnimationFrame(f); else res({ min: Math.min(...tops), max: Math.max(...tops), n: tops.length }) }
  f()
}), { sel, ms })

async function openNouveau(page, first = false) {
  if (first) { await page.goto(`${H.BASE}/devis`); await page.waitForSelector("[data-qa='Nouveau']", { timeout: 20000 }); await page.waitForTimeout(400) }
  await page.click("[data-qa='Nouveau']")
  await page.waitForSelector("[data-create-devis]", { timeout: 15000 })
  await page.waitForTimeout(450)
}
const NEWC = '[role=dialog][aria-label="Nouveau client"]'
const EDITOR = '[role=dialog][aria-label="Nouveau devis"]'

async function main() {
  await H.start()
  const browser = await webkit.launch()
  const errors = []
  try {
    const { page, writes } = await H.newPage(browser, { width: W, height: HT, scale: 2, devis: demoDevis(), tables: { prestations: PRESTAS, client_fiches: [], factures: [] }, profile: PROFILE71 })
    page.on("pageerror", e => errors.push("pageerror:" + String(e.message || e).slice(0, 200)))
    page.on("console", m => { if (m.type() === "error") errors.push("console:" + m.text().slice(0, 200)) })
    // pannes et lenteurs pilotées par le test (prioritaires sur les routes du socle)
    const net = { delay: 0, failDevis: false, failFacture: false }
    await page.route(u => u.hostname.endsWith("supabase.co") && /\/rest\/v1\/(devis|factures)$/.test(u.pathname), async route => {
      const m = route.request().method(), isDevis = /devis$/.test(new URL(route.request().url()).pathname)
      if (m === "GET") return route.fallback()
      if (net.delay) await new Promise(r => setTimeout(r, net.delay))
      if ((isDevis && net.failDevis) || (!isDevis && net.failFacture)) return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ code: "XX000", message: "panne simulée", details: "", hint: "" }) })
      return route.fallback()
    })

    await openNouveau(page, true)
    console.log("  (pointer: coarse) =", await page.evaluate(() => matchMedia("(pointer: coarse)").matches))

    /* ───── 1) Nouveau client : la feuille reste en place ───── */
    const edTop0 = await page.locator(EDITOR).evaluate(e => Math.round(e.getBoundingClientRect().top))
    await page.getByRole("button", { name: "Choisir le client" }).click()
    await page.waitForSelector("[data-new-client-row]", { timeout: 8000 })
    await page.click("[data-new-client-row]")
    await page.waitForSelector("[data-new-client]", { timeout: 8000 })
    await page.waitForTimeout(500)
    const geo = () => page.evaluate(({ NEWC, EDITOR }) => {
      const vis = innerHeight - (parseFloat(document.documentElement.style.getPropertyValue("--kb")) || 0)
      const box = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) } }
      const inView = b => !!b && b.top >= 0 && b.bottom <= vis + 1
      const sheet = document.querySelector(NEWC), wrap = sheet?.parentElement
      const fields = ["Nom du client", "Téléphone du client", "E-mail du client", "Adresse du client"].map(l => box(`${NEWC} [aria-label="${l}"]`))
      const head = [...(sheet?.querySelectorAll("button") || [])].filter(b => /^(Retour|OK|…)$/.test(b.textContent.trim())).map(b => { const r = b.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) } })
      const a = document.activeElement, ar = a && a !== document.body ? a.getBoundingClientRect() : null
      return {
        vis, sheet: box(NEWC), editor: box(EDITOR), fields, head,
        fieldsIn: fields.every(inView), headIn: head.length === 2 && head.every(inView),
        active: ar ? { top: Math.round(ar.top), bottom: Math.round(ar.bottom), label: a.getAttribute("aria-label") } : null, activeIn: !!ar && ar.top >= 0 && ar.bottom <= vis + 1,
        wrapTf: wrap ? getComputedStyle(wrap).transform : null, sheetTf: sheet ? getComputedStyle(sheet).transform : null,
        bodyPos: getComputedStyle(document.body).position, scrollY: Math.round(scrollY),
      }
    }, { NEWC, EDITOR })
    const g0 = await geo()
    await page.locator(`${NEWC} [aria-label="Nom du client"]`).click()
    const [tr1] = await Promise.all([track(page, NEWC, 520), kbd(page, true)])
    await page.waitForTimeout(250)
    const g1 = await geo(), k1 = await rootKb(page)
    await page.screenshot({ path: join(SHOTS, "kb-nouveau-client.png") })
    check("clavier détecté par mobile.ts (--kb, kb-open)", k1.open && parseFloat(k1.kb) === KB, JSON.stringify(k1))
    check("Nouveau client : la feuille ne bouge pas à l'ouverture du clavier", !!g1.sheet && Math.abs(g1.sheet.top - g0.sheet.top) <= 1 && tr1 && tr1.max - tr1.min <= 2, JSON.stringify({ top0: g0.sheet?.top, top1: g1.sheet?.top, tr1 }))
    check("Nouveau client : en-tête Retour / OK visible", g1.headIn, JSON.stringify(g1.head))
    check("Nouveau client : Nom, Téléphone, E-mail, Adresse visibles au-dessus du clavier", g1.fieldsIn, JSON.stringify({ vis: g1.vis, fields: g1.fields }))
    check("Nouveau client : champ actif visible", g1.activeIn && g1.active?.label === "Nom du client", JSON.stringify(g1.active))
    check("une seule compensation : aucun translate sur la sous-feuille ni son enveloppe", /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/.test(g1.wrapTf || "") && /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/.test(g1.sheetTf || ""), JSON.stringify({ wrapTf: g1.wrapTf, sheetTf: g1.sheetTf }))
    check("feuille parente (Nouveau devis) immobile pendant que la sous-feuille a le clavier", !!g1.editor && g1.editor.top === edTop0 && g1.editor.bottom === g0.editor.bottom, JSON.stringify({ edTop0, e0: g0.editor, e1: g1.editor }))
    check("page figée derrière la feuille (pas de défilement natif)", g1.scrollY === 0 && (g1.bodyPos === "fixed" || !(await page.evaluate(() => matchMedia("(pointer: coarse)").matches))), JSON.stringify({ bodyPos: g1.bodyPos, scrollY: g1.scrollY }))
    // champ suivant (flèches du clavier) : toujours visible, la feuille ne bouge pas
    await page.evaluate(NEWC => { document.activeElement.blur(); document.querySelector(`${NEWC} [aria-label="Adresse du client"]`).focus() }, NEWC)
    await page.waitForTimeout(450)
    const g2 = await geo()
    check("champ suivant (Adresse) : visible, feuille toujours en place", g2.activeIn && g2.active?.label === "Adresse du client" && Math.abs(g2.sheet.top - g0.sheet.top) <= 1 && g2.headIn, JSON.stringify({ a: g2.active, top: g2.sheet?.top, vis: g2.vis }))
    // fermeture du clavier : rien ne redescend brutalement
    const [tr2] = await Promise.all([track(page, NEWC, 520), (async () => { await kbd(page, false); await page.evaluate(() => document.activeElement?.blur?.()) })()])
    await page.waitForTimeout(200)
    const g3 = await geo()
    check("fermeture du clavier : la feuille ne saute pas", Math.abs(g3.sheet.top - g0.sheet.top) <= 1 && g3.sheet.bottom === g0.sheet.bottom && tr2 && tr2.max - tr2.min <= 2, JSON.stringify({ g0: g0.sheet, g3: g3.sheet, tr2 }))
    await page.locator(`${NEWC} button`, { hasText: "Retour" }).click()
    await page.waitForTimeout(250)
    await page.getByRole("option").filter({ hasText: "Julie Bernard" }).first().click()
    await page.waitForTimeout(600)

    /* ───── 2) barre du bas : cachée tant que le clavier est ouvert ───── */
    const foot = () => page.evaluate(() => { const el = document.querySelector("[data-devis-footer]"), cs = getComputedStyle(el), sc = document.querySelector("[data-devis-scroll]"), pr = sc.querySelector("[data-prestations]"); return { op: Number(cs.opacity), pe: cs.pointerEvents, dur: cs.transitionDuration, h: Math.round(el.getBoundingClientRect().height), sh: sc.scrollHeight - Math.round(pr ? pr.getBoundingClientRect().height : 0), /* hors Prestations : ses suggestions s'ouvrent au focus (contenu, pas clavier) */ pb: cs.paddingBottom, scPb: getComputedStyle(sc).paddingBottom } })
    const f0 = await foot()
    const objet = page.locator("#dv-objet")
    await objet.scrollIntoViewIfNeeded(); await objet.click(); await objet.fill("Rénovation salle de bain")
    await kbd(page, true)
    await page.waitForTimeout(120)
    const fMid = await foot()
    await page.waitForTimeout(240)
    const f1 = await foot()
    const durs = f0.dur.split(",").map(s => parseFloat(s) * (/ms/.test(s) ? 1 : 1000))
    check("barre du bas : cachée quand le clavier s'ouvre", f1.op === 0 && f1.pe === "none", JSON.stringify(f1))
    check("barre du bas : fondu / slide de 150 à 200 ms", durs.every(d => d >= 150 && d <= 200) && fMid.op > 0 && fMid.op < 1, JSON.stringify({ dur: f0.dur, mid: fMid.op }))
    // d'un champ à l'autre (flèches du clavier) : le clavier reste ouvert, la barre ne réapparaît jamais
    const flick = await page.evaluate(() => new Promise(res => {
      let seen = false, lost = false
      const el = document.querySelector("[data-devis-footer]"), t0 = performance.now()
      const f = () => { if (Number(getComputedStyle(el).opacity) > 0.02) seen = true; if (!document.documentElement.classList.contains("kb-open")) lost = true; if (performance.now() - t0 < 700) requestAnimationFrame(f); else res({ seen, lost }) }
      f()
      const a = document.querySelector("#dv-objet"), b = document.querySelector("[data-add-presta-input]")
      a.blur(); setTimeout(() => b.focus({ preventScroll: true }), 30); setTimeout(() => { b.blur(); a.focus({ preventScroll: true }) }, 300)
    }))
    check("barre du bas : reste cachée en passant d'un champ à l'autre", !flick.seen && !flick.lost, JSON.stringify(flick))
    // iOS a poussé la page (visualViewport.offsetTop) : le clavier est toujours considéré ouvert, et la page est remise en place
    await page.evaluate(() => { window.__st = 0; const o = window.scrollTo; window.scrollTo = (...a) => { window.__st++; return o.apply(window, a) } })
    await kbd(page, true, { top: 300 })
    await page.waitForTimeout(260)
    const fPan = await foot(), kPan = await rootKb(page), stN = await page.evaluate(() => window.__st)
    check("page poussée par iOS : barre toujours cachée, page remise en place", fPan.op === 0 && kPan.open && stN > 0, JSON.stringify({ fPan, kPan, stN }))
    await kbd(page, true)
    await page.waitForTimeout(200)
    // champ bas de page : amené au plus près dans la zone visible, en-tête de l'éditeur toujours là
    await page.evaluate(() => { const sc = document.querySelector("[data-devis-scroll]"); sc.scrollTop = 0 })
    await page.evaluate(() => document.querySelector("[data-add-presta-input]").focus({ preventScroll: true }))
    await page.waitForTimeout(900)
    const low = await page.evaluate(EDITOR => { const a = document.activeElement.getBoundingClientRect(), vis = innerHeight - (parseFloat(document.documentElement.style.getPropertyValue("--kb")) || 0), x = document.querySelector(`${EDITOR} [aria-label="Fermer l'éditeur"]`).getBoundingClientRect(); return { top: Math.round(a.top), bottom: Math.round(a.bottom), vis, closeTop: Math.round(x.top) } }, EDITOR)
    check("champ bas de page : défilé dans la zone visible, en-tête de l'éditeur visible", low.top >= 0 && low.bottom <= low.vis && low.closeTop >= 0, JSON.stringify(low))
    await kbd(page, false); await page.evaluate(() => document.activeElement?.blur?.())
    await page.waitForTimeout(450)
    const f2 = await foot()
    check("barre du bas : réapparaît à la fermeture, sans saut de layout", f2.op === 1 && f2.pe !== "none" && f2.h === f0.h && f2.sh === f0.sh && f2.scPb === f0.scPb, JSON.stringify({ f0, f2 }))
    // clavier « fantôme » (mesure figée après fermeture, update69) : sans champ actif, --kb retombe à 0
    await objet.click(); await kbd(page, true); await page.waitForTimeout(200)
    await page.evaluate(() => document.activeElement?.blur?.())
    await page.waitForTimeout(450)
    const ghost = await rootKb(page)
    check("mesure figée sans champ actif : clavier considéré fermé", !ghost.open && parseFloat(ghost.kb) === 0, JSON.stringify(ghost))
    await kbd(page, false); await page.waitForTimeout(150)
    // plugin Capacitor Keyboard (facultatif) : keyboardWillShow / keyboardWillHide pilotent le même état
    await objet.click()
    await page.evaluate(() => window.dispatchEvent(Object.assign(new Event("keyboardWillShow"), { keyboardHeight: 300 })))
    await page.waitForTimeout(300)
    const nk1 = await rootKb(page), fN = await foot()
    await page.evaluate(() => window.dispatchEvent(new Event("keyboardWillHide")))
    await page.waitForTimeout(350)
    const nk2 = await rootKb(page)
    check("keyboardWillShow / keyboardWillHide (plugin Keyboard) : même état kb-open / --kb", nk1.open && parseFloat(nk1.kb) === 300 && fN.op === 0 && !nk2.open && parseFloat(nk2.kb) === 0, JSON.stringify({ nk1, nk2 }))
    await page.evaluate(() => document.activeElement?.blur?.())
    await page.waitForTimeout(300)

    /* ───── 3) confirmation de création ───── */
    const TOAST = "[data-toast-top]"
    // validation : toast rouge, formulaire gardé
    await page.click("[data-create-devis]")
    await page.waitForSelector(TOAST, { timeout: 4000 })
    const v = await page.evaluate(TOAST => { const t = document.querySelector(TOAST); return { txt: t.textContent.trim(), kind: t.getAttribute("data-kind"), top: Math.round(t.getBoundingClientRect().top), banners: document.querySelectorAll('[role=dialog][aria-label="Nouveau devis"] [role=alert]').length } }, TOAST)
    check("sans ligne chiffrée : toast rouge en haut, éditeur gardé, pas de bandeau en double", v.banners === 0 && v.kind === "err" && /ligne chiffrée/.test(v.txt) && v.top < 140 && await page.locator("[data-create-devis]").count() === 1, JSON.stringify(v))
    await page.locator("[data-add-presta-input]").fill("Forfait dépannage"); await page.locator("[data-add-presta-input]").press("Enter")
    await page.waitForSelector("[data-line-form]", { timeout: 8000 })
    const pu = page.locator("[data-line-form]").first().locator("input[aria-label='Coût unitaire']")
    await pu.fill("150"); await pu.blur()
    await page.waitForTimeout(1500) // l'enregistrement automatique crée le brouillon
    // erreur serveur : toast rouge avec le message, formulaire toujours rempli, bouton réactivé
    await page.locator("#dv-objet").fill("Rénovation salle de bain — étage"); await page.locator("#dv-objet").blur()
    net.failDevis = true
    await page.click("[data-create-devis]")
    await page.waitForFunction(TOAST => document.querySelector(TOAST)?.getAttribute("data-kind") === "err" && !/ligne chiffrée/.test(document.querySelector(TOAST).textContent), TOAST, { timeout: 6000 }).catch(() => {})
    const e1 = await page.evaluate(TOAST => { const t = document.querySelector(TOAST), b = document.querySelector("[data-create-devis]"); return { txt: t?.textContent.trim(), kind: t?.getAttribute("data-kind"), editor: !!b, disabled: b?.disabled, objet: document.querySelector("#dv-objet")?.value, client: !!document.querySelector('[aria-label*="Julie Bernard"]'), lines: document.querySelectorAll("[data-line-form]").length, color: t ? getComputedStyle(t).color : "", banners: document.querySelectorAll('[role=dialog][aria-label="Nouveau devis"] [role=alert]').length } }, TOAST)
    await page.screenshot({ path: join(SHOTS, "kb-toast-erreur.png") })
    check("erreur à la création : toast rouge avec le message, sans bandeau en double", e1.kind === "err" && (e1.txt || "").length > 8 && e1.banners === 0, JSON.stringify(e1))
    check("erreur à la création : formulaire toujours rempli, bouton réactivé", e1.editor && e1.disabled === false && e1.objet === "Rénovation salle de bain — étage" && e1.client && e1.lines === 1, JSON.stringify(e1))
    net.failDevis = false
    // succès : bouton en chargement, double envoi bloqué, toast en haut, document ouvert
    await page.locator("#dv-objet").fill("Rénovation salle de bain — RDC"); await page.locator("#dv-objet").blur() // contenu modifié : une écriture attendue
    net.delay = 700
    const w0 = writes.filter(w => w.table === "devis").length
    const t0 = Date.now()
    await page.click("[data-create-devis]")
    await page.waitForTimeout(120)
    const busy = await page.evaluate(() => { const b = document.querySelector("[data-create-devis]"), f = document.querySelector("[data-create-facture]"); return { disabled: b.disabled, other: f.disabled, spin: !!b.querySelector("[data-spin]"), busy: b.getAttribute("aria-busy") } })
    await page.evaluate(() => { document.querySelector("[data-create-devis]").click(); document.querySelector("[data-create-facture]").click() }) // doubles clics pendant l'envoi
    check("Créer un devis : bouton en chargement (spinner), les deux boutons désactivés", busy.disabled && busy.other && busy.spin && busy.busy === "true", JSON.stringify(busy))
    await page.waitForSelector(`${TOAST}[data-kind="ok"]`, { timeout: 8000 })
    const tShown = Date.now()
    const s1 = await page.evaluate(TOAST => { const t = document.querySelector(`${TOAST}[data-kind="ok"]`), r = t.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { txt: t.textContent.trim(), top: Math.round(r.top), check: !!t.querySelector("svg"), onTop: !!hit && t.contains(hit), cx: Math.round(r.left + r.width / 2) } }, TOAST)
    await page.waitForTimeout(700)
    await page.screenshot({ path: join(SHOTS, "kb-toast-devis.png") })
    const opened = await page.evaluate(() => ({ editor: !!document.querySelector("[data-create-devis]"), dialogs: [...document.querySelectorAll("[role=dialog]")].map(d => (d.getAttribute("aria-label") || "") + " | " + d.innerText.replace(/\s+/g, " ").slice(0, 400)) }))
    const posts = writes.filter(w => w.table === "devis").length - w0
    check("succès : toast en haut « Devis N° XXXX créé » avec coche, au-dessus de tout", /^Devis N° \d+ créé$/.test(s1.txt) && s1.top < 140 && s1.check && s1.onTop && Math.abs(s1.cx - W / 2) <= 2, JSON.stringify(s1))
    check("succès : double envoi bloqué (une seule écriture)", posts === 1, `écritures devis=${posts}`)
    check("succès : éditeur fermé, le devis créé s'ouvre", !opened.editor && opened.dialogs.some(d => d.includes(`Devis N° ${(s1.txt.match(/N° (\d+)/) || [])[1]}`) && /165,00/.test(d)), JSON.stringify(opened).slice(0, 300))
    await page.waitForFunction(TOAST => !document.querySelector(TOAST), TOAST, { timeout: 6000 }).catch(() => {})
    const life = Date.now() - tShown
    check("toast affiché environ 2,5 s", life > 2000 && life < 3600 && await page.locator(TOAST).count() === 0, `durée=${life} ms (création ${tShown - t0} ms)`)
    net.delay = 0
    await page.keyboard.press("Escape"); await page.waitForTimeout(600)

    // facture : erreur → formulaire gardé ; succès → toast + brouillon de facture ouvert
    await openNouveau(page)
    await page.getByRole("button", { name: "Choisir le client" }).click()
    await page.getByRole("option").filter({ hasText: "Marc Petit" }).first().click()
    await page.waitForTimeout(400)
    await page.locator("[data-add-presta-input]").fill("Pose"); await page.waitForSelector("[data-add-presta-item]", { timeout: 8000 })
    await page.locator("[data-add-presta-item]").first().click()
    await page.waitForSelector("[data-line-form]", { timeout: 8000 })
    await page.evaluate(() => document.activeElement?.blur?.()); await page.waitForTimeout(300)
    net.failFacture = true
    await page.click("[data-create-facture]")
    await page.waitForSelector(`${TOAST}[data-kind="err"]`, { timeout: 8000 })
    const fe = await page.evaluate(TOAST => ({ txt: document.querySelector(TOAST).textContent.trim(), editor: !!document.querySelector("[data-create-facture]"), disabled: document.querySelector("[data-create-facture]")?.disabled, client: !!document.querySelector('[aria-label*="Marc Petit"]'), lines: document.querySelectorAll("[data-line-form]").length }), TOAST)
    check("facture en erreur : toast rouge, éditeur toujours ouvert et rempli", /facture/i.test(fe.txt) && fe.editor && fe.disabled === false && fe.client && fe.lines === 1, JSON.stringify(fe))
    net.failFacture = false; net.delay = 500
    await page.waitForTimeout(300)
    await page.click("[data-create-facture]")
    await page.waitForTimeout(100)
    const fb = await page.evaluate(() => { const b = document.querySelector("[data-create-facture]"); return { disabled: b.disabled, spin: !!b.querySelector("[data-spin]") } })
    await page.waitForSelector(`${TOAST}[data-kind="ok"]`, { timeout: 8000 })
    const fs = await page.evaluate(TOAST => document.querySelector(`${TOAST}[data-kind="ok"]`).textContent.trim(), TOAST)
    await page.waitForTimeout(900)
    await page.screenshot({ path: join(SHOTS, "kb-toast-facture.png") })
    const fo = await page.evaluate(() => ({ editor: !!document.querySelector("[data-create-facture]"), txt: [...document.querySelectorAll("[role=dialog]")].map(d => d.innerText.replace(/\s+/g, " ").slice(0, 90)) }))
    check("Créer une facture : bouton en chargement puis toast « Facture … créée »", fb.disabled && fb.spin && /^Facture( F-[\w-]+)? créée$/.test(fs), JSON.stringify({ fb, fs }))
    check("Créer une facture : éditeur fermé, la facture créée s'ouvre", !fo.editor && fo.txt.some(t => /Facture|Brouillon/i.test(t)) && writes.some(w => w.table === "factures" && w.method === "POST"), JSON.stringify(fo))

    // barre interne de la feuille Facture (Enregistrer / Valider la facture) : affichée ; la navigation derrière reste masquée
    await page.waitForTimeout(600)
    const bar = await page.evaluate(() => {
      const ft = document.querySelector("[data-sheet-footer]"), nav = document.querySelector("[data-mobile-nav]")
      const btn = [...(ft?.querySelectorAll("button") || [])].find(b => /Valider la facture/.test(b.textContent))
      const r = btn?.getBoundingClientRect(), hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      const hide = ft?.querySelector(".kb-hide")
      return { btn: !!btn, save: !!ft && /Enregistrer/.test(ft.textContent), op: hide ? Number(getComputedStyle(hide).opacity) : -1, onTop: !!hit && btn.contains(hit), bottom: r ? Math.round(r.bottom) : -1, nav: nav ? Number(getComputedStyle(nav).opacity) : -1 }
    })
    await page.screenshot({ path: join(SHOTS, "kb-facture-barre.png") })
    check("feuille Facture : barre Enregistrer / Valider la facture visible et cliquable", bar.btn && bar.save && bar.op === 1 && bar.onTop && bar.bottom <= HT, JSON.stringify(bar))
    check("feuille ouverte : la navigation derrière reste masquée", bar.nav === 0, JSON.stringify(bar))

    const serious = errors.filter(e => !/ResizeObserver|favicon|interactive-widget|example\.supabase\.co\/realtime|status of 500|Failed to load resource|saveDevis/.test(e))
    check("aucune erreur console / pageerror", serious.length === 0, JSON.stringify(serious.slice(0, 5)))
  } catch (e) {
    check("exécution du parcours", false, String(e && e.stack || e).slice(0, 600))
  } finally {
    await browser.close()
    H.stop()
  }
  console.log(`\n${ok} ok, ${ko} ko`)
  process.exit(ko ? 1 : 0)
}

main().catch(err => { console.error(err); H.stop(); process.exit(1) })
