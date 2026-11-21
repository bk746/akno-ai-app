/* update66 · Tests de la page Clients : npm run test:clients (aucun appel réseau, aucune écriture en base) */
import { addrLines, boldMatch, buildDirectory, caTotal, chantiersCount, cityOf, currentSite, documents, dueTotal, ficheKey, frPhone, fromPicker, history, initials, kindOf, matchFilter, matchQuery, parseVcf, phoneKey, sirenOf, statusOf, summary, toRelance, validEmail, type ChIn, type DevisIn, type FactIn, type FicheRow } from "../src/lib/clientsCalc"

let ok = 0, ko = 0
const T = (name: string, pass: boolean) => { pass ? ok++ : ko++; console.log(`${pass ? "✔" : "✘"} ${name}`) }
const TODAY = "2026-11-21"
const F = (cle: string, nom: string, extra: Partial<FicheRow> = {}): FicheRow => ({ cle, nom, ...extra })
const fiches = [
  F("claire lefevre", "Claire Lefèvre", { telephone: "06 12 34 56 78", adresse: "14 av. Henri Zanaroli, 74960 Cran-Gevrier", type_client: "particulier", created_at: "2026-10-09T09:00:00Z", origine: "appel" }),
  F("sci les alery", "SCI Les Aléry", { telephone: "04 50 45 12 12", adresse: "5 rue des Aléry, 74960 Cran-Gevrier", type_client: "syndic" }),
  F("alain petit", "Alain Petit", { telephone: "06 33 44 55 66", adresse: "3 rue Royale, 74000 Annecy" }),
]
const CH = (id: string, title: string, a: string, b: string, status: ChIn["status"], client_nom: string, extra: Partial<ChIn> = {}): ChIn => ({ id, title, start_date: a, end_date: b, status, client_nom, ...extra } as ChIn)
const chantiers = [
  CH("sdb", "Rénovation salle de bain", "2026-11-18", "2026-11-29", "in_progress", "Mme Lefèvre", { client_id: "claire lefevre" }),
  CH("fac", "Ravalement façade", "2026-11-16", "2026-12-03", "in_progress", "SCI Les Aléry"),
  CH("cui", "Pose cuisine équipée", "2026-12-02", "2026-12-06", "upcoming", "Pierre Girard", { client_telephone: "06 22 41 18 90", address: "8 rue de Loverchy, 74000 Annecy" }),
]
const D = (id: string, num: number, client: string, status: string, amount: number, extra: Partial<DevisIn> = {}): DevisIn => ({ id, num, client, objet: "Travaux", status, amount, ...extra })
const devis = [
  D("d128", 128, "Claire LEFEVRE", "val", 4980, { at: "2026-10-14T16:00:00Z", sentAt: "2026-10-15T09:00:00Z", repliedAt: "2026-10-22T18:30:00Z", reply: "val", objet: "Salle de bain" }),
  D("d131", 131, "Marc Durand", "env", 1320, { at: "2026-11-12T10:00:00Z", sentAt: "2026-11-12T10:05:00Z", phone: "06 98 76 54 32" }),
  D("d135", 135, "Marc Durand", "env", 800, { at: "2026-11-20T10:00:00Z", sentAt: "2026-11-20T10:05:00Z" }),
  D("d127", 127, "+33 6 33 44 55 66", "val", 2470, { at: "2026-09-01T10:00:00Z", sentAt: "2026-09-01T10:05:00Z", phone: "+33 6 33 44 55 66", reply: "val" }),
]
const FA = (id: string, numero: string | null, client_nom: string, type: string, statut: string, total: number, due: number, extra: Partial<FactIn> = {}): FactIn => ({ id, numero, client_nom, type, statut, total_ttc: total, due, ...extra })
const factures = [
  FA("f141", "F-0141", "Claire Lefèvre", "acompte", "envoyee", 2350, 2350, { devis_id: "d128", date_emission: "2026-11-18", date_echeance: "2026-12-18", envoyee_le: "2026-11-18T17:00:00Z" }),
  FA("f120", "F-0120", "Alain Petit", "facture", "envoyee", 2470, 2470, { devis_id: "d127", date_emission: "2026-10-01", date_echeance: "2026-10-31", envoyee_le: "2026-10-01T09:00:00Z" }),
  FA("f119", "F-0119", "Alain Petit", "facture", "payee", 600, 0, { date_emission: "2026-08-01", payee_le: "2026-08-10T09:00:00Z" }),
  FA("f118", "F-0118", "Alain Petit", "avoir", "emise", -100, 0, { date_emission: "2026-08-12" }),
  FA("fbr", null, "Alain Petit", "facture", "brouillon", 999, 999),
]
const calls = [
  { id: "901", name: "Claire Lefèvre", phone: "0612345678", createdAt: "2026-10-09T08:40:00Z", note: "Souhaite rénover sa salle de bain." },
  { id: "902", name: "Inconnu", phone: "0611223344", createdAt: "2026-11-21T08:00:00Z", note: "Fuite" },
  { id: "903", name: "Inconnu", phone: "06 12 34 56 78", createdAt: "2026-11-05T08:00:00Z", note: "Rappel" },
]
const events = [
  { id: "e1", date: "2026-10-14", name: "Visite technique", topic: "Visite technique", callId: "901" },
  { id: "e2", date: "2026-11-25", name: "Christophe Martin", topic: "Devis terrasse", phone: "06 70 11 22 33" },
  { id: "e3", date: "2026-11-24", name: "Chantier · Rénovation", topic: "" },
]
const dir = buildDirectory({ fiches, calls, devis, factures, chantiers, events })
const by = (k: string) => dir.find(c => c.key === k)!

