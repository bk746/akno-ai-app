/* update67 · Pile « push » façon iOS pour les fiches de détail (client, membre…).
   La liste reste montée dessous (son défilement et son état sont conservés au retour) : elle glisse de 28 % vers la gauche
   et s'assombrit pendant que la fiche arrive de la droite avec une ombre ; le retour est l'inverse exact.
   Chaque couche a son propre défilement : aucune remise à zéro, aucun saut. */
import { forwardRef, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { PUSH } from "../../lib/motion"

type Props = { base: ReactNode; top: ReactNode | null; topKey?: string; padTop: string | number; padBottom: string | number; inner?: string }

export const PushStack = forwardRef<HTMLDivElement, Props>(function PushStack({ base, top, topKey, padTop, padBottom, inner = "" }, ref) {
  const reduce = useReducedMotion(), open = !!top
  const layer = "absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-contain"
  const pad = (n: ReactNode) => <div style={{ paddingTop: padTop, paddingBottom: padBottom }}><div className={`relative mx-auto w-full px-4 ${inner}`}>{n}</div></div>
  return <div className="relative min-h-0 flex-1 overflow-hidden">
    <motion.div ref={ref} className={layer} aria-hidden={open || undefined} inert={open || undefined}
      initial={false} animate={reduce ? { opacity: open ? 0 : 1 } : { x: open ? "-28%" : "0%" }} transition={reduce ? { duration: .2 } : PUSH}>
      {pad(base)}
    </motion.div>
    <motion.div aria-hidden className="pointer-events-none absolute inset-0 bg-black" initial={false} animate={{ opacity: open && !reduce ? .45 : 0 }} transition={reduce ? { duration: .2 } : PUSH} />
    <AnimatePresence initial={false}>
      {top && <motion.div key={topKey || "top"} className={`${layer} bg-black shadow-[-16px_0_40px_-8px_rgba(0,0,0,.75)]`}
        initial={reduce ? { opacity: 0 } : { x: "100%" }} animate={reduce ? { opacity: 1 } : { x: "0%" }} exit={reduce ? { opacity: 0 } : { x: "100%" }} transition={reduce ? { duration: .2 } : PUSH}>
        {pad(top)}
      </motion.div>}
    </AnimatePresence>
  </div>
})
