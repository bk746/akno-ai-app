/* update67 · Feuille modale unique de l'app, façon iOS.
   - fond assombri en fondu, montée en ressort (SHEET), poignée ;
   - fermeture : glisser vers le bas (poignée, en-tête, ou contenu déjà en haut de son défilement), tap sur le fond, Échap ;
   - clavier virtuel : la feuille remonte et se raccourcit en douceur (--kb, lib/mobile.ts), sans saut ;
   - bureau : boîte centrée (fondu + léger zoom) ;
   - prefers-reduced-motion : simple fondu.
   À placer dans <AnimatePresence> : la sortie est animée depuis la position courante (y compris après un glissement). */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { animate, motion, useIsPresent, useMotionValue, useReducedMotion } from "motion/react"
import { SHEET, SNAP } from "../../lib/motion"

export type SheetSize = "auto" | "large" | "full"
type Props = {
  label?: string; labelledBy?: string; onClose: () => void; children: ReactNode
  desk?: boolean; z?: number
  /** auto : hauteur du contenu (≤ 92 % de l'écran) · large : presque plein écran (iOS « page sheet ») · full : plein écran */
  size?: SheetSize
  /** classes du panneau (fond, coins, mise en page interne) */
  className?: string
  /** classes du panneau sur ordinateur (largeur, hauteur) */
  deskClass?: string
  style?: CSSProperties
  handle?: boolean
  /** Échap ferme la feuille (désactiver si le composant gère déjà Échap) */
  escape?: boolean
  /** fond cliquable + glisser pour fermer (false pendant un envoi, par ex.) */
  dismissible?: boolean
  deskAlign?: "center" | "top"
  role?: "dialog" | "alertdialog"
  backdrop?: string
  /** appelé une fois la feuille arrivée (ex. focus d'un champ sans à-coup) */
  onEntered?: () => void
}

const stack: number[] = []
/* update73 · pile de feuilles robuste : on sait quelle feuille est au sommet (abonnement), pour que SEULE celle-ci suive le
   clavier (.sheet-kb / --kb). Avant, la feuille du dessous (ex. « Nouveau devis ») remontait et rétrécissait elle aussi quand
   le clavier s'ouvrait dans la feuille du dessus : fond noir en haut, feuille qui « disparaît » puis revient. */
const stackSubs = new Set<() => void>()
/* update85 · après la fermeture d'une feuille du dessus, un tap résiduel (clavier, clic) ne doit pas fermer celles du dessous. */
let dismissUntil = 0
const armDismissLock = () => { dismissUntil = Date.now() + 480 }
const dismissLocked = () => Date.now() < dismissUntil
const stackChanged = () => { stackSubs.forEach(f => f()); document.documentElement.classList.toggle("sheet-open", stack.length > 0) }
const TEXT_FIELD = "input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]),textarea,select,[contenteditable=true]"
const isTextField = (el: Element | null) => !!el && el instanceof HTMLElement && el.matches(TEXT_FIELD)
/** ferme le clavier : retire le focus d'un champ de saisie actif (iOS garde parfois le clavier sans champ visible) */
export const blurTyping = () => { const a = document.activeElement; if (isTextField(a)) (a as HTMLElement).blur() }
let lockN = 0, saved: [string, string] = ["", ""]
const lock = () => { if (lockN++ === 0) { const b = document.body.style, h = document.documentElement.style; saved = [b.overflow, h.overflow]; b.overflow = "hidden"; h.overflow = "hidden" } }
const unlock = () => { if (--lockN === 0) { document.body.style.overflow = saved[0]; document.documentElement.style.overflow = saved[1] } }
let seq = 0
const NO_DRAG = "input[type=range],[data-no-sheet-drag],.leaflet-container"
const scrollerOf = (el: HTMLElement | null, stop: HTMLElement) => {
  for (let n = el; n && n !== stop; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY
    if ((o === "auto" || o === "scroll") && n.scrollHeight > n.clientHeight + 1) return n
  }
  return null
}

