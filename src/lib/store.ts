import { useEffect, useState } from "react"
export type Call = { id: string; name: string; topic: string; time: string; note: string; urgent: boolean; callback: boolean; addr?: string; suite?: string; transcript?: [string, string][]; dur?: string; tag?: string; besoin?: string; urgence?: string; at?: string; short?: string; day?: string }
export type Ev = { id: string; date: string; start: number; dur: number; name: string; topic: string; addr?: string; created: number; ai?: boolean }
export type RelStatus = "prog" | "pause" | "env" | "rep"
export type Rel = { id: string; client: string; type: string; canal: string; status: RelStatus; date: string }
export type DevStatus = "aval" | "brouillon" | "att" | "env" | "val" | "ref"
export type Devis = { id: string; num: number; client: string; objet: string; status: DevStatus; amount: number; created: number; ai?: boolean; from?: string; lines?: { l: string; q: number; pu: number }[] }
export type Msg = { id: string; from: "me" | "ai"; text: string; devisId?: string; action?: string; card?: { num: number; client: string; objet: string; amount: number }; items?: import("./assistant").RItem[]; acts?: import("./assistant").RAct[]; chips?: string[]; done?: string[] }
export type Settings = { agents: { rec: boolean; ag: boolean; rel: boolean; dev: boolean }; sms: boolean; push: boolean; tva: number; duree: number; name?: string; company?: string }
export type Client = { key: string; name: string; phone: string; email?: string; addr: string; lat: number; lon: number; hist?: { calls: number; last: string; since: string } }
export type St = { clients: Client[]; calls: Call[]; events: Ev[]; rels: Rel[]; devis: Devis[]; settings: Settings; chat: Msg[]; lastRel: { client: string; type: string; time: string; canal: string } }
export const uid = () => Math.random().toString(36).slice(2, 10)
export const BASE = "2026-11-02" // lundi de la semaine de démo
export const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
export const seed = (): St => ({
  // Fiches clients de démonstration : numéros fictifs (plage 06 00), adresses au format réel, coordonnées approximatives
  clients: [
    { key: "dubois", name: "Clément Dubois", phone: "06 00 12 34 01", email: "c.dubois@exemple.fr", addr: "12 rue Garibaldi, 69006 Lyon", lat: 45.7690, lon: 4.8530, hist: { calls: 2, last: "2026-10-21", since: "2025-11-12" } },
    { key: "martin", name: "Sophie Martin", phone: "06 00 12 34 02", email: "sophie.martin@exemple.fr", addr: "4 place Bellecour, 69002 Lyon", lat: 45.7578, lon: 4.8320, hist: { calls: 4, last: "2026-10-28", since: "2024-03-04" } },
    { key: "benali", name: "Karim Benali", phone: "06 00 12 34 03", addr: "28 cours Vitton, 69006 Lyon", lat: 45.7695, lon: 4.8560, hist: { calls: 2, last: "2026-10-15", since: "2025-06-18" } },
    { key: "moreau", name: "Julie Moreau", phone: "06 00 12 34 04", email: "julie.moreau@exemple.fr", addr: "7 rue Duguesclin, 69003 Lyon", lat: 45.7600, lon: 4.8450, hist: { calls: 3, last: "2026-09-30", since: "2024-09-09" } },
    { key: "leroy", name: "Mme Leroy", phone: "06 00 12 34 05", addr: "15 rue de la République, 69002 Lyon", lat: 45.7620, lon: 4.8360, hist: { calls: 5, last: "2026-10-30", since: "2023-05-22" } },
    { key: "petit", name: "M. Petit", phone: "06 00 12 34 06", addr: "3 rue Mercière, 69002 Lyon", lat: 45.7620, lon: 4.8315, hist: { calls: 1, last: "2026-10-24", since: "2026-02-11" } },
    { key: "girard", name: "Lucas Girard", phone: "06 00 12 34 07", email: "l.girard@exemple.fr", addr: "40 avenue Jean Jaurès, 69007 Lyon", lat: 45.7500, lon: 4.8420, hist: { calls: 1, last: "2026-08-19", since: "2025-01-27" } },
    { key: "roux", name: "Nadia Roux", phone: "06 00 12 34 08", addr: "9 rue Paul Bert, 69003 Lyon", lat: 45.7590, lon: 4.8480, hist: { calls: 2, last: "2026-07-03", since: "2024-11-05" } },
    { key: "lambert", name: "Antoine Lambert", phone: "06 00 12 34 09", email: "antoine.lambert@exemple.fr", addr: "22 rue Vendôme, 69006 Lyon", lat: 45.7660, lon: 4.8470, hist: { calls: 3, last: "2026-06-12", since: "2023-02-14" } },
    { key: "fontaine", name: "Camille Fontaine", phone: "06 00 12 34 10", email: "c.fontaine@exemple.fr", addr: "5 quai Saint-Vincent, 69001 Lyon", lat: 45.7680, lon: 4.8240, hist: { calls: 2, last: "2026-05-20", since: "2024-04-02" } },
    { key: "mercier", name: "Hugo Mercier", phone: "06 00 12 34 11", addr: "61 rue Marietton, 69009 Lyon", lat: 45.7740, lon: 4.8070, hist: { calls: 1, last: "2026-03-08", since: "2026-03-08" } },
    { key: "garnier", name: "Inès Garnier", phone: "06 00 12 34 12", email: "ines.garnier@exemple.fr", addr: "18 rue de Sèze, 69006 Lyon", lat: 45.7670, lon: 4.8500, hist: { calls: 4, last: "2026-09-11", since: "2022-10-03" } },
    { key: "chevalier", name: "Paul Chevalier", phone: "06 00 12 34 13", addr: "2 montée du Gourguillon, 69005 Lyon", lat: 45.7590, lon: 4.8250, hist: { calls: 1, last: "2025-12-02", since: "2025-12-02" } },
    { key: "faure", name: "Élodie Faure", phone: "06 00 12 34 14", email: "elodie.faure@exemple.fr", addr: "33 boulevard des Belges, 69006 Lyon", lat: 45.7710, lon: 4.8520, hist: { calls: 2, last: "2026-01-16", since: "2024-07-29" } },
  ],
  calls: [
    { id: "c1", name: "Clément Dubois", topic: "Remplacement de chaudière", time: "12:21", urgent: false, callback: true, tag: "Chaudière", besoin: "Remplacement chaudière gaz", urgence: "Moyenne · cette semaine", at: "12:24", short: "Clément Dubois · souhaite un devis cette semaine", note: "Clément Dubois souhaite un devis cette semaine. Chaudière gaz de 15 ans, panne intermittente. Disponible jeudi matin.", addr: "12 rue Garibaldi, Lyon 6e", suite: "Devis transmis à l'agent Devis", dur: "2:14", transcript: [["Client", "Bonjour, ma chaudière s'arrête plusieurs fois par jour."], ["Akno", "Je note. Depuis combien de temps est-elle installée ?"], ["Client", "Une quinzaine d'années. Je voudrais un devis pour la changer."]] },
    { id: "c2", name: "Sophie Martin", topic: "Fuite sous évier", time: "11:02", urgent: true, callback: true, tag: "Fuite", besoin: "Réparation fuite évier", urgence: "Haute · aujourd'hui", short: "Sophie Martin · fuite active sous l'évier", note: "Fuite active sous l'évier de la cuisine. Souhaite une intervention rapide.", addr: "4 place Bellecour, Lyon 2e", suite: "RDV proposé mardi", dur: "1:32", transcript: [["Client", "J'ai de l'eau qui coule sous mon évier."], ["Akno", "Pouvez-vous couper l'arrivée d'eau en attendant ? Je vous propose un créneau."]] },
    { id: "c3", name: "Karim Benali", topic: "Salle de bain", time: "09:47", urgent: false, callback: false, tag: "Salle de bain", besoin: "Rénovation salle de bain", urgence: "Basse · visite à planifier", short: "Karim Benali · souhaite une visite", note: "Projet de rénovation de salle de bain, souhaite une visite.", addr: "28 cours Vitton, Lyon 6e", suite: "RDV jeudi 10:30", dur: "3:05" },
    { id: "c4", name: "Julie Moreau", topic: "Ballon d'eau chaude", time: "09:15", urgent: true, callback: true, tag: "Ballon d'eau chaude", besoin: "Panne ballon 200 L", urgence: "Haute · aujourd'hui", short: "Julie Moreau · plus d'eau chaude", note: "Plus d'eau chaude depuis hier soir. Ballon de 200 L.", addr: "7 rue Duguesclin, Lyon 3e", suite: "À rappeler", dur: "0:58" },
    { id: "c5", name: "Mme Leroy", topic: "Devis salle d'eau", tag: "Devis salle d'eau", time: "17:40", day: "Hier", urgent: false, callback: true, note: "Devis salle d'eau. Souhaite être rappelé.", dur: "0:45" },
    { id: "c6", name: "M. Petit", topic: "Robinet qui fuit", tag: "Robinet qui fuit", time: "16:05", day: "Hier", urgent: false, callback: true, note: "Robinet qui fuit. Souhaite être rappelé.", dur: "0:45" },
    { id: "c7", name: "Lucas Girard", topic: "Chauffe-eau", tag: "Chauffe-eau", time: "14:22", day: "Hier", urgent: false, callback: true, note: "Chauffe-eau. Souhaite être rappelé.", dur: "0:45" },
    { id: "c8", name: "Nadia Roux", topic: "Entretien chaudière", tag: "Entretien chaudière", time: "10:10", day: "Hier", urgent: false, callback: true, note: "Entretien chaudière. Souhaite être rappelé.", dur: "0:45" },
  ],
  events: ([[0, 0, 1.5, "C. Dubois", "Chaudière"], [1, 1.5, 1, "S. Martin", "Fuite"], [2, .5, 2, "Chantier Leroy", "Rénovation"], [3, 0, 1, "C. Dubois", "Chaudière"], [3, 2.5, 1, "K. Benali", "Salle de bain"], [3, 5, 1, "M. Petit", "Devis"], [4, 1, 1, "C. Dubois", "Pose"], [0, 6, 1.5, "J. Moreau", "Ballon"], [1, 5, 2, "Chantier Leroy", "Rénovation"], [4, 6.5, 1, "S. Martin", "Suivi"],
    [-14, 1, 2, "Chantier Leroy", "Démolition"], [-13, 3, 1, "N. Roux", "Entretien chaudière"], [-11, 0, 1.5, "L. Girard", "Chauffe-eau"], [-10, 5, 1, "M. Petit", "Visite"],
    [-7, 1, 3, "Chantier Leroy", "Plomberie"], [-6, 4, 1, "K. Benali", "Visite"], [-4, 0, 1, "J. Moreau", "Diagnostic"], [-3, 2, 2, "C. Dubois", "Visite chaudière"],
    [7, 0, 2, "Chantier Leroy", "Carrelage"], [8, 3, 1, "N. Roux", "Entretien"], [9, 1, 1.5, "K. Benali", "Pose douche"], [10, 6, 1, "L. Girard", "Pose chauffe-eau"], [11, 2, 1, "M. Petit", "Robinetterie"],
    [14, 1, 3, "Chantier Leroy", "Finitions"], [16, 4, 1, "S. Martin", "Contrôle"], [17, 0, 1, "C. Dubois", "Mise en service"], [21, 2, 1.5, "J. Moreau", "Entretien ballon"], [23, 5, 1, "K. Benali", "Réception travaux"]] as const).map((e, i) => ({ id: "e" + i, date: addDays(BASE, e[0]), start: 8 + e[1], dur: e[2], name: e[3], topic: e[4], created: i === 6 ? 2 : 1, ai: [0, 1, 2, 3, 4, 6, 12, 14, 19].includes(i) })),
  rels: [
    { id: "r1", client: "M. Petit", type: "Relance devis N° 9084", canal: "SMS", status: "prog", date: "Demain 10:00" },
    { id: "r2", client: "Mme Leroy", type: "Demande d'avis", canal: "SMS", status: "prog", date: "Jeu. 9:00" },
    { id: "r3", client: "Clément Dubois", type: "Rappel RDV", canal: "Appel", status: "prog", date: "Ven. 14:00" },
    { id: "r4", client: "Sophie Martin", type: "Demande d'avis", canal: "SMS", status: "rep", date: "Lun. 16:20" },
    { id: "r5", client: "Karim Benali", type: "Relance devis N° 9085", canal: "SMS", status: "rep", date: "Lun. 11:05" },
    { id: "r6", client: "Julie Moreau", type: "Demande d'avis", canal: "SMS", status: "env", date: "Dim. 18:00" },
  ],
  devis: [
    { id: "d8", num: 9089, client: "Julie Moreau", objet: "Remplacement ballon d'eau chaude 200 L", status: "aval", amount: 1450, created: 8, ai: true, from: "aujourd'hui 09:15", lines: [{ l: "Ballon électrique 200 L vertical", q: 1, pu: 890 }, { l: "Groupe de sécurité + raccords", q: 1, pu: 120 }, { l: "Dépose et évacuation de l'ancien ballon", q: 1, pu: 90 }, { l: "Main d'œuvre pose et mise en service", q: 3.5, pu: 100 }] },
    { id: "d7", num: 9088, client: "Sophie Martin", objet: "Réparation fuite sous évier", status: "aval", amount: 285, created: 7, ai: true, from: "aujourd'hui 11:02", lines: [{ l: "Siphon PVC + joints", q: 1, pu: 35 }, { l: "Flexibles inox d'alimentation", q: 2, pu: 25 }, { l: "Déplacement", q: 1, pu: 40 }, { l: "Main d'œuvre", q: 1.5, pu: 100 }] },
    { id: "d1", num: 9087, client: "Clément Dubois", objet: "Remplacement chaudière", status: "att", amount: 5000, created: 6, lines: [{ l: "Chaudière gaz à condensation 24 kW", q: 1, pu: 3200 }, { l: "Kit ventouse et raccordements", q: 1, pu: 450 }, { l: "Dépose et évacuation de l'ancienne chaudière", q: 1, pu: 250 }, { l: "Mise en service et réglages", q: 1, pu: 200 }, { l: "Main d'œuvre", q: 9, pu: 100 }] },
    { id: "d2", num: 9086, client: "Sophie Martin", objet: "Réparation fuite", status: "val", amount: 1240, created: 5, lines: [{ l: "Recherche de fuite", q: 1, pu: 180 }, { l: "Canalisation cuivre Ø14 (m)", q: 6, pu: 45 }, { l: "Raccords et brasures", q: 1, pu: 90 }, { l: "Reprise de cloison placo", q: 1, pu: 200 }, { l: "Main d'œuvre", q: 5, pu: 100 }] },
    { id: "d3", num: 9085, client: "Karim Benali", objet: "Salle de bain", status: "val", amount: 780, created: 4, lines: [{ l: "Mitigeur thermostatique de douche", q: 1, pu: 260 }, { l: "Ensemble de douche barre + flexible", q: 1, pu: 140 }, { l: "Bonde et siphon de douche", q: 1, pu: 80 }, { l: "Main d'œuvre", q: 3, pu: 100 }] },
    { id: "d4", num: 9084, client: "M. Petit", objet: "Robinetterie", status: "env", amount: 460, created: 3, lines: [{ l: "Mitigeur évier cuisine", q: 1, pu: 180 }, { l: "Flexibles inox d'alimentation", q: 2, pu: 20 }, { l: "Déplacement", q: 1, pu: 40 }, { l: "Main d'œuvre", q: 2, pu: 100 }] },
    { id: "d5", num: 9083, client: "Julie Moreau", objet: "Ballon d'eau chaude", status: "val", amount: 1890, created: 2, lines: [{ l: "Ballon électrique 300 L stéatite", q: 1, pu: 1250 }, { l: "Groupe de sécurité + raccords", q: 1, pu: 140 }, { l: "Dépose et évacuation de l'ancien ballon", q: 1, pu: 100 }, { l: "Main d'œuvre", q: 4, pu: 100 }] },
    { id: "d6", num: 9082, client: "Mme Leroy", objet: "Rénovation salle d'eau", status: "val", amount: 1290, created: 1, lines: [{ l: "Meuble vasque 80 cm", q: 1, pu: 480 }, { l: "Mitigeur lavabo", q: 1, pu: 160 }, { l: "Évacuations PVC et raccords", q: 1, pu: 150 }, { l: "Main d'œuvre", q: 5, pu: 100 }] },
  ],
  settings: { agents: { rec: true, ag: true, rel: false, dev: true }, sms: true, push: true, tva: 10, duree: 1 },
  chat: [
    { id: "m1", from: "me", text: "Prépare un devis pour M. Dubois, remplacement chaudière gaz." },
    { id: "m2", from: "ai", text: "Brouillon prêt : chaudière à condensation 24 kW, pose et mise en service.", card: { num: 9088, client: "Clément Dubois", objet: "Chaudière à condensation 24 kW", amount: 4850 } },
    { id: "m3", from: "me", text: "Envoie-le par SMS." },
    { id: "m4", from: "ai", text: "Je l'envoie dès que vous validez. Rien ne part sans votre accord." },
  ],
  lastRel: { client: "Clément Dubois", type: "Avis Google", time: "10:12", canal: "SMS" },
})
const KEY = "akno-demo-v7"
export function useStore() {
  const [s, setS] = useState<St>(() => { try { const v = localStorage.getItem(KEY); if (v) return { ...seed(), ...JSON.parse(v) } } catch { } return seed() })
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { } }, [s])
  return [s, setS] as const
}
export const eur = (n: number) => n.toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ") + " €"
