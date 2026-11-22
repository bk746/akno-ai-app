#!/usr/bin/env node
/* update77 · Feuille « Nouveau rendez-vous » à 393 px (WebKit) : Date pleine largeur,
   Heure et Durée côte à côte, labels au-dessus, 16 px, option « journée ».
   Supabase et /api simulés, aucune écriture en prod. */
import { webkit } from "playwright"
import { harness, UID } from "./pw-harness.mjs"

const H = harness({ port: 5188 }), W = 393, HT = 852
let ok = 0, ko = 0
const check = (name, cond, extra = "") => { if (cond) { ok++; console.log(`✔ ${name}`) } else { ko++; console.log(`✘ ${name}${extra ? " " + extra : ""}`) } }

async function main() {
  await H.start()
  const browser = await webkit.launch()
  try {
    const yday = new Date(); yday.setDate(yday.getDate() - 1)
    const { page } = await H.newPage(browser, {
      width: W, height: HT, scale: 2,
      // un RDV déjà présent ouvre l'agenda (SetupGate) sans passer par « Configurez votre agenda »
      tables: { appointments: [{ id: "a0000000-0000-4000-8000-000000000001", artisan_id: UID, title: "Entretien", client: "Julie Bernard", start: yday.toISOString(), end: new Date(yday.getTime() + 3600e3).toISOString() }] },
    })
    await page.goto(`${H.BASE}/agenda`)
    await page.waitForSelector("[data-bar-pill]", { timeout: 20000 })
    await page.getByRole("button", { name: "Ajouter un rendez-vous" }).click()
        await page.getByRole("dialog").waitFor({ timeout: 10000 })
    await page.waitForSelector("[data-rdv-form]", { timeout: 8000 })
    await page.waitForTimeout(300)

    const info = await page.evaluate(() => {
      const form = document.querySelector("[data-rdv-form]")
      if (!form) return { ok: false, why: "pas de formulaire" }
      const labels = [...form.querySelectorAll("label")].map(l => {
        const name = (l.querySelector("span")?.textContent || "").trim()
        const field = l.querySelector("input, select")
        const r = field?.getBoundingClientRect()
        const lr = l.getBoundingClientRect()
        const span = l.querySelector("span")
        const sr = span?.getBoundingClientRect()
        const cs = field ? getComputedStyle(field) : null
        return {
          name,
          tag: field?.tagName || "",
          type: field?.getAttribute("type") || "",
          font: cs ? parseFloat(cs.fontSize) : 0,
          appearance: cs ? cs.webkitAppearance || cs.appearance : "",
          x: r ? Math.round(r.x) : 0, y: r ? Math.round(r.y) : 0,
          w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0,
          labelY: sr ? Math.round(sr.y) : 0, labelH: sr ? Math.round(sr.height) : 0,
          left: Math.round(lr.left), right: Math.round(lr.right),
        }
      })
      const date = labels.find(x => x.name === "Date")
      const heure = labels.find(x => x.name === "Heure")
      const duree = labels.find(x => x.name === "Durée" || x.name.startsWith("Durée"))
      const client = labels.find(x => x.name === "Client")
      const opts = [...form.querySelectorAll("select option")].map(o => ({ v: o.value, t: (o.textContent || "").trim() }))
      const overlap = (a, b) => a && b && a.x < b.x + b.w - 2 && b.x < a.x + a.w - 2 && a.y < b.y + b.h - 2 && b.y < a.y + a.h - 2
      return {
        ok: true,
        formW: Math.round(form.getBoundingClientRect().width),
        date, heure, duree, client,
        opts,
        dateFull: date && client ? Math.abs(date.w - client.w) <= 8 : false,
        sideBySide: date && heure && duree && heure.y > date.y + date.h - 4 && Math.abs(heure.y - duree.y) <= 8 && Math.abs(heure.w - duree.w) <= 12 && heure.x + heure.w <= duree.x + 2,
        labelsAbove: heure && duree && heure.labelY + heure.labelH <= heure.y + 2 && duree.labelY + duree.labelH <= duree.y + 2,
        fonts: [date, heure, duree].map(x => x?.font),
        overlapHD: overlap(heure, duree),
        overlapDH: overlap(date, heure),
      }
    })

    check("la feuille Nouveau rendez-vous s'ouvre", info.ok, info.why || "")
    check("Date est en pleine largeur (comme Client)", !!info.dateFull, JSON.stringify({ date: info.date, client: info.client, formW: info.formW }))
    check("Heure et Durée sont côte à côte, sous la Date, colonnes égales", !!info.sideBySide, JSON.stringify({ date: info.date, heure: info.heure, duree: info.duree }))
    check("chaque champ a son libellé au-dessus", !!info.labelsAbove, JSON.stringify({ heure: info.heure, duree: info.duree }))
    check("Date, Heure et Durée font au moins 16 px", Array.isArray(info.fonts) && info.fonts.every(f => f >= 16), JSON.stringify(info.fonts))
    check("les champs ne se chevauchent pas", !info.overlapHD && !info.overlapDH, JSON.stringify(info))
    check("Durée propose 0h30, 1h, 1h30, 2h, 3h, 4h et journée",
      ["0h30", "1h", "1h30", "2h", "3h", "4h", "journée"].every(l => (info.opts || []).some(o => o.t === l)),
      JSON.stringify(info.opts))
    check("journée vaut 8 heures", (info.opts || []).some(o => o.t === "journée" && o.v === "8"))

    console.log(`\n${ok} ok, ${ko} ko`)
    if (ko) process.exitCode = 1
  } finally {
    await browser.close()
    H.stop()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
