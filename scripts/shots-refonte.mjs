#!/usr/bin/env node
/* refonte iOS · captures 390×844 des écrans clés (Supabase et /api simulés, aucune écriture prod). */
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { webkit } from "playwright"
import { harness, UID } from "./pw-harness.mjs"
import { chainTables, FACT3, PROFILE71, DEVIS9, TOTALS } from "./fixtures-chaine.mjs"
const OUT = process.env.SHOTS_DIR || "/tmp/refonte-shots"
mkdirSync(OUT, { recursive: true })
const H = harness({ port: 5191 })
const CHANTIERS = [
  { id: "c1000000-0000-4000-8000-000000000001", artisan_id: UID, title: "Rénovation salle de bain", client_nom: "Claire Lefèvre", client_telephone: "06 12 34 10 00", address: "12 chemin des Pins, 74960 Cran-Gevrier", lat: 45.9, lng: 6.10, start_date: "2026-11-17", end_date: "2026-12-04", status: "in_progress", progress_override: 62 },
  { id: "c1000000-0000-4000-8000-000000000002", artisan_id: UID, title: "Remplacement chaudière", client_nom: "Hôtel Les Marquisats", address: "31 rue des Marquisats, Annecy", lat: 45.892, lng: 6.135, start_date: "2026-10-01", end_date: "2026-11-10", status: "done", progress_override: 100 },
]
const EMP = "e0000000-0000-4000-8000-000000000001"
const E = n => `e0000000-0000-4000-8000-00000000000${n}`
const ymdOf = d => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d)
const ymd = ymdOf(new Date())
const atD = (off, h) => { const d = ymdOf(new Date(Date.now() + off * 864e5)); const hh = Math.floor(h), mm = Math.round((h % 1) * 60); return `${d}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+01:00` }
const at = h => atD(0, h)
const apt = (id, client, kind, h, extra = {}, off = 0, dur = 1) => ({ id, artisan_id: UID, title: extra.title || kind, client, start: atD(off, h), end: atD(off, h + dur), kind, status: "prevu", adresse: "12 rue des Lilas, 74000 Annecy", telephone_client: "0612345678", ...extra })
const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10)
const A = n => `a0000000-0000-4000-8000-00000000000${n}`
const TABLES = { ...chainTables({ devis: { statut: "envoye", envoye_le: new Date().toISOString() }, factures: [
  { ...FACT3, client_nom: "Cabinet Dentaire", date_emission: day(38), date_echeance: day(8), total_ttc: 2100 },
  { ...FACT3, id: "f5000000-0000-4000-8000-000000000005", numero: "F-2026-0005", client_nom: "Claire Lefèvre", date_emission: day(10), date_echeance: day(-20), total_ttc: 1944 },
  { ...FACT3, id: "f6000000-0000-4000-8000-000000000006", numero: "F-2026-0006", client_nom: "Nathalie Perrin", statut: "payee", payee_le: day(2), date_emission: day(30), date_echeance: day(5), total_ttc: 3890 } ] }),
  chantiers: CHANTIERS,
  appointments: [apt(A(1), "Claire Lefèvre", "chantier", 8, { title: "Salle de bain", employe_id: E(1), adresse: "12 chemin des Pins, 74960 Cran-Gevrier" }, 0, 4), apt(A(2), "Julien Morel", "rdv", 13.5, { title: "Fuite chauffe-eau", employe_id: E(2) }, 0, .75), apt(A(3), "Pierre Girard", "visite", 15, { title: "Devis", employe_id: E(1) }), apt(A(4), "Hôtel Les Marquisats", "sav", 17, { title: "Contrat d'entretien", employe_id: E(1) }, 0, .5),
    apt(A(5), "Isabelle R.", "chantier", 9, { title: "Électricité", employe_id: E(4) }, 1, 2), apt(A(6), "Nathalie Perrin", "rdv", 10, { title: "Chaudière", employe_id: E(2) }, 2), apt(A(7), "Antoine Lefèvre", "rdv", 14, { title: "Cuisine", employe_id: E(3) }, -1)],
  employes: [{ id: E(1), artisan_id: UID, first_name: "Julien", last_name: "Dupas", role: "Chef de chantier", access_role: "chef", invite_status: "accepted" }, { id: E(2), artisan_id: UID, first_name: "Karim", last_name: "Mansour", role: "Plombier", access_role: "ouvrier", invite_status: "accepted" },
    { id: E(3), artisan_id: UID, first_name: "Thomas", last_name: "Bernard", role: "Carreleur", access_role: "ouvrier", invite_status: "accepted" }, { id: E(4), artisan_id: UID, first_name: "Sarah", last_name: "Roux", role: "Électricienne", access_role: "ouvrier", invite_status: "accepted" }] }
const pages = (process.argv[2] || "reception,agenda,chantiers,factures").split(",")
await H.start()
const br = await webkit.launch()
try {
  for (const p of pages) {
    const { page } = await H.newPage(br, { tables: TABLES, profile: PROFILE71, scale: 2, api: (path, body) => path === "/api/devis-public" ? (body.action === "sign" ? { statut: "val", signed: { nom: "Isabelle Fournier", at: new Date().toISOString(), png: body.signature } } : { numero: DEVIS9.numero, objet: DEVIS9.objet, client_nom: DEVIS9.client_nom, client_adresse: DEVIS9.client_adresse, lignes: DEVIS9.lignes, total_ttc: TOTALS.ttc, tva_taux: 10, statut: "envoye", document_hash: "abc" }) : undefined })
    const errs = []; page.on("pageerror", e => errs.push(String(e)))
    await page.addInitScript(() => { addEventListener("DOMContentLoaded", () => { const st = document.createElement("style"); st.textContent = ":root{--sat:47px!important;--sab:34px!important}"; document.head.appendChild(st) }) })
    await page.goto(`${H.BASE}/${p.split(":")[0]}`); await page.waitForTimeout(2500)
    for (const step of p.split(":").slice(1)) { if (step.startsWith("scroll")) await page.evaluate(n => { const el = [...document.querySelectorAll("[data-page-scroll]")].filter(e => e.offsetParent).pop(); if (el) el.scrollTop = Number(n) }, step.slice(6) || 400)
      else if (step.startsWith("tab=")) await page.getByRole("tab", { name: new RegExp("^" + step.slice(4)) }).first().click().catch(() => {})
      else if (step.startsWith("btn=")) await page.getByRole("button", { name: new RegExp(step.slice(4)) }).first().click().catch(e => console.log("  miss", step))
      else if (step.startsWith("lbl=")) await page.getByLabel(new RegExp(step.slice(4))).first().click().catch(() => console.log("  miss", step))
      else if (step.startsWith("wait")) await page.waitForTimeout(Number(step.slice(4)) || 1000)
      else await page.getByText(step, { exact: true }).first().click().catch(() => console.log("  miss", step)); await page.waitForTimeout(900) }
    await page.screenshot({ path: join(OUT, p.replace(/[:/ ]/g, "_") + ".png") })
    console.log(p, errs.length ? "ERR " + errs.join(" | ").slice(0, 300) : "ok")
    await page.context().close()
  }
} finally { await br.close(); H.stop() }
