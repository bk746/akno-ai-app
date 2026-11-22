#!/usr/bin/env node
/* update70 · Vérifie le compte de démo (Supabase prod, lecture seule : on ne fait que se connecter et ouvrir les pages)
   et prend les captures store (iPhone 6,9 po : 1290×2796). Les /api/* locaux sont relayés vers l'API déployée.
   Usage : DEMO_CREDS=/workspace/akno-docs/update70-store/compte-demo.txt OUT=… node scripts/demo-check.mjs */
import { readFileSync, mkdirSync } from "node:fs"
import { webkit } from "playwright"
import { spawn } from "node:child_process"
const creds = readFileSync(process.env.DEMO_CREDS, "utf8"), email = creds.match(/e-mail\) : (.+)/)[1].trim(), pw = creds.match(/Mot de passe : (.+)/)[1].trim()
const OUT = process.env.OUT || "/tmp/demo-shots"; mkdirSync(OUT, { recursive: true })
const PORT = 5195, BASE = `http://localhost:${PORT}`, API = "https://akno-ai-app-v2.vercel.app"
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--port", String(PORT), "--strictPort"], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, BROWSER: "none" } })
await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("vite timeout")), 60000); vite.stdout.on("data", d => { if (/ready|Local:/i.test(String(d))) { clearTimeout(t); res() } }) })
let ok = 0, ko = 0
const check = (n, c, x = "") => { if (c) { ok++; console.log(`✔ ${n}`) } else { ko++; console.log(`✘ ${n} ${x}`) } }
const browser = await webkit.launch()
try {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: "fr-FR", timezoneId: "Europe/Paris",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" })
  await ctx.route(u => u.origin === BASE && /^\/api\/[a-z-]+$/.test(u.pathname), async route => { const r = await route.fetch({ url: API + new URL(route.request().url()).pathname + new URL(route.request().url()).search }); await route.fulfill({ response: r }) })
  await ctx.addInitScript(() => { try { for (const k of Object.keys(localStorage)) if (k.startsWith("akno-lock-asked")) {} ; localStorage.setItem("akno-lock-asked:de000000-0000-4000-8000-000000000001", "1") } catch { } })
  const page = await ctx.newPage()
  page.on("pageerror", e => console.log("  [pageerror]", String(e.message).slice(0, 140)))
  await page.goto(`${BASE}/reception`); await page.getByText("Se connecter", { exact: true }).last().click({ timeout: 30000 })
  await page.waitForSelector("input[type=email]", { timeout: 30000 })
  await page.fill("input[type=email]", email)
  if (!(await page.$("input[type=password]"))) await page.keyboard.press("Enter")
  await page.waitForSelector("input[type=password]", { timeout: 15000 }); await page.fill("input[type=password]", pw); await page.keyboard.press("Enter")
  await page.waitForSelector("[data-bar-pill]", { timeout: 30000 }).catch(() => {})
  check("connexion au compte de démo", !!(await page.$("[data-bar-pill]")))
  await page.waitForTimeout(6000)
  const txt = () => page.evaluate(() => document.querySelector("[data-page]")?.innerText || "")
  const visit = async (p, name, re, label, then) => { await page.goto(`${BASE}/${p}`); await page.waitForSelector("[data-bar-pill]", { timeout: 30000 }); await page.waitForTimeout(5000); if (then) await then(); const t = await txt(); check(label, re.test(t), t.slice(0, 160).replace(/\n/g, " | ")); await page.screenshot({ path: `${OUT}/${name}.png` }) }
  await visit("reception", "1-reception", /Julien Morel|Isabelle Roche/, "Réception : appels de la réceptionniste")
  await visit("agenda", "2-agenda", /Diagnostic|Remplacement|Contrôle|Visite|Recherche/, "Agenda : RDV de la semaine", async () => { await page.getByText("Suivante", { exact: true }).first().click().catch(() => {}); await page.waitForTimeout(1500) })
  await visit("chantiers", "3-chantiers", /Mise aux normes|Sanitaires|Cuisine Lefèvre|Salle de bain Dumont/, "Chantiers : chantiers autour d'Annecy")
  await visit("devis", "4-devis", /Claire Dumont|Julien Morel|Hôtel|Syndic/, "Devis : liste remplie")
  await visit("factures", "5-factures", /F-20\d\d-000\d|Payée|payée|Hôtel|Cabinet|Boulangerie/, "Factures : liste remplie")
  await visit("clients", "6-clients", /Syndic Alpes Gestion|Thomas Vidal/, "Clients : fiches")
  await visit("equipe", "7-equipe", /Karim|Élodie|Romain/, "Équipe : employés")
  await visit("relance", "8-relances", /Relance|Demande d'avis|Rappel/, "Relances : programmées / envoyées")
  await visit("parametres", "9-reglages", /Alpes Rénovation|Lucas/, "Réglages : entreprise")
  await ctx.close()
} finally { await browser.close(); vite.kill() }
console.log(`\n${ok} OK · ${ko} KO`); process.exit(ko ? 1 : 0)
