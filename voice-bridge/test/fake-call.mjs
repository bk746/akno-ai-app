// Test local du relais avec un faux flux Twilio, un faux xAI et une fausse API Akno (aucun appel réel).
import http from "node:http"
import { spawn } from "node:child_process"
import { createHmac } from "node:crypto"
import { WebSocketServer, WebSocket } from "ws"

const SECRET = "test-secret", ARTISAN = "11111111-2222-3333-4444-555555555555", CALL = "CA123"
let ok = 0, ko = 0
const check = (name, cond) => { cond ? ok++ : ko++; console.log(`${cond ? "✔" : "✘"} ${name}`) }
const wait = ms => new Promise(r => setTimeout(r, ms))

// Faux xAI realtime
const seen = { session: null, appends: 0, toolOutput: null, auth: "" }
// update60 : scénario de réservation (null = scénario historique get_available_slots)
let scenario = null
const sc = { bookOut: null, saveOut: null, closings: [], creates: 0 }
// Fin de réponse xAI : les appels d'outils arrivent avec response.done (doc xAI « Parallel Tool Calling »).
const BOOK_ARGS = { prenom: "Jean", nom: "Test", telephone: "0612345678", email: "jean@test.fr", adresse: "1 rue Test", ville: "Lyon", date: "2026-11-19", heure: "08:00", objet: "Diagnostic PAC" }
const SAVE_ARGS = { nom_client: "Jean Test", telephone_client: "0612345678", type_demande: "rdv", rdv_pris: true, resume: "Diagnostic PAC jeudi 8 h." }
// Appel 44 : l'IA donne le bon nom et la bonne adresse à save_call ; la transcription, elle, contient « c'est quelle voie là ».
const SAVE_44 = { nom_client: "Keryan Bouzerda", telephone_client: "07 81 99 07 61", adresse: "17 allée Paul Gauguin. Gauguin, c'est G A U G U I N.", ville: "Annecy", motif: "Chaudière en panne", type_demande: "depannage", urgence: "urgent", rdv_pris: true, rappel_souhaite: true, resume: "Chaudière en panne, plus de chauffage. Diagnostic mardi." }
const saveArgs = () => scenario === "parallel" ? SAVE_44 : scenario === "parallel-rev" ? { ...SAVE_ARGS, nom_client: "quelle voie là ?" } : scenario === "noname" ? { nom_client: "c'est quelle voie là", motif: "Renseignement", resume: "Demande de renseignement." } : SAVE_ARGS
// Voix clonée : "ignore" = comme xAI aujourd'hui pour une voix inconnue de l'équipe (aucune erreur, voix « Ara » appliquée) ; "error" = refus explicite.
const CUSTOM = "3ixfadarbuwy"
let customMode = "ok"
const xai = new WebSocketServer({ port: 18901 })
xai.on("connection", (ws, req) => {
  seen.auth = req.headers.authorization || ""
  const conn = { updates: [], greetedAfter: -1 }
  seen.conn = conn
  ws.on("message", raw => {
    const m = JSON.parse(raw.toString())
    if (m.type === "session.update") {
      seen.session = m.session; conn.updates.push(m.session.voice)
      if (m.session.voice === CUSTOM && customMode === "error") { ws.send(JSON.stringify({ type: "error", error: { message: "Unknown voice" } })); return }
      ws.send(JSON.stringify({ type: "session.updated", session: { voice: m.session.voice === CUSTOM && customMode === "ignore" ? "Ara" : m.session.voice } }))
    }
    if (m.type === "response.create") sc.creates++
    if (m.type === "conversation.item.create" && m.item?.type === "force_message" && conn.greetedAfter >= 0) {
      // 2e message forcé de l'appel : la phrase de fin.
      sc.closings.push(m.item.content[0].text)
      ws.send(JSON.stringify({ type: "response.output_audio_transcript.done", transcript: m.item.content[0].text }))
      ws.send(JSON.stringify({ type: "response.done" }))
      return
    }
    if (m.type === "conversation.item.create" && m.item?.type === "force_message") conn.greetedAfter = conn.updates.length
    if (m.type === "conversation.item.create" && m.item?.type === "force_message") {
      seen.greeting = m.item.content[0].text
      ws.send(JSON.stringify({ type: "response.output_audio.delta", delta: Buffer.alloc(160, 0xff).toString("base64") }))
      ws.send(JSON.stringify({ type: "response.output_audio_transcript.done", transcript: m.item.content[0].text }))
      ws.send(JSON.stringify({ type: "response.done" }))
    }
    if (m.type === "input_audio_buffer.append") {
      seen.appends++
      const tool = (name, call_id, args) => ws.send(JSON.stringify({ type: "response.function_call_arguments.done", name, call_id, arguments: JSON.stringify(args) }))
      const done = () => ws.send(JSON.stringify({ type: "response.done" }))
      const heard = (transcript, item_id) => ws.send(JSON.stringify({ type: "conversation.item.input_audio_transcription.completed", transcript, ...(item_id ? { item_id } : {}) }))
      if (seen.appends === 5 && (scenario === "parallel" || scenario === "parallel-rev")) {
        // Transcriptions comme sur l'appel 44 : le même tour arrive plusieurs fois (partiel, corrigé, final en double).
        if (scenario === "parallel") {
          for (const t of ["Euh, c'est", "Euh, c'est quelle voie là ?", "Euh, c'est quelle voie là ?"]) heard(t, "it1")
          ws.send(JSON.stringify({ type: "response.output_audio_transcript.done", transcript: "Vous êtes bien sur la ligne de Plomberie Test." }))
          for (const t of ["Euh, pour une", "Euh, pour le nom et le prénom euh, Keriat", "Euh, pour le nom et le prénom euh, Kerian, K E R Y A N, Bouzerda."]) heard(t, "it2")
          for (const t of ["17 allée", "17 allée Paul Gauguin. Gauguin, c'est G A U G U I N.", "17 allée Paul Gauguin. Gauguin, c'est G A U G U I N."]) heard(t, "it3")
        } else {
          // Sans item_id : même tour reconnu au texte qui s'allonge.
          for (const t of ["Oui, bonjour.", "Oui, bonjour.", "Euh, ouais, je.", "Euh ouais, j'ai plus de chauffage", "Euh ouais, j'ai plus de chauffage et il commence à faire froid."]) heard(t)
        }
        // Les deux outils dans la même réponse : le RDV (lent) n'est pas encore créé quand save_call arrive.
        if (scenario === "parallel") { tool("book_appointment", "fb1", BOOK_ARGS); tool("save_call", "fs1", saveArgs()) }
        else { tool("save_call", "fs1", saveArgs()); tool("book_appointment", "fb1", BOOK_ARGS) }
        done()
      } else if (seen.appends === 5 && scenario === "hangup") {
        // L'IA envoie save_call, l'appelant raccroche avant la fin de la réponse (pas de response.done).
        tool("save_call", "fs1", { nom_client: "Paul Martin", adresse: "3 rue des Lilas", motif: "Fuite", resume: "Fuite sous l'évier." })
      } else if (seen.appends === 5 && (scenario === "late" || scenario === "noname")) {
        if (scenario === "noname") heard("Euh, c'est quelle voie là ?", "n1")
        tool("save_call", "fs1", saveArgs()); done()
      } else if (seen.appends === 5 && scenario) {
        tool("book_appointment", "fb1", BOOK_ARGS); done()
      } else if (seen.appends === 5) {
        ws.send(JSON.stringify({ type: "conversation.item.input_audio_transcription.completed", transcript: "J'ai une fuite sous l'évier." }))
        ws.send(JSON.stringify({ type: "response.function_call_arguments.done", name: "get_available_slots", call_id: "fc1", arguments: "{}" }))
        done()
      }
    }
    if (m.type === "conversation.item.create" && m.item?.type === "function_call_output") {
      const out = JSON.parse(m.item.output)
      const parallel = scenario === "parallel" || scenario === "parallel-rev"
      if (m.item.call_id === "fb1") {
        sc.bookOut = out
        // L'IA « annonce » un RDV pris dans tous les cas : le relais doit corriger si rien n'a été réservé.
        if (!parallel && scenario !== "late") {
          ws.send(JSON.stringify({ type: "response.function_call_arguments.done", name: "save_call", call_id: "fs1", arguments: JSON.stringify(saveArgs()) }))
          ws.send(JSON.stringify({ type: "response.done" }))
        }
      } else if (m.item.call_id === "fs1") {
        sc.saveOut = out
        // « late » : la fiche est enregistrée, le rendez-vous n'est créé qu'ensuite.
        if (scenario === "late") {
          ws.send(JSON.stringify({ type: "response.function_call_arguments.done", name: "book_appointment", call_id: "fb1", arguments: JSON.stringify(BOOK_ARGS) }))
          ws.send(JSON.stringify({ type: "response.done" }))
        }
      }
      else seen.toolOutput = out
    }
  })
})

