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
const sc = { bookOut: null, saveOut: null }
const xai = new WebSocketServer({ port: 18901 })
xai.on("connection", (ws, req) => {
  seen.auth = req.headers.authorization || ""
  ws.on("message", raw => {
    const m = JSON.parse(raw.toString())
    if (m.type === "session.update") { seen.session = m.session; ws.send(JSON.stringify({ type: "session.updated" })) }
    if (m.type === "conversation.item.create" && m.item?.type === "force_message") {
      seen.greeting = m.item.content[0].text
      ws.send(JSON.stringify({ type: "response.output_audio.delta", delta: Buffer.alloc(160, 0xff).toString("base64") }))
      ws.send(JSON.stringify({ type: "response.output_audio_transcript.done", transcript: m.item.content[0].text }))
      ws.send(JSON.stringify({ type: "response.done" }))
    }
    if (m.type === "input_audio_buffer.append") {
      seen.appends++
      if (seen.appends === 5 && scenario) {
        ws.send(JSON.stringify({ type: "response.function_call_arguments.done", name: "book_appointment", call_id: "fb1", arguments: JSON.stringify({ prenom: "Jean", nom: "Test", telephone: "0612345678", email: "jean@test.fr", adresse: "1 rue Test", date: "2026-11-19", heure: "08:00", objet: "Diagnostic PAC" }) }))
      } else if (seen.appends === 5) {
        ws.send(JSON.stringify({ type: "conversation.item.input_audio_transcription.completed", transcript: "J'ai une fuite sous l'évier." }))
        ws.send(JSON.stringify({ type: "response.function_call_arguments.done", name: "get_available_slots", call_id: "fc1", arguments: "{}" }))
      }
    }
    if (m.type === "conversation.item.create" && m.item?.type === "function_call_output") {
      const out = JSON.parse(m.item.output)
      if (m.item.call_id === "fb1") {
        sc.bookOut = out
        // L'IA « annonce » un RDV pris dans tous les cas : le relais doit corriger si rien n'a été réservé.
        ws.send(JSON.stringify({ type: "response.function_call_arguments.done", name: "save_call", call_id: "fs1", arguments: JSON.stringify({ nom_client: "Jean Test", telephone_client: "0612345678", type_demande: "rdv", rdv_pris: true, resume: "Diagnostic PAC jeudi 8 h." }) }))
      } else if (m.item.call_id === "fs1") sc.saveOut = out
      else seen.toolOutput = out
    }
  })
})