T("clé de fiche : accents, civilité, espaces", ficheKey("Mme  Claire LEFÈVRE") === "claire lefevre")
T("clé téléphone : 06 / +33 / 0033 identiques", phoneKey("06 12 34 56 78") === phoneKey("+33 6 12 34 56 78") && phoneKey("0033612345678") === "612345678" && phoneKey("123") === "")
T("carnet : 6 clients (appel inconnu sans fiche ignoré, événement « Chantier » ignoré)", dir.length === 6 && !dir.some(c => /inconnu|chantier/i.test(c.name)), )
const claire = by("claire lefevre")
T("rattachement par client_id (chantier « Mme Lefèvre »)", claire.chantiers.some(x => x.id === "sdb"))
T("rattachement par nom sans accent ni casse (devis « Claire LEFEVRE »)", claire.devis.some(x => x.id === "d128"))
T("rattachement par téléphone (appel « Inconnu » 06 12 34 56 78)", claire.calls.some(x => x.id === "903") && claire.calls.length === 2)
T("rattachement d'un RDV via l'appel d'origine", claire.events.some(x => x.id === "e1"))
T("devis au nom d'un numéro → client par téléphone", by("alain petit").devis.some(x => x.id === "d127"))
T("client dérivé d'un chantier (Pierre Girard) avec ville", by("pierre girard").city === "Annecy" && by("pierre girard").phone === "06 22 41 18 90")
T("client dérivé d'un RDV (Christophe Martin)", by("christophe martin").events.length === 1)
T("fiche prioritaire pour les coordonnées", claire.phone === "06 12 34 56 78" && claire.city === "Cran-Gevrier" && claire.origin === "appel")
T("ancienneté = création de la fiche", claire.since === "2026-10-09")
T("type : fiche syndic / SIREN → pro / heuristique", by("sci les alery").kind === "syndic" && kindOf("SARL Martin") === "pro" && kindOf("Dupont", F("x", "Dupont", { siren: "123456789" })) === "pro" && kindOf("Syndic du Lac") === "syndic" && kindOf("Julie Mercier") === "particulier")

