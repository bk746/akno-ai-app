import DevisPaper from "./DevisPaper"
import VoiceCall from "./VoiceCall"
import { buildDoc } from "../lib/devisDoc"
import { answer, askExternal, HELP_CHIPS, type Pending, type RAct, type RItem } from "../lib/assistant"
import { useLocation, useNavigate } from "react-router-dom"
import { Component, type ReactNode, createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { motion, AnimatePresence, useReducedMotion, animate, MotionConfig } from "motion/react"
import { Plus, Sparkles, Mic, Play, Pause, ArrowUp, X, PhoneCall, CalendarDays, Repeat2, Receipt, ChevronRight, ChevronLeft, Phone, Clock, AudioLines, MessageSquareText, Percent, FileSignature, ImageIcon, Timer, MapPin, Bell, Smartphone, CreditCard, LifeBuoy, LogOut, Search, Send, Mail, RotateCcw, Trash2, Check, Download, FileText , Users, ScanFace } from "lucide-react"
import { BLOB } from "./blobPath"
import { PHONES, useStore, uid, BASE, addDays, eur, seed } from "../lib/store"
import { supabase } from "../lib/supabase"
import Login from "./Login"
import { LockScreen, LockSetup } from "./Lock"
import { bioAvailable, disableBio, enableBio, getLock, hasLock } from "../lib/lock"
import type { Session } from "@supabase/supabase-js"
import type { Client, St, Devis, DevStatus, Rel, Ev, Call, Msg } from "../lib/store"

/* Visuels repris à l'identique de Desktop.tsx (/desktop) et Mobile.tsx (/mobile). */
type K = "rec" | "ag" | "rel" | "dev"
type P = K | "set"
const A = {
  rec: { n: "Réceptionniste", c: "#5B1BE0", tab: "Réception", I: PhoneCall, slug: "reception", d: "Décroche 24/7" },
  ag: { n: "Agenda", c: "#FF7070", tab: "Agenda", I: CalendarDays, slug: "agenda", d: "Cale vos RDV" },
  rel: { n: "Relance", c: "#E6E6E6", tab: "Relance", I: Repeat2, slug: "relance", d: "Avis et rappels" },
  dev: { n: "Devis", c: "#0E8F8F", tab: "Devis", I: Receipt, slug: "devis", d: "Chiffre en direct" },
} as const
const agents = ["rec", "ag", "rel", "dev"] as const
const SLUG: Record<string, P> = { reception: "rec", agenda: "ag", relance: "rel", devis: "dev", parametres: "set" }
const slugOf = (p: P) => p === "set" ? "parametres" : A[p].slug
const DAYS = ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."]
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
const _now = new Date(), TODAY = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`, NOW = _now.getHours() + _now.getMinutes() / 60
const hh = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`
const dd = (iso: string) => new Date(iso + "T12:00:00")
const dlabel = (iso: string) => `${DAYS[(dd(iso).getDay() + 6) % 7]} ${dd(iso).getDate()}`
const short = (n: string) => /^(M\.|Mme|Chantier)/.test(n) ? n : n.split(" ").length > 1 ? `${n[0]}. ${n.split(" ").slice(1).join(" ")}` : n
const ttc = (ht: number, tv: number) => Math.round(ht * (1 + tv / 100))
const ST: Record<DevStatus, [string, string]> = { aval: ["À valider", "#0E8F8F"], brouillon: ["Brouillon", "rgba(255,255,255,.3)"], att: ["En attente", "#FFB340"], env: ["Envoyé", "rgba(255,255,255,.3)"], val: ["Validé", "#30D158"], ref: ["Refusé", "#FF5F57"] }
const RS: Record<Rel["status"], [string, string]> = { prog: ["Programmée", "#FFB340"], pause: ["En pause", "rgba(255,255,255,.15)"], env: ["Envoyée", "rgba(255,255,255,.3)"], rep: ["Répondu", "#30D158"] }

type Modal = { kind: "call" | "callView" | "rdv" | "rel" | "relList" | "client" | "contacts" | "aiPop" | "devisPrev" | "listen" | "callbacks" | "calls" | "relView" | "devis" | "devisEdit" | "devisList" | "ev" | "pw"; data?: any } | null
type Ctx = { s: St; set: (f: (s: St) => St) => void; desk: boolean; page: P; go: (p: P) => void; modal: (m: Modal) => void; chat: boolean; setChat: (b: boolean) => void; toast: (t: string, undo?: () => void) => void; q: string; setQ: (q: string) => void }
const C = createContext<Ctx>(null as any)
const useC = () => useContext(C)
const match = (q: string, ...xs: string[]) => !q || xs.join(" ").toLowerCase().includes(q.toLowerCase())

// Écoute (Réceptionniste qui lit un appel) : petit store global pour élargir les yeux
let listenV = false; const listenL = new Set<() => void>()
const setListen = (v: boolean) => { listenV = v; listenL.forEach(f => f()) }
const useListen = () => useSyncExternalStore(f => { listenL.add(f); return () => { listenL.delete(f) } }, () => listenV, () => false)
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
// Yeux vivants : clignements aléatoires (parfois doubles) + regards/saccades autonomes. Pas de suivi du pointeur.
function Eyes({ small, wide }: { small: boolean; wide: boolean }) {
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
      <ellipse cx={106.5} cy={104.5} rx={22.5} ry={31} fill="#000" /><ellipse cx={169.5} cy={104.5} rx={22.5} ry={31} fill="#000" /></motion.g></motion.g>
}
const Blob = ({ c, s }: { c: string; s: number }) => { const l = useListen(); return <svg viewBox="0 0 267 279" width={s} height={s * 279 / 267}><path d={BLOB} fill={c} /><Eyes small={s < 60} wide={l && s >= 60 && c === A.rec.c} /></svg> }
/* ================= Design system (tokens uniques) =================
   Espacements : 4/8/12/16/20/24/32 · Rayon carte : 24 · Surface : #121214 · Filet : white/7 %
   Texte : fig (chiffre), title 17 semibold, body 15 medium, cap 13 gris · Icônes : 20 px, trait 1.75 */
const GREEN = "#30D158", AMBER = "#FFB340", RED = "#FF5F57", GREY = "rgba(255,255,255,.3)"
const tx = { fig: "font-semibold leading-none tracking-[-0.04em]", title: "text-[17px] font-semibold tracking-[-0.02em]", body: "text-[15px] font-medium tracking-[-0.01em] text-white", cap: "text-[13px] text-white/50" }
const IS = 20, SW = 1.75
const ink = (c: string) => c === "#E6E6E6" || c === "#FFFFFF" ? "#fff" : c
const initials = (n: string) => n.replace(/^(M\.|Mme|Chantier)\s*/, "").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()
const durF = (d: number) => d < 1 ? "30 min" : `${String(d).replace(".", ",")} h`
const Card = ({ children, className = "" }: any) => <div className={`rounded-[24px] bg-gradient-to-b from-[#151517] to-[#111113] shadow-[inset_0_1px_0_rgba(255,255,255,.06),0_16px_40px_-24px_rgba(0,0,0,.9)] ${className}`}>{children}</div>
const Dot = ({ c }: { c: string }) => <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c }} />
const Chip = ({ c, children }: any) => <span className="inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[12px] font-medium" style={{ background: c === GREY ? "rgba(255,255,255,.06)" : c + "1F", color: c === GREY ? "rgba(255,255,255,.55)" : c }}><span className="h-[5px] w-[5px] rounded-full" style={{ background: c === GREY ? "rgba(255,255,255,.4)" : c }} />{children}</span>
const Circ = ({ children, c, className = "" }: any) => <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[.07] text-white ${className}`} style={c ? { background: c + "29", color: ink(c) } : {}}>{children}</span>
const Ic = ({ I, c }: any) => <Circ c={c}><I size={IS} strokeWidth={SW} /></Circ>
const Av = ({ n }: { n: string }) => { const { page } = useC(), c = page === "set" ? "#FFFFFF" : A[page].c; return <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tracking-[.02em] text-white/90" style={{ background: `linear-gradient(180deg, ${c}38, ${c}1A)`, boxShadow: `inset 0 0 0 1px ${c}26` }}>{initials(n)}</span> }
const Row = ({ lead, t, s, r, rs, onClick, first, label }: any) => <div onClick={onClick} {...(onClick ? { role: "button", tabIndex: 0, "aria-label": label, onKeyDown: (e: any) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onClick() } } } : {})} className={`flex w-full items-center gap-3 pl-4 text-left ${onClick ? "cursor-pointer transition-colors hover:bg-white/[.03] focus-visible:bg-white/[.04]" : ""} first:rounded-t-[24px] last:rounded-b-[24px]`}>
  {lead}<div className={`flex min-h-[64px] min-w-0 flex-1 items-center gap-3 py-3 pr-4 ${first ? "" : "border-t border-white/[.07]"}`}>
    <div className="min-w-0 flex-1"><div className={`truncate ${tx.body}`}>{t}</div>{s && <div className={`mt-0.5 truncate ${tx.cap}`}>{s}</div>}</div>
    {(r !== undefined || rs) && <div className="flex shrink-0 flex-col items-end">{typeof r === "string" || typeof r === "number" ? <div className={tx.body}>{r}</div> : r}{rs && <div className="mt-0.5">{typeof rs === "string" ? <span className={tx.cap}>{rs}</span> : rs}</div>}</div>}</div></div>
const List = ({ children, empty = "Aucun résultat", I = Search }: any) => { const xs = (Array.isArray(children) ? children.flat() : [children]).filter(Boolean); return <Card className="overflow-hidden">{xs.length ? xs : <div className="flex h-[96px] flex-col items-center justify-center gap-1 text-center"><I size={IS} strokeWidth={SW} className="text-white/30" /><div className={tx.cap}>{empty}</div></div>}</Card> }
const rise = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: .42, ease: [.22, 1, .36, 1] as const } } }
const Section = ({ t, more, moreL, aside, children }: any) => <motion.section variants={rise} className="min-w-0"><div className="mb-3 flex h-6 items-center justify-between px-1"><h2 className={tx.title}>{t}</h2>{more ? <button onClick={more} className="text-[15px] font-medium text-white/50 hover:text-white">{moreL || "Voir tout"}</button> : aside && <span className={tx.cap}>{aside}</span>}</div>{children}</motion.section>
const Col = ({ children }: any) => { const { desk } = useC(); return <div className={desk ? "flex min-w-0 flex-col gap-8" : "contents"}>{children}</div> }
type QAi = { I: any; l: string; on: () => void; dis?: boolean }
const QA = ({ items }: { items: QAi[] }) => <div className="grid grid-cols-4 gap-2">{items.map(x => <button key={x.l} disabled={x.dis} onClick={x.on} className="group flex flex-col items-center gap-2 disabled:opacity-35"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-b from-white/[.14] to-white/[.05] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.14),0_8px_20px_-10px_rgba(0,0,0,.9)] transition-[background,transform] duration-200 group-hover:from-white/[.2] group-active:scale-[.94]"><x.I size={IS} strokeWidth={SW} /></span><span className="text-[12px] font-medium text-white/70">{x.l}</span></button>)}</div>
/* Un seul style de graphique : barres arrondies, barre active en couleur d'agent */
const Chart = ({ label, value, v, l, sel, c, onPick }: any) => { const mx = Math.max(...v, 1); return <Card className="p-4"><div className={tx.cap}>{label}</div><div className={`mt-2 text-[22px] ${tx.fig}`}>{value}</div>
  <div className="mt-4 flex h-[112px] gap-2">{v.map((x: number, i: number) => <button key={i} disabled={!onPick} onClick={() => onPick?.(i)} aria-label={`${l[i]} : ${x}`} aria-pressed={onPick ? i === sel : undefined} className="flex h-full flex-1 flex-col items-center gap-2"><div className="flex w-full flex-1 items-end justify-center"><motion.span initial={{ height: 0 }} animate={{ height: `${Math.max(6, x / mx * 100)}%` }} transition={{ duration: .6, delay: i * .04 }} className="w-full max-w-[32px] rounded-[10px]" style={i === sel ? { background: `linear-gradient(180deg, ${ink(c)}, ${ink(c)}99)`, boxShadow: `0 0 24px -4px ${ink(c)}80, inset 0 1px 0 rgba(255,255,255,.35)` } : { background: "linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.04))", boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)" }} /></div><span className={`text-[12px] ${i === sel ? "text-white" : "text-white/50"}`}>{l[i]}</span></button>)}</div></Card> }
const Tg = ({ on, onClick, label }: any) => <button data-hit role="switch" aria-checked={on} aria-label={label} onClick={e => { e.stopPropagation(); onClick?.() }} className="relative h-[28px] w-[46px] shrink-0 rounded-full transition-colors" style={{ background: on ? "#2F7BFF" : "rgba(255,255,255,.14)" }}><span className="absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.4)] transition-all" style={{ left: on ? 21 : 3 }} /></button>
const Btn = ({ children, onClick, primary, c, disabled, className = "", ...r }: any) => <button disabled={disabled} onClick={onClick} {...r} className={`flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-[15px] font-medium transition disabled:cursor-not-allowed disabled:opacity-35 ${primary ? "" : "bg-white/[.08] text-white hover:bg-white/[.12]"} ${className}`} style={primary ? { background: c ? ink(c) : "#fff", color: c && ink(c) !== "#fff" ? "#fff" : "#000" } : {}}>{children}</button>
let CL: Client[] = []
const ckey = (n: string) => n.replace(/^(M\.|Mme|Chantier)\s*/, "").trim().split(" ").slice(-1)[0].toLowerCase()
const findC = (n: string) => CL.find(c => c.key === ckey(n))
const tel = (n: string) => { const p = PHONES.get(n); if (p) return p; const f = findC(n); if (f) return f.phone.replace(/ /g, ""); let h = 7; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) % 100000000; return "06" + String(h).padStart(8, "0") }
const TBtn = ({ I, label, onClick, href, c, dis }: any) => { const cls = "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-[transform,background] duration-150 active:scale-[.9] disabled:opacity-35", st = c ? { background: c, color: ink(c) === "#fff" && c !== "#E6E6E6" ? "#fff" : "#000" } : { background: "rgba(255,255,255,.09)" }, inner = <I size={16} strokeWidth={SW} />
  return href ? <a data-hit href={href} aria-label={label} title={label} onClick={e => { e.stopPropagation(); onClick?.() }} className={cls} style={st}>{inner}</a> : <button data-hit disabled={dis} aria-label={label} title={label} onClick={e => { e.stopPropagation(); onClick?.() }} className={cls} style={st}>{inner}</button> }
const Chev = () => <ChevronRight size={IS} strokeWidth={SW} className="text-white/30" />

function Side() {
  const { page, go, s } = useC()
  const It = ({ id, l, c }: any) => { const on = id === page; return <motion.button whileTap={{ scale: .97 }} onClick={() => go(id)} aria-current={on ? "page" : undefined} className={`relative flex h-11 w-full items-center gap-3 rounded-full px-4 text-[15px] font-medium transition-colors ${on ? "text-white" : "text-white/45 hover:text-white/80"}`}>{on && <motion.span layoutId="side-pill" transition={spring} className="absolute inset-0 rounded-full bg-white/10" />}<span className="relative flex w-full items-center gap-3">{id === "set" ? <Me size={20} on={on} /> : <NI d={NAV_I[id as P]} size={20} />}{l}{on && <span className="ml-auto h-[5px] w-[5px] rounded-full" style={{ background: ink(c) }} />}</span></motion.button> }
  return <aside className="flex w-[240px] shrink-0 flex-col border-r border-white/[.07] px-4 py-6">
    <div className="flex h-12 items-center px-3"><img src="/logo.png" alt="Akno" className="h-9" /></div>
    <nav aria-label="Navigation principale" className="mt-8 space-y-1">{agents.map(a => <It key={a} id={a} l={A[a].tab} c={A[a].c} />)}</nav>
    <div className={`mt-8 px-3 ${tx.cap}`}>Agents</div>
    <div className="mt-3 space-y-3 px-3">{agents.map(a => <button key={a} onClick={() => go(a)} className="flex w-full items-center gap-3 text-[13px] text-white/70"><Blob c={A[a].c} s={16} />{A[a].n}<span className="ml-auto"><Dot c={s.settings.agents[a] ? GREEN : GREY} /></span></button>)}</div>
    <div className="mt-auto"><It id="set" l="Paramètres" c="#fff" /><div className="mt-3 flex items-center gap-3 border-t border-white/[.07] px-3 pt-4"><Av n={meName(s)} /><div><div className="text-[13px] font-medium">{meName(s)}</div><div className="text-[12px] text-white/50">{s.settings.company || ""}</div></div></div></div>
  </aside>
}
const PLUS: Record<K, string> = { rec: "Nouvelle note d'appel", ag: "Nouveau rendez-vous", rel: "Nouvelle relance", dev: "Nouveau devis" }
const plusKind: Record<K, any> = { rec: "call", ag: "rdv", rel: "rel", dev: "devis" }
function Capsule({ k, sm }: { k: K; sm?: boolean }) {
  const { modal, setChat, chat } = useC()
  return <div className={`flex items-center ${sm ? "gap-2" : "gap-4"}`}><button data-hit aria-label={`Discuter avec l'IA ${A[k].n}`} title="Assistant" onClick={() => setChat(!chat)} className={`relative flex ${sm ? "h-8 w-8" : "h-9 w-9"} items-center justify-center rounded-[10px] bg-[#141416] text-white/55 hover:text-white`}><Sparkles size={sm ? 16 : 18} strokeWidth={1.5} /><span className="absolute right-[5px] top-[5px] h-[6px] w-[6px] rounded-full" style={{ background: A[k].c }} /></button>{!sm && <button aria-label={PLUS[k]} title={`${PLUS[k]} (N)`} onClick={() => modal({ kind: plusKind[k] })} className={`${sm ? "flex h-8 w-8 rounded-[10px]" : "-mx-[11px] flex h-11 w-11"} items-center justify-center text-white hover:text-white/80`}><Plus size={sm ? 20 : 22} strokeWidth={1.5} /></button>}</div>
}
function Top() {
  const { page, q, setQ, modal } = useC(), ref = useRef<HTMLInputElement>(null)
  useEffect(() => { const f = (e: KeyboardEvent) => { const t = e.target as HTMLElement, typing = /INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable
    if (((e.metaKey || e.ctrlKey) && e.key === "k") || (!typing && e.key === "/")) { e.preventDefault(); ref.current?.focus() }
    else if (!typing && !e.metaKey && !e.ctrlKey && (e.key === "n" || e.key === "N") && page !== "set" && !document.querySelector("[role=dialog]")) { e.preventDefault(); modal({ kind: plusKind[page] }) } }
    addEventListener("keydown", f); return () => removeEventListener("keydown", f) }, [page, modal])
  return <div className="flex h-16 shrink-0 items-center border-b border-white/[.07] bg-black px-8"><span className={tx.title}>{page === "set" ? "Paramètres" : A[page].n}</span>
    <div className="ml-auto flex items-center gap-4"><label className="flex h-9 w-[240px] items-center gap-2 rounded-full bg-white/[.07] px-3 text-[13px] text-white/50"><Search size={16} strokeWidth={SW} className="shrink-0" /><input ref={ref} value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher" className="w-full min-w-0 bg-transparent text-white outline-none placeholder:text-white/40" />{q ? <button aria-label="Effacer" onClick={() => setQ("")}><X size={14} /></button> : <kbd className="ml-auto rounded-[6px] bg-white/[.08] px-1.5 font-sans text-[11px] text-white/50">/</kbd>}</label>
      {page !== "set" && <Capsule k={page} />}</div></div>
}
function Num({ n, u, money }: { n: number; u?: string; money?: boolean }) {
  const reduce = useReducedMotion(), [v, setV] = useState(0), from = useRef(0)
  useEffect(() => { if (reduce) return; const c = animate(from.current, n, { duration: .9, ease: [.22, 1, .36, 1], onUpdate: x => { from.current = x; setV(x) } }); return () => c.stop() }, [n, reduce])
  const x = Math.round(reduce ? n : v), t = money ? x.toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ") : String(x)
  return <span aria-label={`${n}${u ? " " + u : ""}`} className="inline-flex items-baseline gap-[.12em]"><span>{t}</span>{u && <span className="text-[.42em] font-normal tracking-[-0.01em] text-white/45">{u}</span>}</span>
}
/* Gabarit unique de page : blob + chiffre clé + actions rondes + sections */
function Shell({ k, lead, label, fig, sub, actions, children }: { k?: K; lead?: any; label?: any; fig: any; sub: any; actions: QAi[]; children: any }) {
  const { desk, s, setChat } = useC(), on = k ? s.settings.agents[k] : true
  const L = lead || (k && <div className="relative"><div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[260px] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: `radial-gradient(circle, ${A[k].c}${k === "rel" ? "1A" : "33"} 0%, transparent 62%)` }} /><motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}><Blob c={A[k].c} s={desk ? 86 : 106} /></motion.div></div>)
  const lab = label || (k && <><Dot c={on ? GREEN : GREY} />{A[k].n} · {on ? "En ligne" : "En pause"}</>)
  const H = <div className={desk ? "min-w-0" : "flex flex-col items-center text-center"}><div className={`flex items-center gap-1.5 ${desk ? "text-[12px]" : "mt-4 text-[10px] leading-none [&>span:first-child]:h-[5px] [&>span:first-child]:w-[5px]"} normal-case text-white/40`}>{lab}</div><div className={`${desk ? "mt-1 text-[52px]" : "mt-3 text-[44px]"} font-normal tabular-nums leading-none tracking-[-0.03em] text-white/90`}>{fig}</div><div className={`mt-2 ${tx.cap}`}>{sub}</div></div>
  const LB = L && <button type="button" aria-label="Ouvrir l'assistant" onClick={() => setChat(true)} className="block cursor-pointer select-none transition-transform duration-150 active:scale-95 [-webkit-tap-highlight-color:transparent]">{L}</button>
  const foot = null
  if (desk) return <div className="h-full overflow-y-auto px-8 pt-8"><motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: .03 } } }} className="mx-auto w-full max-w-[1040px]"><motion.div variants={rise} className="flex items-center gap-6">{LB}{H}<div className="ml-auto w-[360px] shrink-0"><QA items={actions} /></div></motion.div><div className="mt-12 grid grid-cols-2 items-start gap-6">{children}</div>{foot}</motion.div></div>
  return <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: .03 } } }} className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
    <div aria-hidden className="shrink-0" style={{ height: "calc(var(--sat) + 2px)" }} />
    <div className="flex h-10 shrink-0 items-center px-5"><img src="/logo.png" alt="Akno" className="h-[25px] w-auto" />{k && <div className="ml-auto flex items-center"><Capsule k={k} sm /></div>}</div>
    <motion.div variants={rise} className="mt-6 flex flex-col items-center px-5">{LB}{H}</motion.div>
    <motion.div variants={rise} className="mt-8 px-4"><QA items={actions} /></motion.div>
    <div className="mt-5 flex flex-col gap-8 px-4">{children}</div>{foot}<div aria-hidden className="shrink-0" style={{ height: "calc(92px + max(var(--sab) - 10px, 12px))" }} /></motion.div>
}
/* Icônes de navigation dessinées sur mesure : grille 24, trait 1.75, extrémités arrondies, même taille optique */
const meName = (s: St) => s.settings.name?.trim() || s.settings.company?.trim() || s.settings.email?.split("@")[0] || "Mon compte"
const meIniS = (s: St): string => { const p = s.settings.name?.trim(), c = s.settings.company?.trim(); return p && c && meIni(p).length < 2 ? (p[0] + meIni(c)[0]).toUpperCase() : meIni(meName(s)) }
const meIni = (n: string) => n.replace(/^(M\.|Mme)\s*/, "").split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join("").toUpperCase()
/* Avatar initiales du profil (remplace l'icône réglages) */
const Me = ({ size = 24, on }: { size?: number; on?: boolean }) => { const { s } = useC(), n = meName(s); return <span aria-hidden className="flex shrink-0 select-none items-center justify-center rounded-full font-semibold leading-none tracking-normal" style={{ width: size, height: size, fontSize: size >= 24 ? 10.5 : 9.5, background: on ? "#FFFFFF" : "#2C2C2E", color: on ? "#000" : "rgba(255,255,255,.72)", paddingTop: .5, fontFeatureSettings: '"case" 1' }}>{meIniS(s)}</span> }
const NI = ({ d, size = 22 }: { d: any; size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
const NAV_I: Record<P, any> = {
  rec: <><path d="M5.5 4.5h3l1.5 4-2 1.25a10 10 0 0 0 6.25 6.25L15.5 14l4 1.5v3a1.5 1.5 0 0 1-1.5 1.5A14.5 14.5 0 0 1 4 6a1.5 1.5 0 0 1 1.5-1.5Z" /></>,
  ag: <><rect x="4" y="5.5" width="16" height="14" rx="3.5" /><path d="M8.5 3.5v3.5M15.5 3.5v3.5M4 10.5h16" /><circle cx="12" cy="15" r=".6" fill="currentColor" /></>,
  rel: <><path d="M19.5 12a7.5 7.5 0 0 1-12.9 5.2" /><path d="M4.5 12a7.5 7.5 0 0 1 12.9-5.2" /><path d="M17.8 3.8v3.4h-3.4M6.2 20.2v-3.4h3.4" /></>,
  dev: <><path d="M7 3.5h7l4.5 4.5v10.5A2 2 0 0 1 16.5 20.5h-9.5A2 2 0 0 1 5 18.5v-13a2 2 0 0 1 2-2Z" /><path d="M13.5 3.5V8h5M8.5 12.5h7M8.5 16h4.5" /></>,
  set: <><path d="M4.5 7.5h8M16.5 7.5h3M4.5 16.5h3M11.5 16.5h8" /><circle cx="14.5" cy="7.5" r="2" /><circle cx="9.5" cy="16.5" r="2" /></>,
}
const NAV_C: Record<P, string> = { rec: A.rec.c, ag: A.ag.c, rel: "#fff", dev: A.dev.c, set: "#fff" }
const NAV_L: Record<P, string> = { rec: "Réception", ag: "Agenda", rel: "Relance", dev: "Devis", set: "Réglages" }
const spring = { type: "spring" as const, stiffness: 520, damping: 38, mass: .8 }
function TabBar() {
  const { page, go } = useC()
  const ids: P[] = ["rec", "ag", "rel", "dev", "set"]
  return <nav aria-label="Navigation principale" className="pointer-events-none fixed inset-x-4 z-30 flex justify-center" style={{ bottom: "max(calc(var(--sab) - 10px), 12px)" }}>
    <div className="pointer-events-auto flex h-[72px] w-full items-center gap-0 rounded-full border border-white/[.10] bg-[#161618]/80 p-[6px] shadow-[0_24px_48px_-12px_rgba(0,0,0,.85),0_8px_16px_-8px_rgba(0,0,0,.6),inset_0_1px_0_rgba(255,255,255,.04)] backdrop-blur-[24px] backdrop-saturate-[1.8]">
      {ids.map(id => { const on = id === page; return <motion.button key={id} onClick={() => go(id)} aria-label={NAV_L[id]} aria-current={on ? "page" : undefined} whileTap={{ scale: .94 }}
        className={`relative flex h-full flex-1 flex-col items-center justify-center gap-[5px] rounded-full transition-colors ${on ? "text-white" : "text-white/60"}`}>
        {on && <motion.span layoutId="tab-pill" transition={spring} className="absolute inset-0 rounded-full bg-white/[.10]" />}
        <span className="relative">{id === "set" ? <Me size={24} on={on} /> : id === "rec" ? <span className="flex h-6 w-6 items-center justify-center"><img src="/logo.png" alt="" className={`h-[18px] w-auto transition-opacity ${on ? "opacity-100" : "opacity-60"}`} /></span> : <NI d={NAV_I[id]} size={24} />}</span>
        <span className="relative whitespace-nowrap text-[11px] font-semibold leading-none tracking-[-0.005em]">{NAV_L[id]}</span>
      </motion.button> })}
    </div></nav>
}

/* Lecteur d'appel : play contour, onde ~40 barres (progression + seek), durée, micro assistant */
const secs = (d?: string) => { const [m, x] = (d || "2:14").split(":").map(Number); return (m || 0) * 60 + (x || 0) || 1 }
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`
function usePlayer(total: number) {
  const [play, setPlay] = useState(false), [pos, setPos] = useState(0)
  useEffect(() => { setListen(play); return () => setListen(false) }, [play])
  useEffect(() => { if (!play) return; const t = setInterval(() => setPos(p => { const n = p + .1; if (n >= total) { setPlay(false); return total } return n }), 100); return () => clearInterval(t) }, [play, total])
  const toggle = () => { if (!play && pos >= total) setPos(0); setPlay(!play) }
  return { play, pos, setPos, toggle, total }
}
const WAVE = Array.from({ length: 32 }, (_, i) => .25 + Math.abs(Math.sin(i * 1.9) * .5 + Math.sin(i * .55) * .3) * .85)
function Player({ p, c, onMic, compact }: { p: ReturnType<typeof usePlayer>; c: string; onMic?: () => void; compact?: boolean }) {
  const f = p.pos / p.total, played = Math.round(f * WAVE.length)
  const seek = (e: any) => { const r = e.currentTarget.getBoundingClientRect(); p.setPos(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * p.total) }
  return <div className={`flex items-center ${compact && !onMic ? "h-9 gap-2.5" : "h-11 gap-3"}`}>
    <button data-hit aria-label={p.play ? "Pause" : "Écouter l'appel"} onClick={e => { e.stopPropagation(); p.toggle() }} className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[.12] transition-colors hover:border-white/25">{p.play ? <Pause size={14} fill="white" strokeWidth={0} /> : <Play size={14} fill="white" strokeWidth={0} className="ml-[1px]" />}</button>
    <div role="slider" tabIndex={0} aria-label="Position de lecture" aria-valuemin={0} aria-valuemax={Math.round(p.total)} aria-valuenow={Math.round(p.pos)} aria-valuetext={mmss(p.pos)} onClick={e => { e.stopPropagation(); seek(e) }} onKeyDown={e => { if (e.key === "ArrowRight") p.setPos(Math.min(p.total, p.pos + 5)); if (e.key === "ArrowLeft") p.setPos(Math.max(0, p.pos - 5)) }} className="flex h-[22px] min-w-0 flex-1 cursor-pointer items-center justify-between">
      {WAVE.map((h, i) => <span key={i} className="w-[2px] shrink-0 rounded-full transition-colors duration-150" style={{ height: `${Math.round(h * 100)}%`, background: i < played ? c : "rgba(255,255,255,.18)" }} />)}</div>
    <span className="w-9 shrink-0 text-right text-[13px] tabular-nums text-white/50">{p.play || p.pos > 0 ? mmss(p.pos) : mmss(p.total)}</span>
    {onMic && <button data-hit aria-label="Parler à l'assistant" onClick={e => { e.stopPropagation(); onMic() }} className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition active:scale-[.94]" style={{ background: c, boxShadow: `0 4px 12px -6px ${c}80` }}><Mic size={16} strokeWidth={SW} /></button>}
  </div>
}

/* ---------------- Réception ---------------- */
const callSt = (x: Call): [string, string] => x.callback ? (x.urgent ? ["Urgent", RED] : ["À rappeler", AMBER]) : ["Traité", GREEN]

/* Contacts : fiches clients + noms vus dans appels, devis et RDV, depuis le début */
type Ct = { key: string; name: string; phone: string; calls: number; last: string; since?: string }
const sortN = (n: string) => n.replace(/^(M\.|Mme|Chantier)\s*/, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
function contacts(s: St): Ct[] {
  const m = new Map<string, Ct>(), y = addDays(TODAY, -1)
  const up = (n: string, d?: string, call = false) => { const k = ckey(n); let c = m.get(k); if (!c) { const f = (s.clients || []).find(x => x.key === k); c = { key: k, name: f?.name || n, phone: f?.phone || tel(n).replace(/(\d{2})(?=\d)/g, "$1 "), calls: 0, last: "" }; m.set(k, c) } if (call) c.calls++; if (d && d > c.last) c.last = d }
  ;(s.clients || []).forEach(x => { up(x.name, x.hist?.last); const c = m.get(x.key)!; c.calls += x.hist?.calls || 0; c.since = x.hist?.since })
  s.calls.forEach(x => up(x.name, x.day ? y : TODAY, true))
  s.events.forEach(x => !/^Chantier/.test(x.name) || findC(x.name) ? up(x.name, x.date <= TODAY ? x.date : undefined) : null)
  s.devis.forEach(x => up(x.client))
  return [...m.values()]
}
const lastL = (d: string) => !d ? "—" : d === TODAY ? "aujourd'hui" : d === addDays(TODAY, -1) ? "hier" : dd(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", ...(d.slice(0, 4) !== TODAY.slice(0, 4) ? { year: "numeric" } : {}) })
const CtRow = ({ x, first, onOpen }: { x: Ct; first?: boolean; onOpen: () => void }) => <Row first={first} label={`Fiche ${x.name}`} onClick={onOpen} lead={<Av n={x.name} />} t={x.name} s={<>{x.phone}<br />{x.calls} appel{x.calls > 1 ? "s" : ""} · dernier contact {lastL(x.last)}</>} r={<TBtn I={Phone} label={`Appeler ${x.name}`} href={`tel:${x.phone.replace(/ /g, "")}`} />} />
function ContactsSheet({ close }: { close: () => void }) {
  const { s, modal } = useC(), [q2, setQ2] = useState(""), all = contacts(s).filter(x => match(q2, x.name, x.phone, x.phone.replace(/ /g, ""))).sort((a, b) => sortN(a.name).localeCompare(sortN(b.name)))
  const groups: [string, Ct[]][] = []; all.forEach(x => { const L = sortN(x.name)[0]?.toUpperCase() || "#"; const g = groups.find(g => g[0] === L); g ? g[1].push(x) : groups.push([L, [x]]) })
  return <Sheet title="Contacts" sub={`${contacts(s).length} contacts depuis le début`} c={A.rec.c} onClose={close}>
    <div className="relative mb-5"><Search size={16} strokeWidth={1.6} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40" /><input autoFocus value={q2} onChange={e => setQ2(e.target.value)} placeholder="Rechercher un nom ou un numéro" className={`${inp} pl-11`} aria-label="Rechercher un contact" /></div>
    {groups.length ? <div className="space-y-5">{groups.map(([L, xs]) => <div key={L}><div className={`mb-2 px-1 text-[13px] font-semibold text-white/45`}>{L}</div><List>{xs.map((x, i) => <CtRow key={x.key} x={x} first={i === 0} onOpen={() => modal({ kind: "client", data: { name: x.name } })} />)}</List></div>)}</div>
      : <List empty="Aucun contact ne correspond">{[]}</List>}
  </Sheet>
}
function Rec() {
  const { s, set, modal, q, setChat, toast } = useC(), c = A.rec.c
  const [voiceOn, setVoiceOn] = useState(false)
  const today = s.calls.filter(x => !x.day && match(q, x.name, x.topic, x.note)), hier = s.calls.filter(x => x.day && match(q, x.name, x.topic, x.note))
  const [sel] = useState(s.calls[0]?.id), [all, setAll] = useState(false)
  const cur = s.calls.find(x => x.id === sel) || s.calls[0]
  const pl = usePlayer(secs(cur?.dur)), play = pl.play
  const todo = s.calls.filter(x => x.callback), urg = todo.filter(x => x.urgent).length
  const open = (x: Call) => modal({ kind: "client", data: { name: x.name, call: x.id } }), cts = contacts(s)
  const todoS = todo.filter(x => match(q, x.name, x.topic, x.note)).sort((a, b) => Number(b.urgent) - Number(a.urgent))
  const done = (x: Call) => { const snap = s; set(y => ({ ...y, calls: y.calls.map(z => z.id === x.id ? { ...z, callback: false } : z) })); toast(`${x.name} · marqué rappelé`, () => set(() => snap)) }
  const TRow = (x: Call, i: number) => <Row key={x.id} first={i === 0} label={x.name} onClick={() => open(x)} lead={<Av n={x.name} />} t={<span className="flex items-center gap-2"><span className="truncate">{x.name}</span>{x.urgent && <Chip c={RED}>Urgent</Chip>}</span>} s={`${x.tag || x.topic} · ${x.day ? "hier " : ""}${x.time}`} r={<div className="flex items-center gap-2"><TBtn I={MessageSquareText} label={`SMS à ${x.name}`} href={`sms:${tel(x.name)}`} /><TBtn I={Phone} label={`Appeler ${x.name}`} href={`tel:${tel(x.name)}`} c={c} onClick={() => done(x)} /></div>} />
  const CRow = (x: Call, i: number) => <Row key={x.id} first={i === 0} label={x.name} onClick={() => open(x)} lead={<Av n={x.name} />} t={x.name} s={x.tag || x.topic} r={<span className={tx.cap}>{x.time}</span>} rs={<Chip c={callSt(x)[1]}>{callSt(x)[0]}</Chip>} />
  return <><Shell k="rec" fig={<Num n={todo.length} />} sub={`appels à rappeler · ${urg} urgent${urg > 1 ? "s" : ""}`} actions={[
    { I: Plus, l: "Note", on: () => modal({ kind: "call" }) }, { I: Users, l: "Contacts", on: () => { if (play) pl.toggle(); modal({ kind: "contacts" }) } },
    { I: PhoneCall, l: "Appels", on: () => { if (play) pl.toggle(); modal({ kind: "calls" }) } }, { I: Sparkles, l: "Assistant", on: () => setChat(true) }]}>
    <div className="col-span-2">
      <button type="button" onClick={() => setVoiceOn(true)} aria-label="Appeler ma réceptionniste" className="flex h-14 w-full items-center justify-center gap-2.5 rounded-full text-[15px] font-medium text-white transition active:scale-[.98]" style={{ background: c, boxShadow: `0 12px 32px -12px ${c}99` }}>
        <Phone size={18} strokeWidth={1.75} />
        Appeler ma réceptionniste
      </button>
    </div>
    <Col><Section t="À rappeler" aside={todoS.length ? `${todoS.length} client${todoS.length > 1 ? "s" : ""}` : undefined}><List I={Check} empty="Personne à rappeler. Tout est à jour.">{todoS.map(TRow)}</List></Section>
      {cur && <Section t="Dernier débrief" more={() => open(cur)}><Card className="overflow-hidden"><Row first label={cur.topic} onClick={() => open(cur)} lead={<Av n={cur.name} />} t={cur.topic} s={cur.short || cur.name} r={<span className={tx.cap}>{cur.at || cur.time}</span>} />
      <div className="px-4 pb-4 pt-1"><Player p={pl} c={c} onMic={() => setChat(true)} /></div></Card></Section>}</Col>
    <Col><Section t="Appels du jour" more={today.length > 4 ? () => setAll(!all) : undefined} aside={`${today.length} appels`}><List empty="Aucun appel aujourd'hui">{(all ? today : today.slice(0, 4)).map(CRow)}</List></Section>
</Col>
  </Shell>
  {voiceOn && <VoiceCall fallback={{ prenom: s.settings.name, company: s.settings.company, email: s.settings.email }} onDone={msg => { setVoiceOn(false); if (msg) toast(msg) }} />}
  </>
}

/* ---------------- Agenda ---------------- */
const fmtD = (iso: string) => { const d = dd(iso); return `${DAYS[(d.getDay() + 6) % 7]} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}` }
type CV = "j" | "s" | "m" | "a"
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const monOf = (x: string) => addDays(x, -((dd(x).getDay() + 6) % 7))
const addM = (x: string, n: number) => { const d = dd(x); return iso(new Date(d.getFullYear(), d.getMonth() + n, 1, 12)) }
const monthGrid = (x: string) => { const d = dd(x), first = iso(new Date(d.getFullYear(), d.getMonth(), 1, 12)), st = monOf(first); return Array.from({ length: 42 }, (_, i) => addDays(st, i)) }
const cap = (w: string) => w[0].toUpperCase() + w.slice(1)
const LONG = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
const H0 = 7, H1 = 21
function TimeGrid({ days, evs, onEv, onSlot }: { days: string[]; evs: Ev[]; onEv: (e: Ev) => void; onSlot: (d: string, h: number) => void }) {
  const { desk } = useC(), c = A.ag.c, HH = desk ? 56 : 52, one = days.length === 1
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.scrollTo({ top: Math.max(0, (Math.min(8, NOW - 1) - H0) * HH) }) }, [])
  const hours = Array.from({ length: H1 - H0 }, (_, i) => H0 + i)
  const wk = (d: string) => (dd(d).getDay() + 6) % 7 >= 5
  return <div className="overflow-hidden rounded-[16px] border border-white/[.05] bg-black/40">
    <div className={one ? "" : "overflow-x-auto"}><div style={{ minWidth: one ? undefined : desk ? 0 : 580 }}>
      {!one && <div className="flex border-b border-white/[.06]"><div className="w-14 shrink-0" />{days.map(d => { const td = d === TODAY; return <div key={d} className={`flex flex-1 flex-col items-center py-3 ${wk(d) ? "opacity-45" : ""}`}><span className="text-[11px] font-medium uppercase tracking-[.06em] text-white/40">{DAYS[(dd(d).getDay() + 6) % 7].slice(0, 3)}</span><span className={`mt-1 flex h-8 w-8 items-center justify-center rounded-full text-[16px] ${td ? "font-semibold text-white" : "text-white/85"}`} style={td ? { background: c } : {}}>{dd(d).getDate()}</span></div> })}</div>}
      <div ref={ref} className="relative overflow-y-auto" style={{ maxHeight: desk ? "calc(100dvh - 300px)" : 560 }}>
        <div className="relative flex" style={{ height: (H1 - H0) * HH }}>
          <div className="w-14 shrink-0">{hours.map(h => <div key={h} className="relative" style={{ height: HH }}><span className="absolute -top-[7px] right-3 text-[11px] tabular-nums text-white/35">{h > H0 ? `${h}:00` : ""}</span></div>)}</div>
          {days.map(d => { const list = evs.filter(e => e.date === d)
            return <div key={d} className={`relative flex-1 border-l border-white/[.06] ${wk(d) ? "bg-white/[.015]" : ""}`} onClick={e => { const r = e.currentTarget.getBoundingClientRect(); onSlot(d, Math.floor(H0 + (e.clientY - r.top) / HH * 2) / 2) }}>
              {hours.map(h => <div key={h} className="border-t border-white/[.05] first:border-t-0" style={{ height: HH }} />)}
              {list.map(e => { const past = e.date < TODAY || (e.date === TODAY && e.start + e.dur <= NOW); return <button key={e.id} onClick={x => { x.stopPropagation(); onEv(e) }} aria-label={`${e.name} · ${e.topic} · ${hh(e.start)}`} className={`absolute left-1 right-1 overflow-hidden rounded-[10px] px-2 py-1.5 text-left transition hover:brightness-125 ${past ? "opacity-50" : ""} ${wk(d) ? "opacity-60" : ""}`} style={{ top: (e.start - H0) * HH + 1, height: Math.max(22, e.dur * HH - 3), background: `${c}24`, boxShadow: `inset 3px 0 0 ${c}` }}>
                <div className="truncate text-[12.5px] font-semibold leading-tight" style={{ color: "#FFB4B4" }}>{e.name}</div>{e.dur * HH > 34 && <div className="truncate text-[11.5px] leading-tight text-white/55">{e.topic} · {hh(e.start)}</div>}</button> })}
              {d === TODAY && NOW >= H0 && NOW <= H1 && <div className="pointer-events-none absolute -left-px right-0 z-10" style={{ top: (NOW - H0) * HH }}><span className="absolute -left-[5px] -top-[4.5px] h-[9px] w-[9px] rounded-full bg-[#FF453A]" /><div className="h-[1.5px] bg-[#FF453A]" /></div>}
            </div> })}
        </div></div></div></div></div>
}
function MonthGrid({ cur, evs, onDay }: { cur: string; evs: Ev[]; onDay: (d: string) => void }) {
  const { desk } = useC(), c = A.ag.c, m = dd(cur).getMonth(), g = monthGrid(cur)
  return <div className="overflow-hidden rounded-[16px] border border-white/[.05] bg-black/40">
    <div className="grid grid-cols-7 border-b border-white/[.06]">{DAYS.map((x, i) => <div key={x} className={`py-3 text-center text-[11px] font-medium uppercase tracking-[.06em] text-white/40 ${i >= 5 ? "opacity-50" : ""}`}>{x.slice(0, desk ? 3 : 1)}</div>)}</div>
    <div className="grid grid-cols-7">{g.map((d, i) => { const inM = dd(d).getMonth() === m, list = evs.filter(e => e.date === d).sort((a, b) => a.start - b.start), td = d === TODAY, we = i % 7 >= 5
      return <button key={d} onClick={() => onDay(d)} aria-label={`${dd(d).getDate()} ${MONTHS[dd(d).getMonth()]} · ${list.length} RDV`} className={`flex flex-col items-center border-white/[.05] px-1 pt-2 text-left transition-colors hover:bg-white/[.03] ${i % 7 ? "border-l" : ""} ${i >= 7 ? "border-t" : ""} ${desk ? "h-[104px] items-stretch" : "h-[64px]"} ${we ? "bg-white/[.015]" : ""}`}>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center self-center rounded-full text-[14px] ${desk ? "self-start" : ""} ${td ? "font-semibold text-white" : inM ? (we ? "text-white/45" : "text-white/85") : "text-white/20"}`} style={td ? { background: c } : {}}>{dd(d).getDate()}</span>
        {desk ? <div className="mt-1 space-y-[3px]">{list.slice(0, 2).map(e => <div key={e.id} className={`truncate rounded-[6px] px-1.5 py-[2px] text-[11px] ${inM ? "" : "opacity-40"}`} style={{ background: `${c}1F`, color: "#FFB4B4" }}>{hh(e.start)} {e.name}</div>)}{list.length > 2 && <div className="px-1.5 text-[11px] text-white/40">+{list.length - 2}</div>}</div>
          : list.length > 0 && <div className="mt-1.5 flex gap-[3px]">{list.slice(0, 3).map(e => <span key={e.id} className="h-[5px] w-[5px] rounded-full" style={{ background: inM ? c : "rgba(255,255,255,.2)" }} />)}</div>}
      </button> })}</div></div>
}
function YearGrid({ cur, evs, onMonth }: { cur: string; evs: Ev[]; onMonth: (d: string) => void }) {
  const { desk } = useC(), c = A.ag.c, y = dd(cur).getFullYear(), has = new Set(evs.map(e => e.date))
  return <div className={`grid gap-x-6 gap-y-8 ${desk ? "grid-cols-4" : "grid-cols-2"}`}>{Array.from({ length: 12 }, (_, m) => { const f = iso(new Date(y, m, 1, 12)), g = monthGrid(f), now = dd(TODAY).getMonth() === m && dd(TODAY).getFullYear() === y
    return <button key={m} onClick={() => onMonth(f)} className="rounded-[16px] p-2 text-left transition-colors hover:bg-white/[.03]"><div className="mb-2 px-1 text-[15px] font-semibold" style={now ? { color: c } : {}}>{cap(MONTHS[m])}</div>
      <div className="grid grid-cols-7 gap-y-[3px] text-center text-[10.5px] tabular-nums">{g.map(d => { const inM = dd(d).getMonth() === m, td = d === TODAY; return <span key={d} className={`relative mx-auto flex h-[18px] w-[18px] items-center justify-center rounded-full ${inM ? "text-white/75" : "text-transparent"}`} style={td && inM ? { background: c, color: "#fff", fontWeight: 600 } : {}}>{dd(d).getDate()}{inM && has.has(d) && !td && <span className="absolute -bottom-[2px] h-[3px] w-[3px] rounded-full" style={{ background: c }} />}</span> })}</div></button> })}</div>
}
function AgCal() {
  const { s, modal, q, desk } = useC(), c = A.ag.c
  const [v, setV] = useState<CV>(desk ? "s" : "j"), [cur, setCur] = useState(TODAY)
  const evs = s.events.filter(e => match(q, e.name, e.topic))
  const move = (n: number) => setCur(x => v === "j" ? addDays(x, n) : v === "s" ? addDays(x, 7 * n) : v === "m" ? addM(x, n) : iso(new Date(dd(x).getFullYear() + n, 0, 1, 12)))
  const d = dd(cur), wkD = Array.from({ length: 7 }, (_, i) => addDays(monOf(cur), i))
  const title = v === "a" ? String(d.getFullYear()) : `${cap(MONTHS[d.getMonth()])} ${d.getFullYear()}`
  const subT = v === "j" ? `${LONG[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTHS[d.getMonth()]}${cur === TODAY ? " · aujourd'hui" : ""}` : v === "s" ? (() => { const a = dd(wkD[0]), b = dd(wkD[6]); return `Semaine du ${a.getDate()}${a.getMonth() !== b.getMonth() ? " " + MONTHS[a.getMonth()] : ""} au ${b.getDate()} ${MONTHS[b.getMonth()]}` })() : v === "m" ? `${evs.filter(e => dd(e.date).getMonth() === d.getMonth() && dd(e.date).getFullYear() === d.getFullYear()).length} rendez-vous ce mois` : `${evs.filter(e => dd(e.date).getFullYear() === d.getFullYear()).length} rendez-vous cette année`
  const isNow = v === "j" ? cur === TODAY : v === "s" ? wkD.includes(TODAY) : v === "m" ? cur.slice(0, 7) === TODAY.slice(0, 7) : cur.slice(0, 4) === TODAY.slice(0, 4)
  const onEv = (e: Ev) => modal({ kind: "ev", data: e }), onSlot = (dt: string, h: number) => modal({ kind: "rdv", data: { date: dt, start: h } })
  const dayList = evs.filter(e => e.date === cur).sort((a, b) => a.start - b.start)
  const hot = (e: Ev) => e.date === TODAY && e.start <= NOW && NOW < e.start + e.dur
  const ERow = (e: Ev, i: number) => <Row key={e.id} first={i === 0} label={e.name} onClick={() => modal({ kind: "client", data: { name: e.name } })} lead={<span className="flex h-10 w-12 shrink-0 flex-col items-center justify-center rounded-[12px]" style={hot(e) ? { background: c + "29", color: c } : { background: "rgba(255,255,255,.07)" }}><span className="text-[13px] font-semibold leading-none">{hh(e.start)}</span><span className="mt-1 text-[10px] leading-none opacity-60">{durF(e.dur)}</span></span>} t={<span className="flex items-center gap-2"><span className="truncate">{e.name}</span>{hot(e) && <Chip c={c}>En cours</Chip>}</span>} s={e.topic} r={<TBtn I={Phone} label={`Appeler ${e.name}`} href={`tel:${tel(e.name)}`} />} />
  const seg = <div role="tablist" aria-label="Vue du calendrier" className="flex h-9 rounded-full bg-white/[.07] p-[3px]">{([["j", "Jour"], ["s", "Semaine"], ["m", "Mois"], ["a", "Année"]] as [CV, string][]).map(([k, l]) => <button key={k} role="tab" aria-selected={v === k} onClick={() => setV(k)} className={`relative flex-1 rounded-full px-3 text-[13px] font-medium transition-colors ${v === k ? "text-black" : "text-white/60 hover:text-white"}`}>{v === k && <motion.span layoutId="cal-seg" transition={spring} className="absolute inset-0 rounded-full bg-white" />}<span className="relative">{l}</span></button>)}</div>
  const nav = <div className="flex items-center gap-1.5"><button onClick={() => setCur(TODAY)} disabled={isNow} className="h-9 rounded-full bg-white/[.07] px-3.5 text-[13px] font-medium text-white transition hover:bg-white/[.12] disabled:opacity-40">Aujourd'hui</button><button aria-label="Précédent" onClick={() => move(-1)} className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:bg-white/[.07] hover:text-white"><ChevronLeft size={20} strokeWidth={SW} /></button><button aria-label="Suivant" onClick={() => move(1)} className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:bg-white/[.07] hover:text-white"><ChevronRight size={20} strokeWidth={SW} /></button></div>
  const view = v === "a" ? <YearGrid cur={cur} evs={evs} onMonth={f => { setCur(f); setV("m") }} />
    : v === "m" ? <MonthGrid cur={cur} evs={evs} onDay={x => { setCur(x); setV("j") }} />
    : v === "s" ? <TimeGrid days={wkD} evs={evs} onEv={onEv} onSlot={onSlot} />
    : <TimeGrid days={[cur]} evs={evs} onEv={onEv} onSlot={onSlot} />
  const strip = v === "j" && <div className="mb-4 grid grid-cols-7 gap-1">{wkD.map(x => { const on = x === cur, td = x === TODAY, n = evs.filter(e => e.date === x).length, we = (dd(x).getDay() + 6) % 7 >= 5
    return <button key={x} onClick={() => setCur(x)} className={`flex flex-col items-center gap-1 rounded-[14px] py-2 transition-colors ${on ? "bg-white/[.08]" : "hover:bg-white/[.04]"} ${we && !on ? "opacity-50" : ""}`}><span className="text-[11px] font-medium uppercase text-white/40">{DAYS[(dd(x).getDay() + 6) % 7].slice(0, 1)}</span><span className={`flex h-8 w-8 items-center justify-center rounded-full text-[15px] ${on || td ? "font-semibold" : "text-white/80"}`} style={on ? { background: td ? c : "#fff", color: td ? "#fff" : "#000" } : td ? { color: c } : {}}>{dd(x).getDate()}</span><span className="h-[4px] w-[4px] rounded-full" style={{ background: n ? c : "transparent" }} /></button> })}</div>
  const todayB = <button onClick={() => setCur(TODAY)} disabled={isNow} className="h-9 shrink-0 rounded-full bg-white/[.07] px-3.5 text-[13px] font-medium text-white transition hover:bg-white/[.12] disabled:opacity-40">Aujourd'hui</button>
  const arrows = <div className="flex shrink-0 items-center"><button aria-label="Précédent" onClick={() => move(-1)} className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:bg-white/[.07] hover:text-white"><ChevronLeft size={20} strokeWidth={SW} /></button><button aria-label="Suivant" onClick={() => move(1)} className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:bg-white/[.07] hover:text-white"><ChevronRight size={20} strokeWidth={SW} /></button></div>
  const head = <div className="mb-4 flex flex-col gap-3"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="truncate text-[17px] font-semibold tracking-[-0.01em]">{title}</div><div className={`truncate ${tx.cap}`}>{subT}</div></div>{desk ? <div className="flex items-center gap-3"><div className="w-[300px]">{seg}</div>{nav}</div> : todayB}</div>{!desk && <div className="flex items-center gap-1"><div className="min-w-0 flex-1">{seg}</div>{arrows}</div>}</div>
  return <Section t="Calendrier"><div className="rounded-[24px] bg-[#141416] p-4">{head}{strip}{view}</div></Section>
}
function Ag() {
  const { s, modal, q, desk } = useC(), c = A.ag.c
  const [wk, setWk] = useState(0), [day, setDay] = useState(TODAY)
  const mon = addDays(BASE, wk * 7), days = Array.from({ length: 5 }, (_, i) => addDays(mon, i))
  const goWk = (n: number) => { setWk(n); setDay(n === 0 ? TODAY : addDays(BASE, n * 7)) }
  const evs = s.events.filter(e => match(q, e.name, e.topic))
  const wkE = s.events.filter(e => days.includes(e.date)), per = days.map(d => wkE.filter(e => e.date === d).length)
  const list = evs.filter(e => e.date === day).sort((a, b) => a.start - b.start)
  const last = [...s.events].sort((a, b) => b.created - a.created)[0]
  const next = [...s.events].filter(e => e.date > TODAY || (e.date === TODAY && e.start + e.dur > NOW)).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)[0]
  const hot = (e: Ev) => e.date === TODAY && e.start <= NOW && NOW < e.start + e.dur
  const d0 = dd(days[0]), d4 = dd(days[4])
  const range = `${d0.getDate()}${d0.getMonth() !== d4.getMonth() ? " " + MONTHS[d0.getMonth()] : ""} – ${d4.getDate()} ${MONTHS[d4.getMonth()]}`
  const addrOf = (e: Ev) => e.addr || s.calls.find(x => x.name.split(" ").slice(-1)[0] === e.name.split(" ").slice(-1)[0])?.addr
  const ERow = (e: Ev, i: number) => { const ad = addrOf(e); return <Row key={e.id} first={i === 0} label={e.name} onClick={() => modal({ kind: "client", data: { name: e.name } })} lead={<span className={`flex h-10 w-12 shrink-0 flex-col items-center justify-center rounded-[12px] ${hot(e) ? "" : "bg-white/[.07]"}`} style={hot(e) ? { background: c + "29", color: c } : {}}><span className="text-[13px] font-semibold leading-none">{hh(e.start)}</span><span className="mt-1 text-[10px] leading-none opacity-60">{durF(e.dur)}</span></span>} t={<span className="flex items-center gap-2"><span className="truncate">{e.name}</span>{hot(e) && <Chip c={c}>En cours</Chip>}</span>} s={`${e.topic}${ad ? " · " + ad : ""}`} r={<div className="flex items-center gap-2">{ad && <TBtn I={MapPin} label={`Itinéraire vers ${e.name}`} href={`https://maps.google.com/?q=${encodeURIComponent(ad)}`} />}<TBtn I={Phone} label={`Appeler ${e.name}`} href={`tel:${tel(e.name)}`} /></div>} /> }
  return <Shell k="ag" fig={<Num n={wkE.length} />} sub={`rendez-vous · semaine du ${range}`} actions={[
    { I: Plus, l: "Nouveau", on: () => modal({ kind: "rdv", data: { date: day } }) }, { I: ChevronLeft, l: "Précédente", on: () => goWk(wk - 1) },
    { I: ChevronRight, l: "Suivante", on: () => goWk(wk + 1) }, { I: RotateCcw, l: "Aujourd'hui", on: () => goWk(0), dis: wk === 0 && day === TODAY }]}>
    <Col><Section t={day === TODAY ? "Aujourd'hui" : dlabel(day)} aside={`${list.length} RDV`}>{list.length ? <List>{list.map(ERow)}</List> : <List><Row first label="Ajouter un rendez-vous" onClick={() => modal({ kind: "rdv", data: { date: day } })} lead={<Ic I={Plus} />} t="Journée libre" s="Touchez pour ajouter un rendez-vous" r={<Chev />} /></List>}</Section>
      {!desk && <AgCal />}<Section t="À retenir"><List>{next && <Row first label="Prochain rendez-vous" onClick={() => modal({ kind: "ev", data: next })} lead={<Ic I={Clock} />} t="Prochain" s={`${next.name} · ${next.topic}`} r={hh(next.start)} rs={fmtD(next.date)} />}{last && <Row label="Dernier RDV pris" onClick={() => modal({ kind: "ev", data: last })} lead={<Ic I={Sparkles} />} t="Dernier pris" s={`${last.name} · ${last.topic}`} r={hh(last.start)} rs={<Chip c={s.settings.sms ? GREEN : GREY}>{s.settings.sms ? "SMS envoyé" : "Confirmé"}</Chip>} />}</List></Section></Col>
    <Col><Section t="Semaine" aside={range}><Chart c={c} label="Rendez-vous par jour" value={`${wkE.length} RDV`} v={per} l={days.map(d => DAYS[(dd(d).getDay() + 6) % 7].slice(0, 3))} sel={days.indexOf(day)} onPick={(i: number) => setDay(days[i])} /></Section></Col>
    {desk && <div className="col-span-2"><AgCal /></div>}
  </Shell>
}

