/* update62 · Barre d'onglets mobile (maquettes navbar.jpg + bouton-plus.jpg)
   Pilule sombre flottante : Réception · Agenda · [+] · Chantiers · Factures.
   Le « + » déploie le menu « Créer » depuis le bouton (update69), au-dessus d'un fond légèrement flouté.
   Animations : ressorts (transform / opacity uniquement), indicateur d'onglet glissant (layoutId),
   respect de prefers-reduced-motion via le MotionConfig de l'app.
   Fermeture : ×, tap sur le fond, Échap, bouton retour Android (entrée d'historique). */
import { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Lock, MapPin, Plus, Repeat2, UserRound, Users } from "lucide-react"
import type { P } from "../ui"
import { EASE_OUT } from "../../lib/motion"
import { lastDocMode } from "../../lib/facturesLite"

export type CreateKind = "chantier" | "equipe" | "clients" | "relances" // update67 : RDV / devis / facture retirés ; update81 : Relances
type Tab = "rec" | "ag" | "ch" | "fac"

const Ico = ({ d }: { d: React.ReactNode }) => <svg width={23} height={23} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
const ICONS: Record<Tab, React.ReactNode> = {
  rec: <path d="M5.5 4.5h3l1.5 4-2 1.25a10 10 0 0 0 6.25 6.25L15.5 14l4 1.5v3a1.5 1.5 0 0 1-1.5 1.5A14.5 14.5 0 0 1 4 6a1.5 1.5 0 0 1 1.5-1.5Z" />,
  ag: <><rect x="4" y="5.5" width="16" height="14" rx="3.5" /><path d="M8.5 3.5v3.5M15.5 3.5v3.5M4 10.5h16" /></>,
  ch: <><path d="M12 20.5s-6.25-5.4-6.25-10.6a6.25 6.25 0 0 1 12.5 0c0 5.2-6.25 10.6-6.25 10.6Z" /><circle cx="12" cy="9.9" r="2.3" /></>,
  fac: <><path d="M7 3.5h7l4.5 4.5v10.5A2 2 0 0 1 16.5 20.5h-9.5A2 2 0 0 1 5 18.5v-13a2 2 0 0 1 2-2Z" /><path d="M13.5 3.5V8h5M8.5 12.5h7M8.5 16h4.5" /></>,
}
const LABEL: Record<Tab, string> = { rec: "Réception", ag: "Agenda", ch: "Chantiers", fac: "Factures" }
/** Onglet actif : Devis et Factures vivent dans l'onglet Factures. Relance, Réglages, Équipe, Clients : aucun onglet (update67). */
export const tabOf = (p: P): Tab | null => p === "rec" || p === "ag" || p === "ch" ? p : p === "fac" || p === "dev" ? "fac" : null

const TILES: { k: CreateKind; l: string; I: typeof MapPin; p: P }[] = [
  { k: "chantier", l: "Nouveau chantier", I: MapPin, p: "ch" }, { k: "clients", l: "Clients", I: UserRound, p: "cl" }, { k: "equipe", l: "Équipe", I: Users, p: "eq" },
  { k: "relances", l: "Relances", I: Repeat2, p: "rel" },
]
const spring = { type: "spring" as const, stiffness: 520, damping: 38, mass: .8 }
/** update70 · pastille de l'onglet actif : glissement visible et net (≈ 250 ms, sans rebond), façon Revolut */
const PILL = { type: "spring" as const, stiffness: 380, damping: 36, mass: .9 }
/* update68 : la règle globale `button { transition: … opacity .2s, transform .15s }` (index.css, hors @layer donc plus forte
   que `transition-colors`) s'appliquait aussi aux tuiles animées par motion. Sur WebKit (Safari / PWA iPhone), quand
   l'animation WAAPI de motion se termine, la valeur finale est écrite en style inline et WebKit lance alors une
   transition CSS depuis l'état de départ (opacité 0, y 14) : les tuiles disparaissaient puis réapparaissaient.
   Les tuiles ne gardent donc que les transitions de couleur ; opacité/transform restent pilotés par motion seul. */
const TILE_NO_CSS_TR = { transitionProperty: "color, background-color, border-color" } as const
const TILE_V = { h: { opacity: 0, y: 8, scale: .94 }, s: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, stiffness: 520, damping: 34 } } }
const BAR_BOTTOM = "var(--nav-gap)"
/** update70 · barre affinée façon Revolut (64 px), pilule translucide floutée ; le contenu défile dessous */
const BAR_H = 64
/* update69 · menu « Créer » : naît du centre du « + » (12 px d'écart + demi-barre de 36 px sous le menu) */
const MENU_ORIGIN = "50% calc(100% + 44px)" // update70 : 12 px + demi-barre de 32 px
const MENU_HIDDEN = { opacity: 0, scale: .3, y: 10 }
const MENU_IN = { type: "spring" as const, stiffness: 560, damping: 38, mass: .8 }
const MENU_OUT = { type: "spring" as const, stiffness: 620, damping: 46, restDelta: .01 }