// statuts
T("statut retard prioritaire (Alain, facture échue)", statusOf(by("alain petit"), TODAY)?.tone === "late" && statusOf(by("alain petit"), TODAY)?.label === "En retard")
T("statut en cours (Claire)", statusOf(claire, TODAY)?.label === "En cours" && statusOf(claire, TODAY)?.color === "#FF9F0A")
T("statut prochain chantier « Le 2 déc. »", statusOf(by("pierre girard"), TODAY)?.label === "Le 2 déc." && statusOf(by("pierre girard"), TODAY)?.color === "#2F7BFF")
T("statut prochain RDV « Le 25 nov. »", statusOf(by("christophe martin"), TODAY)?.label === "Le 25 nov.")
T("statut « Demain » / « Aujourd'hui »", statusOf(by("christophe martin"), "2026-11-24")?.label === "Demain" && statusOf(by("christophe martin"), "2026-11-25")?.label === "Aujourd'hui")
T("statut devis envoyé sans pastille", statusOf(by("marc durand"), TODAY)?.label === "Devis envoyé" && statusOf(by("marc durand"), TODAY)?.color === null)

// filtres
T("filtre chantier en cours", dir.filter(c => matchFilter(c, "onsite", TODAY)).map(c => c.key).sort().join() === "claire lefevre,sci les alery")
T("filtre devis en attente", dir.filter(c => matchFilter(c, "devis", TODAY)).map(c => c.key).join() === "marc durand")
T("à relancer : devis envoyé depuis ≥ délai ou facture en retard", toRelance(by("marc durand"), TODAY, 3) && toRelance(by("alain petit"), TODAY, 3) && !toRelance(claire, TODAY, 3))
T("à relancer : devis trop récent ignoré (délai 30 j)", !toRelance(by("marc durand"), TODAY, 30) && toRelance(by("alain petit"), TODAY, 30))
T("filtre « Tous »", dir.every(c => matchFilter(c, "all", TODAY)))

// recherche
T("recherche sans accent", matchQuery(claire, "lefevre") && matchQuery(claire, "LEFÈVRE") && !matchQuery(by("marc durand"), "lefevre"))
T("recherche par ville", matchQuery(claire, "cran") && !matchQuery(by("pierre girard"), "cran"))
T("recherche téléphone avec ou sans espaces / +33", matchQuery(claire, "0612345678") && matchQuery(claire, "06 12 34") && matchQuery(claire, "+33 6 12 34 56 78") && !matchQuery(by("alain petit"), "0612"))
T("recherche vide = tout", matchQuery(claire, "  "))

// chiffres
T("CA : devis accepté 4 980 €, acompte lié non compté deux fois", caTotal(claire) === 4980)
T("CA : devis accepté + facture payée hors devis − avoir, brouillon exclu", caTotal(by("alain petit")) === 2470 + 600 - 100)
T("CA : devis envoyés non comptés", caTotal(by("marc durand")) === 0)
T("à encaisser : factures émises non payées", dueTotal(claire.factures) === 2350 && dueTotal(by("alain petit").factures) === 2470)
T("chantiers : 1 en cours", chantiersCount(claire, TODAY).n === 1 && chantiersCount(claire, TODAY).l === "en cours" && chantiersCount(by("pierre girard"), TODAY).l === "à venir" && currentSite(claire, TODAY)?.id === "sdb")
const sm = summary(dir, chantiers, factures, TODAY)
T("résumé : 6 clients, 2 en cours, 4 820 € à encaisser", sm.clients === 6 && sm.onsite === 2 && sm.due === 4820)

// historique
const h = history(claire, [{ devis_id: "d128", at: "2026-10-22T18:30:00Z" }], TODAY)
T("historique du plus récent au plus ancien", h.map(x => x.at).every((a, i, arr) => !i || arr[i - 1] >= a))
T("historique : facture d'acompte envoyée en tête", h[0].title === "Facture F-0141 envoyée" && /2\s350\s€ · acompte/.test(h[0].sub))
T("historique : chantier démarré", h.some(x => x.title === "Chantier démarré" && x.sub === "Rénovation salle de bain"))
T("historique : devis accepté signé en ligne (une ligne par devis)", h.filter(x => x.kind === "devis").length === 1 && h.some(x => x.title === "Devis N° 128 accepté" && /signé en ligne/.test(x.sub)))
T("historique : appel + RDV de visite calé le 14 oct.", h.some(x => x.title === "Appel pris par la réceptionniste" && x.sub === "RDV de visite calé le 14 oct."))
T("historique : sans signature → pas « signé en ligne »", !history(claire, [], TODAY).some(x => /signé en ligne/.test(x.sub)))
const hm = history(by("marc durand"), [], TODAY)
T("historique : devis envoyés", hm.length === 2 && hm.every(x => /envoyé$/.test(x.title)))
const ha = history(by("alain petit"), [], TODAY)
T("historique : facture payée", ha.some(x => x.title === "Facture F-0119 payée"))
T("historique : brouillon de facture absent", !ha.some(x => /fbr|999/.test(x.id + x.sub)))

