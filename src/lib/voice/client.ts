import { supabase } from "../supabase"
import { uploadCallRecording } from "../recordings"
import { draftDevisFromCall } from "../devisApi"
import { buildSessionConfig, formatSlotsHint, mergeProfile, welcomeLine, VOICE_ID, type SlotHint, type VoiceProfile } from "./script"
import { bookAppointment, getAvailableSlots, inferDevisRequest, saveCall, type BookArgs, type SaveArgs, type SlotsArgs } from "./tools"

export type VoiceStatus = "idle" | "connecting" | "live" | "speaking" | "listening" | "thinking" | "ending" | "error"
export type TranscriptLine = { role: "user" | "assistant"; text: string }

export type VoiceTokenResponse = {
  value?: string
  expires_at?: number
  profile?: Partial<VoiceProfile>
  slots?: SlotHint[]
  error?: string
}

const WS_URL = "wss://api.x.ai/v1/realtime?model=grok-voice-latest"
const SUPPORTED = new Set([8000, 16000, 22050, 24000, 32000, 44100, 48000])
const PREFERRED_RATE = 24000
const BARGE_MS = 600
const LOOKAHEAD = 0.08
const PREFETCH_MS = 2500
const DRAIN_MS = 30000
const END_PAD_SEC = 0.15

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise(resolve => {
    const t = setTimeout(() => resolve(fallback), ms)
    promise.then(v => { clearTimeout(t); resolve(v) }, () => { clearTimeout(t); resolve(fallback) })
  })
}

function nearestRate(n: number) {
  if (SUPPORTED.has(n)) return n
  const rates = [...SUPPORTED]
  return rates.reduce((a, b) => Math.abs(b - n) < Math.abs(a - n) ? b : a)
}

function floatToBase64Pcm16(f32: Float32Array) {
  const pcm = new Int16Array(f32.length)
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]))
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  const bytes = new Uint8Array(pcm.buffer)
  let bin = ""
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

function rms(input: Float32Array) {
  let sum = 0
  for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
  return Math.sqrt(sum / Math.max(1, input.length))
}

function pcm16BytesToFloat(bytes: Uint8Array) {
  if (!bytes.byteLength) return new Float32Array(0)
  const copy = bytes.byteLength === bytes.buffer.byteLength && bytes.byteOffset === 0
    ? bytes
    : bytes.slice()
  const pcm = new Int16Array(copy.buffer, copy.byteOffset, copy.byteLength / 2)
  const out = new Float32Array(pcm.length)
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 32768
  return out
}

/** Décode le PCM16 base64 en conservant un octet impair d'un chunk à l'autre. */
class Pcm16Decoder {
  private rest = new Uint8Array(0)
  push(b64: string) {
    const raw = atob(b64)
    const incoming = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) incoming[i] = raw.charCodeAt(i)
    const merged = new Uint8Array(this.rest.length + incoming.length)
    merged.set(this.rest, 0)
    merged.set(incoming, this.rest.length)
    const even = merged.byteLength & ~1
    this.rest = even < merged.byteLength ? merged.slice(even) : new Uint8Array(0)
    return pcm16BytesToFloat(merged.subarray(0, even))
  }
  flush() {
    if (!this.rest.length) return new Float32Array(0)
    const padded = new Uint8Array(2)
    padded[0] = this.rest[0]
    this.rest = new Uint8Array(0)
    return pcm16BytesToFloat(padded)
  }
}

