/* update71 · Tests unitaires de la chaîne devis → signature → acompte → chantier → facture → paiement (aucun réseau, base simulée en mémoire).
   Usage : npm run test:chaine */
import { chainProgress, type ChainFact } from "../src/lib/chaine"
import { exportCsv, exportFec, fecBalanced, FEC_COLS, pilotage, type FactLite } from "../src/lib/compta"
import { acompteLines, computeFacture, devisToFactureLines, sequenceGaps, situationLines, soldeLines, type FLine } from "../api/_lib/factureCalc"
import { afterSign, clampPct, markPaidFromStripe, dueOfRow, connectEnabled, checkoutForFacture } from "../api/_lib/chain"
import { markLostDevis, prepareFactureRelances, IMPAYE_STEPS } from "../api/relances"
import { normStatut, withStatut } from "../api/_lib/devisStatut"

let ok = 0, ko = 0
const check = (name: string, cond: unknown, extra: unknown = "") => { if (cond) { ok++; console.log(`✔ ${name}`) } else { ko++; console.log(`✘ ${name} ${typeof extra === "string" ? extra : JSON.stringify(extra)}`) } }
const eq = (a: number, b: number) => Math.abs(a - b) < 0.005

/* ---------- base simulée (sous-ensemble de PostgREST utilisé par le code) ---------- */
type Row = Record<string, any>
function fakeDb(init: Record<string, Row[]> = {}, opts: { reject?: (t: string, row: Row) => { code: string; message: string } | null } = {}) {
  const db: Record<string, Row[]> = JSON.parse(JSON.stringify(init)); let seq = 0
  const from = (t: string) => {
    db[t] ||= []
    let mode: "select" | "insert" | "update" | "delete" = "select", payload: any = null, single = false, lim = 1e9
    const fs: ((r: Row) => boolean)[] = []
    const q: any = {
      select: () => q, order: () => q, limit: (n: number) => { lim = n; return q },
      eq: (k: string, v: any) => { fs.push(r => String(r[k]) === String(v)); return q }, neq: (k: string, v: any) => { fs.push(r => r[k] !== v); return q },
      in: (k: string, vs: any[]) => { fs.push(r => vs.includes(r[k])); return q }, lt: (k: string, v: any) => { fs.push(r => r[k] != null && r[k] < v); return q },
      is: (k: string, v: any) => { fs.push(r => v === null ? r[k] == null : r[k] === v); return q },
      insert: (p: any) => { mode = "insert"; payload = p; return q }, update: (p: any) => { mode = "update"; payload = p; return q }, upsert: (p: any) => { mode = "insert"; payload = p; return q }, delete: () => { mode = "delete"; return q },
      maybeSingle: () => { single = true; return q }, single: () => { single = true; return q },
      then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
    }
    const run = () => {
      const rows = db[t].filter(r => fs.every(f => f(r)))
      if (mode === "insert") {
        const list = (Array.isArray(payload) ? payload : [payload]).map((p: Row) => ({ id: p.id || `${t}-${++seq}`, created_at: new Date().toISOString(), ...p }))
        for (const r of list) { const e = opts.reject?.(t, r); if (e) return { data: null, error: e } }
        db[t].push(...list); return { data: single ? list[0] : list, error: null }
      }
      if (mode === "update") { for (const r of rows) { const e = opts.reject?.(t, { ...r, ...payload }); if (e) return { data: null, error: e } } rows.forEach(r => Object.assign(r, payload)); return { data: single ? rows[0] || null : rows, error: null } }
      if (mode === "delete") { db[t] = db[t].filter(r => !rows.includes(r)); return { data: null, error: null } }
      const out = rows.slice(0, lim); return { data: single ? out[0] || null : out, error: null }
    }
    return q
  }
  return { sb: { from } as any, db }
}