// documents
const docs = documents(claire, TODAY)
T("documents : facture puis devis, statuts", docs.length === 2 && docs[0].title === "Facture F-0141" && docs[0].status === "Envoyée" && docs[1].status === "Accepté")
T("documents : facture en retard", documents(by("alain petit"), TODAY).some(d => d.status === "En retard" && d.tone === "late"))

// saisie
T("téléphone FR formaté", frPhone("0612345678") === "06 12 34 56 78" && frPhone("+33 6 12 34 56 78") === "06 12 34 56 78" && frPhone("0033612345678") === "06 12 34 56 78")
T("téléphone invalide refusé", frPhone("12345") === "" && frPhone("0012345678") === "" && frPhone("") === "")
T("email", validEmail("a@b.fr") && !validEmail("a@b") && !validEmail("a b@c.fr"))
T("SIREN / SIRET", sirenOf("512 345 678") === "512345678" && sirenOf("51234567800021") === "512345678" && sirenOf("1234") === "")
T("autocomplétion : partie tapée en gras", boldMatch("14 Avenue Henri Zanaroli", "14 av").join("|") === "|14 Av|enue Henri Zanaroli" && boldMatch("Rue Royale", "royale").join("|") === "Rue |Royale|")
T("adresse sur 2 lignes", addrLines("14 av. Henri Zanaroli, 74960 Cran-Gevrier").join("|") === "14 av. Henri Zanaroli|74960 Cran-Gevrier" && addrLines("Lieu-dit").join("|") === "Lieu-dit|")
T("ville d'une adresse", cityOf("3 rue Royale, 74000 Annecy") === "Annecy" && cityOf("") === "")
T("initiales", initials("Claire Lefèvre") === "CL" && initials("Mme Lefèvre") === "LE" && initials("SCI Les Aléry") === "SA" && initials("") === "?")
const v = parseVcf("BEGIN:VCARD\r\nVERSION:3.0\r\nN:Benali;Nadia;;;\r\nFN:Nadia Benali\r\nORG:Atelier B;\r\nTEL;TYPE=HOME:04 50 00 00 00\r\nTEL;TYPE=CELL:06 58 12 40 93\r\nEMAIL:nadia@example.fr\r\nADR;TYPE=HOME:;;14 Avenue Henri Zanaroli;Cran-Gevrier;;74960;France\r\nEND:VCARD")
T("vCard : nom, mobile prioritaire, email, adresse, société", !!v && v.first === "Nadia" && v.last === "Benali" && v.phone === "06 58 12 40 93" && v.email === "nadia@example.fr" && v.addr === "14 Avenue Henri Zanaroli, 74960 Cran-Gevrier" && v.company === "Atelier B")
T("vCard vide → null", parseVcf("hello") === null)
const pk = fromPicker({ name: ["Nadia Benali"], tel: ["+33658124093"], email: [], address: [{ addressLine: ["14 Avenue Henri Zanaroli"], postalCode: "74960", city: "Cran-Gevrier" }] })
T("Contact Picker : nom, tel, adresse", !!pk && pk.first === "Nadia" && pk.last === "Benali" && pk.phone === "+33658124093" && pk.addr === "14 Avenue Henri Zanaroli, 74960 Cran-Gevrier")
T("Contact Picker annulé → null", fromPicker(undefined) === null && fromPicker({}) === null)

console.log(`\n${ok} réussis, ${ko} échoués`)
if (ko) process.exit(1)
