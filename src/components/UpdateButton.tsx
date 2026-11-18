/* update59 · Bouton bleu « Redémarrer pour mettre à jour » (nuage), affiché quand une nouvelle version est en ligne. */
import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { CloudDownload, LoaderCircle } from "lucide-react"
import { applyUpdate, useUpdateAvailable } from "../lib/appUpdate"
import { isVoiceCallActive } from "../lib/voice/wakeLock"
import { useC } from "./ui"

const BLUE = "#0A84FF", LABEL = "Redémarrer pour mettre à jour", SEEN = "akno-update-hint"

export default function UpdateButton({ sm }: { sm?: boolean }) {
  const on = useUpdateAvailable(), { toast } = useC(), [busy, setBusy] = useState(false), [hint, setHint] = useState(false), [hover, setHover] = useState(false)
  // Mobile : petite bulle à la première apparition (une fois par session)
  useEffect(() => {
    if (!on || !sm) return
    try { if (sessionStorage.getItem(SEEN)) return; sessionStorage.setItem(SEEN, "1") } catch { /* ignore */ }
    setHint(true); const t = setTimeout(() => setHint(false), 6000); return () => clearTimeout(t)
  }, [on, sm])
  const go = async () => {
    if (busy) return
    if (isVoiceCallActive()) { toast("Terminez l'appel en cours avant de mettre à jour"); return }
    if (document.querySelector("[role=dialog]") && !confirm("Une fenêtre est ouverte : ce qui n'est pas enregistré sera perdu. Mettre à jour maintenant ?")) return
    setBusy(true); setHint(false)
    await applyUpdate()
  }
  const s = sm ? 32 : 36
  return <AnimatePresence>{on && <motion.div key="upd" className="relative flex" initial={{ opacity: 0, scale: .6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .6 }} transition={{ type: "spring", stiffness: 420, damping: 24 }}>
    <button type="button" data-hit aria-label={LABEL} onClick={go} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}
      className="relative flex items-center justify-center rounded-full text-white transition-transform duration-150 active:scale-95 [-webkit-tap-highlight-color:transparent]" style={{ width: s, height: s, background: BLUE, boxShadow: "0 6px 18px -6px rgba(10,132,255,.7), inset 0 1px 0 rgba(255,255,255,.25)" }}>
      {!busy && <motion.span aria-hidden className="pointer-events-none absolute inset-0 rounded-full" style={{ border: `2px solid ${BLUE}` }} initial={{ opacity: .7, scale: 1 }} animate={{ opacity: 0, scale: 1.6 }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", repeatDelay: .6 }} />}
      {busy ? <LoaderCircle size={sm ? 16 : 18} className="animate-spin" /> : <CloudDownload size={sm ? 16 : 18} strokeWidth={2} />}
    </button>
    <AnimatePresence>{(sm ? hint : hover) && <motion.div role="tooltip" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .18 }}
      className={`pointer-events-none absolute top-full z-[70] mt-2 whitespace-nowrap rounded-[10px] border border-white/[.08] bg-[#1C1C1F] px-3 py-1.5 text-[12.5px] font-medium text-white shadow-[0_10px_30px_-10px_rgba(0,0,0,.9)] ${sm ? "right-0" : "left-1/2 -translate-x-1/2"}`}>{LABEL}</motion.div>}</AnimatePresence>
  </motion.div>}</AnimatePresence>
}