// Fausse API Akno (Vercel)
const api = { headers: null, calls: [], notifies: [] }
const app = http.createServer((req, res) => {
  let b = ""; req.on("data", c => b += c); req.on("end", () => {
    api.calls.push(req.url); api.headers = req.headers
    res.setHeader("Content-Type", "application/json")
    let body = {}; try { body = JSON.parse(b || "{}") } catch { /* */ }
    if (req.url === "/api/notify") api.notifies.push(body)
    if (req.url === "/api/booking" && body.action === "book" && (scenario === "parallel" || scenario === "parallel-rev")) {
      // Réservation lente (Cal.com) : save_call est déjà là quand elle aboutit.
      setTimeout(() => res.end(JSON.stringify({ ok: true, start: "2026-11-24T07:30:00.000Z", end: "2026-11-24T08:30:00.000Z", confirmation: "Rendez-vous confirmé.", provider: "akno" })), 300); return
    }
    if (req.url === "/api/booking" && body.action === "book") {
      if (scenario === "timeout") { setTimeout(() => { try { res.end(JSON.stringify({ ok: true, start: "2026-11-19T07:00:00.000Z" })) } catch { /* */ } }, 4000); return }
      if (scenario === "error") { res.statusCode = 502; res.end(JSON.stringify({ ok: false, reason: "error", error: "Cal.com HS" })); return }
      if (scenario === "taken") { res.statusCode = 409; res.end(JSON.stringify({ ok: false, reason: "taken", error: "Ce créneau n'est plus disponible.", alternatives: [{ date: "2026-11-19", heure: "10:00", label: "jeudi 19 novembre à 10:00" }] })); return }
      res.end(JSON.stringify({ ok: true, start: "2026-11-19T07:00:00.000Z", end: "2026-11-19T08:00:00.000Z", confirmation: "Rendez-vous confirmé jeudi 19 novembre à 08:00 pour Jean Test.", provider: "akno" })); return
    }
    res.end(JSON.stringify(req.url === "/api/booking" ? { ok: true, slots: [{ date: "2026-11-19", heure: "09:00", label: "jeudi 19 novembre à 09:00" }] } : { ok: true }))
  })
}).listen(18902)

