/* update65 · Tests de la page Équipe : npm run test:equipe (aucun appel réseau, aucune écriture en base) */
import { cityOf, clientShort, frPhone, groupTeam, initialsOf, invitedAgo, isMobile, longDate, memberToday, nextMonday, rowSite, shortName, shortTitle, sinceLabel, validEmail, weekPlan, weekRange, type Link, type Member, type Site } from "../src/lib/equipeCalc"
import { handleEquipeInvite, inviteSmsText } from "../api/_lib/equipe"

let ok = 0, ko = 0
const T = (name: string, pass: boolean) => { pass ? ok++ : ko++; console.log(`${pass ? "✔" : "✘"} ${name}`) }
const TODAY = "2026-11-21" // samedi
const M = (id: string, f: string, l: string | null, role: string, extra: Partial<Member> = {}): Member => ({ id, first_name: f, last_name: l, role, ...extra })
const S = (id: string, title: string, a: string, b: string, status: Site["status"], client = "Mme Lefèvre", address = "14 av. Henri Zanaroli, 74960 Cran-Gevrier"): Site => ({ id, title, start_date: a, end_date: b, status, client_nom: client, address })
const ms = [M("j", "Julien", "Dupont", "Chef de chantier"), M("k", "Karim", "Mansouri", "Plombier"), M("s", "Sarah", "Roux", "Électricienne"), M("a", "Antoine", "Lefort", "Peintre", { access_role: "ouvrier", invite_status: "pending", invited_at: "2026-11-19T10:00:00Z" }), M("l", "Léo", null, "Apprenti")]
const sites = [S("sdb", "Rénovation salle de bain", "2026-11-18", "2026-11-29", "in_progress"), S("cui", "Pose cuisine équipée", "2026-12-02", "2026-12-06", "upcoming", "M. Martin"),
  S("ele", "Mise aux normes électriques", "2026-11-19", "2026-12-03", "upcoming", "SCI Les Tilleuls"), S("old", "Remplacement ballon", "2026-11-03", "2026-11-05", "done"), S("wed", "Débouchage", "2026-11-25", "2026-11-25", "upcoming", "M. Martin")]
const links: Link[] = [{ chantier_id: "sdb", employe_id: "j" }, { chantier_id: "wed", employe_id: "j" }, { chantier_id: "cui", employe_id: "k" }, { chantier_id: "old", employe_id: "k" }, { chantier_id: "ele", employe_id: "s" }, { chantier_id: "sdb", employe_id: "a" }]

T("nom court « Julien D. »", shortName(ms[0]) === "Julien D.")
T("nom court sans nom de famille", shortName(ms[4]) === "Léo")
T("initiales", initialsOf(ms[0]) === "JD" && initialsOf(ms[4]) === "L")
const tj = memberToday(ms[0], sites, links, TODAY)
T("Julien sur chantier (salle de bain)", tj.kind === "onsite" && tj.current?.id === "sdb")
T("statut dérivé des dates : chantier « à venir » déjà commencé → sur chantier", memberToday(ms[2], sites, links, TODAY).kind === "onsite")
const tk = memberToday(ms[1], sites, links, TODAY)
T("Karim disponible, prochain = cuisine (terminé ignoré)", tk.kind === "free" && tk.next?.id === "cui" && !tk.current)
T("invitation en attente prioritaire", memberToday(ms[3], sites, links, TODAY).kind === "pending")
T("libellé ligne en cours", rowSite(tj)?.text === "Salle de bain" && rowSite(tj)?.color === "#FF9F0A")
T("libellé ligne prochain « Cuisine · 2 déc. »", rowSite(tk)?.text === "Cuisine · 2 déc." && rowSite(tk)?.color === "#2F7BFF")
T("aucun chantier → pas de libellé", rowSite(memberToday(ms[4], sites, links, TODAY)) === null)
const g = groupTeam(ms, sites, links, TODAY)
T("groupes : 2 sur chantier, 2 dispo, 1 invitation", g.onsite.length === 2 && g.free.length === 2 && g.pending.length === 1)
T("résumé : 5 membres, 3 sur chantier (invité compris), 2 disponibles", g.total === 5 && g.onsiteN === 3 && g.freeN === 2)
T("groupes triés par prénom", g.onsite[0].m.first_name === "Julien" && g.free[0].m.first_name === "Karim")
T("recherche sans accents", groupTeam(ms, sites, links, TODAY, "leo").free.length === 1 && groupTeam(ms, sites, links, TODAY, "leo").onsite.length === 0)
{ const o = groupTeam([M("x", "Zoé", null, "Peintre", { hired_on: "2019-01-01" }), M("y", "Adam", null, "Peintre", { hired_on: "2024-01-01" }), M("z", "Bob", null, "Peintre")], [], [], TODAY).free.map(x => x.m.id).join("")
  T("tri : ancienneté puis prénom (sans date en dernier)", o === "xyz") }
