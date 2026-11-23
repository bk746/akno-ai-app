/* Akno voice-bridge (update56, config par artisan update57)
   Pont temps réel : appel Twilio (Media Streams, μ-law 8 kHz) ⇄ réceptionniste xAI Grok Voice (realtime, « audio/pcmu »).
   Même prompt / mêmes outils que l'appel vocal de l'app (src/lib/voice/script.ts, importé tel quel au build).
   - prise de RDV : POST {APP_URL}/api/booking (auth serveur BRIDGE_SECRET) + ligne « appointments »
   - fiche d'appel : table « calls » (upsert par twilio_call_sid), transcription, enregistrement WAV (bucket « recordings »)
   - notifications push : POST {APP_URL}/api/notify */
import http from "node:http"
import { WebSocketServer, WebSocket } from "ws"
import { buildSessionConfig, formatSlotsHint, mergeProfile, welcomeLine, companyName, type SlotHint, type VoiceProfile } from "../../src/lib/voice/script"
import { DEFAULT_VOICE, normalizeConfig } from "../../src/lib/voice/receptionist"
import { debriefFromTranscript } from "../../src/lib/voice/callDebrief"
import { CallRecorder } from "./audio"
import { verifyToken } from "./token"

const E = process.env
const PORT = Number(E.PORT || 8080)
const XAI_URL = E.XAI_REALTIME_URL || "wss://api.x.ai/v1/realtime?model=grok-voice-latest"
const APP_URL = (E.APP_URL || "https://akno-ai-app-v2.vercel.app").replace(/\/$/, "")
const SB_URL = (E.SUPABASE_URL || "").replace(/\/$/, "")
const SB_KEY = E.SUPABASE_SERVICE_ROLE_KEY || ""
const MAX_CALL_S = Number(E.MAX_CALL_SECONDS || 900)
// Accueil : on attend la fiche de l'artisan (voix résolue, nom annoncé) avant le 1er session.update.
// Fiche en cache : attente courte, puis on salue avec le cache. Aucune fiche connue : attente plus longue,
// saluer « Akno » avec la voix par défaut serait faux.
const PROFILE_WAIT_MS = Number(E.PROFILE_WAIT_MS || 300)
const PROFILE_WAIT_COLD_MS = Number(E.PROFILE_WAIT_COLD_MS || 1500)
// Sans réponse de xAI au 1er session.update (voix personnalisée refusée…) : repli sur la voix intégrée.
const SESSION_ACK_MS = Number(E.SESSION_ACK_MS || 2500)
// WS xAI pré-ouvert dès la connexion Twilio, avant le « start » (jeton pas encore vérifié) : borné en nombre et en durée.
const PREAUTH_MS = 5000
const MAX_PREOPEN = 6
let preopenPending = 0
const VOICE_ERR = /(^|[^a-z])voice|voice[_-]?id|custom.?voice|invalid.*session|session.*invalid|unknown voice/i
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a)

type Line = { role: "user" | "assistant"; text: string }
type Json = Record<string, any>

// ---------- Supabase (REST, clé service_role, uniquement sur le serveur du relais) ----------
async function sb(path: string, init: RequestInit = {}): Promise<any> {
  if (!SB_URL || !SB_KEY) { log("[sb] non configuré, ignoré :", path); return null }
  const r = await fetch(`${SB_URL}${path}`, { ...init, headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) } })
  if (!r.ok) { log("[sb]", r.status, path, (await r.text().catch(() => "")).slice(0, 200)); return null }
  const t = await r.text()
  return t ? JSON.parse(t) : null
}

const PROFILE_CACHE_TTL_MS = 10 * 60_000
const profileCache = new Map<string, { profile: VoiceProfile; at: number }>()

function profileFromCache(artisanId: string) {
  const hit = profileCache.get(artisanId)
  if (!hit || Date.now() - hit.at > PROFILE_CACHE_TTL_MS) return null
  return hit.profile
}

function putProfileCache(artisanId: string, profile: VoiceProfile) {
  profileCache.set(artisanId, { profile, at: Date.now() })
}

