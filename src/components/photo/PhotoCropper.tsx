/* update67 · Recadrage de photo de profil (façon iOS « Déplacer et zoomer »).
   Masque circulaire ; déplacer au doigt ou à la souris ; zoom au pincement, à la molette ou au curseur ; Annuler / Valider.
   Sortie : carré ~512 px (JPEG), prêt pour le bucket « equipe ». */
import { useEffect, useRef, useState } from "react"
import { animate, motion, useMotionValue } from "motion/react"
import { ZoomIn, ZoomOut } from "lucide-react"
import ModalSheet from "../sheet/ModalSheet"
import { SNAP } from "../../lib/motion"

const MAXZ = 4

/** Découpe un carré `size`×`size` dans l'image selon le cadrage (utilisé aussi par les tests). */
export function cropToBlob(img: HTMLImageElement, view: { d: number; base: number; z: number; x: number; y: number }, size = 512, type = "image/jpeg", q = .9): Promise<Blob> {
  const k = view.base * view.z, side = view.d / k
  const cx = img.naturalWidth / 2 - view.x / k, cy = img.naturalHeight / 2 - view.y / k
  const cv = document.createElement("canvas"); cv.width = size; cv.height = size
  const g = cv.getContext("2d")!; g.imageSmoothingQuality = "high"
  g.fillStyle = "#000"; g.fillRect(0, 0, size, size)
  g.drawImage(img, cx - side / 2, cy - side / 2, side, side, 0, 0, size, size)
  return new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error("toBlob")), type, q))
}

