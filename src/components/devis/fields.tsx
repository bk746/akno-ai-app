/* update52 · Petits champs de l'éditeur de devis (saisie française des nombres, pas à pas, segments, menu). */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { ChevronRight, Minus, Plus } from "lucide-react"
import { fmtN, parseN } from "../../lib/devisCalc"
import { IToggleRow, ival } from "../form/grouped"
import { fmtE, r2, type LineDisc } from "../../lib/devisCalc"

export const TEAL = "#2F6BFF" // accent Devis (bleu, update54)
export const TEAL_T = "#7EA6FF" // bleu Devis lisible sur fond noir (texte, focus)
export const field = "h-10 w-full rounded-[12px] border border-white/[.08] bg-white/[.04] px-3 text-[14px] text-white outline-none transition-colors [color-scheme:dark] placeholder:text-white/30 hover:border-white/[.14] focus:border-[#3FD0C9]/70 focus:bg-white/[.06]"

/** Nombre au format français : « 3,5 », « 1 250 ». Garde la saisie brute pendant la frappe. */
export function NumField({ value, onChange, suffix, min = 0, max, ariaLabel, className = "", inputClass = "", placeholder, decimals = 2, autoFocus, onEnter, id, disabled }: { value: number | null; onChange: (n: number | null) => void; suffix?: string; min?: number; max?: number; ariaLabel: string; className?: string; inputClass?: string; placeholder?: string; decimals?: number; autoFocus?: boolean; onEnter?: () => void; id?: string; disabled?: boolean }) {
  const show = (v: number | null) => v == null || !Number.isFinite(v) ? "" : decimals === 2 && Math.abs(v % 1) > 0 ? v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[\u202f\u00a0]/g, " ") : fmtN(v)
  const [raw, setRaw] = useState(show(value)), [focus, setFocus] = useState(false)
  useEffect(() => { if (!focus) setRaw(show(value)) }, [value, focus])
  return <div className={`relative ${className}`}>
    <input id={id} autoFocus={autoFocus} disabled={disabled} inputMode="decimal" aria-label={ariaLabel} placeholder={placeholder} value={raw}
      onFocus={e => { setFocus(true); requestAnimationFrame(() => e.target.select()) }}
      onBlur={() => { setFocus(false); setRaw(show(value)) }}
      onKeyDown={e => { if (e.key === "Enter" && onEnter) { e.preventDefault(); onEnter() } }}
      onChange={e => { const t = e.target.value.replace(/[^\d,.\s-]/g, ""); setRaw(t); const n = parseN(t); if (t.trim() === "") onChange(null); else if (Number.isFinite(n)) onChange(Math.min(max ?? Infinity, Math.max(min, n))) }}
      className={`${field} text-right tabular-nums ${suffix ? "pr-9" : ""} ${inputClass}`} />
    {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] text-white/35">{suffix}</span>}
  </div>
}

