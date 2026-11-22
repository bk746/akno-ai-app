#!/usr/bin/env node
/* update71 · Chaîne complète sur iPhone (WebKit, 375 et 430 px) : devis → envoi → signature en ligne → acompte → chantier →
   facture (acompte déduit) → verrouillage après émission → envoi → payée → avoir → page publique de paiement → suivi + CSV/FEC.
   Supabase et /api simulés (le serveur est testé à part par test:chaine), aucune écriture en prod.
   Usage : npm run test:chaine-ui   (SHOTS_DIR=… captures, VIDEO_DIR=… vidéo, ONLY=375) */
import { mkdirSync, readFileSync } from "node:fs"
import { webkit } from "playwright"
import { harness, UID } from "./pw-harness.mjs"
import { chainTables, PROFILE71, DEVIS9, FACT3, TOTALS } from "./fixtures-chaine.mjs"

const SHOTS = process.env.SHOTS_DIR || "", VIDEO = process.env.VIDEO_DIR || ""
if (SHOTS) mkdirSync(SHOTS, { recursive: true }); if (VIDEO) mkdirSync(VIDEO, { recursive: true })
const SIZES = [[375, 812], [430, 932]].filter(([w]) => !process.env.ONLY || process.env.ONLY.split(",").includes(String(w)))
const H = harness({ port: 5195 })
let ok = 0, ko = 0
const check = (name, cond, extra = "") => { if (cond) { ok++; console.log(`✔ ${name}`) } else { ko++; console.log(`✘ ${name} ${typeof extra === "string" ? extra : JSON.stringify(extra)}`) } }
const r2 = n => Math.round(n * 100) / 100
const lineHt = x => r2(Number(x.q) * Number(x.pu))
const totals = ls => { const by = {}; let ht = 0; for (const x of ls) { ht = r2(ht + lineHt(x)); by[x.tv ?? 20] = r2((by[x.tv ?? 20] || 0) + lineHt(x)) } const tva = r2(Object.entries(by).reduce((a, [r, b]) => a + r2(b * Number(r) / 100), 0)); return { ht, tva, ttc: r2(ht + tva) } }
const today = () => new Date().toISOString().slice(0, 10)

