/* update70 · Socle Playwright commun (WebKit, iPhone 390×844) : Vite local + Supabase et /api/* SIMULÉS.
   Aucun appel vers la prod, aucune écriture en base. Utilisé par test-navbar.mjs et record-navbar.mjs. */
import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"

export const UID = "11111111-2222-4333-8444-555555555555", EMAIL = "demo@akno.fr"
const b64u = o => Buffer.from(JSON.stringify(o)).toString("base64url")
const jwt = () => `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u({ sub: UID, email: EMAIL, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 86400 })}.c2lnbmF0dXJl`
const USER = { id: UID, email: EMAIL, aud: "authenticated", role: "authenticated", app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-11-01T10:00:00Z" }
const PROFILE = { id: UID, prenom: "Camille", nom: "Martin", email: EMAIL, entreprise_nom: "Martin Plomberie", nom_entreprise: "Martin Plomberie", cgv_version: "2026-11", onboarding_done: true, metier: "Plombier", telephone: "0600000000", created_at: "2026-11-01T10:00:00Z" }
const ENT = { billingEnabled: true, access: true, status: "active", plan: "clients", reception: true, features: ["devis", "relances_devis", "factures", "relances_impayes", "conformite", "agenda", "sms", "avis", "leads", "rapport_mensuel", "reception"], trialEndsAt: null, periodEnd: "2026-12-31T00:00:00Z", cancelAtPeriodEnd: false, hasStripeCustomer: true, trialEligible: false, override: true, quotas: {} }
const STATUS = { ok: true, entitlements: ENT, usage: { voice_minutes: 0, devis_drafts: 0, sms: 0, voice_sessions_today: 0 }, billing: { enabled: true, prices: { bureau: true, clients: true, reception: true }, annual: true, trial_days: 30 }, integrations: {} }

/** Données de démonstration (simulées) : assez d'appels et de devis pour que les pages défilent sous la barre */
const NAMES = ["Julie Bernard", "Marc Petit", "Sophie Durand", "Karim Haddad", "Léa Moreau", "Thomas Roux", "Inès Fontaine", "Paul Girard", "Nadia Benali", "Hugo Lambert", "Claire Faure", "Yanis Mercier", "Emma Chevalier", "Lucas Blanc"]
const MOTIFS = ["Fuite sous évier", "Chauffe-eau en panne", "Devis salle de bain", "WC bouché", "Remplacement robinet", "Recherche de fuite", "Entretien chaudière"]
export const demoCalls = () => NAMES.map((n, i) => ({ id: 1000 + i, artisan_id: UID, nom_client: n, telephone_client: `06 12 34 ${String(10 + i).padStart(2, "0")} 00`, motif: MOTIFS[i % MOTIFS.length], resume: `${MOTIFS[i % MOTIFS.length]} — rappeler dans la journée.`, statut: i % 3 === 0 ? "a_rappeler" : "rappele", rappel_souhaite: i % 3 === 0, urgence: i % 5 === 0 ? "haute" : "normale", duration: 60 + i * 7, created_at: new Date(Date.now() - i * 3.1 * 3600e3).toISOString() }))
export const demoDevis = () => NAMES.slice(0, 10).map((n, i) => ({ id: `d0000000-0000-4000-8000-0000000000${String(10 + i)}`, artisan_id: UID, numero: `D-2026-${String(40 + i).padStart(4, "0")}`, client_nom: n, nom_client: n, objet: MOTIFS[i % MOTIFS.length], statut: ["brouillon", "envoye", "signe", "envoye"][i % 4], total_ttc: 180 + i * 95, montant_ttc: 180 + i * 95, created_at: new Date(Date.now() - i * 26 * 3600e3).toISOString() }))

export function harness({ cwd = process.cwd(), port = 5199 } = {}) {
  const BASE = `http://localhost:${port}`
  const envTxt = (() => { try { return readFileSync(join(cwd, ".env.local"), "utf8") } catch { return "" } })()
  const SB_URL = (envTxt.match(/^VITE_SUPABASE_URL=(.*)$/m)?.[1] || "https://example.supabase.co").trim().replace(/^"|"$/g, "")
  const REF = new URL(SB_URL).hostname.split(".")[0]
  let vite
  async function start() {
    vite = spawn(process.execPath, [join(cwd, "node_modules/vite/bin/vite.js"), "--port", String(port), "--strictPort"], { cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, BROWSER: "none" } })
    vite.stderr.on("data", d => { if (/error/i.test(String(d))) console.log("  [vite]", String(d).trim().slice(0, 200)) })
    await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("vite timeout")), 60000); vite.stdout.on("data", d => { if (/ready|Local:/i.test(String(d))) { clearTimeout(t); res() } }) })
  }
  const stop = () => { try { vite?.kill() } catch { /* ignore */ } }
  async function newPage(browser, { calls = demoCalls(), devis = demoDevis(), statusDelay = 0, video = "" } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: video ? 2 : 3, isMobile: true, hasTouch: true, locale: "fr-FR", timezoneId: "Europe/Paris",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ...(video ? { recordVideo: { dir: video, size: { width: 390, height: 844 } } } : {}) })
    const page = await ctx.newPage()
    await ctx.addInitScript(([key, session, uid]) => {
      try {
        if (!localStorage.getItem("pw-test-init")) { localStorage.setItem(key, session); localStorage.setItem("pw-test-init", "1") }
        localStorage.setItem(`akno-lock-asked:${uid}`, "1")
      } catch { /* ignore */ }
    }, [`sb-${REF}-auth-token`, JSON.stringify({ access_token: jwt(), refresh_token: "rt", token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user: USER }), UID])
    await ctx.route(u => u.hostname.endsWith("supabase.co"), async route => {
      const req = route.request(), p = new URL(req.url()).pathname
      const json = (b, s = 200) => route.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(b) })
      if (p.startsWith("/auth/v1/user")) return json(USER)
      if (p.startsWith("/auth/v1/settings")) return json({ external: { email: true, google: false, apple: false } })
      if (p.startsWith("/auth/v1/token")) return json({ access_token: jwt(), refresh_token: "rt", token_type: "bearer", expires_in: 86400, user: USER })
      if (p.startsWith("/rest/v1/")) {
        const table = p.split("/")[3], single = (req.headers()["accept"] || "").includes("vnd.pgrst.object")
        if (req.method() !== "GET") return json(single ? {} : [])
        if (table === "artisans") return json(single ? PROFILE : [PROFILE])
        if (table === "calls" && !single) return json(calls)
        if (table === "devis" && !single) return json(devis)
        if (single) return json({ code: "PGRST116", message: "no rows", details: "", hint: "" }, 406)
        return json([])
      }
      return json({})
    })
    await ctx.route(u => u.origin === BASE && /^\/api\/[a-z-]+$/.test(u.pathname), async route => {
      const req = route.request(), body = req.postDataJSON?.() || {}
      const json = b => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) })
      if (req.url().includes("/api/account") && body.action === "status") { if (statusDelay) await new Promise(r => setTimeout(r, statusDelay)); return json(STATUS) }
      return json({ ok: true })
    })
    page.on("pageerror", e => console.log("  [pageerror]", String(e.message).slice(0, 160)))
    return { ctx, page }
  }
  return { BASE, start, stop, newPage }
}