// Faux Supabase (REST) : fiche artisan avec la config « Ma réceptionniste » (update57)
const sbSeen = { artisanAuth: "", calls: [], appts: [], apptPatch: [] }
// Base qui refuse le statut « rdv_confirme » (contrainte CHECK) : le relais doit retomber sur « rdv_pris ».
let rejectRdv = false
const ARTISAN_ROW = { id: ARTISAN, nom_entreprise: "Plomberie Test", entreprise_cp_ville: "69001 Lyon", entreprise_metier: "Plombier", message_accueil: "Plomberie Test, bonjour !",
  horaires: { lun: ["08:00", "18:00"], mar: ["08:00", "18:00"], mer: ["08:00", "18:00"], jeu: ["08:00", "18:00"], ven: ["08:00", "18:00"], sam: null, dim: null },
  reception_config: { v: 1, voice: "aurora", speed: 1.1, services: [{ nom: "Recherche de fuite", prix: "dès 89 €" }], faq: [{ q: "Le devis est-il gratuit ?", r: "Oui, toujours." }], prononciations: [{ mot: "Bouzerda", dit: "Bou-zèr-da" }] } }
// Lecture de la fiche : délai simulé (ms) et config « Ma réceptionniste » de remplacement pour un scénario.
let sbDelay = 0, receptionOverride = null
const supa = http.createServer((req, res) => {
  let b = ""; req.on("data", c => b += c); req.on("end", () => {
    res.setHeader("Content-Type", "application/json")
    if (req.url.startsWith("/rest/v1/artisans")) {
      sbSeen.artisanAuth = req.headers.authorization || ""
      const row = receptionOverride ? { ...ARTISAN_ROW, reception_config: receptionOverride } : ARTISAN_ROW
      setTimeout(() => res.end(JSON.stringify([row])), sbDelay)
      return
    }
    if (req.url.startsWith("/rest/v1/calls") && (req.method === "POST" || req.method === "PATCH")) {
      const row = JSON.parse(b || "{}")
      if (rejectRdv && row.statut === "rdv_confirme") { res.statusCode = 400; res.end(JSON.stringify({ code: "23514", message: "violates check constraint" })); return }
      sbSeen.calls.push(row); res.end(JSON.stringify([{ id: 77 }])); return
    }
    if (req.url.startsWith("/rest/v1/appointments") && req.method === "POST") { sbSeen.appts.push(JSON.parse(b || "{}")); res.end(JSON.stringify([{ id: "appt-1" }])); return }
    if (req.url.startsWith("/rest/v1/appointments") && req.method === "PATCH") { sbSeen.apptPatch.push({ url: req.url, body: JSON.parse(b || "{}") }); res.end(JSON.stringify([{ id: "appt-1" }])); return }
    res.end("[]")
  })
}).listen(18903)

