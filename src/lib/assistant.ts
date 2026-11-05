/* Moteur d'assistant local (hors ligne) : intentions, entités FR, actions sur le store de démo.
   Pur TypeScript, sans dépendance UI : testable avec scripts/test-assistant.ts */
import type { St, Ev, Devis, Call, Rel, Client } from "./store"
import { uid, addDays, eur } from "./store"

export type RItem = { k: "client" | "rdv" | "devis" | "call" | "rel"; id: string; t: string; s?: string; r?: string; rs?: string; name?: string }
export type RAct = { l: string; k: "tel" | "sms" | "fiche" | "go" | "cmd" | "devis" | "ev"; v: string; primary?: boolean }
export type Pending = { intent: string; slots: Record<string, any> }
export type Reply = { intent: string; text: string; items?: RItem[]; acts?: RAct[]; chips?: string[]; done?: string[]; apply?: (s: St) => St; toast?: string; open?: RAct; pending?: Pending | null; fallback?: boolean }
export type Ctx = { today: string; now: number; pending?: Pending | null; me?: string }

/* ---------- Normalisation & utilitaires ---------- */
export const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’`]/g, "'").replace(/[?!.;]+/g, " ").replace(/\s+/g, " ").trim()
const lev = (a: string, b: string) => { const m = a.length, n = b.length; if (Math.abs(m - n) > 2) return 9; const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]); for (let j = 1; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n] }
const hh = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"]
const MOIS = ["janv", "fevr", "mars", "avr", "mai", "juin", "juil", "aout", "sept", "oct", "nov", "dec"]
const dd = (iso: string) => new Date(iso + "T12:00:00")
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
export const dayL = (d: string, today: string) => d === today ? "aujourd'hui" : d === addDays(today, 1) ? "demain" : d === addDays(today, -1) ? "hier" : `${JOURS[dd(d).getDay()]} ${dd(d).getDate()} ${["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"][dd(d).getMonth()]}`
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const plural = (n: number, w: string, p = /([sxz]|RDV)$/.test(w) ? w : w.split(" ").map((x, i) => i === 0 ? (/[sxz]$/.test(x) ? x : x + "s") : x).join(" ")) => `${n} ${n > 1 ? p : w}`
const STL: Record<string, string> = { brouillon: "Brouillon", att: "En attente", env: "Envoyé", val: "Validé", ref: "Refusé", aval: "À valider" }
const tvaOf = (s: St) => s.settings.tva || 10
const ttc = (ht: number, s: St) => Math.round(ht * (1 + tvaOf(s) / 100))

/* ---------- Dates & heures ---------- */
export function parseDate(n: string, today: string): string | undefined {
  if (/apres[- ]demain/.test(n)) return addDays(today, 2)
  if (/\bdemain\b/.test(n)) return addDays(today, 1)
  if (/\b(aujourd'?hui|aujourdhui|ce jour|ce soir|ce matin|cet apres[- ]midi)\b/.test(n)) return today
  if (/\bhier\b/.test(n)) return addDays(today, -1)
  let m = n.match(/\b(\d{1,2})\s*(?:er)?\s*(janv|fevr?|mars|avr|mai|juin|juil|aout|sept?|oct|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?/)
  if (m) { const mo = MOIS.findIndex(x => x.startsWith(m![2].slice(0, 3))); const y = m[3] ? +m[3] : dd(today).getFullYear(); let d = iso(new Date(y, mo, +m[1], 12)); if (!m[3] && d < today) d = iso(new Date(y + 1, mo, +m[1], 12)); return d }
  m = n.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
  if (m) { const y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : dd(today).getFullYear(); return iso(new Date(y, +m[2] - 1, +m[1], 12)) }
  const w = JOURS.findIndex(j => new RegExp(`\\b${j}\\b`).test(n))
  if (w >= 0) { const cur = dd(today).getDay(); let k = (w - cur + 7) % 7; if (k === 0) k = /prochain/.test(n) ? 7 : 0; else if (/prochain/.test(n) && k < 3 && false) k += 7; return addDays(today, k) }
  m = n.match(/\ble (\d{1,2})\b(?!\s*(?:h|:|euros?|€|%))/)
  if (m && +m[1] >= 1 && +m[1] <= 31) { const t = dd(today); let d = iso(new Date(t.getFullYear(), t.getMonth(), +m[1], 12)); if (d < today) d = iso(new Date(t.getFullYear(), t.getMonth() + 1, +m[1], 12)); return d }
  return undefined
}
export function parseTime(n: string): number | undefined {
  let m = n.match(/\b(\d{1,2})\s*(?:h|heures?|:)\s*(\d{2})?\b/)
  if (m && +m[1] < 24) return +m[1] + (m[2] ? +m[2] / 60 : 0)
  m = n.match(/\ba (\d{1,2})\b(?!\s*(?:€|euros?|%|\/|ans?|appels?|devis|rdv|jours?))/)
  if (m && +m[1] >= 7 && +m[1] <= 20) return +m[1]
  if (/\bmidi\b/.test(n)) return 12
  return undefined
}
const partOfDay = (n: string) => /\bmatin\b/.test(n) ? 9 : /apres[- ]midi|aprem/.test(n) ? 14 : /\bsoir\b/.test(n) ? 18 : undefined
export function parseAmount(raw: string, bare = false): number | undefined {
  const t = raw.replace(/\u202f|\u00a0/g, " ")
  let m = t.match(/(\d[\d\s]*(?:[.,]\d+)?)\s*(?:k€|k\b)/i); if (m) return Math.round(parseFloat(m[1].replace(/\s/g, "").replace(",", ".")) * 1000)
  m = t.match(/(\d[\d\s]*(?:[.,]\d+)?)\s*(?:€|euros?\b|eur\b|e\b(?= ?ht| ?ttc|$))/i)
  if (!m && bare) m = t.match(/\b(\d[\d\s]*(?:[.,]\d+)?)\b/)
  if (!m) return undefined
  const v = parseFloat(m[1].replace(/\s/g, "").replace(",", ".")); return v > 0 ? v : undefined
}
const devisNum = (n: string) => { const m = n.match(/\b(?:n°?\s*|numero\s*|devis\s*)?(9\d{3})\b/); return m ? +m[1] : undefined }

/* ---------- Clients (correspondance approchée) ---------- */
const STOP = new Set("le la les un une des du de d l a au aux pour avec chez et ou en sur dans par mon ma mes son sa ses ce cet cette qui que quoi quel quelle quels quelles est sont ai as a moi me te tu il elle on nous vous ils devis rdv rendez vous rendezvous appel appels appelle appeler rappel rappeler rappele relance relancer relances client clients fiche numero telephone tel adresse demain aujourd hui hier semaine prochain prochaine lundi mardi mercredi jeudi vendredi samedi dimanche matin soir midi heure heures montant total euros euro valide valider valides envoie envoyer sms message ouvre ouvrir affiche montre donne dis fais faire cree creer prepare ajoute prends prendre planifie deplace decale reporte annule supprime marque marquer combien liste tous toutes tout quand ou infos info historique chantier objet travaux merci bonjour salut svp stp plait peux peut faut dois doit avoir voir mettre mets aller va page agenda reception parametres reglages attente urgent urgents urgence jour journee resume bilan chiffre affaires estime taux conversion signe signes mois ans an nouveau nouvelle remplacement reparation fuite pose installation intervention visite entretien ballon chaudiere robinet evier salle bain eau chaude vidange cumulus wc douche mitigeur radiateur depannage".split(" "))
export type CRef = { key: string; name: string; phone?: string; addr?: string; email?: string; rec?: Client }
const lastTok = (n: string) => norm(n).replace(/^(m\.?|mme|mr|chantier)\s+/, "").split(" ").slice(-1)[0]
export function allClients(s: St): CRef[] {
  const m = new Map<string, CRef>()
  ;(s.clients || []).forEach(c => m.set(c.key, { key: c.key, name: c.name, phone: c.phone, addr: c.addr, email: c.email, rec: c }))
  const add = (n: string) => { const k = lastTok(n); if (k && !m.has(k)) m.set(k, { key: k, name: n }) }
  s.calls.forEach(c => add(c.name)); s.devis.forEach(d => add(d.client))
  return [...m.values()]
}
export const sameClient = (a: string, c: CRef) => lastTok(a) === c.key || norm(a) === norm(c.name)
export function findClient(text: string, s: St): CRef | undefined {
  const toks = norm(text).replace(/[^a-z0-9' -]/g, " ").split(/[\s']+/).filter(w => w.length >= 3 && !STOP.has(w))
  let best: CRef | undefined, bs = 0
  for (const c of allClients(s)) {
    const nt = norm(c.name).replace(/^(m\.?|mme|mr)\s+/, "").split(" ").filter(w => w.length >= 2)
    let sc = 0
    const near = (w: string, x: string) => w === x || (w.length >= 4 && x.length >= 4 && (lev(w, x) <= (x.length >= 7 || (w.length >= 5 && x.length >= 6) ? 2 : 1) || x.startsWith(w)))
    toks.forEach((w, i) => nt.forEach((x, j) => { if (!near(w, x)) return
      const isLast = j === nt.length - 1
      if (!isLast && nt.length > 1 && toks[i + 1] && !near(toks[i + 1], nt[nt.length - 1])) return /* prénom suivi d'un autre nom : autre personne */
      sc += w === x ? (isLast ? 3 : 2) : 1 }))
    if (sc > bs) { bs = sc; best = c }
  }
  return best
}
/* Nom brut d'un nouveau client (« pour M. Durand », « avec Paul Lefèvre ») */
function rawName(text: string): string | undefined {
  const m = text.match(/(?:pour|avec|chez|à|a|de)\s+((?:M\.|Mme|Mr|Monsieur|Madame)\s*[A-ZÀ-Ý][\wÀ-ÿ'-]+|[A-ZÀ-Ý][\wÀ-ÿ'-]+(?:\s+[A-ZÀ-Ý][\wÀ-ÿ'-]+)?)/)
  if (!m) return undefined
  const n = m[1].replace(/^Monsieur\s*/, "M. ").replace(/^Madame\s*/, "Mme ").replace(/^Mr\s*/, "M. ").trim()
  return STOP.has(norm(n.split(" ").slice(-1)[0])) || /^(Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche|Demain)$/i.test(n) ? undefined : n
}
const phoneOf = (c: CRef) => c.phone || "06 00 00 00 00"

/* ---------- Items ---------- */
const evItem = (e: Ev, today: string): RItem => ({ k: "rdv", id: e.id, t: `${e.name} · ${e.topic}`, s: `${cap(dayL(e.date, today))} · ${hh(e.start)} – ${hh(e.start + e.dur)}${e.addr ? " · " + e.addr : ""}`, r: hh(e.start) })
const dvItem = (d: Devis, s: St): RItem => ({ k: "devis", id: d.id, t: `${d.client}`, s: `N° ${d.num} · ${d.objet}`, r: eur(d.amount), rs: STL[d.status], name: d.client })
const callItem = (c: Call): RItem => ({ k: "call", id: c.id, t: c.name, s: `${c.tag || c.topic} · ${c.day ? "hier " : ""}${c.time}`, rs: c.urgent ? "Urgent" : c.callback ? "À rappeler" : "Traité", name: c.name })
const clItem = (c: CRef): RItem => ({ k: "client", id: c.key, t: c.name, s: [c.phone, c.addr].filter(Boolean).join(" · "), name: c.name })
const relItem = (r: Rel): RItem => ({ k: "rel", id: r.id, t: r.client, s: `${r.type} · ${r.canal}`, r: r.date, rs: { prog: "Programmée", pause: "En pause", env: "Envoyée", rep: "Répondu" }[r.status], name: r.client })
const evsOf = (s: St, c: CRef) => s.events.filter(e => sameClient(e.name, c)).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)
const upcoming = (s: St, ctx: Ctx) => s.events.filter(e => e.date > ctx.today || (e.date === ctx.today && e.start + e.dur > ctx.now)).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)
const monday = (d: string) => addDays(d, -((dd(d).getDay() + 6) % 7))

export const HELP_CHIPS = ["Résumé de ma journée", "Qui dois-je rappeler ?", "Mes RDV de demain", "Devis à valider", "Crée un RDV jeudi à 14h", "Fais un devis de 850 €"]

/* ---------- Moteur ---------- */
export function answer(raw: string, s: St, ctx: Ctx): Reply {
  const n = norm(raw), P = ctx.pending
  if (P) { if (/^(non|annule|annuler|laisse tomber|stop|oublie|rien|pas grave)\b/.test(n)) return { intent: "cancel", text: "D'accord, j'abandonne. Autre chose ?", pending: null, chips: HELP_CHIPS.slice(0, 3) }
    const r = continuePending(raw, n, s, ctx, P); if (r) return r }
  return route(raw, n, s, ctx)
}

function continuePending(raw: string, n: string, s: St, ctx: Ctx, P: Pending): Reply | undefined {
  const sl = { ...P.slots }; let got = false
  if ("client" in sl && !sl.client) { const c = findClient(raw, s); const nm = c?.name || rawName(" pour " + raw.trim()) || (/^[A-ZÀ-Ý]/.test(raw.trim()) && raw.trim().split(" ").length <= 3 ? raw.trim() : undefined); if (nm) { sl.client = nm; got = true } }
  if ("date" in sl && !sl.date) { const d = parseDate(n, ctx.today); if (d) { sl.date = d; got = true } }
  if ("start" in sl && sl.start == null) { const t = parseTime(n) ?? partOfDay(n) ?? (/^\d{1,2}$/.test(n) ? +n : undefined); if (t != null) { sl.start = t; got = true } }
  if ("amount" in sl && !sl.amount) { const a = parseAmount(raw, true); if (a) { sl.amount = a; got = true } }
  if ("objet" in sl && !sl.objet && !got && n.length > 2 && !/\d/.test(n)) { sl.objet = cap(raw.trim()); got = true }
  if (!got) return undefined
  return run(P.intent, sl, raw, n, s, ctx)
}

function route(raw: string, n: string, s: St, ctx: Ctx): Reply {
  const cl = findClient(raw, s), num = devisNum(n)
  const has = (re: RegExp) => re.test(n)
  /* --- Politesse & aide --- */
  if (has(/^(merci|super|parfait|top|genial|ok merci)\b/)) return { intent: "thanks", text: "Avec plaisir. Autre chose ?", chips: HELP_CHIPS.slice(0, 3) }
  if (has(/(que (peux|sais)[- ]tu|tu (peux|sais) faire|aide|help|comment (ca marche|t'utiliser|tu marches)|quelles? (questions|commandes))/)) return help()
  if (has(/^(bonjour|salut|hello|coucou|bonsoir|hey)\b/) && n.split(" ").length <= 3) return { intent: "hello", text: `Bonjour ${(ctx.me || "").split(" ")[0]}. Je peux résumer votre journée, créer un RDV ou un devis, relancer un client… Que voulez-vous faire ?`, chips: HELP_CHIPS.slice(0, 4) }

  /* --- Actions --- */
  const verbCreate = /\b(cree|creer|ajoute|ajouter|prends?|prendre|planifie|planifier|programme|programmer|fixe|fixer|cale|caler|mets?|mettre|bloque|nouveau|nouvel|nouvelle|organise|reserve)\b/
  const isRdv = /\b(rdv|rendez[- ]?vous|intervention|creneau|visite|passage)\b/
  if (has(/\b(deplace|deplacer|decale|decaler|reporte|reporter|bouge|bouger|avance|avancer|change|changer)\b/) && (has(isRdv) || cl)) return run("move_rdv", { client: cl?.name, date: parseDate(n, ctx.today), start: parseTime(n) ?? partOfDay(n) }, raw, n, s, ctx, true)
  if (has(/\b(annule|annuler|supprime|supprimer|retire|enleve)\b/) && has(isRdv)) return run("cancel_rdv", { client: cl?.name, date: parseDate(n, ctx.today) }, raw, n, s, ctx, true)
  if (has(verbCreate) && has(isRdv)) return run("create_rdv", { client: cl?.name || rawName(raw), date: parseDate(n, ctx.today), start: parseTime(n) ?? partOfDay(n), topic: topicOf(raw) }, raw, n, s, ctx, true)
  if (has(/\b(fais|faire|fait|cree|creer|prepare|preparer|redige|rediger|genere|generer|etablis|nouveau|nouvel|edite|editer)\b/) && has(/\bdevis\b/)) return run("create_devis", { client: cl?.name || rawName(raw), amount: parseAmount(raw), objet: objetOf(raw) }, raw, n, s, ctx, true)
  if (has(/\b(valide|valider|approuve|approuver|accepte|confirme)\b/) && !has(/\ba valider\b/) && (has(/\bdevis\b/) || num || n.split(" ").length <= 3)) return validateDevis(num, cl, s, ctx, n)
  if (has(/\b(marque|marquer|note|noter)\b.*\brappele/) || has(/\b(j'ai|jai|deja) (rappele|appele)\b/) || has(/\bc'?est fait pour\b/)) return markCalled(cl, s, n)
  if (has(/\b(relance|relancer|relancez)\b/) && !has(/\b(relances? a faire|quelles? relances|combien de relances|mes relances|relances? (prevues|programmees|en cours|en attente))\b/) && (cl || has(/\b(envoie|envoyer)\b/))) return run("relance", { client: cl?.name }, raw, n, s, ctx, true)
  if (has(/\b(sms|texto|message)\b/) && has(/\b(envoie|envoyer|ecris|ecrire|textote|manda|fais)\b/) || has(/^sms\b/)) return smsTo(cl, raw, ctx)
  if (has(/^(appelle|appeler|telephone a|telephoner a|compose|joins|joindre)\b/) || has(/\b(lance|passe) (un )?appel\b/)) return callTo(cl)
  if (has(/\b(ouvre|ouvrir|affiche|afficher|montre|montrer)\b.*\bfiche\b/) || (has(/^fiche\b/) && cl)) return cl ? { intent: "open_fiche", text: `J'ouvre la fiche de ${cl.name}.`, items: [clItem(cl)], open: { l: "Fiche", k: "fiche", v: cl.name }, acts: [{ l: "Appeler", k: "tel", v: phoneOf(cl) }] } : ask("open_fiche", { client: undefined }, "Quelle fiche client voulez-vous ouvrir ?")
  const page = has(/\bagenda|calendrier|planning\b/) ? "ag" : has(/\breception|accueil|appels\b/) ? "rec" : has(/\brelances?\b/) ? "rel" : has(/\bdevis\b/) ? "dev" : has(/\b(parametres|reglages|reglage|profil)\b/) ? "set" : undefined
  if (page && has(/^(va|aller|vas|ouvre|ouvrir|affiche|montre|emmene|navigue)\b|\b(va sur|aller sur|ouvre la page|page)\b/) && n.split(" ").length <= 6) { const L: any = { ag: "Agenda", rec: "Réception", rel: "Relance", dev: "Devis", set: "Paramètres" }; return { intent: "nav", text: `J'ouvre ${L[page]}.`, open: { l: L[page], k: "go", v: page } } }

  /* --- Questions --- */
  if (!cl && parseDate(n, ctx.today) && has(/\b(quoi|prevu|prevus|programme|ai-je|j'ai|planning|occupe|faire)\b/) && !has(/\bdevis|appel|relance/)) return rdvQ(n, cl, s, ctx)
  if (has(/\b(resume|resumer|bilan|brief|briefing|recap|recapitulatif|quoi de neuf|ma journee|point sur|planning du jour)\b/) && !cl) return summary(s, ctx)
  if (has(/\b(chiffre d'?affaires?|ca\b|ca estime|combien (j'ai|ai-je) (gagne|facture)|gagne|encaisse|revenus?)\b/)) return revenue(s)
  if (has(/\btaux\b.*\b(conversion|transformation|signature|acceptation)\b|\bconversion\b/)) return conversion(s)
  if (has(/\bdevis\b/) || (num && !has(isRdv))) return devisQ(n, num, cl, s, ctx)
  if (has(/\b(rdv|rendez[- ]?vous|agenda|planning|intervention|interventions|chantiers?|occupe|libre|dispo|disponible)\b/)) return rdvQ(n, cl, s, ctx)
  if (has(/\brelances?\b/)) return relQ(s)
  if (cl && has(/\b(telephone|numero|tel|portable|joindre|contact)\b/)) return { intent: "client_phone", text: `${cl.name} : ${phoneOf(cl)}.`, items: [clItem(cl)], acts: [{ l: "Appeler", k: "tel", v: phoneOf(cl), primary: true }, { l: "SMS", k: "sms", v: phoneOf(cl) }] }
  if (cl && has(/\b(adresse|habite|ou (est|se trouve)|itineraire|chantier)\b/)) return { intent: "client_addr", text: cl.addr ? `${cl.name} : ${cl.addr}.` : `Je n'ai pas d'adresse pour ${cl.name}.`, items: [clItem(cl)], acts: [{ l: "Fiche client", k: "fiche", v: cl.name }] }
  if (cl && has(/\b(mail|e-mail|email|courriel)\b/)) return { intent: "client_mail", text: cl.email ? `${cl.name} : ${cl.email}.` : `Pas d'e-mail enregistré pour ${cl.name}.`, items: [clItem(cl)] }
  if (has(/\b(appels?|appele|rappeler|rappel|urgents?|urgences?|qui (m'a|ma) appele|telephone)\b/)) return callsQ(n, cl, s)
  if (cl) return clientInfo(cl, s, ctx)
  if (has(/\b(clients?|contacts?)\b/)) { const all = allClients(s); return { intent: "clients", text: `Vous avez ${plural(all.length, "contact")} au total.`, items: all.slice(0, 6).map(clItem), chips: all.slice(0, 2).map(c => `Historique de ${c.name}`) } }
  return { intent: "fallback", fallback: true, text: "Je n'ai pas bien compris. Je peux répondre sur vos appels, RDV, devis, relances et clients, ou faire une action pour vous.", chips: HELP_CHIPS }
}

const topicOf = (raw: string) => { const m = norm(raw).match(/\b(?:pour|objet)\s+(?:un |une |la |le |l')?((?:remplacement|reparation|pose|installation|entretien|visite|depannage|fuite|ballon|chaudiere|robinet|devis|diagnostic|renovation|vidange|debouchage)[a-z' ]*?)(?=\s+(?:avec|chez|pour|demain|aujourd|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|le \d|a \d|\d)|$)/); return m ? cap(m[1].trim()) : undefined }
const objetOf = (raw: string) => { const t = raw.replace(/\u202f|\u00a0/g, " "); const m = t.match(/(?:objet\s*:?\s*|pour (?:un |une |la |le |l')|:\s*)((?:[a-zA-ZÀ-ÿ'’-]+\s?){1,7}?)(?=\s*(?:,|\.|\d|pour|à|a\s+\d|$))/i); if (!m) return undefined; const o = m[1].trim(); return /^(M\.|Mme)/.test(o) || /^[A-Z]/.test(o) && findCap(o) ? undefined : cap(o) }
const findCap = (o: string) => /^[A-ZÀ-Ý][a-zà-ÿ]+(\s+[A-ZÀ-Ý][a-zà-ÿ]+)?$/.test(o)
const ask = (intent: string, slots: Record<string, any>, q: string, chips?: string[]): Reply => ({ intent: intent + ":ask", text: q, pending: { intent, slots }, chips })

function run(intent: string, sl: Record<string, any>, raw: string, n: string, s: St, ctx: Ctx, first = false): Reply {
  const cRef = sl.client ? findClient(sl.client, s) : undefined
  const cname = cRef?.name || sl.client
  if (intent === "create_rdv") {
    const slots = { client: cname, date: sl.date, start: sl.start, topic: sl.topic }
    if (!slots.client) return ask(intent, slots, "Pour quel client ?", allClients(s).slice(0, 3).map(c => c.name))
    if (!slots.date) return ask(intent, slots, `Quel jour pour ${slots.client} ?`, ["Demain", "Jeudi", "Lundi prochain"])
    if (slots.start == null) { const free = freeSlots(s, slots.date); return ask(intent, slots, `À quelle heure, ${dayL(slots.date, ctx.today)} ? Créneaux libres : ${free.map(hh).join(", ") || "aucun"}.`, free.slice(0, 3).map(h => hh(h).replace(":00", "h").replace(":", "h"))) }
    if (slots.date < ctx.today) return ask(intent, { ...slots, date: undefined }, "Cette date est passée. Quel jour voulez-vous ?", ["Demain", "Lundi prochain"])
    const call = s.calls.find(c => cRef && sameClient(c.name, cRef)), topic = slots.topic || call?.tag || call?.topic || "Intervention"
    const ev: Ev = { id: uid(), date: slots.date, start: slots.start, dur: 1, name: cname, topic, addr: cRef?.addr, created: Date.now(), ai: true }
    const clash = s.events.find(e => e.date === ev.date && e.start < ev.start + ev.dur && ev.start < e.start + e.dur)
    return { intent, text: `C'est noté : RDV avec ${cname} ${dayL(ev.date, ctx.today)} à ${hh(ev.start)}.${clash ? ` Attention, il chevauche « ${clash.name} · ${clash.topic} » à ${hh(clash.start)}.` : ""}${s.settings.sms ? " Le client recevra une confirmation par SMS." : ""}`,
      done: [`RDV créé · ${cap(dayL(ev.date, ctx.today))} ${hh(ev.start)}`, `Client · ${cname}`], items: [evItem(ev, ctx.today)], apply: x => ({ ...x, events: [...x.events, ev] }), toast: `RDV créé · ${cname}`, pending: null, acts: [{ l: "Voir l'agenda", k: "go", v: "ag" }], chips: [`Déplace le RDV de ${cname} à demain 9h`, `Annule le RDV de ${cname}`] }
  }
  if (intent === "move_rdv" || intent === "cancel_rdv") {
    if (!cname) return ask(intent, { client: undefined, date: sl.date, start: sl.start }, intent === "move_rdv" ? "Quel RDV voulez-vous déplacer ? Donnez-moi le nom du client." : "Le RDV de quel client faut-il annuler ?")
    const c = cRef || { key: lastTok(cname), name: cname }, fut = evsOf(s, c).filter(e => e.date >= ctx.today)
    const ev = fut[0]
    if (!ev) return { intent, text: `Je ne trouve aucun RDV à venir avec ${cname}.`, pending: null, chips: [`Crée un RDV avec ${cname} demain à 10h`] }
    if (intent === "cancel_rdv") return { intent, text: `RDV annulé : ${ev.name} · ${ev.topic}, ${dayL(ev.date, ctx.today)} à ${hh(ev.start)}.`, done: ["RDV annulé"], items: [{ ...evItem(ev, ctx.today), rs: "Annulé" }], apply: x => ({ ...x, events: x.events.filter(e => e.id !== ev.id) }), toast: `RDV annulé · ${ev.name}`, pending: null }
    if (!sl.date && sl.start == null) return ask(intent, { client: cname, date: undefined, start: undefined }, `Le RDV de ${cname} est ${dayL(ev.date, ctx.today)} à ${hh(ev.start)}. À quel moment le déplacer ?`, ["Demain 9h", "Vendredi 14h"])
    const nd = sl.date || ev.date, ns = sl.start ?? ev.start
    return { intent, text: `RDV de ${cname} déplacé : ${dayL(ev.date, ctx.today)} ${hh(ev.start)} → ${dayL(nd, ctx.today)} ${hh(ns)}.`, done: [`RDV déplacé · ${cap(dayL(nd, ctx.today))} ${hh(ns)}`], items: [evItem({ ...ev, date: nd, start: ns }, ctx.today)], apply: x => ({ ...x, events: x.events.map(e => e.id === ev.id ? { ...e, date: nd, start: ns } : e) }), toast: `RDV déplacé · ${cname}`, pending: null }
  }
  if (intent === "create_devis") {
    const slots = { client: cname, amount: sl.amount, objet: sl.objet }
    if (!slots.client) return ask(intent, slots, "Pour quel client est ce devis ?", allClients(s).slice(0, 3).map(c => c.name))
    if (!slots.amount) { const call = s.calls.find(c => cRef && sameClient(c.name, cRef)); return ask(intent, { ...slots, objet: slots.objet || call?.besoin || call?.topic }, `Quel montant HT pour ${slots.client}${(slots.objet || call?.besoin) ? ` (${(slots.objet || call?.besoin).toLowerCase()})` : ""} ?`, ["450 €", "850 €", "1 200 €"]) }
    const call = s.calls.find(c => cRef && sameClient(c.name, cRef)), objet = slots.objet || call?.besoin || call?.topic || "Travaux de plomberie"
    const dv: Devis = { id: uid(), num: Math.max(9000, ...s.devis.map(d => d.num)) + 1, client: cname, objet, amount: slots.amount, status: "brouillon", created: Date.now(), ai: true }
    return { intent, text: `Brouillon de devis prêt pour ${cname} : ${objet.toLowerCase()}, ${eur(dv.amount)} HT (${eur(ttc(dv.amount, s))} TTC).`, done: [`Devis N° ${dv.num} créé · brouillon`], items: [dvItem(dv, s)], apply: x => ({ ...x, devis: [dv, ...x.devis] }), toast: `Devis ${dv.num} créé`, pending: null, acts: [{ l: "Valider", k: "cmd", v: `Valide le devis ${dv.num}`, primary: true }, { l: "Voir le devis", k: "devis", v: dv.id }] }
  }
  if (intent === "relance") {
    if (!cname) return ask(intent, { client: undefined }, "Quel client faut-il relancer ?", s.rels.filter(r => r.status === "prog").slice(0, 3).map(r => r.client))
    const c = cRef || { key: lastTok(cname), name: cname }, prog = s.rels.find(r => r.status === "prog" && sameClient(r.client, c))
    const dv = s.devis.find(d => sameClient(d.client, c) && (d.status === "env" || d.status === "att"))
    const type = prog?.type || (dv ? `Relance devis N° ${dv.num}` : "Relance"), canal = prog?.canal || "SMS"
    return { intent, text: `Relance envoyée à ${cname} par ${canal} : « ${type} ».${prog ? " (Elle était programmée, je l'ai envoyée maintenant.)" : ""}`, done: [`Relance envoyée · ${canal}`], items: [{ k: "rel", id: prog?.id || "new", t: cname, s: `${type} · ${canal}`, rs: "Envoyée", name: cname }], pending: null,
      apply: x => ({ ...x, rels: prog ? x.rels.map(r => r.id === prog.id ? { ...r, status: "env", date: "À l'instant" } : r) : [{ id: uid(), client: cname, type, canal, status: "env", date: "À l'instant" }, ...x.rels], lastRel: { client: cname, type, time: "À l'instant", canal } }), toast: `Relance envoyée à ${cname}`, acts: [{ l: "Voir les relances", k: "go", v: "rel" }] }
  }
  if (intent === "open_fiche") { if (!cname) return ask(intent, { client: undefined }, "Quelle fiche client ?"); return { intent, text: `J'ouvre la fiche de ${cname}.`, open: { l: "Fiche", k: "fiche", v: cname }, pending: null } }
  if (intent === "mark_called") return markCalled(cRef, s, n)
  return { intent: "fallback", fallback: true, text: "Je n'ai pas compris.", pending: null }
}

function freeSlots(s: St, d: string) { const evs = s.events.filter(e => e.date === d); return [8, 9, 10, 11, 14, 15, 16, 17].filter(h => !evs.some(e => e.start < h + 1 && h < e.start + e.dur)) }

function validateDevis(num: number | undefined, cl: CRef | undefined, s: St, ctx: Ctx, n: string): Reply {
  let d = num ? s.devis.find(x => x.num === num) : undefined
  if (!d && cl) d = [...s.devis].filter(x => sameClient(x.client, cl) && ["aval", "brouillon", "att"].includes(x.status)).sort((a, b) => b.num - a.num)[0]
  if (!d) { const av = s.devis.filter(x => x.status === "aval" || x.status === "brouillon"); if (av.length === 1 || /\b(le dernier|dernier devis)\b/.test(n)) d = [...av].sort((a, b) => b.num - a.num)[0]
    else if (av.length) return { intent: "validate:which", text: `Quel devis valider ? ${plural(av.length, "devis attend", "devis attendent")} :`, items: av.map(x => dvItem(x, s)), acts: av.slice(0, 3).map(x => ({ l: `Valider ${x.num}`, k: "cmd" as const, v: `Valide le devis ${x.num}` })) }
    else return { intent: "validate:none", text: "Aucun devis n'attend de validation." } }
  if (d.status === "val" || d.status === "env") return { intent: "validate:already", text: `Le devis N° ${d.num} (${d.client}) est déjà ${STL[d.status].toLowerCase()}.`, items: [dvItem(d, s)] }
  const ns = d.status === "aval" ? "env" : "att", dv = d
  return { intent: "validate", text: ns === "env" ? `Devis N° ${dv.num} validé et envoyé à ${dv.client} (${eur(ttc(dv.amount, s))} TTC).` : `Devis N° ${dv.num} validé, en attente d'envoi.`, done: [`Devis ${dv.num} · ${STL[ns]}`], items: [{ ...dvItem(dv, s), rs: STL[ns] }], apply: x => ({ ...x, devis: x.devis.map(y => y.id === dv.id ? { ...y, status: ns } : y) }), toast: `Devis ${dv.num} validé`, acts: [{ l: "Voir le devis", k: "devis", v: dv.id }] }
}
function markCalled(cl: CRef | undefined, s: St, n: string): Reply {
  const all = /\b(tous|tout le monde|toutes)\b/.test(n), list = s.calls.filter(c => c.callback && (all || (cl && sameClient(c.name, cl))))
  if (!cl && !all) return ask("mark_called", { client: undefined }, "Qui avez-vous rappelé ?", s.calls.filter(c => c.callback).slice(0, 3).map(c => c.name))
  if (!list.length) return { intent: "mark_called", text: `${cl ? cl.name + " n'est" : "Personne n'est"} pas dans la liste à rappeler.`, pending: null }
  const ids = new Set(list.map(c => c.id))
  return { intent: "mark_called", text: all ? `${plural(list.length, "appel marqué", "appels marqués")} comme rappelé${list.length > 1 ? "s" : ""}.` : `${cl!.name} est marqué comme rappelé.`, done: list.map(c => `Rappelé · ${c.name}`), apply: x => ({ ...x, calls: x.calls.map(c => ids.has(c.id) ? { ...c, callback: false } : c) }), toast: all ? "Tous marqués rappelés" : `${cl!.name} · marqué rappelé`, pending: null }
}
function callTo(cl: CRef | undefined): Reply { if (!cl) return ask("open_fiche", { client: undefined }, "Qui voulez-vous appeler ?"); return { intent: "call", text: `Appeler ${cl.name} au ${phoneOf(cl)}.`, items: [clItem(cl)], acts: [{ l: `Appeler ${cl.name.split(" ")[0] === "M." || cl.name.startsWith("Mme") ? cl.name : cl.name.split(" ")[0]}`, k: "tel", v: phoneOf(cl), primary: true }, { l: "SMS", k: "sms", v: phoneOf(cl) }] } }
function smsTo(cl: CRef | undefined, raw: string, ctx: Ctx): Reply {
  if (!cl) return { intent: "sms:ask", text: "À quel client voulez-vous envoyer un SMS ?" }
  const m = raw.match(/(?::|pour (?:lui )?dire(?: que)?|disant(?: que)?|«)\s*(.+?)»?$/i), body = m?.[1]?.trim() || `Bonjour, c'est ${ctx.me || ""}. `
  return { intent: "sms", text: `SMS prêt pour ${cl.name} (${phoneOf(cl)}) : « ${body} ». Touchez Envoyer pour l'ouvrir dans Messages.`, items: [clItem(cl)], acts: [{ l: "Envoyer le SMS", k: "sms", v: `${phoneOf(cl)}|${body}`, primary: true }] }
}
function help(): Reply {
  return { intent: "help", text: "Je travaille sur vos données Akno, même hors ligne. Je peux :\n• résumer la journée, les appels, les urgents et qui rappeler ;\n• lire et gérer l'agenda : créer, déplacer ou annuler un RDV ;\n• suivre les devis : à valider, en attente, montants, taux de conversion, CA ; en créer et les valider ;\n• relancer un client, marquer un appel comme rappelé ;\n• donner le téléphone, l'adresse ou l'historique d'un client, l'appeler ou lui écrire ;\n• ouvrir une fiche ou une page.", chips: HELP_CHIPS }
}
function summary(s: St, ctx: Ctx): Reply {
  const today = s.calls.filter(c => !c.day), urg = s.calls.filter(c => c.urgent && c.callback), cb = s.calls.filter(c => c.callback), evs = s.events.filter(e => e.date === ctx.today).sort((a, b) => a.start - b.start), nxt = evs.find(e => e.start + e.dur > ctx.now)
  const av = s.devis.filter(d => d.status === "aval"), rel = s.rels.filter(r => r.status === "prog")
  return { intent: "summary", text: `Votre journée : ${plural(today.length, "appel")} reçu${today.length > 1 ? "s" : ""} (${plural(urg.length, "urgent")}), ${plural(cb.length, "personne")} à rappeler, ${plural(evs.length, "RDV")}${nxt ? ` dont le prochain à ${hh(nxt.start)} avec ${nxt.name}` : ""}, ${plural(av.length, "devis")} à valider et ${plural(rel.length, "relance programmée", "relances programmées")}.`,
    items: [...urg.map(callItem), ...(nxt ? [evItem(nxt, ctx.today)] : []), ...av.map(d => dvItem(d, s))].slice(0, 5), chips: ["Qui dois-je rappeler ?", "Devis à valider", "Mes RDV de demain"] }
}
function revenue(s: St): Reply {
  const val = s.devis.filter(d => d.status === "val"), pipe = s.devis.filter(d => ["att", "env", "aval"].includes(d.status)), cv = conversionRate(s)
  const v = val.reduce((a, d) => a + d.amount, 0), p = pipe.reduce((a, d) => a + d.amount, 0), est = Math.round(v + p * cv)
  return { intent: "revenue", text: `CA validé ce mois : ${eur(v)} HT (${plural(val.length, "devis")}). En cours : ${eur(p)} HT sur ${plural(pipe.length, "devis")}. Avec votre taux de conversion (${Math.round(cv * 100)} %), CA estimé : ${eur(est)} HT.`, acts: [{ l: "Ouvrir Devis", k: "go", v: "dev" }] }
}
const conversionRate = (s: St) => { const dec = s.devis.filter(d => d.status === "val" || d.status === "ref").length, sent = s.devis.filter(d => !["brouillon", "aval"].includes(d.status)).length; return sent ? s.devis.filter(d => d.status === "val").length / sent : 0 }
function conversion(s: St): Reply { const val = s.devis.filter(d => d.status === "val").length, sent = s.devis.filter(d => !["brouillon", "aval"].includes(d.status)).length; return { intent: "conversion", text: `Taux de conversion : ${Math.round(conversionRate(s) * 100)} % (${val} devis validés sur ${sent} envoyés).` } }
function devisQ(n: string, num: number | undefined, cl: CRef | undefined, s: St, ctx: Ctx): Reply {
  if (num) { const d = s.devis.find(x => x.num === num); return d ? { intent: "devis_one", text: `Devis N° ${d.num} : ${d.client}, ${d.objet.toLowerCase()}, ${eur(d.amount)} HT · ${STL[d.status]}.`, items: [dvItem(d, s)], acts: [{ l: "Voir le devis", k: "devis", v: d.id, primary: true }, ...(d.status === "aval" ? [{ l: "Valider", k: "cmd" as const, v: `Valide le devis ${d.num}` }] : [])] } : { intent: "devis_one", text: `Je ne trouve pas de devis N° ${num}.` } }
  if (cl) { const ds = s.devis.filter(d => sameClient(d.client, cl)); return { intent: "devis_client", text: ds.length ? `${cl.name} : ${plural(ds.length, "devis")}, ${eur(ds.reduce((a, d) => a + d.amount, 0))} HT au total.` : `Aucun devis pour ${cl.name}.`, items: ds.map(d => dvItem(d, s)), chips: ds.length ? [] : [`Fais un devis pour ${cl.name}`] } }
  const by = (st: string[]) => s.devis.filter(d => st.includes(d.status)).sort((a, b) => b.num - a.num), sum = (x: Devis[]) => x.reduce((a, d) => a + d.amount, 0)
  if (/\b(a valider|valider|generes? par|ia|akno)\b/.test(n)) { const x = by(["aval"]); return { intent: "devis_aval", text: x.length ? `${plural(x.length, "devis")} à valider, générés par Akno : ${eur(sum(x))} HT.` : "Aucun devis à valider.", items: x.map(d => dvItem(d, s)), acts: x.slice(0, 2).map(d => ({ l: `Valider ${d.num}`, k: "cmd" as const, v: `Valide le devis ${d.num}` })) } }
  if (/\b(en attente|attente|sans reponse|pas (encore )?(signe|repondu)|en cours)\b/.test(n)) { const x = by(["att", "env"]); return { intent: "devis_att", text: `${plural(x.length, "devis")} en attente de réponse : ${eur(sum(x))} HT.`, items: x.map(d => dvItem(d, s)), chips: x[0] ? [`Relance ${x[0].client}`] : [] } }
  if (/\b(signes?|valides?|acceptes?|gagnes?)\b/.test(n)) { const x = by(["val"]); return { intent: "devis_val", text: `${plural(x.length, "devis validé", "devis validés")} ce mois : ${eur(sum(x))} HT.`, items: x.map(d => dvItem(d, s)) } }
  if (/\b(refuses?|perdus?)\b/.test(n)) { const x = by(["ref"]); return { intent: "devis_ref", text: x.length ? `${plural(x.length, "devis refusé", "devis refusés")}.` : "Aucun devis refusé.", items: x.map(d => dvItem(d, s)) } }
  if (/\b(brouillons?)\b/.test(n)) { const x = by(["brouillon"]); return { intent: "devis_br", text: x.length ? `${plural(x.length, "brouillon")}.` : "Aucun brouillon.", items: x.map(d => dvItem(d, s)) } }
  if (/\b(montant|total|combien|somme|valeur)\b/.test(n)) { const all = s.devis; const parts = ["val", "att", "env", "aval", "brouillon", "ref"].map(k => [k, by([k])] as const).filter(([, x]) => x.length).map(([k, x]) => `${STL[k].toLowerCase()} ${eur(sum(x))}`); return { intent: "devis_total", text: `${plural(all.length, "devis")} pour ${eur(sum(all))} HT : ${parts.join(", ")}.` } }
  const all = [...s.devis].sort((a, b) => b.num - a.num); return { intent: "devis_list", text: `${plural(all.length, "devis")} au total. Les plus récents :`, items: all.slice(0, 5).map(d => dvItem(d, s)), acts: [{ l: "Ouvrir Devis", k: "go", v: "dev" }] }
}
function rdvQ(n: string, cl: CRef | undefined, s: St, ctx: Ctx): Reply {
  const sort = (x: Ev[]) => [...x].sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)
  if (cl) { const x = evsOf(s, cl), fut = x.filter(e => e.date >= ctx.today); return { intent: "rdv_client", text: fut.length ? `Prochain RDV avec ${cl.name} : ${dayL(fut[0].date, ctx.today)} à ${hh(fut[0].start)} (${fut[0].topic}).${fut.length > 1 ? ` ${plural(fut.length - 1, "autre")} ensuite.` : ""}` : `Aucun RDV à venir avec ${cl.name}.`, items: fut.map(e => evItem(e, ctx.today)), chips: fut.length ? [`Déplace le RDV de ${cl.name}`] : [`Crée un RDV avec ${cl.name} demain à 10h`] } }
  if (/\b(prochain|suivant|next|d'apres)\b/.test(n)) { const e = upcoming(s, ctx)[0]; return e ? { intent: "rdv_next", text: `Prochain RDV : ${e.name} · ${e.topic}, ${dayL(e.date, ctx.today)} à ${hh(e.start)}.`, items: [evItem(e, ctx.today)] } : { intent: "rdv_next", text: "Aucun RDV à venir." } }
  if (/\b(semaine)\b/.test(n)) { const st = /prochaine/.test(n) ? addDays(monday(ctx.today), 7) : monday(ctx.today), en = addDays(st, 6), x = sort(s.events.filter(e => e.date >= st && e.date <= en)); const days = [...new Set(x.map(e => e.date))]; return { intent: "rdv_week", text: `${plural(x.length, "RDV")} ${/prochaine/.test(n) ? "la semaine prochaine" : "cette semaine"}${days.length ? ` : ${days.map(d => `${JOURS[dd(d).getDay()]} ${x.filter(e => e.date === d).length}`).join(", ")}` : ""}.`, items: x.filter(e => e.date >= ctx.today).slice(0, 6).map(e => evItem(e, ctx.today)), acts: [{ l: "Voir l'agenda", k: "go", v: "ag" }] } }
  const d = parseDate(n, ctx.today) || ctx.today, x = sort(s.events.filter(e => e.date === d))
  if (/\b(libre|dispo|disponible|creneaux?|trou)\b/.test(n)) { const f = freeSlots(s, d); return { intent: "rdv_free", text: f.length ? `Créneaux libres ${dayL(d, ctx.today)} : ${f.map(hh).join(", ")}.` : `Aucun créneau libre ${dayL(d, ctx.today)}.`, chips: f[0] != null ? [`Crée un RDV ${dayL(d, ctx.today)} à ${hh(f[0]).replace(":00", "h")}`] : [] } }
  return { intent: "rdv_day", text: x.length ? `${plural(x.length, "RDV")} ${dayL(d, ctx.today)} : ${x.map(e => `${hh(e.start)} ${e.name}`).join(", ")}.` : `Aucun RDV ${dayL(d, ctx.today)}.`, items: x.map(e => evItem(e, ctx.today)), chips: x.length ? [] : ["Crée un RDV avec M. Petit " + dayL(d, ctx.today) + " à 10h"] }
}
function relQ(s: St): Reply { const p = s.rels.filter(r => r.status === "prog"), rep = s.rels.filter(r => r.status === "rep"); return { intent: "rel_todo", text: `${plural(p.length, "relance programmée", "relances programmées")}${s.settings.agents.rel ? "" : " (agent Relance en pause : rien ne part tout seul)"}, ${plural(rep.length, "réponse reçue", "réponses reçues")}.`, items: p.map(relItem), acts: p.slice(0, 2).map(r => ({ l: `Relancer ${r.client}`, k: "cmd" as const, v: `Relance ${r.client}` })) } }
function callsQ(n: string, cl: CRef | undefined, s: St): Reply {
  if (cl) { const x = s.calls.filter(c => sameClient(c.name, cl)); return { intent: "calls_client", text: x.length ? `${cl.name} a appelé ${x.map(c => `${c.day ? "hier" : "aujourd'hui"} à ${c.time} (${(c.tag || c.topic).toLowerCase()})`).join(", ")}.` : `Pas d'appel récent de ${cl.name}.`, items: x.map(callItem) } }
  if (/\burgent/.test(n)) { const x = s.calls.filter(c => c.urgent); return { intent: "calls_urgent", text: x.length ? `${plural(x.length, "appel urgent", "appels urgents")} : ${x.map(c => `${c.name} (${(c.tag || c.topic).toLowerCase()})`).join(", ")}.` : "Aucun appel urgent.", items: x.map(callItem), acts: x.slice(0, 1).map(c => ({ l: `Appeler ${c.name}`, k: "tel" as const, v: s.clients.find(k => k.key === lastTok(c.name))?.phone || "" })) } }
  if (/\b(rappeler|rappel|a rappeler|recontacter)\b/.test(n)) { const x = s.calls.filter(c => c.callback).sort((a, b) => +b.urgent - +a.urgent); return { intent: "calls_cb", text: x.length ? `${plural(x.length, "personne")} à rappeler${x.some(c => c.urgent) ? `, en priorité ${x.filter(c => c.urgent).map(c => c.name).join(" et ")}` : ""}.` : "Personne à rappeler.", items: x.map(callItem), chips: x[0] ? [`J'ai rappelé ${x[0].name}`, `Appelle ${x[0].name}`] : [] } }
  if (/\bhier\b/.test(n)) { const x = s.calls.filter(c => c.day); return { intent: "calls_hier", text: `${plural(x.length, "appel")} hier.`, items: x.map(callItem) } }
  const x = s.calls.filter(c => !c.day); return { intent: "calls_today", text: `${plural(x.length, "appel")} aujourd'hui, dont ${plural(x.filter(c => c.urgent).length, "urgent")}.`, items: x.map(callItem) }
}
function clientInfo(cl: CRef, s: St, ctx: Ctx): Reply {
  const calls = s.calls.filter(c => sameClient(c.name, cl)), ds = s.devis.filter(d => sameClient(d.client, cl)), evs = evsOf(s, cl), h = cl.rec?.hist
  const nCalls = (h?.calls || 0) + calls.length, fut = evs.filter(e => e.date >= ctx.today)
  const parts = [`${plural(nCalls, "appel")}${h?.since ? ` depuis ${dd(h.since).getFullYear()}` : ""}`, ds.length ? `${plural(ds.length, "devis")} (${eur(ds.reduce((a, d) => a + d.amount, 0))} HT)` : "aucun devis", fut.length ? `prochain RDV ${dayL(fut[0].date, ctx.today)} à ${hh(fut[0].start)}` : "pas de RDV prévu"]
  return { intent: "client_info", text: `${cl.name}${cl.phone ? ` · ${cl.phone}` : ""}${cl.addr ? ` · ${cl.addr}` : ""}. Historique : ${parts.join(", ")}.${calls[0] ? ` Dernier appel : ${(calls[0].tag || calls[0].topic).toLowerCase()}.` : ""}`,
    items: [clItem(cl), ...ds.slice(0, 3).map(d => dvItem(d, s)), ...fut.slice(0, 2).map(e => evItem(e, ctx.today))], acts: [{ l: "Appeler", k: "tel", v: phoneOf(cl), primary: true }, { l: "Fiche client", k: "fiche", v: cl.name }] }
}

/* ---------- Branchement IA externe (optionnel) ----------
   Si VITE_AKNO_AI_URL est défini, les questions non comprises par le moteur local sont envoyées
   en POST { message, context } à cette URL, qui doit répondre { text: string }. Sinon : 100 % local. */
export async function askExternal(text: string, s: St, ctx: Ctx): Promise<string | undefined> {
  const url = (import.meta as any).env?.VITE_AKNO_AI_URL as string | undefined
  if (!url) return undefined
  try {
    const key = (import.meta as any).env?.VITE_AKNO_AI_KEY as string | undefined
    const context = { today: ctx.today, calls: s.calls.map(c => ({ name: c.name, topic: c.topic, urgent: c.urgent, callback: c.callback })), events: s.events.filter(e => e.date >= ctx.today).slice(0, 30), devis: s.devis.map(d => ({ num: d.num, client: d.client, objet: d.objet, amount: d.amount, status: d.status })), rels: s.rels }
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify({ message: text, context }) })
    if (!r.ok) return undefined; const j = await r.json(); return typeof j.text === "string" ? j.text : undefined
  } catch { return undefined }
}
