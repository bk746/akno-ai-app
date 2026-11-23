/* update77 · Swipe iOS sur une ligne de liste (devis / factures) : un seul ouvert,
   referme au tap ailleurs, ignore le bord gauche (geste retour) et le défilement vertical. */
import { cloneElement, isValidElement, useEffect, useRef, useState, useSyncExternalStore, type ReactElement, type ReactNode } from "react"
import { animate, motion, useDragControls, useMotionValue } from "motion/react"
import { Btn, RED, Sheet } from "../ui"

const SWIPE = 88
const EDGE = 24
const bus = new EventTarget()

export function SwipeRow({ id, first, label, tone = "danger", onAction, children }: {
  id: string
  first?: boolean
  label: string
  tone?: "danger" | "accent"
  onAction: () => void
  children: ReactNode
}) {
  const x = useMotionValue(0)
  const controls = useDragControls()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const dragged = useRef(false)

  const snap = (toOpen: boolean) => {
    setOpen(toOpen)
    if (toOpen) bus.dispatchEvent(new CustomEvent("open", { detail: id }))
    void animate(x, toOpen ? -SWIPE : 0, { type: "spring", stiffness: 400, damping: 38 })
  }

  useEffect(() => {
    const onOpen = (e: Event) => { if ((e as CustomEvent).detail !== id) snap(false) }
    const onPointer = (e: PointerEvent) => {
      if (!open) return
      if (root.current?.contains(e.target as Node)) return
      snap(false)
    }
    bus.addEventListener("open", onOpen)
    document.addEventListener("pointerdown", onPointer)
    return () => { bus.removeEventListener("open", onOpen); document.removeEventListener("pointerdown", onPointer) }
    // snap is stable enough for this listener cycle
  }, [id, open]) // eslint-disable-line react-hooks/exhaustive-deps

  const child = isValidElement(children)
    ? cloneElement(children as ReactElement<{ className?: string }>, { className: `!rounded-none ${(children as ReactElement<{ className?: string }>).props.className || ""}` })
    : children

  return <div ref={root} className={`relative overflow-hidden ${first ? "rounded-t-[24px]" : ""} last:rounded-b-[24px]`} data-swipe-row={id} data-swipe-open={open ? "1" : "0"}>
    <div className="absolute inset-y-0 right-0 flex w-[120px] items-stretch justify-end" aria-hidden={!open}>
      <button type="button" tabIndex={open ? 0 : -1} data-swipe-action={label} aria-label={label}
        onClick={e => { e.stopPropagation(); onAction(); snap(false) }}
        className={`flex w-[88px] items-center justify-center px-2 text-center text-[13px] font-semibold leading-tight text-white ${tone === "danger" ? "bg-[#FF453A]" : "bg-[#2F6BFF]"}`}>{label}</button>
    </div>
    <motion.div drag="x" dragDirectionLock dragListener={false} dragControls={controls}
      dragConstraints={{ left: -SWIPE, right: 0 }} dragElastic={{ left: .22, right: .04 }} dragMomentum={false}
      style={{ x, touchAction: "pan-y" }}
      onPointerDown={e => {
        dragged.current = false
        if ((e.target as HTMLElement).closest("button, a, [data-nodrag]")) return
        if (e.clientX < EDGE) return
        controls.start(e)
      }}
      onDrag={() => { dragged.current = true }}
      onDragEnd={(_, i) => {
        if (Math.abs(i.offset.x) > 8 || Math.abs(i.velocity.x) > 80) dragged.current = true
        const pos = x.get()
        snap(i.velocity.x < -420 || (i.velocity.x > 420 ? false : pos < -SWIPE * .45) || i.offset.x < -44)
        window.setTimeout(() => { dragged.current = false }, 80)
      }}
      onClickCapture={e => {
        if (open || dragged.current) {
          e.stopPropagation()
          e.preventDefault()
          if (open && !dragged.current) snap(false)
        }
      }}
      className="relative bg-[#141416]">
      {child}
    </motion.div>
  </div>
}

export type ConfirmSpec = {
  title: string
  text?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onlyOk?: boolean
  onConfirm?: () => void | Promise<void>
}

let confirmSpec: ConfirmSpec | null = null
const confirmSubs = new Set<() => void>()
const emitConfirm = () => confirmSubs.forEach(f => f())

export function askConfirm(spec: ConfirmSpec) { confirmSpec = spec; emitConfirm() }
export function closeConfirm() { confirmSpec = null; emitConfirm() }

export function ConfirmHost() {
  const spec = useSyncExternalStore(f => { confirmSubs.add(f); return () => { confirmSubs.delete(f) } }, () => confirmSpec, () => null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (!spec) setBusy(false) }, [spec])
  if (!spec) return null
  const close = () => { if (!busy) closeConfirm() }
  const go = async () => {
    if (busy) return
    setBusy(true)
    try { await spec.onConfirm?.() } finally { setBusy(false); closeConfirm() }
  }
  const label = spec.onlyOk ? (spec.confirmLabel || "Compris") : (spec.confirmLabel || "Supprimer")
  return <Sheet title={spec.title} z={80} onClose={close} footer={spec.onlyOk
    ? <Btn primary className="w-full" data-confirm-ok disabled={busy} onClick={go}>{label}</Btn>
    : <div className="grid grid-cols-2 gap-2">
        <Btn data-confirm-cancel disabled={busy} onClick={close}>{spec.cancelLabel || "Annuler"}</Btn>
        <Btn primary c={spec.danger ? RED : undefined} data-confirm-ok disabled={busy} onClick={go}>{label}</Btn>
      </div>}>
    <div data-confirm-sheet>{spec.text ? <p className="text-[15px] leading-6 text-white/70">{spec.text}</p> : <p className="text-[15px] leading-6 text-white/70">Cette action est définitive.</p>}</div>
  </Sheet>
}
