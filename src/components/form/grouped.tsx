/* update63 · Formulaires « style iOS » (listes groupées en encart) partagés par l'éditeur de devis et la facture.
   - sections à petit titre, lignes à libellé en ligne, séparateurs fins décalés, aucun cadre autour des champs
   - champs en 16 px minimum (pas de zoom automatique sur iPhone), bons claviers et saisie automatique
   - sélecteur de contact en feuille (recherche), interrupteurs animés, repli des coordonnées */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Check, ChevronDown, ChevronRight, MapPin, Search, UserPlus, X } from "lucide-react"

export const ACC = "#2F6BFF", ACC_T = "#7EA6FF"
const SPRING = { type: "spring" as const, stiffness: 520, damping: 40, mass: .8 }

/** Valeur d'un champ en ligne : transparente, 16 px, curseur bleu. */
export const ival = "h-12 w-full min-w-0 bg-transparent pr-4 text-[16px] text-white outline-none caret-[#2F6BFF] [color-scheme:dark] placeholder:text-white/28 disabled:text-white/55 disabled:opacity-100"

/** Section : petit titre + liste en encart (fond discret, coins arrondis, pas de bordure). */
export function IGroup({ title, aside, foot, children, className = "", id }: { title?: ReactNode; aside?: ReactNode; foot?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return <section className={className} aria-labelledby={id && title ? id : undefined}>
    {(title || aside) && <div className="mb-1.5 flex min-h-[22px] items-end justify-between gap-3 px-4">
      {title && <h2 id={id} className="text-[12.5px] font-medium uppercase tracking-[.06em] text-white/42">{title}</h2>}{aside}
    </div>}
    <div className="ig overflow-hidden rounded-[18px] bg-[#141416]">{children}</div>
    {foot && <div className="mt-1.5 px-4 text-[12.5px] leading-[18px] text-white/38">{foot}</div>}
  </section>
}

/** Ligne avec libellé en ligne (le libellé reste visible, la valeur occupe le reste). */
export function IRow({ label, children, top, htmlFor, className = "" }: { label: ReactNode; children: ReactNode; top?: boolean; htmlFor?: string; className?: string }) {
  return <div className={`ig-row flex min-h-12 gap-3 pl-4 ${top ? "items-start" : "items-center"} ${className}`}>
    <label htmlFor={htmlFor} className={`w-[92px] shrink-0 text-[15px] text-white/50 ${top ? "pt-[13px]" : ""}`}>{label}</label>
    <div className="flex min-w-0 flex-1 items-center">{children}</div>
  </div>
}

/** Ligne bouton (ouvre une feuille, une option…). */
export function IButtonRow({ lead, title, sub, onClick, right, chevron = true, ariaLabel, accent }: { lead?: ReactNode; title: ReactNode; sub?: ReactNode; onClick: () => void; right?: ReactNode; chevron?: boolean; ariaLabel?: string; accent?: boolean }) {
  return <button type="button" onClick={onClick} aria-label={ariaLabel} className="ig-row flex min-h-[56px] w-full items-center gap-3 pl-4 pr-3 text-left transition-colors active:bg-white/[.04]">
    {lead}
    <span className="min-w-0 flex-1 py-2.5"><span className={`block truncate text-[16px] ${accent ? "text-[#7EA6FF]" : "font-medium text-white"}`}>{title}</span>{sub && <span className="mt-0.5 block truncate text-[13px] text-white/45">{sub}</span>}</span>
    {right}{chevron && <ChevronRight size={17} className="shrink-0 text-white/25" />}
  </button>
}

/** Interrupteur iOS (bleu Akno), ressort court ; respecte « réduire les animations ». */
export function ISwitch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  const rm = useReducedMotion()
  return <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
    className="relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50" style={{ background: on ? ACC : "rgba(120,120,128,.32)" }}>
    <motion.span aria-hidden className="absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,.25),0_1px_1px_rgba(0,0,0,.16)]" initial={false} animate={{ x: on ? 20 : 0 }} transition={rm ? { duration: 0 } : SPRING} />
  </button>
}
export function IToggleRow({ label, sub, on, onChange, disabled }: { label: ReactNode; sub?: ReactNode; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <div className="ig-row flex min-h-12 items-center gap-3 py-2 pl-4 pr-3">
    <span className="min-w-0 flex-1"><span className="block text-[15.5px] text-white/90">{label}</span>{sub && <span className="mt-0.5 block text-[12.5px] leading-[17px] text-white/40">{sub}</span>}</span>
    <ISwitch on={on} onChange={onChange} label={typeof label === "string" ? label : "Option"} disabled={disabled} />
  </div>
}

/** Bloc repliable animé (hauteur), sans saut de mise en page. */
export function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  const rm = useReducedMotion()
  return <AnimatePresence initial={false}>{open && <motion.div key="r" className="overflow-hidden" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={rm ? { duration: 0 } : { height: { type: "spring", stiffness: 420, damping: 40 }, opacity: { duration: .16 } }}>{children}</motion.div>}</AnimatePresence>
}
export function DisclosureRow({ open, onToggle, title, sub }: { open: boolean; onToggle: () => void; title: ReactNode; sub?: ReactNode }) {
  return <button type="button" aria-expanded={open} onClick={onToggle} className="ig-row flex min-h-12 w-full items-center gap-3 pl-4 pr-3 text-left active:bg-white/[.04]">
    <span className="min-w-0 flex-1 py-2"><span className="block text-[15px] text-white/50">{title}</span>{sub && !open && <span className="mt-0.5 block truncate text-[13.5px] text-white/75">{sub}</span>}</span>
    <ChevronDown size={17} className={`shrink-0 text-white/30 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
  </button>
}

export type Contact = { name: string; phone?: string; email?: string; addr?: string }
export const initials = (n: string) => n.replace(/^(M\.|Mme|Mlle)\s*/i, "").split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join("").toUpperCase() || "?"
export const Avatar = ({ name, size = 36 }: { name: string; size?: number }) => <span aria-hidden className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white" style={{ width: size, height: size, fontSize: size * .36, background: `linear-gradient(180deg, ${ACC}, #1F4FD1)` }}>{initials(name)}</span>

/** Ligne « Client » : affiche le client choisi (nom, téléphone / e-mail), ouvre la feuille de recherche. */
export function ClientRow({ value, phone, email, onOpen, disabled }: { value: string; phone?: string; email?: string; onOpen: () => void; disabled?: boolean }) {
  const v = value.trim()
  if (disabled) return <div className="ig-row flex min-h-[60px] items-center gap-3 pl-4 pr-3">{v && <Avatar name={v} />}<span className="min-w-0 flex-1 py-2.5"><span className="block truncate text-[16px] font-medium">{v || "Client"}</span><span className="block truncate text-[13px] text-white/45">{[phone, email].filter(Boolean).join(" · ")}</span></span></div>
  return <IButtonRow ariaLabel={v ? `Choisir le client (actuel : ${v})` : "Choisir le client"} onClick={onOpen}
    lead={v ? <Avatar name={v} /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2F6BFF]/15 text-[#7EA6FF]"><UserPlus size={17} strokeWidth={1.8} /></span>}
    title={v || "Choisir ou ajouter un client"} accent={!v} sub={v ? ([phone, email].filter(Boolean).join(" · ") || "Coordonnées à compléter") : "Dans vos contacts ou nouveau"} />
}

/** Feuille de recherche de contact. Saisie libre possible (« Nouveau client »). */
export function ContactSheet({ open, clients, current, onPick, onClose, desk }: { open: boolean; clients: Contact[]; current?: string; onPick: (c: Contact, isNew: boolean) => void; onClose: () => void; desk?: boolean }) {
  const [q, setQ] = useState(""), [sel, setSel] = useState(0), inRef = useRef<HTMLInputElement>(null), rm = useReducedMotion()
  useEffect(() => { if (open) { setQ(""); setSel(0) } }, [open])
  useEffect(() => {
    if (!open) return
    const f = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); onClose() } }
    addEventListener("keydown", f, true); return () => removeEventListener("keydown", f, true)
  }, [open, onClose])
  const nq = q.trim().toLowerCase(), digits = nq.replace(/\s/g, "")
  const list = useMemo(() => clients.filter(c => c.name && (!nq || c.name.toLowerCase().includes(nq) || (c.email || "").toLowerCase().includes(nq) || (digits.length > 1 && (c.phone || "").replace(/\s/g, "").includes(digits)))).slice(0, 40), [clients, nq, digits])
  const exact = list.some(c => c.name.toLowerCase() === nq)
  // les contacts trouvés d'abord, puis « Nouveau client » (saisie libre)
  const opts: { c: Contact; isNew: boolean }[] = [...list.map(c => ({ c, isNew: false })), ...(q.trim() && !exact ? [{ c: { name: q.trim() }, isNew: true }] : [])]
  const pick = (i: number) => { const o = opts[i]; if (o) onPick(o.c, o.isNew) }
  return createPortal(<AnimatePresence>{open && <motion.div key="cs" className={`fixed inset-0 z-[60] flex bg-black/55 backdrop-blur-[3px] ${desk ? "items-center justify-center" : "items-end kb-sheet"}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: rm ? 0 : .18 }} onClick={onClose}>
    <motion.div role="dialog" aria-modal="true" aria-label="Choisir un client" onClick={e => e.stopPropagation()}
      initial={desk ? { opacity: 0, scale: .97 } : { y: "100%" }} animate={desk ? { opacity: 1, scale: 1 } : { y: 0 }} exit={desk ? { opacity: 0, scale: .97 } : { y: "100%" }}
      transition={rm ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 38, mass: .9 }}
      onAnimationComplete={() => inRef.current?.focus({ preventScroll: true })}
      className={`flex w-full flex-col bg-[#1C1C1E] ${desk ? "max-h-[72dvh] max-w-[460px] rounded-[22px]" : "kb-panel h-[86dvh] rounded-t-[22px]"}`} style={desk ? undefined : { paddingBottom: "env(safe-area-inset-bottom)" }}>
      {!desk && <div className="mx-auto mt-2 h-[5px] w-9 shrink-0 rounded-full bg-white/20" />}
      <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-3"><span className="w-16" /><span className="text-[16px] font-semibold">Client</span><button type="button" onClick={onClose} className="w-16 text-right text-[16px] text-[#7EA6FF]">Annuler</button></div>
      <div className="shrink-0 px-4 pb-3"><label className="flex h-10 items-center gap-2 rounded-[11px] bg-white/[.09] px-3">
        <Search size={16} className="shrink-0 text-white/40" />
        <input ref={inRef} value={q} onChange={e => { setQ(e.target.value); setSel(0) }} placeholder="Nom, téléphone ou e-mail" aria-label="Rechercher un client" enterKeyHint="done" autoComplete="off" autoCapitalize="words"
          onKeyDown={e => { if (e.key === "ArrowDown") { e.preventDefault(); setSel(i => Math.min(opts.length - 1, i + 1)) } else if (e.key === "ArrowUp") { e.preventDefault(); setSel(i => Math.max(0, i - 1)) } else if (e.key === "Enter") { e.preventDefault(); pick(sel) } }}
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-white outline-none caret-[#2F6BFF] placeholder:text-white/35" />
        {q && <button type="button" aria-label="Effacer" onClick={() => { setQ(""); inRef.current?.focus() }} className="flex h-5 w-5 items-center justify-center rounded-full bg-white/25 text-black"><X size={12} strokeWidth={3} /></button>}
      </label></div>
      <div role="listbox" aria-label="Contacts" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
        {opts.length === 0 ? <div className="px-2 py-10 text-center text-[14px] text-white/40">{clients.length ? "Aucun contact ne correspond." : "Aucun contact pour l'instant : tapez le nom du client."}</div>
          : <div className="ig overflow-hidden rounded-[14px] bg-white/[.05]">
            {opts.map((o, i) => <button key={(o.isNew ? "new:" : "") + o.c.name} type="button" role="option" aria-selected={i === sel} onClick={() => pick(i)} onMouseMove={() => setSel(i)}
              className={`ig-row flex w-full items-center gap-3 py-2.5 pl-3 pr-3 text-left transition-colors ${i === sel && desk ? "bg-white/[.06]" : ""} active:bg-white/[.06]`}>
              {o.isNew ? <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2F6BFF]/15 text-[#7EA6FF]"><UserPlus size={17} strokeWidth={1.8} /></span> : <Avatar name={o.c.name} />}
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[16px] ${o.isNew ? "text-[#7EA6FF]" : ""}`}>{o.isNew ? `Nouveau client « ${o.c.name} »` : o.c.name}</span>
                {!o.isNew && (o.c.phone || o.c.email || o.c.addr) && <span className="flex items-center gap-1 truncate text-[13px] text-white/45">{o.c.phone || o.c.email}{(o.c.phone || o.c.email) && o.c.addr ? " · " : ""}{o.c.addr && <><MapPin size={11} className="shrink-0" /><span className="truncate">{o.c.addr}</span></>}</span>}
              </span>
              {!o.isNew && current && o.c.name.toLowerCase() === current.trim().toLowerCase() && <Check size={17} className="shrink-0 text-[#7EA6FF]" />}
            </button>)}
          </div>}
      </div>
    </motion.div>
  </motion.div>}</AnimatePresence>, document.body)
}

/** Pilule discrète (brouillon à reprendre…), refermable. */
export function Pill({ children, onDismiss, action }: { children: ReactNode; onDismiss: () => void; action?: ReactNode }) {
  return <motion.div role="status" initial={{ opacity: 0, y: -8, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: .98 }} transition={{ type: "spring", stiffness: 480, damping: 36 }}
    className="mx-auto flex max-w-full items-center gap-2 rounded-full bg-white/[.08] py-1 pl-3.5 pr-1 text-[13px] text-white/75 shadow-[inset_0_.5px_0_rgba(255,255,255,.1)] backdrop-blur-xl">
    <span className="min-w-0 truncate">{children}</span>{action}
    <button type="button" aria-label="Ignorer" onClick={onDismiss} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/45 hover:text-white"><X size={14} strokeWidth={2.2} /></button>
  </motion.div>
}
