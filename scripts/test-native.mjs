#!/usr/bin/env node
/* update70 · Tests Playwright (WebKit, viewport iPhone) des nouveautés bêta stores.
   - Supabase et /api/* sont SIMULÉS (aucun appel réseau vers la prod, aucune écriture en base).
   - L'app native est simulée en développement avec ?native=ios (lib/native.ts).
   Usage : npm run test:native   (SHOTS_DIR=… pour enregistrer les captures) */
import { spawn } from "node:child_process"
import { readFileSync, mkdirSync } from "node:fs"
import { webkit } from "playwright"

const PORT = 5199, BASE = `http://localhost:${PORT}`
const SHOTS = process.env.SHOTS_DIR || ""
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const envTxt = (() => { try { return readFileSync(".env.local", "utf8") } catch { return "" } })()
const SB_URL = (envTxt.match(/^VITE_SUPABASE_URL=(.*)$/m)?.[1] || "https://example.supabase.co").trim().replace(/^"|"$/g, "")
const REF = new URL(SB_URL).hostname.split(".")[0]
const UID = "11111111-2222-4333-8444-555555555555", EMAIL = "demo@akno.fr"
const pkg = JSON.parse(readFileSync("package.json", "utf8"))

let ok = 0, ko = 0
const check = (name, cond, extra = "") => { if (cond) { ok++; console.log(`✔ ${name}`) } else { ko++; console.log(`✘ ${name} ${extra}`) } }

const b64u = o => Buffer.from(JSON.stringify(o)).toString("base64url")
const jwt = () => `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u({ sub: UID, email: EMAIL, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 86400 })}.c2lnbmF0dXJl`
const USER = { id: UID, email: EMAIL, aud: "authenticated", role: "authenticated", app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-11-01T10:00:00Z" }
const PROFILE = { id: UID, prenom: "Camille", nom: "Martin", email: EMAIL, entreprise_nom: "Martin Plomberie", nom_entreprise: "Martin Plomberie", cgv_version: "2026-11", onboarding_done: true, metier: "Plombier", telephone: "0600000000", created_at: "2026-11-01T10:00:00Z" }
const ENT = {
  override: { billingEnabled: true, access: true, status: "active", plan: "clients", reception: true, features: ["devis", "relances_devis", "factures", "relances_impayes", "conformite", "agenda", "sms", "avis", "leads", "rapport_mensuel", "reception"], trialEndsAt: null, periodEnd: null, cancelAtPeriodEnd: false, hasStripeCustomer: false, trialEligible: false, override: true, quotas: { devis_drafts: 600, voice_sessions_day: 120, voice_minutes: 100, sms: 500 } },
  none: { billingEnabled: true, access: false, status: "none", plan: null, reception: false, features: [], trialEndsAt: null, periodEnd: null, cancelAtPeriodEnd: false, hasStripeCustomer: false, trialEligible: true, override: false, quotas: { devis_drafts: 0, voice_sessions_day: 0, voice_minutes: 0, sms: 0 } },
  bureau: { billingEnabled: true, access: true, status: "trial", plan: "bureau", reception: false, features: ["devis", "relances_devis", "factures", "relances_impayes", "conformite", "agenda", "sms"], trialEndsAt: "2026-12-20T00:00:00Z", periodEnd: null, cancelAtPeriodEnd: false, hasStripeCustomer: true, trialEligible: false, override: false, quotas: { devis_drafts: 300, voice_sessions_day: 20, voice_minutes: 60, sms: 200 } },
}
const status = ent => ({ ok: true, entitlements: ent, usage: { voice_minutes: 0, devis_drafts: 0, sms: 0, voice_sessions_today: 0 }, billing: { enabled: true, prices: { bureau: true, clients: true, reception: true }, annual: true, trial_days: 30 }, integrations: { calcom: false, calcom_global: false, sms: true, resend: true, twilio_number: "+33900000000", forward_to: "" } })

async function newPage(browser, { logged = true, ent = ENT.override, calls = [] } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: "fr-FR", timezoneId: "Europe/Paris", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" })
  const page = await ctx.newPage()
  const seen = { deleteBody: null, prodCalls: 0 }
  await ctx.addInitScript(([key, session, uid, logged]) => {
    try {
      if (logged && !localStorage.getItem("pw-test-init")) { localStorage.setItem(key, session); localStorage.setItem("pw-test-init", "1") }
      localStorage.setItem(`akno-lock-asked:${uid}`, "1")
    } catch { /* ignore */ }
  }, [`sb-${REF}-auth-token`, JSON.stringify({ access_token: jwt(), refresh_token: "rt", token_type: "bearer", expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user: USER }), UID, logged])
  await ctx.route(u => u.hostname.endsWith("supabase.co"), async route => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname
    seen.prodCalls++
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: "application/json", body: JSON.stringify(b) })
    if (p.startsWith("/auth/v1/user")) return json(USER)
    if (p.startsWith("/auth/v1/settings")) return json({ external: { email: true, google: false, apple: false } })
    if (p.startsWith("/auth/v1/logout")) return route.fulfill({ status: 204, body: "" })
    if (p.startsWith("/auth/v1/token")) return json({ access_token: jwt(), refresh_token: "rt", token_type: "bearer", expires_in: 86400, user: USER })
    if (p.startsWith("/rest/v1/")) {
      const table = p.split("/")[3], single = (req.headers()["accept"] || "").includes("vnd.pgrst.object")
      if (req.method() !== "GET") return json(single ? {} : [])
      if (table === "artisans") return json(single ? PROFILE : [PROFILE])
      if (table === "calls") return json(single ? null : calls)
      if (single) return json({ code: "PGRST116", message: "no rows", details: "", hint: "" }, 406)
      return json([])
    }
    if (p.startsWith("/storage/")) return json({})
    return json({})
  })
  await ctx.route(u => u.origin === BASE && /^\/api\/[a-z-]+$/.test(u.pathname), async route => {
    const req = route.request(), body = req.postDataJSON?.() || {}
    const json = b => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) })
    if (req.url().includes("/api/account")) {
      if (body.action === "status") return json(status(ent))
      if (body.action === "delete_account") { seen.deleteBody = body; return json({ ok: true, mode: "deleted" }) }
    }
    return json({ ok: true })
  })
  page.on("pageerror", e => console.log("  [pageerror]", String(e.message).slice(0, 160)))
  return { ctx, page, seen }
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }) }
const text = page => page.evaluate(() => document.body.innerText)
const settle = page => page.waitForTimeout(1200)

