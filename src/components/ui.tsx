/* Système visuel partagé d'Akno (extrait d'AknoApp.tsx à l'update44, à l'identique)
   pour que les nouveaux écrans (Entreprise, Abonnement, Factures, Conformité, Demandes) gardent le même style. */
import React, { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react"
import { LIST } from "../lib/motion"
import { PhoneCall, CalendarDays, Repeat2, Receipt, Search, X, ChevronRight } from "lucide-react"
import type { St } from "../lib/store"
import ModalSheet from "./sheet/ModalSheet"

export type K = "rec" | "ag" | "rel" | "dev"
export type P = K | "set" | "fac" | "ch" | "eq" | "cl"
/** update62 · pages d'agent (blob, couleur, configurateur) — « fac » (Factures) et « ch » (Chantiers) n'en sont pas. */
export const isK = (p: P): p is K => p === "rec" || p === "ag" || p === "rel" || p === "dev"
export const A = {
  rec: { n: "Réceptionniste", c: "#E6E6E6", tab: "Réception", I: PhoneCall, slug: "reception", d: "Décroche 24/7" },
  ag: { n: "Agenda", c: "#8B7CFF", tab: "Agenda", I: CalendarDays, slug: "agenda", d: "Cale vos RDV" },
  rel: { n: "Relance", c: "#22B07A", tab: "Relance", I: Repeat2, slug: "relance", d: "Avis et rappels" },
  dev: { n: "Devis", c: "#2F6BFF", tab: "Devis", I: Receipt, slug: "devis", d: "Chiffre en direct" },
} as const

export type Modal = { kind: "entreprise" | "abonnement" | "deleteAccount" | "factures" | "conformite" | "leads" | "agendaCal" | "reception" | "sms" | "call" | "callView" | "rdv" | "rel" | "relList" | "client" | "contacts" | "aiPop" | "devisPrev" | "listen" | "callbacks" | "calls" | "relView" | "devis" | "devisEdit" | "devisList" | "ev" | "pw" | "reviewUrl" | "tarifs" | "urgencePhone" | "clientReply" | "prestations" | "devisEditor" | "studio" | "recReglages" | "equipe" | "pilotage" | "connect"; data?: any; prefill?: any } | null
export type Ctx = { s: St; set: (f: (s: St) => St) => void; desk: boolean; page: P; go: (p: P) => void; modal: (m: Modal) => void; chat: boolean; setChat: (b: boolean) => void; toast: (t: string, undo?: () => void) => void; q: string; setQ: (q: string) => void; put?: (f: (s: St) => St) => void
  /** toast en haut de l'écran, au-dessus des feuilles : confirmation (coche, 2,5 s) ou erreur (rouge) */
  flash?: (t: string, kind?: "ok" | "err") => void }
export const C = createContext<Ctx>(null as any)
export const useC = () => useContext(C)

// Écoute (Réceptionniste qui lit un appel) : petit store global pour élargir les yeux
let listenV = false; const listenL = new Set<() => void>()
export const setListen = (v: boolean) => { listenV = v; listenL.forEach(f => f()) }
export const useListen = () => useSyncExternalStore(f => { listenL.add(f); return () => { listenL.delete(f) } }, () => listenV, () => false)
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
// Yeux vivants : clignements aléatoires (parfois doubles) + regards/saccades autonomes. Pas de suivi du pointeur.
export function Eyes({ small, wide, g = EYE0 }: { small: boolean; wide: boolean; g?: EyeG }) {
  const reduce = useReducedMotion(), [blink, setBlink] = useState(false), [look, setLook] = useState({ x: 0, y: 0 })
  useEffect(() => {
    if (reduce) return
    let alive = true; const ts: ReturnType<typeof setTimeout>[] = []; const at = (ms: number, f: () => void) => ts.push(setTimeout(() => alive && f(), ms))
    const doBlink = () => { setBlink(true); at(120, () => setBlink(false)); if (Math.random() < .22) { at(260, () => setBlink(true)); at(380, () => setBlink(false)) } at(rnd(3000, 6000), doBlink) }
    const amp = small ? 5 : 9
    const doLook = () => { const r = Math.random(); const t = r < .3 ? { x: -amp, y: rnd(-2, 2) } : r < .6 ? { x: amp, y: rnd(-2, 2) } : r < .75 ? { x: rnd(-3, 3), y: -amp * .7 } : r < .85 ? { x: rnd(-3, 3), y: amp * .5 } : { x: rnd(-3, 3), y: rnd(-2, 2) }
      setLook(t); if (Math.random() < .4) at(rnd(180, 320), () => setLook({ x: t.x + rnd(-2.5, 2.5), y: t.y + rnd(-1.5, 1.5) }))
      at(rnd(700, 1600), () => setLook({ x: 0, y: 0 })); at(rnd(2200, 5000), doLook) }
    at(rnd(800, 3000), doBlink); at(rnd(1200, 3500), doLook)
    return () => { alive = false; ts.forEach(clearTimeout) }
  }, [reduce, small])
  const sy = blink ? .1 : wide ? 1.12 : 1, sx = wide && !blink ? 1.06 : 1
  return <motion.g animate={{ x: look.x, y: look.y }} transition={{ type: "spring", stiffness: 260, damping: 20, mass: .6 }}>
    <motion.g style={{ transformBox: "fill-box", transformOrigin: "center" }} animate={{ scaleY: sy, scaleX: sx }} transition={blink ? { duration: .06, ease: "easeIn" } : { type: "spring", stiffness: 500, damping: 30 }}>
      <ellipse cx={g.l} cy={g.y} rx={g.rx} ry={g.ry} fill="#000" /><ellipse cx={g.r} cy={g.y} rx={g.rx} ry={g.ry} fill="#000" /></motion.g></motion.g>
}
// Mascottes 3D (update54) : sphère à dégradé maillé animé (CSS pur, transform uniquement) + reflet + ombrage. Styles dans index.css (.orb).
type EyeG = { l: number; r: number; y: number; rx: number; ry: number }
const EYE0: EyeG = { l: 106.5, r: 169.5, y: 104.5, rx: 22.5, ry: 31 }
export const orbEyes = (s: number): EyeG => s < 30 ? { l: 106, r: 168, y: 118, rx: 18, ry: 36 } : { l: 109, r: 165, y: 117, rx: 14.5, ry: 31 }
// [fond, tache 1..4] par couleur d'agent ; delay = décalage pour désynchroniser les agents
const ORB: Record<string, { p: string[]; d: number }> = {
  "#2F6BFF": { p: ["#0B2AA8", "#061A86", "#2F6EEA", "#A9BEEA", "#1A47D8"], d: 0 },
  "#8B7CFF": { p: ["#8A7DF4", "#5F63EC", "#F5A3D3", "#F4E2B8", "#B7A2FF"], d: -7 },
  "#22B07A": { p: ["#1E8C5E", "#0B6544", "#7AD9AA", "#ECE59E", "#2EAA72"], d: -13 },
  "#E6E6E6": { p: ["#ECECEF", "#FFFFFF", "#CFCFD6", "#E6CEF6", "#F8DFC4"], d: -4 },
}
export function Orb({ c, s, children }: { c: string; s: number; children?: React.ReactNode }) {
  const o = ORB[c] || { p: [c, c, "#FFFFFF99", c, c], d: -2 }
  const v = { width: s, height: s, "--o0": o.p[0], "--o1": o.p[1], "--o2": o.p[2], "--o3": o.p[3], "--o4": o.p[4], "--od": `${o.d}s`, "--os": `${Math.max(1, s * .06)}px`, "--oa": c === "#E6E6E6" ? ".32" : ".55" } as React.CSSProperties
  return <span aria-hidden className={`orb${s < 30 ? " orb-sm" : ""}`} style={v}><span className="orb-in"><span className="orb-rot"><i /><i /><i /><i /></span></span><span className="orb-sh" />
    {children && <svg viewBox="0 0 267 267" width={s} height={s} className="orb-ey">{children}</svg>}</span>
}
export const Blob = ({ c, s }: { c: string; s: number }) => { const l = useListen(); return <Orb c={c} s={s}><Eyes small={s < 60} wide={l && s >= 60 && c === A.rec.c} g={orbEyes(s)} /></Orb> }

export const GREEN = "#30D158", AMBER = "#FFB340", RED = "#FF5F57", GREY = "rgba(255,255,255,.3)"
export const tx = { fig: "font-semibold leading-none tracking-[-0.04em]", title: "text-[17px] font-semibold tracking-[-0.02em]", body: "text-[15px] font-medium tracking-[-0.01em] text-white", cap: "text-[13px] text-white/50" }
export const IS = 20, SW = 1.75
export const ink = (c: string) => c === "#E6E6E6" || c === "#FFFFFF" ? "#fff" : c
export const initials = (n: string) => n.replace(/^(M\.|Mme|Chantier)\s*/, "").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
export const durF = (d: number) => d < 1 ? "30 min" : `${String(d).replace(".", ",")} h`
/** update86 · cartes monochromes : fond uni, séparateurs fins. */
export const CARD_BG = "#141416"
export const Card = ({ children, className = "" }: any) => <div className={`rounded-[22px] bg-[#141416] ${className}`}>{children}</div>
export const ListCard = Card
export const Dot = ({ c }: { c: string }) => <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c }} />
export const UrgentDot = () => <span data-urgent-dot aria-hidden className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#FF5F57]" />
const dangerC = (c?: string) => !!c && /ff5f57|ff453a|ff3b30|ff375f|#ff5/i.test(String(c).replace(/\s/g, ""))
export function StatusText({ children, tone = "muted", check, className = "" }: { children?: React.ReactNode; tone?: "muted" | "danger" | "accent"; check?: boolean; className?: string }) {
  const color = tone === "danger" ? RED : tone === "accent" ? "#2F6BFF" : "rgba(255,255,255,.45)"
  return <span data-status-text data-tone={tone} className={`text-[12.5px] font-medium ${className}`} style={{ color }}>{check ? "✓ " : ""}{children}</span>
}
/* Ancien badge pilule : désormais du texte discret (rouge seulement si urgent / en retard). */
export const Chip = ({ c, children }: any) => <StatusText tone={dangerC(c) ? "danger" : "muted"}>{children}</StatusText>
export const Circ = ({ children, c, className = "" }: any) => <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2C2C2E] text-white/90 ${className}`}>{children}</span>
export const Ic = ({ I, c }: any) => <Circ c={c}><I size={IS} strokeWidth={SW} /></Circ>
export const Av = ({ n }: { n: string }) => <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2C2C2E] text-[13px] font-semibold tracking-[.02em] text-white/90">{initials(n)}</span>
export const Row = ({ lead, t, s, r, rs, onClick, first, label, className = "", urgent }: any) => <div onClick={onClick} {...(onClick ? { role: "button", tabIndex: 0, "aria-label": label, onKeyDown: (e: any) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onClick() } } } : {})} className={`flex w-full items-center gap-3 pl-4 text-left ${onClick ? "cursor-pointer transition-colors hover:bg-white/[.03] focus-visible:bg-white/[.04]" : ""} ${first ? "rounded-t-[22px]" : ""} last:rounded-b-[22px] ${className}`}>
  {lead}<div className={`flex min-h-[64px] min-w-0 flex-1 items-center gap-3 py-3 pr-4 ${first ? "" : "border-t border-white/[.06]"}`}>
    <div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2 text-[15px] font-semibold tracking-[-0.02em] text-white">{urgent && <UrgentDot />}<span className="min-w-0 truncate">{t}</span></div>{s && <div className={`mt-0.5 truncate ${tx.cap}`}>{s}</div>}</div>
    {(r !== undefined || rs) && <div className="flex shrink-0 flex-col items-end">{typeof r === "string" || typeof r === "number" ? <div className={tx.body}>{r}</div> : r}{rs && <div className="mt-0.5">{typeof rs === "string" ? <span className={tx.cap}>{rs}</span> : rs}</div>}</div>}</div></div>
export const ListRow = Row
export const SheetSkeleton = () => <div data-sheet-skeleton className="space-y-3 px-1 pt-2" aria-hidden>
  <div className="h-3.5 w-[38%] rounded-full bg-white/[.08]" />
  <div className="h-[72px] rounded-[16px] bg-white/[.06]" />
  <div className="h-[72px] rounded-[16px] bg-white/[.06]" />
  <div className="h-[52px] rounded-[16px] bg-white/[.05]" />
</div>
function ListItem({ id, reduce, children }: { id: string | number; reduce: boolean; children: any }) {
  const present = useIsPresent()
  return <motion.div data-list-item data-exiting={present ? undefined : ""} layout={!reduce || undefined} initial={false}
    exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
    transition={reduce ? { duration: .12 } : LIST} style={{ overflow: "hidden" }}>{children}</motion.div>
}
export const List = ({ children, empty = "Aucun résultat", I = Search }: any) => {
  const xs = (Array.isArray(children) ? children.flat() : [children]).filter(Boolean)
  const reduce = useReducedMotion()
  return <Card className="overflow-hidden">{xs.length ? <AnimatePresence initial={false}>
    {xs.map((child: any, i: number) => <ListItem key={child?.key ?? i} id={child?.key ?? i} reduce={!!reduce}>{child}</ListItem>)}
  </AnimatePresence> : <div className="flex h-[96px] flex-col items-center justify-center gap-1 text-center"><I size={IS} strokeWidth={SW} className="text-white/30" /><div className={tx.cap}>{empty}</div></div>}</Card>
}
export const rise = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: .42, ease: [.22, 1, .36, 1] as const } } }
export const Section = ({ t, more, moreL, aside, children }: any) => <motion.section variants={rise} className="min-w-0"><div className="mb-3 flex h-6 items-center justify-between px-1"><h2 className="text-[17px] font-semibold tracking-[-0.02em] text-white">{t}</h2>{more ? <button onClick={more} className="text-[15px] font-medium text-white/45 hover:text-white">{moreL || "Voir tout"}</button> : aside && <span className="text-[15px] font-medium tabular-nums text-white/45">{aside}</span>}</div>{children}</motion.section>
export const Col = ({ children }: any) => { const { desk } = useC(); return <div className={desk ? "flex min-w-0 flex-col gap-8" : "contents"}>{children}</div> }
export type QAi = { I: any; l: string; on: () => void; dis?: boolean; label?: string }
export const QA = ({ items }: { items: QAi[] }) => <div className={`grid gap-2 ${items.length <= 3 ? "grid-cols-3" : "grid-cols-4"}`}>{items.map(x => <button key={x.l} type="button" data-qa={x.l} disabled={x.dis} aria-label={x.label || x.l} onClick={x.on} className="group flex flex-col items-center gap-2 disabled:opacity-35"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-b from-white/[.14] to-white/[.05] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.14),0_8px_20px_-10px_rgba(0,0,0,.9)] transition-[background,transform] duration-200 group-hover:from-white/[.2] group-active:scale-[.94]"><x.I size={IS} strokeWidth={SW} /></span><span className="text-[12px] font-medium text-white/70">{x.l}</span></button>)}</div>
/* Un seul style de graphique : barres arrondies, barre active en couleur d'agent */
export const Chart = ({ label, value, v, l, sel, c, onPick }: any) => { const mx = Math.max(...v, 1); return <Card className="p-4"><div className={tx.cap}>{label}</div><div className={`mt-2 text-[22px] ${tx.fig}`}>{value}</div>
  <div className="mt-4 flex h-[112px] gap-2">{v.map((x: number, i: number) => <button key={i} disabled={!onPick} onClick={() => onPick?.(i)} aria-label={`${l[i]} : ${x}`} aria-pressed={onPick ? i === sel : undefined} className="flex h-full flex-1 flex-col items-center gap-2"><div className="flex w-full flex-1 items-end justify-center"><motion.span initial={{ height: 0 }} animate={{ height: `${Math.max(6, x / mx * 100)}%` }} transition={{ duration: .6, delay: i * .04 }} className="w-full max-w-[32px] rounded-[10px]" style={i === sel ? { background: `linear-gradient(180deg, ${ink(c)}, ${ink(c)}99)`, boxShadow: `0 0 24px -4px ${ink(c)}80, inset 0 1px 0 rgba(255,255,255,.35)` } : { background: "linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.04))", boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)" }} /></div><span className={`text-[12px] ${i === sel ? "text-white" : "text-white/50"}`}>{l[i]}</span></button>)}</div></Card> }
export const Tg = ({ on, onClick, label }: any) => <button data-hit role="switch" aria-checked={on} aria-label={label} onClick={e => { e.stopPropagation(); onClick?.() }} className="relative h-[28px] w-[46px] shrink-0 rounded-full transition-colors" style={{ background: on ? "#2F7BFF" : "rgba(255,255,255,.14)" }}><span className="absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.4)] transition-all" style={{ left: on ? 21 : 3 }} /></button>
export const Btn = ({ children, onClick, primary, c, disabled, className = "", ...r }: any) => <button disabled={disabled} onClick={onClick} {...r} className={`flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-[15px] font-medium transition disabled:cursor-not-allowed disabled:opacity-35 ${primary ? "" : "bg-white/[.08] text-white hover:bg-white/[.12]"} ${className}`} style={primary ? { background: c ? ink(c) : "#fff", color: c && ink(c) !== "#fff" ? "#fff" : "#000" } : {}}>{children}</button>

export const TBtn = ({ I, label, onClick, href, c, dis, solid }: any) => { const cls = "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-[transform,background] duration-150 active:scale-[.9] disabled:opacity-35", white = !!(solid || c === "#fff" || c === "#FFFFFF"), st = white ? { background: "#fff", color: "#111" } : c ? { background: c, color: ink(c) === "#fff" && c !== "#E6E6E6" ? "#fff" : "#000" } : { background: "rgba(255,255,255,.09)" }, inner = <I size={16} strokeWidth={SW} />
  return href ? <a data-hit href={href} aria-label={label} title={label} onClick={e => { e.stopPropagation(); onClick?.() }} className={cls} style={st}>{inner}</a> : <button data-hit disabled={dis} aria-label={label} title={label} onClick={e => { e.stopPropagation(); onClick?.() }} className={cls} style={st}>{inner}</button> }
export const Chev = () => <ChevronRight size={IS} strokeWidth={SW} className="text-white/30" />

export const inp = "h-12 w-full rounded-[14px] border border-transparent bg-white/[.07] px-4 text-[15px] text-white outline-none [color-scheme:dark] placeholder:text-white/35 focus:border-white/25"
export const dt = inp + " akno-dt text-[16px]"
export const F = ({ l, children }: any) => <label className="block"><span className="mb-2 block px-1 text-[13px] text-white/50">{l}</span>{children}</label>

/* update67 · feuille générique : même composant que toutes les feuilles de l'app (ModalSheet, façon iOS)
   update73 · pied de feuille = un seul bloc plein (plus de dégradé ni de boutons flottants) ; le contenu réserve la hauteur
   réelle du pied (mesurée) et, quand un champ prend le focus (clavier ouvert), il défile pour que ce champ reste visible
   AU-DESSUS du pied : le pied ne recouvre plus jamais le champ en cours de saisie. */
export function Sheet({ title, sub, onClose, children, c, footer, z = 50 }: any) {
  const { desk } = useC(), sc = useRef<HTMLDivElement>(null), ft = useRef<HTMLDivElement>(null), [fh, setFh] = useState(0)
  useEffect(() => {
    const f = ft.current; if (!f) return
    const ro = new ResizeObserver(() => setFh(Math.ceil(f.getBoundingClientRect().height))); ro.observe(f); return () => ro.disconnect()
  }, [!!footer]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = sc.current; if (!el) return
    let t = 0
    const reveal = () => {
      const a = document.activeElement as HTMLElement | null; if (!a || !el.contains(a) || a === el) return
      const r = a.getBoundingClientRect(), box = el.getBoundingClientRect(), limit = ft.current ? ft.current.getBoundingClientRect().top - 12 : box.bottom - 12
      if (r.bottom > limit) el.scrollBy({ top: r.bottom - limit, behavior: "smooth" })
      else if (r.top < box.top + 8) el.scrollBy({ top: r.top - box.top - 8, behavior: "smooth" })
    }
    const onFocus = () => { clearTimeout(t); reveal(); t = window.setTimeout(reveal, 340) } // 2e passe : après l'ouverture du clavier
    const vv = window.visualViewport, onVV = () => { clearTimeout(t); t = window.setTimeout(reveal, 60) }
    el.addEventListener("focusin", onFocus); vv?.addEventListener("resize", onVV)
    return () => { clearTimeout(t); el.removeEventListener("focusin", onFocus); vv?.removeEventListener("resize", onVV) }
  }, [])
  const padB = footer ? (fh ? fh + 20 : desk ? 104 : 132) : undefined
  return <ModalSheet label={title} onClose={onClose} desk={desk} z={z} className={`bg-[#121214] ${desk ? "" : "border-t border-white/[.08]"}`} deskClass="max-w-[480px]">
      <div ref={sc} data-sheet-scroll className={`min-h-0 overflow-y-auto overscroll-contain ${footer ? "flex-1" : ""} ${desk ? (footer ? "px-6 pt-6" : "p-6") : "px-5 pt-3"}`} style={footer ? { paddingBottom: padB, scrollPaddingBottom: padB } : desk ? {} : { paddingBottom: "max(28px, var(--sab))" }}>
      {!desk && <div aria-hidden className="mb-4 h-[5px]" />}
      <div className="mb-6 flex items-center gap-3">{c && <Circ><Blob c={c} s={20} /></Circ>}<div className="min-w-0"><div className={`truncate ${tx.title}`}>{title}</div>{sub && <div className={`truncate ${tx.cap}`}>{sub}</div>}</div><button type="button" aria-label="Fermer" onClick={onClose} className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[.07] text-white/70 hover:text-white"><X size={IS} strokeWidth={SW} /></button></div>
      {children}</div>
      {footer && <div ref={ft} data-sheet-footer className={`absolute inset-x-0 bottom-0 z-10 border-t border-white/[.07] bg-[#121214] ${desk ? "px-6 pb-6 pt-4" : "px-5 pt-3"}`} style={{ paddingBottom: desk ? undefined : "max(14px, calc(var(--sab) - var(--kb, 0px)))" }}>{footer}</div>}
  </ModalSheet>
}
export const Sub = ({ children, dot }: any) => dot ? <Chip c={dot}>{children}</Chip> : <div className={tx.cap}>{children}</div>
