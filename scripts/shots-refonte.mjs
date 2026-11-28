#!/usr/bin/env node
/* refonte iOS · captures 390×844 des écrans clés (Supabase et /api simulés, aucune écriture prod). */
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { webkit } from "playwright"
import { harness, UID } from "./pw-harness.mjs"
import { chainTables, FACT3, PROFILE71 } from "./fixtures-chaine.mjs"
const OUT = process.env.SHOTS_DIR || "/tmp/refonte-shots"
mkdirSync(OUT, { recursive: true })
const H = harness({ port: 5191 })
const CHANTIERS = [
  { id: "c1000000-0000-4000-8000-000000000001", artisan_id: UID, title: "Rénovation salle de bain", client_nom: "Julie Bernard", client_telephone: "06 12 34 10 00", address: "12 rue Garibaldi, Lyon", lat: 45.767, lng: 4.836, start_date: "2026-11-17", end_date: "2026-12-04", status: "in_progress", progress_override: 62 },
  { id: "c1000000-0000-4000-8000-000000000002", artisan_id: UID, title: "Remplacement chaudière", client_nom: "Clément Dubois", address: "4 place Bellecour, Lyon", lat: 45.7578, lng: 4.832, start_date: "2026-10-01", end_date: "2026-11-10", status: "done", progress_override: 100 },
]
const EMP = "e0000000-0000-4000-8000-000000000001"
const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
const at = h => `${ymd}T${String(h).padStart(2, "0")}:00:00+01:00`
const apt = (id, client, kind, h, extra = {}) => ({ id, artisan_id: UID, title: kind, client, start: at(h), end: at(h + 1), kind, status: "prevu", adresse: "12 rue des Lilas, Lyon", telephone_client: "0612345678", ...extra })
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10)
const TABLES = { ...chainTables({ factures: [
  { ...FACT3, client_nom: "Cabinet Dentaire", date_emission: day(38), date_echeance: day(8), total_ttc: 2100 },
  { ...FACT3, id: "f5000000-0000-4000-8000-000000000005", numero: "F-2026-0005", client_nom: "Claire Lefèvre", date_emission: day(10), date_echeance: day(-20), total_ttc: 1944 },
  { ...FACT3, id: "f6000000-0000-4000-8000-000000000006", numero: "F-2026-0006", client_nom: "Nathalie Perrin", statut: "payee", payee_le: day(2), date_emission: day(30), date_echeance: day(5), total_ttc: 3890 } ] }),
  chantiers: CHANTIERS,
  appointments: [apt("a0000000-0000-4000-8000-000000000001", "Julie Bernard", "rdv", 9), apt("a0000000-0000-4000-8000-000000000002", "Chantier Dupont", "chantier", 11, { employe_id: EMP }), apt("a0000000-0000-4000-8000-000000000003", "SAV chaudière", "sav", 14)],
  employes: [{ id: EMP, artisan_id: UID, first_name: "Léa", last_name: "Martin", access_role: "ouvrier", invite_status: "accepted" }] }
const pages = (process.argv[2] || "reception,agenda,chantiers,factures").split(",")
await H.start()
const br = await webkit.launch()
try {
  for (const p of pages) {
    const { page } = await H.newPage(br, { tables: TABLES, profile: PROFILE71, scale: 2 })
    const errs = []; page.on("pageerror", e => errs.push(String(e)))
    await page.goto(`${H.BASE}/${p.split(":")[0]}`); await page.waitForTimeout(2500)
    for (const step of p.split(":").slice(1)) { if (step.startsWith("scroll")) await page.evaluate(n => { const el = [...document.querySelectorAll("[data-page-scroll]")].find(e => e.offsetParent); if (el) el.scrollTop = Number(n) }, step.slice(6) || 400)
      else if (step.startsWith("tab=")) await page.getByRole("tab", { name: new RegExp("^" + step.slice(4)) }).first().click().catch(() => {})
      else if (step.startsWith("btn=")) await page.getByRole("button", { name: new RegExp(step.slice(4)) }).first().click().catch(e => console.log("  miss", step))
      else await page.getByText(step, { exact: true }).first().click().catch(() => console.log("  miss", step)); await page.waitForTimeout(900) }
    await page.screenshot({ path: join(OUT, p.replace(/[:/ ]/g, "_") + ".png") })
    console.log(p, errs.length ? "ERR " + errs.join(" | ").slice(0, 300) : "ok")
    await page.context().close()
  }
} finally { await br.close(); H.stop() }