async function main() {
  const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--port", String(PORT), "--strictPort"], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, BROWSER: "none" } })
  vite.stderr.on("data", d => { if (/error/i.test(String(d))) console.log("  [vite]", String(d).trim().slice(0, 200)) })
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("vite timeout")), 60000); vite.stdout.on("data", d => { if (/ready|Local:/i.test(String(d))) { clearTimeout(t); res() } }) })
  const browser = await webkit.launch()
  try {
    // 1. Connexion : boutons Google / Apple masqués par défaut (web puis natif)
    for (const mode of ["web", "ios"]) {
      const { ctx, page } = await newPage(browser, { logged: false })
      await page.goto(`${BASE}/reception${mode === "ios" ? "?native=ios" : ""}`); await settle(page)
      const t = await text(page)
      check(`connexion ${mode} : écran affiché`, /e-mail|Bienvenue|Continuer/i.test(t))
      check(`connexion ${mode} : pas de bouton Google`, !/Continuer avec Google/.test(t))
      check(`connexion ${mode} : pas de bouton Apple`, !/Continuer avec Apple/.test(t))
      await shot(page, `connexion-${mode}-sans-google-apple`)
      await ctx.close()
    }
    // 2. Réglages natif : pas d'abonnement, suppression de compte, version, notifications natives annoncées
    {
      const { ctx, page } = await newPage(browser)
      await page.goto(`${BASE}/parametres?native=ios`); await page.waitForSelector("[data-testid=app-version]", { timeout: 20000 }).catch(() => {})
      await settle(page)
      const t = await text(page)
      check("réglages natif : ligne Abonnement absente", !/\bAbonnement\b/.test(t))
      check("réglages natif : « Supprimer mon compte » présent", /Supprimer mon compte/.test(t))
      check("réglages natif : version affichée", t.includes(`Version ${pkg.version} (build ${pkg.buildNumber})`), t.match(/Version[^\n]*/)?.[0] || "")
      check("réglages natif : notifications annoncées comme pas encore disponibles dans l'app installée", /Pas encore dans l'app installée/.test(t))
      check("réglages natif : aucun prix d'abonnement", !/€\s*HT\s*\/|par mois|\/ mois|essai gratuit/i.test(t), (t.match(/.{0,40}€.{0,20}/g) || []).join(" | "))
      await page.evaluate(() => document.querySelector("[data-testid=app-version]")?.scrollIntoView({ block: "end" })); await page.waitForTimeout(400)
      await shot(page, "reglages-natif-bas-suppression-version")
      // 3. Suppression du compte : confirmation forte
      await page.getByText("Supprimer mon compte", { exact: true }).first().click(); await page.waitForSelector("[data-testid=delete-account]")
      await page.waitForTimeout(600); await shot(page, "suppression-compte-confirmation")
      const btn = page.locator("[data-testid=delete-submit]")
      check("suppression : bouton désactivé au départ", await btn.isDisabled())
      await page.fill("[data-testid=delete-word]", "SUPPRIMER")
      check("suppression : désactivé sans la case cochée", await btn.isDisabled())
      await page.check("[data-testid=delete-ack]")
      await page.fill("[data-testid=delete-word]", "supprime")
      check("suppression : désactivé si le mot est faux", await btn.isDisabled())
      await page.fill("[data-testid=delete-word]", "supprimer")
      check("suppression : activé (case + SUPPRIMER, casse indifférente)", await btn.isEnabled())
      await shot(page, "suppression-compte-pret")
      await ctx.close()
    }
    {
      const { ctx, page, seen } = await newPage(browser)
      await page.goto(`${BASE}/parametres?native=ios`); await page.waitForSelector("[data-testid=app-version]", { timeout: 20000 }).catch(() => {}); await settle(page)
      await page.getByText("Supprimer mon compte", { exact: true }).first().click(); await page.waitForSelector("[data-testid=delete-account]")
      await page.check("[data-testid=delete-ack]"); await page.fill("[data-testid=delete-word]", "SUPPRIMER")
      await page.click("[data-testid=delete-submit]")
      await page.waitForSelector("[data-testid=delete-done]", { timeout: 8000 }).catch(() => {})
      check("suppression : appel serveur delete_account + confirmation", seen.deleteBody?.action === "delete_account" && seen.deleteBody?.confirm === "SUPPRIMER", JSON.stringify(seen.deleteBody))
      check("suppression : écran « Compte supprimé »", /Compte supprimé/.test(await text(page)))
      await shot(page, "suppression-compte-termine")
      await page.waitForTimeout(4500)
      const left = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("akno") || k.startsWith("sb-")))
      check("suppression : session et données locales effacées", !left.some(k => k.startsWith("sb-") || k.startsWith("akno-lock:")), left.join(","))
      await ctx.close()
    }
    // 4. Web inchangé : ligne Abonnement présente
    {
      const { ctx, page } = await newPage(browser)
      await page.goto(`${BASE}/parametres?native=0`); await page.waitForSelector("[data-testid=app-version]", { timeout: 20000 }).catch(() => {}); await settle(page)
      const t = await text(page)
      check("réglages web : ligne Abonnement toujours là", /\bAbonnement\b/.test(t))
      check("réglages web : « Supprimer mon compte » présent", /Supprimer mon compte/.test(t))
      await ctx.close()
    }
    // 5. Compte sans accès : écran neutre en natif, choix d'offre sur le web
    {
      const { ctx, page } = await newPage(browser, { ent: ENT.none })
      await page.goto(`${BASE}/reception?native=ios`); await page.waitForSelector("[data-testid=native-no-access]", { timeout: 20000 }).catch(() => {}); await settle(page)
      const t = await text(page)
      check("sans accès natif : écran « Accès non activé »", /Accès non activé/.test(t))
      check("sans accès natif : aucun prix ni offre", !/€|Choisissez|essai gratuit|S'abonner/i.test(t), t.slice(0, 200))
      await shot(page, "natif-acces-non-active")
      await ctx.close()
    }
    {
      const { ctx, page } = await newPage(browser, { ent: ENT.none })
      await page.goto(`${BASE}/reception?native=0`); await page.waitForTimeout(4000)
      const t = await text(page)
      check("sans accès web : choix d'offre avec prix (inchangé)", /€/.test(t) && !/Accès non activé/.test(t))
      await shot(page, "web-choix-offre-inchange")
      await ctx.close()
    }
    // 6. Option Réceptionniste non incluse (offre Bureau) : aucune proposition d'achat en natif
    {
      const { ctx, page } = await newPage(browser, { ent: ENT.bureau })
      await page.goto(`${BASE}/parametres?native=ios`); await page.waitForSelector("[data-testid=app-version]", { timeout: 20000 }).catch(() => {}); await settle(page)
      const t = await text(page)
      check("option non incluse natif : étiquette « Non incluse »", /Non incluse/.test(t))
      check("option non incluse natif : pas de « Ajouter » ni de prix", !/\bAjouter\b|€\s*HT/.test(t), (t.match(/.{0,30}(Ajouter|€).{0,30}/g) || []).join(" | "))
      // la ligne « Réceptionniste IA » (étiquette « Non incluse ») ouvre la feuille neutre, sans aucun prix
      await page.locator("button, [role=button]").filter({ hasText: "Non incluse" }).first().click({ timeout: 5000 }).catch(e => console.log("  [clic]", String(e.message).slice(0, 120)))
      await page.waitForSelector("[data-testid=native-not-included]", { timeout: 8000 }).catch(() => {})
      const t2 = await page.locator("[data-testid=native-not-included]").innerText().catch(() => "")
      check("option non incluse natif : feuille neutre sans prix", /pas activée sur votre compte/.test(t2) && !/€|Ajouter|S'abonner/i.test(t2), t2.slice(0, 120))
      await page.waitForTimeout(500); await shot(page, "natif-option-non-incluse")
      await ctx.close()
    }
    // 7. Pages légales présentables sans VITE_LEGAL_* + page publique de suppression
    for (const d of ["mentions-legales", "confidentialite", "suppression-compte"]) {
      const { ctx, page } = await newPage(browser, { logged: false })
      await page.goto(`${BASE}/${d}`); await page.waitForTimeout(1500)
      const t = await text(page)
      check(`page /${d} : aucun « à compléter »`, !/à compléter|\[/.test(t))
      if (d === "suppression-compte") check("page /suppression-compte : démarche + données supprimées / conservées", /Réglages › Données/.test(t) && /Données conservées/.test(t))
      await shot(page, `page-${d}`)
      await ctx.close()
    }
  } finally {
    await browser.close()
    vite.kill("SIGTERM")
  }
  console.log(`\n${ok} OK, ${ko} KO`)
  process.exit(ko ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