T("titre court : « Isolation des combles » → « Combles »", shortTitle("Isolation des combles") === "Combles")
T("recherche par métier", groupTeam(ms, sites, links, TODAY, "plomb").free.length === 1)
T("titres courts", shortTitle("Rénovation salle de bain") === "Salle de bain" && shortTitle("Pose cuisine équipée") === "Cuisine" && shortTitle("Mise aux normes électriques") === "Électriques" && shortTitle("Combles") === "Combles")
T("ville d'une adresse", cityOf("14 av. Henri Zanaroli, 74960 Cran-Gevrier") === "Cran-Gevrier" && cityOf("Annecy") === "Annecy")
T("client court", clientShort("Mme Lefèvre") === "Lefèvre" && clientShort("M. Martin") === "Martin" && clientShort("") === "")
T("lundi suivant (samedi → 23 nov.)", nextMonday(TODAY) === "2026-11-23")
T("lundi suivant (lundi → lundi d'après)", nextMonday("2026-11-23") === "2026-11-30")
T("lundi suivant (dimanche → lendemain)", nextMonday("2026-11-22") === "2026-11-23")
const wk = weekPlan("j", sites, links, TODAY)
T("semaine : 5 jours Lun → Ven (23 → 27)", wk.length === 5 && wk[0].wd === "Lun" && wk[0].num === 23 && wk[4].num === 27)
T("semaine : salle de bain (orange) lun, mar, jeu, ven", [0, 1, 3, 4].every(i => wk[i].site?.id === "sdb" && wk[i].color === "#FF9F0A" && wk[i].client === "Lefèvre"))
T("semaine : mercredi = intervention d'un jour chez Martin (bleu, à venir) devant le long chantier", wk[2].site?.id === "wed" && wk[2].client === "Martin" && wk[2].color === "#2F7BFF")
const wk2 = weekPlan("k", sites, links, TODAY)
T("semaine vide hors chantier", wk2.every(c => !c.site))
T("plage de la semaine « 23 – 27 nov. »", weekRange(wk) === "23 – 27 nov.")
T("plage sur deux mois", weekRange(weekPlan("k", sites, links, "2026-11-28")) === "30 nov. – 4 déc.")
T("téléphone FR formaté", frPhone("0641228715") === "06 41 22 87 15" && frPhone("+33 6 41 22 87 15") === "06 41 22 87 15" && frPhone("0033641228715") === "06 41 22 87 15")
T("téléphone invalide refusé", frPhone("06 41 22") === "" && frPhone("1234567890") === "" && frPhone("") === "")
T("mobile 06/07", isMobile("07 11 22 33 44") && !isMobile("04 50 45 12 12"))
T("e-mail", validEmail("a@b.fr") && !validEmail("a@b") && !validEmail(""))
T("invité il y a 2 j", invitedAgo("2026-11-19T10:00:00Z", new Date("2026-11-21T12:00:00")) === "invité il y a 2 j")
T("invité aujourd'hui / hier / à envoyer", invitedAgo("2026-11-21T08:00:00", new Date("2026-11-21T12:00:00")) === "invité aujourd'hui" && invitedAgo("2026-11-20T08:00:00", new Date("2026-11-21T12:00:00")) === "invité hier" && invitedAgo(null) === "invitation à envoyer")
T("depuis AAAA (date d'entrée, sinon date d'ajout)", sinceLabel({ ...ms[0], hired_on: "2021-03-03" }) === "depuis 2021" && sinceLabel({ ...ms[0], created_at: "2024-05-01T10:00:00Z" }) === "depuis 2024" && sinceLabel(ms[0]) === "")
T("date longue « 3 mars 2021 »", longDate("2021-03-03") === "3 mars 2021")

