#!/usr/bin/env node
/* update80 · WebKit 393 px : vue Année qui scrolle, clavier (assistant + chantier), réglages regroupés.
   Supabase simulé, aucune écriture en prod. */
import { webkit } from "playwright"
import { harness, UID } from "./pw-harness.mjs"
import { chainTables, FACT3, PROFILE71 } from "./fixtures-chaine.mjs"

const H = harness({ port: 5186 }), W = 393, HT = 852
const KB = 320
let ok = 0, ko = 0
const check = (name, cond, extra = "") => { if (cond) { ok++; console.log(`✔ ${name}`) } else { ko++; console.log(`✘ ${name}${extra ? " " + extra : ""}`) } }

async function fakeKb(page, on, px = KB) {
  await page.evaluate(({ on, px }) => {
    const vv = window.visualViewport
    if (!window.__aknoVV) {
      window.__aknoVV = { on: false, px: 0 }
      if (vv) {
        const proto = Object.getPrototypeOf(vv)
        const hDesc = Object.getOwnPropertyDescriptor(proto, "height") || Object.getOwnPropertyDescriptor(vv, "height")
        const tDesc = Object.getOwnPropertyDescriptor(proto, "offsetTop") || Object.getOwnPropertyDescriptor(vv, "offsetTop")
        const hGet = hDesc?.get ? hDesc.get.bind(vv) : () => innerHeight
        const tGet = tDesc?.get ? tDesc.get.bind(vv) : () => 0
        try {
          Object.defineProperty(vv, "height", { configurable: true, get() { return window.__aknoVV.on ? Math.max(120, hGet() - window.__aknoVV.px) : hGet() } })
          Object.defineProperty(vv, "offsetTop", { configurable: true, get() { return window.__aknoVV.on ? 0 : tGet() } })
        } catch { /* */ }
      }
    }
    window.__aknoVV.on = !!on
    window.__aknoVV.px = px
    const r = document.documentElement
    r.style.setProperty("--kb", on ? `${px}px` : "0px")
    r.classList.toggle("kb-open", !!on)
    r.style.setProperty("--vvh", `${Math.round(on ? window.innerHeight - px : window.innerHeight)}px`)
    vv?.dispatchEvent(new Event("resize"))
    window.dispatchEvent(new Event("resize"))
  }, { on, px })
}

const hiddenSel = `(sel) => {
  const el = document.querySelector(sel)
  if (!el) return true
  const cs = getComputedStyle(el), r = el.getBoundingClientRect()
  return cs.visibility === "hidden" || +cs.opacity < .05 || cs.pointerEvents === "none" || r.height < 2
}`

