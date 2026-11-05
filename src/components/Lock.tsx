import { useEffect, useState } from "react"
import { motion, AnimatePresence, useAnimationControls } from "motion/react"
import { Delete, ScanFace } from "lucide-react"
import { BLOB } from "./blobPath"
import { bioAvailable, checkCode, enableBio, getLock, setCode, unlockBio } from "../lib/lock"
import { supabase } from "../lib/supabase"

const buzz = () => { try { navigator.vibrate?.([30, 40, 30]) } catch { } }
function Bot({ s = 64 }: { s?: number }) {
  const [b, setB] = useState(false)
  useEffect(() => { let t: ReturnType<typeof setTimeout>; const loop = () => { t = setTimeout(() => { setB(true); setTimeout(() => setB(false), 120); loop() }, 2500 + Math.random() * 3000) }; loop(); return () => clearTimeout(t) }, [])
  return <svg viewBox="0 0 267 279" width={s} height={s * 279 / 267} aria-hidden><path d={BLOB} fill="#fff" /><g style={{ transformBox: "fill-box", transformOrigin: "center", transform: `scaleY(${b ? .1 : 1})`, transition: "transform .06s" }}><ellipse cx={106.5} cy={104.5} rx={22.5} ry={31} fill="#000" /><ellipse cx={169.5} cy={104.5} rx={22.5} ry={31} fill="#000" /></g></svg>
}
const Dots = ({ n, ctl }: { n: number; ctl: ReturnType<typeof useAnimationControls> }) => <motion.div animate={ctl} className="flex justify-center gap-4">{Array.from({ length: 6 }, (_, i) => <span key={i} className={`h-3.5 w-3.5 rounded-full transition-colors ${i < n ? "bg-white" : "bg-white/20"}`} />)}</motion.div>
function Pad({ onKey, onDel, left }: { onKey: (d: string) => void; onDel: () => void; left?: React.ReactNode }) {
  const k = "flex h-[76px] w-[76px] items-center justify-center rounded-full text-[30px] font-normal text-white active:bg-white/20 transition-colors"
  return <div className="mx-auto grid w-[288px] grid-cols-3 justify-items-center gap-x-6 gap-y-4">
    {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(d => <button key={d} onClick={() => onKey(d)} className={`${k} bg-white/[.09]`}>{d}</button>)}
    <div className="flex h-[76px] w-[76px] items-center justify-center">{left}</div>
    <button onClick={() => onKey("0")} className={`${k} bg-white/[.09]`}>0</button>
    <button onClick={onDel} aria-label="Effacer" className={k}><Delete size={28} strokeWidth={1.6} /></button>
  </div>
}
const nameKey = (uid: string) => `akno-prenom:${uid}`

/** Écran de verrouillage : splash AK puis « Bonjour, prénom », code à 6 chiffres et Face ID. */
export function LockScreen({ uid, onUnlock }: { uid: string; onUnlock: () => void }) {
  const [splash, setSplash] = useState(true), [code, setC] = useState(""), [busy, setBusy] = useState(false), [msg, setMsg] = useState(""), ctl = useAnimationControls()
  const [name, setName] = useState(() => localStorage.getItem(nameKey(uid)) || ""), bio = !!getLock(uid)?.cred
  useEffect(() => { const t = setTimeout(() => setSplash(false), 900); supabase.from("artisans").select("prenom").eq("id", uid).maybeSingle().then(({ data }) => { if (data?.prenom) { setName(data.prenom); localStorage.setItem(nameKey(uid), data.prenom) } }); return () => clearTimeout(t) }, [uid])
  const face = async () => { try { if (await unlockBio(uid)) onUnlock() } catch { /* iOS peut exiger un geste : le bouton Face ID reste disponible */ } }
  useEffect(() => { if (!splash && bio) face() }, [splash]) // eslint-disable-line react-hooks/exhaustive-deps
  const key = async (d: string) => {
    if (busy || code.length >= 6) return; const c = code + d; setC(c); setMsg("")
    if (c.length < 6) return
    setBusy(true); const r = await checkCode(uid, c); setBusy(false)
    if (r === "ok") return onUnlock()
    buzz(); await ctl.start({ x: [0, -14, 14, -10, 10, -5, 5, 0], transition: { duration: .45 } }); setC("")
    if (r === "locked") { await supabase.auth.signOut(); return }
    setMsg("Code incorrect")
  }
  return <div className="fixed inset-0 z-[100] flex flex-col bg-black text-white" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
    <AnimatePresence mode="wait">{splash
      ? <motion.div key="s" exit={{ opacity: 0 }} transition={{ duration: .25 }} className="flex flex-1 items-center justify-center"><img src="/logo.png" alt="Akno" className="h-16 w-auto" /></motion.div>
      : <motion.div key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-1 flex-col items-center px-6">
        <div className="mt-[9vh]"><Bot s={56} /></div>
        <h1 className="mt-5 text-[22px] font-semibold tracking-[-0.02em]">Bonjour{name ? `, ${name}` : ""}</h1>
        <div className="mt-8"><Dots n={code.length} ctl={ctl} /></div>
        <div className="mt-3 h-5 text-[14px] text-[#FF5F57]">{msg}</div>
        <div className="mt-auto"><Pad onKey={key} onDel={() => setC(c => c.slice(0, -1))} left={bio ? <button onClick={face} aria-label="Déverrouiller avec Face ID" className="flex h-[76px] w-[76px] items-center justify-center text-white"><ScanFace size={32} strokeWidth={1.5} /></button> : null} /></div>
        <button onClick={() => supabase.auth.signOut()} className="mb-6 mt-7 text-[15px] font-medium text-white/60">Code d'accès oublié ?</button>
      </motion.div>}</AnimatePresence>
  </div>
}

