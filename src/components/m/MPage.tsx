/* Refonte iOS passe 2 · briques des écrans poussés (fiches, listes complètes) d'après les maquettes :
   - BackBtn : rond de 44 pt en verre clair (maquettes Clients, fiche client, Réglages) ou sombre (fiche contact).
   - PushLayer : écran poussé depuis la droite par-dessus l'onglet, la barre d'onglets reste visible au-dessus.
   - MHead : barre compacte (titre + sous-titre centrés) qui apparaît au défilement des fiches. */
import { useEffect, useRef, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react"
import { ChevronLeft } from "lucide-react"
import { hapticTap } from "../../lib/haptics"
import { PUSH } from "../../lib/motion"

export function BackBtn({ on, dark, label = "Retour", className = "" }: { on: () => void; dark?: boolean; label?: string; className?: string }) {
  return <motion.button type="button" aria-label={label} whileTap={{ scale: .9 }} onClick={() => { void hapticTap(); on() }}
    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full [-webkit-tap-highlight-color:transparent] ${dark ? "ak-nb text-[#fff]" : "ak-caps text-[#000]"} ${className}`}>
    <ChevronLeft size={22} strokeWidth={2} className="-ml-0.5" />
  </motion.button>
}
/** bouton texte en verre (« Modifier », « Terminé ») */
export function GlassBtn({ children, on, dark, label }: { children: ReactNode; on: () => void; dark?: boolean; label?: string }) {
  return <motion.button type="button" aria-label={label} whileTap={{ scale: .94 }} onClick={() => { void hapticTap(); on() }}
    className={`flex h-11 shrink-0 items-center rounded-[22px] px-5 text-[17px] font-medium [-webkit-tap-highlight-color:transparent] ${dark ? "ak-nb text-[#fff]" : "ak-caps text-[#000]"}`}>{children}</motion.button>
}

/** marque la barre d'onglets en verre sombre tant qu'un écran sombre est affiché (maquette fiche contact) */
export function useDarkNav(on: boolean) {
  useEffect(() => {
    if (!on) return
    const el = document.documentElement; el.classList.add("nav-dark")
    return () => { el.classList.remove("nav-dark") }
  }, [on])
}

/** hôte des écrans poussés : même contexte d'empilement que la barre d'onglets (racine isolée), pour qu'elle reste au-dessus */
const pushHost = () => (document.querySelector("[data-mobile-nav]")?.parentElement as HTMLElement | null) || document.body
/** écran poussé : couvre la page (sous la barre d'onglets, z 26 < 30), glisse depuis la droite, retour = glisser vers la droite */
export function PushLayer({ children, onClose, dark, label, bg }: { children: ReactNode; onClose: () => void; dark?: boolean; label: string; bg?: string }) {
  const reduce = useReducedMotion()
  useDarkNav(!!dark)
  return createPortal(<motion.div role="dialog" aria-modal="true" aria-label={label} data-push-layer
    className="fixed inset-0 z-[26] flex flex-col overflow-hidden" style={{ background: bg || (dark ? "#000" : "#fff") }}
    initial={reduce ? { opacity: 0 } : { x: "100%" }} animate={{ x: 0, opacity: 1 }} exit={reduce ? { opacity: 0 } : { x: "100%" }} transition={reduce ? { duration: .16 } : PUSH}
    drag={reduce ? false : "x"} dragConstraints={{ left: 0, right: 0 }} dragElastic={{ left: 0, right: .6 }} dragDirectionLock dragSnapToOrigin
    onDragEnd={(_e, i) => { if (i.offset.x > 110 || i.velocity.x > 600) onClose() }}
    onKeyDown={e => { if (e.key === "Escape") onClose() }}>
    {children}
  </motion.div>, pushHost())
}

/** zone qui défile d'un écran poussé, avec barre compacte (titre centré) qui apparaît après `at` points */
export function PushScroll({ children, head, at = 160, dark, left, right, right2, title, sub, padTop, noFoot }: { padTop?: string; noFoot?: boolean; children: ReactNode; head?: ReactNode; at?: number; dark?: boolean; left?: ReactNode; right?: ReactNode; right2?: ReactNode; title?: ReactNode; sub?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollY } = useScroll({ container: ref })
  const op = useTransform(scrollY, [at - 30, at], [0, 1]), op0 = useTransform(op, v => 1 - v)
  const dispR = useTransform(op, v => v > .98 ? "none" : "block"), dispR2 = useTransform(op, v => v < .02 ? "none" : "block")
  return <div className="relative flex min-h-0 flex-1 flex-col">
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20" style={{ paddingTop: padTop || (dark ? "max(calc(var(--sat) + 5px), 6px)" : "max(calc(var(--sat) - 7px), 6px)") }}>
      <motion.div aria-hidden className={`absolute inset-0 ${dark === false ? "border-b border-[rgba(60,60,67,.16)] bg-[rgba(255,255,255,.86)]" : "bg-[#000]"} backdrop-blur-[20px]`} style={{ opacity: op }} />
      <div className={`relative flex h-[52px] items-center justify-between pb-1 ${dark ? "px-5" : "px-3"}`}>
        <span className="pointer-events-auto">{left}</span>
        {title && <motion.div className="absolute inset-x-20 text-center" style={{ opacity: op }}><div className={`truncate text-[17px] font-semibold leading-[22px] ${dark === false ? "text-[#000]" : "text-[#fff]"}`}>{title}</div>{sub && <div className={`truncate text-[13px] leading-4 ${dark === false ? "text-[#6E6E73]" : "text-[rgba(235,235,245,.6)]"}`}>{sub}</div>}</motion.div>}
        {right2 ? <span className="relative"><motion.span className="pointer-events-auto block" style={{ opacity: op0, display: dispR }}>{right}</motion.span><motion.span className="pointer-events-auto absolute right-0 top-1/2 -translate-y-1/2" style={{ opacity: op, display: dispR2 }}>{right2}</motion.span></span> : <span className="pointer-events-auto">{right}</span>}
      </div>
    </div>
    <div ref={ref} data-page-scroll className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain">
      {head}
      {children}
      {!noFoot && <div aria-hidden style={{ height: "var(--page-bottom)" }} />}
    </div>
  </div>
}

/** liste complète (Tous les devis / Toutes les factures) : page blanche poussée */
export function MListPage({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return <div data-doc-list className="flex min-h-0 flex-1 flex-col bg-[#000]">
    <div className="flex shrink-0 items-center gap-3 px-3 pb-3" style={{ paddingTop: "max(calc(var(--sat) - 7px), 6px)" }}>
      <BackBtn on={onBack} />
      <h1 className="min-w-0 flex-1 truncate text-[22px] font-semibold leading-7 tracking-[-0.01em] text-[#fff]">{title}</h1>
    </div>
    <div data-page-scroll className="ak-sheet akno-light min-h-0 flex-1 overflow-y-auto px-4 pt-2">
      <div aria-hidden className="ak-grab mb-2" />
      {children}
      <div aria-hidden style={{ height: "var(--page-bottom)" }} />
    </div>
  </div>
}

/** titre de section des feuilles blanches des fiches (22 pt, maquettes « Coordonnées », « Chantier »…) */
export const SecT = ({ t, aside, className = "" }: { t: ReactNode; aside?: ReactNode; className?: string }) =>
  <div className={`flex items-center justify-between px-1 pb-2.5 pt-7 ${className}`}><h2 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-[#000]">{t}</h2>{aside}</div>
/** carte grise groupée (#F2F2F7, coins 20) */
export const Grp = ({ children, className = "" }: { children: ReactNode; className?: string }) => <div className={`overflow-hidden rounded-[20px] bg-[#F2F2F7] ${className}`}>{children}</div>
