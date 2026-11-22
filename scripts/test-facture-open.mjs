#!/usr/bin/env node
/* update76 · Ouvrir une facture depuis l'accueil (WebKit 393×852) : uniquement la fiche,
   le X ramène à l'accueil, la navbar reste visible, aucune feuille ne traîne.
   Supabase et /api simulés, aucune écriture en prod. */
import { webkit } from "playwright"
import { harness } from "./pw-harness.mjs"
import { chainTables, FACT3, PROFILE71 } from "./fixtures-chaine.mjs"

const H = harness({ port: 5195 }), W = 393, HT = 852
let ok = 0, ko = 0
const check = (name, cond, extra = "") => { if (cond) { ok++; console.log(`✔ ${name}`) } else { ko++; console.log(`✘ ${name}${extra ? " " + extra : ""}`) } }

const FACT4 = { ...FACT3, id: "f4000000-0000-4000-8000-000000000004", numero: "F-2026-0004", statut: "payee", payee_le: FACT3.date_emission, date_echeance: FACT3.date_emission }

async function navbarOk(page) {
  return page.evaluate((HT) => {
    const bar = document.querySelector("[data-bar-pill]")
    if (!bar) return { ok: false, why: "pas de barre" }
    const r = bar.getBoundingClientRect(), vh = innerHeight
    const hidden = getComputedStyle(bar).visibility === "hidden" || +getComputedStyle(bar).opacity < .05
    const covered = [...document.querySelectorAll("[role=dialog]")].some(d => {
      const b = d.getBoundingClientRect()
      return b.height > 20 && b.bottom > r.top + 8 && b.top < r.bottom && b.width > 40
    })
    return { ok: !hidden && r.height > 20 && r.top < vh && vh - r.bottom >= 10 && !covered, r: { t: r.top, b: r.bottom, h: r.height, vh }, covered, hidden }
  }, HT)
}

async function openAndClose(page, label) {
  const saw = { list: false }
  const poll = (async () => {
    for (let i = 0; i < 40; i++) {
      if (await page.locator("[data-factures-list]").count()) saw.list = true
      if (await page.locator("[data-facture-detail]").count()) return
      await page.waitForTimeout(40)
    }
  })()
  await page.getByRole("button", { name: label }).click()
  await page.waitForSelector("[data-facture-detail]", { timeout: 15000, state: "attached" })
  await poll
  check(`${label} : pas de feuille liste (filtres / Nouvelle facture)`, !saw.list && await page.locator("[data-factures-list]").count() === 0)
  check(`${label} : la fiche s'ouvre`, await page.locator("[data-facture-detail]").count() === 1)
  await page.getByRole("button", { name: "Fermer" }).click()
  await page.waitForTimeout(800)
  const nDlg = await page.getByRole("dialog").count()
  const nav = await navbarOk(page)
  check(`${label} : le X ramène à l'accueil (aucune feuille restante)`, nDlg === 0, `dialogs=${nDlg}`)
  check(`${label} : la navbar est visible, rien ne la recouvre`, !!nav.ok, JSON.stringify(nav))
}

async function main() {
  await H.start()
  const browser = await webkit.launch()
  try {
    const { page } = await H.newPage(browser, {
      width: W, height: HT, scale: 2,
      tables: chainTables({ factures: [FACT3, FACT4] }),
      profile: PROFILE71,
    })
    await page.goto(`${H.BASE}/factures`)
    await page.waitForSelector("[data-bar-pill]", { timeout: 20000 })
    await page.getByRole("button", { name: "Ouvrir F-2026-0004" }).waitFor({ timeout: 20000 })
    await page.waitForTimeout(400)

    // 1) Récentes (facture payée)
    await openAndClose(page, "Ouvrir F-2026-0004")
    check("accueil Factures encore visible après fermeture", await page.getByRole("button", { name: "Ouvrir F-2026-0004" }).isVisible())

    // 2) À encaisser (facture émise)
    await openAndClose(page, "Ouvrir F-2026-0003")

    // 3) « Toutes » : la liste est voulue ; ouvrir une facture, X → liste, X → accueil
    await page.getByRole("button", { name: "Toutes" }).click()
    await page.waitForSelector("[data-factures-list], [role=dialog]", { timeout: 10000 })
    await page.waitForTimeout(400)
    check("Toutes : la liste s'ouvre", (await page.getByRole("button", { name: "Nouvelle facture" }).count()) + (await page.locator("[data-factures-list]").count()) > 0)
    await page.getByRole("dialog").getByRole("button", { name: "Ouvrir F-2026-0004" }).click()
    await page.waitForSelector("[data-facture-detail]", { timeout: 15000, state: "attached" })
    await page.getByRole("button", { name: "Fermer" }).click()
    await page.waitForTimeout(700)
    check("depuis Toutes : le X du détail ramène à la liste", await page.locator("[data-factures-list]").count() > 0 || await page.getByRole("button", { name: "Nouvelle facture" }).isVisible())
    await page.getByRole("button", { name: "Fermer" }).click()
    await page.waitForTimeout(800)
    const nav = await navbarOk(page)
    check("liste fermée : aucune feuille, navbar visible", await page.getByRole("dialog").count() === 0 && !!nav.ok, JSON.stringify(nav))

    console.log(`\n${ok} ok, ${ko} ko`)
    if (ko) process.exitCode = 1
  } finally {
    await browser.close()
    H.stop()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