const bridge = spawn("node", ["build/server.mjs"], { env: { PATH: process.env.PATH, PORT: "18900", BRIDGE_SECRET: SECRET, XAI_API_KEY: "fake-key", XAI_REALTIME_URL: "ws://127.0.0.1:18901", APP_URL: "http://127.0.0.1:18902", SUPABASE_URL: "http://127.0.0.1:18903", SUPABASE_SERVICE_ROLE_KEY: "fake-service-role", APP_TIMEOUT_MS: "1500" }, stdio: ["ignore", "pipe", "pipe"] })
let logs = ""; bridge.stdout.on("data", d => logs += d); bridge.stderr.on("data", d => logs += d)
await wait(600)

const health = await fetch("http://127.0.0.1:18900/health").then(r => r.text()).catch(() => "")
check("GET /health", health === "ok")

async function fakeCall(token, sid = CALL, settle = 400) {
  const got = { media: 0 }
  const tw = new WebSocket("ws://127.0.0.1:18900/twilio")
  await new Promise(r => tw.on("open", r))
  tw.on("message", raw => { const m = JSON.parse(raw.toString()); if (m.event === "media") got.media++ })
  const exp = Math.floor(Date.now() / 1000) + 120
  tw.send(JSON.stringify({ event: "connected", protocol: "Call", version: "1.0.0" }))
  tw.send(JSON.stringify({ event: "start", streamSid: "MZ1", start: { streamSid: "MZ1", callSid: sid, tracks: ["inbound"], mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 }, customParameters: { artisan_id: ARTISAN, call_sid: sid, from: "+33612345678", exp: String(exp), token: token(exp, sid) } } }))
  await wait(500)
  for (let i = 0; i < 10; i++) { tw.send(JSON.stringify({ event: "media", streamSid: "MZ1", media: { track: "inbound", payload: Buffer.alloc(160, 0x7f).toString("base64") } })); await wait(20) }
  await wait(settle)
  tw.send(JSON.stringify({ event: "stop", streamSid: "MZ1" }))
  await wait(300)
  return got
}

