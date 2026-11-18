/* update45 · Panneau de marque (parcours d'accueil, desktop) : la journée d'un artisan racontée par Akno.
   update50 · Le panneau ne bouge JAMAIS : hauteur = celle de la fenêtre, contenu en overflow hidden.
   Les 4 cartes ont toutes la même hauteur et sont positionnées en absolu dans une scène de taille fixe :
   elles s'empilent et se remplacent (carte active devant, les précédentes en retrait derrière),
   sans jamais changer la taille du conteneur, quel que soit l'état (Réceptionniste, Devis, Relance, Agenda). */
import { useEffect, useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import { Check, MessageSquareText } from "lucide-react"
import { A, Blob } from "../ui"
import { EASE } from "./fields"

const KEYS = ["rec", "dev", "rel", "ag"] as const
type K = typeof KEYS[number]
const STEP_MS = 3400
/** Hauteur unique des cartes et décalage de la pile : la scène fait toujours CARD_H + PEEK px. */
const CARD_H = 220, PEEK = 28

/** Position d'une carte selon son écart avec la carte active (0 = devant, 3 = juste derrière, 2 = au fond, 1 = la suivante, invisible). */
const POS = [
  { y: PEEK, scale: 1, opacity: 1, filter: "blur(0px)", zIndex: 3 },
  { y: PEEK, scale: 1.035, opacity: 0, filter: "blur(6px)", zIndex: 4 },
  { y: 0, scale: .9, opacity: .22, filter: "blur(0px)", zIndex: 1 },
  { y: PEEK / 2, scale: .95, opacity: .55, filter: "blur(0px)", zIndex: 2 },
]

function Card({ k, d, time, children }: { k: K; d: number; time: string; children: ReactNode }) {
  const a = A[k], p = POS[d]
  return <motion.li initial={false} animate={{ y: p.y, scale: p.scale, opacity: p.opacity, filter: p.filter }} style={{ zIndex: p.zIndex, height: CARD_H, transformOrigin: "50% 0%" }}
    transition={d === 2 ? { duration: .45, ease: EASE } : { type: "spring", stiffness: 190, damping: 26, mass: .9 }}
    className="absolute inset-x-0 top-0 overflow-hidden rounded-[18px] border border-white/[.07] bg-[#121214] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.05),0_24px_48px_-28px_rgba(0,0,0,1)]">
    {/* seule la carte de devant montre son contenu : derrière, de simples plaques (pas de texte superposé) */}
    <motion.div initial={false} animate={{ opacity: d === 0 ? 1 : 0 }} transition={{ duration: d === 0 ? .35 : .2, delay: d === 0 ? .08 : 0 }}>
    <div className="mb-3 flex items-center gap-2.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: a.c + "24" }}><Blob c={a.c} s={15} /></span>
      <span className="text-[13px] font-medium text-white/80">{a.n}</span>
      <span className="ml-auto font-mono text-[11.5px] tabular-nums text-white/35">{time}</span>
    </div>
    {children}
    </motion.div>
  </motion.li>
}

function Wave({ live }: { live: boolean }) {
  return <span className="flex h-4 items-center gap-[3px]" aria-hidden>{[.5, .9, .65, 1, .45, .8, .55].map((h, i) =>
    <motion.span key={i} className="w-[3px] rounded-full bg-white/70" style={{ height: 16 }} initial={{ scaleY: .25 }}
      animate={live ? { scaleY: [.25, h, .35, h * .8, .25] } : { scaleY: .2 }} transition={live ? { duration: 1.1, repeat: Infinity, delay: i * .08, ease: "easeInOut" } : { duration: .3 }} />)}</span>
}

function Count({ to, run }: { to: number; run: boolean }) {
  const [v, setV] = useState(to)
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
const Done = ({ show, delay, children }: { show: boolean; delay: number; children: ReactNode }) =>
  <motion.div initial={false} animate={{ opacity: show ? 1 : 0, y: show ? 0 : 4 }} transition={{ delay: show ? delay : 0, duration: .4, ease: EASE }} className="flex items-center gap-2 text-[13px] font-medium text-[#30D158]"><Check size={15} strokeWidth={2.2} />{children}</motion.div>

export default function BrandPanel() {
  const reduce = useReducedMotion()
  const [active, setActive] = useState(0)
  useEffect(() => {
    if (reduce) return
    const t = setTimeout(() => setActive(a => (a + 1) % KEYS.length), STEP_MS)
    return () => clearTimeout(t)
  }, [active, reduce])
  const d = (i: number) => (i - active + KEYS.length) % KEYS.length
  const on = (k: K) => KEYS[active] === k

  return <div data-brand-panel className="relative flex h-full flex-col overflow-hidden rounded-[28px] border border-white/[.06] bg-[#08080A]">
    <div aria-hidden className="pointer-events-none absolute inset-0 [background:radial-gradient(60%_50%_at_70%_0%,rgba(255,255,255,.08),transparent_70%)]" />

    {/* Les 4 assistants : l'actif s'allume */}
    <div className="relative flex shrink-0 items-center gap-1.5 px-9 pt-8" aria-hidden>
      {KEYS.map(k => <span key={k} className={`flex h-8 items-center gap-2 rounded-full px-3 text-[12.5px] transition-[background-color,color] duration-500 ${on(k) ? "bg-white/[.08] text-white" : "text-white/35"}`}>
        <span className="h-1.5 w-1.5 rounded-full transition-opacity duration-500" style={{ background: A[k].c, opacity: on(k) ? 1 : .45 }} />{A[k].n}</span>)}
    </div>

    {/* Scène de taille fixe : les cartes s'y remplacent sans rien pousser */}
    <div className="relative min-h-0 flex-1 overflow-hidden px-9">
      <ul data-stage aria-hidden className="absolute left-1/2 top-1/2 w-[calc(100%-72px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2" style={{ height: CARD_H + PEEK }}>
        <Card k="rec" d={d(0)} time="08:14">
          <div className="flex items-center justify-between gap-3"><div className="text-[14.5px] font-medium text-white">Appel de Mme Martin</div><Wave live={!reduce && on("rec")} /></div>
          <p className="mt-1.5 text-[13px] leading-[1.5] text-white/55">Fuite sous l'évier de la cuisine. Souhaite une intervention cette semaine.</p>
          <div className="mt-3 flex gap-1.5"><Tag c="#FFB340">Urgent</Tag><Tag c="#E6E6E6">Rappel demandé</Tag></div>
        </Card>
        <Card k="dev" d={d(1)} time="08:16">
          <div className="flex items-center justify-between"><div className="text-[14.5px] font-medium text-white">Devis D-2026-0142</div><Tag c="#30D158">Prêt à envoyer</Tag></div>
          <div className="mt-3 space-y-1.5"><Line l="Remplacement siphon et joints" r="145,00 €" /><Line l="Main-d'œuvre · 1 h 30" r="97,50 €" /><Line l="TVA 10 %" r="24,25 €" /></div>
          <div className="mt-2.5 flex justify-between border-t border-white/[.07] pt-2.5 text-[14px] font-semibold"><span>Total TTC</span><span className="tabular-nums"><Count to={266.75} run={!reduce && on("dev")} /></span></div>
        </Card>
        <Card k="rel" d={d(2)} time="J+3 · 10:02">
          <div className="flex items-start gap-2.5"><MessageSquareText size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-white/40" /><p className="text-[13px] leading-[1.5] text-white/70">« Bonjour Mme Martin, avez-vous pu consulter notre devis ? Je reste disponible pour en parler. »</p></div>
          <div className="mt-4"><Done show={!!reduce || on("rel")} delay={1}>Devis accepté en ligne</Done></div>
        </Card>
        <Card k="ag" d={d(3)} time="10:03">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-[11px] bg-white/[.06] leading-none"><span className="text-[10.5px] font-medium text-[#8B7CFF]">jeu.</span><span className="mt-0.5 text-[17px] font-semibold tabular-nums">19</span></div>
            <div className="min-w-0"><div className="text-[14.5px] font-medium text-white">Intervention calée · 9 h 00</div><div className="mt-0.5 truncate text-[13px] text-white/50">Mme Martin · 12 rue des Lilas, Lyon 3e</div></div>
          </div>
          <div className="mt-4 border-t border-white/[.07] pt-3"><Done show={!!reduce || on("ag")} delay={.8}>Confirmation envoyée par SMS</Done></div>
        </Card>
      </ul>
    </div>

    {/* Message + mascotte */}
    <div className="relative flex shrink-0 items-end justify-between gap-6 px-9 pb-9">
      <div className="max-w-[360px]">
        <h2 className="text-[26px] font-semibold leading-[1.15] tracking-[-0.03em] text-white text-balance">Vous êtes sur le chantier. Akno s'occupe du reste.</h2>
        <p className="mt-3 text-[14.5px] leading-[1.55] text-white/50 [@media(max-height:820px)]:hidden">Votre réceptionniste décroche, prépare le devis, relance et cale le rendez-vous, 24 h/24.</p>
      </div>
      <motion.div aria-hidden className="-mb-1 shrink-0" animate={reduce ? undefined : { y: [0, -5, 0] }} transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}><Blob c="#E6E6E6" s={72} /></motion.div>
    </div>
  </div>
}