export default function ModalSheet({ label, labelledBy, onClose, children, desk, z = 50, size = "auto", className = "", deskClass = "max-w-[480px]", style, handle = true, escape = true, dismissible = true, deskAlign = "center", role = "dialog", backdrop = "bg-black/85", onEntered }: Props) {
  const reduce = useReducedMotion()
  const panel = useRef<HTMLDivElement>(null), id = useRef(0)
  const y = useMotionValue<any>(0), dim = useMotionValue(1)
  const close = useRef(onClose); close.current = onClose
  const canDismiss = useRef(dismissible); canDismiss.current = dismissible
  const entered = useRef(false)
  const present = useRef(true); present.current = useIsPresent()
  const isTopRef = useRef(true)

  // pile des feuilles ouvertes : seule la plus haute répond à Échap ; défilement de la page verrouillé
  const [isTop, setTop] = useState(true), [under, setUnder] = useState(false)
  isTopRef.current = isTop
  useLayoutEffect(() => {
    // update73 · mobile : le clavier se ferme avant l'ouverture d'une feuille (pas de clavier « fantôme » sans champ)
    if (!desk) blurTyping()
    id.current = ++seq; setUnder(stack.length > 0); stack.push(id.current); lock(); stackChanged()
    const me = id.current, sync = () => setTop(stack[stack.length - 1] === me); stackSubs.add(sync); sync()
    const prev = document.activeElement as HTMLElement | null
    requestAnimationFrame(() => { const p = panel.current; if (p && !p.contains(document.activeElement)) p.focus({ preventScroll: true }) })
    return () => {
      stackSubs.delete(sync)
      const i = stack.indexOf(me); if (i >= 0) stack.splice(i, 1); unlock(); stackChanged()
      // fermeture : on retire le focus d'un champ de cette feuille (sinon le clavier reste ouvert sans champ) ; sur mobile on ne
      // redonne jamais le focus à un champ de saisie de la feuille du dessous (le clavier se rouvrirait tout seul)
      const p = panel.current, a = document.activeElement
      if (a instanceof HTMLElement && (!a.isConnected || (p && p.contains(a)))) a.blur()
      if (prev && document.contains(prev) && (desk || !isTextField(prev))) prev.focus?.({ preventScroll: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!escape) return
    const f = (e: KeyboardEvent) => { if (e.key === "Escape" && stack[stack.length - 1] === id.current && canDismiss.current) { e.preventDefault(); close.current() } }
    addEventListener("keydown", f); return () => removeEventListener("keydown", f)
  }, [escape])

  // glisser vers le bas pour fermer (tactile : contenu en haut de son défilement ; souris : poignée / en-tête)
  useEffect(() => {
    const p = panel.current
    if (!p || desk) return
    let y0 = 0, x0 = 0, t0 = 0, lastY = 0, lastT = 0, vy = 0, state: "idle" | "wait" | "drag" | "off" = "idle", sc: HTMLElement | null = null
    const h = () => p.getBoundingClientRect().height || 600
    const begin = (cy: number, cx: number, target: HTMLElement | null) => {
      if (!isTopRef.current || !canDismiss.current || (target && target.closest(NO_DRAG))) { state = "off"; return }
      y0 = lastY = cy; x0 = cx; t0 = lastT = performance.now(); vy = 0; state = "wait"; sc = scrollerOf(target, p)
    }
    const move = (cy: number, cx: number): boolean => {
      if (state === "off" || state === "idle") return false
      const dy = cy - y0, dx = cx - x0
      if (state === "wait") {
        if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return false
        if (Math.abs(dx) > Math.abs(dy) || dy < 0 || (sc && sc.scrollTop > 0)) { state = "off"; return false }
        state = "drag"; y0 = cy
        ;(document.activeElement as HTMLElement | null)?.blur?.()
      }
      const now = performance.now(); if (now > lastT) { vy = (cy - lastY) / (now - lastT); lastY = cy; lastT = now }
      const d = Math.max(0, cy - y0), r = d < 0 ? 0 : d
      y.set(r); dim.set(Math.max(0, 1 - r / h()))
      return true
    }
    const end = () => {
      if (state !== "drag") { state = "idle"; return }
      state = "idle"
      const d = Number(y.get()) || 0
      // fermeture refusée (ex. « devis non enregistré ») : la feuille revient en place
      if (d > Math.min(140, h() * .3) || (vy > .55 && d > 24)) { armDismissLock(); close.current(); setTimeout(() => { if (present.current && panel.current) { animate(y, 0, SHEET); animate(dim, 1, { duration: .25 }) } }, 450) }
      else { animate(y, 0, SHEET); animate(dim, 1, { duration: .25 }) }
      void t0
    }
    const ts = (e: TouchEvent) => { if (e.touches.length === 1) begin(e.touches[0].clientY, e.touches[0].clientX, e.target as HTMLElement); else state = "off" }
    const tm = (e: TouchEvent) => { if (e.touches.length !== 1) return; if (move(e.touches[0].clientY, e.touches[0].clientX) && e.cancelable) e.preventDefault() }
    const te = () => end()
    // souris (et stylet) : uniquement depuis la poignée / l'en-tête (64 px du haut)
    const pd = (e: PointerEvent) => {
      if (e.pointerType === "touch" || e.button !== 0) return
      if (e.clientY - p.getBoundingClientRect().top > 64 && !(e.target as HTMLElement).closest("[data-sheet-grab]")) return
      begin(e.clientY, e.clientX, e.target as HTMLElement); sc = null
      const pm = (ev: PointerEvent) => { if (move(ev.clientY, ev.clientX)) ev.preventDefault() }
      const pu = () => { removeEventListener("pointermove", pm); removeEventListener("pointerup", pu); removeEventListener("pointercancel", pu); end() }
      addEventListener("pointermove", pm); addEventListener("pointerup", pu); addEventListener("pointercancel", pu)
    }
    p.addEventListener("touchstart", ts, { passive: true }); p.addEventListener("touchmove", tm, { passive: false }); p.addEventListener("touchend", te); p.addEventListener("touchcancel", te)
    p.addEventListener("pointerdown", pd)
    return () => { p.removeEventListener("touchstart", ts); p.removeEventListener("touchmove", tm); p.removeEventListener("touchend", te); p.removeEventListener("touchcancel", te); p.removeEventListener("pointerdown", pd) }
  }, [desk, y, dim])

  // update69 : hauteur de référence --sheet-vh (index.css) = 100dvh, ou 100lvh en PWA installée (plein écran, zones sûres comprises)
  // update71 : jamais plus haut que la zone réellement visible (min(--sheet-vh, 100 %)) — sinon le bas de la feuille
  // (total, boutons « PDF / Envoyer ») passait sous le bord de l'écran sur iPhone.
  // update81 · le calage clavier n'est plus un translate ni une hauteur visuelle « calée en haut » :
  // le fond (overlay) couvre tout l'écran, y compris derrière le clavier ; la zone utile de la feuille
  // s'arrête à --kb (bas au ras du clavier). On ne retranche --kb qu'une seule fois.
  const H = size === "full" ? "100%" : size === "large" ? "calc(100% - var(--sat, 0px) - 10px)" : undefined
  const mobile: any = { y, height: H, maxHeight: size === "full" ? undefined : "calc(100% - var(--sat, 0px) - 10px)", ...style }
  const anim = desk
    ? { initial: { opacity: 0, scale: .96, y: 8 }, animate: { opacity: 1, scale: 1, y: 0, transition: SNAP }, exit: { opacity: 0, scale: .97, transition: { duration: .16 } } }
    : reduce
      ? { initial: { opacity: 0 }, animate: { opacity: 1, transition: { duration: .2 } }, exit: { opacity: 0, transition: { duration: .16 } } }
      : { initial: { y: "100%" }, animate: { y: 0, transition: SHEET }, exit: { y: "100%", transition: { ...SHEET, restDelta: 1 } } }

  const node = <div data-sheet-root className={`fixed inset-0 flex ${desk ? (deskAlign === "top" ? "items-start justify-center pt-[12vh]" : "items-center justify-center p-6") : "items-end justify-center"}`} style={{ zIndex: z }}>
    <motion.div aria-hidden data-sheet-backdrop className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: .28, ease: [.22, 1, .36, 1] } }} exit={{ opacity: 0, transition: { duration: .24 } }}
      style={{ pointerEvents: isTop ? "auto" : "none" }}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); if (!isTop || !canDismiss.current || dismissLocked()) return; armDismissLock(); close.current() }}>
      <motion.div className={`absolute inset-0 ${under ? "bg-black/70" : backdrop}`} style={{ opacity: dim }} />
    </motion.div>
    <div className={desk ? "relative flex w-full justify-center" : `pointer-events-none absolute inset-x-0 top-0 flex items-end justify-center${isTop ? (size === "full" || size === "large" ? " kb-follow-pad" : " kb-follow") : ""}`}
      style={desk ? undefined : { bottom: 0 }}>
      <motion.div ref={panel} role={role} aria-modal="true" aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy} tabIndex={-1}
        {...anim} style={desk ? style : mobile}
        onPointerDown={e => e.stopPropagation()} onAnimationStart={() => { if (panel.current) panel.current.style.willChange = "transform" }} onAnimationComplete={() => { if (panel.current) panel.current.style.willChange = "auto"; if (!entered.current) { entered.current = true; onEntered?.() } }}
        className={`pointer-events-auto relative flex w-full flex-col overflow-hidden text-white outline-none ${desk ? `max-h-[88dvh] rounded-[24px] border border-white/[.08] shadow-[0_40px_80px_-20px_rgba(0,0,0,.95)] ${deskClass}` : `max-w-[640px] ${size === "full" ? "" : "rounded-t-[22px] shadow-[0_-24px_60px_-18px_rgba(0,0,0,.9)]"}`} ${className}`}>
        {!desk && handle && <div aria-hidden data-sheet-grab className="pointer-events-none absolute left-1/2 top-[6px] z-30 h-[5px] w-9 -translate-x-1/2 rounded-full bg-white/25" />}
        {children}
      </motion.div>
    </div>
  </div>
  return createPortal(node, document.body)
}