// invitation SMS (serveur)
const txt = inviteSmsText({ firstName: "Antoine", company: "Martin Plomberie", role: "chef", url: "https://akno.app" })
T("SMS : prénom, entreprise, rôle, lien", txt.includes("Bonjour Antoine") && txt.includes("Martin Plomberie") && txt.includes("Chef d'équipe") && txt.includes("https://akno.app"))
T("SMS : 2 segments max (≤ 306 car.)", txt.length <= 306)
const fakeSb = (row: Record<string, unknown> | null, updates: unknown[] = []) => ({
  from: (t: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: t === "artisans" ? { entreprise_nom: "Martin Plomberie" } : row, error: null }) }) }),
    update: (v: unknown) => ({ eq: async () => { updates.push(v); return { error: null } } }),
  }),
}) as any
const ID = "e0000001-0000-0000-0000-000000000000"
;(async () => {
  const sent: any[] = [], ups: unknown[] = []
  const deps = { send: async (x: any) => { sent.push(x); return { ok: true as const } }, consume: async () => true, day: "2026-11-21", url: "https://akno.app" }
  const r = await handleEquipeInvite(fakeSb({ first_name: "Antoine", phone: "06 41 22 87 15", access_role: "ouvrier", invite_status: "pending", invite_count: 1 }, ups), "u", { employe_id: ID }, deps)
  T("invitation envoyée au +33641228715, kind invite_equipe", r.status === 200 && sent[0]?.to === "+33641228715" && sent[0]?.kind === "invite_equipe")
  T("invitation : statut pending + compteur", (ups[0] as any)?.invite_status === "pending" && (ups[0] as any)?.invite_count === 2)
  T("sans accès à l'app → refus", (await handleEquipeInvite(fakeSb({ first_name: "A", phone: "0641228715", access_role: null }), "u", { employe_id: ID }, deps)).status === 400)
  T("fixe (04) → refus (mobile requis)", (await handleEquipeInvite(fakeSb({ first_name: "A", phone: "0450451212", access_role: "ouvrier" }), "u", { employe_id: ID }, deps)).status === 400)
  T("identifiant invalide → refus", (await handleEquipeInvite(fakeSb(null), "u", { employe_id: "x" }, deps)).status === 400)
  T("membre d'un autre artisan (RLS : invisible) → 404", (await handleEquipeInvite(fakeSb(null), "u", { employe_id: ID }, deps)).status === 404)
  T("limite 3 relances/jour → 429", (await handleEquipeInvite(fakeSb({ first_name: "A", phone: "0641228715", access_role: "ouvrier" }), "u", { employe_id: ID }, { ...deps, consume: async () => false })).status === 429)
  T("SMS non configurés → 503 avec message", (await handleEquipeInvite(fakeSb({ first_name: "A", phone: "0641228715", access_role: "ouvrier" }), "u", { employe_id: ID }, { ...deps, send: async () => ({ ok: false as const, skipped: true, error: "SMS non configurés" }) })).status === 503)
  console.log(`\n${ok} OK, ${ko} KO`)
  if (ko) process.exit(1)
})()