/* ---------------- Relance ---------------- */
const wkAgo = (iso?: string) => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 6048e5) : 99
const perf = (rels: Rel[]) => { const v = Array.from({ length: 7 }, (_, i) => { const w = rels.filter(r => wkAgo(r.at) === 6 - i && (r.status === "env" || r.status === "rep")); return w.length ? Math.round(w.filter(r => r.status === "rep").length / w.length * 100) : 0 }); const all = rels.filter(r => r.status === "env" || r.status === "rep"); return { v, rate: all.length ? `${Math.round(all.filter(r => r.status === "rep").length / all.length * 100)} %` : "—" } }
const canalI: Record<string, any> = { SMS: MessageSquareText, Appel: Phone, "E-mail": Send }
function RelP() {
  const { s, set, modal, q, toast } = useC(), c = A.rel.c, on = s.settings.agents.rel
  const rels = s.rels.filter(r => match(q, r.client, r.type))
  const prog = s.rels.filter(r => r.status === "prog"), nx = prog[0]
  const sendR = (r: Rel) => { const snap = s; set(x => ({ ...x, rels: x.rels.map(y => y.id === r.id ? { ...y, status: "env", date: "À l'instant" } : y), lastRel: { client: r.client, type: r.type, time: "À l'instant", canal: r.canal } })); toast(`Relance envoyée à ${r.client}`, () => set(() => snap)) }
  const QRow = (r: Rel, i: number) => <Row key={r.id} first={i === 0} label={r.client} onClick={() => modal({ kind: "client", data: { name: r.client } })} lead={<Av n={r.client} />} t={r.client} s={`${r.type} · ${r.canal} · ${r.date}`} r={<div className="flex items-center gap-3">{r.status === "pause" && <Chip c={GREY}>En pause</Chip>}<TBtn I={Send} label={`Envoyer maintenant à ${r.client}`} c={c} onClick={() => sendR(r)} /></div>} />
  const RRow = (r: Rel, i: number) => <Row key={r.id} first={i === 0} label={r.client} onClick={() => modal({ kind: "client", data: { name: r.client } })} lead={<Ic I={canalI[r.canal] || Send} />} t={r.client} s={`${r.type} · ${r.canal}`} r={<span className={tx.cap}>{r.date}</span>} rs={<Chip c={RS[r.status][1]}>{RS[r.status][0]}</Chip>} />
  const tg = () => { set(x => ({ ...x, settings: { ...x.settings, agents: { ...x.settings.agents, rel: !on } } })); toast(`Relance ${on ? "en pause" : "activé"}`) }
  return <Shell k="rel" fig={<Num n={prog.length} />} sub={nx ? `relances à venir · prochaine ${nx.date.toLowerCase()}` : "relances à venir"} actions={[
    { I: Plus, l: "Nouvelle", on: () => modal({ kind: "rel" }) }, { I: Send, l: "Envoyer", on: () => nx && modal({ kind: "relView", data: nx }), dis: !nx },
    { I: on ? Pause : Play, l: on ? "Pause" : "Activer", on: tg }, { I: Repeat2, l: "Historique", on: () => modal({ kind: "relList" }) }]}>
    <Col><Section t="À envoyer" more={() => modal({ kind: "relList" })}><List I={Check} empty="Aucune relance en attente.">{rels.filter(r => r.status === "prog" || r.status === "pause").map(QRow)}</List></Section>
      <Section t="Performance" aside="7 semaines"><Chart c={c} label="Taux de réponse" value={perf(s.rels).rate} v={perf(s.rels).v} l={["S1", "S2", "S3", "S4", "S5", "S6", "S7"]} sel={6} /></Section></Col>
    <Col><Section t="Récentes"><List empty="Aucune relance envoyée">{rels.filter(r => r.status === "env" || r.status === "rep").map(RRow)}</List></Section></Col>
  </Shell>
}