class PcmPlayer {
  private ctx: AudioContext
  private next = 0
  private sources: AudioBufferSourceNode[] = []
  readonly output: GainNode
  constructor(ctx: AudioContext) {
    this.ctx = ctx
    this.output = ctx.createGain()
    this.output.connect(ctx.destination)
  }
  get buffered() { return Math.max(0, this.next - this.ctx.currentTime) }
  enqueue(samples: Float32Array, rate: number) {
    if (!samples.length) return
    if (this.ctx.state === "suspended") void this.ctx.resume()
    const copy = samples.slice()
    const buf = this.ctx.createBuffer(1, copy.length, rate)
    buf.getChannelData(0).set(copy)
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.connect(this.output)
    const now = this.ctx.currentTime
    if (this.next < now + 0.02) this.next = now + LOOKAHEAD
    src.start(this.next)
    this.next += buf.duration
    this.sources.push(src)
    src.onended = () => { this.sources = this.sources.filter(s => s !== src) }
  }
  padSilence(seconds: number, rate: number) {
    const n = Math.max(0, Math.round(seconds * rate))
    if (!n) return
    this.enqueue(new Float32Array(n), rate)
  }
  stop() {
    // Uniquement barge-in / raccrochage : ne jamais appeler sur response.done.
    for (const src of this.sources) { try { src.stop() } catch { /* already stopped */ } }
    this.sources = []
    this.next = 0
  }
  waitIdle(maxMs = DRAIN_MS) {
    if (this.ctx.state === "suspended") void this.ctx.resume()
    const start = Date.now()
    let quietSince: number | null = null
    return new Promise<void>(resolve => {
      const tick = () => {
        const quiet = this.buffered <= 0.001
        if (quiet) {
          if (quietSince == null) quietSince = Date.now()
          if (Date.now() - quietSince >= 40) {
            resolve()
            return
          }
        } else {
          quietSince = null
        }
        if (Date.now() - start >= maxMs) resolve()
        else setTimeout(tick, 20)
      }
      tick()
    })
  }
}

const WORKLET = `
class AknoCapture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch && ch.length) this.port.postMessage(ch.slice())
    return true
  }
}
registerProcessor('akno-capture', AknoCapture)
`

async function connectMic(ctx: AudioContext) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: ctx.sampleRate,
    },
  })
  const source = ctx.createMediaStreamSource(stream)
  const mute = ctx.createGain()
  mute.gain.value = 0
  mute.connect(ctx.destination)
  let node: AudioNode
  let onFrame: ((f32: Float32Array) => void) | null = null
  try {
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }))
    await ctx.audioWorklet.addModule(url)
    URL.revokeObjectURL(url)
    const worklet = new AudioWorkletNode(ctx, "akno-capture")
    worklet.port.onmessage = ev => onFrame?.(ev.data)
    source.connect(worklet)
    worklet.connect(mute)
    node = worklet
  } catch {
    const proc = ctx.createScriptProcessor(4096, 1, 1)
    proc.onaudioprocess = ev => onFrame?.(new Float32Array(ev.inputBuffer.getChannelData(0)))
    source.connect(proc)
    proc.connect(mute)
    node = proc
  }
  return {
    stream,
    source,
    setHandler(fn: ((f32: Float32Array) => void) | null) { onFrame = fn },
    stop() {
      onFrame = null
      try { source.disconnect(); node.disconnect(); mute.disconnect() } catch { /* */ }
      stream.getTracks().forEach(t => t.stop())
    },
  }
}

function isIosClient() {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent || ""
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
}

function pickRecorderMime() {
  const types = isIosClient()
    ? ["audio/mp4", "audio/mp4;codecs=mp4a.40.2", "audio/aac", "audio/webm;codecs=opus", "audio/webm"]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]
  for (const t of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t
  }
  return ""
}

function startMixerRecorder(ctx: AudioContext, micSource: MediaStreamAudioSourceNode, agentOut: AudioNode) {
  const mix = ctx.createMediaStreamDestination()
  const recBus = ctx.createGain()
  recBus.gain.value = 1
  try { micSource.connect(recBus) } catch { /* */ }
  try { agentOut.connect(recBus) } catch { /* */ }
  recBus.connect(mix)
  const keepAlive = new Audio()
  keepAlive.muted = true
  keepAlive.setAttribute("playsinline", "")
  keepAlive.autoplay = true
  try { keepAlive.srcObject = mix.stream } catch { /* */ }
  void keepAlive.play().catch(() => { /* Safari keep-alive */ })
  const chunks: Blob[] = []
  let rec: MediaRecorder | null = null
  try {
    const mime = pickRecorderMime()
    rec = mime ? new MediaRecorder(mix.stream, { mimeType: mime }) : new MediaRecorder(mix.stream)
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data) }
    rec.start(1000)
  } catch {
    rec = null
  }
  return {
    stop(): Promise<Blob | null> {
      return new Promise(resolve => {
        const finish = (blob: Blob | null) => {
          try { keepAlive.pause(); keepAlive.srcObject = null } catch { /* */ }
          resolve(blob)
        }
        if (!rec || rec.state === "inactive") {
          finish(chunks.length ? new Blob(chunks, { type: rec?.mimeType || (isIosClient() ? "audio/mp4" : "audio/webm") }) : null)
          return
        }
        rec.onstop = () => finish(chunks.length ? new Blob(chunks, { type: rec?.mimeType || (isIosClient() ? "audio/mp4" : "audio/webm") }) : null)
        try { rec.stop() } catch { finish(null) }
      })
    },
  }
}

