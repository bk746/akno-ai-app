/* update52 · Petits champs de l'éditeur de devis (saisie française des nombres, pas à pas, segments, menu). */
import { useEffect, useRef, useState, type ReactNode } from "react"
import { Minus, Plus } from "lucide-react"
import { fmtN, parseN } from "../../lib/devisCalc"

export const TEAL = "#2F6BFF" // accent Devis (bleu, update54)
export const TEAL_T = "#7EA6FF" // bleu Devis lisible sur fond noir (texte, focus)
export const field = "h-10 w-full rounded-[12px] border border-white/[.08] bg-white/[.04] px-3 text-[14px] text-white outline-none transition-colors [color-scheme:dark] placeholder:text-white/30 hover:border-white/[.14] focus:border-[#3FD0C9]/70 focus:bg-white/[.06]"

/** Nombre au format français : « 3,5 », « 1 250 ». Garde la saisie brute pendant la frappe. */
export function NumField({ value, onChange, suffix, min = 0, max, ariaLabel, className = "", inputClass = "", placeholder, decimals = 2, autoFocus, onEnter, id }: { value: number | null; onChange: (n: number | null) => void; suffix?: string; min?: number; max?: number; ariaLabel: string; className?: string; inputClass?: string; placeholder?: string; decimals?: number; autoFocus?: boolean; onEnter?: () => void; id?: string }) {
  const show = (v: number | null) => v == null || !Number.isFinite(v) ? "" : decimals === 2 && Math.abs(v % 1) > 0 ? v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[\u202f\u00a0]/g, " ") : fmtN(v)
  const [raw, setRaw] = useState(show(value)), [focus, setFocus] = useState(false)
  useEffect(() => { if (!focus) setRaw(show(value)) }, [value, focus])
  return <div className={`relative ${className}`}>
    <input id={id} autoFocus={autoFocus} inputMode="decimal" aria-label={ariaLabel} placeholder={placeholder} value={raw}
      onFocus={e => { setFocus(true); requestAnimationFrame(() => e.target.select()) }}
      onBlur={() => { setFocus(false); setRaw(show(value)) }}
      onKeyDown={e => { if (e.key === "Enter" && onEnter) { e.preventDefault(); onEnter() } }}
      onChange={e => { const t = e.target.value.replace(/[^\d,.\s-]/g, ""); setRaw(t); const n = parseN(t); if (t.trim() === "") onChange(null); else if (Number.isFinite(n)) onChange(Math.min(max ?? Infinity, Math.max(min, n))) }}
      className={`${field} text-right tabular-nums ${suffix ? "pr-9" : ""} ${inputClass}`} />
    {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] text-white/35">{suffix}</span>}
  </div>
}

/** − valeur + : pour les heures et les quantités (gros boutons au doigt sur mobile). */
export function Stepper({ value, onChange, step = 0.5, suffix, ariaLabel, big }: { value: number; onChange: (n: number) => void; step?: number; suffix?: string; ariaLabel: string; big?: boolean }) {
  const h = big ? "h-11" : "h-10", w = big ? "w-11" : "w-9"
  const dec = () => onChange(Math.max(0, Math.round((value - step) * 100) / 100)), inc = () => onChange(Math.round((value + step) * 100) / 100)
  return <div className={`flex ${h} items-stretch overflow-hidden rounded-[12px] border border-white/[.08] bg-white/[.04] focus-within:border-[#3FD0C9]/70`}>
    <button type="button" tabIndex={-1} aria-label={`Diminuer ${ariaLabel}`} onClick={dec} className={`flex ${w} shrink-0 items-center justify-center text-white/55 transition-colors hover:bg-white/[.06] hover:text-white active:bg-white/[.1]`}><Minus size={15} strokeWidth={2} /></button>
    <label className="flex min-w-0 flex-1 items-center justify-center gap-1"><NumField decimals={1} value={value} onChange={n => onChange(n ?? 0)} ariaLabel={ariaLabel} className="min-w-0 max-w-[64px] flex-1" inputClass={`!h-full !rounded-none !border-0 !bg-transparent !px-0 ${suffix ? "!text-right" : "!text-center"}`} />{suffix && <span className="shrink-0 pr-1 text-[12.5px] text-white/40">{suffix}</span>}</label>
    <button type="button" tabIndex={-1} aria-label={`Augmenter ${ariaLabel}`} onClick={inc} className={`flex ${w} shrink-0 items-center justify-center text-white/55 transition-colors hover:bg-white/[.06] hover:text-white active:bg-white/[.1]`}><Plus size={15} strokeWidth={2} /></button>
  </div>
}

export function Seg<T extends string | number>({ value, onChange, opts, label, size = "md" }: { value: T; onChange: (v: T) => void; opts: [T, string][]; label: string; size?: "sm" | "md" }) {
  return <div role="radiogroup" aria-label={label} className={`inline-flex rounded-[11px] bg-white/[.05] p-[3px] ${size === "sm" ? "h-8" : "h-10"}`}>
    {opts.map(([v, l]) => <button key={String(v)} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={`rounded-[8px] px-3 text-[13px] font-medium transition-colors ${value === v ? "bg-white text-black shadow-sm" : "text-white/55 hover:text-white"}`}>{l}</button>)}
  </div>
}

/** Menu contextuel ancré (ferme au clic extérieur et sur Échap). */
export function Menu({ trigger, children, align = "right", open, setOpen }: { trigger: ReactNode; children: ReactNode; align?: "left" | "right"; open: boolean; setOpen: (b: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const f = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false) } }
    addEventListener("pointerdown", f, true); addEventListener("keydown", k, true)
    return () => { removeEventListener("pointerdown", f, true); removeEventListener("keydown", k, true) }
  }, [open, setOpen])
  return <div ref={ref} className="relative">{trigger}{open && <div role="menu" className={`absolute top-[calc(100%+6px)] z-30 w-[236px] overflow-hidden rounded-[16px] border border-white/[.1] bg-[#1A1A1D] p-1.5 shadow-[0_24px_60px_-12px_rgba(0,0,0,.95)] ${align === "right" ? "right-0" : "left-0"}`}>{children}</div>}</div>
}
export const MenuItem = ({ I, children, onClick, danger, hint }: { I?: any; children: ReactNode; onClick: () => void; danger?: boolean; hint?: string }) =>
  <button type="button" role="menuitem" onClick={onClick} className={`flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[13.5px] transition-colors hover:bg-white/[.07] ${danger ? "text-[#FF7A72]" : "text-white/85"}`}>{I && <I size={15} strokeWidth={1.75} className={danger ? "" : "text-white/50"} />}<span className="flex-1">{children}</span>{hint && <span className="text-[11.5px] text-white/30">{hint}</span>}</button>
export const MenuSep = () => <div className="my-1 h-px bg-white/[.07]" />

export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
export const Kbd = ({ children }: { children: ReactNode }) => <kbd className="inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-[6px] border border-white/[.1] bg-white/[.05] px-1.5 font-sans text-[11px] text-white/55">{children}</kbd>