const good = (exp, sid = CALL) => createHmac("sha256", SECRET).update(`${ARTISAN}.${sid}.${exp}`).digest("hex")
// 1er appel : aucune fiche en cache et lecture lente (150 ms) alors que xAI est déjà ouvert → l'accueil doit attendre la fiche.
sbDelay = 150
const g = await fakeCall(good)
sbDelay = 0
check("accueil instantané · WS xAI pré-ouvert dès la connexion Twilio", /\[call\] start CA123 artisan 11111111 \(xAI pré-ouvert\)/.test(logs))
check("accueil instantané · 1er session.update après la fiche (voix et nom de l'artisan, pas le profil par défaut)", seen.conn.updates[0] === "aurora" && seen.greeting?.startsWith("Plomberie Test"))
check("logs · voix envoyée, artisan et ms à chaque session.update", /\[session\.update\] initial voice aurora artisan 11111111 \d+ms call CA123/.test(logs) && /\[session\.updated\] voice aurora demandée aurora \d+ms/.test(logs))
check("logs · [latency] twilio start, xai open, profile, session.updated, first audio delta", ["twilio start", "xai open", "profile", "session.updated", "first audio delta"].every(t => new RegExp(`\\[latency\\] ${t} \\d+ms call`).test(logs)))
check("session xAI en audio/pcmu des deux côtés", seen.session?.audio?.input?.format?.type === "audio/pcmu" && seen.session?.audio?.output?.format?.type === "audio/pcmu")
check("même prompt que l'app + contexte téléphone", /CONTEXTE TÉLÉPHONE/.test(seen.session?.instructions || "") && /\+33612345678/.test(seen.session.instructions) && seen.session.tools?.length === 3)
check("créneaux préchargés dans le prompt", /jeudi 19 novembre/.test(seen.session?.instructions || ""))
check("clé xAI envoyée côté serveur", seen.auth === "Bearer fake-key")
check("audio appelant → xAI", seen.appends >= 8)
check("audio IA → Twilio (accueil)", g.media >= 1)
check("outil get_available_slots via /api/booking", seen.toolOutput?.ok === true && api.calls.includes("/api/booking"))
check("auth serveur x-akno-bridge / x-akno-artisan", api.headers?.["x-akno-bridge"] === SECRET && api.headers?.["x-akno-artisan"] === ARTISAN)

check("update57 · config artisan chargée au début de l'appel (service_role)", sbSeen.artisanAuth === "Bearer fake-service-role")
check("update57 · voix choisie passée à xAI", seen.session?.voice === "aurora")
check("update57 · débit choisi (audio.output.speed)", seen.session?.audio?.output?.speed === 1.1 && seen.session?.audio?.output?.format?.type === "audio/pcmu")
check("update57 · prononciation (session.replace)", seen.session?.replace?.Bouzerda === "Bou-zèr-da")
check("update57 · prestations, FAQ, métier et horaires dans le prompt", /Recherche de fuite — prix indicatif : dès 89 €/.test(seen.session?.instructions || "") && /Le devis est-il gratuit/.test(seen.session.instructions) && /entreprise de plomberie/.test(seen.session.instructions) && /du lundi au vendredi de 8 h à 18 h/.test(seen.session.instructions))
check("update57 · accueil personnalisé joué (+ annonce d'enregistrement)", seen.greeting === "Plomberie Test, bonjour ! Appel enregistré.")

// ---------- Voix clonée (reception_config.voice intégrée + customVoice, contrainte SQL update57) ----------
receptionOverride = { v: 1, voice: "ara", customVoice: CUSTOM, speed: 1 }
let v = await fakeCall(good, "CA-voix-ok")
check("voix clonée · customVoice envoyée telle quelle dès le 1er session.update (malgré la fiche en cache)", seen.conn.updates[0] === CUSTOM && seen.conn.updates.every(x => x === CUSTOM) && v.media >= 1)
check("voix clonée · acceptée par xAI : aucun repli", !/\[voice\]/.test(logs))