export async function fetchVoiceToken(): Promise<VoiceTokenResponse> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error("Connecte-toi pour appeler la réceptionniste.")
  const r = await fetch("/api/voice-token", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  const body = await r.json().catch(() => ({})) as VoiceTokenResponse
  if (!r.ok || !body.value) {
    throw new Error(body.error || "Impossible de démarrer l'appel.")
  }
  return body
}

export async function startVoiceSession(opts: {
  token: string
  profile: VoiceProfile
  slots?: SlotHint[]
  onStatus: (s: VoiceStatus) => void
  onTranscript: (lines: TranscriptLine[]) => void
  onNotice?: (msg: string) => void
}) {
  const profile = mergeProfile(opts.profile)
  const startedAt = Date.now()
  const evRing: { ms: number; dir: "in" | "out"; type: string; extra?: string }[] = []
  const logVoice = (dir: "in" | "out", type: string, extra?: unknown) => {
    const rec = {
      ms: Date.now() - startedAt,
      dir,
      type,
      extra: extra === undefined ? undefined : String(typeof extra === "string" ? extra : JSON.stringify(extra)).slice(0, 220),
    }
    evRing.push(rec)
    if (evRing.length > 100) evRing.shift()
    console.debug("[akno-voice]", rec.dir, `${rec.ms}ms`, rec.type, rec.extra || "")
  }
  const lines: TranscriptLine[] = []
  let assistantBuf = ""
  let saved = false
  let savedCallId: string | number | undefined
  let savedDevisId: string | undefined
  let lastSaveMessage = ""
  let ready = false
  let closed = false
  let pendingTools = 0
  let newUserTurn = false
  let newAssistantTurn = false
  let bargeTimer: ReturnType<typeof setTimeout> | null = null
  let bargeSince: number | null = null
  let bargeArmed = false
  let echoTailUntil = 0
  let greetingActive = false
  let greetingFinishing = false
  let greetWatchdog: ReturnType<typeof setTimeout> | null = null
  let lastAudioAt = 0
  let playbackFinalized = false
  const decoder = new Pcm16Decoder()

  const slotsPromise = (async (): Promise<SlotHint[]> => {
    const existing = Array.isArray(opts.slots) ? opts.slots.filter(slot => slot && (slot.label || (slot.date && slot.heure))) : []
    if (existing.length) return existing
    try {
      const body = await withTimeout(getAvailableSlots({}), PREFETCH_MS, { slots: [] as SlotHint[] })
      const raw = (body as { slots?: unknown }).slots
      return Array.isArray(raw) ? raw as SlotHint[] : []
    } catch {
      return []
    }
  })()

  const ctx = new AudioContext({ sampleRate: PREFERRED_RATE })
  if (ctx.state === "suspended") await ctx.resume()
  const sampleRate = nearestRate(ctx.sampleRate)
  const player = new PcmPlayer(ctx)
  const mic = await connectMic(ctx)
  const recorder = startMixerRecorder(ctx, mic.source, player.output)
  const prefetched = await slotsPromise
  const slotsHint = formatSlotsHint(prefetched)
  logVoice("out", "slots.prefetch", { n: prefetched.length, hint: slotsHint ? "yes" : "no" })
  const session = buildSessionConfig(profile, sampleRate, slotsHint)
  const simpleSession = {
    voice: VOICE_ID,
    instructions: session.instructions,
    turn_detection: { type: "server_vad" as const, idle_timeout_ms: 8000 },
    tools: session.tools,
    audio: {
      input: { format: { type: "audio/pcm", rate: sampleRate }, transcription: { language_hint: "fr" } },
      output: { format: { type: "audio/pcm", rate: sampleRate }, speed: 1.2 },
    },
  }
  let usedSimple = false
  let greeted = false

  const push = (role: TranscriptLine["role"], text: string, replaceSame = false) => {
    const t = text.trim()
    if (!t) return
    const last = lines[lines.length - 1]
    const fresh = role === "user" ? newUserTurn : newAssistantTurn
    if (last && last.role === role && (replaceSame || !fresh)) last.text = t
    else lines.push({ role, text: t })
    if (role === "user") newUserTurn = false
    else newAssistantTurn = false
    opts.onTranscript([...lines])
  }

  const ws = new WebSocket(WS_URL, [`xai-client-secret.${opts.token}`])

  const send = (obj: unknown) => {
    if (ws.readyState !== WebSocket.OPEN) return
    const type = String((obj as { type?: string }).type || "unknown")
    if (type !== "input_audio_buffer.append") logVoice("out", type)
    ws.send(JSON.stringify(obj))
  }

  const resetBarge = () => {
    bargeArmed = false
    bargeSince = null
    if (bargeTimer) { clearTimeout(bargeTimer); bargeTimer = null }
  }

  const interruptPlayback = () => {
    player.stop()
    assistantBuf = ""
    newUserTurn = true
    if (bargeTimer) { clearTimeout(bargeTimer); bargeTimer = null }
    opts.onStatus("listening")
  }

  const confirmBargeIn = () => {
    if (closed || greetingActive || player.buffered <= 0.05) return
    bargeArmed = true
    bargeSince = null
    interruptPlayback()
    send({ type: "response.cancel" })
  }

  const flushMic = (f32: Float32Array) => {
    if (!ready || greetingActive || closed || ws.readyState !== WebSocket.OPEN) return
    const playing = player.buffered > 0.08
    if (playing) echoTailUntil = Date.now() + 220
    const hold = playing || Date.now() < echoTailUntil
    if (hold && !bargeArmed) {
      // Mute uplink while she speaks so her own voice cannot trigger server barge-in.
      if (rms(f32) > 0.02) {
        if (bargeSince == null) bargeSince = Date.now()
        else if (Date.now() - bargeSince >= BARGE_MS) {
          bargeArmed = true
          confirmBargeIn()
          send({ type: "input_audio_buffer.append", audio: floatToBase64Pcm16(f32) })
          return
        }
      } else {
        bargeSince = null
      }
      return
    }
    if (!hold) resetBarge()
    send({ type: "input_audio_buffer.append", audio: floatToBase64Pcm16(f32) })
  }

  const finalizePlayback = () => {
    const leftover = decoder.flush()
    if (leftover.length) player.enqueue(leftover, sampleRate)
    if (!playbackFinalized) {
      playbackFinalized = true
      player.padSilence(END_PAD_SEC, sampleRate)
    }
  }

  const settleLive = async () => {
    await player.waitIdle(DRAIN_MS)
    if (!closed && !pendingTools && !greetingActive) opts.onStatus("live")
  }

  const finishGreeting = async (reason: string) => {
    if (!greetingActive || greetingFinishing || closed) return
    greetingFinishing = true
    if (greetWatchdog) { clearTimeout(greetWatchdog); greetWatchdog = null }
    logVoice("in", "greeting.drain", { reason, buffered: Number(player.buffered.toFixed(3)) })
    // Ne jamais player.stop() ici : laisser chaque source aller jusqu'au dernier échantillon + pad.
    await player.waitIdle(DRAIN_MS)
    if (closed) return
    greetingActive = false
    greetingFinishing = false
    logVoice("in", "greeting.unlocked", reason)
    if (ctx.state === "suspended") await ctx.resume().catch(() => { /* */ })
    mic.setHandler(flushMic)
    if (!pendingTools) opts.onStatus("live")
  }

  const armGreetWatchdog = (delayMs = 20000) => {
    if (greetWatchdog) clearTimeout(greetWatchdog)
    greetWatchdog = setTimeout(() => {
      if (!greetingActive || closed) return
      // Ne pas déverrouiller tant que de l'audio arrive ou reste en file.
      if (player.buffered > 0.02 || Date.now() - lastAudioAt < 2000) {
        armGreetWatchdog(1500)
        return
      }
      finalizePlayback()
      void finishGreeting("watchdog")
    }, delayMs)
  }

  const handleTool = async (event: { name?: string; call_id?: string; arguments?: string }) => {
    pendingTools++
    opts.onStatus("thinking")
    let result: unknown = { ok: false, error: "Outil inconnu." }
    try {
      const args = event.arguments ? JSON.parse(event.arguments) : {}
      if (event.name === "get_available_slots") {
        result = await getAvailableSlots(args as SlotsArgs)
      } else if (event.name === "book_appointment") {
        result = await bookAppointment(args as BookArgs)
      } else if (event.name === "save_call") {
        result = await saveCall(args as SaveArgs, {
          transcript: lines,
          durationSec: (Date.now() - startedAt) / 1000,
          profile,
        })
        if (result && typeof result === "object" && (result as { ok?: boolean }).ok) {
          saved = true
          savedCallId = (result as { call_id?: string | number }).call_id
          if ((result as { devis_id?: string }).devis_id) savedDevisId = String((result as { devis_id?: string }).devis_id)
          lastSaveMessage = (result as { message?: string }).message || "Appel enregistré dans Réception."
          try { dispatchEvent(new Event("akno-refresh")) } catch { /* */ }
        }
      }
    } catch {
      result = { ok: false, error: "Erreur pendant l'enregistrement." }
    }
    send({
      type: "conversation.item.create",
      item: { type: "function_call_output", call_id: event.call_id, output: JSON.stringify(result) },
    })
    pendingTools = Math.max(0, pendingTools - 1)
    if (pendingTools === 0) {
      await player.waitIdle()
      if (!closed) send({ type: "response.create" })
    }
  }

  const onMessage = (raw: MessageEvent) => {
    if (typeof raw.data !== "string") return
    let event: Record<string, unknown>
    try { event = JSON.parse(raw.data) } catch { return }
    const type = String(event.type || "")
    const extra: Record<string, unknown> = {}
    if (event.error) extra.error = event.error
    if (event.transcript) extra.transcript = String(event.transcript).slice(0, 80)
    if (type.includes("delta") || type.endsWith(".audio")) extra.bytes = String(event.delta || event.audio || "").length
    const resp = event.response as { id?: string; status?: string } | undefined
    if (resp?.status) extra.status = resp.status
    if (event.item_id) extra.item_id = event.item_id
    logVoice("in", type, Object.keys(extra).length ? extra : undefined)

    if (type === "session.updated") {
      ready = true
      // Brancher le micro tout de suite : flushMic reste muet tant que greetingActive.
      // Ainsi un response.done manquant n'empêche plus jamais d'appeler.
      mic.setHandler(flushMic)
      if (greeted) return
      greeted = true
      greetingActive = true
      // Un seul accueil, déjà dans la config initiale (créneaux + tarifs). Pas de session.update ni de response.create.
      send({
        type: "conversation.item.create",
        item: {
          type: "force_message",
          role: "assistant",
          interruptible: false,
          content: [{ type: "output_text", text: welcomeLine(profile) }],
        },
      })
      opts.onStatus("speaking")
      lastAudioAt = Date.now()
      armGreetWatchdog()
      return
    }
    if (type === "input_audio_buffer.speech_started") {
      if (greetingActive) return
      if (bargeTimer) clearTimeout(bargeTimer)
      if (player.buffered <= 0.05) return
      bargeTimer = setTimeout(() => { bargeTimer = null; confirmBargeIn() }, BARGE_MS)
      return
    }
    if (type === "response.created") {
      assistantBuf = ""
      newAssistantTurn = true
      playbackFinalized = false
      return
    }
    if (type === "input_audio_buffer.speech_stopped") {
      if (bargeTimer) { clearTimeout(bargeTimer); bargeTimer = null }
      if (player.buffered > 0.05) return
      opts.onStatus("thinking")
      return
    }
    if (type === "conversation.item.input_audio_transcription.completed" || type === "conversation.item.input_audio_transcription.updated") {
      const text = String(event.transcript || event.text || "")
      if (text) push("user", text)
      return
    }
    if (type === "response.output_audio_transcript.delta") {
      assistantBuf += String(event.delta || "")
      if (assistantBuf) push("assistant", assistantBuf)
      return
    }
    if (type === "response.output_audio_transcript.done") {
      const text = String(event.transcript || assistantBuf)
      assistantBuf = ""
      if (text) push("assistant", text)
      return
    }
    if (type === "response.output_audio.delta" || type === "response.audio.delta") {
      const delta = String(event.delta || event.audio || "")
      if (delta) {
        lastAudioAt = Date.now()
        player.enqueue(decoder.push(delta), sampleRate)
        opts.onStatus("speaking")
      }
      return
    }
    if (type === "response.function_call_arguments.done") {
      void handleTool(event as { name?: string; call_id?: string; arguments?: string })
      return
    }
    if (type === "response.output_audio.done" || type === "response.audio.done" || type === "response.done") {
      // Flush du reliquat PCM16 + 150 ms de silence. Ne jamais arrêter les sources.
      finalizePlayback()
      if (greetingActive) void finishGreeting(type)
      else if (!pendingTools) void settleLive()
      return
    }
    if (type === "response.cancelled" || type === "conversation.item.truncated" || type === "output_audio_buffer.cleared") {
      // Ne pas vider le lecteur local : laisser jouer l'audio déjà en file.
      return
    }
    if (type === "error") {
      const err = event.error as { message?: string } | undefined
      const msg = err?.message || String(event.message || "Erreur de session vocale.")
      if (!ready && !usedSimple) {
        usedSimple = true
        send({ type: "session.update", session: simpleSession })
        return
      }
      if (/transcription|language_hint|keyterms|reasoning|cancel/i.test(msg)) return
      opts.onNotice?.(msg)
    }
  }

  const opened = new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("La connexion vocale a expiré.")), 15000)
    ws.onopen = () => {
      clearTimeout(t)
      send({ type: "session.update", session })
      resolve()
    }
    ws.onerror = () => {
      clearTimeout(t)
      reject(new Error("Impossible de joindre la réceptionniste."))
    }
  })

  ws.onmessage = onMessage
  ws.onclose = () => { ready = false }

  try {
    await opened
    opts.onStatus("live")
  } catch (e) {
    mic.stop()
    player.stop()
    void recorder.stop()
    void ctx.close()
    try { ws.close() } catch { /* */ }
    throw e
  }

  const stop = async (saveFallback = true) => {
    if (closed) return lastSaveMessage
    closed = true
    ready = false
    if (bargeTimer) { clearTimeout(bargeTimer); bargeTimer = null }
    if (greetWatchdog) { clearTimeout(greetWatchdog); greetWatchdog = null }
    greetingActive = false
    opts.onStatus("ending")
    mic.setHandler(null)
    player.stop()
    try { ws.close() } catch { /* */ }
    const blob = await recorder.stop()
    mic.stop()
    try { await ctx.close() } catch { /* */ }
    if (saveFallback && !saved && Date.now() - startedAt > 4000) {
      const summary = lines.length
        ? lines.map(l => l.text).slice(-6).join(" ").slice(0, 600)
        : "Appel test de la réceptionniste, sans informations client collectées."
      const fallbackArgs = {
        nom_client: "Appel test",
        resume: summary,
        type_demande: "autre" as const,
        urgence: "normal" as const,
        a_rappeler: false,
        rappel_souhaite: false,
        devis_demande: inferDevisRequest({ resume: summary, type_demande: "autre" }, lines),
      }
      const result = await saveCall(fallbackArgs, { transcript: lines, durationSec: (Date.now() - startedAt) / 1000, profile })
      if (result.ok) {
        saved = true
        savedCallId = result.call_id
        if (result.devis_id) savedDevisId = String(result.devis_id)
        lastSaveMessage = result.message || "Appel enregistré dans Réception."
      }
    }
    if (saved && savedCallId != null && !savedDevisId && inferDevisRequest({ resume: lines.map(l => l.text).join(" ") }, lines)) {
      const draft = await draftDevisFromCall(savedCallId)
      if (draft.ok && draft.devis_id) {
        savedDevisId = String(draft.devis_id)
        lastSaveMessage = "Appel enregistré et brouillon de devis créé — à valider avant envoi."
      } else if (draft.error) {
        lastSaveMessage = lastSaveMessage && !lastSaveMessage.includes("devis")
          ? `${lastSaveMessage} ${draft.error}`
          : (draft.error || lastSaveMessage)
      }
    }
    if (blob && blob.size > 64 && savedCallId != null) {
      await uploadCallRecording(savedCallId, blob)
    }
    try { dispatchEvent(new Event("akno-refresh")) } catch { /* */ }
    opts.onStatus("idle")
    return lastSaveMessage
  }

  return { stop }
}