function TabBtn({ t, on, badge, recLocked, onTap, onIntent }: { t: Tab; on: boolean; badge: number; recLocked: boolean; onTap: (t: Tab) => void; onIntent?: (p: P) => void }) {
  return <motion.button type="button" onClick={() => onTap(t)} onPointerDown={() => onIntent?.(t)} onPointerEnter={() => onIntent?.(t)} aria-label={t === "fac" && badge > 0 ? `${LABEL[t]}, ${badge} à encaisser` : LABEL[t]} aria-current={on ? "page" : undefined} whileTap={{ scale: .92 }} transition={spring}
      className={`relative flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-[4px] rounded-full outline-none transition-colors duration-200 [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-white/40 ${on ? "text-white" : "text-white/50"}`} data-tab={t}>
      {on && <motion.span layoutId="m-tab-pill" data-tab-pill transition={PILL} className="absolute inset-0 rounded-full bg-white/[.13] shadow-[inset_0_1px_0_rgba(255,255,255,.06)]" />}
      <span className="relative"><Ico d={ICONS[t]} />
        {t === "rec" && recLocked && <span aria-hidden className="absolute -bottom-1 -right-2 flex h-[15px] w-[15px] items-center justify-center rounded-full bg-[#2C2C2E] text-white/70 ring-2 ring-[#161618]"><Lock size={8} strokeWidth={2.6} /></span>}
        <AnimatePresence>{t === "fac" && badge > 0 && <motion.span key="b" aria-hidden initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={spring}
          className="absolute -right-[9px] -top-[7px] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-white px-[5px] text-[11px] font-bold leading-none text-black ring-2 ring-[#161618]">{badge > 99 ? "99+" : badge}</motion.span>}</AnimatePresence>
      </span>
      <span className={`relative whitespace-nowrap text-[11px] leading-none tracking-[-0.005em] ${on ? "font-semibold" : "font-medium"}`}>{LABEL[t]}</span>
    </motion.button>
}