export default function PhotoCropper({ file, onCancel, onDone, z = 90, size = 512, title = "Déplacer et zoomer" }: { file: File; onCancel: () => void; onDone: (f: File) => void; z?: number; size?: number; title?: string }) {
  const [url, setUrl] = useState("")
  useEffect(() => { const u = URL.createObjectURL(file); setUrl(u); return () => URL.revokeObjectURL(u) }, [file])
  const img = useRef<HTMLImageElement>(null), stage = useRef<HTMLDivElement>(null)
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null), [err, setErr] = useState(false), [busy, setBusy] = useState(false)
  const [D, setD] = useState(() => Math.min(320, (typeof innerWidth === "number" ? innerWidth : 390) - 56))
  useEffect(() => { const f = () => setD(Math.min(320, innerWidth - 56)); addEventListener("resize", f); return () => removeEventListener("resize", f) }, [])
  const x = useMotionValue(0), y = useMotionValue(0), zm = useMotionValue(1)
  const [zv, setZv] = useState(1)
  const base = nat ? D / Math.min(nat.w, nat.h) : 1
  const sc = useMotionValue(1)
  useEffect(() => { const u = zm.on("change", v => { sc.set(v * base); setZv(v) }); sc.set(zm.get() * base); return u }, [zm, sc, base])

  const lim = (zz: number) => nat ? [Math.max(0, (nat.w * base * zz - D) / 2), Math.max(0, (nat.h * base * zz - D) / 2)] : [0, 0]
  const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v))
  // zoom autour d'un point (coordonnées relatives au centre du cercle)
  const zoomTo = (nz: number, px = 0, py = 0) => {
    const z0 = zm.get(); nz = Math.max(1, Math.min(MAXZ, nz)); const r = nz / z0
    const [mx, my] = lim(nz)
    x.set(clamp(px - (px - x.get()) * r, mx)); y.set(clamp(py - (py - y.get()) * r, my)); zm.set(nz)
  }

  // gestes : 1 pointeur = déplacer, 2 = pincer ; molette = zoom
  useEffect(() => {
    const el = stage.current; if (!el || !nat) return
    const pts = new Map<number, { x: number; y: number }>()
    let last: { x: number; y: number; d: number } | null = null
    const center = () => { const r = el.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 } }
    const snap = () => { const p = [...pts.values()]; if (!p.length) { last = null; return } const mx = p.reduce((a, b) => a + b.x, 0) / p.length, my = p.reduce((a, b) => a + b.y, 0) / p.length; last = { x: mx, y: my, d: p.length > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0 } }
    const down = (e: PointerEvent) => { e.preventDefault(); el.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); snap() }
    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId) || !last) return
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const p = [...pts.values()], mx = p.reduce((a, b) => a + b.x, 0) / p.length, my = p.reduce((a, b) => a + b.y, 0) / p.length
      if (p.length > 1 && last.d) {
        const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), { cx, cy } = center()
        zoomTo(zm.get() * d / last.d, mx - cx, my - cy)
        last.d = d
      }
      const [lx, ly] = lim(zm.get())
      x.set(clamp(x.get() + mx - last.x, lx)); y.set(clamp(y.get() + my - last.y, ly))
      last.x = mx; last.y = my
    }
    const up = (e: PointerEvent) => { pts.delete(e.pointerId); snap() }
    const wheel = (e: WheelEvent) => { e.preventDefault(); const { cx, cy } = center(); zoomTo(zm.get() * Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0025)), e.clientX - cx, e.clientY - cy) }
    el.addEventListener("pointerdown", down); el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up)
    el.addEventListener("wheel", wheel, { passive: false })
    return () => { el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); el.removeEventListener("wheel", wheel) }
  }, [nat, D, base]) // eslint-disable-line react-hooks/exhaustive-deps

  // si le cercle change de taille (rotation), on recadre sans saut
  useEffect(() => { const [mx, my] = lim(zm.get()); x.set(clamp(x.get(), mx)); y.set(clamp(y.get(), my)) }, [D, nat]) // eslint-disable-line react-hooks/exhaustive-deps

  const valider = async () => {
    const im = img.current; if (!im || !nat || busy) return
    setBusy(true)
    try {
      const b = await cropToBlob(im, { d: D, base, z: zm.get(), x: x.get(), y: y.get() }, size)
      onDone(new File([b], "photo.jpg", { type: "image/jpeg" }))
    } catch { setErr(true); setBusy(false) }
  }
  const reset = () => { animate(x, 0, SNAP); animate(y, 0, SNAP); animate(zm, 1, SNAP) }

  return <ModalSheet label={title} onClose={onCancel} z={z} size="full" handle={false} escape className="bg-black" desk={false}>
    <div className="flex h-full flex-col" style={{ paddingTop: "var(--sat)", paddingBottom: "max(var(--sab), 16px)" }} data-cropper>
      <div className="flex h-14 shrink-0 items-center justify-between px-4" data-sheet-grab>
        <button type="button" onClick={onCancel} className="h-10 px-1 text-[17px] text-white/80 active:opacity-60">Annuler</button>
        <span className="text-[17px] font-semibold">{title}</span>
        <button type="button" onClick={() => void valider()} disabled={!nat || busy} className="h-10 px-1 text-[17px] font-semibold text-[#FFD60A] active:opacity-60 disabled:opacity-40">{busy ? "…" : "Valider"}</button>
      </div>
      <div ref={stage} data-no-sheet-drag data-crop-stage onDoubleClick={reset} className="relative min-h-0 flex-1 cursor-grab touch-none select-none overflow-hidden active:cursor-grabbing">
        <div className="absolute left-1/2 top-1/2" style={{ width: 0, height: 0 }}>
          {!err && url && <motion.img ref={img} src={url} alt="" draggable={false} onLoad={e => { const t = e.currentTarget; setNat({ w: t.naturalWidth, h: t.naturalHeight }) }} onError={() => setErr(true)}
            className="pointer-events-none absolute max-w-none origin-center" style={nat ? { width: nat.w, height: nat.h, left: -nat.w / 2, top: -nat.h / 2, x, y, scale: sc, opacity: 1 } : { opacity: 0 }} />}
        </div>
        {/* voile autour du cercle + anneau */}
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 rounded-full" style={{ width: D, height: D, marginLeft: -D / 2, marginTop: -D / 2, boxShadow: "0 0 0 200vmax rgba(0,0,0,.62)" }} data-crop-circle />
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 rounded-full ring-1 ring-white/70" style={{ width: D, height: D, marginLeft: -D / 2, marginTop: -D / 2 }} />
        {err && <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-[15px] text-white/60">Impossible de lire cette image.</div>}
      </div>
      <div className="flex shrink-0 items-center gap-3 px-6 pb-2 pt-4">
        <button type="button" aria-label="Dézoomer" onClick={() => zoomTo(zv - .25)} className="text-white/60 active:text-white"><ZoomOut size={18} /></button>
        <input type="range" aria-label="Zoom" min={1} max={MAXZ} step={.01} value={zv} onChange={e => zoomTo(+e.target.value)} className="h-1 min-w-0 flex-1 accent-white" />
        <button type="button" aria-label="Zoomer" onClick={() => zoomTo(zv + .25)} className="text-white/60 active:text-white"><ZoomIn size={18} /></button>
      </div>
      <p className="shrink-0 px-6 pb-1 text-center text-[12.5px] text-white/40">Glissez pour placer, pincez ou utilisez le curseur pour zoomer.</p>
    </div>
  </ModalSheet>
}