/* API simulée, à l'image de api/devis.ts et api/devis-public.ts (afterSign : acompte 30 % + chantier) */
function apiMock(db, W) {
  let n = 3
  const fac = id => db.factures.find(f => f.id === id)
  return async (path, b) => {
    if (path !== "/api/devis") return
    const now = new Date().toISOString()
    if (b.action === "send") { const d = db.devis.find(x => x.id === b.devis_id); Object.assign(d, { statut: "env", envoye_le: now, client_email: b.email }); return { ok: true, sent_at: now, email: b.email } }
    if (b.action === "facture_emit") { const f = fac(b.facture_id); const pre = f.type === "avoir" ? "A" : "F"; Object.assign(f, { numero: `${pre}-2026-${String(++n).padStart(4, "0")}`, statut: "emise", date_emission: today(), date_echeance: today(), document_hash: "ab12cd34ef56ab12cd34" }); return { ok: true, numero: f.numero, facture: f } }
    if (b.action === "facture_send") { Object.assign(fac(b.facture_id), { statut: "envoyee", envoyee_le: now }); return { ok: true, sent_at: now, email: b.email } }
    if (b.action === "facture_paid") { Object.assign(fac(b.facture_id), b.paid ? { statut: "payee", payee_le: now, mode_paiement: b.mode } : { statut: "envoyee", payee_le: null }); return { ok: true } }
    if (b.action === "facture_from_devis") {
      const d = db.devis.find(x => x.id === b.devis_id), lines = d.lignes.filter(x => x.k !== "sec").map(({ l, d: dd, q, u, pu, tv }) => ({ l: dd ? `${l}\n${dd}` : l, q, u, pu, tv }))
      const ac = db.factures.filter(f => f.devis_id === d.id && f.type === "acompte" && f.numero)
      const t = totals(lines), ded = r2(ac.reduce((a, f) => a + Number(f.total_ttc), 0))
      const row = { id: `fx${Date.now()}`, artisan_id: UID, devis_id: d.id, type: ac.length ? "solde" : "facture", statut: "brouillon", client_nom: d.client_nom, client_email: d.client_email, client_telephone: d.client_telephone, client_adresse: d.client_adresse, objet: d.objet, lignes: lines, total_ht: t.ht, total_tva: t.tva, total_ttc: t.ttc, acompte_deduit: ded, token: "9e3f4051-0000-4000-8000-0000000000aa", created_at: now }
      db.factures.unshift(row); return { ok: true, facture_id: row.id }
    }
    if (b.action === "avoir") { const o = fac(b.facture_id); const row = { ...o, id: `av${Date.now()}`, token: `av-${Date.now()}`, type: "avoir", statut: "brouillon", numero: null, facture_origine_id: o.id, created_at: now }; db.factures.unshift(row); return { ok: true, facture_id: row.id } }
  }
}
function publicRoutes(ctx, db) {
  return ctx.route(u => /\/api\/devis-public/.test(u.pathname), async route => {
    const req = route.request(), url = new URL(req.url()), json = (b, s = 200) => route.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(b) })
    const ftok = url.searchParams.get("facture"), tok = url.searchParams.get("token") || (req.postDataJSON?.() || {}).token
    if (ftok) { const f = db.factures.find(x => x.token === ftok); if (!f) return json({ error: "Cette facture est introuvable." }, 404)
      return json({ ok: true, numero: f.numero, type: f.type, objet: f.objet, client_nom: f.client_nom, lignes: f.lignes, total_ht: f.total_ht, total_tva: f.total_tva, total_ttc: f.total_ttc, acompte_deduit: f.acompte_deduit || 0, reste: r2(f.total_ttc - (f.acompte_deduit || 0)), date_emission: f.date_emission, date_echeance: f.date_echeance, payee: f.statut === "payee", company: PROFILE71.entreprise_nom, siret: PROFILE71.entreprise_siret, iban: PROFILE71.iban, bic: "AGRIFRPP881", reference: f.numero, online: false }) }
    const d = db.devis.find(x => x.token === tok)
    if (!d) return json({ error: "Devis introuvable." }, 404)
    const info = () => ({ ...d, artisan: { entreprise_nom: PROFILE71.entreprise_nom, entreprise_siret: PROFILE71.entreprise_siret }, document_hash: "f00dfeed", signed: d.signe_le ? { nom: d.accepte_nom, at: d.signe_le, hash: "f00dfeed" } : null })
    if (req.method() === "GET") return json(info())
    const b = req.postDataJSON?.() || {}
    if (b.action === "sign") {
      Object.assign(d, { statut: "val", signe_le: new Date().toISOString(), accepte_nom: b.nom, repondu_le: new Date().toISOString() })
      const lines = d.lignes.filter(x => x.k !== "sec"), by = {}
      for (const x of lines) by[x.tv] = r2((by[x.tv] || 0) + lineHt(x))
      const lignes = Object.entries(by).map(([r, base]) => ({ l: `Acompte de 30 % sur devis n° ${d.numero} (part TVA ${r} %)`, q: 1, u: "forfait", pu: r2(base * .3), tv: Number(r) }))
      const t = totals(lignes)
      db.factures.unshift({ id: "ac000000-0000-4000-8000-000000000001", artisan_id: UID, devis_id: d.id, type: "acompte", statut: "brouillon", numero: null, client_nom: d.client_nom, client_email: d.client_email, client_telephone: d.client_telephone, client_adresse: d.client_adresse, objet: d.objet, lignes, total_ht: t.ht, total_tva: t.tva, total_ttc: t.ttc, acompte_deduit: 0, token: "ac0token-0000-4000-8000-000000000001", created_at: new Date().toISOString() })
      db.chantiers.push({ id: "ch000000-0000-4000-8000-000000000001", artisan_id: UID, devis_id: d.id, status: "upcoming", title: d.objet, client_nom: d.client_nom, address: d.client_adresse, lat: 45.9, lng: 6.13, created_at: new Date().toISOString() })
      return json({ ...info(), statut: "val", decided_at: d.signe_le, proof: "signature", events: [] })
    }
    return json({ error: "Action invalide." }, 400)
  })
}

/* contrôles responsive dans la feuille du dessus : rien ne déborde, aucun texte coupé dans la frise, l'étape, le document et les boutons */
const RESP = page => page.evaluate(() => {
  const root = [...document.querySelectorAll("[role=dialog][aria-modal=true]")].filter(e => e.getBoundingClientRect().height > 40).pop() || document.body
  const vw = innerWidth, bad = []
  for (const e of root.querySelectorAll("[data-frise] *, [data-next] *, [data-lines-card] *, [data-pilotage] *, button")) {
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue
    if (r.right > vw + 1 || r.left < -1) bad.push(`déborde: ${(e.innerText || e.tagName).slice(0, 30)}`)
    if (e.children.length === 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== "visible") bad.push(`coupé: ${(e.innerText || "").slice(0, 30)}`)
  }
  return { bad: bad.slice(0, 5), scrollX: document.documentElement.scrollWidth > vw + 1 }
})
const frise = page => page.evaluate(() => [...document.querySelectorAll("[data-frise] [data-step]")].map(e => `${e.getAttribute("data-step")}:${e.getAttribute("data-done")}${e.getAttribute("data-current") === "1" ? "*" : ""}`).join(" "))
const nextBtn = page => page.locator("[role=dialog] [data-next-action]").last()

