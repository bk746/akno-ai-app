/* update45 · Panneau de marque (écran de connexion, desktop) :
   la journée d'un artisan racontée par Akno, en 4 cartes qui s'enchaînent en boucle. */
import { useEffect, useState, type ReactNode, type Ref } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Check, MessageSquareText } from "lucide-react"
import { A, Blob } from "../ui"
import { EASE } from "./fields"

const STEP_MS = 2600, HOLD_MS = 4200

function Card({ k, time, children, ref }: { k: keyof typeof A; time: string; children: ReactNode; ref?: Ref<HTMLLIElement> }) {
  const a = A[k]
  return <motion.li ref={ref} layout initial={{ opacity: 0, y: 26, scale: .97, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }} exit={{ opacity: 0, y: -10, transition: { duration: .35 } }}
    transition={{ type: "spring", stiffness: 210, damping: 26, mass: .9 }}
    className="rounded-[18px] border border-white/[.07] bg-[#121214]/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.05),0_24px_48px_-28px_rgba(0,0,0,1)] backdrop-blur-md">
    <div className="mb-3 flex items-center gap-2.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: a.c + "24" }}><Blob c={a.c} s={15} /></span>
      <span className="text-[13px] font-medium text-white/80">{a.n}</span>
      <span className="ml-auto font-mono text-[11.5px] tabular-nums text-white/35">{time}</span>
    </div>
    {children}
  </motion.li>
}

function Wave({ live }: { live: boolean }) {
  return <span className="flex h-4 items-center gap-[3px]" aria-hidden>{[.5, .9, .65, 1, .45, .8, .55].map((h, i) =>
    <motion.span key={i} className="w-[3px] rounded-full bg-white/70" style={{ height: 16 }} initial={{ scaleY: .25 }}
      animate={live ? { scaleY: [.25, h, .35, h * .8, .25] } : { scaleY: .2 }} transition={live ? { duration: 1.1, repeat: Infinity, delay: i * .08, ease: "easeInOut" } : { duration: .3 }} />)}</span>
}