/* ---------------- Devis ---------------- */
const MO = ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"]
function Dev() {
  const { s, set, modal, q, toast } = useC(), c = A.dev.c
  const ds = [...s.devis].filter(d => match(q, d.client, d.objet, String(d.num))).sort((a, b) => b.num - a.num)
  const val = s.devis.filter(d => d.status === "val"), sent = s.devis.filter(d => d.status !== "brouillon")
  const now = new Date(), mk = (k: number) => { const d = new Date(now.getFullYear(), now.getMonth() - 5 + k, 1); return [d.getFullYear(), d.getMonth()] }
  const inM = (d: Devis, k: number) => { if (!d.at) return k === 5; const a = new Date(d.at), [y, mo] = mk(k); return a.getFullYear() === y && a.getMonth() === mo }
  const m = Array.from({ length: 6 }, (_, k) => val.filter(d => inM(d, k)).reduce((a, d) => a + d.amount, 0)), cur = m[5], tot = m.reduce((a, b) => a + b, 0), mL = Array.from({ length: 6 }, (_, k) => MO[mk(k)[1]])
  const pend = [...s.devis].sort((a, b) => b.num - a.num).find(d => d.status === "brouillon")
  const sendD = (d?: Devis) => { if (!d) return; const snap = s; set(x => ({ ...x, devis: x.devis.map(y => y.id === d.id ? { ...y, status: "env" } : y) })); toast(`Devis ${d.num} envoyé à ${d.client}`, () => set(() => snap)) }
  const send = () => sendD(pend)
  const queued = (d: Devis) => s.rels.some(r => r.status === "prog" && r.type.includes(String(d.num)))
  const relance = (d: Devis) => { const snap = s; set(x => ({ ...x, rels: [{ id: uid(), client: d.client, type: `Relance devis N° ${d.num}`, canal: "SMS", status: "prog", date: "Demain 9:00" }, ...x.rels] })); toast(`Relance prévue demain 9:00 · ${d.client}`, () => set(() => snap)) }
  const FRow = (d: Devis, i: number) => <Row key={d.id} first={i === 0} label={`Devis ${d.num}`} onClick={() => modal({ kind: "client", data: { name: d.client } })} lead={<Av n={d.client} />} t={d.client} s={`N° ${d.num} · ${eur(d.amount)}`} r={<div className="flex items-center gap-3"><Chip c={ST[d.status][1]}>{ST[d.status][0]}</Chip>{d.status === "brouillon" ? <TBtn I={Send} label={`Envoyer le devis ${d.num}`} c={c} onClick={() => sendD(d)} /> : queued(d) ? <TBtn I={Check} label="Relance déjà prévue" dis /> : <TBtn I={Repeat2} label={`Relancer ${d.client}`} c={c} onClick={() => relance(d)} />}</div>} />
  const exp = () => { const csv = ["N°;Client;Objet;Statut;Montant HT", ...s.devis.map(d => [d.num, d.client, d.objet, ST[d.status][0], d.amount].join(";"))].join("\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new window.Blob(["\ufeff" + csv], { type: "text/csv" })); a.download = "devis-akno.csv"; a.click(); toast("Export CSV téléchargé") }
  const DRow = (d: Devis, i: number) => <Row key={d.id} first={i === 0} label={`Devis ${d.num}`} onClick={() => modal({ kind: "client", data: { name: d.client } })} lead={<Av n={d.client} />} t={d.client} s={`N° ${d.num} · ${d.objet}`} r={eur(d.amount)} rs={<Chip c={ST[d.status][1]}>{ST[d.status][0]}</Chip>} />
  const todo = ds.filter(d => d.status === "brouillon" || d.status === "att" || d.status === "env")
  const aval = ds.filter(d => d.status === "aval"), { desk } = useC()
  /* Pop-up « nouveau devis IA » : une fois par visite de la page, tant qu'un devis reste à valider */
  useEffect(() => { const first = [...s.devis].sort((a, b) => b.num - a.num).find(d => d.status === "aval"); if (!first) return; const t = setTimeout(() => modal({ kind: "aiPop", data: first }), 450); return () => clearTimeout(t) }, [])
  const VRow = (d: Devis, i: number) => <Row key={d.id} first={i === 0} label={`Regarder le devis ${d.num}`} onClick={() => modal({ kind: "devisPrev", data: d })} lead={<Circ><Blob c={c} s={20} /></Circ>} t={<span className="flex items-center gap-2"><span className="truncate">{d.client}</span></span>} s={`N° ${d.num} · généré par Akno`} r={eur(ttc(d.amount, s.settings.tva))} rs={<Chip c={c}>À valider</Chip>} />
  const avalS = aval.length > 0 && <Section t={<span className="flex items-center gap-2">À valider<span className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[12px] font-semibold text-white" style={{ background: c }}>{aval.length}</span></span>} aside="Devis générés par l'IA"><List>{aval.map(VRow)}</List></Section>
  return <Shell k="dev" fig={<Num n={cur} u="€" money />} sub={`validés ce mois · ${val.length} devis sur ${sent.length} envoyés`} actions={[
    { I: Plus, l: "Nouveau", on: () => modal({ kind: "devis" }) }, { I: Send, l: "Envoyer", on: send, dis: !pend || pend.status !== "brouillon" },
    { I: Repeat2, l: "Relancer", on: () => modal({ kind: "rel", data: { name: (s.devis.find(d => d.status === "env") || pend)?.client || "" } }) }, { I: ArrowUp, l: "Exporter", on: exp }]}>
    {avalS && (desk ? <div className="col-span-2">{avalS}</div> : avalS)}
    <Col><Section t="À suivre" aside={todo.length ? `${todo.length} devis` : undefined}><List I={Check} empty="Aucun devis en attente.">{todo.map(FRow)}</List></Section>
      <Section t="Montant validé" aside="6 derniers mois"><Chart c={c} label="Total" value={eur(tot)} v={m} l={mL} sel={5} /></Section></Col>
    <Col><Section t="Tous les devis" more={() => modal({ kind: "devisList" })}><List>{ds.map(DRow)}</List></Section></Col>
  </Shell>
}

/* ---------------- Paramètres ---------------- */
function SetP() {
  const { s, set, desk, toast, modal } = useC(), st = s.settings
  const uidL: string = (window as any).__aknoUid || "", lk = hasLock(uidL), [bio, setBio] = useState(() => !!getLock(uidL)?.cred), [canBio, setCanBio] = useState(false)
  useEffect(() => { bioAvailable().then(setCanBio) }, [])
  const bioTg = async () => { if (!lk) { toast("Créez d'abord un code d'accès"); return } if (bio) { disableBio(uidL); setBio(false); toast("Face ID désactivé") } else { try { await enableBio(uidL, (window as any).__aknoEmail || ""); setBio(true); toast("Face ID activé") } catch { toast("Face ID non activé") } } }
  const up = (f: (x: St["settings"]) => St["settings"]) => set(x => ({ ...x, settings: f(x.settings) }))
  const demo = () => toast("Démo : réglage non modifiable")
  const reset = () => { if (confirm("Se déconnecter ?")) supabase.auth.signOut() }
  const TVA = [10, 20, 5.5], DUR = [0.5, 1, 1.5, 2]
  const tva = `${String(st.tva).replace(".", ",")} %`, dur = durF(st.duree)
  const cycT = () => up(x => ({ ...x, tva: TVA[(TVA.indexOf(x.tva) + 1) % TVA.length] })), cycD = () => up(x => ({ ...x, duree: DUR[(DUR.indexOf(x.duree) + 1) % DUR.length] }))
  const tgA = (a: K) => { up(x => ({ ...x, agents: { ...x.agents, [a]: !x.agents[a] } })); toast(`${A[a].n} ${st.agents[a] ? "en pause" : "activé"}`) }
  const V = ({ v }: any) => <span className="flex items-center gap-1 text-[15px] text-white/50">{v}<Chev /></span>
  const S = ({ I, l, v, onClick, first }: any) => <Row first={first} label={l} onClick={onClick || demo} lead={<Ic I={I} />} t={l} r={<V v={v} />} />
  const n = agents.filter(a => st.agents[a]).length
  return <Shell lead={<span className={`flex items-center justify-center rounded-full bg-gradient-to-b from-white/[.16] to-white/[.05] font-light tracking-[-0.03em] shadow-[inset_0_1px_0_rgba(255,255,255,.14)] ${desk ? "h-[72px] w-[72px] text-[24px]" : "h-[88px] w-[88px] text-[28px]"}`}>{meIniS(s)}</span>} label={s.settings.company?.trim() && s.settings.company.trim() !== meName(s) ? `${meName(s)} · ${s.settings.company.trim()}` : meName(s)} fig={<Num n={n} u="/ 4" />} sub="agents actifs · offre Pro" actions={[
    { I: Phone, l: "Numéro", on: demo }, { I: Clock, l: "Horaires", on: demo }, { I: LifeBuoy, l: "Aide", on: demo }, { I: LogOut, l: "Quitter", on: reset }]}>
    <Col><Section t="Mes agents"><List>{agents.map((x, i) => <Row key={x} first={i === 0} label={A[x].n} onClick={() => tgA(x)} lead={<Circ><Blob c={A[x].c} s={20} /></Circ>} t={A[x].n} s={st.agents[x] ? A[x].d : "En pause"} r={<Tg on={st.agents[x]} onClick={() => tgA(x)} label={A[x].n} />} />)}</List></Section>
      <Section t="Notifications"><List><Row first label="SMS" onClick={() => up(x => ({ ...x, sms: !x.sms }))} lead={<Ic I={Smartphone} />} t="SMS" s="Confirmations clients" r={<Tg on={st.sms} onClick={() => up(x => ({ ...x, sms: !x.sms }))} label="SMS" />} /><Row label="Notifications push" onClick={() => up(x => ({ ...x, push: !x.push }))} lead={<Ic I={Bell} />} t="Notifications push" s="Appels et devis" r={<Tg on={st.push} onClick={() => up(x => ({ ...x, push: !x.push }))} label="Notifications push" />} /></List></Section>
      <Section t="Compte"><List><S first I={CreditCard} l="Abonnement" v="Pro" /><S I={LifeBuoy} l="Aide & support" v="" /><S I={FileSignature} l="Changer le mot de passe" v="" onClick={() => modal({ kind: "pw" })} /><S I={Smartphone} l="Code d'accès" v={lk ? "Activé" : "Créer"} onClick={() => dispatchEvent(new Event("akno-lock-setup"))} />{canBio && <Row label="Face ID" onClick={bioTg} lead={<Ic I={ScanFace} />} t="Face ID" r={<Tg on={bio} onClick={bioTg} label="Face ID" />} />}<Row label="Se déconnecter" onClick={reset} lead={<Circ c={RED}><LogOut size={IS} strokeWidth={SW} /></Circ>} t={<span className="text-[#FF6B6B]">Se déconnecter</span>} /></List></Section></Col>
    <Col><Section t="Réceptionniste"><List><S first I={Phone} l="Numéro Akno" v="Non configuré" /><S I={Clock} l="Horaires" v="Non configuré" /><S I={AudioLines} l="Voix" v="Par défaut" /><S I={MessageSquareText} l="Message d'accueil" v="Modifier" /></List></Section>
      <Section t="Devis"><List><S first I={Percent} l="TVA par défaut" v={tva} onClick={cycT} /><S I={FileSignature} l="Mentions légales" v="" /><S I={ImageIcon} l="Logo" v="À ajouter" /></List></Section>
      <Section t="Agenda"><List><S first I={Timer} l="Durée par défaut" v={dur} onClick={cycD} /><S I={MapPin} l="Zone d'intervention" v="Non configuré" /></List></Section></Col>
  </Shell>
}

/* ---------------- Feuilles / formulaires (même système visuel) ---------------- */
const inp = "h-12 w-full rounded-[14px] border border-transparent bg-white/[.07] px-4 text-[15px] text-white outline-none [color-scheme:dark] placeholder:text-white/35 focus:border-white/25"
const F = ({ l, children }: any) => <label className="block"><span className="mb-2 block px-1 text-[13px] text-white/50">{l}</span>{children}</label>
function PwSheet({ close }: { close: () => void }) {
  const { toast } = useC(), [a, setA] = useState(""), [b, setB] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState("")
  const ok = a.length >= 8 && a === b
  const save = async (e: React.FormEvent) => { e.preventDefault(); if (!ok) return; setBusy(true); const { error } = await supabase.auth.updateUser({ password: a }); setBusy(false); if (error) setErr(error.message.includes("different") ? "Choisissez un mot de passe différent de l'actuel." : "Impossible de changer le mot de passe."); else { toast("Mot de passe modifié"); close() } }
  return <Sheet title="Changer le mot de passe" c="#FFFFFF" onClose={close}><form onSubmit={save} className="space-y-3">
    <input type="email" name="username" autoComplete="username" value={(window as any).__aknoEmail || ""} readOnly hidden />
    <F l="Nouveau mot de passe"><input id="new-password" name="new-password" type="password" autoComplete="new-password" autoFocus className={inp} value={a} onChange={e => { setA(e.target.value); setErr("") }} placeholder="8 caractères minimum" /></F>
    <F l="Confirmer"><input id="confirm-password" name="confirm-password" type="password" autoComplete="new-password" className={inp} value={b} onChange={e => { setB(e.target.value); setErr("") }} /></F>
    {(err || (b && a !== b)) && <p className="px-1 text-[13px] text-[#FF453A]">{err || "Les mots de passe ne correspondent pas."}</p>}
    <button disabled={!ok || busy} className="mt-2 h-12 w-full rounded-full bg-white text-[15px] font-semibold text-black disabled:opacity-40">{busy ? "Enregistrement…" : "Enregistrer"}</button>
  </form></Sheet>
}
function Sheet({ title, sub, onClose, children, c, footer }: any) {
  const { desk } = useC()
  useEffect(() => { const f = (e: KeyboardEvent) => e.key === "Escape" && onClose(); addEventListener("keydown", f); return () => removeEventListener("keydown", f) }, [onClose])
  return <motion.div className={`fixed inset-0 z-50 flex bg-black/60 backdrop-blur-[2px] ${desk ? "items-center justify-center" : "items-end"}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
    <motion.div role="dialog" aria-label={title} onClick={e => e.stopPropagation()} initial={desk ? { scale: .97, opacity: 0 } : { y: 40, opacity: 0 }} animate={desk ? { scale: 1, opacity: 1 } : { y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 340, damping: 32, mass: .9 }} className={`w-full border-white/[.08] bg-[#121214] shadow-[0_-30px_60px_-20px_rgba(0,0,0,.9)] ${desk ? "max-h-[86dvh] max-w-[480px] rounded-[24px] border" : "max-h-[90dvh] rounded-t-[24px] border-t"} ${footer ? "relative flex flex-col overflow-hidden" : desk ? "overflow-y-auto p-6" : "overflow-y-auto px-5 pt-3"}`} style={desk || footer ? {} : { paddingBottom: "max(28px, env(safe-area-inset-bottom))" }}>
      <div className={footer ? `min-h-0 flex-1 overflow-y-auto ${desk ? "px-6 pt-6" : "px-5 pt-3"}` : "contents"} style={footer ? { paddingBottom: desk ? 104 : "calc(112px + env(safe-area-inset-bottom))" } : {}}>
      {!desk && <div className="mx-auto mb-4 h-[5px] w-9 rounded-full bg-white/20" />}
      <div className="mb-6 flex items-center gap-3">{c && <Circ><Blob c={c} s={20} /></Circ>}<div className="min-w-0"><div className={`truncate ${tx.title}`}>{title}</div>{sub && <div className={`truncate ${tx.cap}`}>{sub}</div>}</div><button aria-label="Fermer" onClick={onClose} className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[.07] text-white/70 hover:text-white"><X size={IS} strokeWidth={SW} /></button></div>
      {children}</div>
      {footer && <div className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 ${desk ? "px-6 pb-6" : "px-5"}`} style={{ paddingBottom: desk ? undefined : "max(20px, env(safe-area-inset-bottom))", paddingTop: 28, background: "linear-gradient(to bottom, rgba(18,18,20,0) 0, rgba(18,18,20,.82) 26px, #121214 52px)" }}><div className="pointer-events-auto">{footer}</div></div>}</motion.div></motion.div>
}
const Sub = ({ children, dot }: any) => dot ? <Chip c={dot}>{children}</Chip> : <div className={tx.cap}>{children}</div>
const LRow = ({ children, onClick, first }: any) => <div onClick={onClick} className={`flex min-h-[48px] items-center gap-3 text-[14px] ${onClick ? "cursor-pointer" : ""} ${first ? "" : "border-t border-white/[.05]"}`}>{children}</div>
const CallPlayer = ({ dur, onMic }: { dur?: string; onMic: () => void }) => { const p = usePlayer(secs(dur)); return <Card className="mb-5 p-4"><Player p={p} c={A.rec.c} onMic={onMic} compact /></Card> }
/* Ligne « à écouter » : un seul enregistrement joue à la fois */
function ListenRow({ x, first, cur, setCur, acts }: { x: Call; first?: boolean; cur: string | null; setCur: (id: string | null) => void; acts?: boolean }) {
  const p = usePlayer(secs(x.dur)), { modal, set, toast } = useC()
  useEffect(() => { if (cur !== x.id && p.play) p.toggle() }, [cur])
  const pp = { ...p, toggle: () => { if (!p.play) setCur(x.id); p.toggle() } }
  return <div className={`px-5 py-3.5 ${first ? "" : "border-t border-white/[.05]"}`}>
    <div role="button" tabIndex={0} aria-label={`Fiche ${x.name}`} onClick={() => modal({ kind: "client", data: { name: x.name, call: x.id } })} onKeyDown={e => { if (e.key === "Enter") modal({ kind: "client", data: { name: x.name, call: x.id } }) }} className="-mx-2 flex cursor-pointer items-center gap-3 rounded-[14px] px-2 py-1 transition-colors hover:bg-white/[.03]"><Av n={x.name} /><div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-[15px] font-medium"><span className="truncate">{x.name}</span>{x.urgent && <Chip c={RED}>Urgent</Chip>}</div><div className={`truncate ${tx.cap}`}>{x.tag || x.topic}</div></div>{acts ? <div className="flex shrink-0 items-center gap-2" onClick={e => e.stopPropagation()}><TBtn I={MessageSquareText} label={`SMS à ${x.name}`} href={`sms:${tel(x.name)}`} /><TBtn I={Phone} label={`Appeler ${x.name}`} href={`tel:${tel(x.name)}`} c={A.rec.c} onClick={() => { if (x.callback) { set(y => ({ ...y, calls: y.calls.map(z => z.id === x.id ? { ...z, callback: false } : z) })); toast(`${x.name} · marqué rappelé`) } }} /></div> : <span className={`shrink-0 ${tx.cap}`}>{x.day ? "hier " : ""}{x.time}</span>}</div>
    {acts && <div className={`mt-1 pl-[52px] ${tx.cap}`}>{x.day ? "Hier " : ""}{x.time}</div>}{x.dur && x.dur !== "0:00" ? <div className="mt-2.5 pl-[52px]"><Player p={pp} c={A.rec.c} compact /></div> : null}</div>
}
function CallsList({ todo, rest }: { todo: Call[]; rest: Call[] }) {
  const [cur, setCur] = useState<string | null>(null)
  const G = ({ t, l }: { t: string; l: Call[] }) => l.length ? <><div className="px-0 pb-2 pt-4 text-[12px] font-medium uppercase tracking-[.06em] text-white/40">{t}</div><div className="-mx-5 bg-black/20">{l.map((x, i) => <ListenRow key={x.id} x={x} first={i === 0} cur={cur} setCur={setCur} acts />)}</div></> : null
  return <><G t="À rappeler" l={todo} /><G t="Autres appels" l={rest} /></>
}
function ListenList() {
  const { s } = useC(), [cur, setCur] = useState<string | null>(null)
  const list = s.calls.filter(x => x.dur && x.dur !== "0:00")
  if (!list.length) return <div className={`py-8 text-center ${tx.cap}`}>Aucun enregistrement à écouter.</div>
  return <div className="-mx-5 bg-black/20">{list.map((x, i) => <ListenRow key={x.id} x={x} first={i === 0} cur={cur} setCur={setCur} />)}</div>
}
/* ---------------- Fiche client ---------------- */
const osm = (c: Client) => { const dx = .006, dy = .0035; return `https://www.openstreetmap.org/export/embed.html?bbox=${c.lon - dx}%2C${c.lat - dy}%2C${c.lon + dx}%2C${c.lat + dy}&layer=mapnik&marker=${c.lat}%2C${c.lon}` }
const CQA = ({ I, l, href, c, ext }: any) => <a href={href} {...(ext ? { target: "_blank", rel: "noreferrer" } : {})} className="flex flex-col items-center gap-2 text-[12.5px] text-white/70 hover:text-white"><span className="flex h-12 w-12 items-center justify-center rounded-full transition active:scale-[.94]" style={c ? { background: c, color: "#fff" } : { background: "rgba(255,255,255,.08)" }}><I size={18} strokeWidth={SW} /></span>{l}</a>
const KV = ({ I, l, v, href }: any) => { const inner = <><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[.06] text-white/60"><I size={16} strokeWidth={SW} /></span><div className="min-w-0 flex-1"><div className="text-[12px] text-white/40">{l}</div><div className="truncate text-[15px]">{v}</div></div>{href && <Chev />}</>
  return href ? <a href={href} className="flex min-h-[56px] items-center gap-3 border-t border-white/[.05] px-4 first:border-t-0 hover:bg-white/[.03]">{inner}</a> : <div className="flex min-h-[56px] items-center gap-3 border-t border-white/[.05] px-4 first:border-t-0">{inner}</div> }
function ClientSheet({ name, callId, close }: { name: string; callId?: string; close: () => void }) {
  const { s, modal, setChat } = useC(), k = ckey(name), cl = findC(name)
  const nm = cl?.name || name, same = (n: string) => ckey(n) === k
  const calls = s.calls.filter(x => same(x.name)), call = calls.find(x => x.id === callId) || calls[0]
  const devis = s.devis.filter(x => same(x.client)), evs = s.events.filter(x => same(x.name)).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start), rels = s.rels.filter(x => same(x.client))
  const st: [string, string] = call ? callSt(call) : devis.some(d => d.status === "att") ? ["Devis en attente", AMBER] : ["Client", GREY]
  const ph = cl?.phone || tel(name).replace(/(\d\d)(?=\d)/g, "$1 "), raw = ph.replace(/ /g, ""), addr = cl?.addr || call?.addr
  const hist = [...calls.map(x => ({ t: `Appel · ${x.tag || x.topic}`, w: `${x.day ? "Hier" : "Aujourd'hui"} ${x.time}`, I: Phone, o: 0 + (x.day ? 1 : 0) })),
    ...rels.map(r => ({ t: `${r.type} · ${r.canal}`, w: `${r.date} · ${RS[r.status][0]}`, I: Send, o: 2 })),
    ...devis.map(d => ({ t: `Devis N° ${d.num} · ${eur(d.amount)}`, w: ST[d.status][0], I: Receipt, o: 3 }))].sort((a, b) => a.o - b.o)
  const H = ({ children }: any) => <div className="mb-2 mt-6 px-1 text-[13px] font-medium text-white/45">{children}</div>
  return <Sheet title="Fiche client" c={A.rec.c} onClose={close}>
    <div className="-mt-2 flex items-center gap-4"><span className="scale-[1.35] origin-left"><Av n={nm} /></span><div className="ml-3 min-w-0"><div className="truncate text-[20px] font-medium tracking-[-0.02em]">{nm}</div><div className="mt-1"><Chip c={st[1]}>{st[0]}</Chip></div></div></div>
    <div className="mt-6 grid grid-cols-4 gap-2"><CQA I={Phone} l="Appeler" href={`tel:${raw}`} c={A.rec.c} /><CQA I={MessageSquareText} l="SMS" href={`sms:${raw}`} />{addr ? <CQA I={MapPin} l="Itinéraire" ext href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`} /> : <span />}{cl?.email ? <CQA I={Mail} l="E-mail" href={`mailto:${cl.email}`} /> : <span />}</div>
    <div className="mt-6 overflow-hidden rounded-[20px] bg-white/[.04]"><KV I={Phone} l="Téléphone" v={ph} href={`tel:${raw}`} />{cl?.email && <KV I={Mail} l="E-mail" v={cl.email} href={`mailto:${cl.email}`} />}{addr && <KV I={MapPin} l="Adresse" v={addr} />}</div>
    {cl && <div className="relative mt-3 h-[180px] overflow-hidden rounded-[20px] border border-white/[.06] bg-[#0A0A0B]"><iframe title={`Carte · ${cl.addr}`} src={osm(cl)} loading="lazy" className="h-full w-full border-0 [filter:invert(.92)_hue-rotate(180deg)_saturate(.6)_brightness(.9)]" /><span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/70 px-2.5 py-1 text-[11px] text-white/60 backdrop-blur">Position approximative</span></div>}
    {call && <><H>Motif du dernier appel</H><div className="rounded-[20px] bg-white/[.04] p-4"><div className="flex items-center justify-between gap-2"><div className="truncate text-[15px] font-medium">{call.besoin || call.topic}</div><span className={tx.cap}>{call.day ? "hier " : ""}{call.time}</span></div><p className="mt-1.5 text-[14px] leading-relaxed text-white/60">{call.note}</p>{call.dur && call.dur !== "0:00" && <div className="mt-3"><CallInline dur={call.dur} onMic={() => { close(); setChat(true) }} /></div>}</div></>}
    {(devis.length > 0 || evs.length > 0) && <><H>Devis et rendez-vous</H><div className="overflow-hidden rounded-[20px] bg-white/[.04]">
      {devis.map((d, i) => <Row key={d.id} first={i === 0} label={`Devis ${d.num}`} onClick={() => modal({ kind: "devisEdit", data: d })} lead={<Ic I={Receipt} />} t={`Devis N° ${d.num}`} s={d.objet} r={eur(d.amount)} rs={<Chip c={ST[d.status][1]}>{ST[d.status][0]}</Chip>} />)}
      {evs.map((e, i) => <Row key={e.id} first={!devis.length && i === 0} label={`RDV ${e.topic}`} onClick={() => modal({ kind: "ev", data: e })} lead={<Ic I={CalendarDays} />} t={e.topic} s={`${fmtD(e.date)} · ${hh(e.start)} – ${hh(e.start + e.dur)}`} r={<Chev />} />)}</div></>}
    {hist.length > 0 && <><H>Historique</H><div className="relative pl-2">{hist.map((h, i) => <div key={i} className="relative flex gap-3 pb-4 last:pb-0">{i < hist.length - 1 && <span className="absolute left-[15px] top-8 bottom-0 w-px bg-white/[.08]" />}<span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[.06] text-white/60"><h.I size={14} strokeWidth={SW} /></span><div className="min-w-0 pt-1"><div className="truncate text-[14px]">{h.t}</div><div className={tx.cap}>{h.w}</div></div></div>)}</div></>}
  </Sheet>
}
const CallInline = ({ dur, onMic }: { dur?: string; onMic: () => void }) => { const p = usePlayer(secs(dur)); return <Player p={p} c={A.rec.c} onMic={onMic} /> }
function Forms({ m, close }: { m: NonNullable<Modal>; close: () => void }) {
  const { s, set, toast, go, modal, setChat, desk } = useC(), d = m.data || {}
  const clients = [...new Set([...s.calls.map(x => x.name), ...s.devis.map(x => x.client), ...s.rels.map(x => x.client)])]
  const [f, setF] = useState<any>(() => ({ name: d.name || d.client || "", topic: d.topic || d.objet || "", addr: d.addr || "", date: d.date || TODAY, start: hh(d.start ?? 9).padStart(5, "0"), dur: String(s.settings.duree), amount: d.amount ?? "", note: "", urgent: false, callback: true, type: "Relance devis", canal: "SMS", when: "Demain 9:00" }))
  const v = (k: string) => ({ value: f[k], onChange: (e: any) => setF({ ...f, [k]: e.target.value }) })
  const toH = (t: string) => { const [a, b] = t.split(":").map(Number); return a + (b || 0) / 60 }
  const foot = (label: string, ok: boolean, run: () => void, c?: string, hint = "Indiquez le nom du client pour continuer") => <div className={`sticky bottom-0 z-10 mt-6 bg-[#121214] pt-3 ${desk ? "-mx-6 px-6" : "-mx-5 px-5"}`}><datalist id="akno-clients">{clients.map(x => <option key={x} value={x} />)}</datalist><div className="flex gap-2"><Btn className="flex-1" onClick={close}>Annuler</Btn><Btn primary c={c} className="flex-[1.4]" disabled={!ok} onClick={() => { run(); close() }}>{label}</Btn></div><p aria-live="polite" className={`h-5 pt-2 text-center text-[12px] text-white/50 transition-opacity ${ok ? "opacity-0" : "opacity-100"}`}>{ok ? "" : hint}</p></div>
  const relUpd = (id: string, st: Rel["status"], msg: string, date?: string) => { set(x => { const r = x.rels.find(y => y.id === id)!; return { ...x, rels: x.rels.map(y => y.id === id ? { ...y, status: st, date: date || y.date } : y), lastRel: st === "env" ? { client: r.client, type: r.type, time: "À l'instant", canal: r.canal } : x.lastRel } }); toast(msg) }
  if (m.kind === "call") return <Sheet title="Nouvelle note d'appel" c={A.rec.c} onClose={close}><div className="space-y-3"><F l="Client"><input autoFocus list="akno-clients" autoComplete="off" placeholder="Nom du client" className={inp} {...v("name")} /></F><F l="Objet"><input className={inp} {...v("topic")} placeholder="Fuite, devis, dépannage…" /></F><F l="Note"><textarea className={inp + " h-24 py-2.5"} {...v("note")} /></F>
    <div className="flex items-center gap-3 px-1 text-[15px]"><Tg on={f.urgent} onClick={() => setF({ ...f, urgent: !f.urgent })} label="Urgent" />Urgent</div><div className="flex items-center gap-3 px-1 text-[15px]"><Tg on={f.callback} onClick={() => setF({ ...f, callback: !f.callback })} label="À rappeler" />À rappeler</div></div>
    {foot("Enregistrer", !!f.name.trim(), () => { const now = new Date(); set(x => ({ ...x, calls: [{ id: uid(), name: f.name.trim(), topic: f.topic || "Appel", tag: f.topic || "Appel", note: f.note || "Note ajoutée manuellement.", urgent: f.urgent, callback: f.callback, time: `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`, dur: "0:00" }, ...x.calls] })); toast("Note d'appel ajoutée") })}</Sheet>
  if (m.kind === "contacts") return <ContactsSheet close={close} />
  if (m.kind === "client") return <ClientSheet name={d.name} callId={d.call} close={close} />
  if (m.kind === "callView") { const x = s.calls.find(y => y.id === d.id) || d as Call
    return <Sheet title={x.name} sub={`${x.time} · ${x.topic}`} c={A.rec.c} onClose={close}><CallPlayer dur={x.dur} onMic={() => { close(); setChat(true) }} /><div className="text-[15px] leading-relaxed text-white/70">{x.note}</div>{x.addr && <div className="mt-3"><Sub>{x.addr}</Sub></div>}<div className="mt-3"><Sub dot={x.callback ? (x.urgent ? "#FF5F57" : "#FFB340") : "#30D158"}>{x.callback ? (x.urgent ? "À rappeler · urgent" : "À rappeler") : "Traité"}</Sub></div>
      <div className="mt-6 grid gap-2">{x.callback && <Btn primary onClick={() => { set(y => ({ ...y, calls: y.calls.map(z => z.id === x.id ? { ...z, callback: false } : z) })); toast("Marqué comme rappelé"); close() }}><Check size={15} />Marquer rappelé</Btn>}<div className="grid grid-cols-2 gap-2"><Btn onClick={() => modal({ kind: "devis", data: { client: x.name, objet: x.besoin || x.topic } })}><Receipt size={15} strokeWidth={1.5} />Créer un devis</Btn><Btn onClick={() => modal({ kind: "rdv", data: { name: x.name, topic: x.tag || x.topic, addr: x.addr } })}><CalendarDays size={15} strokeWidth={1.5} />Prendre RDV</Btn></div></div></Sheet> }
  if (m.kind === "rdv") return <Sheet title="Nouveau rendez-vous" c={A.ag.c} onClose={close}><div className="space-y-3"><F l="Client"><input autoFocus list="akno-clients" autoComplete="off" placeholder="Nom du client" className={inp} {...v("name")} /></F><F l="Objet"><input className={inp} {...v("topic")} /></F><div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2"><F l="Date"><input type="date" className={inp} {...v("date")} /></F><F l="Heure"><input type="time" step={900} className={inp} {...v("start")} /></F><F l="Durée (h)"><select className={inp} {...v("dur")}>{["0.5", "1", "1.5", "2", "3", "4"].map(x => <option key={x} value={x}>{x.replace(".", ",")}</option>)}</select></F></div><F l="Adresse"><input className={inp} {...v("addr")} /></F></div>
    {foot("Créer le RDV", !!f.name.trim() && !!f.date, () => { set(x => ({ ...x, events: [...x.events, { id: uid(), date: f.date, start: toH(f.start), dur: Number(f.dur), name: f.name.trim(), topic: f.topic || "Intervention", addr: f.addr, created: Date.now() }] })); const wd = dd(f.date).getDay(); toast(wd === 0 || wd === 6 ? "RDV créé (week-end : visible sur mobile)" : "RDV créé"); go("ag") }, A.ag.c)}</Sheet>
  if (m.kind === "ev") { const e = s.events.find(y => y.id === d.id) || d as Ev; return <Sheet title={e.name} sub={e.topic} c={A.ag.c} onClose={close}><div className="space-y-2"><Sub>{fmtD(e.date)} · {hh(e.start)} – {hh(e.start + e.dur)}</Sub>{e.addr && <Sub>{e.addr}</Sub>}<Sub dot={s.settings.sms ? "#30D158" : "rgba(255,255,255,.3)"}>{s.settings.sms ? "Confirmé par SMS" : "Confirmé"}</Sub></div>
    <div className="mt-6 flex gap-2"><Btn className="flex-1" onClick={() => { set(x => ({ ...x, events: x.events.filter(y => y.id !== e.id) })); toast("RDV supprimé"); close() }}><Trash2 size={15} strokeWidth={1.5} />Supprimer</Btn><Btn primary className="flex-1" onClick={close}>Fermer</Btn></div></Sheet> }
  if (m.kind === "rel") return <Sheet title="Nouvelle relance" c={A.rel.c} onClose={close}><div className="space-y-3"><F l="Client"><input autoFocus list="akno-clients" autoComplete="off" placeholder="Nom du client" className={inp} {...v("name")} /></F><F l="Type"><select className={inp} {...v("type")}>{["Relance devis", "Demande d'avis", "Rappel RDV", "Relance facture"].map(x => <option key={x}>{x}</option>)}</select></F><div className="grid grid-cols-2 gap-2"><F l="Canal"><select className={inp} {...v("canal")}><option>SMS</option><option>Appel</option><option>E-mail</option></select></F><F l="Quand"><input className={inp} {...v("when")} /></F></div></div>
    {foot("Programmer", !!f.name.trim(), () => { set(x => ({ ...x, rels: [{ id: uid(), client: f.name.trim(), type: f.type, canal: f.canal, status: "prog", date: f.when || "Demain" }, ...x.rels] })); toast("Relance programmée") })}</Sheet>
  if (m.kind === "pw") return <PwSheet close={close} />
  if (m.kind === "listen") { const n = s.calls.filter(x => x.dur && x.dur !== "0:00").length; return <Sheet title="À écouter" sub={`${n} enregistrement${n > 1 ? "s" : ""}`} c={A.rec.c} onClose={close}><ListenList /></Sheet> }
  if (m.kind === "calls") { const todo = s.calls.filter(x => x.callback).sort((a, b) => Number(b.urgent) - Number(a.urgent)), rest = s.calls.filter(x => !x.callback)
    return <Sheet title="Appels" sub={`${todo.length} à rappeler · ${s.calls.length} appels au total`} c={A.rec.c} onClose={close}><CallsList todo={todo} rest={rest} /></Sheet> }
  if (m.kind === "callbacks") { const todo = s.calls.filter(x => x.callback).sort((a, b) => Number(b.urgent) - Number(a.urgent))
    const done = (x: Call) => { set(y => ({ ...y, calls: y.calls.map(z => z.id === x.id ? { ...z, callback: false } : z) })); toast(`${x.name} · marqué rappelé`) }
    return <Sheet title="À rappeler" sub={`${todo.length} client${todo.length > 1 ? "s" : ""} · ${todo.filter(x => x.urgent).length} urgent${todo.filter(x => x.urgent).length > 1 ? "s" : ""}`} c={A.rec.c} onClose={close}>{todo.length ? <div className="-mx-5 bg-black/20">{todo.map((x, i) => <Row key={x.id} first={i === 0} label={x.name} onClick={() => modal({ kind: "client", data: { name: x.name, call: x.id } })} lead={<Av n={x.name} />} t={<span className="flex items-center gap-2"><span className="truncate">{x.name}</span>{x.urgent && <Chip c={RED}>Urgent</Chip>}</span>} s={`${x.tag || x.topic} · ${x.day ? "hier " : ""}${x.time}`} r={<div className="flex items-center gap-2"><TBtn I={MessageSquareText} label={`SMS à ${x.name}`} href={`sms:${tel(x.name)}`} /><TBtn I={Phone} label={`Appeler ${x.name}`} href={`tel:${tel(x.name)}`} c={A.rec.c} onClick={() => done(x)} /></div>} />)}</div> : <div className={`py-8 text-center ${tx.cap}`}>Personne à rappeler. Tout est à jour.</div>}</Sheet> }
  if (m.kind === "relList") return <Sheet title="Relances" sub={`${s.rels.filter(r => r.status === "prog").length} à venir`} c={A.rel.c} onClose={close}><div className="-mx-5 bg-black/20">{s.rels.map((r, i) => <Row key={r.id} first={i === 0} label={r.client} onClick={() => modal({ kind: "relView", data: r })} lead={<Ic I={canalI[r.canal] || Send} />} t={r.client} s={`${r.type} · ${r.date}`} r={<Chip c={RS[r.status][1]}>{RS[r.status][0]}</Chip>} />)}</div></Sheet>
  if (m.kind === "relView") { const r = s.rels.find(y => y.id === d.id) || d as Rel, on = s.settings.agents.rel
    return <Sheet title={r.client} sub={`${r.type} · ${r.canal}`} c={A.rel.c} onClose={close}><div className="space-y-2"><Sub dot={RS[r.status][1]}>{RS[r.status][0]} · {r.date}</Sub>{!on && <Sub>Agent Relance en pause : envoi manuel désactivé</Sub>}</div>
      <div className="mt-6 grid grid-cols-2 gap-2">{(r.status === "prog" || r.status === "pause") ? <><Btn primary disabled={!on} aria-label={`Envoyer ${r.client}`} onClick={() => { relUpd(r.id, "env", `Relance envoyée à ${r.client} (simulé)`, "À l'instant"); close() }}><Send size={14} strokeWidth={1.5} />Envoyer</Btn><Btn onClick={() => { relUpd(r.id, r.status === "pause" ? "prog" : "pause", r.status === "pause" ? "Relance reprise" : "Relance en pause"); close() }}>{r.status === "pause" ? <><Play size={13} strokeWidth={1.5} />Reprendre</> : <><Pause size={13} strokeWidth={1.5} />Mettre en pause</>}</Btn></> : <Btn className="col-span-2" onClick={() => { relUpd(r.id, "prog", "Relance reprogrammée", "Demain 9:00"); close() }}><RotateCcw size={14} strokeWidth={1.5} />Reprogrammer</Btn>}</div></Sheet> }
  if (m.kind === "devis") return <Sheet title="Nouveau devis" c={A.dev.c} onClose={close}><div className="space-y-3"><F l="Client"><input autoFocus list="akno-clients" autoComplete="off" placeholder="Nom du client" className={inp} {...v("name")} /></F><F l="Objet"><input className={inp} {...v("topic")} /></F><F l={`Montant HT (€) · TVA ${String(s.settings.tva).replace(".", ",")} %`}><input type="number" min={0} className={inp} {...v("amount")} /></F></div>
    {foot("Créer le brouillon", !!f.name.trim() && Number(f.amount) > 0, () => { set(x => ({ ...x, devis: [{ id: uid(), num: Math.max(...x.devis.map(y => y.num), 9087) + 1, client: f.name.trim(), objet: f.topic || "Travaux", amount: Number(f.amount), status: "brouillon", created: Date.now() }, ...x.devis] })); toast("Brouillon de devis créé"); go("dev") }, A.dev.c, "Indiquez le client et un montant")}</Sheet>
  if (m.kind === "devisList") return <Sheet title="Devis" sub="Septembre" c={A.dev.c} onClose={close}><div className="-mx-5 bg-black/20">{[...s.devis].sort((a, b) => b.num - a.num).map((x, i) => <Row key={x.id} first={i === 0} label={`Devis ${x.num}`} onClick={() => modal({ kind: "devisEdit", data: x })} lead={<Av n={x.client} />} t={x.client} s={`N° ${x.num} · ${x.objet}`} r={eur(x.amount)} rs={<Chip c={ST[x.status][1]}>{ST[x.status][0]}</Chip>} />)}</div></Sheet>
  if (m.kind === "aiPop") { const dv = s.devis.find(x => x.id === d.id) || d as Devis, n = s.devis.filter(x => x.status === "aval").length
    if (dv.status !== "aval") return null
    return <Sheet title="Nouveau devis" sub="Agent Devis · à valider" c={A.dev.c} onClose={close}>
      <div className="text-[15px] text-white/60">Nouveau devis pour</div><div className="mt-1 text-[24px] font-medium tracking-[-0.02em]">{dv.client}</div>
      <div className="mt-5 rounded-[20px] bg-white/[.04] p-4"><div className={tx.cap}>Montant</div><div className={`mt-1 text-[40px] ${tx.fig}`}>{eur(ttc(dv.amount, s.settings.tva))}</div><div className={`mt-1 ${tx.cap}`}>TTC · {eur(dv.amount)} HT · {dv.objet}</div></div>
      <div className="mt-4 flex items-center gap-2 text-[13px] text-white/50"><Sparkles size={14} strokeWidth={1.5} style={{ color: A.dev.c }} />Généré par Akno depuis l'appel {dv.from ? `d'${dv.from}` : "du client"}</div>
      {n > 1 && <div className={`mt-2 ${tx.cap}`}>+ {n - 1} autre{n > 2 ? "s" : ""} devis à valider</div>}
      <div className="mt-6"><Btn primary c={A.dev.c} className="w-full" onClick={() => modal({ kind: "devisPrev", data: dv })}>Regarder le devis</Btn></div></Sheet> }
  if (m.kind === "devisPrev") { const dv = s.devis.find(x => x.id === d.id) || d as Devis, tv = s.settings.tva, cl = findC(dv.client)
    const lines = dv.lines?.length ? dv.lines : [{ l: dv.objet, q: 1, pu: dv.amount }], ht = lines.reduce((a, x) => a + x.q * x.pu, 0), tva = Math.round(ht * tv) / 100
    const validate = () => { const snap = s; set(x => ({ ...x, devis: x.devis.map(y => y.id === dv.id ? { ...y, status: "env" } : y) })); toast(`Devis ${dv.num} validé · envoyé à ${dv.client}`, () => set(() => snap)); close() }
    const doc = buildDoc(dv, cl, tv, TODAY)
    return <Sheet title={`Devis N° ${dv.num}`} sub={dv.status === "aval" ? "Généré par Akno · à valider" : ST[dv.status][0]} c={A.dev.c} onClose={close} footer={dv.status === "aval" ? <div className="flex gap-2"><Btn className="flex-1" onClick={() => modal({ kind: "devisEdit", data: dv })}>Modifier</Btn><Btn primary c={A.dev.c} className="flex-[1.6]" onClick={validate}><Check size={16} />Valider</Btn></div> : <Btn className="w-full" onClick={close}>Fermer</Btn>}>
      <DevisPaper d={doc} />
      <div className="mt-3"><Btn className="w-full" onClick={() => import("../lib/devisPdf").then(x => { x.downloadPdf(doc); toast(`Devis-${dv.num}.pdf téléchargé`) })}><Download size={15} strokeWidth={1.5} />Télécharger PDF</Btn></div>
      {dv.ai && <div className="mt-3 flex items-center gap-2 px-1 text-[12.5px] text-white/45"><Sparkles size={13} strokeWidth={1.5} style={{ color: A.dev.c }} />Généré par Akno depuis l'appel {dv.from ? `d'${dv.from}` : "du client"}</div>}
    </Sheet> }
  if (m.kind === "devisEdit") { const dv = s.devis.find(x => x.id === d.id) || d as Devis; const setS = (st: DevStatus) => { set(x => ({ ...x, devis: x.devis.map(y => y.id === dv.id ? { ...y, status: st } : y) })); toast(`Devis ${dv.num} : ${ST[st][0]}`) }
    return <Sheet title={`Devis N° ${dv.num}`} sub={`${dv.client} · ${dv.objet}`} c={A.dev.c} onClose={close}><div className={`text-[40px] ${tx.fig}`}>{eur(dv.amount)}</div><div className="mt-2"><Sub>HT · {eur(Math.round(dv.amount * (1 + s.settings.tva / 100)))} TTC (TVA {String(s.settings.tva).replace(".", ",")} %)</Sub></div>
      <Btn primary c={A.dev.c} className="mt-5 w-full" onClick={() => modal({ kind: "devisPrev", data: dv })}><FileText size={16} strokeWidth={1.6} />Voir le devis</Btn>
      <div className={`mb-3 mt-6 px-1 ${tx.cap}`}>Statut</div><div className="flex flex-wrap gap-1.5">{(Object.keys(ST) as DevStatus[]).map(k => <button key={k} onClick={() => setS(k)} className={`flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-medium ${dv.status === k ? "bg-white/[.16] text-white" : "bg-white/[.06] text-white/60"}`}><Dot c={ST[k][1]} />{ST[k][0]}</button>)}</div>
      <div className="mt-6 flex gap-2"><Btn className="flex-1" onClick={() => { if (confirm(`Supprimer le devis ${dv.num} ?`)) { set(x => ({ ...x, devis: x.devis.filter(y => y.id !== dv.id) })); toast("Devis supprimé"); close() } }}><Trash2 size={15} strokeWidth={1.5} />Supprimer</Btn><Btn primary className="flex-1" onClick={close}>Fermer</Btn></div></Sheet> }
  return null
}

/* ---------------- Assistant (moteur local, src/lib/assistant.ts) ---------------- */
function Chat() {
  const { s, set, desk, setChat, page, go, modal, toast } = useC()
  const k: K = page === "set" ? "dev" : page, c = A[k].c
  const [v, setV] = useState(""), [busy, setBusy] = useState(false), end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }) }, [s.chat.length, busy])
  const sRef = useRef(s); sRef.current = s
  const pend = useRef<Pending | null>(null)
  const doAct = (a: RAct) => {
    if (a.k === "tel") { location.href = `tel:${a.v.replace(/ /g, "")}`; return }
    if (a.k === "sms") { const [ph, body] = a.v.split("|"); location.href = `sms:${ph.replace(/ /g, "")}${body ? `?&body=${encodeURIComponent(body)}` : ""}`; return }
    if (a.k === "fiche") { modal({ kind: "client", data: { name: a.v } }); return }
    if (a.k === "go") { go(a.v as P); if (!desk) setChat(false); return }
    if (a.k === "devis") { const dv = sRef.current.devis.find(d => d.id === a.v); if (dv) modal({ kind: "devisPrev", data: dv }); return }
    if (a.k === "ev") { const e = sRef.current.events.find(x => x.id === a.v); if (e) modal({ kind: "ev", data: e }); return }
    if (a.k === "cmd") send(a.v)
  }
  const send = (text: string) => { if (!text.trim() || busy) return; set(x => ({ ...x, chat: [...x.chat, { id: uid(), from: "me", text }] })); setV(""); setBusy(true)
    setTimeout(async () => {
      const cur = sRef.current, r = answer(text, cur, { today: TODAY, now: NOW, pending: pend.current, me: meName(cur) })
      pend.current = r.pending === undefined ? (r.intent.endsWith(":ask") ? pend.current : null) : r.pending
      let txt = r.text; if (r.fallback) { const ext = await askExternal(text, cur, { today: TODAY, now: NOW }); if (ext) txt = ext }
      const msg: Msg = { id: uid(), from: "ai", text: txt, items: r.items, acts: r.acts, chips: r.chips, done: r.done }
      const snap = sRef.current
      set(x => ({ ...(r.apply ? r.apply(x) : x), chat: [...x.chat, msg] }))
      if (r.apply && r.toast) toast(r.toast, () => set(x => ({ ...snap, chat: x.chat })))
      if (r.open) doAct(r.open)
      setBusy(false) }, 550) }
  const validate = (m: Msg) => set(x => {
    if (m.devisId) return { ...x, devis: x.devis.map(y => y.id === m.devisId ? { ...y, status: "att" } : y) }
    const cd = m.card!, nid = uid(), exists = x.devis.some(y => y.num === cd.num)
    return { ...x, chat: x.chat.map(y => y.id === m.id ? { ...y, devisId: nid } : y), devis: exists ? x.devis : [{ id: nid, num: cd.num, client: cd.client, objet: cd.objet, amount: cd.amount, status: "att", created: Date.now() }, ...x.devis] }
  })
  const Me = ({ t }: any) => <div className={`ml-auto ${desk ? "max-w-[80%] rounded-[16px]" : "max-w-[78%] rounded-[18px]"} rounded-br-[6px] bg-white/[.08] px-3.5 py-2.5 text-[14px] leading-snug`}>{t}</div>
  const Ai = ({ t }: any) => <div className={`flex gap-2.5 ${desk ? "" : "max-w-[86%]"}`}><div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/[.06] bg-[#0A0A0B]"><Blob c={c} s={16} /></div><div className="min-w-0 text-[14px] leading-snug text-white/85">{t}</div></div>
  const DCard = ({ m }: { m: Msg }) => { const dv = m.devisId ? s.devis.find(d => d.id === m.devisId) : undefined, cd = dv || m.card; if (!cd) return null; const stt = dv ? ST[dv.status][0] : "Brouillon"
    return <div className={`mt-3 rounded-[16px] bg-white/[.06] p-4`}><div className="flex justify-between gap-2 text-[12px] text-white/40"><span className="truncate">N° {cd.num} · {short(cd.client)}</span><span className="shrink-0">{stt}</span></div><div className={`mt-1 ${desk ? "text-[22px]" : "text-[20px]"} font-light tracking-[-0.03em]`}>{eur(cd.amount)}</div>
      <div className="mt-3 flex gap-2">{(!dv || dv.status === "brouillon") && <button onClick={() => { validate(m); toast(`Devis ${cd.num} validé · en attente d'envoi`) }} className="flex h-8 flex-1 items-center justify-center rounded-full bg-white text-[12.5px] font-medium text-black">Valider</button>}<button onClick={() => { if (dv) { go("dev"); modal({ kind: "devisEdit", data: dv }) } else modal({ kind: "devis", data: { client: cd.client, objet: cd.objet, amount: cd.amount } }) }} className="flex h-8 flex-1 items-center justify-center rounded-full border border-white/10 text-[12.5px] text-white/70">Modifier</button></div></div> }
  const chips = HELP_CHIPS
  const ChatItem = ({ x, first }: { x: RItem; first?: boolean }) => { const open = () => { if (x.k === "client" || x.k === "call" || x.k === "rel") modal({ kind: "client", data: { name: x.name || x.t, call: x.k === "call" ? x.id : undefined } }); else if (x.k === "devis") { const dv = s.devis.find(d => d.id === x.id); if (dv) modal({ kind: "devisPrev", data: dv }) } else { const e = s.events.find(y => y.id === x.id); if (e) modal({ kind: "ev", data: e }) } }
    const I = x.k === "rdv" ? CalendarDays : x.k === "devis" ? Receipt : x.k === "rel" ? Repeat2 : x.k === "call" ? PhoneCall : null
    return <button onClick={open} className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-white/[.04] ${first ? "" : "border-t border-white/[.06]"}`}>{I ? <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[.07] text-white/70"><I size={15} strokeWidth={1.6} /></span> : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[.07] text-[11px] font-semibold text-white/85">{x.t.replace(/^(M\.|Mme)\s*/, "").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}</span>}
      <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] text-white/90">{x.t}</span>{x.s && <span className="block truncate text-[12px] text-white/45">{x.s}</span>}</span>
      {(x.r || x.rs) && <span className="flex shrink-0 flex-col items-end">{x.r && <span className="text-[13px] tabular-nums text-white/85">{x.r}</span>}{x.rs && <span className="text-[11.5px] text-white/45">{x.rs}</span>}</span>}</button> }
  const head = <div className="flex w-full items-center gap-2.5"><span className={`flex ${desk ? "h-7 w-7" : "h-8 w-8"} shrink-0 items-center justify-center rounded-full`} style={{ background: `${c}26`, color: c === "#E6E6E6" ? "#fff" : c }}><Sparkles size={desk ? 14 : 15} strokeWidth={1.5} /></span>{desk ? <div className="text-[14px] font-medium">Assistant {A[k].n} <span className="ml-1 text-[12px] font-normal text-white/30">· hors ligne</span></div> : <div className="min-w-0"><div className="text-[15px] font-medium">Assistant {A[k].n}</div><div className="text-[12px] text-white/40">Hors ligne · sur vos données Akno</div></div>}
    {desk ? <button aria-label="Fermer l'assistant" onClick={() => setChat(false)} className="ml-auto flex h-8 w-8 items-center justify-center text-white/40 hover:text-white/70"><X size={16} strokeWidth={1.5} /></button>
      : <button aria-label="Fermer l'assistant" onClick={() => setChat(false)} className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[.07] text-white/70 hover:text-white"><X size={IS} strokeWidth={SW} /></button>}</div>
  const msgs = <div className={`flex min-h-0 flex-1 flex-col overflow-y-auto ${desk ? "gap-5 px-5 py-6" : "mt-6 gap-4"}`}>
    {!s.chat.length && <div className="flex flex-wrap gap-1.5">{chips.map(x => <button key={x} onClick={() => send(x)} className="rounded-full border border-white/[.08] px-3 py-1.5 text-[12.5px] text-white/60 hover:text-white">{x}</button>)}</div>}
    {s.chat.map((m, i) => m.from === "me" ? <Me key={m.id} t={m.text} /> : <Ai key={m.id} t={<><div className="whitespace-pre-line">{m.text}</div>
      {m.done?.length ? <div className="mt-2.5 flex flex-wrap gap-1.5">{m.done.map(x => <span key={x} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium" style={{ background: "#30D15822", color: "#30D158" }}><Check size={12} strokeWidth={2} />{x}</span>)}</div> : null}
      {m.items?.length ? <div className="mt-3 overflow-hidden rounded-[16px] bg-white/[.05]">{m.items.map((x, j) => <ChatItem key={x.k + x.id + j} x={x} first={j === 0} />)}</div> : null}
      {m.acts?.length ? <div className="mt-3 flex flex-wrap gap-2">{m.acts.map(a => <button key={a.l + a.v} onClick={() => doAct(a)} className={`flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium ${a.primary ? "text-black" : "border border-white/10 text-white/75 hover:text-white"}`} style={a.primary ? { background: "#fff" } : {}}>{a.k === "tel" ? <Phone size={13} strokeWidth={1.8} /> : a.k === "sms" ? <MessageSquareText size={13} strokeWidth={1.8} /> : null}{a.l}</button>)}</div> : null}
      {i === s.chat.length - 1 && m.chips?.length ? <div className="mt-3 flex flex-wrap gap-1.5">{m.chips.map(x => <button key={x} onClick={() => send(x)} className="rounded-full border border-white/[.08] px-3 py-1.5 text-[12.5px] text-white/60 hover:text-white">{x}</button>)}</div> : null}
      <DCard m={m} />{m.action && <button onClick={() => go(m.action as P)} className="mt-2 flex items-center gap-1 text-[12.5px] text-white/50 hover:text-white">Ouvrir {A[m.action as K].tab}<ChevronRight size={13} /></button>}</>} />)}
    {busy && <div className="flex gap-1 pl-10">{[0, 1, 2].map(i => <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-white/40" animate={{ opacity: [.2, 1, .2] }} transition={{ duration: 1, repeat: Infinity, delay: i * .15 }} />)}</div>}
    <div ref={end} /></div>
  const input = <form onSubmit={e => { e.preventDefault(); send(v) }} className="flex h-12 shrink-0 items-center gap-2 rounded-full bg-white/[.07] pl-4 pr-1.5"><input aria-label="Message" value={v} onChange={e => setV(e.target.value)} placeholder="Écrire à l'assistant…" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-white/30" /><Mic size={17} strokeWidth={1.5} className="shrink-0 text-white/40" /><button aria-label="Envoyer" disabled={!v.trim() || busy} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full disabled:opacity-60" style={{ background: c, color: c === "#E6E6E6" ? "#000" : "#fff" }}><ArrowUp size={16} strokeWidth={1.8} /></button></form>
  if (desk) return <motion.aside initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} className="flex w-[380px] shrink-0 flex-col border-l border-white/[.06] bg-[#0B0B0C]">
    <div className="flex h-16 shrink-0 items-center border-b border-white/[.06] px-5">{head}</div>{msgs}<div className="p-5">{input}</div></motion.aside>
  return <><motion.div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setChat(false)} />
    <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} transition={{ type: "spring", stiffness: 200, damping: 24 }} className="fixed inset-x-0 bottom-0 z-40 flex h-[560px] max-h-[88dvh] flex-col rounded-t-[24px] border-t border-white/[.08] bg-[#121214] px-5 pt-3 shadow-[0_-30px_60px_-20px_rgba(0,0,0,.9)]" style={{ paddingBottom: "max(28px, env(safe-area-inset-bottom))" }}>
      <div className="mx-auto h-[5px] w-9 shrink-0 rounded-full bg-white/20" /><div className="mt-4 shrink-0">{head}</div>{msgs}<div className="pt-3">{input}</div></motion.div></>
}

/* ---------------- App ---------------- */
const useDesk = () => { const q = "(min-width: 1024px)"; const [d, setD] = useState(() => matchMedia(q).matches); useEffect(() => { const m = matchMedia(q), f = () => setD(m.matches); m.addEventListener("change", f); return () => m.removeEventListener("change", f) }, []); return d }
const font = (desk: boolean) => ({ fontFamily: "'Geist Variable', -apple-system, sans-serif", fontFeatureSettings: desk ? "'tnum'" : "'tnum','ss01'" })
const ORD: P[] = ["rec", "ag", "rel", "dev", "set"]
function AknoApp() {
  const pathname = useLocation().pathname, navigate = useNavigate()
  const [s, setS] = useStore(), desk = useDesk()
  CL = s.clients || []
  const page: P = SLUG[(pathname || "").split("/")[1] || ""] || "rec"
  const [m, setM] = useState<Modal>(null), [chat, setChatS] = useState(() => new URLSearchParams(location.search).has("chat"))
  const [toastT, setToastT] = useState<{ t: string; k: number; undo?: () => void } | null>(null), [q, setQ] = useState("")
  useEffect(() => { document.title = `Akno · ${page === "set" ? "Paramètres" : A[page].tab}` }, [page])
  useEffect(() => { if (!toastT) return; const t = setTimeout(() => setToastT(null), toastT.undo ? 5000 : 2600); return () => clearTimeout(t) }, [toastT])
  const sw = useRef<{ x: number, y: number, t: number, ok: boolean } | null>(null), dir = useRef(0)
  const go = (p: P) => { if (ORD.indexOf(p) !== ORD.indexOf(page)) dir.current = ORD.indexOf(p) > ORD.indexOf(page) ? 1 : -1; setQ(""); setM(null); if (p !== page) navigate(`/${slugOf(p)}${chat && desk ? "?chat=1" : ""}`); if (!desk) setChatS(false) }
  const setChat = (b: boolean) => { setChatS(b); navigate(`/${slugOf(page)}${b ? "?chat=1" : ""}`, { replace: true }) }
  const ctx: Ctx = { s, set: setS, desk, page, go, modal: setM, chat, setChat, toast: (t: string, undo?: () => void) => setToastT({ t, k: Date.now(), undo }), q, setQ }
  const Pg = { rec: Rec, ag: Ag, rel: RelP, dev: Dev, set: SetP }[page]
  return <C.Provider value={ctx}><MotionConfig reducedMotion="user"><div className="fixed inset-0 flex overflow-hidden bg-black text-white tabular-nums antialiased" style={font(desk)}>
    {desk ? <><Side /><div className="flex min-w-0 flex-1 flex-col"><Top /><main className="min-h-0 flex-1 overflow-hidden"><AnimatePresence mode="wait" initial={false}><motion.div key={page} className="h-full" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .2, ease: [.25, .1, .25, 1] }}><Pg /></motion.div></AnimatePresence></main></div><AnimatePresence>{chat && <Chat />}</AnimatePresence></>
      : <div className="flex min-w-0 flex-1 flex-col" onTouchStart={e => { const t = e.touches[0]; sw.current = { x: t.clientX, y: t.clientY, t: Date.now(), ok: !(e.target as HTMLElement).closest("[data-noswipe],input,textarea,[role=slider]") } }} onTouchEnd={e => { const o = sw.current; sw.current = null; if (!o || !o.ok || m || chat) return; const t = e.changedTouches[0], dx = t.clientX - o.x, dy = t.clientY - o.y; if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6 || Date.now() - o.t > 600) return; const i = ORD.indexOf(page), j = i + (dx < 0 ? 1 : -1); if (j < 0 || j >= ORD.length) return; dir.current = dx < 0 ? 1 : -1; go(ORD[j]) }}><AnimatePresence mode="wait" initial={false} custom={dir.current}><motion.div key={page} custom={dir.current} className="flex min-h-0 flex-1 flex-col" variants={{ i: (d: number) => ({ opacity: 0, x: d * 28 }), a: { opacity: 1, x: 0 }, e: (d: number) => ({ opacity: 0, x: d * -28 }) }} initial="i" animate="a" exit="e" transition={{ duration: .22, ease: [.25, .1, .25, 1] }}><Pg /></motion.div></AnimatePresence><TabBar /><AnimatePresence>{chat && <Chat />}</AnimatePresence></div>}
    <AnimatePresence>{m && <Forms key={m.kind + (m.data?.id || "")} m={m} close={() => setM(null)} />}</AnimatePresence>
    <AnimatePresence>{toastT && <motion.div key={toastT.k} role="status" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`fixed left-1/2 z-[60] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-full border border-white/[.08] bg-[#1C1C1F]/95 py-2 pl-3 text-[14px] shadow-[0_20px_40px_-10px_rgba(0,0,0,.9)] backdrop-blur-xl ${toastT.undo ? "pr-2" : "pr-4"} ${desk ? "bottom-8" : "bottom-[calc(76px+max(var(--sab)-18px,6px))]"}`}><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#30D158]/20 text-[#30D158]"><Check size={14} strokeWidth={2.2} /></span><span className="truncate">{toastT.t}</span>{toastT.undo && <button onClick={() => { toastT.undo?.(); setToastT({ t: "Action annulée", k: Date.now() }) }} className="h-8 shrink-0 rounded-full bg-white/10 px-3 text-[13px] font-semibold hover:bg-white/15">Annuler</button>}</motion.div>}</AnimatePresence>
  </div></MotionConfig></C.Provider>
}

const noop = () => () => {}
/** Rendu client uniquement : localStorage et matchMedia ne sont lus qu'après le montage (aucune erreur d'hydratation). */
class Boundary extends Component<{ children: ReactNode }, { err: boolean }> {
  state = { err: false }
  static getDerivedStateFromError() { return { err: true } }
  componentDidCatch(e: unknown) { console.error("Akno crash", e) }
  render() { return this.state.err ? <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 bg-black px-6 text-center text-white"><p className="text-[15px] text-white/60">Un problème est survenu.</p><button onClick={() => location.reload()} className="h-[52px] rounded-full bg-white px-8 text-[16px] font-semibold text-black">Recharger</button></div> : this.props.children }
}
export default function AknoRoot() { return <Boundary><AknoRootInner /></Boundary> }
function AknoRootInner() {
  const ready = useSyncExternalStore(noop, () => true, () => false), [ses, setSes] = useState<Session | null | undefined>(undefined)
  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSes(data.session)); const { data } = supabase.auth.onAuthStateChange((_e, x) => setSes(x)); return () => data.subscription.unsubscribe() }, [])
  const [rec, setRec] = useState(() => new URLSearchParams(location.search).has("reset"))
  useEffect(() => { const { data } = supabase.auth.onAuthStateChange(e => { if (e === "PASSWORD_RECOVERY") setRec(true) }); return () => data.subscription.unsubscribe() }, [])
  if (ses) { (window as any).__aknoEmail = ses.user.email; (window as any).__aknoUid = ses.user.id }
  const uid = ses?.user.id, [locked, setLocked] = useState(false), [setup, setSetup] = useState(false)
  // Démarrage à froid avec une session déjà ouverte : verrouiller
  useEffect(() => { supabase.auth.getSession().then(({ data }) => { if (data.session && hasLock(data.session.user.id)) setLocked(true) }) }, [])
  // Retour d'arrière-plan après plus de 30 s : verrouiller
  useEffect(() => { let hid = 0; const f = () => { if (document.hidden) hid = Date.now(); else if (hid && Date.now() - hid > 30000 && uid && hasLock(uid)) setLocked(true) }; document.addEventListener("visibilitychange", f); return () => document.removeEventListener("visibilitychange", f) }, [uid])
  // Proposer la création du code une seule fois après connexion
  useEffect(() => { if (uid && !hasLock(uid) && !localStorage.getItem(`akno-lock-asked:${uid}`)) setSetup(true); if (!uid) setLocked(false) }, [uid])
  useEffect(() => { const f = () => setSetup(true); addEventListener("akno-lock-setup", f); return () => removeEventListener("akno-lock-setup", f) }, [])
  if (!ready || ses === undefined) return <div className="fixed inset-0 bg-black" />
  if (ses && locked) return <LockScreen uid={ses.user.id} onUnlock={() => setLocked(false)} />
  if (ses && setup && !rec) return <LockSetup uid={ses.user.id} email={ses.user.email || ""} onDone={() => { localStorage.setItem(`akno-lock-asked:${ses.user.id}`, "1"); setSetup(false) }} />
  if (rec && ses) return <Login mode="reset" onDone={() => { setRec(false); history.replaceState(null, "", "/reception") }} />
  return ses ? <AknoApp key={ses.user.id} /> : <Login />
}