customMode = "ignore"
v = await fakeCall(good, "CA-voix-ignore")
check("voix clonée · ignorée en silence par xAI (voix Ara appliquée) : log explicite + repli, accueil joué", seen.conn.updates[0] === CUSTOM && /\[voice\] xAI a ignoré la voix demandée 3ixfadarbuwy → appliquée ara/.test(logs) && /\[voice\] repli voix intégrée 3ixfadarbuwy → ara \(voix ignorée par xAI\)/.test(logs) && v.media >= 1)

customMode = "error"
v = await fakeCall(good, "CA-voix-erreur")
check("voix clonée · refusée par xAI (erreur session) : repli automatique sur la voix intégrée, accueil joué", seen.conn.updates[0] === CUSTOM && seen.conn.updates[1] === "ara" && seen.conn.greetedAfter === 2 && /\[xai\] error .*Unknown voice/.test(logs) && /\(erreur xAI\)/.test(logs) && v.media >= 1)
check("logs · aucun secret (clé xAI, jeton relais, clé service)", !logs.includes("fake-key") && !logs.includes(SECRET) && !logs.includes("fake-service-role"))
customMode = "ok"; receptionOverride = null

// Fiche lente alors qu'une fiche est en cache : on n'attend pas plus de ~300 ms, accueil avec le cache.
sbDelay = 900
v = await fakeCall(good, "CA-fiche-lente", 900)
sbDelay = 0
check("accueil instantané · fiche lente : accueil avec le cache après ~300 ms", /\[call\] fiche lente : accueil avec la fiche en cache/.test(logs) && seen.conn.greetedAfter === 1 && v.media >= 1)

// ---------- update60 : prise de RDV au téléphone ----------
async function bookCall(name, settle = 700, after = 0) {
  scenario = name; sc.bookOut = null; sc.saveOut = null; sc.closings = []; sc.creates = 0; seen.appends = 0
  const n0 = sbSeen.calls.length, a0 = sbSeen.appts.length, p0 = sbSeen.apptPatch.length, f0 = api.notifies.length
  await fakeCall(good, `CA-${name}`, settle)
  if (after) await wait(after) // laisse finir l'écriture de fin d'appel (transcription, durée)
  scenario = null
  const writes = sbSeen.calls.slice(n0), rows = writes.filter(r => r.statut)
  // row = dernière écriture portant un statut ; final = fiche telle qu'elle est en base après toutes les écritures.
  return { row: rows[rows.length - 1] || {}, final: Object.assign({}, ...writes), writes, appts: sbSeen.appts.length - a0, patches: sbSeen.apptPatch.slice(p0), notifies: api.notifies.slice(f0), closings: sc.closings.slice(), creates: sc.creates }
}
const linked = x => x.patches.some(p => /id=eq\.appt-1/.test(p.url) && p.body.call_id === 77)
let r = await bookCall("ok")
check("update60 · RDV réservé : outil ok + ligne Agenda créée", sc.bookOut?.ok === true && r.appts === 1)
check("update60 · RDV réservé : fiche rdv_confirme + rdv_date", r.row.statut === "rdv_confirme" && r.row.rdv_date === "2026-11-19T07:00:00.000Z" && r.row.rappel_souhaite === false)
check("update60 · RDV réservé : rendez-vous relié à l'appel (call_id)", linked(r))
check("fin d'appel · RDV créé plus tôt dans l'appel : une seule phrase de fin après save_call", r.closings.length === 1 && r.closings[0] === "C'est noté, rendez-vous confirmé jeudi à 8 h. Merci, au revoir." && r.creates === 1)
r = await bookCall("taken")
check("update60 · créneau vraiment pris : refus métier + alternatives", sc.bookOut?.ok === false && sc.bookOut.reason === "taken" && sc.bookOut.alternatives?.length === 1 && !sc.bookOut.instruction)
check("update60 · créneau pris : pas de faux RDV confirmé (à rappeler, rdv_date vide)", r.row.statut === "a_rappeler" && r.row.rdv_date === null && r.appts === 0 && r.closings.length === 0)
r = await bookCall("timeout", 2600)
await wait(4500) // la 2e tentative de réservation (lente) de cet appel se termine ici, pas pendant les scénarios suivants
check("update60 · agenda trop lent : souci technique, jamais « créneau pris »", sc.bookOut?.ok === false && sc.bookOut.reason === "technical" && /Ne dis JAMAIS que le créneau est pris/.test(sc.bookOut.instruction || "") && !sc.bookOut.alternatives?.length)
check("update60 · agenda trop lent : fiche à rappeler + note RDV non confirmé", r.row.statut === "a_rappeler" && r.row.rappel_souhaite === true && r.row.rdv_date === null && /NON confirmé \(2026-11-19 à 08:00\)/.test(r.row.notes || "") && r.appts === 0)
r = await bookCall("error")
check("update60 · panne agenda (502) : souci technique, fiche à rappeler", sc.bookOut?.reason === "technical" && r.row.statut === "a_rappeler" && r.appts === 0)
check("update60 · /api/booking réveillé au décroché (slots)", api.calls.filter(u => u === "/api/booking").length >= 5)

