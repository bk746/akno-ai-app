import { supabase } from "../supabase"
import { uploadCallRecording } from "../recordings"
import { buildSessionConfig, mergeProfile, welcomeLine, VOICE_ID, type VoiceProfile } from "./script"
import { bookAppointment, getAvailableSlots, saveCall, type BookArgs, type SaveArgs, type SlotsArgs } from "./tools"

export type VoiceStatus = "idle" | "connecting" | "live" | "speaking" | "listening" | "thinking" | "ending" | "error"
export type TranscriptLine = { role: "user" | "assistant"; text: string }

export type VoiceTokenResponse = {
  value?: string
  expires_at?: number
  profile?: Partial<VoiceProfile>
  error?: string
}

const WS_URL = "wss://api.x.ai/v1/realtime?model=grok-voice-latest"
const SUPPORTED = new Set([8000, 16000, 22050, 24000, 32000, 44100, 48000])
const PREFERRED_RATE = 24000
const BARGE_MS = 320
const LOOKAHEAD = 0.08

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

function base64Pcm16ToFloat(b64: string) {
  const raw = atob(b64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  const even = bytes.byteLength & 1 ? bytes.buffer.slice(0, bytes.byteLength - 1) : bytes.buffer
  const pcm = new Int16Array(even)
  const out = new Float32Array(pcm.length)
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 32768
  return out
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
  stop() {
    for (const s of this.sources) { try { s.stop() } catch { /* already stopped */ } }
    this.sources = []
    this.next = 0
  }
  waitIdle() {
    const ms = this.buffered * 1000 + 40
    return ms <= 0 ? Promise.resolve() : new Promise<void>(r => setTimeout(r, ms))
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

function pickRecorderMime() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]
  for (const t of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t
  }
  return ""
}

function startMixerRecorder(ctx: AudioContext, micSource: MediaStreamAudioSourceNode, agentOut: AudioNode) {
  const mix = ctx.createMediaStreamDestination()
  try { micSource.connect(mix) } catch { /* */ }
  try { agentOut.connect(mix) } catch { /* */ }
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
        if (!rec || rec.state === "inactive") {
          resolve(chunks.length ? new Blob(chunks, { type: rec?.mimeType || "audio/webm" }) : null)
          return
        }
        rec.onstop = () => resolve(chunks.length ? new Blob(chunks, { type: rec?.mimeType || "audio/webm" }) : null)
        try { rec.stop() } catch { resolve(null) }
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
  onStatus: (s: VoiceStatus) => void
  onTranscript: (lines: TranscriptLine[]) => void
  onNotice?: (msg: string) => void
}) {
  const profile = mergeProfile(opts.profile)
  const startedAt = Date.now()
  const lines: TranscriptLine[] = []
  let assistantBuf = ""
  let saved = false
  let savedCallId: string | number | undefined
  let lastSaveMessage = ""
  let ready = false
  let closed = false
  let pendingTools = 0
  let newUserTurn = false
  let newAssistantTurn = false
  let bargeTimer: ReturnType<typeof setTimeout> | null = null

  const ctx = new AudioContext({ sampleRate: PREFERRED_RATE })
  if (ctx.state === "suspended") await ctx.resume()
  const sampleRate = nearestRate(ctx.sampleRate)
  const player = new PcmPlayer(ctx)
  const mic = await connectMic(ctx)
  const recorder = startMixerRecorder(ctx, mic.source, player.output)
  const session = buildSessionConfig(profile, sampleRate)
  const simpleSession = {
    voice: VOICE_ID,
    instructions: session.instructions,
    turn_detection: { type: "server_vad" as const, idle_timeout_ms: 8000 },
    tools: session.tools,
    audio: {
      input: { format: { type: "audio/pcm", rate: sampleRate }, transcription: { language_hint: "fr" } },
      output: { format: { type: "audio/pcm", rate: sampleRate } },
    },
  }
  let usedSimple = false

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
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj))
  }

  const flushMic = (f32: Float32Array) => {
    if (!ready || closed || ws.readyState !== WebSocket.OPEN) return
    send({ type: "input_audio_buffer.append", audio: floatToBase64Pcm16(f32) })
  }

  const interruptPlayback = () => {
    player.stop()
    assistantBuf = ""
    newUserTurn = true
    opts.onStatus("listening")
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
          lastSaveMessage = (result as { message?: string }).message || "Appel enregistré dans Réception."
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

    if (type === "session.updated") {
      ready = true
      mic.setHandler(flushMic)
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
      return
    }
    if (type === "input_audio_buffer.speech_started") {
      if (bargeTimer) clearTimeout(bargeTimer)
      const delay = player.buffered > 0.05 ? BARGE_MS : 0
      if (delay === 0) interruptPlayback()
      else bargeTimer = setTimeout(() => { bargeTimer = null; interruptPlayback() }, delay)
      return
    }
    if (type === "response.created") {
      assistantBuf = ""
      newAssistantTurn = true
      return
    }
    if (type === "input_audio_buffer.speech_stopped") {
      if (bargeTimer) { clearTimeout(bargeTimer); bargeTimer = null }
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
        player.enqueue(base64Pcm16ToFloat(delta), sampleRate)
        opts.onStatus("speaking")
      }
      return
    }
    if (type === "response.function_call_arguments.done") {
      void handleTool(event as { name?: string; call_id?: string; arguments?: string })
      return
    }
    if (type === "response.done") {
      if (!pendingTools) opts.onStatus("live")
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
      if (/transcription|language_hint|keyterms|reasoning/i.test(msg)) return
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
      const result = await saveCall({
        nom_client: "Appel test",
        resume: summary,
        type_demande: "autre",
        urgence: "normal",
        a_rappeler: false,
        devis_demande: false,
      }, { transcript: lines, durationSec: (Date.now() - startedAt) / 1000, profile })
      if (result.ok) {
        saved = true
        savedCallId = result.call_id
        lastSaveMessage = result.message || "Appel enregistré dans Réception."
      }
    }
    if (blob && savedCallId != null) {
      await uploadCallRecording(savedCallId, blob)
    }
    opts.onStatus("idle")
    return lastSaveMessage
  }

  return { stop }
}