/** − valeur + : pour les heures et les quantités (gros boutons au doigt sur mobile). */
export function Stepper({ value, onChange, step = 0.5, suffix, ariaLabel, big, soft }: { value: number; onChange: (n: number) => void; step?: number; suffix?: string; ariaLabel: string; big?: boolean; soft?: boolean /* update63 : style iOS sans bordure, 16 px */ }) {
  const h = big ? "h-11" : "h-10", w = big ? "w-11" : "w-9"
  const dec = () => onChange(Math.max(0, Math.round((value - step) * 100) / 100)), inc = () => onChange(Math.round((value + step) * 100) / 100)
  return <div className={`flex ${h} items-stretch overflow-hidden rounded-[12px] ${soft ? "bg-white/[.06] focus-within:shadow-[inset_0_0_0_1px_rgba(47,107,255,.5)]" : "border border-white/[.08] bg-white/[.04] focus-within:border-[#3FD0C9]/70"}`}>
    <button type="button" tabIndex={-1} aria-label={`Diminuer ${ariaLabel}`} onClick={dec} className={`flex ${w} shrink-0 items-center justify-center text-white/55 transition-colors hover:bg-white/[.06] hover:text-white active:bg-white/[.1]`}><Minus size={15} strokeWidth={2} /></button>
    <label className="flex min-w-0 flex-1 items-center justify-center gap-1"><NumField decimals={1} value={value} onChange={n => onChange(n ?? 0)} ariaLabel={ariaLabel} className="min-w-0 max-w-[64px] flex-1" inputClass={`!h-full !rounded-none !border-0 !bg-transparent !px-0 ${suffix ? "!text-right" : "!text-center"}${soft ? " !text-[16px]" : ""}`} />{suffix && <span className="shrink-0 pr-1 text-[12.5px] text-white/40">{suffix}</span>}</label>
    <button type="button" tabIndex={-1} aria-label={`Augmenter ${ariaLabel}`} onClick={inc} className={`flex ${w} shrink-0 items-center justify-center text-white/55 transition-colors hover:bg-white/[.06] hover:text-white active:bg-white/[.1]`}><Plus size={15} strokeWidth={2} /></button>
  </div>
}

export function Seg<T extends string | number>({ value, onChange, opts, label, size = "md" }: { value: T; onChange: (v: T) => void; opts: [T, string][]; label: string; size?: "sm" | "md" }) {
  return <div role="radiogroup" aria-label={label} className={`inline-flex rounded-[11px] bg-white/[.05] p-[3px] ${size === "sm" ? "h-8" : "h-10"}`}>
    {opts.map(([v, l]) => <button key={String(v)} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={`rounded-[8px] px-3 text-[13px] font-medium transition-colors ${value === v ? "bg-white text-black shadow-sm" : "text-white/55 hover:text-white"}`}>{l}</button>)}
  </div>
}

/** Menu contextuel ancré (portail fixed : n'est pas rogné par overflow de la carte, ni glissé sous la barre du bas). */
export function Menu({ trigger, children, align = "right", open, setOpen }: { trigger: ReactNode; children: ReactNode; align?: "left" | "right"; open: boolean; setOpen: (b: boolean) => void }) {
  const wrap = useRef<HTMLDivElement>(null), menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0, maxH: 360 })
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const trig = wrap.current
      if (!trig) return
      const r = trig.getBoundingClientRect(), w = 236
      const left = align === "right" ? Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8) : Math.max(8, Math.min(r.left, window.innerWidth - w - 8))
      const h = menuRef.current?.offsetHeight || 400
      const below = window.innerHeight - 12 - r.bottom, above = r.top - 12
      const goDown = below >= Math.min(h, 200) || below >= above
      const maxH = Math.max(140, goDown ? below - 6 : above - 6)
      const top = goDown ? r.bottom + 6 : Math.max(8, r.top - Math.min(h, maxH) - 6)
      setPos({ top, left, maxH })
    }
    place(); const id = requestAnimationFrame(place)
    addEventListener("resize", place)
    return () => { cancelAnimationFrame(id); removeEventListener("resize", place) }
  }, [open, align])
  useEffect(() => {
    if (!open) return
    const f = (e: PointerEvent) => { const n = e.target as Node; if (wrap.current?.contains(n) || menuRef.current?.contains(n)) return; setOpen(false) }
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false) } }
    addEventListener("pointerdown", f, true); addEventListener("keydown", k, true)
    return () => { removeEventListener("pointerdown", f, true); removeEventListener("keydown", k, true) }
  }, [open, setOpen])
  return <div ref={wrap} className="relative">{trigger}{open && createPortal(<div ref={menuRef} role="menu" data-line-menu style={{ position: "fixed", top: pos.top, left: pos.left, width: 236, maxHeight: pos.maxH, zIndex: 80, overflowY: "auto" }} className="rounded-[16px] border border-white/[.1] bg-[#1A1A1D] p-1.5 shadow-[0_24px_60px_-12px_rgba(0,0,0,.95)]">{children}</div>, document.body)}</div>
}
export const MenuItem = ({ I, children, onClick, danger, hint }: { I?: any; children: ReactNode; onClick: () => void; danger?: boolean; hint?: string }) =>
  <button type="button" role="menuitem" onClick={onClick} className={`flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[13.5px] transition-colors hover:bg-white/[.07] ${danger ? "text-[#FF7A72]" : "text-white/85"}`}>{I && <I size={15} strokeWidth={1.75} className={danger ? "" : "text-white/50"} />}<span className="flex-1">{children}</span>{hint && <span className="text-[11.5px] text-white/30">{hint}</span>}</button>
