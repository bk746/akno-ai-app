#!/usr/bin/env node
/* update82 · WebKit 393 px : page Devis-Factures simplifiée, formulaire de ligne, boutons de création.
   Supabase simulé, aucune écriture en prod. */
import { webkit } from "playwright"
import { harness } from "./pw-harness.mjs"

const H = harness({ port: 5186 }), W = 393, HT = 852
let ok = 0, ko = 0
const check = (name, cond, extra = "") => { if (cond) { ok++; console.log(`✔ ${name}`) } else { ko++; console.log(`✘ ${name}${extra ? " " + extra : ""}`) } }

async function main() {
  await H.start()
  const browser = await webkit.launch()
  try {
    const { page } = await H.newPage(browser, { width: W, height: HT, scale: 2 })

    /* 1 · Page Devis : 3 boutons, listes recentes, plus de blocs de suivi */
    await page.goto(`${H.BASE}/devis`)
    await page.waitForSelector("[data-qa='Nouveau']", { timeout: 20000 })
    await page.waitForTimeout(600)
    const visibleQa = () => page.evaluate(() => {
      const out = [], seen = new Set()
      for (const el of document.querySelectorAll("[data-qa]")) {
        const r = el.getBoundingClientRect()
        if (r.width < 8 || r.bottom < 40 || r.top > innerHeight - 40) continue
        const l = el.getAttribute("data-qa")
        if (l && !seen.has(l)) { seen.add(l); out.push(l) }
      }
      return out
    })
    const qa = await visibleQa()
    check("3 boutons Nouveau / Prestations / Relance", qa.includes("Nouveau") && qa.includes("Prestations") && qa.includes("Relance") && qa.length === 3, JSON.stringify(qa))
    check("Envoyer, Relancer et Exporter absents", !qa.includes("Envoyer") && !qa.includes("Relancer") && !qa.includes("Exporter"))
    const bodyTxt = await page.locator("[data-page='dev']").innerText().catch(() => page.innerText("body"))
    check("blocs Réponses clients et à suivre retirés", !/Réponses clients/i.test(bodyTxt) && !/À suivre/i.test(bodyTxt), bodyTxt.slice(0, 240))
    check("carte Tous les devis visible", await page.locator("[data-all-devis]").count() > 0)

    /* 2 · Liste complète dans une page séparée, Relance mène à /relance */
    await page.click("[data-all-devis]")
    await page.waitForSelector("[data-doc-list]", { timeout: 8000 })
    const listTitle = await page.locator("[data-doc-list] h1").innerText()
    check("page Tous les devis ouverte", listTitle.includes("Tous les devis"))
    await page.click("[data-doc-list-back]")
    await page.waitForSelector("[data-all-devis]", { timeout: 8000 })
    await page.click("[data-qa='Relance']")
    await page.waitForURL(/\/relance/, { timeout: 8000 })
    check("Relance ouvre la page Relances", await page.locator("[data-page='rel']").count() > 0 || /relance/.test(page.url()))

    /* 3 · Nouveau devis : formulaire de ligne complet + deux boutons de création */
    await page.goto(`${H.BASE}/devis`)
    await page.waitForSelector("[data-qa='Nouveau']", { timeout: 20000 })
    await page.click("[data-qa='Nouveau']")
    await page.waitForSelector("[data-create-devis]", { timeout: 15000 })
    const hasFacture = await page.locator("[data-create-facture]").count()
    check("boutons Créer un devis et Créer une facture", await page.locator("[data-create-devis]").count() > 0 && hasFacture > 0)
    const addBtn = page.getByRole("button", { name: /Ajouter un service/ })
    if (await addBtn.count()) await addBtn.first().click()
    await page.waitForSelector("[data-line-form]", { timeout: 8000 })
    const formTxt = await page.locator("[data-line-form]").first().innerText()
    const fields = ["Description", "Coût unitaire", "Unité", "Quantité", "Remise", "Sujet à taxe", "Total"].every(l => formTxt.includes(l))
    check("formulaire de ligne complet (carte iOS)", fields, formTxt.replace(/\s+/g, " ").slice(0, 280))
    await page.locator("[data-line-form] [data-line-desc]").first().fill("Pose de mitigeur")
    const pu = page.locator("[data-line-form] input[aria-label='Coût unitaire']")
    await pu.fill("100")
    await pu.blur()
    const qty = page.locator("[data-line-form] input[aria-label='Quantité']")
    await qty.fill("2")
    await qty.blur()
    await page.locator("[data-line-remise-type]").selectOption("total")
    await page.waitForTimeout(200)
    const rem = page.locator("[data-line-form] input[aria-label='Montant de la remise']")
    await rem.fill("10")
    await rem.blur()
    await page.waitForTimeout(200)
    const tot = (await page.locator("[data-line-total]").first().innerText()).replace(/\s/g, " ")
    check("total en direct avec remise 10 % (2 × 100 €)", /180[,.]00/.test(tot), tot)

    await page.goto(`${H.BASE}/factures`)
    await page.waitForSelector("[data-all-factures]", { timeout: 20000 })
    check("onglet Factures : carte Toutes les factures", await page.locator("[data-all-factures]").count() > 0)
    const qaF = await visibleQa()
    check("onglet Factures : mêmes 3 boutons", qaF.includes("Nouveau") && qaF.includes("Prestations") && qaF.includes("Relance") && qaF.length === 3, JSON.stringify(qaF))
  } finally {
    await browser.close()
    H.stop()
  }
  console.log(`\n${ok} ok, ${ko} ko`)
  process.exit(ko ? 1 : 0)
}

main().catch(err => { console.error(err); H.stop(); process.exit(1) })
