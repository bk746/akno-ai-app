/* update87 · mesures prod (vite preview) WebKit 393×852. Aucune écriture en base. */
import { webkit } from "playwright"
import { spawn } from "node:child_process"
import { writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { harness, demoCalls, demoDevis } from "./pw-harness.mjs"

const PORT = 5198
const OUT = process.argv[2] || "/tmp/update87-perf.json"
const h = harness({ port: PORT })
const prev = spawn(process.execPath, [join(process.cwd(), "node_modules/vite/bin/vite.js"), "preview", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], {
  cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, BROWSER: "none" },
})
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error("preview timeout")), 30000)
  const on = d => { if (/Local:|localhost:/.test(String(d))) { clearTimeout(t); res() } }
  prev.stdout.on("data", on); prev.stderr.on("data", on)
})

const browser = await webkit.launch()
const tables = { employes: [], appointments: [], relances: [], client_fiches: [], signature_events: [] }

async function openPage() {
  const s = await h.newPage(browser, { calls: demoCalls(), devis: demoDevis(), tables, width: 393, height: 852, scale: 2 })
  const reqs = []
  s.page.on("request", r => {
    const u = r.url()
    if (u.includes("/rest/v1/") || u.includes("/auth/v1/") || u.includes("/api/")) reqs.push({ t: Date.now(), m: r.method(), u: u.replace(/https?:\/\/[^/]+/, "").slice(0, 180) })
  })
  return { ...s, reqs }
}

const waitUsable = page => page.waitForFunction(() => {
  const h = [...document.querySelectorAll("h2")].find(e => e.textContent?.includes("À rappeler"))
  if (!h) return false
  const r = h.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && getComputedStyle(h).opacity !== "0"
}, null, { timeout: 20000 })

const tabMs = async (page, label, probe) => {
  const t0 = Date.now()
  await page.getByRole("button", { name: label }).click()
  await page.waitForFunction(probe, null, { timeout: 15000 })
  return Date.now() - t0
}

// 1) cold start
const a = await openPage()
const t0 = Date.now()
await a.page.goto(h.BASE + "/reception", { waitUntil: "domcontentloaded" })
await waitUsable(a.page)
const cold = Date.now() - t0
const nav = await a.page.evaluate(() => {
  const n = performance.getEntriesByType("navigation")[0]
  const paints = Object.fromEntries(performance.getEntriesByType("paint").map(p => [p.name, Math.round(p.startTime)]))
  return { dcl: n ? Math.round(n.domContentLoadedEventEnd) : null, load: n ? Math.round(n.loadEventEnd) : null, ...paints }
})
// tab switch immediately (chunks maybe not preloaded)
const tabNow = {
  agenda: await tabMs(a.page, "Agenda", () => !!document.querySelector("[data-page='ag'], [data-slot='ag']") || /À retenir|Agenda/i.test(document.body.innerText)),
  factures: await tabMs(a.page, "Factures", () => /Devis récents|Tous les devis/i.test(document.body.innerText)),
  chantiers: await tabMs(a.page, "Chantiers", () => /en cours|Chantiers/i.test(document.body.innerText)),
}
const bootReqs = a.reqs.filter(r => r.t <= t0 + cold + 200)
await a.ctx.close()

// 2) warm tab after idle preload + second visit (cache)
const b = await openPage()
await b.page.goto(h.BASE + "/reception", { waitUntil: "domcontentloaded" })
await waitUsable(b.page)
await b.page.waitForTimeout(2500)
const tabWarm = {
  agenda: await tabMs(b.page, "Agenda", () => !!document.querySelector("[data-page='ag'], [data-slot='ag']") || /À retenir|Agenda/i.test(document.body.innerText)),
  factures: await tabMs(b.page, "Factures", () => /Devis récents|Tous les devis/i.test(document.body.innerText)),
  chantiers: await tabMs(b.page, "Chantiers", () => /en cours|Chantiers/i.test(document.body.innerText)),
}
// same context, retour Réception = 2e visite (cache SWR)
await b.page.goto(h.BASE + "/reception", { waitUntil: "domcontentloaded" })
await waitUsable(b.page)
const t1 = Date.now()
await b.page.reload({ waitUntil: "domcontentloaded" })
await waitUsable(b.page)
const reload = Date.now() - t1
await b.ctx.close()

const tablesBoot = {}
for (const r of bootReqs) {
  const m = r.u.match(/\/rest\/v1\/([a-z_]+)/)
  const k = m ? `${r.m} ${m[1]}` : (r.u.includes("/auth/") ? `${r.m} auth` : `${r.m} api`)
  tablesBoot[k] = (tablesBoot[k] || 0) + 1
}

const out = { cold, reload, nav, tabNow, tabWarm, bootReqs: bootReqs.length, tablesBoot, bootSample: bootReqs.slice(0, 24).map(r => r.u) }
writeFileSync(OUT, JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
await browser.close()
try { prev.kill() } catch {}
process.exit(0)