// ---------- Appel 44 : book_appointment (lent) et save_call dans la même réponse ----------
r = await bookCall("parallel", 900, 1100)
const tr = String(r.final.transcript || "").split("\n")
check("appel 44 · nom = celui de save_call, jamais une phrase de la transcription", r.row.nom_client === "Keryan Bouzerda" && r.final.nom_client === "Keryan Bouzerda")
check("appel 44 · adresse propre (sans l'épellation dictée), inchangée en fin d'appel", r.row.adresse === "17 allée Paul Gauguin" && r.final.adresse === "17 allée Paul Gauguin" && r.final.ville === "Annecy")
check("appel 44 · fin d'appel : seules la transcription et la durée sont réécrites", r.writes.slice(r.writes.findIndex(w => w.statut) + 1).length >= 1 && r.writes.slice(r.writes.findIndex(w => w.statut) + 1).every(w => Object.keys(w).every(k => ["transcript", "duration", "recording_url"].includes(k))))
check("appel 44 · RDV créé pendant save_call : statut rdv_confirme, rdv_date, plus de « NON confirmé »", r.row.statut === "rdv_confirme" && r.row.rdv_date === "2026-11-24T07:30:00.000Z" && !/NON confirmé/.test(r.row.notes || "") && /Rendez-vous confirmé mardi 24\/11 à 8h30\./.test(r.row.notes || "") && r.final.statut === "rdv_confirme")
check("appel 44 · appointments.call_id = id de l'appel", r.appts === 1 && linked(r))
check("appel 44 · une seule phrase de fin, exacte, sans 2e réponse du modèle", r.closings.length === 1 && r.closings[0] === "C'est noté, rendez-vous confirmé mardi à 8 h 30. Merci, au revoir." && r.creates === 0)
check("appel 44 · transcription : une ligne par tour (segments finaux), sans doublon", tr.filter(l => l.startsWith("Client:")).length === 3 && tr.includes("Client: Euh, c'est quelle voie là ?") && tr.includes("Client: Euh, pour le nom et le prénom euh, Kerian, K E R Y A N, Bouzerda.") && tr.includes("Client: 17 allée Paul Gauguin. Gauguin, c'est G A U G U I N.") && tr.filter(l => l.startsWith("Akno: C'est noté")).length === 1)
check("appel 44 · une seule notification : la fiche d'appel, avec le rendez-vous", r.notifies.length === 1 && r.notifies[0].type === "call" && r.notifies[0].client === "Keryan Bouzerda" && r.notifies[0].rdv_start === "2026-11-24T07:30:00.000Z" && r.notifies[0].motif === "Chaudière en panne" && r.notifies[0].call_id === 77)
check("logs · présence de item_id sur les transcriptions", /\[stt\] transcription appelant : item_id présent/.test(logs))