export const MenuSep = () => <div className="my-1 h-px bg-white/[.07]" />

export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
export const Kbd = ({ children }: { children: ReactNode }) => <kbd className="inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-[6px] border border-white/[.1] bg-white/[.05] px-1.5 font-sans text-[11px] text-white/55">{children}</kbd>

/* update82 · Formulaire iOS « Ajouter un service / une ligne » (carte groupée, total en direct). */
export type ServiceVal = { l: string; d?: string; q: number; u?: string; pu: number; tv?: number; rl?: LineDisc }

export function lineAmount(x: { q: number; pu: number; rl?: LineDisc }) {
  const g = r2((Number(x.q) || 0) * (Number(x.pu) || 0))
  const r = x.rl
  if (!r || !(r.v > 0) || g <= 0) return g
  const disc = r.t === "eur" ? r2(Math.min(r.v, g)) : r2(g * Math.min(100, r.v) / 100)
  return r2(g - disc)
}

const slabel = "w-[148px] shrink-0 text-[15px] leading-[20px] text-white/50"
const srow = "ig-row flex min-h-12 items-center gap-3 pl-4 pr-4"
const sval = "h-12 w-full min-w-0 bg-transparent text-right text-[16px] text-white outline-none caret-[#2F6BFF] [color-scheme:dark] placeholder:text-white/28 disabled:text-white/55 disabled:opacity-100"

/** Montant à droite, une seule typo : « 0,00 € ». */
function RightMoney({ id, value, onChange, disabled, ariaLabel }: { id: string; value: number; onChange: (n: number) => void; disabled?: boolean; ariaLabel: string }) {
  const fmt = (v: number) => r2(Number(v) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[\u202f\u00a0]/g, " ") + " €"
  const [raw, setRaw] = useState(fmt(value)), [focus, setFocus] = useState(false)
  useEffect(() => { if (!focus) setRaw(fmt(value)) }, [value, focus])
  return <input id={id} disabled={disabled} inputMode="decimal" aria-label={ariaLabel} value={raw}
    onFocus={e => { setFocus(true); setRaw(fmt(value)); requestAnimationFrame(() => e.target.select()) }}
    onBlur={() => { setFocus(false); setRaw(fmt(value)) }}
    onChange={e => { const txt = e.target.value; setRaw(txt); const n = parseN(txt.replace(/€/g, "")); if (txt.trim() === "" || txt.trim() === "€") onChange(0); else if (Number.isFinite(n)) onChange(Math.max(0, n)) }}
    className={sval + " tabular-nums"} />
}