async function loadProfile(artisanId: string): Promise<VoiceProfile> {
  const rows = await sb(`/rest/v1/artisans?id=eq.${artisanId}&select=*`)
  // Lecture en échec : on ne met pas un profil par défaut en cache (il servirait 10 min aux appels suivants).
  if (!Array.isArray(rows) || !rows[0]) throw new Error("fiche artisan illisible")
  const a = rows[0]
  const profile = mergeProfile({
    prenom: a.prenom || "",
    company: companyName(a.nom_entreprise, a.entreprise_nom),
    email: a.entreprise_email || a.email || "",
    phone: a.entreprise_telephone || a.telephone || "",
    address: a.entreprise_adresse || "",
    city: a.entreprise_cp_ville || "",
    tarifs: a.tarifs && typeof a.tarifs === "object" ? a.tarifs : undefined,
    telephoneUrgence: typeof a.telephone_urgence === "string" ? a.telephone_urgence : "",
    accueil: typeof a.message_accueil === "string" ? a.message_accueil.slice(0, 300) : "",
    metier: typeof a.entreprise_metier === "string" ? a.entreprise_metier.slice(0, 80) : "",
    horaires: a.horaires && typeof a.horaires === "object" ? a.horaires : undefined,
    reception: a.reception_config && typeof a.reception_config === "object" ? a.reception_config : undefined,
  })
  putProfileCache(artisanId, profile)
  return profile
}

function phoneNote(p: VoiceProfile, from: string) {
  return `\n\nCONTEXTE TÉLÉPHONE : vrai appel sur la ligne de ${p.company} (l'artisan n'a pas pu décrocher, l'appel t'a été renvoyé). Numéro de l'appelant : ${from || "masqué"}. Si ce numéro est connu, demande simplement si l'on peut le rappeler sur ce numéro au lieu de le faire dicter. Quand tout est noté et que le client a dit au revoir, conclus en une phrase courte.`
}

function twilioSession(p: VoiceProfile, slotsNote: string, from: string) {
  const session = buildSessionConfig(p, 8000, slotsNote + phoneNote(p, from)) as Json
  session.audio.input.format = { type: "audio/pcmu" }
  session.audio.output.format = { type: "audio/pcmu" }
  return session
}

