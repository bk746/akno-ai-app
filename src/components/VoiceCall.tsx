import { useEffect, useRef, useState } from "react"
import { motion } from "motion/react"
import { PhoneOff, X } from "lucide-react"
import { BLOB } from "./blobPath"
import { fetchVoiceToken, startVoiceSession, type TranscriptLine, type VoiceStatus } from "../lib/voice/client"
import { mergeProfile, type VoiceProfile } from "../lib/voice/script"

const C = "#E6E6E6"

const STATUS: Record<VoiceStatus, string> = {
  idle: "",
  connecting: "Connexion…",
  live: "En ligne",
  listening: "À vous",
  speaking: "Elle parle",
  thinking: "Un instant…",
  ending: "Fin de l'appel…",
  error: "Erreur",
}

function mmss(sec: number) {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

export default function VoiceCall({
  fallback,
  onDone,
}: {
  fallback?: Partial<VoiceProfile>
  onDone: (message?: string) => void
}) {
  const [status, setStatus] = useState<VoiceStatus>("connecting")
  const [error, setError] = useState("")
  const [lines, setLines] = useState<TranscriptLine[]>([])
  const [sec, setSec] = useState(0)
  const stopRef = useRef<null | ((save?: boolean) => Promise<string | undefined>)>(null)
  const hanging = useRef(false)

  useEffect(() => {
    const t = setInterval(() => setSec(x => x + 1), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const token = await fetchVoiceToken()
        if (!alive) return
        const profile = mergeProfile({ ...fallback, ...token.profile })
        const session = await startVoiceSession({
          token: token.value!,
          profile,
          slots: token.slots,
          onStatus: s => { if (alive) setStatus(s) },
          onTranscript: xs => { if (alive) setLines(xs) },
          onNotice: msg => { if (alive) setError(msg) },
        })
        if (!alive) { await session.stop(false); return }
        stopRef.current = session.stop
      } catch (e) {
        if (!alive) return
        setStatus("error")
        setError(e instanceof Error ? e.message : "Impossible de démarrer l'appel.")
      }
    })()
    return () => { alive = false; stopRef.current?.(false) }
  }, [])

  const hangup = () => {
    if (hanging.current) return
    hanging.current = true
    setStatus("ending")
    const stopper = stopRef.current
    if (stopper) void stopper(true)
    onDone(status === "error" ? undefined : "Appel terminé.")
  }

  const pulse = status === "speaking" ? 1.06 : status === "listening" ? 1.03 : 1
  const last = lines.slice(-3)

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Appel de la réceptionniste"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex flex-col bg-black text-white"
    >
      <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 38%, ${C}1A 0%, transparent 58%)` }} />
      <div className="relative flex h-12 shrink-0 items-center justify-end px-4" style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}>
        <button type="button" aria-label="Fermer" onPointerUp={e => { e.preventDefault(); hangup() }} onClick={hangup} className="relative z-20 flex h-10 w-10 items-center justify-center rounded-full text-white/50 hover:bg-white/[.06] hover:text-white" style={{ touchAction: "manipulation" }}>
          <X size={20} strokeWidth={1.75} />
        </button>
      </div>
      <div className="pointer-events-none relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-6">
        <motion.div
          animate={{ scale: pulse, y: status === "speaking" || status === "listening" ? [0, -4, 0] : 0 }}
          transition={{ duration: status === "speaking" ? 1.1 : 3.2, repeat: Infinity, ease: "easeInOut" }}
          className="pointer-events-none relative"
        >
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[280px] w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: `radial-gradient(circle, ${C}${status === "speaking" ? "33" : "1A"} 0%, transparent 64%)` }} />
          <svg viewBox="0 0 267 279" width={148} height={148 * 279 / 267} className="relative">
            <path d={BLOB} fill={C} />
            <ellipse cx={106.5} cy={104.5} rx={22.5} ry={status === "listening" ? 28 : 31} fill="#000" />
            <ellipse cx={169.5} cy={104.5} rx={22.5} ry={status === "listening" ? 28 : 31} fill="#000" />
          </svg>
        </motion.div>
        <div className="mt-8 text-center">
          <div className="text-[13px] font-medium uppercase tracking-[.12em] text-white/40">Réceptionniste</div>
          <div className="mt-2 text-[28px] font-semibold tracking-[-0.03em]">{mmss(sec)}</div>
          <div className="mt-2 text-[15px] text-white/55">{error && status === "error" ? error : STATUS[status]}</div>
        </div>
        {last.length > 0 && (
          <div className="mt-8 w-full max-w-[420px] space-y-2">
            {last.map((l, i) => (
              <div key={i} className={`text-[14px] leading-snug ${l.role === "assistant" ? "text-white/80" : "text-white/45"}`}>
                <span className="mr-2 text-[12px] font-medium uppercase tracking-[.06em] text-white/30">{l.role === "assistant" ? "Akno" : "Vous"}</span>
                {l.text}
              </div>
            ))}
          </div>
        )}
        {status === "error" && error && (
          <p className="mt-6 max-w-[360px] text-center text-[14px] text-white/60">{error}</p>
        )}
      </div>
      <div className="relative z-20 flex shrink-0 flex-col items-center gap-3 px-6 pb-4 pointer-events-auto" style={{ paddingBottom: "max(28px, env(safe-area-inset-bottom))" }}>
        <button
          type="button"
          onPointerUp={e => { e.preventDefault(); hangup() }}
          onClick={hangup}
          className="relative z-20 flex h-16 w-16 items-center justify-center rounded-full bg-[#FF3B30] text-white shadow-[0_16px_32px_-12px_rgba(255,59,48,.7)] transition active:scale-95"
          style={{ touchAction: "manipulation" }}
          aria-label="Raccrocher"
        >
          <PhoneOff size={24} strokeWidth={1.8} />
        </button>
        <span className="text-[13px] text-white/45">Raccrocher</span>
      </div>
    </motion.div>
  )
}