export function ServiceLineCard({ x, onPatch, defaultTv = 20, tvaNA, ro, idPrefix, index, handle, menu }: {
  x: ServiceVal; onPatch: (p: Partial<ServiceVal>) => void; defaultTv?: number; tvaNA?: boolean; ro?: boolean; idPrefix: string
  index?: number; handle?: ReactNode; menu?: ReactNode
}) {
  const remOn = !!x.rl
  const taxed = !tvaNA && (Number(x.tv) || 0) > 0
  const total = lineAmount(x)
  const pid = (s: string) => `${idPrefix}-${s}`
  const remKind = x.rl?.t === "eur" ? "eur" : "pct"
  return (
    <div data-line-form className="ig overflow-hidden rounded-[18px] bg-[#141416]">
      {(handle || menu || index != null) && <div data-line-head className="ig-row flex h-12 items-center gap-1 pl-1.5 pr-1">
        {handle || <span className="w-5 shrink-0" />}
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-white/85">{index != null ? `Ligne ${index}` : "Ligne"}</span>
        {menu}
      </div>}
      <div data-nodrag>
      <div className={srow}>
        <label htmlFor={pid("l")} className={slabel}>Description</label>
        <input id={pid("l")} data-f="l" data-line-desc disabled={ro} value={x.l} maxLength={280} placeholder="Désignation" onChange={e => onPatch({ l: e.target.value })} className={sval} />
      </div>
      <div className={srow}>
        <label htmlFor={pid("pu")} className={slabel}>Coût unitaire</label>
        <RightMoney id={pid("pu")} value={Number(x.pu) || 0} onChange={n => onPatch({ pu: n })} disabled={ro} ariaLabel="Coût unitaire" />
      </div>
      <div className={srow}>
        <label htmlFor={pid("u")} className={slabel}>Unité</label>
        <input id={pid("u")} data-line-unit disabled={ro} value={x.u || ""} placeholder="heures, jours" onChange={e => onPatch({ u: e.target.value })} className={sval} />
      </div>
      <div className={srow}>
        <label htmlFor={pid("q")} className={slabel}>Quantité</label>
        <NumField id={pid("q")} value={x.q} onChange={n => onPatch({ q: n ?? 1 })} ariaLabel="Quantité" disabled={ro} className="min-w-0 flex-1" inputClass="!h-12 !border-0 !bg-transparent !px-0 !text-right !text-[16px] tabular-nums" />
      </div>
      <div className={srow}>
        <label htmlFor={pid("rem-type")} className={slabel}>Remise</label>
        <div className="relative min-w-0 flex-1">
          <select id={pid("rem-type")} data-line-remise-type disabled={ro} aria-label="Remise" value={remOn ? "total" : "none"} onChange={e => onPatch({ rl: e.target.value === "none" ? undefined : { t: x.rl?.t || "pct", v: x.rl?.v || 0 } })} className={sval + " appearance-none pr-5"}>
            <option value="none">Aucune</option>
            <option value="total">Remise sur total</option>
          </select>
          <ChevronRight data-line-remise-chevron size={17} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-white/25" />
        </div>
      </div>
      {remOn && <div className={srow}>
        <label htmlFor={pid("rem")} className={slabel}>Montant de la remise %</label>
        <div className="flex min-w-0 flex-1 items-center">
          <NumField id={pid("rem")} value={x.rl?.v || null} placeholder="0" max={remKind === "eur" ? undefined : 100} onChange={n => onPatch({ rl: { t: remKind, v: n || 0 } })} ariaLabel="Montant de la remise" disabled={ro} className="min-w-0 flex-1" inputClass="!h-12 !border-0 !bg-transparent !px-0 !text-right !text-[16px] tabular-nums" />
          <select aria-label="Type de montant de remise" disabled={ro} value={remKind} onChange={e => onPatch({ rl: { t: e.target.value === "eur" ? "eur" : "pct", v: x.rl?.v || 0 } })} className="h-12 shrink-0 bg-transparent pl-1 text-right text-[16px] text-white outline-none [color-scheme:dark]">
            <option value="pct">%</option>
            <option value="eur">€</option>
          </select>
        </div>
      </div>}
      {!tvaNA && <IToggleRow label="Sujet à taxe" color="#30D158" on={taxed} disabled={ro} onChange={v => onPatch({ tv: v ? defaultTv : 0 })} />}
      <div className="ig-row flex min-h-12 items-center justify-between pl-4 pr-4">
        <span className="text-[16px] font-semibold">Total</span>
        <span data-line-total className="text-[16px] font-semibold tabular-nums">{fmtE(total)}</span>
      </div>
      </div>
    </div>
  )
}