async function main() {
  await H.start()
  const browser = await webkit.launch()
  try {
    const yday = new Date(); yday.setDate(yday.getDate() - 1)
    const { page } = await H.newPage(browser, {
      width: W, height: HT, scale: 2,
      tables: {
        ...chainTables({ factures: [FACT3] }),
        appointments: [{ id: "a0000000-0000-4000-8000-000000000001", artisan_id: UID, title: "Entretien", client: "Julie Bernard", start: yday.toISOString(), end: new Date(yday.getTime() + 3600e3).toISOString() }],
      },
      profile: PROFILE71,
    })

    /* ---- 2) Agenda, vue Année : la grille scrolle avec la page, sans superposition ---- */
    await page.goto(`${H.BASE}/agenda`)
    await page.waitForSelector("[data-bar-pill]", { timeout: 20000 })
    await page.waitForSelector('[role="tablist"][aria-label="Vue du calendrier"]', { timeout: 15000 })
    await page.getByRole("tab", { name: "Année" }).click()
    await page.waitForSelector("[data-year-grid]", { timeout: 8000 })
    await page.waitForTimeout(250)
    const before = await page.evaluate(() => {
      const y = document.querySelector("[data-year-grid]")
      const tools = document.querySelector("[data-agenda-tools]")
      const yr = y.getBoundingClientRect(), tr = tools?.getBoundingClientRect()
      const cs = getComputedStyle(y)
      return { top: yr.top, bottom: yr.bottom, h: yr.height, toolsTop: tr?.top ?? 0, pos: cs.position, z: cs.zIndex }
    })
    check("vue Année : la grille n'est ni sticky ni fixed", before.pos !== "sticky" && before.pos !== "fixed", JSON.stringify(before))
    await page.evaluate(() => { const sc = document.querySelector("[data-page-scroll]"); if (sc) sc.scrollTop = 320 })
    await page.waitForTimeout(250)
    const after = await page.evaluate(() => {
      const y = document.querySelector("[data-year-grid]")
      const tools = document.querySelector("[data-agenda-tools]")
      const yr = y.getBoundingClientRect(), tr = tools?.getBoundingClientRect()
      const overlap = !!(tr && tr.top < yr.bottom - 2 && tr.bottom > yr.top + 2)
      return { top: yr.top, bottom: yr.bottom, toolsTop: tr?.top ?? 0, overlap, scroll: document.querySelector("[data-page-scroll]")?.scrollTop || 0 }
    })
    check("vue Année : la grille scrolle avec la page", after.scroll >= 200 && after.top < before.top - 80, JSON.stringify({ before, after }))
    check("vue Année : Occupation / exports ne passent pas par-dessus les mois", !after.overlap, JSON.stringify({ before, after }))

    /* ---- 4) Facture émise F-2026-0003 : pas un brouillon vide ---- */
    await page.goto(`${H.BASE}/factures`)
    await page.waitForSelector("[data-bar-pill]", { timeout: 20000 })
    await page.getByRole("button", { name: "Ouvrir F-2026-0003" }).waitFor({ timeout: 20000 })
    await page.getByRole("button", { name: "Ouvrir F-2026-0003" }).click()
    await page.waitForSelector("[data-facture-detail]", { timeout: 15000, state: "attached" })
    const fac = await page.evaluate(() => {
      const dlg = document.querySelector("[role=dialog]")
      const t = (dlg?.textContent || "").replace(/\s+/g, " ")
      return { t, hasNum: t.includes("F-2026-0003"), brouillon: /Facture\s*•?\s*Brouillon/.test(t) && !t.includes("F-2026-0003"), hasClient: t.includes("Isabelle Fournier"), emise: t.includes("Émise") || t.includes("En retard") }
    })
    check("facture émise : la fiche montre F-2026-0003, pas un brouillon vide", fac.hasNum && fac.hasClient && !fac.brouillon, JSON.stringify(fac))
    await page.getByRole("button", { name: "Fermer" }).click()
    await page.waitForTimeout(500)

    /* ---- 3) Assistant IA : champ au-dessus du clavier, navbar masquée, feuille stable ---- */
    await page.getByRole("button", { name: "Assistant", exact: true }).click()
    await page.waitForSelector("[data-chat-sheet], [role=dialog]", { timeout: 10000 })
    await page.waitForTimeout(400)
    const sheet0 = await page.evaluate(() => {
      const s = document.querySelector("[data-chat-sheet]") || document.querySelector("[role=dialog]")
      const r = s?.getBoundingClientRect()
      return { ok: !!s && (r?.height || 0) > 120, top: r?.top || 0, bottom: r?.bottom || 0, h: r?.height || 0 }
    })
    check("assistant : la feuille est visible avant le clavier", sheet0.ok, JSON.stringify(sheet0))
    const inp = page.getByRole("textbox", { name: "Message" })
    await inp.click()
    await fakeKb(page, true)
    await page.waitForTimeout(200)
    const kb = await page.evaluate((KB) => {
      const hidden = (sel) => {
        const el = document.querySelector(sel)
        if (!el) return true
        const cs = getComputedStyle(el), r = el.getBoundingClientRect()
        return cs.visibility === "hidden" || +cs.opacity < .05 || cs.pointerEvents === "none" || r.height < 2
      }
      const sheet = document.querySelector("[data-chat-sheet]") || document.querySelector("[role=dialog]")
      const input = document.querySelector("[data-chat-input]") || document.querySelector("[aria-label=Message]")?.closest("form")
      const sr = sheet?.getBoundingClientRect(), ir = input?.getBoundingClientRect()
      const kbTop = window.innerHeight - KB
      return {
        navHidden: hidden("[data-mobile-nav]"),
        sheetH: sr?.height || 0, sheetTop: sr?.top || 0, sheetBottom: sr?.bottom || 0,
        inputBottom: ir?.bottom || 0, inputTop: ir?.top || 0, kbTop,
        inputAboveKb: !!ir && ir.bottom <= kbTop + 8 && ir.top > 40,
        sheetStable: !!sr && sr.height > 80 && sr.top < window.innerHeight && sr.bottom > 80,
      }
    }, KB)
    check("assistant : la navbar est masquée quand le clavier est ouvert", kb.navHidden, JSON.stringify(kb))
    check("assistant : le champ reste visible juste au-dessus du clavier", kb.inputAboveKb, JSON.stringify(kb))
    check("assistant : la feuille reste stable (ne disparaît pas)", kb.sheetStable, JSON.stringify(kb))
    await fakeKb(page, false)
    await page.waitForTimeout(200)
    await page.evaluate(() => document.querySelector('[aria-label="Fermer l\'assistant"], [aria-label="Fermer"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })))
    await page.keyboard.press("Escape").catch(() => {})
    await page.waitForTimeout(400)

    /* ---- 5) Nouveau chantier : carte et navbar masquées ; blur avant le date picker ---- */
    await page.goto(`${H.BASE}/chantiers`)
    await page.waitForSelector("[data-bar-pill], [data-create-btn]", { timeout: 20000 })
    await page.waitForTimeout(600)
    await page.click("[data-create-btn]")
    await page.waitForTimeout(500)
    await page.locator("[data-create-menu] button").filter({ hasText: "Nouveau chantier" }).click()
    await page.waitForSelector("#cf-addr", { timeout: 15000 })
    await page.click("#cf-addr")
    await fakeKb(page, true)
    await page.waitForTimeout(200)
    const ch = await page.evaluate(() => {
      const hidden = (sel) => {
        const el = document.querySelector(sel)
        if (!el) return true
        const cs = getComputedStyle(el), r = el.getBoundingClientRect()
        return cs.visibility === "hidden" || +cs.opacity < .05 || cs.pointerEvents === "none" || r.height < 2
      }
      return { peekHidden: hidden("[data-ch-peek]"), navHidden: hidden("[data-mobile-nav]") }
    })
    check("nouveau chantier : la carte flottante est masquée (feuille ou clavier)", ch.peekHidden, JSON.stringify(ch))
    check("nouveau chantier : la navbar est masquée (feuille ou clavier)", ch.navHidden, JSON.stringify(ch))
    const blurred = await page.evaluate(() => {
      const addr = document.querySelector("#cf-addr")
      const start = document.querySelector("#cf-start")
      if (!addr || !start) return { ok: false, why: "champs absents" }
      addr.focus()
      if (document.activeElement !== addr) return { ok: false, why: "focus adresse échoué" }
      start.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }))
      return { ok: document.activeElement !== addr, active: document.activeElement && document.activeElement.id }
    })
    check("nouveau chantier : blur() du champ actif avant d'ouvrir Début/Fin", !!blurred.ok, JSON.stringify(blurred))
    await fakeKb(page, false)
    await page.getByRole("button", { name: /Fermer|Annuler/ }).first().click().catch(() => {})
    await page.waitForTimeout(300)

    /* ---- 6) Réglages : essentiel visible, le reste dans Plus de réglages ---- */
    await page.goto(`${H.BASE}/parametres`)
    await page.waitForSelector("[data-bar-pill]", { timeout: 20000 })
    await page.waitForTimeout(800)
    const set0 = await page.evaluate(() => {
      const pageEl = document.querySelector("[data-page]") || document.body
      const t = pageEl.innerText
      const moreOpen = !!document.querySelector("[data-more-settings-body]")
      const has = (s) => t.includes(s)
      return {
        moreOpen,
        plus: has("Plus de réglages"),
        profil: has("Profil et entreprise"),
        rec: has("Réceptionniste") || has("Ma réceptionniste"),
        fac: has("Facturation") && has("TVA par défaut") && has("IBAN"),
        equipe: has("Équipe"),
        notif: has("Notifications"),
        logout: has("Se déconnecter"),
        hiddenAcompte: !has("Acompte à la signature"),
        hiddenLegal: !has("Sous-traitance des données"),
        hiddenDiag: !has("Latence vocale"),
        hiddenAgents: !has("Mes agents"),
      }
    })
    check("réglages : l'essentiel est visible (profil, réceptionniste, facturation, équipe, notifications, déconnexion)", set0.profil && set0.rec && set0.fac && set0.equipe && set0.notif && set0.logout && set0.plus, JSON.stringify(set0))
    check("réglages : le reste est masqué tant que Plus de réglages est replié", !set0.moreOpen && set0.hiddenAcompte && set0.hiddenLegal && set0.hiddenDiag && set0.hiddenAgents, JSON.stringify(set0))
    await page.getByRole("button", { name: "Plus de réglages" }).click()
    await page.waitForSelector("[data-more-settings-body]", { timeout: 8000 })
    const set1 = await page.evaluate(() => {
      const t = (document.querySelector("[data-page]") || document.body).innerText
      return {
        acompte: t.includes("Acompte à la signature"),
        legal: t.includes("Sous-traitance des données") || t.includes("Mentions légales"),
        diag: t.includes("Latence vocale"),
        agents: t.includes("Mes agents"),
        export: t.includes("Suivi et export comptable"),
        pw: t.includes("Changer le mot de passe"),
      }
    })
    check("réglages : Plus de réglages révèle les fonctions avancées sans rien supprimer", set1.acompte && set1.legal && set1.diag && set1.agents && set1.export && set1.pw, JSON.stringify(set1))
  } finally {
    await browser.close()
    H.stop()
  }
  console.log(`\n${ok} ok, ${ko} ko`)
  if (ko) process.exit(1)
}

main().catch(e => { console.error(e); try { H.stop() } catch { /* */ } process.exit(1) })
