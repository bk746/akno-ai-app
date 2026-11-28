/* refonte iOS · Relances : « Relancer » ouvre la feuille d'envoi, « Envoyer la relance » appelle /api/devis facture_relance_now (simulé, aucun envoi réel). */
import { webkit } from "playwright"
import { mkdirSync } from "node:fs"
mkdirSync("/tmp/refonte-shots", { recursive: true })
import { harness, UID } from "./pw-harness.mjs"
import { chainTables, FACT3, PROFILE71 } from "./fixtures-chaine.mjs"
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10)
const H = harness({ port: 5192 }); await H.start(); const br = await webkit.launch()
const { page, writes } = await H.newPage(br, { tables: chainTables({ factures: [{ ...FACT3, client_nom: "Cabinet Dentaire", date_emission: day(38), date_echeance: day(8), total_ttc: 2100, client_email: "c@ex.fr" }] }), profile: PROFILE71, scale: 2,
  api: (path, body) => path === "/api/devis" && body.action === "facture_relance_now" ? { body: { ok: true, canal: "E-mail" } } : null })
page.on("pageerror", e => console.log("ERR", String(e)))
await page.goto(`${H.BASE}/factures`); await page.waitForTimeout(2500)
await page.getByRole("tab", { name: /^Relances/ }).first().click(); await page.waitForTimeout(900)
const n = await page.locator('button[aria-label^="Relancer Cabinet"]').count(); console.log("count", n)
await page.locator(`button[aria-label^="Relancer Cabinet"]`).first().click({ timeout: 3000, force: true }).catch(e => console.log("click err", String(e).slice(0, 400)))
await page.waitForTimeout(900); await page.screenshot({ path: "/tmp/refonte-shots/send.png" })
await page.getByRole("button", { name: "Envoyer la relance" }).click({ timeout: 5000 }).catch(e => console.log("send err", String(e).slice(0, 300)))
await page.waitForTimeout(1200); await page.screenshot({ path: "/tmp/refonte-shots/sent.png" })
const ok = writes.some(w => w.body?.action === "facture_relance_now" && w.body?.canal === "email")
console.log(ok ? "✔ relance e-mail envoyée via facture_relance_now" : "✘ relance non envoyée")
process.exitCode = ok ? 0 : 1
await br.close(); H.stop()