/** Création / changement du code (saisie + confirmation), puis proposition Face ID. */
export function LockSetup({ uid, email, onDone }: { uid: string; email: string; onDone: (skipped?: boolean) => void }) {
  const [step, setStep] = useState<"a" | "b" | "bio">("a"), [first, setFirst] = useState(""), [code, setC] = useState(""), [msg, setMsg] = useState(""), [canBio, setCanBio] = useState(false), ctl = useAnimationControls()
  useEffect(() => { bioAvailable().then(setCanBio) }, [])
  const key = async (d: string) => {
    if (code.length >= 6) return; const c = code + d; setC(c); setMsg(""); if (c.length < 6) return
    if (step === "a") { setFirst(c); setC(""); setStep("b"); return }
    if (c !== first) { buzz(); await ctl.start({ x: [0, -14, 14, -10, 10, -5, 5, 0], transition: { duration: .45 } }); setC(""); setFirst(""); setStep("a"); setMsg("Les codes ne correspondent pas"); return }
    await setCode(uid, c); if (canBio && !getLock(uid)?.cred) setStep("bio"); else onDone()
  }
  const bio = async () => { try { await enableBio(uid, email); onDone() } catch { setMsg("Face ID non activé"); setTimeout(() => onDone(), 900) } }
  return <div className="fixed inset-0 z-[100] flex flex-col bg-black px-6 text-white" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
    <button onClick={() => onDone(true)} className="absolute right-5 top-[calc(env(safe-area-inset-top)+16px)] text-[15px] text-white/50">Plus tard</button>
    <div className="mx-auto mt-[9vh]"><Bot s={56} /></div>
    {step === "bio" ? <div className="flex flex-1 flex-col items-center">
      <h1 className="mt-5 text-[22px] font-semibold tracking-[-0.02em]">Activer Face ID</h1>
      <p className="mt-2 text-center text-[15px] text-white/50">Déverrouillez Akno d'un regard.</p>
      <ScanFace size={72} strokeWidth={1.2} className="mt-12" />
      <div className="mt-3 h-5 text-[14px] text-[#FF5F57]">{msg}</div>
      <button onClick={bio} className="mt-auto h-[52px] w-full max-w-[360px] rounded-full bg-white text-[16px] font-semibold text-black">Activer Face ID</button>
      <button onClick={() => onDone()} className="mb-6 mt-4 text-[15px] font-medium text-white/60">Pas maintenant</button>
    </div> : <div className="flex flex-1 flex-col items-center">
      <h1 className="mt-5 text-[22px] font-semibold tracking-[-0.02em]">{step === "a" ? "Créer un code d'accès" : "Confirmez le code"}</h1>
      <p className="mt-2 text-[15px] text-white/50">6 chiffres</p>
      <div className="mt-8"><Dots n={code.length} ctl={ctl} /></div>
      <div className="mt-3 h-5 text-[14px] text-[#FF5F57]">{msg}</div>
      <div className="mb-10 mt-auto"><Pad onKey={key} onDel={() => setC(c => c.slice(0, -1))} /></div>
    </div>}
  </div>
}