// ---------- API Akno (Vercel) ----------
// update60 : 8 s par défaut (2,5 s coupait la réservation au démarrage à froid de Vercel + Cal.com) ;
// le résultat garde le statut HTTP (_status) et la nature de l'échec (_fail : timeout / network / http).
const APP_TIMEOUT_MS = Number(E.APP_TIMEOUT_MS || 8000)
async function akno(path: string, artisanId: string, body: Json, ms = APP_TIMEOUT_MS): Promise<Json> {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms), t0 = Date.now()
  try {
    const r = await fetch(`${APP_URL}${path}`, { method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json", "x-akno-bridge": E.BRIDGE_SECRET || "", "x-akno-artisan": artisanId }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => null) as Json | null
    if (!j || typeof j !== "object") return { ok: false, error: `HTTP ${r.status}`, _status: r.status, _fail: "http" }
    if (!r.ok && r.status !== 409) log("[app]", path, body.action || body.type || "", r.status, `${Date.now() - t0}ms`)
    return { ...j, _status: r.status, ...(r.ok || r.status === 409 ? {} : { _fail: "http" }) }
  } catch (e) {
    const timeout = (e as Error)?.name === "AbortError"
    log("[app]", path, body.action || body.type || "", timeout ? `timeout ${ms}ms` : `réseau ${(e as Error)?.message || e}`)
    return { ok: false, error: timeout ? "L'agenda met trop de temps à répondre." : "Agenda injoignable.", _fail: timeout ? "timeout" : "network" }
  } finally { clearTimeout(t) }
}

/** Réponse métier de /api/booking (créneau pris / demande invalide) — par opposition à une panne. */
function isBusinessRefusal(b: Json) {
  if (b.ok) return false
  if (b._fail) return false
  if (b.reason) return b.reason === "taken" || b.reason === "invalid"
  return b._status === 409
}
const TECH_BOOK = "PROBLÈME TECHNIQUE : la réservation n'a pas pu être confirmée (agenda injoignable). Ne dis JAMAIS que le créneau est pris. Dis : « Je n'arrive pas à confirmer le rendez-vous pour un souci technique. Je note votre demande pour ce créneau et l'artisan vous rappelle pour le confirmer. » Puis termine normalement ; save_call avec rdv_pris false et rappel_souhaite true."
const TECH_SLOTS = "PROBLÈME TECHNIQUE : l'agenda ne répond pas. N'invente aucun créneau. Note les disponibilités du client ; l'artisan le rappelle pour fixer le rendez-vous (rappel_souhaite true)."

const transcriptText = (lines: Line[]) => lines.map(l => `${l.role === "assistant" ? "Akno" : "Client"}: ${l.text.trim()}`).filter(l => !l.endsWith(":")).join("\n")

// ---------- Un appel ----------
function handleCall(tw: WebSocket) {
  let streamSid = "", callSid = "", artisanId = "", from = ""
  let xai: WebSocket | null = null, ready = false, closed = false, saved = false, callId: number | null = null
  let profile: VoiceProfile = mergeProfile()
  const lines: Line[] = []
  const rec = new CallRecorder()
  const startedAt = Date.now()
  let assistantBuf = "", greeting = true
  let maxTimer: NodeJS.Timeout | null = null
  // update60 : rendez-vous réellement créé pendant l'appel (seule source de vérité pour rdv_pris / rdv_date)
  let booked: { start: string; appointmentId: string | null } | null = null
  let bookFailed: string | null = null
  let bookQueue = Promise.resolve()
  let lastBookKey = ""
  let firstAudioLogged = false
  let slotsHintText = ""
  let voiceReverted = false
  // Session xAI : le 1er session.update part quand le WS xAI est ouvert ET que la fiche (voix résolue) est là.
  let profileReady = false, sessionSent = false, slotsPending = false, lastSession = ""
  let preopened = false, preopenHeld = false
  let profileTimer: NodeJS.Timeout | null = null, ackTimer: NodeJS.Timeout | null = null
  /** Voix demandées dans les session.update pas encore acquittés (xAI répond dans l'ordre). */
  const askedVoices: string[] = []

  // Mesures [latency] : origine = connexion du flux Twilio (upgrade WS), avant même l'événement « start ».
  const since = () => `${Date.now() - startedAt}ms`
  const tag = () => (callSid ? callSid.slice(-8) : "?")
  const latency = (name: string) => log("[latency]", name, since(), "call", tag())

  const toTwilio = (m: Json) => { if (tw.readyState === WebSocket.OPEN) tw.send(JSON.stringify(m)) }
  const toXai = (m: Json) => { if (xai?.readyState === WebSocket.OPEN) xai.send(JSON.stringify(m)) }
  const releasePreopen = () => { if (preopenHeld) { preopenHeld = false; preopenPending-- } }

  async function upsertCall(fields: Json) {
    const row = { artisan_id: artisanId, twilio_call_sid: callSid, source: "ia_telephone", ...fields }
    const out = await sb(`/rest/v1/calls?on_conflict=twilio_call_sid&select=id`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(row) })
    const id = Array.isArray(out) && out[0]?.id
    if (id) callId = Number(id)
    return callId
  }

  async function saveCall(args: Json) {
    const urgent = args.urgence === "urgent" || args.type_demande === "urgence"
    let rappel = args.rappel_souhaite === true || (args.rappel_souhaite == null && args.a_rappeler === true)
    const wantDevis = args.devis_demande === true || args.type_demande === "devis"
    let type = String(args.type_demande || "").trim() || "autre"
    if (wantDevis && type === "autre") type = "devis"
    const resume = String(args.resume || "").trim() || "Appel téléphonique reçu par la réceptionniste."
    // update60 : « rdv_pris » seulement si book_appointment a vraiment créé le rendez-vous ;
    // sinon (souci technique ou RDV annoncé sans réservation) la fiche passe « à rappeler ».
    const unconfirmed = !booked && (args.rdv_pris === true || !!bookFailed)
    if (unconfirmed) rappel = true
    const noteRdv = unconfirmed ? `RDV demandé mais NON confirmé${bookFailed ? ` (${bookFailed})` : ""} — rappeler le client pour le fixer.` : ""
    const row = {
      nom_client: String(args.nom_client || "").trim() || "Appel téléphonique",
      telephone_client: String(args.telephone_client || "").trim() || from || null,
      motif: String(args.motif || "").trim() || args.type_demande || "Appel",
      besoin_detail: String(args.besoin_detail || "").trim() || null,
      resume,
      code_postal: String(args.code_postal || "").trim() || null,
      ville: String(args.ville || "").trim() || null,
      adresse: String(args.adresse || "").trim() || null,
      type_demande: type,
      urgence: urgent ? "urgent" : "normal",
      email_client: String(args.email_client || "").trim() || null,
      statut: rappel ? "a_rappeler" : booked ? "rdv_pris" : "renseigne",
      rdv_date: booked?.start || null,
      notes: [String(args.notes || "").trim(), noteRdv].filter(Boolean).join(" — ") || null,
      rappel_souhaite: rappel,
      rappel_creneau: rappel ? (String(args.rappel_creneau || "").trim() || null) : null,
      transcript: transcriptText(lines) || null,
      duration: Math.round((Date.now() - startedAt) / 1000),
    }
    const id = await upsertCall(row)
    saved = true
    // Relie le rendez-vous créé à la fiche d'appel (Agenda ⇄ Réception).
    if (id && booked?.appointmentId) void sb(`/rest/v1/appointments?id=eq.${booked.appointmentId}`, { method: "PATCH", body: JSON.stringify({ call_id: id }) })
    void akno("/api/notify", artisanId, { type: "call", client: row.nom_client, motif: row.motif, resume, besoin_detail: row.besoin_detail, call_id: id, rappel_souhaite: rappel, rappel_creneau: row.rappel_creneau, urgent })
    return { ok: true, call_id: id, message: wantDevis ? "Appel enregistré. Demande de devis notée — à générer depuis la fiche client." : "Appel enregistré dans Réception." }
  }

  const bookSlotKey = (a: Json) => `${String(a.date || "").trim()}|${String(a.heure || "").trim().toLowerCase().replace("h", ":")}`

  async function book(args: Json) {
    const run = async () => {
      const key = bookSlotKey(args)
      if (booked && lastBookKey === key) {
        return { ok: true, appointment_id: booked.appointmentId, confirmation: `Rendez-vous confirmé pour ${[args.prenom, args.nom].filter(Boolean).join(" ") || args.client || "le client"}.` }
      }
      const client = [args.prenom, args.nom].map(x => String(x || "").trim()).filter(Boolean).join(" ") || String(args.client || "").trim() || "Client"
      const t0 = Date.now()
      let b = await akno("/api/booking", artisanId, { action: "book", ...args, client })
      const slot = [args.date, args.heure].filter(Boolean).join(" à ")
      if (!b.ok && (b._fail === "timeout" || b._fail === "network")) {
        b = await akno("/api/booking", artisanId, { action: "book", ...args, client }, Math.max(APP_TIMEOUT_MS, 12000))
      }
      log("[book]", b.ok ? "ok" : `refus ${b.reason || b._fail || b._status}`, `${Date.now() - t0}ms`)
      if (!b.ok) {
        if (isBusinessRefusal(b)) return { ok: false, reason: b.reason || "taken", error: b.error || "Créneau indisponible.", alternatives: b.alternatives || [] }
        bookFailed = slot || "créneau demandé"
        return { ok: false, reason: "technical", error: "Souci technique : réservation non confirmée.", instruction: TECH_BOOK, alternatives: [] }
      }
    const minutes = Math.max(30, Number(args.duree_minutes) || 60)
    const start = b.start || new Date().toISOString()
    const row = {
      artisan_id: artisanId, title: String(args.objet || "").trim() || "Rendez-vous", client,
      telephone_client: String(args.telephone || "").trim() || from || null, email_client: String(args.email || "").trim() || null,
      start, end: b.end || new Date(new Date(start).getTime() + minutes * 60_000).toISOString(),
      adresse: String(args.adresse || "").trim() || null, ville: String(args.ville || "").trim() || null,
      notes: [String(args.notes || "").trim(), b.cal_uid ? `cal:${b.cal_uid}` : ""].filter(Boolean).join(" ") || null,
    }
    // /api/booking réserve (Cal.com ou agenda interne) ; la ligne de l'Agenda Akno est ajoutée ici, comme le fait l'app.
    const exists = !!b.appointment_id
    const ins = exists ? null : await sb(`/rest/v1/appointments?select=id`, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) })
    const appointmentId = b.appointment_id || (Array.isArray(ins) ? ins[0]?.id : null)
    // Agenda interne : sans ligne « appointments », rien n'est réservé → souci technique, pas de faux « confirmé ».
    if (!appointmentId && !b.cal_uid) {
      bookFailed = slot || "créneau demandé"
      return { ok: false, reason: "technical", error: "Souci technique : réservation non enregistrée.", instruction: TECH_BOOK, alternatives: [] }
    }
      booked = { start, appointmentId: appointmentId || null }
      lastBookKey = key
      bookFailed = null
      void akno("/api/notify", artisanId, { type: "appointment", client, when: [args.date, args.heure].filter(Boolean).join(" à ") || b.label || "Nouveau rendez-vous", appointment_id: appointmentId })
      return { ok: true, appointment_id: appointmentId, confirmation: b.confirmation || `Rendez-vous confirmé pour ${client}.` }
    }
    const p = bookQueue.then(run, run)
    bookQueue = p.catch(() => undefined)
    return p
  }

  async function handleTool(ev: Json) {
    let result: unknown = { ok: false, error: "Outil inconnu." }
    try {
      const args = ev.arguments ? JSON.parse(ev.arguments) : {}
      if (ev.name === "get_available_slots") {
        const b = await akno("/api/booking", artisanId, { action: "slots", ...args })
        result = b.ok ? { ok: true, slots: b.slots || [], timezone: b.timezone } : { ok: false, reason: "technical", slots: [], error: b.error || "Agenda injoignable.", instruction: TECH_SLOTS }
      }
      else if (ev.name === "book_appointment") result = await book(args)
      else if (ev.name === "save_call") result = await saveCall(args)
    } catch (e) { log("[tool]", ev.name, e); result = { ok: false, error: "Erreur pendant l'opération." } }
    toXai({ type: "conversation.item.create", item: { type: "function_call_output", call_id: ev.call_id, output: JSON.stringify(result) } })
    toXai({ type: "response.create" })
  }

  const withBuiltinVoice = (p: VoiceProfile): VoiceProfile => ({ ...p, reception: { ...normalizeConfig(p.reception), voice: DEFAULT_VOICE } })
  /** Fiche relue : garde le repli si xAI a déjà refusé la voix pendant cet appel. */
  const applyProfile = (p: VoiceProfile) => { profile = voiceReverted ? withBuiltinVoice(p) : p }

  /** Envoie la session courante à xAI et logue la voix réellement envoyée (jamais de clé ni de prompt). */
  const sendSession = (why: string) => {
    if (closed || !xai || xai.readyState !== WebSocket.OPEN) return false
    const session = twilioSession(profile, slotsHintText, from)
    const body = JSON.stringify(session)
    if (body === lastSession) return true
    lastSession = body
    const voice = String(session.voice || "")
    askedVoices.push(voice)
    toXai({ type: "session.update", session })
    log("[session.update]", why, "voice", voice, "artisan", artisanId.slice(0, 8), since(), "call", tag())
    return true
  }

  /** Repli sur la voix intégrée par défaut (une seule fois par appel). true = le profil vient de changer. */
  const fallbackBuiltinVoice = (why: string) => {
    if (voiceReverted) return false
    const cur = normalizeConfig(profile.reception).voice
    if (cur === DEFAULT_VOICE) return false
    voiceReverted = true
    log("[voice] repli voix intégrée", cur, "→", DEFAULT_VOICE, `(${why})`, "artisan", artisanId.slice(0, 8), since(), "call", tag())
    profile = withBuiltinVoice(profile)
    return true
  }

  /** 1er session.update : seulement quand le WS xAI est ouvert et la fiche chargée (ou son délai écoulé). */
  const startSession = () => {
    if (sessionSent || !profileReady || !artisanId) return
    if (!sendSession("initial")) return
    sessionSent = true
    ackTimer = setTimeout(() => {
      if (ready || closed) return
      log("[xai] pas de session.updated après", `${SESSION_ACK_MS}ms`, "call", tag())
      askedVoices.length = 0
      if (fallbackBuiltinVoice("xAI ne répond pas")) sendSession("repli")
    }, SESSION_ACK_MS)
  }

  /** Mise à jour de session en cours d'appel. urgent = à appliquer avant l'accueil (voix, nom annoncé) ;
      sinon elle part juste après l'accueil, pour ne pas le retarder. */
  const patchSession = (why: string, urgent = false) => {
    if (!sessionSent) return // le 1er session.update emportera l'état courant
    if (!ready && !urgent) { slotsPending = true; return }
    sendSession(why)
  }

  function onXai(raw: WebSocket.RawData) {
    let ev: Json
    try { ev = JSON.parse(raw.toString()) } catch { return }
    const type = String(ev.type || "")
    if (type === "session.updated") {
      const asked = askedVoices.shift() || ""
      const applied = String(ev.session?.voice || "").toLowerCase()
      log("[session.updated] voice", applied || "?", "demandée", asked || "?", since(), "call", tag())
      if (asked && applied && applied !== asked.toLowerCase()) {
        // xAI ne renvoie pas d'erreur pour une voix inconnue de l'équipe : il applique sa voix par défaut en silence.
        log("[voice] xAI a ignoré la voix demandée", asked, "→ appliquée", applied, "(voix absente de l'équipe de cette clé API ?)", "call", tag())
        if (fallbackBuiltinVoice("voix ignorée par xAI") && applied !== DEFAULT_VOICE) sendSession("repli")
      }
      if (ready) return
      ready = true
      if (ackTimer) clearTimeout(ackTimer)
      latency("session.updated")
      toXai({ type: "conversation.item.create", item: { type: "force_message", role: "assistant", interruptible: false, content: [{ type: "output_text", text: welcomeLine(profile) }] } })
      if (slotsPending) { slotsPending = false; sendSession("créneaux") }
      return
    }
    if (type === "response.output_audio.delta" || type === "response.audio.delta") {
      // μ-law 8 kHz brut (session audio/pcmu) : renvoyé tel quel à Twilio — pas de pcmToUlaw ni resample (double conversion = voix métallique).
      const d = String(ev.delta || ev.audio || "")
      if (d && streamSid) {
        if (!firstAudioLogged) { firstAudioLogged = true; latency("first audio delta") }
        rec.addOutbound(d)
        toTwilio({ event: "media", streamSid, media: { payload: d } })
      }
      return
    }
    if (type === "input_audio_buffer.speech_started" && !greeting) {
      // L'appelant coupe la parole : on vide ce qui reste à jouer chez Twilio.
      if (streamSid) toTwilio({ event: "clear", streamSid })
      rec.clearOutbound()
      return
    }
    if (type === "conversation.item.input_audio_transcription.completed") {
      const t = String(ev.transcript || "").trim()
      if (t) lines.push({ role: "user", text: t })
      return
    }
    if (type === "response.output_audio_transcript.delta") { assistantBuf += String(ev.delta || ""); return }
    if (type === "response.output_audio_transcript.done") {
      const t = String(ev.transcript || assistantBuf).trim()
      assistantBuf = ""
      if (t) lines.push({ role: "assistant", text: t })
      return
    }
    if (type === "response.done" || type === "response.output_audio.done") { greeting = false; return }
    if (type === "response.function_call_arguments.done") { void handleTool(ev); return }
    if (type === "error") {
      // Message d'erreur xAI tronqué : jamais la clé ni le prompt.
      const snippet = JSON.stringify(ev.error || ev).slice(0, 300)
      log("[xai] error", snippet, since(), "call", tag())
      // Avant l'accueil, une erreur bloque le décroché : on retente avec la voix intégrée. Ensuite, seulement si l'erreur parle de la voix.
      if ((!ready || VOICE_ERR.test(snippet)) && !voiceReverted && normalizeConfig(profile.reception).voice !== DEFAULT_VOICE) {
        askedVoices.length = 0
        if (fallbackBuiltinVoice("erreur xAI")) sendSession("repli")
      }
    }
  }

  /** Ouvre le WS xAI. Appelé dès la connexion Twilio (avant « start ») pour gagner le temps de connexion. */
  function openXai() {
    if (xai || closed) return
    const ws = new WebSocket(XAI_URL, { headers: { Authorization: `Bearer ${E.XAI_API_KEY || ""}` } })
    xai = ws
    ws.on("open", () => { latency("xai open"); startSession() })
    ws.on("message", onXai)
    ws.on("close", (c) => { log("[xai] close", c, "call", tag()); if (!closed) tw.close() })
    ws.on("error", e => log("[xai] ws error", e.message, "call", tag()))
  }

  async function start(params: Json) {
    if (!verifyToken(E.BRIDGE_SECRET || "", params)) { log("[call] jeton invalide, raccroche"); tw.close(); return }
    artisanId = params.artisan_id; from = params.from || ""
    clearTimeout(preAuthTimer); releasePreopen()
    latency("twilio start")
    log("[call] start", callSid, "artisan", artisanId.slice(0, 8), preopened ? "(xAI pré-ouvert)" : "")

    const cached = profileFromCache(artisanId)
    if (cached) profile = cached
    slotsHintText = ""
    const profileDone = () => { if (profileReady) return; profileReady = true; if (profileTimer) clearTimeout(profileTimer); startSession() }
    profileTimer = setTimeout(() => {
      if (profileReady || closed) return
      log("[call] fiche lente : accueil avec", cached ? "la fiche en cache" : "le profil par défaut", since(), "call", tag())
      profileDone()
    }, cached ? PROFILE_WAIT_MS : PROFILE_WAIT_COLD_MS)
    void loadProfile(artisanId).then(p => {
      applyProfile(p)
      latency("profile")
      if (profileReady) patchSession("fiche", true)
      else profileDone()
    }).catch(e => { log("[call] profile", (e as Error)?.message || e, "call", tag()); profileDone() })
    void akno("/api/booking", artisanId, { action: "slots" }).then(b => {
      const slots = (Array.isArray(b.slots) ? b.slots : []) as SlotHint[]
      slotsHintText = formatSlotsHint(slots)
      patchSession("créneaux")
    }).catch(() => { /* warm agenda en arrière-plan */ })

    if (closed) return
    openXai()
    maxTimer = setTimeout(() => { log("[call] durée max atteinte"); tw.close() }, MAX_CALL_S * 1000)
  }

  // Pré-ouverture : la connexion xAI (~350 ms) démarre avant le « start » Twilio. Le session.update, lui, attend le jeton vérifié.
  if (preopenPending < MAX_PREOPEN) { preopenPending++; preopenHeld = true; preopened = true; openXai() }
  const preAuthTimer = setTimeout(() => {
    if (artisanId || closed) return
    log("[call] aucun start Twilio valide, fermeture")
    tw.close()
  }, PREAUTH_MS)

  async function finish() {
    if (closed) return
    closed = true
    clearTimeout(preAuthTimer); releasePreopen()
    if (maxTimer) clearTimeout(maxTimer)
    if (profileTimer) clearTimeout(profileTimer)
    if (ackTimer) clearTimeout(ackTimer)
    try { xai?.close() } catch { /* */ }
    if (!artisanId || !callSid) return
    const duration = Math.round((Date.now() - startedAt) / 1000)
    try {
      await new Promise(r => setTimeout(r, 750))
      const inferred = debriefFromTranscript(lines, from, booked)
      if (!saved && duration > 4) {
        await saveCall({ ...inferred, rdv_pris: !!booked, rappel_souhaite: !booked, type_demande: inferred.type_demande, urgence: "normal" })
      } else if (saved) {
        const patch: Json = { transcript: transcriptText(lines) || null, duration }
        if (inferred.nom_client && inferred.nom_client !== "Appel téléphonique") patch.nom_client = inferred.nom_client
        if (inferred.resume && lines.length > 2) patch.resume = inferred.resume
        if (inferred.telephone_client) patch.telephone_client = inferred.telephone_client
        if (inferred.email_client) patch.email_client = inferred.email_client
        if (inferred.adresse) patch.adresse = inferred.adresse
        if (inferred.motif) patch.motif = inferred.motif
        if (booked?.start) patch.rdv_date = booked.start
        await upsertCall(patch)
      }
      if (callId && rec.seconds > 1 && SB_URL && SB_KEY) {
        const path = `${artisanId}/${callId}.wav`
        const r = await fetch(`${SB_URL}/storage/v1/object/recordings/${path}`, { method: "POST", headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "audio/wav", "x-upsert": "true" }, body: new Uint8Array(rec.toWav()) })
        if (r.ok) await sb(`/rest/v1/calls?id=eq.${callId}`, { method: "PATCH", body: JSON.stringify({ recording_url: path }) })
        else log("[rec] upload", r.status)
      }
    } catch (e) { log("[call] finish", e) }
    log("[call] end", callSid, `${duration}s`, `${lines.length} répliques`)
  }

  tw.on("message", (raw) => {
    let m: Json
    try { m = JSON.parse(raw.toString()) } catch { return }
    if (m.event === "start") {
      streamSid = m.start?.streamSid || m.streamSid || ""
      callSid = m.start?.callSid || ""
      const params = { ...(m.start?.customParameters || {}) }
      if (params.call_sid && callSid && params.call_sid !== callSid) { tw.close(); return }
      void start(params).catch(e => { log("[call] start", e); tw.close() })
    } else if (m.event === "media" && m.media?.payload) {
      // Appelant → xAI : payload base64 μ-law Twilio inchangé (ulawToPcm seulement pour l'enregistrement WAV).
      rec.addInbound(m.media.payload)
      if (ready) toXai({ type: "input_audio_buffer.append", audio: m.media.payload })
    } else if (m.event === "stop") {
      tw.close()
    }
  })
  tw.on("close", () => { void finish() })
  tw.on("error", e => log("[twilio] ws error", e.message))
}

// ---------- Serveur ----------
const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") { res.writeHead(200, { "Content-Type": "text/plain" }); res.end("ok"); return }
  res.writeHead(404); res.end()
})
const wss = new WebSocketServer({ noServer: true })
server.on("upgrade", (req, socket, head) => {
  if (!req.url?.startsWith("/twilio")) { socket.destroy(); return }
  wss.handleUpgrade(req, socket, head, ws => handleCall(ws))
})
server.listen(PORT, () => {
  const miss = ["XAI_API_KEY", "BRIDGE_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter(k => !E[k])
  log(`[bridge] écoute sur :${PORT}${miss.length ? ` — variables manquantes : ${miss.join(", ")}` : ""}`)
  // Démarrage à froid : ouvre tout de suite la connexion Supabase (DNS + TLS), la fiche du 1er appel arrive plus vite. Lecture seule.
  if (SB_URL && SB_KEY) void sb("/rest/v1/artisans?select=id&limit=1").catch(() => null)
})
