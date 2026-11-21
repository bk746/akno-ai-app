/* Système visuel partagé d'Akno (extrait d'AknoApp.tsx à l'update44, à l'identique)
   pour que les nouveaux écrans (Entreprise, Abonnement, Factures, Conformité, Demandes) gardent le même style. */
import React, { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react"
import { motion, useReducedMotion } from "motion/react"
import { PhoneCall, CalendarDays, Repeat2, Receipt, Search, X, ChevronRight } from "lucide-react"
import type { St } from "../lib/store"

export type K = "rec" | "ag" | "rel" | "dev"
export type P = K | "set" | "fac" | "ch" | "eq"
/** update62 · pages d'agent (blob, couleur, configurateur) — « fac » (Factures) et « ch » (Chantiers) n'en sont pas. */
export const isK = (p: P): p is K => p === "rec" || p === "ag" || p === "rel" || p === "dev"
export const A = {
  rec: { n: "Réceptionniste", c: "#E6E6E6", tab: "Réception", I: PhoneCall, slug: "reception", d: "Décroche 24/7" },
  ag: { n: "Agenda", c: "#8B7CFF", tab: "Agenda", I: CalendarDays, slug: "agenda", d: "Cale vos RDV" },
  rel: { n: "Relance", c: "#22B07A", tab: "Relance", I: Repeat2, slug: "relance", d: "Avis et rappels" },
  dev: { n: "Devis", c: "#2F6BFF", tab: "Devis", I: Receipt, slug: "devis", d: "Chiffre en direct" },
} as const

export type Modal = { kind: "entreprise" | "abonnement" | "factures" | "conformite" | "leads" | "agendaCal" | "reception" | "sms" | "call" | "callView" | "rdv" | "rel" | "relList" | "client" | "contacts" | "aiPop" | "devisPrev" | "listen" | "callbacks" | "calls" | "relView" | "devis" | "devisEdit" | "devisList" | "ev" | "pw" | "reviewUrl" | "tarifs" | "urgencePhone" | "clientReply" | "prestations" | "devisEditor" | "studio" | "equipe"; data?: any } | null
export type Ctx = { s: St; set: (f: (s: St) => St) => void; desk: boolean; page: P; go: (p: P) => void; modal: (m: Modal) => void; chat: boolean; setChat: (b: boolean) => void; toast: (t: string, undo?: () => void) => void; q: string; setQ: (q: string) => void; put?: (f: (s: St) => St) => void }
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
export const Card = ({ children, className = "" }: any) => <div className={`rounded-[24px] bg-gradient-to-b from-[#151517] to-[#111113] shadow-[inset_0_1px_0_rgba(255,255,255,.06),0_16px_40px_-24px_rgba(0,0,0,.9)] ${className}`}>{children}</div>
export const Dot = ({ c }: { c: string }) => <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c }} />
export const Chip = ({ c, children }: any) => <span className="inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[12px] font-medium" style={{ background: c === GREY ? "rgba(255,255,255,.06)" : c + "1F", color: c === GREY ? "rgba(255,255,255,.55)" : c }}><span className="h-[5px] w-[5px] rounded-full" style={{ background: c === GREY ? "rgba(255,255,255,.4)" : c }} />{children}</span>
export const Circ = ({ children, c, className = "" }: any) => <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[.07] text-white ${className}`} style={c ? { background: c + "29", color: ink(c) } : {}}>{children}</span>
export const Ic = ({ I, c }: any) => <Circ c={c}><I size={IS} strokeWidth={SW} /></Circ>
export const Av = ({ n }: { n: string }) => { const { page } = useC(), c = isK(page) ? A[page].c : "#FFFFFF"; return <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tracking-[.02em] text-white/90" style={{ background: `linear-gradient(180deg, ${c}38, ${c}1A)`, boxShadow: `inset 0 0 0 1px ${c}26` }}>{initials(n)}</span> }
export const Row = ({ lead, t, s, r, rs, onClick, first, label }: any) => <div onClick={onClick} {...(onClick ? { role: "button", tabIndex: 0, "aria-label": label, onKeyDown: (e: any) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onClick() } } } : {})} className={`flex w-full items-center gap-3 pl-4 text-left ${onClick ? "cursor-pointer transition-colors hover:bg-white/[.03] focus-visible:bg-white/[.04]" : ""} first:rounded-t-[24px] last:rounded-b-[24px]`}>
  {lead}<div className={`flex min-h-[64px] min-w-0 flex-1 items-center gap-3 py-3 pr-4 ${first ? "" : "border-t border-white/[.07]"}`}>
    <div className="min-w-0 flex-1"><div className={`truncate ${tx.body}`}>{t}</div>{s && <div className={`mt-0.5 truncate ${tx.cap}`}>{s}</div>}</div>
    {(r !== undefined || rs) && <div className="flex shrink-0 flex-col items-end">{typeof r === "string" || typeof r === "number" ? <div className={tx.body}>{r}</div> : r}{rs && <div className="mt-0.5">{typeof rs === "string" ? <span className={tx.cap}>{rs}</span> : rs}</div>}</div>}</div></div>
export const List = ({ children, empty = "Aucun résultat", I = Search }: any) => { const xs = (Array.isArray(children) ? children.flat() : [children]).filter(Boolean); return <Card className="overflow-hidden">{xs.length ? xs : <div className="flex h-[96px] flex-col items-center justify-center gap-1 text-center"><I size={IS} strokeWidth={SW} className="text-white/30" /><div className={tx.cap}>{empty}</div></div>}</Card> }
export const rise = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: .42, ease: [.22, 1, .36, 1] as const } } }
export const Section = ({ t, more, moreL, aside, children }: any) => <motion.section variants={rise} className="min-w-0"><div className="mb-3 flex h-6 items-center justify-between px-1"><h2 className={tx.title}>{t}</h2>{more ? <button onClick={more} className="text-[15px] font-medium text-white/50 hover:text-white">{moreL || "Voir tout"}</button> : aside && <span className={tx.cap}>{aside}</span>}</div>{children}</motion.section>
export const Col = ({ children }: any) => { const { desk } = useC(); return <div className={desk ? "flex min-w-0 flex-col gap-8" : "contents"}>{children}</div> }
export type QAi = { I: any; l: string; on: () => void; dis?: boolean }
export const QA = ({ items }: { items: QAi[] }) => <div className="grid grid-cols-4 gap-2">{items.map(x => <button key={x.l} disabled={x.dis} onClick={x.on} className="group flex flex-col items-center gap-2 disabled:opacity-35"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-b from-white/[.14] to-white/[.05] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.14),0_8px_20px_-10px_rgba(0,0,0,.9)] transition-[background,transform] duration-200 group-hover:from-white/[.2] group-active:scale-[.94]"><x.I size={IS} strokeWidth={SW} /></span><span className="text-[12px] font-medium text-white/70">{x.l}</span></button>)}</div>
/* Un seul style de graphique : barres arrondies, barre active en couleur d'agent */
export const Chart = ({ label, value, v, l, sel, c, onPick }: any) => { const mx = Math.max(...v, 1); return <Card className="p-4"><div className={tx.cap}>{label}</div><div className={`mt-2 text-[22px] ${tx.fig}`}>{value}</div>
  <div className="mt-4 flex h-[112px] gap-2">{v.map((x: number, i: number) => <button key={i} disabled={!onPick} onClick={() => onPick?.(i)} aria-label={`${l[i]} : ${x}`} aria-pressed={onPick ? i === sel : undefined} className="flex h-full flex-1 flex-col items-center gap-2"><div className="flex w-full flex-1 items-end justify-center"><motion.span initial={{ height: 0 }} animate={{ height: `${Math.max(6, x / mx * 100)}%` }} transition={{ duration: .6, delay: i * .04 }} className="w-full max-w-[32px] rounded-[10px]" style={i === sel ? { background: `linear-gradient(180deg, ${ink(c)}, ${ink(c)}99)`, boxShadow: `0 0 24px -4px ${ink(c)}80, inset 0 1px 0 rgba(255,255,255,.35)` } : { background: "linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.04))", boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)" }} /></div><span className={`text-[12px] ${i === sel ? "text-white" : "text-white/50"}`}>{l[i]}</span></button>)}</div></Card> }
export const Tg = ({ on, onClick, label }: any) => <button data-hit role="switch" aria-checked={on} aria-label={label} onClick={e => { e.stopPropagation(); onClick?.() }} className="relative h-[28px] w-[46px] shrink-0 rounded-full transition-colors" style={{ background: on ? "#2F7BFF" : "rgba(255,255,255,.14)" }}><span className="absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.4)] transition-all" style={{ left: on ? 21 : 3 }} /></button>
export const Btn = ({ children, onClick, primary, c, disabled, className = "", ...r }: any) => <button disabled={disabled} onClick={onClick} {...r} className={`flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-[15px] font-medium transition disabled:cursor-not-allowed disabled:opacity-35 ${primary ? "" : "bg-white/[.08] text-white hover:bg-white/[.12]"} ${className}`} style={primary ? { background: c ? ink(c) : "#fff", color: c && ink(c) !== "#fff" ? "#fff" : "#000" } : {}}>{children}</button>

export const TBtn = ({ I, label, onClick, href, c, dis }: any) => { const cls = "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-[transform,background] duration-150 active:scale-[.9] disabled:opacity-35", st = c ? { background: c, color: ink(c) === "#fff" && c !== "#E6E6E6" ? "#fff" : "#000" } : { background: "rgba(255,255,255,.09)" }, inner = <I size={16} strokeWidth={SW} />
  return href ? <a data-hit href={href} aria-label={label} title={label} onClick={e => { e.stopPropagation(); onClick?.() }} className={cls} style={st}>{inner}</a> : <button data-hit disabled={dis} aria-label={label} title={label} onClick={e => { e.stopPropagation(); onClick?.() }} className={cls} style={st}>{inner}</button> }
export const Chev = () => <ChevronRight size={IS} strokeWidth={SW} className="text-white/30" />

export const inp = "h-12 w-full rounded-[14px] border border-transparent bg-white/[.07] px-4 text-[15px] text-white outline-none [color-scheme:dark] placeholder:text-white/35 focus:border-white/25"
export const F = ({ l, children }: any) => <label className="block"><span className="mb-2 block px-1 text-[13px] text-white/50">{l}</span>{children}</label>

export function Sheet({ title, sub, onClose, children, c, footer }: any) {
  const { desk } = useC()
  useEffect(() => { const f = (e: KeyboardEvent) => e.key === "Escape" && onClose(); addEventListener("keydown", f); return () => removeEventListener("keydown", f) }, [onClose])
  return <motion.div className={`fixed inset-0 z-50 flex bg-black/60 backdrop-blur-[2px] ${desk ? "items-center justify-center" : "items-end kb-sheet"}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
    <motion.div role="dialog" aria-label={title} onClick={e => e.stopPropagation()} initial={desk ? { scale: .97, opacity: 0 } : { y: 40, opacity: 0 }} animate={desk ? { scale: 1, opacity: 1 } : { y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 340, damping: 32, mass: .9 }} className={`w-full border-white/[.08] bg-[#121214] shadow-[0_-30px_60px_-20px_rgba(0,0,0,.9)] ${desk ? "max-h-[86dvh] max-w-[480px] rounded-[24px] border" : "kb-panel max-h-[90dvh] rounded-t-[24px] border-t"} ${footer ? "relative flex flex-col overflow-hidden" : desk ? "overflow-y-auto p-6" : "overflow-y-auto px-5 pt-3"}`} style={desk || footer ? {} : { paddingBottom: "max(28px, env(safe-area-inset-bottom))" }}>
      <div className={footer ? `min-h-0 flex-1 overflow-y-auto ${desk ? "px-6 pt-6" : "px-5 pt-3"}` : "contents"} style={footer ? { paddingBottom: desk ? 104 : "calc(112px + env(safe-area-inset-bottom))" } : {}}>
      {!desk && <div className="mx-auto mb-4 h-[5px] w-9 rounded-full bg-white/20" />}
      <div className="mb-6 flex items-center gap-3">{c && <Circ><Blob c={c} s={20} /></Circ>}<div className="min-w-0"><div className={`truncate ${tx.title}`}>{title}</div>{sub && <div className={`truncate ${tx.cap}`}>{sub}</div>}</div><button type="button" aria-label="Fermer" onClick={onClose} className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[.07] text-white/70 hover:text-white"><X size={IS} strokeWidth={SW} /></button></div>
      {children}</div>
      {footer && <div className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 ${desk ? "px-6 pb-6" : "px-5"}`} style={{ paddingBottom: desk ? undefined : "max(20px, env(safe-area-inset-bottom))", paddingTop: 28, background: "linear-gradient(to bottom, rgba(18,18,20,0) 0, rgba(18,18,20,.82) 26px, #121214 52px)" }}><div className="pointer-events-auto">{footer}</div></div>}</motion.div></motion.div>
}
export const Sub = ({ children, dot }: any) => dot ? <Chip c={dot}>{children}</Chip> : <div className={tx.cap}>{children}</div>