async function main() {
  /* 1. Calculs : TVA 5,5 / 10 / 20, acompte, situations, solde, numérotation */
  const devis: FLine[] = [{ l: "Isolation combles", q: 50, u: "m²", pu: 30, tv: 5.5 }, { l: "Pose fenêtre", q: 2, u: "u", pu: 450, tv: 10 }, { l: "Prise électrique", q: 3, u: "u", pu: 85, tv: 20 }]
  const T = computeFacture(devis)
  check("TVA par taux : 5,5 % = 82,50 · 10 % = 90 · 20 % = 51", eq(T.rates.find(r => r.r === 5.5)!.tva, 82.5) && eq(T.rates.find(r => r.r === 10)!.tva, 90) && eq(T.rates.find(r => r.r === 20)!.tva, 51), T.rates)
  check("Totaux : HT 2 655 · TVA 223,50 · TTC 2 878,50", eq(T.ht, 2655) && eq(T.tva, 223.5) && eq(T.ttc, 2878.5), T)
  const ac = acompteLines(devis, 30, "12"), A = computeFacture(ac)
  check("Acompte 30 % : une ligne par taux, TTC = 30 % du devis", ac.length === 3 && eq(A.ttc, 863.55), { ac, A })
  const ac40 = computeFacture(acompteLines(devis, 40, "12"))
  check("Acompte réglable (40 %)", eq(ac40.ttc, 1151.4), ac40)
  const fin = computeFacture(devis, { acompteDeduit: A.ttc })
  check("Facture finale : acompte déduit automatiquement (net = TTC − acompte)", eq(fin.net, 2878.5 - 863.55), fin)
  const s1 = situationLines(devis, [], 30, 1), s2 = situationLines(devis, [30], 60, 2), sol = soldeLines(devis, [30, 60], 3)
  const sum = computeFacture([...s1, ...s2, ...sol])
  check("Situations 30 % → 60 % → solde : total facturé = devis, sans écart d'arrondi", eq(sum.ht, T.ht) && eq(sum.ttc, T.ttc), { sum, T })
  check("Situation 2 = 30 % du devis", eq(computeFacture(s2).ht, 796.5), computeFacture(s2))
  let threw = false; try { situationLines(devis, [60], 40, 2) } catch { threw = true }
  check("Situation : avancement inférieur au précédent refusé", threw)
  check("Numérotation sans trou : trou détecté", sequenceGaps(["F-2026-0001", "F-2026-0002", "F-2026-0004"]).length === 1, sequenceGaps(["F-2026-0001", "F-2026-0002", "F-2026-0004"]))
  check("Numérotation continue : aucun trou", sequenceGaps(["F-2026-0001", "F-2026-0002", "F-2026-0003"]).length === 0)
  const dl = devisToFactureLines([{ k: "sec", l: "Cuisine" }, { l: "Évier", d: "Inox 2 bacs", q: 1, pu: 320, tv: 10 }, { k: "meta", acompte: 30 }])
  check("Devis → facture : titres et réglages ignorés, description reprise", dl.length === 1 && /Évier/.test(dl[0].l) && /Inox/.test(dl[0].l), dl)
  check("Pourcentage d'acompte borné (0 à 100)", clampPct(150) === 100 && clampPct(-3) === 0 && clampPct("x") === 30 && clampPct(25) === 25)

  /* 2. Frise et prochaine étape */
  const F = (p: Partial<ChainFact>): ChainFact => ({ id: Math.random().toString(36).slice(2), type: "facture", statut: "brouillon", total_ttc: 100, ...p })
  const P = (status: string, factures: ChainFact[] = [], chantier: any = null, extra = {}) => chainProgress({ status, factures, chantier, acomptePct: 30, ...extra })
  check("Brouillon → « Envoyer au client »", P("brouillon").next.key === "send" && P("brouillon").current === 0)
  check("Envoyé → en attente de signature (relances auto)", P("env").next.key === "wait_sign" && P("env").done[0])
  check("Ouvert par le client → statut « Ouvert »", P("env", [], null, { openedAt: "2026-11-20" }).sub[0] === "Ouvert")
  check("Refusé → étape refus", P("ref").next.key === "refused" && P("ref").sub[1] === "Refusé")
  check("Perdu (30 j) → étape perdu", P("perdu").next.key === "lost" && P("perdu").sub[1] === "Perdu")
  const acDraft = F({ type: "acompte" })
  check("Signé + acompte prêt → « Envoyer l'acompte »", P("val", [acDraft], { id: "c" }).next.key === "acompte_send")
  check("Signé sans acompte → « Demander l'acompte »", P("val", [], { id: "c" }).next.key === "acompte_create")
  const acSent = F({ type: "acompte", numero: "F-2026-0001", statut: "envoyee" })
  check("Acompte envoyé non payé → attente", P("val", [acSent], { id: "c" }).next.key === "acompte_wait")
  const acPaid = { ...acSent, statut: "payee" }
  const p5 = P("val", [acPaid], { id: "c", start_date: "2026-12-01" })
  check("Acompte payé + chantier → « Transformer en facture »", p5.next.key === "facture_create" && p5.done[2] && p5.done[3] && p5.sub[3] === "Planifié", p5)
  const finSent = F({ numero: "F-2026-0002", statut: "envoyee", type: "solde" })
  check("Facture envoyée → attente de paiement", P("val", [acPaid, finSent], { id: "c" }).next.key === "facture_wait")
  const pDone = P("val", [acPaid, { ...finSent, statut: "payee" }], { id: "c" })
  check("Tout payé → « Tout est réglé », 6 étapes cochées", pDone.next.key === "done" && pDone.done.every(Boolean) && pDone.current === 6, pDone)
  check("Situation partielle → « Facturez la suite »", P("val", [acPaid, F({ type: "situation", numero: "F-2026-0003", statut: "payee", avancement_pct: 50 })], { id: "c" }).next.key === "facture_create")
  check("Acompte 0 % → étape acompte « Aucun »", P("val", [], { id: "c" }, { acomptePct: 0 }).sub[2] === "Aucun")
  check("Avoir ignoré dans la frise", P("val", [acPaid, F({ type: "avoir", numero: "A-2026-0001", statut: "emise" })], { id: "c" }).next.key === "facture_create")

  /* 3. Pilotage + exports */
  const fx: FactLite[] = [
    { id: "a", numero: "F-2026-0001", type: "acompte", statut: "payee", client_nom: "Isabelle Fournier", devis_id: "d1", total_ht: 750, total_tva: 75, total_ttc: 825, date_emission: "2026-10-02", payee_le: "2026-10-05", mode_paiement: "Virement" },
    { id: "b", numero: "F-2026-0002", type: "solde", statut: "envoyee", client_nom: "Isabelle Fournier", devis_id: "d1", total_ht: 2500, total_tva: 250, total_ttc: 2750, acompte_deduit: 825, date_emission: "2026-11-02" },
    { id: "c", numero: "F-2026-0003", type: "facture", statut: "payee", client_nom: "SARL Lac; Annecy", total_ht: 1000, total_tva: 200, total_ttc: 1200, date_emission: "2026-11-10", payee_le: "2026-11-12", mode_paiement: "Carte (en ligne)" },
    { id: "d", numero: "A-2026-0001", type: "avoir", statut: "emise", client_nom: "SARL Lac; Annecy", total_ht: 100, total_tva: 20, total_ttc: 120, date_emission: "2026-11-15" },
    { id: "e", numero: null, type: "facture", statut: "brouillon", client_nom: "X", total_ht: 99, total_tva: 0, total_ttc: 99 },
  ]
  const k = pilotage([{ status: "val", amount: 2750, sentAt: "2026-09-20" }, { status: "env", amount: 500, sentAt: "2026-11-01" }, { status: "ref", amount: 900, sentAt: "2026-10-01" }, { status: "val", amount: 1200, sentAt: "2026-11-01" }, { status: "brouillon", amount: 300 }], fx, 2026)
  check("Tableau de bord : CA signé 3 950 €", eq(k.caSigne, 3950), k)
  check("Tableau de bord : encaissé 2 025 € (acompte + facture payée)", eq(k.caEncaisse, 2025), k)
  check("Tableau de bord : reste à encaisser 1 925 € (acompte déduit)", eq(k.resteAEncaisser, 1925), k)
  check("Tableau de bord : taux de transformation 50 % (2 signés / 4 envoyés)", k.tauxTransformation === 50, k)
  const csv = exportCsv(fx), rows = csv.replace(/^\uFEFF/, "").trim().split("\r\n")
  check("CSV : BOM, en-tête + 4 factures émises (brouillon exclu)", csv.startsWith("\uFEFF") && rows.length === 5, rows.length)
  const r1c = rows.find(r => r.includes("F-2026-0001"))!
  check("CSV : séparateur « ; », virgule décimale, cellule protégée", r1c.split(";")[5] === "750,00" && csv.includes('"SARL Lac; Annecy"'), r1c)
  check("CSV : avoir en négatif", rows.find(r => r.includes("A-2026-0001"))!.includes("-120,00"))
  const fec = exportFec(fx, { siren: "999999006", year: 2026 }), fl = fec.content.trim().split("\r\n")
  check("FEC : nom SIRENFECAAAAMMJJ.txt", fec.filename === "999999006FEC20261231.txt", fec.filename)
  check("FEC : 18 colonnes, séparateur « | »", fl[0] === FEC_COLS.join("|") && fl.every(l => l.split("|").length === 18), fl[0])
  check("FEC : chaque écriture équilibrée", fecBalanced(fec.content))
  check("FEC : acompte en 4191, soldé sur la facture finale", fl.some(l => l.includes("419100") && l.includes("F-2026-0001")) && fl.some(l => l.includes("419100") && l.includes("F-2026-0002")))
  check("FEC : encaissements au journal BQ (512000)", fl.filter(l => l.startsWith("BQ|") && l.includes("|512000|")).length === 2)
  check("FEC : dates AAAAMMJJ", fl.slice(1).every(l => /^\d{8}$/.test(l.split("|")[3])))

  /* 4. Signature → acompte + chantier automatiques (sans doublon) */
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (u: string) => String(u).includes("api-adresse") ? new Response(JSON.stringify({ features: [{ geometry: { coordinates: [6.129, 45.899] }, properties: { score: 0.9 } }] })) : new Response("{}", { status: 500 })) as typeof fetch
  const DV = { id: "d1", artisan_id: "u1", numero: "12", client_nom: "Isabelle Fournier", client_email: "i.f@example.fr", client_telephone: "0639980012", client_adresse: "3 rue Royale 74000 Annecy", objet: "Rénovation cuisine", lignes: devis }
  const { sb, db } = fakeDb({ artisans: [{ id: "u1", acompte_pct: 30 }], factures: [], chantiers: [] })
  const r1 = await afterSign(sb, DV), r2 = await afterSign(sb, DV)
  const acs = db.factures.filter(f => f.type === "acompte")
  check("Signature : facture d'acompte 30 % créée en brouillon", acs.length === 1 && acs[0].statut === "brouillon" && eq(acs[0].total_ttc, 863.55), acs[0])
  check("Signature : chantier créé, géolocalisé (BAN), lié au devis", db.chantiers.length === 1 && db.chantiers[0].lat === 45.899 && db.chantiers[0].devis_id === "d1", db.chantiers[0])
  check("Signature rejouée : aucun doublon", r1.acompte === r2.acompte && r1.chantier === r2.chantier && db.factures.length === 1 && db.chantiers.length === 1)
  const z = fakeDb({ artisans: [{ id: "u1", acompte_pct: 0 }], factures: [], chantiers: [] })
  await afterSign(z.sb, DV)
  check("Acompte réglé à 0 % : pas de facture d'acompte, chantier quand même", z.db.factures.length === 0 && z.db.chantiers.length === 1)
  const nm = fakeDb({ artisans: [{ id: "u1" }], factures: [], chantiers: [] }) // migration non appliquée : pas de colonne acompte_pct → 30 %
  await afterSign(nm.sb, DV)
  check("Sans migration : acompte 30 % par défaut", nm.db.factures.length === 1 && eq(nm.db.factures[0].total_ttc, 863.55))
  const broken = fakeDb({ artisans: [{ id: "u1" }] }, { reject: t => t === "chantiers" ? { code: "42P01", message: "relation chantiers does not exist" } : null })
  let safe = true; try { await afterSign(broken.sb, DV) } catch { safe = false }
  check("Erreur côté chantier : la signature n'échoue jamais", safe)
  globalThis.fetch = realFetch

  /* 5. Paiement (Stripe Connect derrière drapeau) + rapprochement */
  check("Stripe Connect désactivé par défaut", !connectEnabled())
  const blocked = await checkoutForFacture(fakeDb().sb, { id: "f", artisan_id: "u1", total_ttc: 100, numero: "F-1" }, "https://x")
  check("Paiement en ligne refusé tant que le drapeau est coupé (virement proposé)", blocked.status === 409 && /virement/i.test(String((blocked.body as any).error)))
  const pay = fakeDb({ factures: [{ id: "f2", artisan_id: "u1", numero: "F-2026-0002", statut: "envoyee", total_ttc: 2750, acompte_deduit: 825 }], facture_relances: [{ id: "r", facture_id: "f2", statut: "a_valider" }], payment_accounts: [{ artisan_id: "u1", stripe_account_id: "acct_123" }] })
  check("Reste à payer = TTC − acompte", eq(dueOfRow(pay.db.factures[0]), 1925))
  const wrong = await markPaidFromStripe(pay.sb, { metadata: { akno_facture_id: "f2" } }, "acct_999")
  check("Webhook d'un autre compte connecté ignoré", (wrong as any).ignored && pay.db.factures[0].statut === "envoyee")
  const pd = await markPaidFromStripe(pay.sb, { metadata: { akno_facture_id: "f2" }, payment_method_types: ["sepa_debit"] }, "acct_123")
  check("Webhook : facture payée, mode « Prélèvement SEPA », relance en attente annulée", (pd as any).paid === "f2" && pay.db.factures[0].statut === "payee" && pay.db.factures[0].mode_paiement === "Prélèvement SEPA" && pay.db.facture_relances[0].statut === "ignoree")
  check("Webhook rejoué : idempotent", (await markPaidFromStripe(pay.sb, { metadata: { akno_facture_id: "f2" } }, "acct_123") as any).already)

  /* 6. Relances : devis perdu à 30 j, impayés J+3 / J+7 / J+15 puis mise en demeure */
  const now = new Date("2026-11-22T09:00:00Z")
  const lost = fakeDb({ devis: [{ id: "old", statut: "env", envoye_le: "2026-10-10T08:00:00Z" }, { id: "recent", statut: "env", envoye_le: "2026-11-10T08:00:00Z" }, { id: "signed", statut: "val", envoye_le: "2026-09-01T08:00:00Z" }], relances: [] })
  const lr = await markLostDevis(lost.sb, now)
  check("Devis sans signature après 30 j → « perdu » (les autres intacts)", lr.lost === 1 && lost.db.devis.find(d => d.id === "old")!.statut === "perdu" && lost.db.devis.find(d => d.id === "recent")!.statut === "env" && lost.db.devis.find(d => d.id === "signed")!.statut === "val")
  const legacy = fakeDb({ devis: [{ id: "old", statut: "envoye", envoye_le: "2026-10-10T08:00:00Z" }], relances: [] }, { reject: (t, r) => t === "devis" && r.statut === "perdu" ? { code: "23514", message: "devis_statut_check" } : null })
  await markLostDevis(legacy.sb, now)
  check("Sans migration : « perdu » replié en « sans_reponse »", legacy.db.devis[0].statut === "sans_reponse", legacy.db.devis[0])
  check("Paliers d'impayés : J+3, J+7, J+15, mise en demeure J+30", JSON.stringify(IMPAYE_STEPS.map(s => s.days)) === "[3,7,15,30]")
  const ctx = (auto: boolean) => ({ artisan: async () => ({ id: "u1", entreprise_nom: "Alpes Rénovation", relances_auto: auto }), can: async () => true }) as any
  const fact = (late: string) => ({ id: "f" + late, artisan_id: "u1", numero: "F-2026-0009", client_nom: "Paul", client_email: "", statut: "envoyee", relances_off: false, type: "facture", total_ttc: 500, date_echeance: late })
  const im = fakeDb({ factures: [fact("2026-11-19"), fact("2026-11-14"), fact("2026-11-22")], facture_relances: [] })
  await prepareFactureRelances(im.sb, ctx(false), now)
  check("Impayé à J+3 : relance préparée (à valider) ; pas avant l'échéance", im.db.facture_relances.length === 2 && im.db.facture_relances.every(r => r.statut === "a_valider" && r.niveau === 1), im.db.facture_relances)
  im.db.facture_relances.forEach(r => { r.statut = "envoyee" })
  await prepareFactureRelances(im.sb, ctx(false), now)
  const n2 = im.db.facture_relances.filter(r => r.niveau === 2)
  check("Impayé à J+8 : 2e relance (J+7) ; J+3 attend son tour", n2.length === 1 && n2[0].facture_id === "f2026-11-14", im.db.facture_relances)
  const md = fakeDb({ factures: [fact("2026-10-20")], facture_relances: [1, 2, 3].map(n => ({ facture_id: "f2026-10-20", niveau: n, statut: "envoyee" })) })
  await prepareFactureRelances(md.sb, ctx(true), now)
  const m4 = md.db.facture_relances.find(r => r.niveau === 4)
  check("Mise en demeure (J+30) : toujours à valider par l'artisan, même en automatique", m4 && m4.statut === "a_valider" && /demeure/i.test(String(m4.sujet)), m4)

  /* 7. Statuts de devis compatibles avec l'ancienne base */
  check("Statuts historiques normalisés", normStatut("envoye") === "env" && normStatut("accepte") === "val" && normStatut("refuse") === "ref")
  let tried: string[] = []
  await withStatut("perdu", async st => { tried.push(st); return { error: st === "perdu" ? { code: "23514" } : null } })
  check("Repli de statut sur contrainte d'origine", tried.join(",") === "perdu,sans_reponse", tried)

  console.log(`\n${ok} ok, ${ko} en échec`); process.exit(ko ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