r = await bookCall("parallel-rev", 900, 1100)
const tr2 = String(r.final.transcript || "").split("\n").filter(l => l.startsWith("Client:"))
check("ordre inverse (save_call puis book_appointment) : statut rdv_confirme + RDV relié", r.row.statut === "rdv_confirme" && r.row.rdv_date === "2026-11-24T07:30:00.000Z" && linked(r) && r.closings.length === 1 && r.creates === 0)
check("nom inutilisable dans save_call : prénom + nom de book_appointment", r.row.nom_client === "Jean Test" && r.row.adresse === "1 rue Test")
check("transcription sans item_id : le tour qui s'allonge reste une seule ligne", tr2.length === 2 && tr2[0] === "Client: Oui, bonjour." && tr2[1] === "Client: Euh ouais, j'ai plus de chauffage et il commence à faire froid.")

r = await bookCall("late", 900, 1100)
check("RDV créé après la fiche d'appel : fiche recalée (rdv_confirme, rdv_date, note) et RDV relié", r.row.statut === "rdv_confirme" && r.final.statut === "rdv_confirme" && r.final.rdv_date === "2026-11-19T07:00:00.000Z" && r.final.rappel_souhaite === false && !/NON confirmé/.test(r.final.notes || "") && linked(r))
check("RDV créé après la fiche d'appel : l'artisan est prévenu du rendez-vous", r.notifies.some(n => n.type === "appointment") && r.notifies.filter(n => n.type === "call").length === 1)

r = await bookCall("noname", 700, 1100)
check("pas de nom : « Client inconnu » + téléphone de l'appelant, jamais une phrase", r.row.nom_client === "Client inconnu" && r.final.nom_client === "Client inconnu" && r.row.telephone_client === "+33612345678" && r.row.statut === "renseigne" && r.closings.length === 0 && r.creates === 1)

r = await bookCall("hangup", 20, 1300)
check("raccroché juste après save_call : c'est le bilan de l'IA qui est enregistré (nom, adresse), pas un bilan de secours", r.final.nom_client === "Paul Martin" && r.final.adresse === "3 rue des Lilas" && r.writes.filter(w => w.statut).length === 1)

// Raccroché sans save_call : bilan de secours, sans nom ni adresse devinés.
seen.appends = 0
const h0 = sbSeen.calls.length
await fakeCall(good, "CA-raccroche", 4200)
await wait(1100)
const hang = sbSeen.calls.slice(h0).filter(x => x.statut).pop() || {}
check("raccroché sans save_call : « Client inconnu », téléphone de l'appelant, aucune adresse devinée", hang.nom_client === "Client inconnu" && hang.telephone_client === "+33612345678" && hang.adresse === null && hang.statut === "a_rappeler")

// En dernier : la base refuse « rdv_confirme » → la fiche est quand même écrite, en « rdv_pris ».
rejectRdv = true
r = await bookCall("ok")
rejectRdv = false
check("base qui refuse rdv_confirme (contrainte) : repli rdv_pris, fiche écrite et RDV relié", r.row.statut === "rdv_pris" && r.row.rdv_date === "2026-11-19T07:00:00.000Z" && linked(r) && /statut rdv_confirme refusé par la base → rdv_pris/.test(logs))

const before = seen.appends
const bad = await fakeCall(() => "0".repeat(64))
check("jeton invalide refusé (aucun audio relayé)", bad.media === 0 && seen.appends === before)

bridge.kill(); xai.close(); app.close(); supa.close()
console.log(`\n${ok} OK, ${ko} KO`)
if (ko) { console.log(logs); process.exit(1) }
process.exit(0)