function Count({ to, run }: { to: number; run: boolean }) {
  const [v, setV] = useState(run ? 0 : to)
  useEffect(() => {
    if (!run) { setV(to); return }
    let raf = 0; const t0 = performance.now()
    const f = (t: number) => { const p = Math.min(1, (t - t0) / 900); setV(to * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(f) }
    raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf)
  }, [to, run])
  return <>{v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</>
}

const Line = ({ l, r }: { l: string; r: string }) => <div className="flex justify-between gap-4 text-[13px]"><span className="text-white/55">{l}</span><span className="tabular-nums text-white/80">{r}</span></div>
const Tag = ({ c, children }: { c: string; children: ReactNode }) => <span className="inline-flex h-[22px] items-center gap-1.5 rounded-full px-2 text-[11.5px] font-medium" style={{ background: c + "1F", color: c }}><span className="h-[5px] w-[5px] rounded-full" style={{ background: c }} />{children}</span>

export default function BrandPanel() {
  const reduce = useReducedMotion()
  const [n, setN] = useState(reduce ? 4 : 0)
  useEffect(() => {
    if (reduce) { setN(4); return }
    const t = setTimeout(() => { if (n < 4) setN(n + 1); else setN(0) }, n === 0 ? 700 : n < 4 ? STEP_MS : HOLD_MS)
    return () => clearTimeout(t)
  }, [n, reduce])
  // Fil glissant : 3 cartes visibles au plus, la plus ancienne remonte et s'efface
  const show = (i: number) => n >= i && i > n - 3
  const anim = !reduce, active = (["rec", "dev", "rel", "ag"] as const)[Math.max(0, n - 1)]

  return <div className="relative flex h-full flex-col overflow-hidden rounded-[28px] border border-white/[.06] bg-[#08080A]">
    {/* Fond : halo + trame de points qui s'estompe */}
    <div aria-hidden className="pointer-events-none absolute inset-0 [background:radial-gradient(60%_50%_at_70%_0%,rgba(255,255,255,.09),transparent_70%)]" />
    <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[.35] [background-image:radial-gradient(rgba(255,255,255,.16)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(70%_60%_at_60%_40%,#000,transparent)]" />

    {/* Légende : les 4 assistants, l'actif s'allume */}
    <div className="relative flex items-center gap-1.5 px-9 pt-8" aria-hidden>
      {(["rec", "dev", "rel", "ag"] as const).map(k => <span key={k} className={`flex h-8 items-center gap-2 rounded-full px-3 text-[12.5px] transition-[background-color,color] duration-500 ${n > 0 && k === active ? "bg-white/[.08] text-white" : "text-white/35"}`}>
        <span className="h-1.5 w-1.5 rounded-full transition-opacity duration-500" style={{ background: A[k].c, opacity: n > 0 && k === active ? 1 : .45 }} />{A[k].n}</span>)}
    </div>

    {/* Le fil de la journée */}
    <div className="relative flex flex-1 items-center justify-center px-9 py-6">
      <ul className="flex w-full max-w-[400px] flex-col gap-3" aria-hidden>
        <AnimatePresence initial={false} mode="popLayout">
          {show(1) && <Card key="rec" k="rec" time="08:14">
            <div className="flex items-center justify-between gap-3"><div className="text-[14.5px] font-medium text-white">Appel de Mme Martin</div><Wave live={anim && n === 1} /></div>
            <p className="mt-1.5 text-[13px] leading-[1.5] text-white/55">Fuite sous l'évier de la cuisine. Souhaite une intervention cette semaine.</p>
            <div className="mt-3 flex gap-1.5"><Tag c="#FFB340">Urgent</Tag><Tag c="#E6E6E6">Rappel demandé</Tag></div>
          </Card>}
          {show(2) && <Card key="dev" k="dev" time="08:16">
            <div className="flex items-center justify-between"><div className="text-[14.5px] font-medium text-white">Devis D-2026-0142</div><Tag c="#30D158">Prêt à envoyer</Tag></div>
            <div className="mt-3 space-y-1.5"><Line l="Remplacement siphon et joints" r="145,00 €" /><Line l="Main-d'œuvre · 1 h 30" r="97,50 €" /><Line l="TVA 10 %" r="24,25 €" /></div>
            <div className="mt-2.5 flex justify-between border-t border-white/[.07] pt-2.5 text-[14px] font-semibold"><span>Total TTC</span><span className="tabular-nums"><Count to={266.75} run={anim && n === 2} /></span></div>
          </Card>}
          {show(3) && <Card key="rel" k="rel" time="J+3 · 10:02">
            <div className="flex items-start gap-2.5"><MessageSquareText size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-white/40" /><p className="text-[13px] leading-[1.5] text-white/70">« Bonjour Mme Martin, avez-vous pu consulter notre devis ? Je reste disponible pour en parler. »</p></div>
            <motion.div initial={anim ? { opacity: 0, y: 4 } : false} animate={{ opacity: 1, y: 0 }} transition={{ delay: anim ? 1.1 : 0, duration: .4, ease: EASE }} className="mt-3 flex items-center gap-2 text-[13px] font-medium text-[#30D158]"><Check size={15} strokeWidth={2.2} />Devis accepté en ligne</motion.div>
          </Card>}
          {show(4) && <Card key="ag" k="ag" time="10:03">
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-[11px] bg-white/[.06] leading-none"><span className="text-[10.5px] font-medium text-[#FF7070]">jeu.</span><span className="mt-0.5 text-[17px] font-semibold tabular-nums">19</span></div>
              <div className="min-w-0"><div className="text-[14.5px] font-medium text-white">Intervention calée · 9 h 00</div><div className="mt-0.5 truncate text-[13px] text-white/50">Mme Martin · 12 rue des Lilas, Lyon 3e</div></div>
            </div>
          </Card>}
        </AnimatePresence>
      </ul>
    </div>

    {/* Message + mascotte */}
    <div className="relative flex items-end justify-between gap-6 px-9 pb-9">
      <div className="max-w-[360px]">
        <h2 className="text-[26px] font-semibold leading-[1.15] tracking-[-0.03em] text-white text-balance">Vous êtes sur le chantier. Akno s'occupe du reste.</h2>
        <p className="mt-3 text-[14.5px] leading-[1.55] text-white/50 [@media(max-height:700px)]:hidden">Votre réceptionniste décroche, prépare le devis, relance et cale le rendez-vous, 24 h/24.</p>
      </div>
      <motion.div aria-hidden className="-mb-1 shrink-0" animate={anim ? { y: [0, -5, 0] } : undefined} transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}><Blob c="#E6E6E6" s={84} /></motion.div>
    </div>
  </div>
}