async function openDevis(page) {
  await page.goto(`${H.BASE}/devis`); await page.waitForSelector("[data-bar-pill]", { timeout: 20000 }); await page.waitForTimeout(1500)
  await page.locator("[data-page]").getByText("Cuisine : plomberie").first().click(); await page.waitForSelector("[data-frise]", { timeout: 8000 }); await page.waitForTimeout(700)
}
async function openFacture(page, numeroOrText) {
  await page.goto(`${H.BASE}/factures`); await page.waitForSelector("[data-bar-pill]"); await page.waitForTimeout(1500)
  await page.getByRole("button", { name: "Toutes" }).first().click(); await page.waitForTimeout(900)
  await page.locator("[role=dialog]").getByText(numeroOrText).first().click(); await page.waitForTimeout(900)
}

async function run(browser, W, HT) {
  const tables = chainTables(), video = VIDEO && W === 375 ? VIDEO : ""
  const { ctx, page, db } = await H.newPage(browser, { width: W, height: HT, scale: 2, tables, profile: PROFILE71, video, api: (p, b, d) => apiMock(d, W)(p, b) })
  await publicRoutes(ctx, db)
  page.on("dialog", d => d.accept())
  const shot = async n => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/chaine-${W}-${n}.png` }) }
  const resp = async tag => { const r = await RESP(page); check(`${W} · ${tag} : aucun texte coupé ni débordement`, !r.bad.length && !r.scrollX, r) }

  // 1. Devis brouillon : frise, prochaine étape, document lisible (carte), envoi
  await openDevis(page)
  check(`${W} · devis : frise 6 étapes, étape 1 en cours`, /^Devis:0\* Signé:0/.test(await frise(page)), await frise(page))
  check(`${W} · devis : bouton « Envoyer au client »`, /Envoyer au client/.test(await nextBtn(page).innerText()))
  const card = await page.evaluate(() => { const c = document.querySelector("[role=dialog] [data-lines-card]"); if (!c) return null; const t = c.innerText; return { full: /Cuisine : plomberie et électricité/.test(t), five: /5,5 %/.test(t), ten: /TVA 10 %/.test(t), twenty: /20 %/.test(t) } })
  check(`${W} · devis : aperçu en carte lisible (titre entier, TVA 5,5/10/20 %)`, card && card.full && card.five && card.ten && card.twenty, card)
  check(`${W} · devis : bouton « Voir le PDF »`, await page.locator("[role=dialog]").getByRole("button", { name: /Voir le PDF/ }).count() === 1)
  await resp("devis brouillon"); await shot("1-devis-brouillon")
  await nextBtn(page).click(); await page.waitForTimeout(1200)
  check(`${W} · envoi : devis passé « envoyé »`, db.devis[0].statut === "env")
  await openDevis(page)
  check(`${W} · envoyé : étape « Signé » en cours, relances J+3/J+7 annoncées`, /Devis:1 Signé:0\*/.test(await frise(page)) && /Relances automatiques/.test(await page.locator("[role=dialog]").innerText()), await frise(page))
  await shot("2-devis-envoye")

  // 2. Signature en ligne par le client
  const pub = await ctx.newPage()
  await pub.goto(`${H.BASE}/accept/${DEVIS9.token}`); await pub.waitForSelector("canvas[aria-label='Zone de signature']", { timeout: 15000 })
  await pub.getByPlaceholder("Vos nom et prénom").fill("Isabelle Fournier")
  await pub.evaluate(() => { // tracé au doigt simulé (événements pointeur, comme sur iPhone)
    const c = document.querySelector("canvas"), r = c.getBoundingClientRect(); c.setPointerCapture = () => {}
    const ev = (t, x, y) => c.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "touch", clientX: r.left + x, clientY: r.top + y }))
    ev("pointerdown", 30, 90); for (let i = 1; i <= 14; i++) ev("pointermove", 30 + i * 16, 90 + (i % 2 ? -30 : 20)); ev("pointerup", 260, 80)
  })
  for (const c of await pub.locator("input[type=checkbox]").all()) await c.check().catch(() => {})
  await pub.getByRole("button", { name: "Signer le devis" }).click(); await pub.waitForTimeout(1500)
  const sigTxt = await pub.locator("body").innerText()
  check(`${W} · signature : page client « Devis signé »`, /Devis signé/.test(sigTxt), sigTxt.slice(-300).replace(/\n/g, " | "))
  if (SHOTS) await pub.screenshot({ path: `${SHOTS}/chaine-${W}-3-signature-client.png` })
  await pub.close()
  check(`${W} · signature : acompte 30 % et chantier créés automatiquement`, db.factures.some(f => f.type === "acompte") && db.chantiers.length === 1)

  // 3. Acompte : de la frise à la facture d'acompte, validation, verrouillage, envoi, payée
  await openDevis(page)
  check(`${W} · signé : Signé + Chantier cochés, prochaine étape « Envoyer l'acompte »`, /Signé:1 Acompte:0\* Chantier:1/.test(await frise(page)) && /Envoyer l'acompte/.test(await nextBtn(page).innerText()), await frise(page))
  await resp("devis signé"); await shot("4-devis-signe")
  await nextBtn(page).click(); await page.waitForTimeout(1500)
  check(`${W} · acompte : brouillon ouvert, « Valider la facture »`, /Valider la facture/.test(await page.locator("[role=dialog]").last().innerText()))
  await page.locator("[role=dialog]").getByRole("button", { name: "Valider la facture" }).click(); await page.waitForTimeout(1800)
  const ac = db.factures.find(f => f.type === "acompte")
  check(`${W} · acompte émis : numéro définitif`, /^F-2026-\d{4}$/.test(ac.numero || ""), ac.numero)
  const locked = await page.evaluate(() => { const d = [...document.querySelectorAll("[role=dialog]")].pop(); return { editable: d.querySelectorAll("textarea[aria-label='Désignation']").length, card: !!d.querySelector("[data-lines-card]"), seal: /verrouillée/.test(d.innerText) } })
  check(`${W} · verrouillage après émission : plus de champ modifiable, document figé`, locked.editable === 0 && locked.card && locked.seal, locked)
  await resp("acompte émis"); await shot("5-acompte-emis")
  await nextBtn(page).click(); await page.waitForTimeout(1800)
  check(`${W} · acompte envoyé`, ac.statut === "envoyee", ac.statut)
  check(`${W} · acompte : prochaine étape « Marquer comme payée »`, /Marquer comme payée/.test(await nextBtn(page).innerText()))
  await nextBtn(page).click(); await page.waitForTimeout(1500)
  check(`${W} · acompte payé`, ac.statut === "payee")

  // 4. Facture finale : un clic, acompte déduit, émission, envoi, payée
  await openDevis(page)
  check(`${W} · après acompte : « Transformer en facture »`, /Transformer en facture/.test(await nextBtn(page).innerText()), await frise(page))
  await nextBtn(page).click(); await page.waitForTimeout(1500)
  const fin = db.factures.find(f => f.type === "solde")
  const txt = await page.locator("[role=dialog]").last().innerText()
  check(`${W} · facture : acompte déduit automatiquement (net = TTC − acompte)`, fin && Math.abs(fin.acompte_deduit - ac.total_ttc) < .01 && /Acomptes déduits/.test(txt) && /Net à payer/.test(txt), { ded: fin?.acompte_deduit, ac: ac.total_ttc })
  const ttcOk = Math.abs(fin.total_ttc - TOTALS.ttc) < .01
  check(`${W} · facture : TTC = devis (${TOTALS.ttc} €)`, ttcOk, fin.total_ttc)
  const rowsAlign = await page.evaluate(() => { const d = [...document.querySelectorAll("[role=dialog]")].pop(); const c = d.querySelector(".ig-card"); if (!c) return null; const g = c.querySelector(".grid"); const kids = g ? [...g.children].map(k => Math.round(k.getBoundingClientRect().bottom)) : []; const ta = c.querySelector("textarea"); return { bottoms: kids, wrap: ta ? ta.scrollWidth <= ta.clientWidth + 1 : false } })
  check(`${W} · facture brouillon : Quantité et Prix alignés, désignation sans coupure`, rowsAlign && rowsAlign.bottoms.length === 2 && Math.abs(rowsAlign.bottoms[0] - rowsAlign.bottoms[1]) <= 1 && rowsAlign.wrap, rowsAlign)
  await resp("facture brouillon"); await shot("6-facture-brouillon")
  await page.locator("[role=dialog]").getByRole("button", { name: "Valider la facture" }).click(); await page.waitForTimeout(1800)
  await nextBtn(page).click(); await page.waitForTimeout(1800)
  check(`${W} · facture envoyée`, fin.statut === "envoyee")
  await shot("7-facture-envoyee")
  await nextBtn(page).click(); await page.waitForTimeout(1500)
  check(`${W} · facture payée`, fin.statut === "payee")
  await openDevis(page)
  check(`${W} · chaîne terminée : 6 étapes cochées, « Tout est réglé »`, /Payé:1/.test(await frise(page)) && !/:0/.test(await frise(page)) && /Tout est réglé/.test(await page.locator("[role=dialog] [data-next]").innerText()), await frise(page))
  await resp("devis réglé"); await shot("8-devis-regle")

  // 5. Avoir sur une facture émise (correction)
  await openFacture(page, FACT3.numero)
  await page.locator("[role=dialog]").getByRole("button", { name: /avoir/i }).click(); await page.waitForTimeout(1500)
  const av = db.factures.find(f => f.type === "avoir")
  check(`${W} · avoir créé depuis la facture émise`, !!av && av.facture_origine_id === FACT3.id && /Avoir/.test(await page.locator("[role=dialog]").last().innerText()))
  await page.locator("[role=dialog]").getByRole("button", { name: "Valider la facture" }).click(); await page.waitForTimeout(1500)
  check(`${W} · avoir émis en série A-`, /^A-2026-/.test(av.numero || ""), av.numero)
  await shot("9-avoir")

  // 6. Page publique de paiement : reste à payer, virement IBAN + référence
  const pay = await ctx.newPage()
  await pay.goto(`${H.BASE}/payer/${FACT3.token}`); await pay.waitForSelector("[data-payer] h1", { timeout: 15000 }); await pay.waitForTimeout(400)
  const pt = await pay.locator("body").innerText()
  check(`${W} · page de paiement : montant, IBAN, référence, sans paiement en ligne (drapeau coupé)`, /Montant à régler/.test(pt) && /FR76/.test(pt) && pt.includes(FACT3.numero) && !/Payer par carte/.test(pt), pt.replace(/\n/g, " | ").slice(0, 400))
  const ov = await pay.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1); check(`${W} · page de paiement : aucun débordement`, ov)
  if (SHOTS) await pay.screenshot({ path: `${SHOTS}/chaine-${W}-10-page-paiement.png` })
  await pay.close()

  // 7. Suivi + export comptable (CSV, FEC)
  await page.goto(`${H.BASE}/parametres`); await page.waitForSelector("[data-bar-pill]"); await page.waitForTimeout(1500)
  check(`${W} · Réglages : acompte réglable et relances d'impayés`, /Acompte à la signature/.test(await page.locator("[data-page]").innerText()) && /Relances d'impayés/.test(await page.locator("[data-page]").innerText()))
  await page.locator("[data-page]").getByText("Suivi et export comptable").click(); await page.waitForSelector("[data-pilotage]"); await page.waitForTimeout(800)
  const tiles = await page.locator("[data-pilotage]").innerText()
  check(`${W} · suivi : signé, encaissé, reste à encaisser, taux de transformation`, /Signé/.test(tiles) && /Encaissé/.test(tiles) && /Reste à encaisser/.test(tiles) && /%/.test(tiles), tiles.replace(/\n/g, " | "))
  await resp("suivi"); await shot("11-suivi")
  const [dl1] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /CSV/ }).click()])
  const csv = readFileSync(await dl1.path(), "utf8")
  check(`${W} · export CSV : journal des ventes avec acompte, solde et avoir`, /^\uFEFFDate;Numéro;Type/.test(csv) && /Acompte/.test(csv) && /Solde/.test(csv) && /Avoir/.test(csv), dl1.suggestedFilename())
  const [dl2] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /FEC/ }).click()])
  const fec = readFileSync(await dl2.path(), "utf8")
  check(`${W} · export FEC : nom officiel, 18 colonnes`, /^999999006FEC\d{4}1231\.txt$/.test(dl2.suggestedFilename()) && fec.split("\r\n")[0].split("|").length === 18, dl2.suggestedFilename())
  await ctx.close()
  if (video) { const v = page.video(); if (v) console.log(`  vidéo : ${await v.path()}`) }
}

async function main() {
  await H.start()
  const browser = await webkit.launch()
  try { for (const [W, HT] of SIZES) await run(browser, W, HT) } finally { await browser.close(); await H.stop() }
  console.log(`\n${ok} ok, ${ko} en échec`); process.exit(ko ? 1 : 0)
}
main().catch(e => { console.error(e); H.stop?.(); process.exit(1) })