// Fausse API Akno (Vercel)
const api = { headers: null, calls: [] }
const app = http.createServer((req, res) => {
  let b = ""; req.on("data", c => b += c); req.on("end", () => {
    api.calls.push(req.url); api.headers = req.headers
    res.setHeader("Content-Type", "application/json")
    let body = {}; try { body = JSON.parse(b || "{}") } catch { /* */ }
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
const ARTISAN_ROW = { id: ARTISAN, nom_entreprise: "Plomberie Test", entreprise_cp_ville: "69001 Lyon", entreprise_metier: "Plombier", message_accueil: "Plomberie Test, bonjour !",
  horaires: { lun: ["08:00", "18:00"], mar: ["08:00", "18:00"], mer: ["08:00", "18:00"], jeu: ["08:00", "18:00"], ven: ["08:00", "18:00"], sam: null, dim: null },
  reception_config: { v: 1, voice: "aurora", speed: 1.1, services: [{ nom: "Recherche de fuite", prix: "dès 89 €" }], faq: [{ q: "Le devis est-il gratuit ?", r: "Oui, toujours." }], prononciations: [{ mot: "Bouzerda", dit: "Bou-zèr-da" }] } }
const supa = http.createServer((req, res) => {
  let b = ""; req.on("data", c => b += c); req.on("end", () => {
    res.setHeader("Content-Type", "application/json")
    if (req.url.startsWith("/rest/v1/artisans")) { sbSeen.artisanAuth = req.headers.authorization || ""; res.end(JSON.stringify([ARTISAN_ROW])); return }
    if (req.url.startsWith("/rest/v1/calls") && req.method === "POST") { sbSeen.calls.push(JSON.parse(b || "{}")); res.end(JSON.stringify([{ id: 77 }])); return }
    if (req.url.startsWith("/rest/v1/appointments") && req.method === "POST") { sbSeen.appts.push(JSON.parse(b || "{}")); res.end(JSON.stringify([{ id: "appt-1" }])); return }
    if (req.url.startsWith("/rest/v1/appointments") && req.method === "PATCH") { sbSeen.apptPatch.push({ url: req.url, body: JSON.parse(b || "{}") }); res.end("[]"); return }
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
const g = await fakeCall(good)
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
check("update57 · accueil personnalisé joué (IA + RGPD ajoutés)", seen.greeting?.startsWith("Plomberie Test, bonjour ! Je suis l'assistante IA de Plomberie Test.") && /enregistré/.test(seen.greeting || ""))

// ---------- update60 : prise de RDV au téléphone ----------
async function bookCall(name, settle = 700) {
  scenario = name; sc.bookOut = null; sc.saveOut = null; seen.appends = 0
  const n0 = sbSeen.calls.length, a0 = sbSeen.appts.length, p0 = sbSeen.apptPatch.length
  await fakeCall(good, `CA-${name}`, settle)
  scenario = null
  const rows = sbSeen.calls.slice(n0).filter(r => r.statut)
  return { row: rows[rows.length - 1] || {}, appts: sbSeen.appts.length - a0, patches: sbSeen.apptPatch.slice(p0) }
}
let r = await bookCall("ok")
check("update60 · RDV réservé : outil ok + ligne Agenda créée", sc.bookOut?.ok === true && r.appts === 1)
check("update60 · RDV réservé : fiche rdv_pris + rdv_date", r.row.statut === "rdv_pris" && r.row.rdv_date === "2026-11-19T07:00:00.000Z" && r.row.rappel_souhaite === false)
check("update60 · RDV réservé : rendez-vous relié à l'appel (call_id)", r.patches.some(x => /id=eq\.appt-1/.test(x.url) && x.body.call_id === 77))
r = await bookCall("taken")
check("update60 · créneau vraiment pris : refus métier + alternatives", sc.bookOut?.ok === false && sc.bookOut.reason === "taken" && sc.bookOut.alternatives?.length === 1 && !sc.bookOut.instruction)
check("update60 · créneau pris : pas de faux rdv_pris (à rappeler, rdv_date vide)", r.row.statut === "a_rappeler" && r.row.rdv_date === null && r.appts === 0)
r = await bookCall("timeout", 2600)
check("update60 · agenda trop lent : souci technique, jamais « créneau pris »", sc.bookOut?.ok === false && sc.bookOut.reason === "technical" && /Ne dis JAMAIS que le créneau est pris/.test(sc.bookOut.instruction || "") && !sc.bookOut.alternatives?.length)
check("update60 · agenda trop lent : fiche à rappeler + note RDV non confirmé", r.row.statut === "a_rappeler" && r.row.rappel_souhaite === true && r.row.rdv_date === null && /NON confirmé \(2026-11-19 à 08:00\)/.test(r.row.notes || "") && r.appts === 0)
r = await bookCall("error")
check("update60 · panne agenda (502) : souci technique, fiche à rappeler", sc.bookOut?.reason === "technical" && r.row.statut === "a_rappeler" && r.appts === 0)
check("update60 · /api/booking réveillé au décroché (slots)", api.calls.filter(u => u === "/api/booking").length >= 5)

const before = seen.appends
const bad = await fakeCall(() => "0".repeat(64))
check("jeton invalide refusé (aucun audio relayé)", bad.media === 0 && seen.appends === before)

bridge.kill(); xai.close(); app.close(); supa.close()
console.log(`\n${ok} OK, ${ko} KO`)
if (ko) { console.log(logs); process.exit(1) }
process.exit(0)
