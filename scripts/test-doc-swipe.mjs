#!/usr/bin/env node
/* update77 · Swipe gauche sur Devis / Factures à 393 px (WebKit) : bouton Supprimer,
   confirmation, facture émise → Avoir (rien n'est effacé). Supabase et /api simulés. */
import { webkit } from "playwright"
import { harness, demoDevis, UID } from "./pw-harness.mjs"
import { FACT3, PROFILE71 } from "./fixtures-chaine.mjs"

const H = harness({ port: 5189 }), W = 393, HT = 852
let ok = 0, ko = 0
const check = (name, cond, extra = "") => { if (cond) { ok++; console.log(`✔ ${name}`) } else { ko++; console.log(`✘ ${name}${extra ? " " + extra : ""}`) } }

const DRAFT = { id: "f1000000-0000-4000-8000-000000000001", artisan_id: UID, devis_id: null, numero: null, type: "facture", statut: "brouillon", client_nom: "Paul Girard", objet: "Brouillon test", lignes: [], total_ttc: 0, created_at: new Date().toISOString() }

async function swipeLeft(page, loc) {
  await loc.scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  const box = await loc.boundingBox()
  if (!box) throw new Error("pas de bounding box pour le swipe")
  // garder la ligne à l'écart de l'en-tête sticky et de la navbar
  if (box.y < 120) await page.evaluate(el => el.scrollIntoView({ block: "center" }), await loc.elementHandle())
  const box2 = await loc.boundingBox()
  const y = box2.y + box2.height / 2
  const from = Math.min(box2.x + box2.width - 16, W - 20)
  const to = Math.max(box2.x + 40, 40)
  await page.mouse.move(from, y)
  await page.mouse.down()
  await page.mouse.move(to, y, { steps: 18 })
  await page.mouse.up()
  await loc.waitFor({ state: "visible" })
  await page.waitForFunction(el => el.getAttribute("data-swipe-open") === "1", await loc.elementHandle(), { timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(350)
}

async function tapAction(page, loc, label) {
  const btn = loc.locator(`[data-swipe-action="${label}"]`)
  await btn.waitFor({ state: "attached", timeout: 3000 })
  const box = await loc.boundingBox()
  if (box) await page.mouse.click(box.x + box.width - 44, box.y + box.height / 2)
  await page.waitForTimeout(250)
  if (await page.locator("[data-confirm-sheet]").count()) return
  await btn.evaluate(el => el.click())
}

async function main() {
  await H.start()
  const browser = await webkit.launch()
  try {
    const { page, writes, db } = await H.newPage(browser, {
      width: W, height: HT, scale: 2,
      devis: demoDevis(),
      tables: { factures: [FACT3, DRAFT] },
      profile: PROFILE71,
      api: async (path, body, d) => {
        if (path === "/api/devis" && body.action === "avoir") {
          const id = "f9000000-0000-4000-8000-000000000009"
          d.factures = [{ id, artisan_id: UID, numero: null, type: "avoir", statut: "brouillon", facture_origine_id: body.facture_id, client_nom: FACT3.client_nom, objet: `Avoir sur facture n° ${FACT3.numero}`, lignes: FACT3.lignes, total_ttc: FACT3.total_ttc, created_at: new Date().toISOString() }, ...(d.factures || [])]
          return { ok: true, facture_id: id }
        }
      },
    })

    // ——— Devis ———
    await page.goto(`${H.BASE}/devis`)
    await page.waitForSelector("[data-bar-pill]", { timeout: 20000 })
    const firstDevis = page.locator("[data-swipe-row^='all-']").first()
    await firstDevis.waitFor({ timeout: 20000 })
    await page.waitForTimeout(400)
    for (let i = 0; i < 4 && await page.getByRole("dialog").count(); i++) {
      const close = page.getByRole("button", { name: "Fermer" })
      if (await close.count()) await close.first().click({ force: true })
      else break
      await page.waitForTimeout(400)
    }
    const devisId = await firstDevis.getAttribute("data-swipe-row")
    const client = (await firstDevis.locator(".truncate, div").first().textContent()) || ""

    await swipeLeft(page, firstDevis)
    const open1 = await firstDevis.getAttribute("data-swipe-open")
    const delBtn = firstDevis.locator("[data-swipe-action='Supprimer']")
    check("swipe d'un devis : la ligne s'ouvre", open1 === "1")
    check("swipe d'un devis : le bouton rouge Supprimer apparaît", await delBtn.isVisible())

    // tap ailleurs (titre de section)
    await page.evaluate(() => document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 8, clientY: 8 })))
    await page.waitForTimeout(400)
    check("un tap ailleurs referme le swipe", (await firstDevis.getAttribute("data-swipe-open")) === "0")

    await swipeLeft(page, firstDevis)
    await tapAction(page, firstDevis, "Supprimer")
    await page.getByRole("dialog").filter({ hasText: "Supprimer ce devis ?" }).waitFor({ timeout: 8000 })
    check("confirmation : « Supprimer ce devis ? »", await page.getByText("Supprimer ce devis ?").count() > 0)
    check("confirmation : Annuler et Supprimer", await page.getByRole("button", { name: "Annuler" }).count() > 0 && await page.getByRole("button", { name: "Supprimer" }).count() > 0)

    await page.getByRole("button", { name: "Annuler" }).click()
    await page.waitForTimeout(500)
    check("Annuler referme la confirmation, la ligne reste", await page.getByText("Supprimer ce devis ?").count() === 0 && await page.locator(`[data-swipe-row="${devisId}"]`).count() === 1)

    await swipeLeft(page, firstDevis)
    await tapAction(page, firstDevis, "Supprimer")
    await page.getByRole("dialog").filter({ hasText: "Supprimer ce devis ?" }).waitFor({ timeout: 8000 })
    await page.locator("[data-confirm-ok]").click()
    await page.waitForTimeout(800)
    check("confirmer : la ligne du devis disparaît", await page.locator(`[data-swipe-row="${devisId}"]`).count() === 0, `id=${devisId} client=${client}`)
    const delWrite = writes.some(w => w.table === "devis" && w.method === "DELETE")
    check("la suppression passe par Supabase (RLS, DELETE)", delWrite, JSON.stringify(writes.filter(w => w.table === "devis")))

    // ——— Facture émise → Avoir ———
    await page.goto(`${H.BASE}/factures`)
    await page.waitForSelector("[data-bar-pill]", { timeout: 20000 })
    await page.getByRole("button", { name: "Ouvrir F-2026-0003" }).waitFor({ timeout: 20000 })
    await page.waitForTimeout(400)
    const issued = page.locator(`[data-swipe-row="${FACT3.id}"]`)
    check("facture émise visible sur la page", await issued.count() === 1)
    await swipeLeft(page, issued)
    const avoirBtn = issued.locator("[data-swipe-action='Avoir']")
    check("facture émise : le bouton est « Avoir », pas « Supprimer »", await avoirBtn.isVisible() && await issued.locator("[data-swipe-action='Supprimer']").count() === 0)
    const nFactBefore = (db.factures || []).filter(f => f.id === FACT3.id && f.numero).length
    await tapAction(page, issued, "Avoir")
    await page.getByRole("dialog").filter({ hasText: "Créer un avoir" }).waitFor({ timeout: 8000 })
    check("avoir : feuille de confirmation, rien n'est encore créé", (db.factures || []).some(f => f.id === FACT3.id && f.numero) && !(db.factures || []).some(f => f.type === "avoir"))
    await page.locator("[data-confirm-ok]").click()
    await page.waitForTimeout(900)
    const avoirApi = writes.some(w => w.api === "/api/devis" && w.body?.action === "avoir" && w.body?.facture_id === FACT3.id)
    check("avoir : l'API existante est appelée, la facture émise n'est pas effacée", avoirApi && (db.factures || []).some(f => f.id === FACT3.id && f.numero) && nFactBefore === 1, JSON.stringify(writes.filter(w => w.api === "/api/devis" || w.table === "factures")))
    check("avoir : le brouillon d'avoir s'ouvre", await page.locator("[data-facture-detail]").count() > 0 || await page.getByRole("dialog").filter({ hasText: "Avoir" }).count() > 0)

    console.log(`\n${ok} ok, ${ko} ko`)
    if (ko) process.exitCode = 1
  } finally {
    await browser.close()
    H.stop()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
