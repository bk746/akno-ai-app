#!/usr/bin/env node
/* update78 · Agenda complet + comptes employés + lien public, WebKit 393 px.
   Supabase et /api simulés, aucune écriture en prod. */
import { webkit } from "playwright"
import { harness, UID } from "./pw-harness.mjs"

const H = harness({ port: 5190 }), W = 393, HT = 852
let ok = 0, ko = 0
const check = (name, cond, extra = "") => { if (cond) { ok++; console.log(`✔ ${name}`) } else { ko++; console.log(`✘ ${name}${extra ? " " + extra : ""}`) } }

const EMP = "e0000000-0000-4000-8000-000000000001"
const todayIso = (h, m = 0) => {
  const now = new Date()
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
  const pad = n => String(n).padStart(2, "0")
  return `${ymd}T${pad(h)}:${pad(m)}:00+01:00`
}
const apt = (id, client, kind, h, extra = {}) => ({
  id, artisan_id: UID, title: kind, client, start: todayIso(h), end: todayIso(h + 1),
  kind, status: "prevu", adresse: "12 rue des Lilas, Lyon", telephone_client: "0612345678", ...extra,
})

async function main() {
  await H.start()
  const browser = await webkit.launch()
  try {
    const tables = {
      appointments: [
        apt("a0000000-0000-4000-8000-000000000001", "Julie Bernard", "rdv", 9),
        apt("a0000000-0000-4000-8000-000000000002", "Chantier Dupont", "chantier", 11, { employe_id: EMP }),
        apt("a0000000-0000-4000-8000-000000000003", "SAV chaudière", "sav", 14),
        apt("a0000000-0000-4000-8000-000000000004", "Congés Léa", "absence", 8, { absence_kind: "conges", employe_id: EMP, end: todayIso(17) }),
      ],
      employes: [{ id: EMP, artisan_id: UID, first_name: "Léa", last_name: "Martin", access_role: "ouvrier", invite_status: "accepted" }],
    }
    const { page } = await H.newPage(browser, {
      width: W, height: HT, scale: 2, tables,
      api: (path, body) => {
        if (path === "/api/account" && body.action === "booking_link") return { body: { ok: true, url: "http://localhost:5190/reserver/demo-token", booking_on: true, agenda_sms: true, token: "demo-token" } }
        if (path === "/api/account" && body.action === "agenda_on_arrive") return { body: { ok: true, sms: false, status: "en_route" } }
        return { body: { ok: true } }
      },
    })
    await page.goto(`${H.BASE}/agenda`)
    await page.waitForSelector("[data-bar-pill]", { timeout: 20000 })
    await page.waitForTimeout(400)

    const views = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('[role="tablist"][aria-label="Vue du calendrier"] [role="tab"]')].map(t => (t.textContent || "").trim())
      return { tabs, tools: !!document.querySelector("[data-agenda-tools]"), ics: [...document.querySelectorAll("button")].some(b => /Exporter ICS/i.test(b.textContent || "")), csv: [...document.querySelectorAll("button")].some(b => /Export paie/i.test(b.textContent || "")), link: [...document.querySelectorAll("button")].some(b => /Copier le lien/i.test(b.textContent || "")) }
    })
    check("les vues Jour, Semaine, Mois et Équipe sont là", ["Jour", "Semaine", "Mois", "Équipe"].every(t => views.tabs.includes(t)), JSON.stringify(views.tabs))
    check("outils agenda : ICS, paie CSV et lien public", views.tools && views.ics && views.csv && views.link)

    await page.getByRole("tab", { name: "Équipe" }).click()
    await page.waitForSelector("[data-team-view]", { timeout: 8000 })
    await page.waitForFunction(() => (document.querySelector("[data-team-view]")?.textContent || "").includes("Léa"), { timeout: 10000 }).catch(() => {})
    const team = await page.evaluate(() => {
      const root = document.querySelector("[data-team-view]")
      return { ok: !!root, lea: (root?.textContent || "").includes("Léa"), text: (root?.textContent || "").slice(0, 200), conflict: (root?.textContent || "").toLowerCase().includes("conflit") }
    })
    check("la vue équipe côte à côte s'affiche (colonne Léa)", team.ok && team.lea, JSON.stringify(team))

    await page.getByRole("tab", { name: "Jour" }).click()
    await page.waitForTimeout(250)
    const colors = await page.evaluate(() => {
      const evs = [...document.querySelectorAll("[data-kind]")]
      const kinds = evs.map(e => e.getAttribute("data-kind"))
      const cols = evs.map(e => e.style.boxShadow || "")
      return { kinds, hasRdv: kinds.includes("rdv"), hasChantier: kinds.includes("chantier"), hasSav: kinds.includes("sav"), distinct: new Set(cols.filter(Boolean)).size >= 2 }
    })
    check("les types d'événements ont une couleur chacun (RDV, chantier, SAV)", colors.hasRdv && colors.hasChantier && colors.hasSav && colors.distinct, JSON.stringify(colors))

    await page.getByRole("button", { name: /Julie Bernard/ }).first().click()
    await page.waitForSelector("[data-event-sheet]", { timeout: 8000 })
    const sheet = await page.evaluate(() => {
      const root = document.querySelector("[data-event-sheet]")
      const txt = root?.textContent || ""
      return {
        ok: !!root,
        maps: !!root?.querySelector("a[href*='maps']") || /Maps/.test(txt),
        waze: !!root?.querySelector("a[href*='waze']") || /Waze/.test(txt),
        client: /Fiche client/.test(txt),
        arrive: /On arrive/.test(txt),
        punch: /Pointer l'arrivée/.test(txt),
        photo: /Ajouter une photo/.test(txt),
        sign: /Signature/.test(txt),
        notes: !!root?.querySelector("textarea"),
      }
    })
    check("la fiche événement lie client / Maps / Waze", sheet.ok && sheet.client && sheet.maps && sheet.waze, JSON.stringify(sheet))
    check("vue terrain : on arrive, pointage, photos, notes, signature", sheet.arrive && sheet.punch && sheet.photo && sheet.sign && sheet.notes, JSON.stringify(sheet))

    await page.getByRole("button", { name: "Pointer l'arrivée" }).click()
    await page.waitForTimeout(300)
    const punched = await page.evaluate(() => /Arrivé/.test(document.querySelector("[data-event-sheet]")?.textContent || ""))
    check("le pointage d'arrivée passe à « Arrivé »", punched)

    await page.keyboard.press("Escape")
    await page.waitForTimeout(200)
    if (await page.locator("[data-event-sheet]").count()) {
      // close via sheet close if Escape didn't
      const closeBtn = page.getByRole("button", { name: /Fermer|OK|Annuler/ }).first()
      if (await closeBtn.count()) await closeBtn.click().catch(() => {})
    }
    // Ouvrir nouveau RDV : type / assignation / récurrence présents, layout Date inchangé
    const add = page.getByRole("button", { name: "Ajouter un rendez-vous" })
    if (await add.count()) await add.click()
    else await page.getByRole("button", { name: "Nouveau" }).click()
    await page.waitForSelector("[data-rdv-form]", { timeout: 8000 })
    const form = await page.evaluate(() => {
      const root = document.querySelector("[data-rdv-form]")
      const kind = root?.querySelector("[data-rdv-kind]")
      const opts = kind ? [...kind.querySelectorAll("option")].map(o => o.value) : []
      const date = [...root.querySelectorAll("label")].find(l => (l.querySelector("span")?.textContent || "").trim() === "Date")
      const heure = [...root.querySelectorAll("label")].find(l => (l.querySelector("span")?.textContent || "").trim() === "Heure")
      const duree = [...root.querySelectorAll("label")].find(l => (l.querySelector("span")?.textContent || "").trim().startsWith("Durée"))
      const dr = date?.querySelector("input")?.getBoundingClientRect()
      const hr = heure?.querySelector("input")?.getBoundingClientRect()
      const dur = duree?.querySelector("select")?.getBoundingClientRect()
      return {
        kind: !!kind, opts,
        employe: !!root?.querySelector("[data-rdv-employe]"),
        rrule: !!root?.querySelector("[data-rdv-rrule]"),
        side: dr && hr && dur && hr.y > dr.y + dr.height - 4 && Math.abs(hr.y - dur.y) <= 8,
      }
    })
    check("le formulaire RDV propose type, assignation et récurrence", form.kind && form.employe && form.rrule && ["rdv", "visite", "chantier", "sav", "urgence", "absence"].every(k => form.opts.includes(k)), JSON.stringify(form))
    check("Date / Heure / Durée restent bien disposés à 393 px", !!form.side, JSON.stringify(form))

    // Page publique réservation
    const pub = await H.newPage(browser, {
      width: W, height: HT, scale: 2, tables,
      api: (path, body) => {
        if (path === "/api/booking" && body.action === "public_slots") return { body: { ok: true, company: "Dupont Élec", slots: [{ start: "2026-11-24T09:00:00+01:00", end: "2026-11-24T10:00:00+01:00", label: "mardi 24 nov. à 9 h", date: "2026-11-24", heure: "09:00" }] } }
        if (path === "/api/booking" && body.action === "public_book") return { body: { ok: true, confirmation: "Rendez-vous confirmé le mardi 24 novembre à 9 h pour Test.", company: "Dupont Élec" } }
        return { body: { ok: true } }
      },
    })
    await pub.page.goto(`${H.BASE}/reserver/demo-token`)
    await pub.page.waitForSelector("[data-reserver]", { timeout: 15000 })
    await pub.page.getByRole("button", { name: /mardi 24/ }).click()
    await pub.page.waitForSelector("[data-book-form]", { timeout: 5000 })
    await pub.page.getByPlaceholder("Votre nom").fill("Test Client")
    await pub.page.getByRole("button", { name: "Confirmer le rendez-vous" }).click()
    await pub.page.waitForTimeout(400)
    const booked = await pub.page.evaluate(() => /C'est réservé|Rendez-vous confirmé/.test(document.body.innerText))
    check("le lien public permet de réserver un créneau libre", booked)
    await pub.ctx.close()

    const join = await H.newPage(browser, {
      width: W, height: HT, scale: 2,
      api: (path, body) => {
        if (path === "/api/account" && body.action === "equipe_preview") return { body: { ok: true, first_name: "Léa", email: "lea@example.com", company: "Dupont Élec", role: "ouvrier" } }
        if (path === "/api/account" && body.action === "equipe_accept") return { body: { ok: true, email: "lea@example.com" } }
        return { body: { ok: true } }
      },
    })
    await join.page.goto(`${H.BASE}/rejoindre/demo-invite`)
    await join.page.waitForSelector("[data-rejoindre]", { timeout: 15000 })
    const inviteUi = await join.page.evaluate(() => /Dupont Élec vous invite/.test(document.body.innerText) && !!document.querySelector("input[type=password]"))
    check("la page d'invitation employé affiche l'entreprise et le mot de passe", inviteUi)
    await join.page.locator("input[type=password]").fill("motdepasse")
    await join.page.getByRole("button", { name: "Activer mon accès" }).click()
    await join.page.waitForTimeout(400)
    const accepted = await join.page.evaluate(() => /Compte activé/.test(document.body.innerText))
    check("l'invitation employé peut être acceptée", accepted)
    await join.ctx.close()

    // Session employé : seulement l'agenda dans la nav
    const empPage = await H.newPage(browser, {
      width: W, height: HT, scale: 2,
      tables: {
        employes: [{ id: EMP, artisan_id: "art-patron", user_id: UID, first_name: "Léa", last_name: "Martin", access_role: "ouvrier", invite_status: "accepted" }],
        appointments: [apt("a0000000-0000-4000-8000-000000000010", "Julie Bernard", "rdv", 9, { employe_id: EMP, artisan_id: "art-patron" })],
      },
    })
    await empPage.page.goto(`${H.BASE}/agenda`)
    await empPage.page.waitForSelector("[data-bar-pill]", { timeout: 20000 })
    await empPage.page.waitForTimeout(600)
    const nav = await empPage.page.evaluate(() => {
      const tabs = [...document.querySelectorAll("[data-mobile-nav] [data-tab]")].map(t => t.getAttribute("data-tab"))
      const plus = !!document.querySelector("[data-create-btn]")
      return { tabs, plus }
    })
    check("un employé ne voit que l'onglet Agenda (pas Réception ni Factures)", nav.tabs.length === 1 && nav.tabs[0] === "ag" && !nav.plus, JSON.stringify(nav))
    await empPage.ctx.close()
  } finally {
    await browser.close()
    H.stop()
  }
  console.log(`\n${ok} ok, ${ko} ko`)
  if (ko) process.exit(1)
}

main().catch(e => { console.error(e); try { H.stop() } catch { /* */ } process.exit(1) })