export default function MobileNav({ page, go, badge, recLocked, onCreate, onIntent, employee }: { page: P; go: (p: P) => void; badge: number; recLocked: boolean; onCreate: (k: CreateKind) => void; onIntent?: (p: P) => void; employee?: boolean }) {
  const [open, setOpen] = useState(false)
  const openRef = useRef(false), pushed = useRef(false), closing = useRef(false), pending = useRef<(() => void) | null>(null), lastToggle = useRef(0)
  openRef.current = open
  const onIntentRef = useRef(onIntent); onIntentRef.current = onIntent
  const finish = useCallback(() => {
    closing.current = false; pushed.current = false; setOpen(false)
    const a = pending.current; pending.current = null
    if (a) requestAnimationFrame(() => a())
  }, [])
  const show = useCallback(() => {
    if (openRef.current || closing.current) return
    setOpen(true); for (const x of TILES) onIntentRef.current?.(x.p)
    try { history.pushState({ ...(history.state || {}), aknoCreate: true }, ""); pushed.current = true } catch { pushed.current = false }
  }, [])
  const hide = useCallback((after?: () => void) => {
    if (!openRef.current || closing.current) return
    pending.current = after || null
    if (pushed.current) {
      closing.current = true
      history.back() // l'entrée « feuille ouverte » est retirée ; popstate termine la fermeture
      setTimeout(() => { if (closing.current) finish() }, 450) // filet de sécurité si popstate n'arrive pas
    } else finish()
  }, [finish])
  // Bouton retour Android / geste retour : ferme la feuille au lieu de quitter la page
  useEffect(() => {
    const f = () => { if (pushed.current || closing.current) finish() }
    addEventListener("popstate", f); return () => removeEventListener("popstate", f)
  }, [finish])
  // Échap
  useEffect(() => {
    if (!open) return
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); hide() } }
    addEventListener("keydown", f); return () => removeEventListener("keydown", f)
  }, [open, hide])
  // Verrouillage du défilement de la page sous la feuille
  useEffect(() => {
    if (!open) return
    const b = document.body.style, h = document.documentElement.style, pb = b.overflow, ph = h.overflow
    b.overflow = "hidden"; h.overflow = "hidden"
    return () => { b.overflow = pb; h.overflow = ph }
  }, [open])
  // Changement de page venu d'ailleurs (notification, lien) : on ferme sans toucher à l'historique
  const pageRef = useRef(page)
  useEffect(() => { if (pageRef.current !== page) { pageRef.current = page; if (openRef.current && !closing.current) { pushed.current = false; pending.current = null; setOpen(false) } } }, [page])
  const toggle = () => { const now = Date.now(); if (now - lastToggle.current < 220) return; lastToggle.current = now; if (openRef.current) hide(); else show() }
  // update63 · l'onglet Factures rouvre le dernier mode choisi (Devis ou Factures) ; déjà dans l'onglet : rien ne bouge
  const dest = (t: Tab): P => t === "fac" ? lastDocMode() : t
  const tapTab = (t: Tab) => { const run = () => { if (tabOf(pageRef.current) !== t) go(dest(t)) }; if (openRef.current) hide(run); else run() }
  const pick = (k: CreateKind) => hide(() => onCreate(k))
  const active = tabOf(page)
  return <>
    {/* update69 : le « + » déploie un menu flottant qui naît du bouton (au-dessus de la barre, centré sur le +) au lieu
        d'une feuille montant du bas de l'écran. Fond légèrement assombri et flouté, menu en ressort depuis le +
        (transform-origin = centre du +), tuiles en légère cascade (une seule fois, cf. update68) ; la fermeture rejoue
        l'animation à l'envers, vers le +. La barre reste visible et au-dessus. */}
    <AnimatePresence>{open && <motion.div key="cr-bg" aria-hidden data-create-backdrop className="fixed inset-0 z-[34] touch-none overscroll-none bg-black/45 backdrop-blur-[3px]"
      initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: .22, ease: EASE_OUT } }} exit={{ opacity: 0, transition: { duration: .2, ease: EASE_OUT } }} onClick={() => hide()} />}</AnimatePresence>
    <AnimatePresence>{open && <motion.div key="cr-menu" role="dialog" aria-modal="true" aria-labelledby="cr-title" data-create-sheet data-create-menu
      className="fixed inset-x-0 z-[35] mx-auto w-[min(352px,calc(100vw-32px))] touch-none overscroll-none rounded-[28px] border border-white/[.09] bg-[#1C1C1E] p-2 shadow-[0_30px_60px_-18px_rgba(0,0,0,.95),0_10px_24px_-12px_rgba(0,0,0,.7),inset_0_1px_0_rgba(255,255,255,.05)] will-change-transform"
      style={{ bottom: `calc(${BAR_BOTTOM} + ${BAR_H}px + 12px)`, transformOrigin: MENU_ORIGIN }}
      initial={MENU_HIDDEN} animate={{ opacity: 1, scale: 1, y: 0, transition: MENU_IN }} exit={{ ...MENU_HIDDEN, transition: MENU_OUT }}>
      <h2 id="cr-title" className="sr-only">Créer</h2>
      <motion.div className="grid grid-cols-3 gap-2" initial="h" animate="s" variants={{ h: {}, s: { transition: { staggerChildren: .035, delayChildren: .04 } } }}>
        {TILES.map(x => <motion.button key={x.k} type="button" onClick={() => pick(x.k)} variants={TILE_V} whileTap={{ scale: .95 }} style={TILE_NO_CSS_TR}
          className="flex h-[92px] flex-col items-center justify-center gap-2 rounded-[21px] bg-white/[.07] px-2 text-center text-[13px] font-medium leading-[1.2] text-white outline-none transition-colors [-webkit-tap-highlight-color:transparent] hover:bg-white/[.1] active:bg-white/[.12] focus-visible:ring-2 focus-visible:ring-white/40">
          <x.I size={22} strokeWidth={1.75} aria-hidden />{x.l}
        </motion.button>)}
      </motion.div>
    </motion.div>}</AnimatePresence>
    <nav aria-label="Navigation principale" data-mobile-nav className={`kb-hide pointer-events-none fixed inset-x-4 flex justify-center ${open ? "z-[36]" : "z-30"}`} style={{ bottom: BAR_BOTTOM }}>
      <div className="pointer-events-auto flex w-full max-w-[520px] items-center rounded-full border border-white/[.10] bg-[#161618]/70 p-[5px] shadow-[0_24px_48px_-12px_rgba(0,0,0,.85),0_8px_16px_-8px_rgba(0,0,0,.6),inset_0_1px_0_rgba(255,255,255,.04)] backdrop-blur-[24px] backdrop-saturate-[1.8]" style={{ height: BAR_H }} data-bar-pill>
        {employee ? <TabBtn t="ag" on={active === "ag"} badge={badge} recLocked={recLocked} onTap={tapTab} onIntent={onIntent} /> : <>
        <TabBtn t="rec" on={active === "rec"} badge={badge} recLocked={recLocked} onTap={tapTab} onIntent={onIntent} /><TabBtn t="ag" on={active === "ag"} badge={badge} recLocked={recLocked} onTap={tapTab} onIntent={onIntent} />
        <div className="flex h-full flex-1 items-center justify-center">
          <motion.button type="button" onClick={toggle} aria-label={open ? "Fermer" : "Créer"} aria-expanded={open} aria-haspopup="dialog" whileTap={{ scale: .9 }} transition={spring}
            data-create-btn className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-white text-black shadow-[0_10px_28px_-6px_rgba(255,255,255,.28),0_6px_14px_-6px_rgba(0,0,0,.6)] outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-4 focus-visible:ring-white/30">
            <motion.span className="flex" initial={false} animate={{ rotate: open ? 45 : 0 }} transition={{ type: "spring", stiffness: 460, damping: 28 }}><Plus size={25} strokeWidth={2.1} /></motion.span>
          </motion.button>
        </div>
        <TabBtn t="ch" on={active === "ch"} badge={badge} recLocked={recLocked} onTap={tapTab} onIntent={onIntent} /><TabBtn t="fac" on={active === "fac"} badge={badge} recLocked={recLocked} onTap={tapTab} onIntent={onIntent} />
        </>}
      </div>
    </nav>
  </>
}
