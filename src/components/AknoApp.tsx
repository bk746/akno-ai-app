import PageSkeleton from "./PageSkeleton"
import VoiceCall from "./VoiceCall"
import { formatVoiceTimings, isVoiceDebugEnabled, setVoiceDebugEnabled, subscribeVoiceTimings } from "../lib/voice/timing"
import { isVoiceCallActive, primeCallWakeLock } from "../lib/voice/wakeLock"
import { CO, buildDoc, e2, missingLegal } from "../lib/devisDoc"
import { api, openUpgrade, useAccount, useRights } from "../lib/accountApi"
import { LockTag, ReceptionLocked, UpgradeHost } from "./billing/Upgrade"
import { Lock as LockIco, MessageSquare, Copy, MoreHorizontal, Navigation } from "lucide-react"
import { useProfile } from "../lib/profile"
import EntrepriseSheet from "./sheets/EntrepriseSheet"
import AbonnementSheet, { AbonnementPage } from "./sheets/AbonnementSheet"
import DeleteAccountSheet from "./sheets/DeleteAccountSheet"
import { APP_BUILD, APP_VERSION } from "../lib/version"
import ConformiteSheet from "./sheets/ConformiteSheet"
import LeadsSheet from "./sheets/LeadsSheet"
import { AgendaCalSheet, ReceptionSheet, SmsSheet } from "./sheets/ReglagesSheets"
import ReceptionnisteReglagesSheet, { ActivateReceptionniste, ReceptionnisteControls } from "./reception/ReceptionnisteReglages"
import { voiceInfo } from "../lib/voice/receptionist"
import Gate from "./sheets/Gate"
import SetupGate from "./setup/SetupGate"
import type { EditorReq, CtInfo } from "./devis/DevisEditor"
import { chainProgress, looksPhone, sendDevisSms, useChain } from "../lib/chaine"
import { Frise, LinesCard, NextCard } from "./devis/Chaine"
import { Tiles } from "./sheets/PilotageSheet"
import { pilotage } from "../lib/compta"
import { connectUi } from "../lib/chaine"
import { PrestationsSheet } from "./devis/Prestations"
import { usePrestations } from "../lib/prestations"
import { isPageLocked, openSetup } from "../lib/setup"
import { answer, askExternal, HELP_CHIPS, type Pending, type RAct, type RItem } from "../lib/assistant"
import { useLocation, useNavigate } from "react-router-dom"
import { Component, Suspense, lazy, type ComponentType, type ReactNode, createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, startTransition } from "react"
import { motion, AnimatePresence, useReducedMotion, animate, MotionConfig, useIsPresent } from "motion/react"
import { Tag, KeyRound, UserRound } from "lucide-react"
import { Plus, Settings, Sparkles, Mic, Play, Pause, ArrowUp, X, PhoneCall, CalendarDays, Repeat2, Receipt, ChevronRight, ChevronLeft, Phone, Clock, AudioLines, MessageSquareText, Percent, FileSignature, ImageIcon, Timer, MapPin, Bell, Smartphone, CreditCard, LifeBuoy, LogOut, Search, Send, Mail, RotateCcw, Trash2, Check, Download, FileText , Users, HardHat, ScanFace, Banknote, Building2, ShieldCheck, Globe, CalendarCheck, Package, FilePen } from "lucide-react"
import { BLOB } from "./blobPath"
import { PHONES, useStore, uid, BASE, addDays, eur, seed } from "../lib/store"
import { mergeTarifs, tarifsSummary } from "../lib/tarifs"
import { digitsFr, formatPhonePairs } from "../lib/phone"
import { draftDevisFromCall, sendDevisEmail } from "../lib/devisApi"
import { signedRecordingUrl } from "../lib/recordings"
import { supabase } from "../lib/supabase"
import { ClientFactures, FicheEditor, ficheKey, useFiche } from "./sheets/ClientFiche"
import { attentionCount, disablePush, enablePush, ensurePush, isIos, isStandalone, nativeIosPush, nativePushPermission, pushNeedsActivation, registerPushWorker, sendTestNotification, updateAppBadge } from "../lib/push"
import Login from "./Login"
import Flow from "./onboarding/Flow"
import { LockScreen, LockSetup } from "./Lock"
import { bioAvailable, disableBio, enableBio, getLock, hasLock } from "../lib/lock"
import type { Session } from "@supabase/supabase-js"
import type { Client, St, Devis, DevisLine, DevStatus, Rel, Ev, Call, Msg } from "../lib/store"
import { A, C, useC, setListen, useListen, Blob, GREEN, AMBER, RED, GREY, tx, IS, SW, ink, initials, durF, isK, Card, Dot, Chip, Circ, Ic, Av, Row, List, rise, Section, Col, QA, Chart, Tg, Btn, TBtn, Chev, inp, dt, F, Sheet, Sub, StatusText, UrgentDot, type K, type P, type Modal, type Ctx, type QAi } from "./ui"
// update45 : déclaré après les imports (sinon « Cannot access lazy before initialization » en mode dev Vite)
const FacturesSheet = lazyPage(() => import("./sheets/FacturesSheet")) // update67 : préchargée au repos
// update64 · Chantiers (carte Leaflet) et Équipe : chargés à la demande, hors bundle principal
// update67 : préchargées (au repos, au toucher) — rendu synchrone ensuite, jamais d'écran de chargement entre deux pages
const ChantiersPage = lazyPage(() => import("./chantiers/ChantiersPage"))
const EquipePage = lazyPage(() => import("./equipe/EquipePage")) // update65
const ClientsPage = lazyPage(() => import("./clients/ClientsPage")) // update66
import { loadChantiers, requestNewChantier, requestOpenChantier, useChantiers } from "../lib/chantiers"
import { clientsState, loadClients, requestNewClient, requestOpenClient, useClients } from "../lib/clients"
// update57 · configurateur « Ma réceptionniste » (chargé à la demande)
const ReceptionnisteStudio = lazyPage(() => import("./reception/ReceptionnisteStudio"))
const DevisEditor = lazyPage(() => import("./devis/DevisEditor"))
const DevisPaper = lazyPage(() => import("./DevisPaper"))
const ClientChantiers = lazyPage(() => import("./chantiers/ClientChantiers"))
const EventSheet = lazyPage(() => import("./agenda/EventSheet"))
const TeamView = lazyPage(() => import("./agenda/TeamView"))
const AgendaTools = lazyPage(() => import("./agenda/AgendaTools"))
import UpdateButton from "./UpdateButton"
import { billingHidden, isNative, webOrigin } from "../lib/native"
import { applyUpdate, initAppUpdate, isChunkError, recoverChunkError } from "../lib/appUpdate"
import { CloudDownload } from "lucide-react"
import MobileNav, { type CreateKind } from "./nav/MobileNav"
import { DocRow, StDot, BigEur, eurM, frShort, MO_L, type StT } from "./m/DocRow"
import { MListPage, PushLayer } from "./m/MPage"
import SignSheet from "./m/SignSheet"
import { AgDay, AgWeek, AgMonth, AgTeam, TeamPill, TeamFilterSheet, useAgendaM, addMonth } from "./m/MAgenda"
import { FicheShell, DBlk, DRow, KV as MKV, LSec, LCard, DocLine, CallLine, Timeline, useClientFactures, requestEditClient, type FAct, type CFact } from "./m/Fiche"
import { chantiersOfClient } from "./chantiers/ClientChantiers"
import { STATUS_COLOR, STATUS_LABEL, effectiveStatus, progressPct, rangeLabel } from "../lib/chantierCalc"
import { SatThumb } from "./SatThumb"
import { noteTab, lastTab } from "./nav/IosPage"
import { IosPage, Chip as IosChip, Segmented, IRow, IH2, Capsule as Capsule2, type CapsBtn } from "./nav/IosPage"
import { useRelancesCounts, useRelancesView } from "./relances/RelancesPane"
import { CROSSFADE, PUSH, SHEET, SNAP, TAB, TOAST, TOAST_TOP, idle, lazyPage } from "../lib/motion"
import { createPortal } from "react-dom"
import { hapticSuccess } from "../lib/haptics"
import { lastDocMode } from "../lib/facturesLite"
import { dueOf, isLate, isUnpaid, refreshFactures, rememberDocMode, unpaidCount, useFacturesLite, factureState, type FactureLite } from "../lib/facturesLite"
import ModalSheet from "./sheet/ModalSheet"
import { SwipeRow, askConfirm, ConfirmHost } from "./form/SwipeRow"
import { attachTravel, expandForGrid, expandRecurring, kindColor } from "../lib/agenda"
import { useAppRole } from "../lib/role"

import { devisDeleteReason, factureSwipeAction } from "../lib/docDelete"

/* Visuels repris à l'identique de Desktop.tsx (/desktop) et Mobile.tsx (/mobile). */
const agents = ["rec", "ag", "rel", "dev"] as const
const SLUG: Record<string, P> = { reception: "rec", agenda: "ag", relance: "rel", devis: "dev", parametres: "set", factures: "fac", chantiers: "ch", equipe: "eq", clients: "cl" }
const slugOf = (p: P) => p === "set" ? "parametres" : p === "fac" ? "factures" : p === "ch" ? "chantiers" : p === "eq" ? "equipe" : p === "cl" ? "clients" : A[p].slug
/** update62 · titre lisible d'une page (Factures et Chantiers ne sont pas des agents) */
const pageTitle = (p: P) => p === "set" ? "Paramètres" : p === "fac" ? "Factures" : p === "ch" ? "Chantiers" : p === "eq" ? "Équipe" : p === "cl" ? "Clients" : A[p].tab
const DAYS = ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."]
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
const _now = new Date(), TODAY = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`, NOW = _now.getHours() + _now.getMinutes() / 60
const hh = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`
const dd = (iso: string) => new Date(iso + "T12:00:00")
const dlabel = (iso: string) => `${DAYS[(dd(iso).getDay() + 6) % 7]} ${dd(iso).getDate()}`
const short = (n: string) => /^(M\.|Mme|Chantier)/.test(n) ? n : n.split(" ").length > 1 ? `${n[0]}. ${n.split(" ").slice(1).join(" ")}` : n
const ttc = (ht: number, tv: number) => Math.round(ht * (1 + tv / 100))
const PilotageL = lazy(() => import("./sheets/PilotageSheet"))
const ConnectL = lazy(() => import("./sheets/PilotageSheet").then(m => ({ default: m.ConnectSheet })))
const ST: Record<DevStatus, [string, string]> = { aval: ["À valider", "#2F6BFF"], brouillon: ["Brouillon", "rgba(255,255,255,.3)"], att: ["En attente", "#FFB340"], env: ["Envoyé", "rgba(255,255,255,.3)"], val: ["Validé", "#30D158"], ref: ["Refusé", "#FF5F57"], sans: ["Sans réponse", "rgba(255,255,255,.3)"], perdu: ["Perdu", "rgba(255,255,255,.3)"] }
const toValidate = (d: Devis) => d.status === "aval" || (d.status === "brouillon" && !!d.ai)
/* update77 · durées du nouveau RDV (journée = 8 h) */
const DUR_OPTS: [string, string][] = [["0.5", "0h30"], ["1", "1h"], ["1.5", "1h30"], ["2", "2h"], ["3", "3h"], ["4", "4h"], ["8", "journée"]]

const RS: Record<Rel["status"], [string, string]> = { prog: ["Programmée", "#FFB340"], pause: ["En pause", "rgba(255,255,255,.15)"], env: ["Envoyée", "rgba(255,255,255,.3)"], rep: ["Répondu", "#30D158"] }

const match = (q: string, ...xs: string[]) => !q || xs.join(" ").toLowerCase().includes(q.toLowerCase())

/* ================= Design system (tokens uniques) =================
   Espacements : 4/8/12/16/20/24/32 · Rayon carte : 24 · Surface : #121214 · Filet : white/7 %
   Texte : fig (chiffre), title 17 semibold, body 15 medium, cap 13 gris · Icônes : 20 px, trait 1.75 */
let CL: Client[] = []
const isUuidL = (x: string) => /^[0-9a-f-]{36}$/i.test(x)
const ckey = (n: string) => n.replace(/^(M\.|Mme|Chantier)\s*/, "").trim().split(" ").slice(-1)[0].toLowerCase()
const findC = (n: string) => CL.find(c => c.key === ckey(n))
const tel = (n: string) => { const p = PHONES.get(n); if (p) return p; const f = findC(n); if (f) return f.phone.replace(/ /g, ""); return "" } // update44 : plus de faux numéro inventé quand le client n'a pas de téléphone connu

function Side() {
  const { page, go, s } = useC(), rr = useRights(), role = useAppRole()
  const isEmploye = role?.kind === "employe"
  const nDev = s.devis.filter(toValidate).length, nFac = unpaidCount(useFacturesLite())
  const It = ({ id, l, c }: any) => { const on = id === page; return <motion.button whileTap={{ scale: .97 }} onClick={() => go(id)} aria-current={on ? "page" : undefined} className={`relative flex h-11 w-full items-center gap-3 rounded-full px-4 text-[15px] font-medium transition-colors ${on ? "text-white" : "text-white/45 hover:text-white/80"}`}>{on && <motion.span layoutId="side-pill" transition={spring} className="absolute inset-0 rounded-full bg-white/10" />}<span className="relative flex w-full items-center gap-3">{id === "set" ? <Me size={20} on={on} /> : <NI d={NAV_I[id as P]} size={20} />}{l}<span className="ml-auto flex items-center gap-2">{id === "rec" && !rr.reception && <LockIco size={13} strokeWidth={2} className="text-white/35" aria-label="Option non incluse" />}{id === "dev" && nDev > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-white" style={{ background: A.dev.c }}>{nDev}</span>}{id === "fac" && nFac > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-bold text-black">{nFac}</span>}{on && <span className="h-[5px] w-[5px] rounded-full" style={{ background: ink(c) }} />}</span></span></motion.button> }
  return <aside className="flex w-[240px] shrink-0 flex-col border-r border-white/[.07] px-4 py-6">
    <div className="flex h-12 items-center px-3"><img src="/logo.png" alt="Akno" className="h-9" /></div>
    <nav aria-label="Navigation principale" className="mt-8 space-y-1">{isEmploye ? <It id="ag" l="Agenda" c={A.ag.c} /> : <>{agents.map(a => <It key={a} id={a} l={A[a].tab} c={A[a].c} />)}<It id="fac" l="Factures" c="#fff" /><It id="ch" l="Chantiers" c="#fff" /><It id="eq" l="Équipe" c="#fff" /><It id="cl" l="Clients" c="#fff" /></>}</nav>
    {!isEmploye && <><div className={`mt-8 px-3 ${tx.cap}`}>Agents</div>
    <div className="mt-3 space-y-3 px-3">{agents.map(a => <button key={a} onClick={() => go(a)} className="flex w-full items-center gap-3 text-[13px] text-white/70"><Blob c={A[a].c} s={16} />{A[a].n}<span className="ml-auto">{a === "rec" && !rr.reception ? <LockIco size={12} strokeWidth={2} className="text-white/35" aria-label="Option non incluse" /> : <Dot c={s.settings.agents[a] ? GREEN : GREY} />}</span></button>)}</div></>}
    <div className="mt-auto"><It id="set" l="Paramètres" c="#fff" /><div className="mt-3 flex items-center gap-3 border-t border-white/[.07] px-3 pt-4"><Av n={meName(s)} /><div><div className="text-[13px] font-medium">{meName(s)}</div><div className="text-[12px] text-white/50">{s.settings.company || ""}</div></div></div></div>
  </aside>
}
const PLUS: Record<K, string> = { rec: "Nouvelle note d'appel", ag: "Nouveau rendez-vous", rel: "Nouvelle relance", dev: "Nouveau devis" }
const plusKind: Record<K, any> = { rec: "call", ag: "rdv", rel: "rel", dev: "devis" }
function Capsule({ k, sm }: { k: K; sm?: boolean }) {
  const { modal, setChat, chat } = useC()
  return <div className={`flex items-center ${sm ? "gap-2" : "gap-4"}`}><button data-hit aria-label={`Discuter avec l'IA ${A[k].n}`} title="Assistant" onClick={() => setChat(!chat)} className={`relative flex ${sm ? "h-8 w-8" : "h-9 w-9"} items-center justify-center rounded-[10px] bg-[#141416] text-white/55 hover:text-white`}><Sparkles size={sm ? 16 : 18} strokeWidth={1.5} /><span className="absolute right-[5px] top-[5px] h-[6px] w-[6px] rounded-full" style={{ background: A[k].c }} /></button>{!sm && <button aria-label={PLUS[k]} title={`${PLUS[k]} (N)`} onClick={() => isPageLocked(k) ? openSetup() : modal({ kind: plusKind[k] })} className={`${sm ? "flex h-8 w-8 rounded-[10px]" : "-mx-[11px] flex h-11 w-11"} items-center justify-center text-white hover:text-white/80`}><Plus size={sm ? 20 : 22} strokeWidth={1.5} /></button>}</div>
}
function Top() {
  const { page, q, setQ, modal } = useC(), ref = useRef<HTMLInputElement>(null), rr = useRights()
  useEffect(() => { const f = (e: KeyboardEvent) => { const t = e.target as HTMLElement, typing = /INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable
    if (((e.metaKey || e.ctrlKey) && e.key === "k") || (!typing && e.key === "/")) { e.preventDefault(); ref.current?.focus() }
    else if (!typing && !e.metaKey && !e.ctrlKey && (e.key === "n" || e.key === "N") && isK(page) && !document.querySelector("[role=dialog]")) { e.preventDefault(); if (isPageLocked(page)) openSetup(); else modal({ kind: plusKind[page] }) } }
    addEventListener("keydown", f); return () => removeEventListener("keydown", f) }, [page, modal])
  return <div className="flex h-16 shrink-0 items-center border-b border-white/[.07] bg-black px-8"><span className={tx.title}>{isK(page) ? A[page].n : pageTitle(page)}</span>
    <div className="ml-auto flex items-center gap-4"><label className="flex h-9 w-[240px] items-center gap-2 rounded-full bg-white/[.07] px-3 text-[13px] text-white/50"><Search size={16} strokeWidth={SW} className="shrink-0" /><input ref={ref} value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher" className="w-full min-w-0 bg-transparent text-white outline-none placeholder:text-white/40" />{q ? <button aria-label="Effacer" onClick={() => setQ("")}><X size={14} /></button> : <kbd className="ml-auto rounded-[6px] bg-white/[.08] px-1.5 font-sans text-[11px] text-white/50">/</kbd>}</label>
      <UpdateButton />{isK(page) && !(page === "rec" && !rr.reception) && <Capsule k={page} />}</div></div>
}
function Num({ n, u, money }: { n: number; u?: string; money?: boolean }) {
  const reduce = useReducedMotion(), [v, setV] = useState(0), from = useRef(0)
  useEffect(() => { if (reduce) return; const c = animate(from.current, n, { duration: .9, ease: [.22, 1, .36, 1], onUpdate: x => { from.current = x; setV(x) } }); return () => c.stop() }, [n, reduce])
  const x = Math.round(reduce ? n : v), t = money ? x.toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ") : String(x)
  return <span aria-label={`${n}${u ? " " + u : ""}`} className="inline-flex items-baseline gap-[.12em]"><span>{t}</span>{u && <span className="text-[.42em] font-normal tracking-[-0.01em] text-white/45">{u}</span>}</span>
}
/* update62 · En-tête mobile commun : retour (pages hors onglets), logo, mise à jour, assistant, accès Réglages (initiales).
   update63 : le sélecteur Devis | Factures est dans la page unifiée (sous le bot bleu). */
function MobileHead({ k }: { k?: K }) {
  const { page, go } = useC(), rr = useRights()
  const back = page === "rel" || page === "set"
  return <><div className="flex h-10 shrink-0 items-center px-5">
    {back && <motion.button type="button" whileTap={{ scale: .9 }} aria-label="Retour" onClick={() => go(rr.reception || !rr.ready ? "rec" : "ag")} className="-ml-2 mr-1 flex h-10 w-10 items-center justify-center rounded-full text-white/80 [-webkit-tap-highlight-color:transparent]"><ChevronLeft size={24} strokeWidth={1.9} /></motion.button>}
    <img src="/logo.png" alt="Akno" className="h-[25px] w-auto" />
    <div className="ml-auto flex items-center gap-2"><UpdateButton sm />{k && <Capsule k={k} sm />}
      {page !== "set" && <motion.button type="button" whileTap={{ scale: .9 }} aria-label="Réglages" title="Réglages" onClick={() => go("set")} className="ml-1 flex h-9 w-9 items-center justify-center rounded-full [-webkit-tap-highlight-color:transparent]"><Me size={30} /></motion.button>}</div></div>
    </>
}
/* Gabarit unique de page : blob + chiffre clé + actions rondes + sections */
const DOC_ORDER = (x?: string) => x === "rel" ? 2 : x === "fac" ? 1 : 0
/* update67 · Devis ↔ Factures : le contenu glisse dans le sens du changement avec un fondu, la hauteur suit en ressort (aucun saut),
   le haut de page (bot bleu, chiffre) ne bouge pas. */
const swapV = { enter: (d: number) => ({ opacity: 0, x: d * 44 }), center: { opacity: 1, x: 0 }, exit: (d: number) => ({ opacity: 0, x: -d * 44 }) }
const swapT = { x: TAB, opacity: { duration: .2, ease: [.22, 1, .36, 1] as const } }
function Measure({ onH, children, className }: { onH: (h: number) => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null), present = useIsPresent(), on = useRef(onH); on.current = onH
  const live = useRef(present); live.current = present
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return
    const ro = new ResizeObserver(() => { if (live.current) on.current(el.offsetHeight) })
    ro.observe(el); if (live.current) on.current(el.offsetHeight)
    return () => ro.disconnect()
  }, [])
  return <div ref={ref} className={className}>{children}</div>
}
function SwapBody({ k, dir, className, children }: { k?: string; dir: number; className: string; children: ReactNode }) {
  const [h, setH] = useState<number | null>(null), [moving, setMoving] = useState(false)
  return <motion.div className="relative" initial={false} animate={h == null ? undefined : { height: h }} transition={{ height: TAB }}
    onAnimationStart={() => setMoving(true)} onAnimationComplete={() => setMoving(false)} style={{ overflow: moving ? "hidden" : "visible" }}>
    <AnimatePresence mode="popLayout" initial={false} custom={dir}>
      <motion.div key={k} custom={dir} variants={swapV} initial="enter" animate="center" exit="exit" transition={swapT}><Measure onH={setH} className={className}>{children}</Measure></motion.div>
    </AnimatePresence>
  </motion.div>
}
/* update69 · Devis ↔ Factures : les deux volets restent montés ; le volet choisi glisse en même temps que la pilule (même
   ressort SNAP, transform uniquement), l'autre sort de l'autre côté puis est masqué. Plus aucun rendu de liste au moment du tap. */
function DuoPanes({ active, panes, className }: { active: string; panes: [string, ReactNode][]; className: string }) {
  const sorted = [...panes].sort((a, b) => DOC_ORDER(a[0]) - DOC_ORDER(b[0])), ai = sorted.findIndex(p => p[0] === active)
  // les deux volets sont visibles pendant le glissement, le volet quitté est masqué une fois arrivé
  const [moving, setMoving] = useState(false), [was, setWas] = useState(active), reduce = useReducedMotion()
  if (was !== active) { setWas(active); setMoving(true) }
  // mouvements réduits : fondu enchaîné en transition CSS (l'opacité via WAAPI « revenait » une image à la fin sur WebKit)
  useEffect(() => { if (!reduce || !moving) return; const t = setTimeout(() => setMoving(false), 320); return () => clearTimeout(t) }, [reduce, moving, active])
  return <div className="relative [overflow:clip]">
    {sorted.map(([key, node], i) => { const on = i === ai
      return <motion.div key={key} data-doc-pane={key} aria-hidden={on ? undefined : true} inert={!on} className={`${on ? "relative" : "pointer-events-none absolute inset-x-0 top-0"}${reduce ? " rm-fade" : ""}`}
        style={{ visibility: on || moving ? undefined : "hidden", ...(reduce ? { opacity: on ? 1 : 0 } : null) }} onAnimationComplete={() => { if (on && !reduce) setMoving(false) }}
        initial={false} animate={reduce ? { x: "0%" } : { x: `${(i - ai) * 100}%`, opacity: 1 }} transition={reduce ? { duration: 0 } : SNAP}>
        <div className={className}>{node}</div></motion.div> })}
  </div>
}
function Shell({ k, lead, label, fig, sub, actions, children, mid, bodyKey, alt, alts, title, mcaps, noHero, sheetTop }: { mcaps?: CapsBtn[]; noHero?: boolean; sheetTop?: number; title?: string; k?: K; lead?: any; label?: any; fig: any; sub: any; actions: QAi[]; children: any; mid?: ReactNode; bodyKey?: string; alt?: { key: string; actions: QAi[]; children: ReactNode }; alts?: { key: string; actions: QAi[]; children: ReactNode }[] }) {
  const { desk, s, setChat, go, page } = useC(), on = k ? s.settings.agents[k] : true, rr = useRights()
  // update63 · contenu interchangeable (Devis | Factures) : fondu + glissement, le haut de page (bot) ne bouge pas
  const prevKey = useRef(bodyKey), dir = useRef(1)
  if (bodyKey !== prevKey.current) { dir.current = DOC_ORDER(bodyKey) >= DOC_ORDER(prevKey.current) ? 1 : -1; prevKey.current = bodyKey }
  // update69 : avec « alt », les deux contenus restent montés côte à côte (DuoPanes) au lieu d'être recréés à chaque bascule
  const others = alts || (alt ? [alt] : [])
  const swap = (mk: (a: QAi[], c: ReactNode) => ReactNode, cls: string) => others.length && bodyKey !== undefined
    ? <DuoPanes active={bodyKey} className={cls} panes={[[bodyKey, mk(actions, children)] as [string, ReactNode], ...others.map(o => [o.key, mk(o.actions, o.children)] as [string, ReactNode])]} />
    : <SwapBody k={bodyKey} dir={dir.current} className={cls}>{mk(actions, children)}</SwapBody>
  const L = lead || (k && <div className="relative"><div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[260px] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: `radial-gradient(circle, ${A[k].c}${A[k].c === "#E6E6E6" ? "1A" : "33"} 0%, transparent 62%)` }} /><motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}><Blob c={A[k].c} s={desk ? 86 : 106} /></motion.div></div>)
  const lab = label !== undefined ? label : (k && <><Dot c={on ? GREEN : "#FF9F0A"} />{A[k].n} · {on ? "En ligne" : "En pause"}</>)
  const H = <div className={desk ? "min-w-0" : "flex flex-col items-center text-center"}><div className={`flex items-center gap-1.5 ${desk ? "text-[12px]" : "mt-4 text-[10px] leading-none [&>span:first-child]:h-[5px] [&>span:first-child]:w-[5px]"} normal-case text-white/40`}>{lab}</div><div className={`${desk ? "mt-1 text-[52px]" : "mt-3 text-[44px]"} font-normal tabular-nums leading-none tracking-[-0.03em] text-white/90`}>{fig}</div><div className={`mt-2 ${tx.cap}`}>{sub}</div></div>
  const LB = L && <button type="button" aria-label="Ouvrir l'assistant" onClick={() => setChat(true)} className="block cursor-pointer select-none transition-transform duration-150 active:scale-95 [-webkit-tap-highlight-color:transparent]">{L}</button>
  const foot = null
  if (desk) return <div className="h-full overflow-y-auto px-8 pt-8"><motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: .03 } } }} className="mx-auto w-full max-w-[1040px]"><motion.div variants={rise} className="flex items-center gap-6">{LB}{H}<div className="ml-auto w-[360px] shrink-0">{bodyKey === undefined ? <QA items={actions} /> : swap(a => <QA items={a} />, "")}</div></motion.div>{mid && <motion.div variants={rise} className="mt-8">{mid}</motion.div>}{bodyKey === undefined ? <div className="mt-12 grid grid-cols-2 items-start gap-6">{children}</div> : swap((_a, c) => c, "mt-10 grid grid-cols-2 items-start gap-6")}{foot}</motion.div></div>
  // Refonte iOS (DA Designer) : titre + capsule (+ · action · …), haut de page noir, contenu dans une feuille blanche
  const plus = actions.find(x => x.I === Plus)
  const secB: Partial<Record<K, CapsBtn>> = { rec: { I: Users, label: "Clients", on: () => go("cl") }, dev: { I: Users, label: "Clients", on: () => go("cl") } }
  const isSet = !k && page === "set", back = () => go(rr.reception || !rr.ready ? "rec" : "ag")
  const caps: CapsBtn[] = mcaps ? mcaps : isSet ? [{ I: X, label: "Terminé", text: "Terminé", on: back }] : [...(plus ? [{ I: Plus, label: plus.label || plus.l, on: plus.on, dis: plus.dis }] : []), ...(k && secB[k] ? [secB[k]!] : []), { I: MoreHorizontal, label: "Réglages", on: () => go("set") }]
  // passe 2 : plus de rangée de pastilles sous le haut de page (absente des maquettes) ; les actions sont dans la capsule, les Réglages via « … »
  const heroBot = <button type="button" aria-label="Ouvrir l'assistant" onClick={() => setChat(true)} className="flex h-24 w-24 items-center justify-center select-none transition-transform duration-150 active:scale-95 [-webkit-tap-highlight-color:transparent]">{lead || <motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} className="drop-shadow-[0_8px_16px_rgba(0,0,0,.45)]"><Blob c="#E6E6E6" s={96} /></motion.div>}</button>
  const hero = noHero ? undefined : <>{heroBot}{lab && <div className={`${mid ? "mt-2.5" : "mt-3.5"} flex items-center gap-1.5 text-[13px] leading-4 text-[#A1A1A6] [&>span:first-child]:h-[7px] [&>span:first-child]:w-[7px]`}>{lab}</div>}<div className={`${mid ? "mt-1.5" : "mt-3.5"} flex items-baseline justify-center text-[64px] font-semibold leading-[64px] tracking-[-0.03em] tabular-nums text-white`}>{fig}</div><div className={`mt-1.5 ${mid ? "text-[17px]" : "text-[19px]"} leading-6 text-[rgba(235,235,245,.72)]`}>{sub}</div></>
  const ttl = title || (k === "dev" ? "Facturation" : k === "rel" ? "Relances" : k ? A[k].tab : "")
  const backBtn = k === "rel" ? <button type="button" aria-label="Retour" onClick={() => go(lastDocMode())} className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center text-white"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[.14]"><ChevronLeft size={22} strokeWidth={2} /></span></button> : undefined
  return <IosPage title={ttl || (isSet ? "Réglages" : "")} caps={caps} mid={mid} hero={hero} lead={backBtn} sheetTop={sheetTop} dragSheet={k === "rec"}>
    {bodyKey === undefined ? children : swap((_a, c) => <div className="flex flex-col">{c}</div>, "")}
  </IosPage>
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
  fac: <><rect x="5" y="3.5" width="14" height="17" rx="2.5" /><path d="M8.5 8h7M8.5 11.5h7M8.5 15h4" /></>,
  ch: <><path d="M12 20.5s-6.25-5.4-6.25-10.6a6.25 6.25 0 0 1 12.5 0c0 5.2-6.25 10.6-6.25 10.6Z" /><circle cx="12" cy="9.9" r="2.3" /></>,
  eq: <><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M15.5 5.8a3 3 0 0 1 0 5.4M17.5 14.2A5.5 5.5 0 0 1 20.5 19" /></>,
  cl: <><rect x="5" y="3.5" width="14" height="17" rx="2.5" /><circle cx="12" cy="10" r="2.6" /><path d="M8.2 16.8a4 4 0 0 1 7.6 0M3.5 8h2M3.5 12h2M3.5 16h2" /></>,
}
const NAV_C: Record<P, string> = { rec: "#fff", ag: A.ag.c, rel: A.rel.c, dev: A.dev.c, set: "#fff", fac: "#fff", ch: "#fff", eq: "#fff", cl: "#fff" }
const NAV_L: Record<P, string> = { rec: "Réception", ag: "Agenda", rel: "Relance", dev: "Devis", set: "Réglages", fac: "Factures", ch: "Chantiers", eq: "Équipe", cl: "Clients" }
const spring = { type: "spring" as const, stiffness: 520, damping: 38, mass: .8 }
/* Lecteur d'appel : audio réel (URL signée) + vitesse 1x / 1.25x / 1.5x / 2x */
const secs = (d?: string) => { const [m, x] = (d || "0:00").split(":").map(Number); return (m || 0) * 60 + (x || 0) || 1 }
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`
const RATES = [1, 1.25, 1.5, 2] as const
const rateLabel = (n: number) => n === 1 ? "1x" : n === 1.25 ? "1.25x" : n === 1.5 ? "1.5x" : "2x"
function usePlayer(total: number, recording?: string) {
  const [play, setPlay] = useState(false), [pos, setPos] = useState(0), [rate, setRate] = useState(1), [dur, setDur] = useState(total || 1), [src, setSrc] = useState<string>()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  useEffect(() => { setListen(play); return () => setListen(false) }, [play])
  useEffect(() => {
    let on = true
    setSrc(undefined)
    if (!recording) return
    signedRecordingUrl(recording).then(u => { if (on && u) setSrc(u) })
    return () => { on = false }
  }, [recording])
  useEffect(() => {
    setPos(0); setPlay(false); setDur(total || 1)
    if (!src) { audioRef.current = null; return }
    const a = new Audio(src)
    a.preload = "metadata"
    a.muted = false
    a.volume = 1
    a.setAttribute("playsinline", "")
    audioRef.current = a
    const onTime = () => setPos(a.currentTime)
    const onMeta = () => { if (Number.isFinite(a.duration) && a.duration > 0) setDur(a.duration) }
    const onEnd = () => { setPlay(false); setPos(a.duration || 0) }
    a.addEventListener("timeupdate", onTime)
    a.addEventListener("loadedmetadata", onMeta)
    a.addEventListener("ended", onEnd)
    return () => {
      a.pause()
      a.removeEventListener("timeupdate", onTime)
      a.removeEventListener("loadedmetadata", onMeta)
      a.removeEventListener("ended", onEnd)
      a.removeAttribute("src"); a.load()
      if (audioRef.current === a) audioRef.current = null
    }
  }, [src, total])
  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = rate }, [rate])
  useEffect(() => {
    if (src || !play) return
    setPlay(false)
  }, [play, src])
  const seek = (t: number) => { const n = Math.max(0, Math.min(dur, t)); setPos(n); if (audioRef.current) audioRef.current.currentTime = n }
  const toggle = () => {
    const a = audioRef.current
    if (a) {
      if (play) { a.pause(); setPlay(false) }
      else {
        if (a.ended || pos >= (a.duration || dur) - 0.05) { a.currentTime = 0; setPos(0) }
        void a.play().then(() => setPlay(true)).catch(() => setPlay(false))
      }
      return
    }
    if (!play && pos >= dur) setPos(0)
    setPlay(!play)
  }
  const cycleRate = () => { const i = RATES.findIndex(x => x === rate); setRate(RATES[(i + 1) % RATES.length]) }
  return { play, pos, setPos: seek, toggle, total: dur, rate, cycleRate }
}
const WAVE = Array.from({ length: 32 }, (_, i) => .25 + Math.abs(Math.sin(i * 1.9) * .5 + Math.sin(i * .55) * .3) * .85)
function Player({ p, c, onMic, compact }: { p: ReturnType<typeof usePlayer>; c: string; onMic?: () => void; compact?: boolean }) {
  const f = p.total ? p.pos / p.total : 0, played = Math.round(f * WAVE.length)
  const seek = (e: any) => { const r = e.currentTarget.getBoundingClientRect(); p.setPos(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * p.total) }
  return <div className={`flex items-center ${compact && !onMic ? "h-9 gap-2.5" : "h-11 gap-3"}`}>
    <button data-hit aria-label={p.play ? "Pause" : "Écouter l'appel"} onClick={e => { e.stopPropagation(); p.toggle() }} className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[.12] transition-colors hover:border-white/25">{p.play ? <Pause size={14} fill="white" strokeWidth={0} /> : <Play size={14} fill="white" strokeWidth={0} className="ml-[1px]" />}</button>
    <div role="slider" tabIndex={0} aria-label="Position de lecture" aria-valuemin={0} aria-valuemax={Math.round(p.total)} aria-valuenow={Math.round(p.pos)} aria-valuetext={mmss(p.pos)} onClick={e => { e.stopPropagation(); seek(e) }} onKeyDown={e => { if (e.key === "ArrowRight") p.setPos(Math.min(p.total, p.pos + 5)); if (e.key === "ArrowLeft") p.setPos(Math.max(0, p.pos - 5)) }} className="flex h-[22px] min-w-0 flex-1 cursor-pointer items-center justify-between">
      {WAVE.map((h, i) => <span key={i} className="w-[2px] shrink-0 rounded-full transition-colors duration-150" style={{ height: `${Math.round(h * 100)}%`, background: i < played ? c : "rgba(255,255,255,.18)" }} />)}</div>
    <span className="w-9 shrink-0 text-right text-[13px] tabular-nums text-white/50">{p.play || p.pos > 0 ? mmss(p.pos) : mmss(p.total)}</span>
    <button type="button" data-hit aria-label="Vitesse de lecture" onClick={e => { e.stopPropagation(); p.cycleRate() }} className="flex h-8 shrink-0 items-center justify-center rounded-full bg-white/[.08] px-2.5 text-[12px] font-semibold tabular-nums text-white/80 hover:bg-white/[.14]">{rateLabel(p.rate)}</button>
    {onMic && <button data-hit aria-label="Parler à l'assistant" onClick={e => { e.stopPropagation(); onMic() }} className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition active:scale-[.94]" style={{ background: c, color: c === "#E6E6E6" || c === "#FFFFFF" ? "#000" : "#fff", boxShadow: `0 4px 12px -6px ${c}80` }}><Mic size={16} strokeWidth={SW} /></button>}
  </div>
}

/* ---------------- Réception ---------------- */
const callSt = (x: Call): [string, string] => x.callback ? [x.urgent ? "À rappeler · urgent" : "À rappeler", x.urgent ? RED : AMBER] : ["Traité", GREEN]

/* Contacts : fiches clients + noms vus dans appels, devis et RDV, depuis le début */
type Ct = { key: string; name: string; phone: string; calls: number; last: string; since?: string }
const sortN = (n: string) => n.replace(/^(M\.|Mme|Chantier)\s*/, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
function contacts(s: St): Ct[] {
  const m = new Map<string, Ct>(), y = addDays(TODAY, -1)
  const up = (n: string, d?: string, call = false) => { const k = ckey(n); let c = m.get(k); if (!c) { const f = (s.clients || []).find(x => x.key === k); c = { key: k, name: f?.name || n, phone: f?.phone || tel(n).replace(/(\d{2})(?=\d)/g, "$1 "), calls: 0, last: "" }; m.set(k, c) } if (call) c.calls++; if (d && d > c.last) c.last = d }
  ;(s.clients || []).forEach(x => { up(x.name, x.hist?.last); const c = m.get(x.key)!; c.calls += x.hist?.calls || 0; c.since = x.hist?.since })
  s.calls.forEach(x => up(x.name, x.day && x.createdAt ? new Date(x.createdAt).toLocaleDateString("sv-SE") : x.day ? y : TODAY, true))
  s.events.forEach(x => !/^Chantier/.test(x.name) || findC(x.name) ? up(x.name, x.date <= TODAY ? x.date : undefined) : null)
  s.devis.forEach(x => up(x.client))
  return [...m.values()]
}
/* update52 : contacts pour le choix du client dans l'éditeur de devis (nom, téléphone, e-mail, adresse) */
function ctInfos(s: St): CtInfo[] {
  const m = new Map<string, CtInfo>()
  const up = (name?: string, p: Partial<CtInfo> = {}) => { const n = (name || "").trim(); if (!n || /^(client )?inconnu\b/i.test(n)) return; const k = n.toLowerCase(), c = m.get(k) || { name: n }; m.set(k, { name: c.name, phone: c.phone || p.phone || undefined, email: c.email || p.email || undefined, addr: c.addr || p.addr || undefined }) }
  // update66 : fiches du carnet d'adresses d'abord (coordonnées saisies par l'artisan)
  clientsState().fiches.forEach(f => up(f.nom, { phone: f.telephone || undefined, email: f.email || undefined, addr: f.adresse || undefined }))
  ;(s.clients || []).forEach(x => up(x.name, { phone: x.phone, email: x.email, addr: x.addr }))
  s.devis.forEach(x => up(x.client, { phone: x.phone, email: x.email, addr: x.addr }))
  s.calls.forEach(x => up(x.name, { phone: x.phone, addr: x.addr }))
  s.events.forEach(x => !/^Chantier/.test(x.name) && up(x.name, { phone: x.phone, addr: x.addr }))
  return [...m.values()].sort((a, b) => sortN(a.name).localeCompare(sortN(b.name)))
}
function parisYmd(d: Date) { return d.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }) }
function mondayParisYmd() {
  const now = new Date()
  const dow = now.toLocaleString("en-US", { timeZone: "Europe/Paris", weekday: "short" })
  const fromMon = (["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(dow) + 6) % 7
  const [y, m, d] = parisYmd(now).split("-").map(Number)
  const mon = new Date(Date.UTC(y, m - 1, d - fromMon))
  return `${mon.getUTCFullYear()}-${String(mon.getUTCMonth() + 1).padStart(2, "0")}-${String(mon.getUTCDate()).padStart(2, "0")}`
}
function weekCallCount(calls: Call[]) {
  const mon = mondayParisYmd()
  return calls.filter(c => c.createdAt && parisYmd(new Date(c.createdAt)) >= mon).length
}
/* update62 · Relances (devis + demandes d'avis) : hors onglets, accessibles depuis la Réception et Réglages */
const relPending = (s: St) => s.rels.filter(r => r.status === "prog").length
function RelancesCard() {
  const { s, go } = useC(), n = relPending(s), on = s.settings.agents.rel
  return <motion.button type="button" whileTap={{ scale: .98 }} onClick={() => go("rel")} aria-label={`Relances${n ? `, ${n} à venir` : ""}`} className="flex w-full items-center gap-3 rounded-[22px] bg-[#141416] px-4 py-3.5 text-left [-webkit-tap-highlight-color:transparent]">
    <Circ><Blob c={A.rel.c} s={20} /></Circ>
    <span className="min-w-0 flex-1"><span className="block text-[15px] font-medium">Relances</span><span className={`block truncate ${tx.cap}`}>{on ? "Devis sans réponse et demandes d'avis" : "En pause · devis et demandes d'avis"}</span></span>
    {n > 0 && <span className="flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-[12px] font-semibold text-white" style={{ background: A.rel.c }}>{n}</span>}<Chev />
  </motion.button>
}
/* update48 · sans l'option Réceptionniste IA : présentation de l'option (les appels déjà enregistrés restent dans les fiches clients). */
function Rec() {
  const { desk, s, modal } = useC(), rr = useRights()
  if (!rr.ready) return <div className="h-full" />
  if (!rr.reception) return <ReceptionLocked desk={desk} calls={s.calls.length} onCalls={() => modal({ kind: "calls" })} />
  return <RecFull />
}
function RecFull() {
  const { s, set, modal, q, setChat, toast, desk } = useC(), c = A.rec.c
  const acc = useAccount()
  const [voiceOn, setVoiceOn] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const showPush = pushNeedsActivation(!!s.settings.push)
  const today = s.calls.filter(x => !x.day && match(q, x.name, x.topic, x.note)), hier = s.calls.filter(x => x.day && match(q, x.name, x.topic, x.note))
  const [sel] = useState(s.calls[0]?.id), [all, setAll] = useState(false)
  const cur = s.calls.find(x => x.id === sel) || s.calls[0]
  const pl = usePlayer(secs(cur?.dur), cur?.recording), play = pl.play
  const todo = s.calls.filter(x => x.callback), urg = todo.filter(x => x.urgent).length
  const weekN = weekCallCount(s.calls)
  const open = (x: Call) => modal({ kind: "client", data: { name: x.name, call: x.id } }), cts = contacts(s)
  const todoS = todo.filter(x => match(q, x.name, x.topic, x.note)).sort((a, b) => Number(b.urgent) - Number(a.urgent))
  const done = (x: Call) => { const snap = s; set(y => ({ ...y, calls: y.calls.map(z => z.id === x.id ? { ...z, callback: false } : z) })); toast(`${x.name} · marqué rappelé`, () => set(() => snap)) }
  const TRow = (x: Call, i: number) => <Row key={x.id} first={i === 0} label={x.name} urgent={!!x.urgent} onClick={() => open(x)} lead={<Av n={x.name} />} t={x.name} s={`${x.tag || x.topic}${x.rappelAt ? ` · ${x.rappelAt}` : ""} · ${x.day ? `${x.day.toLowerCase()} ` : ""}${x.time}`} r={<TBtn I={Phone} solid label={`Appeler ${x.name}`} href={`tel:${tel(x.name)}`} onClick={() => done(x)} />} />
  const CRow = (x: Call, i: number) => <Row key={x.id} first={i === 0} label={x.name} urgent={!!x.urgent} onClick={() => open(x)} lead={<Av n={x.name} />} t={x.name} s={`${x.tag || x.topic}${x.rappelAt ? ` · ${x.rappelAt}` : ""} · ${x.time}`} r={<StatusText tone={x.callback ? "danger" : "muted"} check={!x.callback}>{x.callback ? "À rappeler" : "Traité"}</StatusText>} />
  return <><Shell k="rec" fig={<Num n={weekN} />} sub="appels reçus cette semaine" actions={[
    { I: Plus, l: "Note", on: () => modal({ kind: "call" }) }, { I: Users, l: "Contacts", on: () => { if (play) pl.toggle(); modal({ kind: "contacts" }) } },
    { I: PhoneCall, l: "Appels", on: () => { if (play) pl.toggle(); modal({ kind: "calls" }) } }, { I: Settings, l: "Réglages", label: "Réglages de la réceptionniste", on: () => modal({ kind: "recReglages" }) }]}>
    {!desk && <>
      <section><IH2 first t="À rappeler" />{todoS.length ? todoS.map((x, i) => <IRow key={x.id} first={i === 0} ini={initials(x.name)} name={x.name} red sub={x.tag || x.topic} time={x.day ? cap(x.day.toLowerCase()) : x.time} href={tel(x.name) ? `tel:${tel(x.name)}` : undefined} onClick={() => tel(x.name) ? done(x) : open(x)} onInfo={() => open(x)} />) : <div className="flex h-[64px] items-center gap-2 px-1 text-[15px] text-[#6E6E73]"><Check size={16} />Personne à rappeler. Tout est à jour.</div>}</section>
      <section><IH2 t="Appels récents" />{s.calls.length ? s.calls.filter(x => match(q, x.name, x.topic, x.note)).slice(0, 30).map((x, i) => <IRow key={x.id} first={i === 0} ini={initials(x.name)} name={x.name} sub={x.tag || x.topic} time={x.day ? cap(x.day.toLowerCase()) : x.time} href={tel(x.name) ? `tel:${tel(x.name)}` : undefined} onClick={() => { if (!tel(x.name)) open(x) }} onInfo={() => open(x)} />) : <div className="flex h-[64px] items-center px-1 text-[15px] text-[#6E6E73]">Aucun appel pour l'instant.</div>}</section>
    </>}
    {(desk || !acc?.integrations.twilio_number) && <div className={desk ? "col-span-2" : "mt-6"}>
      {!acc?.integrations.twilio_number && <div className={desk ? "mb-4" : ""}><ActivateReceptionniste home onActivated={() => modal({ kind: "recReglages" })} /></div>}
      {/* passe 2 : sur mobile, l'appel test de la réceptionniste est dans Réglages › Réceptionniste IA (absent de la maquette Réception) */}
      {desk && <button type="button" onClick={() => { primeCallWakeLock(); setVoiceOn(true) }} aria-label="Appeler ma réceptionniste" className="flex h-14 w-full items-center justify-center gap-2.5 rounded-full text-[15px] font-medium transition active:scale-[.98]" style={{ background: c, color: c === "#E6E6E6" || c === "#FFFFFF" ? "#000" : "#fff", boxShadow: `0 12px 32px -12px ${c}99` }}>
        <Phone size={18} strokeWidth={1.75} />
        Appeler ma réceptionniste
      </button>}
    </div>}
    {desk && <div className="col-span-2"><RelancesCard /></div>}
    {showPush && <div className={desk ? "col-span-2" : "mt-6"}><Card className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="text-[15px] font-medium">Notifications d'appels et de RDV</div><div className={tx.cap}>Recevez un bandeau dans l'app dès qu'un client appelle ou qu'un rendez-vous est pris.</div></div><Btn className="h-11 shrink-0" disabled={pushBusy} onClick={() => { if (pushBusy) return; setPushBusy(true); void enablePush().then(res => { setPushBusy(false); if (res.ok) { set(x => ({ ...x, settings: { ...x.settings, push: true } })); toast("Notifications activées") } else toast(res.error || "Activez les notifications dans les réglages du navigateur.") }) }}><Bell size={16} strokeWidth={1.75} />Activer</Btn></Card></div>}
    {desk && <><Col><Section t="Appels du jour" more={today.length > 4 ? () => setAll(!all) : undefined} aside={`${today.length} appels`}><List empty="Aucun appel aujourd'hui">{(all ? today : today.slice(0, 4)).map(CRow)}</List></Section></Col>
    <Col><Section t="À rappeler" aside={todoS.length ? `${todoS.length} client${todoS.length > 1 ? "s" : ""}` : undefined}><List I={Check} empty="Personne à rappeler. Tout est à jour.">{todoS.slice(0, 3).map(TRow)}</List>{todoS.length > 3 && <button type="button" onClick={() => modal({ kind: "calls" })} className="mt-2 w-full py-2 text-[14px] font-medium text-white/70">Voir tout ({todoS.length})</button>}</Section></Col></>}
    <Col>{cur && <Section t="Dernier débrief" more={() => open(cur)}><Card className="overflow-hidden"><Row first label={cur.name} onClick={() => open(cur)} lead={<Av n={cur.name} />} t={cur.name} s={(cur.note || cur.besoin || cur.topic || "").slice(0, 160)} r={<span className={tx.cap}>{cur.at || cur.time}</span>} />
      {cur.recording && <div className="px-4 pb-4 pt-1"><Player p={pl} c={c} onMic={() => setChat(true)} /></div>}</Card></Section>}</Col>
  </Shell>
  {voiceOn && <VoiceCall fallback={{ prenom: s.settings.name, company: s.settings.company, email: s.settings.email, tarifs: s.settings.tarifs, telephoneUrgence: s.settings.urgencePhone }} onDone={msg => { setVoiceOn(false); try { dispatchEvent(new Event("akno-refresh")) } catch { /* */ } if (msg) toast(msg) }} />}
  </>
}

/* ---------------- Agenda ---------------- */
const fmtD = (iso: string) => { const d = dd(iso); return `${DAYS[(d.getDay() + 6) % 7]} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}` }
type CV = "j" | "s" | "m" | "a" | "e"
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
const monOf = (x: string) => addDays(x, -((dd(x).getDay() + 6) % 7))
const addM = (x: string, n: number) => { const d = dd(x); return iso(new Date(d.getFullYear(), d.getMonth() + n, 1, 12)) }
const monthGrid = (x: string) => { const d = dd(x), first = iso(new Date(d.getFullYear(), d.getMonth(), 1, 12)), st = monOf(first); return Array.from({ length: 42 }, (_, i) => addDays(st, i)) }
const cap = (w: string) => w[0].toUpperCase() + w.slice(1)
const LONG = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
const H0 = 7, H1 = 21

/** update84 · semaines en carrousel (scroll-snap, transform GPU) : un coup de doigt change de semaine sans saccade. */
function WeekSlider({ cur, evs, onEv, onSlot, onWeek }: { cur: string; evs: Ev[]; onEv: (e: Ev) => void; onSlot: (d: string, h: number) => void; onWeek: (d: string) => void }) {
  const mon = monOf(cur)
  const weeks = [addDays(mon, -7), mon, addDays(mon, 7)]
  const sc = useRef<HTMLDivElement>(null)
  const timer = useRef(0)
  const go = useRef(onWeek); go.current = onWeek
  const curRef = useRef(cur); curRef.current = cur
  useLayoutEffect(() => {
    const el = sc.current
    if (!el) return
    const prev = el.style.scrollBehavior
    el.style.scrollBehavior = "auto"
    el.scrollLeft = el.clientWidth
    el.style.scrollBehavior = prev
  }, [cur])
  const settle = () => {
    const el = sc.current
    if (!el || !el.clientWidth) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    if (i === 0) go.current(weeks[0])
    else if (i === 2) go.current(weeks[2])
    else { el.style.scrollBehavior = "auto"; el.scrollLeft = el.clientWidth }
  }
  return <div data-week-slider onScroll={() => { window.clearTimeout(timer.current); timer.current = window.setTimeout(settle, 90) }} ref={sc}>
    {weeks.map(w => <div key={w} data-week-slide>
      <TimeGrid fit days={Array.from({ length: 7 }, (_, i) => addDays(w, i))} evs={evs} onEv={onEv} onSlot={onSlot} />
    </div>)}
  </div>
}
function TimeGrid({ days, evs, onEv, onSlot, fit }: { days: string[]; evs: Ev[]; onEv: (e: Ev) => void; onSlot: (d: string, h: number) => void; fit?: boolean }) {
  const { desk } = useC(), c = A.ag.c, HH = desk ? 56 : 48, one = days.length === 1
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.scrollTo({ top: Math.max(0, (Math.min(8, NOW - 1) - H0) * HH) }) }, [])
  const hours = Array.from({ length: H1 - H0 }, (_, i) => H0 + i)
  const wk = (d: string) => (dd(d).getDay() + 6) % 7 >= 5
  const tight = !desk && !one
  return <div className="overflow-hidden rounded-[16px] border border-white/[.05] bg-black/40">
    <div className={one || fit || desk ? "" : "overflow-x-auto"}><div style={{ minWidth: one || fit || desk ? undefined : 580 }}>
      {!one && <div className="flex border-b border-white/[.06]"><div className="w-14 shrink-0" />{days.map(d => { const td = d === TODAY; return <div key={d} className={`flex flex-1 flex-col items-center py-3 ${wk(d) ? "opacity-45" : ""}`}><span className="text-[11px] font-medium uppercase tracking-[.06em] text-white/40">{DAYS[(dd(d).getDay() + 6) % 7].slice(0, 3)}</span><span className={`mt-1 flex h-8 w-8 items-center justify-center rounded-full text-[16px] ${td ? "font-semibold text-white" : "text-white/85"}`} style={td ? { background: c } : {}}>{dd(d).getDate()}</span></div> })}</div>}
      <div ref={ref} className="relative overflow-y-auto" style={{ maxHeight: desk ? "calc(100dvh - 300px)" : 560 }}>
        <div className="relative flex" style={{ height: (H1 - H0) * HH }}>
          <div className="w-14 shrink-0">{hours.map(h => <div key={h} className="relative" style={{ height: HH }}><span className="absolute -top-[7px] right-3 text-[11px] tabular-nums text-white/35">{h > H0 ? `${h}:00` : ""}</span></div>)}</div>
          {days.map(d => { const list = evs.filter(e => e.date === d)
            return <div key={d} className={`relative flex-1 border-l border-white/[.06] ${wk(d) ? "bg-white/[.015]" : ""}`} onClick={e => { const r = e.currentTarget.getBoundingClientRect(); onSlot(d, Math.floor(H0 + (e.clientY - r.top) / HH * 2) / 2) }}>
              {hours.map(h => <div key={h} className="border-t border-white/[.05] first:border-t-0" style={{ height: HH }} />)}
              {list.map(e => { const past = e.date < TODAY || (e.date === TODAY && e.start + e.dur <= NOW); const col = kindColor(e.kind); return <button key={e.id} data-kind={e.kind || "rdv"} onClick={x => { x.stopPropagation(); onEv(e) }} aria-label={`${e.name} · ${e.topic} · ${hh(e.start)}`} className={`absolute overflow-hidden rounded-[8px] text-left transition hover:brightness-125 ${tight ? "left-0.5 right-0.5 px-1 py-0.5" : "left-1 right-1 px-2 py-1.5"} ${past ? "opacity-50" : ""} ${wk(d) ? "opacity-60" : ""}`} style={{ top: (e.start - H0) * HH + 1, height: Math.max(22, e.dur * HH - 3), background: `${col}14`, boxShadow: `inset 2px 0 0 ${col}` }}>
                <div className={`font-semibold leading-[1.15] text-white/90 ${tight ? "truncate text-[11px]" : "truncate text-[12.5px] leading-tight"}`}>{e.name}</div>
                {e.topic ? <div className={`text-white/55 ${tight ? "line-clamp-2 text-[10px] leading-[1.2]" : e.dur * HH > 34 ? "truncate text-[11.5px] leading-tight" : "hidden"}`}>{e.topic}</div> : null}
              </button> })}
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
  return <div data-year-grid className={`relative z-0 grid gap-x-6 gap-y-8 ${desk ? "grid-cols-4" : "grid-cols-2"}`}>{Array.from({ length: 12 }, (_, m) => { const f = iso(new Date(y, m, 1, 12)), g = monthGrid(f), now = dd(TODAY).getMonth() === m && dd(TODAY).getFullYear() === y
    return <button key={m} onClick={() => onMonth(f)} className="rounded-[16px] p-2 text-left transition-colors hover:bg-white/[.03]"><div className="mb-2 px-1 text-[15px] font-semibold" style={now ? { color: c } : {}}>{cap(MONTHS[m])}</div>
      <div className="grid grid-cols-7 gap-y-[3px] text-center text-[10.5px] tabular-nums">{g.map(d => { const inM = dd(d).getMonth() === m, td = d === TODAY; return <span key={d} className={`relative mx-auto flex h-[18px] w-[18px] items-center justify-center rounded-full ${inM ? "text-white/75" : "text-transparent"}`} style={td && inM ? { background: c, color: "#fff", fontWeight: 600 } : {}}>{dd(d).getDate()}{inM && has.has(d) && !td && <span className="absolute -bottom-[2px] h-[3px] w-[3px] rounded-full" style={{ background: c }} />}</span> })}</div></button> })}</div>
}
function AgCal() {
  const { s, set, modal, toast, q, desk } = useC(), c = A.ag.c
  const [v, setV] = useState<CV>(desk ? "s" : "j"), [cur, setCur] = useState(TODAY)
  const rangeFrom = v === "a" ? `${dd(cur).getFullYear()}-01-01` : v === "m" ? `${cur.slice(0, 7)}-01` : addDays(monOf(cur), 0)
  const rangeTo = v === "a" ? `${dd(cur).getFullYear()}-12-31` : v === "m" ? addDays(addM(cur, 1), -1) : addDays(monOf(cur), 6)
  const evs = attachTravel(expandForGrid(expandRecurring(s.events.filter(e => match(q, e.name, e.topic)), rangeFrom, rangeTo)))
  const move = (n: number) => setCur(x => v === "j" || v === "e" ? addDays(x, n) : v === "s" ? addDays(x, 7 * n) : v === "m" ? addM(x, n) : iso(new Date(dd(x).getFullYear() + n, 0, 1, 12)))
  const d = dd(cur), wkD = Array.from({ length: 7 }, (_, i) => addDays(monOf(cur), i))
  const title = v === "a" ? String(d.getFullYear()) : `${cap(MONTHS[d.getMonth()])} ${d.getFullYear()}`
  const subT = v === "j" || v === "e" ? `${LONG[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTHS[d.getMonth()]}${cur === TODAY ? " · aujourd'hui" : ""}${v === "e" ? " · vue équipe" : ""}` : v === "s" ? (() => { const a = dd(wkD[0]), b = dd(wkD[6]); return `Semaine du ${a.getDate()}${a.getMonth() !== b.getMonth() ? " " + MONTHS[a.getMonth()] : ""} au ${b.getDate()} ${MONTHS[b.getMonth()]}` })() : v === "m" ? `${evs.filter(e => dd(e.date).getMonth() === d.getMonth() && dd(e.date).getFullYear() === d.getFullYear()).length} rendez-vous ce mois` : `${evs.filter(e => dd(e.date).getFullYear() === d.getFullYear()).length} rendez-vous cette année`
  const isNow = v === "j" || v === "e" ? cur === TODAY : v === "s" ? wkD.includes(TODAY) : v === "m" ? cur.slice(0, 7) === TODAY.slice(0, 7) : cur.slice(0, 4) === TODAY.slice(0, 4)
  const onEv = (e: Ev) => modal({ kind: "ev", data: e }), onSlot = (dt: string, h: number) => modal({ kind: "rdv", data: { date: dt, start: h } })
  const dayList = evs.filter(e => e.date === cur).sort((a, b) => a.start - b.start)
  const hot = (e: Ev) => e.date === TODAY && e.start <= NOW && NOW < e.start + e.dur
  const ERow = (e: Ev, i: number) => <Row key={e.id} first={i === 0} label={e.name} onClick={() => modal({ kind: "ev", data: e })} lead={<span className="flex h-10 w-12 shrink-0 flex-col items-center justify-center rounded-[12px]" style={{ background: "rgba(255,255,255,.07)" }}><span className="text-[13px] font-semibold leading-none">{hh(e.start)}</span><span className="mt-1 text-[10px] leading-none opacity-60">{durF(e.dur)}</span></span>} t={e.name} s={e.topic} r={hot(e) ? <StatusText>En cours</StatusText> : <TBtn I={Phone} solid label={`Appeler ${e.name}`} href={`tel:${tel(e.name)}`} />} />
  const seg = <div role="tablist" aria-label="Vue du calendrier" data-cal-tabs className="flex h-9 w-full rounded-full bg-white/[.07] p-[3px]">{([["j", "Jour"], ["s", "Semaine"], ["m", "Mois"], ["e", "Équipe"], ["a", "Année"]] as [CV, string][]).map(([k, l]) => <button key={k} role="tab" aria-selected={v === k} onClick={() => setV(k)} className={`relative min-w-0 flex-1 rounded-full px-1 text-[12.5px] font-medium leading-none tracking-[-0.01em] transition-colors ${v === k ? "text-black" : "text-white/60 hover:text-white"}`}>{v === k && <motion.span layoutId="cal-seg" transition={spring} className="absolute inset-0 rounded-full bg-white" />}<span className="relative block truncate text-center">{l}</span></button>)}</div>
  const nav = <div className="flex items-center gap-1.5"><button onClick={() => setCur(TODAY)} disabled={isNow} className="h-9 rounded-full bg-white/[.07] px-3.5 text-[13px] font-medium text-white transition hover:bg-white/[.12] disabled:opacity-40">Aujourd'hui</button><button aria-label="Précédent" onClick={() => move(-1)} className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:bg-white/[.07] hover:text-white"><ChevronLeft size={20} strokeWidth={SW} /></button><button aria-label="Suivant" onClick={() => move(1)} className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:bg-white/[.07] hover:text-white"><ChevronRight size={20} strokeWidth={SW} /></button></div>
  const view = v === "a" ? <YearGrid cur={cur} evs={evs} onMonth={f => { setCur(f); setV("m") }} />
    : v === "m" ? <MonthGrid cur={cur} evs={evs} onDay={x => { setCur(x); setV("j") }} />
    : v === "e" ? <Suspense fallback={null}><TeamView date={cur} evs={evs} onEv={onEv} onAssign={(ev: Ev, employeId: string) => { const id = String(ev.id).split("~")[0]; set(x => ({ ...x, events: x.events.map(y => y.id === id ? { ...y, employeId: employeId || undefined } : y) })); toast("Assignation mise à jour") }} onSlot={(emp: string, h: number) => modal({ kind: "rdv", data: { date: cur, start: h, employeId: emp } })} /></Suspense>
    : v === "s" ? (desk ? <TimeGrid days={wkD} evs={evs} onEv={onEv} onSlot={onSlot} /> : <WeekSlider cur={cur} evs={evs} onEv={onEv} onSlot={onSlot} onWeek={setCur} />)
    : <TimeGrid days={[cur]} evs={evs} onEv={onEv} onSlot={onSlot} />
  const strip = v === "j" && <div className="mb-4 grid grid-cols-7 gap-1">{wkD.map(x => { const on = x === cur, td = x === TODAY, n = evs.filter(e => e.date === x).length, we = (dd(x).getDay() + 6) % 7 >= 5
    return <button key={x} onClick={() => setCur(x)} className={`flex flex-col items-center gap-1 rounded-[14px] py-2 transition-colors ${on ? "bg-white/[.08]" : "hover:bg-white/[.04]"} ${we && !on ? "opacity-50" : ""}`}><span className="text-[11px] font-medium uppercase text-white/40">{DAYS[(dd(x).getDay() + 6) % 7].slice(0, 1)}</span><span className={`flex h-8 w-8 items-center justify-center rounded-full text-[15px] ${on || td ? "font-semibold" : "text-white/80"}`} style={on ? { background: td ? c : "#fff", color: td ? "#fff" : "#000" } : td ? { color: c } : {}}>{dd(x).getDate()}</span><span className="h-[4px] w-[4px] rounded-full" style={{ background: n ? c : "transparent" }} /></button> })}</div>
  const todayB = <button onClick={() => setCur(TODAY)} disabled={isNow} className="h-9 shrink-0 rounded-full bg-white/[.07] px-3.5 text-[13px] font-medium text-white transition hover:bg-white/[.12] disabled:opacity-40">Aujourd'hui</button>
  const arrows = <div className="flex shrink-0 items-center"><button aria-label="Précédent" onClick={() => move(-1)} className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:bg-white/[.07] hover:text-white"><ChevronLeft size={20} strokeWidth={SW} /></button><button aria-label="Suivant" onClick={() => move(1)} className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:bg-white/[.07] hover:text-white"><ChevronRight size={20} strokeWidth={SW} /></button></div>
  const head = <div className="mb-4 flex flex-col gap-3" data-cal-head><div className="flex items-center justify-between gap-2"><div className="min-w-0"><div className="truncate text-[17px] font-semibold tracking-[-0.01em]">{title}</div><div className={`truncate ${tx.cap}`}>{subT}</div></div>{desk ? <div className="flex items-center gap-3"><div className="w-[300px]">{seg}</div>{nav}</div> : <div className="flex shrink-0 items-center gap-0.5" data-cal-tools>{todayB}{arrows}</div>}</div>{!desk && <div className="w-full">{seg}</div>}</div>
  return <section className="relative z-0 min-w-0" data-cal-section style={{ transform: "none" }}><div className="mb-3 flex h-6 items-center justify-between px-1"><h2 className={tx.title}>Calendrier</h2></div><div className={`relative z-0 rounded-[24px] bg-[#141416] p-4 ${v === "a" ? "overflow-visible" : ""}`}>{head}{strip}{view}</div></section>
}
/* passe 2 · Agenda mobile fidèle aux maquettes 03-Agenda (Jour / Semaine / Mois / Équipe + filtre salarié) */
function AgM() {
  const { s, modal, q, go } = useC(), g = useAgendaM(), { v, cur } = g
  const from = addDays(v === "m" ? `${cur.slice(0, 7)}-01` : monOf(cur), -7), to = addDays(v === "m" ? `${cur.slice(0, 7)}-28` : monOf(cur), 42)
  const all = attachTravel(expandForGrid(expandRecurring(s.events.filter(e => match(q, e.name, e.topic)), from, to)))
  const evs = all.filter(g.filt)
  const mon = monOf(TODAY), wkN = evs.filter(e => e.date >= mon && e.date <= addDays(mon, 6) && e.kind !== "absence").length
  const a = dd(mon), b = dd(addDays(mon, 4))
  const onEv = (e: Ev) => modal({ kind: "ev", data: e }), onSlot = (d: string, h: number) => modal({ kind: "rdv", data: { date: d, start: h } })
  const pill = <TeamPill sel={g.sel} emps={g.emps} onOpen={() => g.setPick(true)} />
  const body = v === "j" ? <AgDay cur={cur} evs={evs} onEv={onEv} onPick={g.setCur} onMove={n => g.setCur(x => addDays(x, n))} pill={pill} onNew={() => modal({ kind: "rdv", data: { date: cur } })} />
    : v === "s" ? <AgWeek cur={cur} evs={evs} emps={g.emps} onEv={onEv} onSlot={onSlot} onMove={n => g.setCur(x => addDays(x, n))} pill={pill} />
    : v === "m" ? <AgMonth cur={cur} evs={evs} onEv={onEv} onPick={g.setCur} onMove={n => g.setCur(x => addMonth(x, n))} pill={pill} />
    : <AgTeam cur={cur} evs={all} emps={g.sel ? g.emps.filter(e => g.sel!.includes(e.id)) : g.emps} onEv={onEv} />
  return <>
    <Shell k="ag" noHero={v !== "j"} label={`Semaine du ${a.getDate()}${a.getMonth() !== b.getMonth() ? ` ${MONTHS[a.getMonth()]}` : ""} au ${b.getDate()} ${MONTHS[b.getMonth()]}`} fig={wkN} sub={`rendez-vous cette semaine`}
      mcaps={[{ I: Plus, label: "Nouveau rendez-vous", on: () => modal({ kind: "rdv", data: { date: cur } }) }, { I: RotateCcw, label: "Aujourd'hui", on: () => g.setCur(TODAY) }, { I: MoreHorizontal, label: "Réglages", on: () => go("set") }]}
      mid={<Segmented label="Vue de l'agenda" layoutId="ag-seg" value={v} onPick={g.setV} items={[["j", "Jour"], ["s", "Semaine"], ["m", "Mois"], ["e", "Équipe"]]} />} actions={[]}>
      <div data-ag-view={v}>{body}</div>
    </Shell>
    <AnimatePresence>{g.pick && <TeamFilterSheet key="tf" emps={g.emps} sel={g.sel} onClose={() => g.setPick(false)} onDone={x => { g.setSel(x); g.setPick(false) }} />}</AnimatePresence>
  </>
}
function Ag() {
  const { desk } = useC()
  return desk ? <AgD /> : <AgM />
}
function AgD() {
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
  const ERow = (e: Ev, i: number) => { const ad = addrOf(e); return <Row key={e.id} first={i === 0} label={e.name} onClick={() => modal({ kind: "ev", data: e })} lead={<span className={`flex h-10 w-12 shrink-0 flex-col items-center justify-center rounded-[12px] ${hot(e) ? "" : "bg-white/[.07]"}`} style={{ background: "rgba(255,255,255,.07)" }}><span className="text-[13px] font-semibold leading-none">{hh(e.start)}</span><span className="mt-1 text-[10px] leading-none opacity-60">{durF(e.dur)}</span></span>} t={e.name} s={`${e.topic}${ad ? " · " + ad : ""}`} r={<div className="flex items-center gap-2">{hot(e) && <StatusText>En cours</StatusText>}{ad && <TBtn I={MapPin} label={`Itinéraire vers ${e.name}`} href={`https://maps.google.com/?q=${encodeURIComponent(ad)}`} />}<TBtn I={Phone} solid label={`Appeler ${e.name}`} href={`tel:${tel(e.name)}`} /></div>} /> }
  return <Shell k="ag" fig={<Num n={wkE.length} />} sub={`rendez-vous · semaine du ${range}`} actions={[
    { I: Plus, l: "Nouveau", on: () => modal({ kind: "rdv", data: { date: day } }) }, { I: ChevronLeft, l: "Précédente", on: () => goWk(wk - 1) },
    { I: ChevronRight, l: "Suivante", on: () => goWk(wk + 1) }, { I: RotateCcw, l: "Aujourd'hui", on: () => goWk(0), dis: wk === 0 && day === TODAY }]}>
    <Col><Section t={day === TODAY ? "Aujourd'hui" : dlabel(day)} aside={`${list.length} RDV`}>{list.length ? <List>{list.map(ERow)}</List> : <List><Row first label="Ajouter un rendez-vous" onClick={() => modal({ kind: "rdv", data: { date: day } })} lead={<Ic I={Plus} />} t="Journée libre" s="Touchez pour ajouter un rendez-vous" r={<Chev />} /></List>}</Section>
      {!desk && <><AgCal /><Suspense fallback={null}><AgendaTools evs={s.events} day={day} /></Suspense></>}<Section t="À retenir"><List>{next && <Row first label="Prochain rendez-vous" onClick={() => modal({ kind: "ev", data: next })} lead={<Ic I={Clock} />} t="Prochain" s={`${next.name} · ${next.topic}`} r={hh(next.start)} rs={fmtD(next.date)} />}{last && <Row label="Dernier RDV pris" onClick={() => modal({ kind: "ev", data: last })} lead={<Ic I={Sparkles} />} t="Dernier pris" s={`${last.name} · ${last.topic}`} r={hh(last.start)} rs={<StatusText>Confirmé</StatusText>} />}</List></Section></Col>
    <Col><Section t="Semaine" aside={range}><Chart c={c} label="Rendez-vous par jour" value={`${wkE.length} RDV`} v={per} l={days.map(d => DAYS[(dd(d).getDay() + 6) % 7].slice(0, 3))} sel={days.indexOf(day)} onPick={(i: number) => setDay(days[i])} /></Section></Col>
    {desk && <div className="col-span-2"><AgCal /><Suspense fallback={null}><AgendaTools evs={s.events} day={day} /></Suspense></div>}
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
  const stopD = (id: string) => { set(x => ({ ...x, devis: x.devis.map(d => d.id === id ? { ...d, remindersOff: true } : d), rels: x.rels.map(y => y.devisId === id && y.status === "prog" ? { ...y, status: "pause" } : y) })); toast("Relances de ce devis arrêtées") }
  // update44 : une relance manuelle est un rappel pour l'artisan. Akno ne l'envoie pas : on la marque « faite », sans prétendre l'avoir envoyée.
  const sendR = (r: Rel) => { if (r.devisId) { toast(`Cette relance partira automatiquement${r.date ? ` (${r.date})` : ""}.`); return } const snap = s; set(x => ({ ...x, rels: x.rels.map(y => y.id === r.id ? { ...y, status: "env", date: "Faite" } : y), lastRel: { client: r.client, type: r.type, time: "À l'instant", canal: r.canal } })); toast(`Relance marquée comme faite · ${r.client}`, () => set(() => snap)) }
  const QRow = (r: Rel, i: number) => <Row key={r.id} first={i === 0} label={r.client} onClick={() => modal({ kind: "relView", data: r })} lead={<Av n={r.client} />} t={r.client} s={`${r.type} · ${r.canal} · ${r.date}`} r={<div className="flex items-center gap-3">{r.status === "pause" && <Chip c={GREY}>{r.devisId ? "Arrêtées" : "En pause"}</Chip>}{r.devisId && r.status === "prog" ? <TBtn I={Pause} label={`Arrêter les relances pour ${r.client}`} c={c} onClick={() => stopD(r.devisId!)} /> : !r.devisId ? <TBtn I={Check} label={`Marquer comme faite · ${r.client}`} c={c} onClick={() => sendR(r)} /> : null}</div>} />
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
/* update63 · contenu du mode Devis de la page unifiée Devis | Factures (même bot bleu) */

/* update77 · swipe gauche sur une ligne devis / facture */
function askDelDevis(d: Devis, set: (fn: (x: St) => St) => void, toast: (m: string) => void) {
  void devisDeleteReason(d).then(reason => {
    if (reason) { askConfirm({ title: "Ce devis ne peut pas être supprimé", text: reason, onlyOk: true, confirmLabel: "Compris" }); return }
    askConfirm({
      title: "Supprimer ce devis ?",
      text: `Devis n° ${d.num}${d.client ? ` — ${d.client}` : ""}. Cette action est définitive.`,
      confirmLabel: "Supprimer", danger: true,
      onConfirm: () => { set(x => ({ ...x, devis: x.devis.filter(y => y.id !== d.id) })); toast("Devis supprimé") },
    })
  })
}
function askFactureSwipe(f: FactureLite, modal: (m: Modal) => void, toast: (m: string) => void) {
  const act = factureSwipeAction(f)
  if (act === "blocked") {
    askConfirm({ title: "Cet avoir ne peut pas être supprimé", text: "Un avoir émis est une pièce comptable à conserver. Pour le corriger, ouvrez la facture d'origine.", onlyOk: true, confirmLabel: "Compris" })
    return
  }
  if (act === "avoir") {
    askConfirm({
      title: "Créer un avoir pour cette facture ?",
      text: "La facture n'est pas supprimée. Un avoir en brouillon sera créé pour l'annuler ou la corriger.",
      confirmLabel: "Créer un avoir",
      onConfirm: async () => {
        const r = await api("/api/devis", { action: "avoir", facture_id: f.id })
        if (!r.ok || typeof r.facture_id !== "string") { toast(r.error || "Création de l'avoir impossible."); return }
        await refreshFactures()
        modal({ kind: "factures", data: { id: r.facture_id } })
      },
    })
    return
  }
  askConfirm({
    title: "Supprimer ce brouillon ?",
    text: "Ce brouillon n'a pas encore de numéro. Il sera définitivement effacé.",
    confirmLabel: "Supprimer", danger: true,
    onConfirm: async () => {
      const { error } = await supabase.from("factures").delete().eq("id", f.id).is("numero", null)
      if (error) { toast("Suppression impossible."); return }
      await refreshFactures()
      toast("Brouillon supprimé")
    },
  })
}

function useDevisView(active: boolean, onAll?: () => void) {
  const { s, set, modal, q, toast, go } = useC(), c = A.dev.c
  const devisDate = (d: Devis) => d.created || Date.parse(d.at || d.sentAt || d.signedAt || "") || 0
  const ds = [...s.devis].filter(d => match(q, d.client, d.objet, String(d.num))).sort((a, b) => devisDate(b) - devisDate(a) || b.num - a.num)
  const val = s.devis.filter(d => d.status === "val"), sent = s.devis.filter(d => d.status !== "brouillon")
  const now = new Date(), mk = (k: number) => { const d = new Date(now.getFullYear(), now.getMonth() - 5 + k, 1); return [d.getFullYear(), d.getMonth()] }
  const inM = (d: Devis, k: number) => { if (!d.at) return k === 5; const a = new Date(d.at), [y, mo] = mk(k); return a.getFullYear() === y && a.getMonth() === mo }
  const m = Array.from({ length: 6 }, (_, k) => val.filter(d => inM(d, k)).reduce((a, d) => a + d.amount, 0)), cur = m[5], tot = m.reduce((a, b) => a + b, 0), mL = Array.from({ length: 6 }, (_, k) => MO[mk(k)[1]])
  const pend = [...s.devis].sort((a, b) => b.num - a.num).find(d => d.status === "brouillon")
  const openD = (d?: Devis) => { if (d) modal({ kind: "devisPrev", data: d }) }
  const send = () => openD(pend)
  const queued = (d: Devis) => s.rels.some(r => r.status === "prog" && r.type.includes(String(d.num)))
  // update44 : relance réelle (e-mail, + SMS si activés) envoyée par le cron demain 9:00, liée au devis. Sans e-mail ni SMS : rappel « à faire ».
  const relance = (d: Devis) => {
    const auto = !!d.email || (s.settings.sms && !!d.phone)
    const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(9, 0, 0, 0)
    const snap = s
    set(x => ({ ...x, rels: [{ id: uid(), client: d.client, type: `Relance devis N° ${d.num}`, canal: d.email ? (s.settings.sms && d.phone ? "E-mail + SMS" : "E-mail") : auto ? "SMS" : "Appel", status: "prog", date: auto ? "Demain 9:00" : "À faire", ...(auto && isUuidL(d.id) ? { devisId: d.id, scheduledFor: t.toISOString() } : {}) }, ...x.rels] }))
    toast(auto ? `Relance prévue demain 9:00 · ${d.client}` : `Rappel ajouté : appelez ${d.client} (pas d'e-mail sur le devis)`, () => set(() => snap))
  }
  const FRow = (d: Devis, i: number) => <SwipeRow key={d.id} id={d.id} first={i === 0} label="Supprimer" onAction={() => askDelDevis(d, set, toast)}><Row className="!rounded-none" first={i === 0} label={`Ouvrir le devis ${d.num}`} onClick={() => modal({ kind: "devisPrev", data: d })} lead={<Av n={d.client} />} t={d.client} s={`N° ${d.num} · ${eur(d.amount)}`} r={<div className="flex items-center gap-3"><Chip c={ST[d.status][1]}>{ST[d.status][0]}</Chip>{d.status === "brouillon" ? <TBtn I={Send} label={`Envoyer le devis ${d.num}`} c={c} onClick={() => openD(d)} /> : queued(d) ? <TBtn I={Check} label="Relance déjà prévue" dis /> : <TBtn I={Repeat2} label={`Relancer ${d.client}`} c={c} onClick={() => relance(d)} />}</div>} /></SwipeRow>
  const exp = () => { const csv = ["N°;Client;Objet;Statut;Montant HT", ...s.devis.map(d => [d.num, d.client, d.objet, ST[d.status][0], d.amount].join(";"))].join("\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new window.Blob(["\ufeff" + csv], { type: "text/csv" })); a.download = "devis-akno.csv"; a.click(); toast("Export CSV téléchargé") }
  const DRow = (d: Devis, i: number) => <SwipeRow key={d.id} id={"all-" + d.id} first={i === 0} label="Supprimer" onAction={() => askDelDevis(d, set, toast)}><Row className="!rounded-none" first={i === 0} label={`Ouvrir le devis ${d.num}`} onClick={() => modal({ kind: "devisPrev", data: d })} lead={<Av n={d.client} />} t={d.client} s={`N° ${d.num} · ${d.objet}`} r={eur(d.amount)} rs={<Chip c={ST[d.status][1]}>{ST[d.status][0]}</Chip>} /></SwipeRow>
  const todo = ds.filter(d => (d.status === "brouillon" && !d.ai) || d.status === "att" || d.status === "env")
  const aval = ds.filter(toValidate), { desk } = useC()
  /* Pop-up : dernière réponse client (accepté / refusé) — au premier affichage du mode Devis (les brouillons IA ne s'ouvrent plus seuls). */
  const poppedReply = useRef(false)
  useEffect(() => {
    if (!active || poppedReply.current) return
    const reply = [...s.devis].filter(d => d.repliedAt && (d.status === "val" || d.status === "ref")).sort((a, b) => (b.repliedAt || "").localeCompare(a.repliedAt || ""))[0]
    if (!reply) return
    try { if (sessionStorage.getItem("akno-seen-" + reply.id)) return } catch { }
    poppedReply.current = true
    const t = setTimeout(() => modal({ kind: "clientReply", data: reply }), 450)
    return () => clearTimeout(t)
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps
  const VRow = (d: Devis, i: number) => <SwipeRow key={d.id} id={"val-" + d.id} first={i === 0} label="Supprimer" onAction={() => askDelDevis(d, set, toast)}><Row className="!rounded-none" first={i === 0} label={`Regarder le devis ${d.num}`} onClick={() => modal({ kind: "devisPrev", data: d })} lead={<Circ><Blob c={c} s={20} /></Circ>} t={<span className="flex items-center gap-2"><span className="truncate">{d.client}</span></span>} s={`N° ${d.num} · brouillon généré par Akno`} r={eur(d.amount)} rs={<Chip c={c}>Brouillon — à valider</Chip>} /></SwipeRow>
  const replies = ds.filter(d => d.reply || d.status === "sans" || ((d.status === "val" || d.status === "ref") && !!d.repliedAt))
  const replyL = (d: Devis) => d.status === "val" && d.repliedAt ? "Accepté" : d.status === "ref" && d.repliedAt ? "Refusé" : d.status === "sans" ? "Sans réponse" : d.reply ? "Réponse client" : ST[d.status][0]
  const ReplyRow = (d: Devis, i: number) => <SwipeRow key={d.id} id={"rep-" + d.id} first={i === 0} label="Supprimer" onAction={() => askDelDevis(d, set, toast)}><Row className="!rounded-none" first={i === 0} label={`Devis ${d.num}`} onClick={() => modal({ kind: "devisPrev", data: d })} lead={<Av n={d.client} />} t={d.client} s={d.reply || `N° ${d.num} · ${d.objet}`} r={eur(d.amount)} rs={<Chip c={d.status === "val" ? GREEN : d.status === "ref" ? RED : c}>{replyL(d)}</Chip>} /></SwipeRow>
  const avalS = aval.length > 0 && <Section t={<span className="flex items-center gap-2">À valider<span className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[12px] font-semibold text-white" style={{ background: c }}>{aval.length}</span></span>} aside="Devis générés par l'IA"><List>{aval.map(VRow)}</List></Section>
  const replyS = replies.length > 0 && <Section t={<span className="flex items-center gap-2">Réponses clients<span className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[12px] font-semibold text-white" style={{ background: c }}>{replies.length}</span></span>} aside="Acceptation, refus ou message"><List>{replies.map(ReplyRow)}</List></Section>
  const recent = ds.slice(0, 5)
  // passe 2 · maquette facturation-devis : « Validés en <mois> », montant, « n devis signés · n envoyés » ; feuille « Devis récents » + Tout voir
  const sentM = s.devis.filter(d => d.status !== "brouillon" && d.status !== "aval" && inM({ ...d, at: d.sentAt || d.at } as Devis, 5)).length, valM = val.filter(d => inM(d, 5)).length
  const dSt = (d: Devis): [StT, string] => ({ aval: ["blue", "À valider"], brouillon: ["draft", "Brouillon"], att: ["orange", "En attente"], env: ["grey", "Envoyé"], val: ["blue", "Signé"], ref: ["red", "Refusé"], sans: ["orange", "Sans réponse"], perdu: ["grey", "Perdu"] } as Record<DevStatus, [StT, string]>)[d.status] || ["grey", ST[d.status]?.[0] || ""]
  const late5 = (d: Devis) => (d.status === "env" || d.status === "sans") && !!d.sentAt && Date.now() - Date.parse(d.sentAt) > 5 * 864e5
  const MRow = (d: Devis, i: number) => { const [t, l] = dSt(d); return <DocRow key={d.id} first={i === 0} label={`Ouvrir le devis ${d.num}`} name={d.client} red={late5(d)} sub={`${d.objet || "Devis"} · N° ${d.num}`} amount={eurM(d.amount)} st={<StDot t={t}>{l}</StDot>} onClick={() => modal({ kind: "devisPrev", data: d })} /> }
  const mEmpty = <div className="flex h-[68px] items-center px-1 text-[15px] text-[#6E6E73]">Aucun devis pour l'instant.</div>
  return { fig: <Num n={cur} u="€" money />, sub: `validés ce mois · ${val.length} devis sur ${sent.length} envoyés`,
    mlabel: `Validés en ${MO_L[now.getMonth()]}`, mfig: <BigEur n={cur} />, msub: `${valM} devis signé${valM > 1 ? "s" : ""} · ${sentM} envoyé${sentM > 1 ? "s" : ""}`,
    mbody: <section><IH2 first t="Devis récents" more={ds.length > 5 ? () => onAll?.() : undefined} />{recent.length ? recent.map(MRow) : mEmpty}</section>,
    mall: <>{ds.length ? ds.map(MRow) : mEmpty}</>,
    allTitle: "Tous les devis", all: <List empty="Aucun devis pour l'instant.">{ds.map(DRow)}</List>,
    actions: [
      { I: Plus, l: "Nouveau", on: () => modal({ kind: "devis" }) },
      { I: Package, l: "Prestations", on: () => modal({ kind: "prestations" }) },
      { I: Repeat2, l: "Relance", on: () => go("rel") },
    ] as QAi[], body: <>
    <Col><Section t="Devis récents" aside={ds.length ? `${Math.min(5, ds.length)}` : undefined}><List I={Check} empty="Aucun devis pour l'instant.">{recent.map(DRow)}</List></Section>
      <button type="button" data-all-devis onClick={() => onAll?.()} className="mt-3 block w-full text-left">
        <Card className="flex items-center gap-4 p-4 transition-colors hover:bg-white/[.02]">
          <span className="min-w-0 flex-1"><span className="block text-[16px] font-semibold">Tous les devis</span><span className="block text-[13px] text-white/45">{ds.length ? `${ds.length} devis, les plus récents en premier` : "Ouvrir la liste complète"}</span></span>
          <Chev />
        </Card>
      </button>
    </Col>
  </> }
}

/* update52 : accès à la bibliothèque de prestations depuis la page Devis */
function PrestaCard() {
  const { modal } = useC(), lib = usePrestations(), c = A.dev.c
  const cats = [...new Set(lib.items.map(x => x.categorie).filter(Boolean))]
  return <Section t="Mes prestations" aside={lib.ready ? `${lib.items.length}` : undefined}><button type="button" onClick={() => modal({ kind: "prestations" })} className="block w-full text-left"><Card className="flex items-center gap-4 p-4 transition-colors hover:bg-white/[.02]">
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#2C2C2E] text-white/80"><Package size={19} strokeWidth={1.6} /></span>
    <span className="min-w-0 flex-1"><span className="block text-[15px] font-medium">{lib.items.length ? `${lib.items.length} prestation${lib.items.length > 1 ? "s" : ""} prête${lib.items.length > 1 ? "s" : ""} à chiffrer` : "Enregistrez vos prestations"}</span><span className="block truncate text-[13px] text-white/45">{lib.items.length ? cats.slice(0, 3).join(" · ") || "Heures, fournitures et forfaits" : "Heures, taux et prix réutilisables dans chaque devis"}</span></span>
    <Chev /></Card></button></Section>
}

/* ---------------- Paramètres ---------------- */
/* ---------------- update62 · Factures (onglet Factures, segment « Factures ») ---------------- */
const F_LABEL: Record<string, string> = { facture: "Facture", acompte: "Facture d'acompte", situation: "Situation", solde: "Facture de solde", avoir: "Avoir" }
const F_ST: Record<string, [string, string]> = { brouillon: ["Brouillon", GREY], emise: ["Émise", AMBER], envoyee: ["Envoyée", AMBER], payee: ["Payée", GREEN], annulee: ["Annulée", GREY] }
const fLabel = (f: FactureLite) => f.type === "situation" && f.situation_numero ? `Situation n° ${f.situation_numero}` : F_LABEL[f.type] || "Facture"
/* update63 · contenu du mode Factures de la page unifiée */
function useFacturesView(onAll?: () => void) {
  const { modal, toast, go } = useC(), st = useFacturesLite()
  useEffect(() => { void refreshFactures() }, [])
  const rows = st.rows || [], unpaid = rows.filter(isUnpaid), late = unpaid.filter(isLate).length
  const total = unpaid.reduce((a, f) => a + dueOf(f), 0)
  const facDate = (f: FactureLite) => Date.parse(f.date_emission || f.created_at || "") || 0
  const sorted = [...rows].sort((a, b) => facDate(b) - facDate(a))
  const recent = sorted.slice(0, 5)
  const FRow = (f: FactureLite, i: number) => { const [l, c] = isLate(f) ? ["En retard", RED] : F_ST[f.statut] || F_ST.brouillon
    const act = factureSwipeAction(f)
      return <SwipeRow key={f.id} id={f.id} first={i === 0} label={act === "avoir" ? "Avoir" : "Supprimer"} tone={act === "avoir" ? "accent" : "danger"} onAction={() => askFactureSwipe(f, modal, toast)}><Row className="!rounded-none" first={i === 0} label={`Ouvrir ${f.numero || "brouillon"}`} onClick={() => modal({ kind: "factures", data: { id: f.id } })} lead={<Ic I={Receipt} />} t={`${fLabel(f)} ${f.numero || "(brouillon)"}`} s={f.client_nom || "Client à renseigner"} r={e2(f.type === "avoir" ? -dueOf(f) : dueOf(f))} rs={<Chip c={c}>{l}</Chip>} /></SwipeRow> }
  // passe 2 · maquette facturation-factures : « À encaisser » (retards d'abord) puis « Payées en <mois> »
  const td = new Date(), ymdNow = td.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" })
  const lateDays = (f: FactureLite) => f.date_echeance ? Math.round((Date.parse(ymdNow + "T12:00:00Z") - Date.parse(f.date_echeance + "T12:00:00Z")) / 864e5) : 0
  const owed = unpaid.filter(f => f.type !== "avoir" && f.statut !== "brouillon").sort((a, b) => Number(isLate(b)) - Number(isLate(a)) || String(a.date_echeance || "").localeCompare(String(b.date_echeance || "")))
  const drafts = rows.filter(f => f.statut === "brouillon")
  const paidM = rows.filter(f => f.statut === "payee" && (f.payee_le || "").slice(0, 7) === ymdNow.slice(0, 7))
  const fSub = (f: FactureLite) => `${f.objet || fLabel(f)} · ${isLate(f) ? `${lateDays(f)} j de retard` : f.statut === "payee" ? f.numero || "" : f.date_echeance ? `échéance ${frShort(f.date_echeance)}` : f.numero || "brouillon"}`
  const FM = (f: FactureLite, i: number) => <DocRow key={f.id} first={i === 0} label={`Ouvrir ${f.numero || "brouillon"}`} name={f.client_nom || "Client à renseigner"} red={isLate(f)} sub={fSub(f)} amount={eurM(f.type === "avoir" ? -dueOf(f) : f.statut === "payee" ? Number(f.total_ttc || 0) : dueOf(f))}
    st={isLate(f) ? <StDot t="orange">En retard</StDot> : f.statut === "payee" ? <StDot t="grey">Payée</StDot> : f.statut === "brouillon" ? <StDot t="draft">Brouillon</StDot> : <StDot t="grey">À payer</StDot>} onClick={() => modal({ kind: "factures", data: { id: f.id } })} />
  const fEmpty = (t: string) => <div className="flex h-[68px] items-center px-1 text-[15px] text-[#6E6E73]">{t}</div>
  return { fig: <Num n={Math.round(total)} u="€" money />,
    mlabel: "À encaisser", mfig: <BigEur n={total} />, msub: st.rows === null ? "Chargement…" : `${owed.length} facture${owed.length > 1 ? "s" : ""} en attente${late ? ` · ${late} en retard` : ""}`,
    mbody: <>
      <section><IH2 first t="À encaisser" />{owed.length ? owed.map(FM) : fEmpty(st.rows === null ? "Chargement…" : st.error ? "Factures indisponibles pour le moment." : "Rien à encaisser.")}</section>
      {drafts.length > 0 && <section><IH2 t="Brouillons" />{drafts.map(FM)}</section>}
      <section><IH2 t={`Payées en ${MO_L[td.getMonth()]}`} more={sorted.length ? () => onAll?.() : undefined} />{paidM.length ? paidM.map(FM) : fEmpty("Aucun paiement ce mois-ci.")}</section>
    </>,
    mall: <>{sorted.length ? sorted.map(FM) : fEmpty("Aucune facture pour l'instant.")}</>,
    sub: st.rows === null ? "Chargement…" : `à encaisser · ${unpaid.length} facture${unpaid.length > 1 ? "s" : ""}${late ? ` · ${late} en retard` : ""}`,
    allTitle: "Toutes les factures", all: <List empty={st.error ? "Factures indisponibles pour le moment." : "Aucune facture pour l'instant."}>{sorted.map(FRow)}</List>,
    actions: [
      { I: Plus, l: "Nouveau", on: () => modal({ kind: "factures", data: { create: true } }) },
      { I: Package, l: "Prestations", on: () => modal({ kind: "prestations" }) },
      { I: Repeat2, l: "Relance", on: () => go("rel") },
    ] as QAi[], body: <>
    <Col><Section t="Factures récentes" aside={sorted.length ? `${Math.min(5, sorted.length)}` : undefined}><List I={Check} empty={st.error ? "Factures indisponibles pour le moment." : "Aucune facture pour l'instant."}>{recent.map(FRow)}</List></Section>
      <button type="button" data-all-factures onClick={() => onAll?.()} className="mt-3 block w-full text-left">
        <Card className="flex items-center gap-4 p-4 transition-colors hover:bg-white/[.02]">
          <span className="min-w-0 flex-1"><span className="block text-[16px] font-semibold">Toutes les factures</span><span className="block text-[13px] text-white/45">{sorted.length ? `${sorted.length} facture${sorted.length > 1 ? "s" : ""}, les plus récentes en premier` : "Ouvrir la liste complète"}</span></span>
          <Chev />
        </Card>
      </button>
    </Col>
  </> }
}
/* update63 · Page unifiée Devis | Factures : un seul bot bleu, le sélecteur ne change que le contenu dessous */
function DocAllPage({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return <div data-doc-list className="flex min-h-0 flex-1 flex-col">
    <div className="flex h-12 shrink-0 items-center gap-1 px-2">
      <button type="button" data-doc-list-back aria-label="Retour" onClick={onBack} className="flex h-10 w-10 items-center justify-center rounded-full text-white/80 hover:bg-white/[.07]"><ChevronLeft size={22} /></button>
      <h1 className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-[-0.02em]">{title}</h1>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">{children}</div>
  </div>
}
function DevFac() {
  // update69 : le mode change localement au tap (pilule et contenu partent ensemble) ; l'adresse suit juste après l'animation
  const { page, desk } = useC(), shownSlot = useContext(SlotActive), own = shownSlot && (page === "dev" || page === "fac")
  const [mode, setMode] = useState<"dev" | "fac" | "rel">(page === "fac" ? "fac" : "dev")
  const [list, setList] = useState<"dev" | "fac" | null>(null)
  useEffect(() => { if (own) setMode(m => m === "rel" && page === "fac" ? m : page === "fac" ? "fac" : "dev") }, [page, own])
  useEffect(() => { setList(null) }, [mode])
  const dv = useDevisView(own && mode === "dev", () => setList("dev")), fv = useFacturesView(() => setList("fac")), rv = useRelancesView()
  const views = { dev: dv, fac: fv, rel: rv }, v = views[mode], others = (["dev", "fac", "rel"] as const).filter(x => x !== mode).map(x => ({ key: x, actions: views[x].actions, children: views[x].body }))
  useEffect(() => { if (own && mode !== "rel") rememberDocMode(mode) }, [mode, own])
  const reduce = useReducedMotion()
  const curAll = list === "dev" ? dv : fv
  return <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
    <motion.div className="flex min-h-0 min-w-0 flex-1 flex-col" initial={false} animate={!reduce && list ? { x: "-28%", opacity: .85 } : { x: 0, opacity: 1 }} transition={reduce ? { duration: .16 } : PUSH} style={{ pointerEvents: list ? "none" : undefined }}>
      {desk ? <Shell k="dev" label={<><Dot c={mode === "fac" ? "#FF9F0A" : mode === "rel" ? "#FF3B30" : "#007AFF"} />{mode === "dev" ? "Devis" : mode === "fac" ? "À encaisser" : "Relances"}</>} fig={v.fig} sub={v.sub} actions={mode === "rel" ? dv.actions.filter(x => x.I === Plus) : v.actions} mid={<DocSwitch mode={mode} onPick={setMode} />} bodyKey={mode} alts={others}>{v.body}</Shell>
        : <Shell k="dev" label={mode === "rel" ? null : mode === "dev" ? dv.mlabel : fv.mlabel} fig={mode === "dev" ? dv.mfig : mode === "fac" ? fv.mfig : rv.fig} sub={mode === "dev" ? dv.msub : mode === "fac" ? fv.msub : rv.sub} sheetTop={mode === "rel" ? 40 : 52}
          actions={[{ I: Plus, l: mode === "fac" ? "Nouvelle facture" : "Nouveau devis", on: mode === "fac" ? fv.actions[0].on : dv.actions[0].on }]} mid={<DocSwitch mode={mode} onPick={setMode} />} bodyKey={mode} alts={others.map(o => ({ ...o, children: o.key === "dev" ? dv.mbody : o.key === "fac" ? fv.mbody : rv.body }))}>{mode === "dev" ? dv.mbody : mode === "fac" ? fv.mbody : rv.body}</Shell>}
    </motion.div>
    <AnimatePresence>
      {list && <motion.div key="doc-all" data-doc-list-push className={`absolute inset-0 z-20 flex flex-col ${desk ? "bg-black" : "bg-[#fff]"}`} initial={reduce ? { opacity: 0 } : { x: "100%" }} animate={{ x: 0, opacity: 1 }} exit={reduce ? { opacity: 0 } : { x: "100%" }} transition={reduce ? { duration: .16 } : PUSH}>
        {desk ? <DocAllPage title={curAll.allTitle} onBack={() => setList(null)}>{curAll.all}</DocAllPage> : <MListPage title={curAll.allTitle} onBack={() => setList(null)}>{curAll.mall}</MListPage>}
      </motion.div>}
    </AnimatePresence>
  </div>
}
function DocSwitch({ mode, onPick }: { mode: "dev" | "fac" | "rel"; onPick?: (m: "dev" | "fac" | "rel") => void }) {
  const navigate = useNavigate(), { desk } = useC(), timer = useRef(0), relN = useRelancesCounts().total
  useEffect(() => () => clearTimeout(timer.current), [])
  const pick = (id: "dev" | "fac", url: string) => {
    if (!onPick) { navigate(url + location.search, { replace: true }); return }
    onPick(id); clearTimeout(timer.current)
    // l'URL (et le re-rendu de l'app qu'elle entraîne) suit une fois le glissement presque fini, et seulement si on est resté ici
    timer.current = window.setTimeout(() => { const cur = location.pathname.split("/")[1]; if ((cur === "devis" || cur === "factures") && location.pathname !== url) startTransition(() => navigate(url + location.search, { replace: true })) }, 380)
  }
  const items: ["dev" | "fac", string, string][] = [["dev", "Devis", "/devis"], ["fac", "Factures", "/factures"]]
  // Refonte iOS : sélecteur segmenté Devis | Factures | Relances (le nombre de relances dues à côté du libellé)
  if (!desk) return <Segmented label="Devis, factures ou relances" layoutId="akno-doc-seg" value={mode} onPick={m => { if (m === "rel") { onPick?.("rel"); return } pick(m, m === "dev" ? "/devis" : "/factures") }}
    items={[["dev", "Devis"], ["fac", "Factures"], ["rel", <>Relances{relN > 0 && <span className="tabular-nums opacity-60">{relN}</span>}</>]]} />
  // update84 : pastille layoutId sous l'onglet actif (tablist non transformé)
  return <div role="tablist" aria-label="Devis ou factures" className={`relative grid h-11 grid-cols-2 rounded-full bg-white/[.07] p-1 ${desk ? "w-[280px]" : "mx-auto w-full max-w-[340px]"}`}>
    {items.map(([id, l, url]) => { const on = mode === id; return <motion.button key={id} role="tab" aria-selected={on} type="button" whileTap={{ scale: .96 }} onClick={() => { if (!on) pick(id, url) }}
      className={`relative rounded-full text-[15px] font-semibold outline-none transition-colors duration-200 [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-white/40 ${on ? "text-white" : "text-white/55 hover:text-white/80"}`}>
      {on && <motion.span layoutId="akno-doc-pill" aria-hidden data-doc-pill className="absolute inset-0 rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,.10)]" style={{ background: `linear-gradient(180deg, ${A.dev.c}55, ${A.dev.c}33)` }} transition={SNAP} />}
      <span className="relative">{l}</span></motion.button> })}
  </div>
}
/* ---------------- update64 · Chantiers : carte satellite, carrousel, fiche, création (page chargée à la demande) ---------------- */
function ChP() {
  const { s } = useC()
  return <ChantiersPage me={<Me size={30} />} clients={ctInfos(s)} />
}
/* update67 · En-tête des pages hors barre (Équipe, Clients) : le même que les pages principales — logo, mise à jour, assistant, initiales */
function PageHead({ title, to }: { title: string; to: P }) {
  // Refonte iOS : barre de navigation des sous-pages (Clients sous Réception, Équipe sous Agenda) : retour + titre + « … »
  const { go } = useC()
  return <div className="-mx-4 flex h-11 shrink-0 items-center gap-1 px-3">
    <button type="button" aria-label="Retour" onClick={() => go(to)} className="flex h-11 w-11 shrink-0 items-center justify-center text-white [-webkit-tap-highlight-color:transparent]"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[.14]"><ChevronLeft size={22} strokeWidth={2} /></span></button>
    <span className="sr-only">{title}</span><span className="flex-1" />
    <UpdateButton sm />
    <Capsule2 items={[{ I: MoreHorizontal, label: "Réglages", on: () => go("set") }]} />
  </div>
}
/* update66 · Clients (page chargée à la demande) */
function ClP() {
  const { desk } = useC()
  if (!desk) return <div className="flex min-h-0 flex-1 flex-col bg-[#000]"><ClientsPage /></div>
  return <div className="akno-light flex min-h-0 flex-1 flex-col bg-[#fff]"><ClientsPage head={<PageHead title="Clients" to="rec" />} /></div>
}
/* update65 · Équipe (page chargée à la demande) */
function EqP() {
  const { desk } = useC()
  if (!desk) return <div className="flex min-h-0 flex-1 flex-col bg-[#000]"><EquipePage /></div>
  return <div className="akno-light flex min-h-0 flex-1 flex-col bg-[#fff]"><EquipePage head={<PageHead title="Équipe" to="ag" />} /></div>
}
function SetP() {
  const { s, set, desk, toast, modal, go } = useC(), st = s.settings, presta = usePrestations()
  const chS = useChantiers(), equipeN = chS.employes.length // update64 · Réglages → Équipe
  useEffect(() => { if (!chS.ready) void loadChantiers() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const uidL: string = (window as any).__aknoUid || "", lk = hasLock(uidL), [bio, setBio] = useState(() => !!getLock(uidL)?.cred), [canBio, setCanBio] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [nativePushOk, setNativePushOk] = useState(false)
  const [testBusy, setTestBusy] = useState(false)
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [voiceDbg, setVoiceDbg] = useState(isVoiceDebugEnabled)
  const [moreSet, setMoreSet] = useState(false)
  const [testCall, setTestCall] = useState(false) // passe 2 · appel de test déplacé dans Réglages › Réceptionniste IA
  const [factM, setFactM] = useState(0)
  useEffect(() => { if (desk) return; const mo = new Date().toISOString().slice(0, 7); void supabase.from("factures").select("id", { count: "exact", head: true }).gte("date_emission", `${mo}-01`).then(r => setFactM(r.count || 0), () => {}) }, [desk])
  const [voiceLog, setVoiceLog] = useState(() => formatVoiceTimings())
  useEffect(() => { bioAvailable().then(setCanBio) }, [])
  useEffect(() => { if (nativeIosPush()) void nativePushPermission().then(setNativePushOk) }, [])
  useEffect(() => subscribeVoiceTimings(() => setVoiceLog(formatVoiceTimings())), [])
  const bioTg = async () => { if (!lk) { toast("Créez d'abord un code d'accès"); return } if (bio) { disableBio(uidL); setBio(false); toast("Face ID désactivé") } else { try { await enableBio(uidL, (window as any).__aknoEmail || ""); setBio(true); toast("Face ID activé") } catch { toast("Face ID non activé") } } }
  const up = (f: (x: St["settings"]) => St["settings"]) => set(x => ({ ...x, settings: f(x.settings) }))
  const iosHint = !isNative && isIos() && !isStandalone() // update70 : sans objet dans l'app native
  const pushOn = nativeIosPush() ? !!st.push && nativePushOk : !!st.push && typeof Notification !== "undefined" && Notification.permission === "granted"
  const togglePush = async () => {
    if (pushBusy) return
    if (iosHint) { toast("Ajoute Akno à l’écran d’accueil depuis Safari"); return }
    if (pushOn) {
      setPushBusy(true)
      await disablePush()
      up(x => ({ ...x, push: false }))
      if (nativeIosPush()) setNativePushOk(false)
      setPushBusy(false)
      toast("Notifications désactivées")
      return
    }
    setPushBusy(true)
    const res = await enablePush()
    setPushBusy(false)
    if (res.ok) { up(x => ({ ...x, push: true })); if (nativeIosPush()) setNativePushOk(true); toast("Notifications activées"); setTestMsg(null) }
    else { toast(res.error || "Notifications non activées"); setTestMsg({ ok: false, text: res.error || "Notifications non activées." }) }
  }
  const testNotif = async () => {
    if (testBusy) return
    setTestBusy(true); setTestMsg(null)
    const res = await sendTestNotification()
    setTestBusy(false)
    setTestMsg(res.ok
      ? { ok: true, text: "Notification de test envoyée. Vous devriez la voir ici et dans le centre de notifications." }
      : { ok: false, text: res.error || "Le test a échoué." })
  }
  const acc = useAccount(), ent = acc?.entitlements
  const planL = !ent ? "…" : ent.status === "free" ? "Accès ouvert" : ent.status === "trial" ? `Essai · ${Math.max(0, Math.ceil((new Date(ent.trialEndsAt || Date.now()).getTime() - Date.now()) / 864e5))} j` : ent.status === "active" ? (ent.plan === "clients" ? "Clients + Bureau" : "Bureau") + (ent.reception ? " + Récept." : "") : ent.status === "past_due" ? "Paiement en échec" : ent.status === "none" ? (billingHidden ? "Accès non activé" : "Choisir une offre") : (billingHidden ? "Accès non activé" : "Essai terminé")
  const support = (import.meta.env.VITE_SUPPORT_URL as string | undefined) || ((import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) ? `mailto:${import.meta.env.VITE_SUPPORT_EMAIL}` : "")
  const help = () => { if (!support) return; if (isNative && support.startsWith("mailto:")) location.href = support; else window.open(support, "_blank", "noopener") }
  const { p: prof, save: saveProf } = useProfile()
  const acPctS = Math.round(Number(prof?.acompte_pct ?? 30))
  const cycA = async () => { const opts = [30, 40, 50, 20, 0], i = opts.indexOf(acPctS), nx = opts[(i + 1) % opts.length]; const e = await saveProf({ acompte_pct: nx }); toast(e ? "Réglage indisponible : appliquez la migration 20261122_14 (voir LISEZMOI)." : nx ? `Acompte demandé à la signature : ${nx} %` : "Pas d'acompte à la signature") }
  const cycI = async () => { const nx = prof?.relances_auto !== true; const e = await saveProf({ relances_auto: nx }); toast(e ? "Réglage indisponible : appliquez la migration 20261122_14 (voir LISEZMOI)." : nx ? "Relances d'impayés J+3, J+7, J+15 envoyées automatiquement" : "Relances d'impayés à valider avant envoi") }
  const cycR = async () => { const opts = [[3, 7], [2, 5, 10], [7, 14], [3, 7, 15]], cur = JSON.stringify(relDelays(prof?.relance_delais)), i = opts.findIndex(o => JSON.stringify(o) === cur), nx = opts[(i + 1) % opts.length]; const e = await saveProf({ relance_delais: nx }); toast(e || `Relances : ${relDelaysL(nx)}`) }
  const hor = prof?.horaires && typeof prof.horaires === "object" ? Object.values(prof.horaires as Record<string, unknown>).filter(Boolean).length : 0
  const reset = () => { if (confirm("Se déconnecter ?")) supabase.auth.signOut() }
  const TVA = [10, 20, 5.5], DUR = [0.5, 1, 1.5, 2]
  const tva = `${String(st.tva).replace(".", ",")} %`, dur = durF(st.duree)
  const cycT = () => up(x => ({ ...x, tva: TVA[(TVA.indexOf(x.tva) + 1) % TVA.length] })), cycD = () => up(x => ({ ...x, duree: DUR[(DUR.indexOf(x.duree) + 1) % DUR.length] }))
  const tgA = (a: K) => { up(x => ({ ...x, agents: { ...x.agents, [a]: !x.agents[a] } })); toast(`${A[a].n} ${st.agents[a] ? "en pause" : "activé"}`) }
  const V = ({ v }: any) => <span className="flex items-center gap-1 text-[15px] text-white/50">{v}<Chev /></span>
  const S = ({ I, l, v, onClick, first }: any) => <Row first={first} label={l} onClick={onClick} lead={<Ic I={I} />} t={l} r={<V v={v} />} />
  const rr = useRights(), recLock = !rr.reception, cliLock = !rr.clients
  const mine = agents.filter(a => a !== "rec" || !recLock), n = mine.filter(a => st.agents[a]).length
  const moreBody = <div data-more-settings-body className="mt-8 flex flex-col gap-8">
      <Section t="Mes agents"><List>{agents.map((x, i) => x === "rec" && recLock ? <Row key={x} first={i === 0} label={A[x].n} onClick={() => openUpgrade("reception")} lead={<Circ><Blob c={A[x].c} s={20} /></Circ>} t={A[x].n} s="Option non incluse dans votre offre" r={<LockTag>Ajouter</LockTag>} /> : <Row key={x} first={i === 0} label={A[x].n} onClick={() => tgA(x)} lead={<Circ><Blob c={A[x].c} s={20} /></Circ>} t={A[x].n} s={st.agents[x] ? A[x].d : "En pause"} r={<Tg on={st.agents[x]} onClick={() => tgA(x)} label={A[x].n} />} />)}</List></Section>
      <Section t="Gestion"><List><S first I={Users} l="Clients" v="" onClick={() => go("cl")} /><S I={Repeat2} l="Relances" v={relPending(s) ? `${relPending(s)} à venir` : ""} onClick={() => go("rel")} /><S I={Receipt} l="Factures" v="" onClick={() => modal({ kind: "factures" })} /><S I={ShieldCheck} l="Dossier de conformité" v="" onClick={() => modal({ kind: "conformite" })} />{cliLock ? <Row label="Demandes du site" onClick={() => openUpgrade("clients")} lead={<Ic I={Globe} />} t="Demandes du site" r={<LockTag />} /> : <S I={Globe} l="Demandes du site" v="" onClick={() => modal({ kind: "leads" })} />}</List></Section>
      <Section t="Compte"><List>{support && <S first I={LifeBuoy} l="Aide & support" v="" onClick={help} />}<S I={FileSignature} l="Changer le mot de passe" v="" onClick={() => modal({ kind: "pw" })} /><S I={Smartphone} l="Code d'accès" v={lk ? "Activé" : "Créer"} onClick={() => dispatchEvent(new Event("akno-lock-setup"))} /></List></Section>
      {/* update70 · suppression du compte (App Store 5.1.1(v), Google Play) */}
      <Section t="Données"><List><Row first label="Supprimer mon compte" onClick={() => modal({ kind: "deleteAccount" })} lead={<Circ c={RED}><Trash2 size={IS} strokeWidth={SW} /></Circ>} t={<span className="text-[#FF6B6B]">Supprimer mon compte</span>} s="Efface votre compte et vos données" r={<Chev />} /></List></Section>
      <Section t="Diagnostic"><List><Row first label="Latence vocale" onClick={() => { const next = !voiceDbg; setVoiceDebugEnabled(next); setVoiceDbg(next) }} lead={<Ic I={Timer} />} t="Latence vocale" s="Mesures pendant l'appel, pour capture d'écran" r={<Tg on={voiceDbg} onClick={() => { const next = !voiceDbg; setVoiceDebugEnabled(next); setVoiceDbg(next) }} label="Latence vocale" />} /></List>{voiceDbg && <pre className="mt-3 max-h-[240px] overflow-auto rounded-[16px] bg-white/[.06] p-3 font-mono text-[11px] leading-[1.4] text-[#8CE99A] whitespace-pre-wrap">{voiceLog || "Aucun appel mesuré pour l'instant. Passez un appel puis revenez ici."}</pre>}</Section>
      <Section t="Devis"><List><S first I={Repeat2} l="Relances de devis" v={relDelaysL(relDelays(prof?.relance_delais))} onClick={cycR} /><S I={Package} l="Mes prestations" v={presta.ready ? String(presta.items.length) : "…"} onClick={() => modal({ kind: "prestations" })} /></List></Section>
      <Section t="Paiements"><List><S first I={Percent} l="Acompte à la signature" v={`${acPctS} %`} onClick={cycA} /><S I={Repeat2} l="Relances d'impayés" v={prof?.relances_auto === false ? "À valider" : prof?.relances_auto === true ? "Automatiques" : "À valider"} onClick={cycI} />{connectUi() && <S I={CreditCard} l="Paiement en ligne" v="Carte, SEPA" onClick={() => modal({ kind: "connect" })} />}<S I={Receipt} l="Suivi et export comptable" v="CSV, FEC" onClick={() => modal({ kind: "pilotage" })} /></List></Section>
      <Section t="Tarifs"><List><S first I={Banknote} l="Frais et forfaits" v={tarifsSummary(st.tarifs)} onClick={() => modal({ kind: "tarifs" })} /></List></Section>
      <Section t="Agenda"><List><S first I={Timer} l="Durée par défaut" v={dur} onClick={cycD} /><S I={MapPin} l="Zone d'intervention" v={st.tarifs?.zoneKm ? `${st.tarifs.zoneKm} km` : "Non renseignée"} onClick={() => modal({ kind: "tarifs" })} /><S I={CalendarCheck} l="Agenda en ligne (Cal.com)" v={acc?.integrations.calcom ? "Connecté" : "Agenda Akno"} onClick={() => modal({ kind: "agendaCal" })} /><S I={Globe} l="Lien de réservation public" v="À copier depuis l'Agenda" onClick={() => go("ag")} /></List></Section>
      <Section t="Avis clients"><List>{cliLock ? <Row first label="Demandes d'avis Google" onClick={() => openUpgrade("clients")} lead={<Ic I={Sparkles} />} t="Demandes d'avis Google" s="Automatiques après chaque chantier" r={<LockTag />} /> : <S first I={Sparkles} l="Lien d'avis Google" v={st.reviewUrl ? st.reviewUrl.replace(/^https?:\/\//, "").slice(0, 28) : "À renseigner"} onClick={() => modal({ kind: "reviewUrl" })} />}</List></Section>
      <Section t="Informations légales"><List>{[["CGV", "/cgv"], ["Mentions légales", "/mentions-legales"], ["Confidentialité", "/confidentialite"], ["Sous-traitance des données (DPA)", "/dpa"]].map(([l, h], i) => <S key={h} first={!i} I={FileText} l={l} v="" onClick={() => isNative ? location.assign(h) : window.open(h, "_blank", "noopener")} />)}</List></Section>
        </div>
  /* passe 2 · Réglages mobile fidèle à la maquette 08-Reglages (carte profil sombre, sections groupées, « Terminé ») */
  if (!desk) {
    const Ico = ({ I }: { I: any }) => <I size={21} strokeWidth={1.6} className="shrink-0 text-[#1C1C1E]" />
    const R = ({ I, l, sub, v, on, tg, red, first }: { I: any; l: string; sub?: string; v?: ReactNode; on?: () => void; tg?: { on: boolean; set: () => void }; red?: boolean; first?: boolean }) =>
      <div role={on ? "button" : undefined} aria-label={on ? l : undefined} tabIndex={on ? 0 : undefined} onClick={on} onKeyDown={e => { if (on && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); on() } }} className={`relative flex min-h-[52px] items-center gap-4 pl-4 pr-4 ${on ? "cursor-pointer active:bg-black/[.04]" : ""} ${first ? "" : "before:absolute before:left-[54px] before:right-0 before:top-0 before:h-[.5px] before:bg-[rgba(60,60,67,.16)]"}`}>
        {red ? <I size={21} strokeWidth={1.6} className="shrink-0 text-[#E0221B]" /> : <Ico I={I} />}
        <span className="min-w-[96px] flex-1 py-2"><span className={`block truncate text-[17px] leading-[22px] ${red ? "text-[#E0221B]" : "text-[#000]"}`}>{l}</span>{sub && <span className="block truncate text-[13px] leading-[17px] text-[#6E6E73]">{sub}</span>}</span>
        {tg ? <button type="button" role="switch" aria-checked={tg.on} aria-label={l} onClick={e => { e.stopPropagation(); tg.set() }} className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors ${tg.on ? "bg-[#000]" : "bg-[rgba(120,120,128,.16)]"}`}><span className="absolute top-[2px] h-[27px] w-[27px] rounded-full bg-[#fff] shadow-[0_3px_8px_rgba(0,0,0,.15)] transition-[left]" style={{ left: tg.on ? 22 : 2 }} /></button>
          : !red && on ? <span className="flex min-w-0 max-w-[52%] shrink-0 items-center gap-1.5 text-[17px] text-[#6E6E73]"><span className="truncate">{v}</span><ChevronRight size={18} className="text-[#C4C4C7]" /></span> : null}
      </div>
    const G = ({ t, children }: { t: string; children: ReactNode }) => <section><h2 className="px-5 pb-2.5 pt-7 text-[13px] font-semibold uppercase tracking-[.03em] text-[#6E6E73]">{t}</h2><div className="overflow-hidden rounded-[20px] bg-[#F2F2F7]">{children}</div></section>
    const q = ent?.quotas, u = acc?.usage
    const gauge = (l: string, n: ReactNode, unit: string, pct: number) => <div className="min-w-0"><div className="text-[13px] text-[rgba(235,235,245,.6)]">{l}</div><div className="mt-0.5 truncate text-[20px] font-semibold leading-6 text-[#fff]">{n}<span className="ml-1 text-[15px] font-normal text-[rgba(235,235,245,.6)]">{unit}</span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-[rgba(255,255,255,.16)]"><div className="h-full rounded-full bg-[#fff]" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div></div>
    const fin = (x: unknown) => typeof x === "number" && Number.isFinite(x)
    const dOk = fin(q?.devis_drafts) && fin(u?.devis_drafts), vOk = fin(q?.voice_minutes) && fin(u?.voice_minutes)
    const dLeft = dOk ? Math.max(0, q!.devis_drafts - u!.devis_drafts) : null, vLeft = vOk ? Math.max(0, Math.round(q!.voice_minutes - u!.voice_minutes)) : null
    const who = [s.settings.name, s.settings.company].filter(Boolean)
    const card = <button type="button" onClick={() => modal({ kind: "entreprise" })} className="w-full rounded-[28px] bg-[#1C1C1E] px-[18px] pb-[18px] pt-4 text-left shadow-[inset_0_.5px_0_rgba(255,255,255,.08)]">
      <div className="flex items-center gap-3.5"><span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#fff] text-[20px] font-semibold text-[#000]">{meIniS(s)}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-[20px] font-semibold leading-6 text-[#fff]">{who[0] || "Mon entreprise"}</span><span className="block truncate text-[15px] text-[rgba(235,235,245,.6)]">{[s.settings.company && s.settings.company !== who[0] ? s.settings.company : "", String(CO.city || "").replace(/^\d{5}\s*/, "")].filter(Boolean).join(" · ") || "Profil et entreprise"}</span></span>
        <ChevronRight size={20} className="shrink-0 text-[rgba(235,235,245,.45)]" /></div>
      {!billingHidden && <span className="mt-3 inline-flex h-[30px] items-center rounded-full bg-[rgba(255,255,255,.12)] px-3 text-[13px] font-semibold text-[#fff]">{planL}</span>}
      <div className="mt-3.5 grid grid-cols-3 gap-4">
        {gauge("Devis", dLeft ?? s.devis.length, dLeft != null ? "restants" : "au total", dOk ? (dLeft! / Math.max(1, q!.devis_drafts)) * 100 : 60)}
        {gauge("Factures", factM, "ce mois", Math.min(100, factM * 5))}
        {gauge("Appels", vLeft ?? "—", "min", vOk ? (vLeft! / Math.max(1, q!.voice_minutes)) * 100 : 0)}
      </div>
    </button>
    return <>
      <IosPage title="Réglages" caps={[{ I: Check, label: "Terminé", text: "Terminé", on: () => go(lastTab() as P) }]} hero={<div className="w-full">{card}</div>} heroPt={12} sheetTop={22} flush>
        <div className="akno-light px-4 pb-6">
          <G t="Mon entreprise">
            <R first I={ImageIcon} l="Logo" v={prof?.logo_path ? meIniS(s) : "À ajouter"} on={() => modal({ kind: "entreprise" })} />
            <R I={Building2} l="SIREN" v={String(CO.siret || "").replace(/\D/g, "").slice(0, 9).replace(/(\d{3})(?=\d)/g, "$1 ") || "À renseigner"} on={() => modal({ kind: "entreprise" })} />
            <R I={Percent} l="N° de TVA" v={CO.tvaNA ? "Non applicable" : CO.tva || "À renseigner"} on={() => modal({ kind: "entreprise" })} />
            <R I={FileSignature} l="Mentions légales" v={missingLegal("devis").length ? "À compléter" : ""} on={() => modal({ kind: "entreprise" })} />
            <R I={CreditCard} l="Coordonnées bancaires" v={prof?.iban ? "" : "À renseigner"} on={() => modal({ kind: "entreprise" })} />
          </G>
          <G t="Réceptionniste IA">
            {recLock ? <R first I={AudioLines} l="Ajouter la Réceptionniste IA" sub="Décroche, qualifie, prend RDV" on={() => openUpgrade("reception")} />
              : <><R first I={AudioLines} l="Réceptionniste active" sub="Répond sur vos chantiers" tg={{ on: !!st.agents.rec, set: () => tgA("rec") }} />
                <R I={AudioLines} l="Voix" v={s.settings.name ? "" : ""} on={() => modal({ kind: "recReglages" })} />
                <R I={MessageSquare} l="Message d’accueil" on={() => modal({ kind: "recReglages" })} />
                <R I={Clock} l="Horaires d’ouverture" v={hor ? `${hor} jour${hor > 1 ? "s" : ""}` : ""} on={() => modal({ kind: "reception" })} />
                <R I={PhoneCall} l="Appeler ma réceptionniste" sub="Appel de test, depuis l’app" on={() => { primeCallWakeLock(); setTestCall(true) }} /></>}
          </G>
          <G t="Devis et factures">
            <R first I={Percent} l="TVA par défaut" v={tva} on={cycT} />
            <R I={Banknote} l="Acompte à la signature" v={`${acPctS} %`} on={cycA} />
            <R I={Tag} l="Mes prestations" v={presta.ready ? String(presta.items.length) : ""} on={() => modal({ kind: "prestations" })} />
            <R I={RotateCcw} l="Relances automatiques" sub={relDelaysL(relDelays(prof?.relance_delais)).replace(/ et /g, ", ")} tg={{ on: prof?.relances_auto !== false, set: () => void cycI() }} />
          </G>
          <G t="Équipe">
            <R first I={Users} l="Salariés" v={equipeN ? String(equipeN) : ""} on={() => go("eq")} />
            <R I={KeyRound} l="Rôles & accès" on={() => go("eq")} />
          </G>
          <G t="Application">
            <R first I={Bell} l="Notifications" v={pushBusy ? "…" : pushOn ? "Activées" : "Désactivées"} on={() => void togglePush()} />
            {!billingHidden && <R I={CreditCard} l="Abonnement" v={planL} on={() => modal({ kind: "abonnement" })} />}
          </G>
          <G t="Compte">
            <R first I={UserRound} l="Profil" on={() => modal({ kind: "entreprise" })} />
            <R I={ScanFace} l="Sécurité & Face ID" v={canBio ? (bio ? "Activé" : "Désactivé") : ""} on={() => canBio ? void bioTg() : modal({ kind: "pw" })} />
            <R I={Settings} l="Plus de réglages" on={() => setMoreSet(o => !o)} v={moreSet ? "Masquer" : ""} />
            <R I={LogOut} l="Se déconnecter" red on={reset} />
          </G>
          {moreSet && <div className="mt-8">{moreBody}</div>}
          <p data-testid="app-version" className="pt-5 text-center text-[13px] text-[#6E6E73]">Akno {APP_VERSION} · build {APP_BUILD}</p>
        </div>
      </IosPage>
      {testCall && <VoiceCall fallback={{ prenom: s.settings.name, company: s.settings.company, email: s.settings.email, tarifs: s.settings.tarifs, telephoneUrgence: s.settings.urgencePhone }} onDone={msg => { setTestCall(false); try { dispatchEvent(new Event("akno-refresh")) } catch { /* */ } if (msg) toast(msg) }} />}
    </>
  }
  return <Shell lead={<span className={`flex items-center justify-center rounded-full bg-gradient-to-b from-white/[.16] to-white/[.05] font-light tracking-[-0.03em] shadow-[inset_0_1px_0_rgba(255,255,255,.14)] ${desk ? "h-[72px] w-[72px] text-[24px]" : "h-[88px] w-[88px] text-[28px]"}`}>{meIniS(s)}</span>} label={s.settings.company?.trim() && s.settings.company.trim() !== meName(s) ? `${meName(s)} · ${s.settings.company.trim()}` : meName(s)} fig={<Num n={n} u={`/ ${mine.length}`} />} sub={`agents actifs · ${planL}`} actions={[
    { I: Building2, l: "Entreprise", on: () => modal({ kind: "entreprise" }) }, { I: Receipt, l: "Factures", on: () => modal({ kind: "factures" }) }, { I: Clock, l: "Horaires", on: () => recLock ? openUpgrade("reception") : modal({ kind: "reception" }) }, { I: LogOut, l: "Quitter", on: reset }]}>
    <Col>
      <div data-settings-essentials className="contents">
      <Section t="Profil et entreprise"><List><S first I={Building2} l="Profil et entreprise" v={missingLegal("facture").length ? "À compléter" : "Complet"} onClick={() => modal({ kind: "entreprise" })} /><S I={ImageIcon} l="Logo" v={prof?.logo_path ? "Ajouté" : "À ajouter"} onClick={() => modal({ kind: "entreprise" })} /></List></Section>
      {recLock ? <Section t="Réceptionniste"><List><Row first label="Ajouter la Réceptionniste IA" onClick={() => openUpgrade("reception")} lead={<Circ><Blob c={A.rec.c} s={20} /></Circ>} t="Réceptionniste IA" s="Décroche, qualifie, prend RDV et prépare le devis" r={<LockTag>Ajouter</LockTag>} /></List></Section> : <Section t="Réceptionniste"><ReceptionnisteControls className="mb-5" /><List><Row first label="Ma réceptionniste" onClick={() => modal({ kind: "studio" })} lead={<Circ><Blob c={A.rec.c} s={20} /></Circ>} t="Ma réceptionniste" s={`Voix ${voiceInfo(prof?.reception_config?.voice).name} · script, prestations, FAQ`} r={<Chev />} /><S I={Phone} l="Numéro Akno" v={acc?.integrations.twilio_number || "Non attribué"} onClick={() => modal({ kind: "reception" })} /><S I={Phone} l="Numéro d'urgence" v={st.urgencePhone ? formatPhonePairs(st.urgencePhone) : "Non renseigné"} onClick={() => modal({ kind: "urgencePhone" })} /><S I={Clock} l="Horaires" v={hor ? `${hor} j / 7` : "Lun–ven 8 h–18 h"} onClick={() => modal({ kind: "reception" })} /><S I={MessageSquareText} l="Message d'accueil" v={prof?.message_accueil ? "Personnalisé" : "Par défaut"} onClick={() => modal({ kind: "reception" })} /></List></Section>}
      <Section t="Facturation"><List><S first I={Percent} l="TVA par défaut" v={tva} onClick={cycT} /><S I={FileSignature} l="Mentions légales" v={missingLegal("devis").length ? "À compléter" : "OK"} onClick={() => modal({ kind: "entreprise" })} /><S I={CreditCard} l="IBAN" v={prof?.iban ? "Renseigné" : "À renseigner"} onClick={() => modal({ kind: "entreprise" })} /></List></Section>
      <Section t="Équipe et abonnement"><List><S first I={HardHat} l="Équipe" v={equipeN ? `${equipeN} membre${equipeN > 1 ? "s" : ""}` : ""} onClick={() => go("eq")} />{!billingHidden && <S I={CreditCard} l="Abonnement" v={planL} onClick={() => modal({ kind: "abonnement" })} />}</List></Section>
      <Section t="Notifications"><List><Row first label="SMS clients" onClick={() => modal({ kind: "sms" })} lead={<Ic I={Smartphone} />} t="SMS clients" s={acc && !acc.integrations.sms ? "Service SMS non configuré" : "Rappels de RDV, relances, avis"} r={<Tg on={st.sms} onClick={() => up(x => ({ ...x, sms: !x.sms }))} label="SMS" />} />{isNative && !nativeIosPush() ? <Row label="Notifications sur le téléphone" lead={<Ic I={Bell} />} t="Notifications sur le téléphone" s="Pas encore disponibles sur Android. Sur iPhone, utilisez l'app installée depuis l'App Store." /> : <Row label="Notifications" onClick={() => void togglePush()} lead={<Ic I={Bell} />} t="Notifications" s="Appels, devis et réponses" r={<Tg on={pushOn} onClick={() => void togglePush()} label="Notifications" />} />}</List>{(!isNative || nativeIosPush()) && <>{!nativeIosPush() && iosHint && <p className="mt-2 px-1 text-[13px] leading-5 text-white/50">Ajoute Akno à l’écran d’accueil depuis Safari pour activer les notifications iPhone.</p>}{pushOn ? <p data-push-state="on" className="mt-3 px-1 text-[13px] leading-5 text-[#30D158]">Notifications activées sur cet appareil : appels, rendez-vous, devis.</p> : <Btn primary data-push-enable className="mt-3 w-full" disabled={pushBusy} onClick={() => void togglePush()}>{pushBusy ? "Activation…" : "Activer les notifications"}</Btn>}<Btn data-push-test className="mt-2 w-full" disabled={testBusy} onClick={() => void testNotif()}>{testBusy ? "Envoi…" : "Envoyer un test"}</Btn>{testMsg && <p className={`mt-2 px-1 text-[13px] leading-5 ${testMsg.ok ? "text-[#30D158]" : "text-[#FF9B96]"}`}>{testMsg.text}</p>}</>}</Section>
      <Section t="Session"><List>{canBio && <Row first label="Face ID" onClick={bioTg} lead={<Ic I={ScanFace} />} t="Face ID" r={<Tg on={bio} onClick={bioTg} label="Face ID" />} />}<Row first={!canBio} label="Se déconnecter" onClick={reset} lead={<Circ c={RED}><LogOut size={IS} strokeWidth={SW} /></Circ>} t={<span className="text-[#FF6B6B]">Se déconnecter</span>} /></List></Section>
      </div>
    </Col>
    <Col>
      <div data-more-settings className="min-w-0">
        <List><Row first label="Plus de réglages" onClick={() => setMoreSet(o => !o)} lead={<Ic I={Settings} />} t="Plus de réglages" s="Avancé, exports, développeur, légal" r={<span className="text-[13px] text-white/50">{moreSet ? "Masquer" : "Voir"}</span>} /></List>
        {moreSet && moreBody}
        <p data-testid="app-version" className="mt-3 px-1 pb-2 text-center text-[12px] text-white/30">Version {APP_VERSION} (build {APP_BUILD})</p>
      </div>
    </Col>
  </Shell>
}

/* ---------------- Feuilles / formulaires (même système visuel) ---------------- */
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
const LRow = ({ children, onClick, first }: any) => <div onClick={onClick} className={`flex min-h-[48px] items-center gap-3 text-[14px] ${onClick ? "cursor-pointer" : ""} ${first ? "" : "border-t border-white/[.05]"}`}>{children}</div>
const CallPlayer = ({ call, onMic }: { call: Call; onMic: () => void }) => { const p = usePlayer(secs(call.dur), call.recording); if (!call.recording) return null; return <Card className="mb-5 p-4"><Player p={p} c={A.rec.c} onMic={onMic} compact /></Card> }
/* Ligne « à écouter » : un seul enregistrement joue à la fois */
function ListenRow({ x, first, cur, setCur, acts }: { x: Call; first?: boolean; cur: string | null; setCur: (id: string | null) => void; acts?: boolean }) {
  const p = usePlayer(secs(x.dur), x.recording), { modal, set, toast } = useC()
  useEffect(() => { if (cur !== x.id && p.play) p.toggle() }, [cur])
  const pp = { ...p, toggle: () => { if (!p.play) setCur(x.id); p.toggle() } }
  return <div className={`px-5 py-3.5 ${first ? "" : "border-t border-white/[.05]"}`}>
    <div role="button" tabIndex={0} aria-label={`Fiche ${x.name}`} onClick={() => modal({ kind: "client", data: { name: x.name, call: x.id } })} onKeyDown={e => { if (e.key === "Enter") modal({ kind: "client", data: { name: x.name, call: x.id } }) }} className="-mx-2 flex cursor-pointer items-center gap-3 rounded-[14px] px-2 py-1 transition-colors hover:bg-white/[.03]"><Av n={x.name} /><div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2 text-[15px] font-semibold">{x.urgent && <UrgentDot />}<span className="min-w-0 truncate">{x.name}</span></div><div className={`truncate ${tx.cap}`}>{x.tag || x.topic}{x.rappelAt ? ` · ${x.rappelAt}` : ""}{x.time ? ` · ${x.time}` : ""}</div></div>{acts ? <div className="flex shrink-0 items-center gap-2" onClick={e => e.stopPropagation()}><TBtn I={Phone} solid label={`Appeler ${x.name}`} href={`tel:${tel(x.name)}`} onClick={() => { if (x.callback) { set(y => ({ ...y, calls: y.calls.map(z => z.id === x.id ? { ...z, callback: false } : z) })); toast(`${x.name} · marqué rappelé`) } }} /></div> : <StatusText tone={x.callback ? "danger" : "muted"} check={!x.callback}>{x.callback ? "À rappeler" : "Traité"}</StatusText>}</div>
    {acts && <div className={`mt-1 pl-[52px] ${tx.cap}`}>{x.day ? `${x.day} ` : ""}{x.time}</div>}{x.recording ? <div className="mt-2.5 pl-[52px]"><Player p={pp} c={A.rec.c} compact /></div> : null}</div>
}
function CallsList({ todo, rest }: { todo: Call[]; rest: Call[] }) {
  const [cur, setCur] = useState<string | null>(null)
  const G = ({ t, l }: { t: string; l: Call[] }) => l.length ? <><div className="px-0 pb-2 pt-4 text-[12px] font-medium uppercase tracking-[.06em] text-white/40">{t}</div><div className="-mx-5 bg-black/20">{l.map((x, i) => <ListenRow key={x.id} x={x} first={i === 0} cur={cur} setCur={setCur} acts />)}</div></> : null
  return <><G t="À rappeler" l={todo} /><G t="Autres appels" l={rest} /></>
}
function ListenList() {
  const { s } = useC(), [cur, setCur] = useState<string | null>(null)
  const list = s.calls.filter(x => x.recording)
  if (!list.length) return <div className={`py-8 text-center ${tx.cap}`}>Aucun enregistrement à écouter.</div>
  return <div className="-mx-5 bg-black/20">{list.map((x, i) => <ListenRow key={x.id} x={x} first={i === 0} cur={cur} setCur={setCur} />)}</div>
}
/* ---------------- Fiche client ---------------- */
const osm = (c: Client) => { const dx = .006, dy = .0035; return `https://www.openstreetmap.org/export/embed.html?bbox=${c.lon - dx}%2C${c.lat - dy}%2C${c.lon + dx}%2C${c.lat + dy}&layer=mapnik&marker=${c.lat}%2C${c.lon}` }
const digits = (p?: string) => (p || "").replace(/\D/g, "").replace(/^33/, "0")
function linkedCall(s: St, e: Ev): Call | undefined {
  if (e.callId) { const hit = s.calls.find(c => c.id === String(e.callId)); if (hit) return hit }
  const ep = digits(e.phone)
  if (ep.length >= 8) { const hit = s.calls.find(c => digits(c.phone) === ep || digits(PHONES.get(c.name)) === ep); if (hit) return hit }
  return s.calls.find(c => ckey(c.name) === ckey(e.name))
}
const CQA = ({ I, l, href, c, ext, onClick }: any) => {
  const inner = <><span className="flex h-12 w-12 items-center justify-center rounded-full transition active:scale-[.94]" style={c ? { background: c, color: c === "#E6E6E6" || c === "#FFFFFF" || c === "#fff" ? "#000" : "#fff" } : { background: "rgba(255,255,255,.08)" }}><I size={18} strokeWidth={SW} /></span>{l}</>
  const cls = "flex flex-col items-center gap-2 text-[12.5px] text-white/70 hover:text-white"
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{inner}</button>
  return <a href={href} {...(ext ? { target: "_blank", rel: "noreferrer" } : {})} className={cls}>{inner}</a>
}
const KV = ({ I, l, v, href }: any) => { const inner = <><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[.06] text-white/60"><I size={16} strokeWidth={SW} /></span><div className="min-w-0 flex-1"><div className="text-[12px] text-white/40">{l}</div><div className="truncate text-[15px]">{v}</div></div>{href && <Chev />}</>
  return href ? <a href={href} className="flex min-h-[56px] items-center gap-3 border-t border-white/[.05] px-4 first:border-t-0 hover:bg-white/[.03]">{inner}</a> : <div className="flex min-h-[56px] items-center gap-3 border-t border-white/[.05] px-4 first:border-t-0">{inner}</div> }
function ClientSheet({ name, callId, eventId, close }: { name: string; callId?: string; eventId?: string; close: () => void }) {
  const { s, set, modal, setChat, go, desk } = useC(), ev = eventId ? s.events.find(x => x.id === eventId) : undefined
  const [genBusy, setGenBusy] = useState(false), [genErr, setGenErr] = useState("")
  const seed = callId ? s.calls.find(x => x.id === callId) : undefined
  const k = ckey(ev?.name || seed?.name || name), cl = findC(ev?.name || seed?.name || name)
  const nm = cl?.name || ev?.name || seed?.name || name, same = (n: string) => ckey(n) === k
  const linked = ev ? linkedCall(s, ev) : undefined
  const phoneSet = new Set([cl?.phone, ev?.phone, seed?.phone, linked?.phone, ...s.calls.filter(x => same(x.name)).map(x => x.phone)].map(digits).filter(p => p.length >= 8))
  const matchCall = (x: Call) => same(x.name) || (!!seed && x.id === seed.id) || (!!linked && x.id === linked.id) || (digits(x.phone).length >= 8 && phoneSet.has(digits(x.phone)))
  const calls = s.calls.filter(matchCall)
  const call = seed || linked || calls[0]
  const playable = (call?.recording && call) || calls.find(x => x.recording)
  const devis = s.devis.filter(x => same(x.client) || (x.callId && calls.some(c => c.id === x.callId)) || (digits(x.phone).length >= 8 && phoneSet.has(digits(x.phone))))
  let evs = s.events.filter(x => same(x.name) || (ev?.phone && digits(x.phone) === digits(ev.phone))).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)
  if (ev && !evs.some(x => x.id === ev.id)) evs = [ev, ...evs]
  const rels = s.rels.filter(x => same(x.client))
  const existingDv = call ? s.devis.find(d => d.callId === call.id) || devis.find(d => d.callId === call.id) : undefined
  const generateDevis = async () => {
    if (!call || genBusy) return
    if (existingDv) { modal({ kind: "devisPrev", data: existingDv }); return }
    setGenBusy(true); setGenErr("")
    try {
      const res = await draftDevisFromCall(call.id)
      if (!res.ok || !res.devis_id) { setGenErr(res.error || "Impossible de générer le brouillon de devis."); return }
      const drafted: Devis = {
        id: String(res.devis_id),
        num: parseInt(String(res.numero || "").replace(/\D/g, ""), 10) || 0,
        client: nm,
        objet: String(res.objet || call.besoin || call.topic || "Demande de devis"),
        status: (res.statut === "aval" || res.statut === "brouillon" ? String(res.statut) : "brouillon") as DevStatus,
        amount: Number(res.total_ttc ?? res.total_ht ?? 0),
        created: Date.now(),
        ai: true,
        callId: call.id,
        lines: Array.isArray(res.lines) ? res.lines as DevisLine[] : undefined,
      }
      set(x => ({ ...x, devis: x.devis.some(d => d.id === drafted.id) ? x.devis : [drafted, ...x.devis] }))
      try { dispatchEvent(new Event("akno-refresh")) } catch { /* */ }
      modal({ kind: "devisPrev", data: drafted })
    } catch {
      setGenErr("Impossible de générer le brouillon de devis.")
    } finally {
      setGenBusy(false)
    }
  }
  const past = ev ? ev.date < TODAY || (ev.date === TODAY && ev.start + ev.dur <= NOW) : false
  const st: [string, string] = ev ? (past ? ["Passé", GREY] : ["À venir", A.ag.c]) : call ? callSt(call) : devis.some(d => d.status === "att") ? ["Devis en attente", AMBER] : ["Client", GREY]
  // update61 : fiche client complète (coordonnées modifiables, notes, SIREN) — table client_fiches
  const { fiche, available: ficheOk, reload: reloadFiche } = useFiche(nm)
  const rawPhone = call?.phone || seed?.phone || fiche?.telephone || cl?.phone || ev?.phone || tel(name)
  const raw = rawPhone.replace(/ /g, ""), ph = formatPhonePairs(raw) || formatPhonePairs(rawPhone) || rawPhone, addr = fiche?.adresse || call?.addr || cl?.addr || ev?.addr
  const email = call?.email || fiche?.email || cl?.email || devis.find(d => d.email)?.email
  const rdvEv = evs.find(e => call && e.callId === call.id)
  const otherCalls = calls.filter(x => !(x.id === call?.id && playable?.recording))
  const hist = [...calls.map(x => ({ t: `Appel · ${x.tag || x.topic}`, w: `${x.day || "Aujourd'hui"} ${x.time}`, I: Phone, o: 0 + (x.day ? 1 : 0) })),
    ...rels.map(r => ({ t: `${r.type} · ${r.canal}`, w: `${r.date} · ${RS[r.status][0]}`, I: Send, o: 2 })),
    ...devis.map(d => ({ t: `Devis N° ${d.num} · ${eur(d.amount)}`, w: ST[d.status][0], I: Receipt, o: 3 }))].sort((a, b) => a.o - b.o)
  const H = ({ children }: any) => <div className="mb-2 mt-6 px-1 text-[13px] font-medium text-white/45">{children}</div>
  if (!desk) return <MFiche {...{ nm, call, calls, playable, devis, evs, rels, fiche, ficheOk, reloadFiche, raw, ph, addr, email, st, close, seed, linked, cl, ev, existingDv, genBusy, genErr, generateDevis }} />
  return <Sheet title={nm} c={A.rec.c} onClose={close}>
    <div className="-mt-2 flex items-center gap-4"><span className="scale-[1.35] origin-left"><Av n={nm} /></span><div className="ml-3 min-w-0"><div className="truncate text-[20px] font-medium tracking-[-0.02em]">{nm}</div><div className="mt-1 flex flex-wrap items-center gap-2"><Chip c={st[1]}>{st[0]}</Chip>{call?.callback && !/^À rappeler/.test(st[0]) && <Chip c={call.urgent ? RED : AMBER}>À rappeler</Chip>}{call?.wantDevis && <Chip c={A.dev.c}>Devis demandé</Chip>}</div>{call?.callback && call.rappelAt && <div className={`mt-1 ${tx.cap}`}>Rappel souhaité · {call.rappelAt}</div>}</div></div>
    <div className="mt-6 grid grid-cols-4 gap-2"><CQA I={Phone} l="Appeler" href={`tel:${raw}`} c={A.rec.c} /><CQA I={MessageSquareText} l="SMS" href={`sms:${raw}`} />{addr ? <CQA I={MapPin} l="Itinéraire" ext href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`} /> : <span />}<CQA I={Receipt} l="Devis" onClick={() => modal({ kind: "devis", data: { client: nm, objet: ev?.topic || call?.besoin || call?.topic } })} /></div>
    {/* update66 : lien vers la page Clients (fiche complète) ; depuis un appel, création de la fiche avec l'origine « Appel » */}
    <div className="mt-3 flex flex-wrap gap-2">
      {!/^((client )?inconnu\b.*)?$/i.test(nm.trim()) && <button type="button" onClick={() => { close(); requestOpenClient({ key: ficheKey(nm), name: nm, phone: raw }); go("cl") }} className="flex h-9 items-center gap-1 rounded-full bg-white/[.08] px-3.5 text-[13.5px] font-medium text-white/85 active:bg-white/[.12]">Fiche client complète<ChevronRight size={14} /></button>}
      {!fiche && (seed || linked || call) && <button type="button" onClick={() => { close(); requestNewClient({ name: /^((client )?inconnu\b.*)?$/i.test(nm.trim()) || /^[+\d\s.]+$/.test(nm) ? "" : nm, phone: raw, addr: addr || undefined, email: email || undefined, origine: "appel" }); go("cl") }} className="flex h-9 items-center gap-1 rounded-full bg-white px-3.5 text-[13.5px] font-semibold text-black active:opacity-80"><Plus size={14} strokeWidth={2.4} />Ajouter aux clients</button>}
    </div>
    <div className="mt-6 overflow-hidden rounded-[20px] bg-white/[.04]">{raw && <KV I={Phone} l="Téléphone" v={ph} href={`tel:${raw}`} />}{email && <KV I={Mail} l="E-mail" v={email} href={`mailto:${email}`} />}{addr && <KV I={MapPin} l="Adresse" v={addr} />}</div>
    <FicheEditor name={nm} fiche={fiche} available={ficheOk} defaults={{ phone: ph, email, addr }} onSaved={() => { reloadFiche(); void loadClients() }} />
    {cl && <div className="relative mt-3 h-[180px] overflow-hidden rounded-[20px] border border-white/[.06] bg-[#0A0A0B]"><iframe title={`Carte · ${cl.addr}`} src={osm(cl)} loading="lazy" className="h-full w-full border-0 [filter:invert(.92)_hue-rotate(180deg)_saturate(.6)_brightness(.9)]" /><span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/70 px-2.5 py-1 text-[11px] text-white/60 backdrop-blur">Position approximative</span></div>}
    {ev && <><H>Rendez-vous</H><div className="rounded-[20px] bg-white/[.04] p-4"><div className="flex items-center justify-between gap-2"><div className="truncate text-[15px] font-medium">{ev.topic}</div><Chip c={past ? GREY : A.ag.c}>{past ? "Passé" : "À venir"}</Chip></div><div className={`mt-1 ${tx.cap}`}>{fmtD(ev.date)} · {hh(ev.start)} – {hh(ev.start + ev.dur)}</div>{(ev.notes || ev.addr) && <p className="mt-1.5 text-[14px] leading-relaxed text-white/60">{[ev.notes, ev.addr].filter(Boolean).join(" · ")}</p>}</div></>}
    {call && <><H>Dernier appel</H><div className="rounded-[20px] bg-white/[.04] p-4"><div className="flex items-center justify-between gap-2"><div className="truncate text-[15px] font-medium">{call.besoin || call.topic}</div><span className={tx.cap}>{call.day ? "hier " : ""}{call.time}</span></div>{call.callback && <div className="mt-2"><Chip c={call.urgent ? RED : AMBER}>À rappeler{call.rappelAt ? ` · ${call.rappelAt}` : ""}</Chip></div>}{call.wantDevis && <div className="mt-2"><Chip c={A.dev.c}>Devis demandé</Chip></div>}<p className="mt-1.5 text-[14px] leading-relaxed text-white/60">{call.note || call.besoin}</p>{rdvEv && <div className="mt-3 rounded-[14px] bg-white/[.05] px-3 py-2.5 text-[13.5px] text-white/75">RDV · {fmtD(rdvEv.date)} {hh(rdvEv.start)} — {rdvEv.topic}</div>}{playable && <div className="mt-3"><CallInline call={playable} onMic={() => { close(); setChat(true) }} /></div>}<Btn className="mt-3 w-full" disabled={genBusy} onClick={() => void generateDevis()}><Receipt size={15} strokeWidth={1.5} />{genBusy ? "Génération…" : existingDv ? "Voir le devis" : "Générer un devis"}</Btn>{genErr && <div className="mt-2 text-[13px] text-[#FF9B96]">{genErr}</div>}</div></>}
    {(devis.length > 0 || evs.length > 0) && <><H>Devis et rendez-vous</H><div className="overflow-hidden rounded-[20px] bg-white/[.04]">
      {devis.map((d, i) => <Row key={d.id} first={i === 0} label={`Devis ${d.num}`} onClick={() => modal({ kind: "devisPrev", data: d })} lead={<Ic I={Receipt} />} t={`Devis N° ${d.num}`} s={d.objet} r={eur(d.amount)} rs={<Chip c={ST[d.status][1]}>{ST[d.status][0]}</Chip>} />)}
      {evs.map((e, i) => <Row key={e.id} first={!devis.length && i === 0} label={`RDV ${e.topic}`} onClick={() => modal({ kind: "ev", data: e })} lead={<Ic I={CalendarDays} />} t={e.topic} s={`${fmtD(e.date)} · ${hh(e.start)} – ${hh(e.start + e.dur)}`} r={<Chev />} />)}</div></>}
    <ClientFactures name={nm} onOpen={id => modal({ kind: "factures", data: { id } })} />
    <Suspense fallback={null}><ClientChantiers name={nm} onOpen={(id: string) => { close(); requestOpenChantier(id); go("ch") }} /></Suspense>
    {otherCalls.length > 0 && <><H>Autres appels ({otherCalls.length})</H><div className="space-y-2">{otherCalls.map(c => <div key={c.id} className="rounded-[20px] bg-white/[.04] p-4"><div className="flex items-center justify-between gap-2"><div className="truncate text-[14.5px] font-medium">{c.besoin || c.topic}</div><span className={`shrink-0 ${tx.cap}`}>{c.day || "Aujourd'hui"} {c.time}{c.dur ? ` · ${c.dur}` : ""}</span></div>{c.note && <p className="mt-1 line-clamp-3 text-[13.5px] leading-relaxed text-white/55">{c.note}</p>}{c.recording && <div className="mt-2.5"><CallInline call={c} onMic={() => { close(); setChat(true) }} /></div>}</div>)}</div></>}
    {hist.length > 0 && <><H>Historique</H><div className="relative pl-2">{hist.map((h, i) => <div key={i} className="relative flex gap-3 pb-4 last:pb-0">{i < hist.length - 1 && <span className="absolute left-[15px] top-8 bottom-0 w-px bg-white/[.08]" />}<span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[.06] text-white/60"><h.I size={14} strokeWidth={SW} /></span><div className="min-w-0 pt-1"><div className="truncate text-[14px]">{h.t}</div><div className={tx.cap}>{h.w}</div></div></div>)}</div></>}
  </Sheet>
}
/* passe 2 · fiche contact (issue d'un appel, sombre) / fiche client (feuille blanche) — maquettes 01-Reception/fiche-contact, 02-Contacts/fiche-client */
function MFiche({ nm, call, calls, playable, devis, evs, rels, fiche, ficheOk, reloadFiche, raw, ph, addr, email, st, close, seed, linked, cl, ev, existingDv, genBusy, genErr, generateDevis }: any) {
  const { modal, setChat, go } = useC(), chs = useChantiers(), facts = useClientFactures(nm)
  useEffect(() => { if (!chs.ready) void loadChantiers() }, [chs.ready])
  const [tab, setTab] = useState<"det" | "hist">("det"), [edit, setEdit] = useState(0)
  const known = !!fiche || !!cl, dark = !!seed && !known
  const myCh = chantiersOfClient(chs.rows, nm).sort((a, b) => (b.start_date || "").localeCompare(a.start_date || ""))
  const chCur = myCh.find(c => effectiveStatus(c) === "in_progress") || myCh.find(c => effectiveStatus(c) === "upcoming") || myCh[0]
  const unknownName = /^((client )?inconnu\b.*)?$/i.test(String(nm).trim())
  const onDevis = () => call ? void generateDevis() : modal({ kind: "devis", data: { client: nm, objet: ev?.topic || call?.besoin || call?.topic } })
  const acts: FAct[] = [{ I: Phone, l: "Appeler", href: raw ? `tel:${raw}` : undefined, dis: !raw }, { I: MessageSquareText, l: "SMS", href: raw ? `sms:${raw}` : undefined, dis: !raw },
    { I: Navigation, l: "Itinéraire", href: addr ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}` : undefined, ext: true, dis: !addr }, { I: FileText, l: genBusy ? "…" : "Devis", on: onDevis }]
  const status = call?.callback ? <span className="font-medium text-[#FF6961]">À rappeler{call.urgent ? " · urgent" : call.rappelAt ? ` · ${call.rappelAt}` : ""}</span>
    : chCur ? <span className="text-[rgba(235,235,245,.78)]"><i aria-hidden className="mr-1.5 inline-block h-[7px] w-[7px] rounded-full align-middle" style={{ background: effectiveStatus(chCur) === "in_progress" ? "#30D158" : effectiveStatus(chCur) === "upcoming" ? "#0A84FF" : "#8E8E93" }} />{STATUS_LABEL[effectiveStatus(chCur)] === "En cours" ? "Chantier en cours" : STATUS_LABEL[effectiveStatus(chCur)] === "À venir" ? "Chantier à venir" : "Chantier terminé"} · {chCur.title}</span>
    : <span className="text-[rgba(235,235,245,.78)]">{st[0]}</span>
  const avatar = <span className="flex h-24 w-24 items-center justify-center rounded-full text-[36px] font-semibold tracking-[-0.01em] text-[#fff]" style={dark ? { background: "linear-gradient(180deg,rgba(255,255,255,.2),rgba(255,255,255,.07))", border: ".5px solid rgba(255,255,255,.35)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.45),0 10px 30px rgba(0,0,0,.5)" } : { background: "linear-gradient(180deg,#A2A2A7,#7C7C81)", boxShadow: "0 0 0 1px rgba(255,255,255,.16)" }}>{initials(nm)}</span>
  const when = (x: Call) => `${x.day || "Aujourd'hui"}, ${x.time}${x.dur ? ` · ${x.dur}` : ""}`
  const addClient = () => { close(); requestNewClient({ name: unknownName || /^[+\d\s.]+$/.test(nm) ? "" : nm, phone: raw, addr: addr || undefined, email: email || undefined, origine: "appel" }); go("cl") }
  const today = new Date().toISOString().slice(0, 10)
  const fLate = (f: CFact) => f.type !== "avoir" && (f.statut === "emise" || f.statut === "envoyee") && !!f.date_echeance && f.date_echeance < today
  const dvSt = (d: Devis) => d.status === "val" ? <StDot t="blue">Signé</StDot> : d.status === "ref" ? <StDot t="red">Refusé</StDot> : d.status === "brouillon" || d.status === "aval" ? <StDot t="draft">Brouillon</StDot> : <StDot t="grey">{ST[d.status][0]}</StDot>
  const hist = [...calls.map((x: Call) => ({ t: `Appel · ${x.tag || x.topic}`, w: when(x), hot: false })), ...evs.map((e: Ev) => ({ t: `RDV · ${e.topic}`, w: `${fmtD(e.date)} · ${hh(e.start)}` })),
    ...rels.map((r: any) => ({ t: `${r.type} · ${r.canal}`, w: `${r.date} · ${RS[r.status as keyof typeof RS][0]}` })), ...devis.map((d: Devis) => ({ t: `Devis N° ${d.num} · ${eur(d.amount)}`, w: ST[d.status][0] })),
    ...(facts || []).map(f => ({ t: `Facture ${f.numero || "(brouillon)"} · ${e2(Number(f.total_ttc))}`, w: f.date_emission ? new Date(f.date_emission + "T12:00:00").toLocaleDateString("fr-FR") : "Non émise" }))].map((h, i) => ({ ...h, hot: i === 0 }))
  const editor = edit > 0 && <div className={dark ? "" : "akno-light"}><FicheEditor key={edit} startEdit name={nm} fiche={fiche} available={ficheOk} defaults={{ phone: ph, email, addr }} onSaved={() => { reloadFiche(); void loadClients(); setEdit(0) }} onCancel={() => setEdit(0)} /></div>
  const player = playable && <div className="mt-3"><CallInline call={playable} onMic={() => { close(); setChat(true) }} /></div>
  const notes = fiche?.notes || ""
  const histV = hist.length ? <Timeline dark={dark} items={hist} /> : <p className={`text-[15px] ${dark ? "text-[#8E8E93]" : "text-[#6E6E73]"}`}>Aucun historique pour l'instant.</p>
  return <PushLayer dark={dark} onClose={close} label={`Fiche de ${nm}`}>
    <FicheShell dark={dark} name={nm} status={status} avatar={avatar} acts={acts} tab={tab} onTab={setTab} onBack={close} onEdit={() => { setTab("det"); if (known) { close(); requestEditClient(nm); go("cl") } else setEdit(x => x + 1) }}>
      {genErr && <div className="mb-3 text-[13px] text-[#FF6961]">{genErr}</div>}
      {editor ? editor : tab === "hist" ? <div className={dark ? "" : "pt-5"}>{histV}</div> : dark ? <>
        {call && <DBlk className="px-5 pb-[18px] pt-4"><div className="text-[13px] leading-4 text-[#8E8E93]">Dernier appel</div><div className="mt-1 text-[17px] font-semibold leading-[22px] text-[#fff]">{when(call)}</div>{(call.note || call.besoin) && <p className="mt-2 text-[15px] leading-[21px] text-[#C7C7CC]">{call.note || call.besoin}</p>}{player}</DBlk>}
        <DBlk>{[raw && ["Téléphone", ph, `tel:${raw}`], email && ["E-mail", email, `mailto:${email}`], addr && ["Adresse", addr, `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`]].filter(Boolean).map((r: any, i) => <DRow key={r[0]} first={i === 0} l={r[0]} v={r[1]} href={r[2]} />)}</DBlk>
        <DBlk className="px-5 pb-[18px] pt-4"><div className="text-[13px] leading-4 text-[#8E8E93]">Notes</div><p className={`mt-1.5 whitespace-pre-line text-[15px] leading-[21px] ${notes ? "text-[#C7C7CC]" : "text-[#8E8E93]"}`}>{notes || "Aucune note. Code d'accès, préférences, matériel…"}</p></DBlk>
        {(seed || linked || call) && !unknownName && <DBlk><button type="button" onClick={addClient} className="flex h-14 w-full items-center px-5 text-left text-[17px] font-semibold text-[#fff]">Ajouter aux clients</button></DBlk>}
        {(seed || linked || call) && unknownName && <DBlk><button type="button" onClick={addClient} className="flex h-14 w-full items-center px-5 text-left text-[17px] font-semibold text-[#fff]">Ajouter aux clients</button></DBlk>}
      </> : <>
        <LSec first t="Coordonnées" />
        <LCard>{raw && <MKV first k="Téléphone" v={ph} href={`tel:${raw}`} />}{email && <MKV first={!raw} k="E-mail" v={email} href={`mailto:${email}`} />}{addr && <MKV first={!raw && !email} k="Adresse" v={String(addr).replace(/,\s*(\d{5})/, "\n$1")} />}{!raw && !email && !addr && <div className="px-[18px] py-4 text-[15px] text-[#6E6E73]">Aucune coordonnée. Touchez Modifier.</div>}</LCard>
        {myCh.length > 0 && <><LSec t={myCh.length > 1 ? "Chantiers" : "Chantier"} /><LCard>{myCh.map((c, i) => { const es = effectiveStatus(c), pct = progressPct(c); return <button key={c.id} type="button" onClick={() => { close(); requestOpenChantier(c.id); go("ch") }} className={`relative flex h-[84px] w-full items-center px-4 text-left ${i ? "before:absolute before:left-4 before:right-0 before:top-0 before:h-[.5px] before:bg-[rgba(60,60,67,.16)]" : ""}`}>
          <span className="mr-3 h-14 w-14 shrink-0 overflow-hidden rounded-[14px] bg-[#E5E5EA] shadow-[0_0_0_.5px_rgba(0,0,0,.08)]">{c.lat != null && c.lng != null && <SatThumb lat={c.lat} lng={c.lng} size={56} color={STATUS_COLOR[es]} />}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-[17px] font-medium leading-[22px] text-[#000]">{c.title}</span><span className="block truncate text-[14px] leading-[19px] text-[#6E6E73]"><b className="font-semibold" style={{ color: es === "in_progress" ? "#248A3D" : es === "upcoming" ? "#0071E3" : "#6E6E73" }}>● {STATUS_LABEL[es]}</b> · {rangeLabel(c)}</span><span className="mt-2 block h-1 overflow-hidden rounded-sm bg-[rgba(60,60,67,.16)]"><i className="block h-full rounded-sm bg-[#000]" style={{ width: `${pct}%` }} /></span></span>
        </button> })}</LCard></>}
        {(devis.length > 0 || (facts && facts.length > 0)) && <><LSec t="Devis et factures" /><LCard>
          {devis.map((d: Devis, i: number) => <DocLine key={d.id} first={i === 0} I={FileText} t={`Devis N° ${d.num}`} s={d.objet} am={eurM(d.amount)} st={dvSt(d)} on={() => modal({ kind: "devisPrev", data: d })} />)}
          {(facts || []).map((f, i) => <DocLine key={f.id} first={!devis.length && i === 0} I={FileText} t={`Facture ${f.numero || "(brouillon)"}`} s={[f.objet, f.date_echeance && `échéance ${frShort(f.date_echeance)}`].filter(Boolean).join(" · ") || (f.date_emission ? frShort(f.date_emission) : "Non émise")} am={eurM(Number(f.total_ttc))} st={fLate(f) ? <StDot t="orange">En retard</StDot> : f.statut === "payee" ? <StDot t="grey">Payée</StDot> : f.statut === "brouillon" ? <StDot t="draft">Brouillon</StDot> : <StDot t="grey">À payer</StDot>} on={() => modal({ kind: "factures", data: { id: f.id } })} />)}
        </LCard></>}
        {calls.length > 0 && <><LSec t="Appels" /><LCard>{calls.map((c: Call, i: number) => <CallLine key={c.id} first={i === 0} t={c.besoin || c.topic || "Appel"} m={`${c.day || "Aujourd'hui"}, ${c.time}`} s={c.note}>{c.recording && <div className="mt-2.5"><CallInline call={c} onMic={() => { close(); setChat(true) }} /></div>}</CallLine>)}</LCard></>}
        <LSec t="Notes" /><LCard className="px-[18px] py-4"><p className={`whitespace-pre-line text-[17px] leading-[23px] ${notes ? "text-[#000]" : "text-[#6E6E73]"}`}>{notes || "Aucune note. Code d'accès, préférences, matériel…"}</p></LCard>
      </>}
    </FicheShell>
  </PushLayer>
}
const CallInline = ({ call, onMic }: { call: Call; onMic: () => void }) => { const p = usePlayer(secs(call.dur), call.recording); if (!call.recording) return null; return <Player p={p} c={A.rec.c} onMic={onMic} /> }
const relDelays = (raw: unknown) => { const a = Array.isArray(raw) ? [...new Set(raw.map(Number).filter(n => n >= 1 && n <= 60))].sort((x, y) => x - y).slice(0, 3) : []; return a.length ? a : [3, 7] }
const relDelaysL = (a: number[]) => a.map(n => `J+${n}`).join(", ").replace(/, (J\+\d+)$/, " et $1")
function DevisPrevSheet({ initial, onClose }: { initial: Devis; onClose: () => void }) {
  const { s, set, toast, modal, desk, go } = useC()
  const prof = useProfile().p, delays = relDelays(prof?.relance_delais)
  const [factBusy, setFactBusy] = useState(false)
  const toFacture = async (type: "facture" | "acompte" | "situation", given?: number) => {
    if (!isUuidL(String(dv.id))) { toast("Enregistrez d'abord le devis"); return }
    const pct = given
    if ((type === "acompte" || type === "situation") && !(Number(pct) > 0 && Number(pct) <= 100)) { toast("Pourcentage invalide (entre 1 et 100)"); return }
    setFactBusy(true)
    const { createFactureFromDevis } = await import("./sheets/FacturesSheet")
    const r = await createFactureFromDevis(String(dv.id), type, pct)
    setFactBusy(false)
    if (!r.ok || typeof r.facture_id !== "string") { toast(r.error || "Création impossible"); return }
    onClose(); modal({ kind: "factures", data: { id: r.facture_id } })
  }
  const dv = s.devis.find(x => x.id === initial.id) || initial
  const tv = s.settings.tva
  const cl = findC(dv.client)
  const draft = dv.status === "aval" || dv.status === "brouillon" || dv.status === "att"
  const [email, setEmail] = useState(dv.email || cl?.email || "")
  const [busy, setBusy] = useState(false)
  const [mailErr, setMailErr] = useState("")
  const lines: DevisLine[] = dv.lines?.length ? dv.lines : [{ l: dv.objet, q: 1, pu: dv.amount, u: "u", tv }]
  const ht = lines.reduce((a, x) => a + Number(x.q) * Number(x.pu), 0)
  const tax = CO.tvaNA ? 0 : lines.reduce((a, x) => a + Number(x.q) * Number(x.pu) * (Number(x.tv ?? tv) / 100), 0)
  const doc = buildDoc({ ...dv, lines }, cl, tv, TODAY)
  // update61 : preuve de signature électronique (signature tracée, horodatage, empreinte, journal)
  const [signed, setSigned] = useState<import("../lib/devisPdf").SignProof | null>(null)
  useEffect(() => {
    if (dv.status !== "val" || !isUuidL(String(dv.id))) { setSigned(null); return }
    let on = true
    void (async () => {
      const { data } = await supabase.from("devis").select("*").eq("id", String(dv.id)).maybeSingle()
      const r = data as { signe_le?: string; accepte_nom?: string; accepte_ip?: string; accepte_ua?: string; signature_png?: string; document_hash?: string; certifie_tva_reduite?: boolean } | null
      if (!on || !r?.signe_le) return
      const { data: ev } = await supabase.from("signature_events").select("event, at, ip, ua, event_hash, prev_hash, document_hash").eq("devis_id", String(dv.id)).order("id")
      if (on) setSigned({ nom: r.accepte_nom || "", at: r.signe_le, ip: r.accepte_ip, ua: r.accepte_ua, png: r.signature_png, hash: r.document_hash || "", certifTva: r.certifie_tva_reduite, events: (ev || []) as never })
    })()
    return () => { on = false }
  }, [dv.id, dv.status])
  const download = () => import("../lib/devisPdf").then(x => { x.downloadPdf(doc, signed || undefined); toast(`Devis-${dv.num}${signed ? "-signe" : ""}.pdf téléchargé`) })
  const send = async () => {
    const to = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { setMailErr("Indiquez l'e-mail du client pour l'envoi."); return }
    setBusy(true); setMailErr("")
    try {
      const { makePdf } = await import("../lib/devisPdf")
      const b64 = makePdf(doc).output("datauristring").split(",")[1] || ""
      const res = await sendDevisEmail({ devisId: String(dv.id), pdfBase64: b64, filename: `Devis-${dv.num}.pdf`, email: to })
      if (!res.ok) { setMailErr(res.error || "Impossible d'envoyer le devis."); setBusy(false); return }
      set(x => ({ ...x, devis: x.devis.map(y => y.id === dv.id ? { ...y, status: "env", email: to, sentAt: new Date().toISOString() } : y) }))
      toast(`Devis ${dv.num} envoyé à ${to}`)
      onClose()
    } catch { setMailErr("Impossible d'envoyer le devis."); setBusy(false) }
  }
  const when = (iso?: string) => iso ? new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : ""
  const stopRem = () => { set(x => ({ ...x, devis: x.devis.map(y => y.id === dv.id ? { ...y, remindersOff: true } : y), rels: x.rels.map(r => r.devisId === dv.id && r.status === "prog" ? { ...r, status: "pause" } : r) })); toast("Relances de ce devis arrêtées") }
  // update71 · chaîne devis → acompte → chantier → facture → paiement : frise + une seule prochaine étape
  const acPct = Math.min(100, Math.max(0, Number((prof as { acompte_pct?: number } | null)?.acompte_pct ?? 30)))
  const ch = useChain(String(dv.id), !draft)
  const cp = chainProgress({ status: dv.status, sentAt: dv.sentAt, openedAt: dv.openedAt, factures: ch.factures, chantier: ch.chantier, acomptePct: acPct })
  const [phone, setPhone] = useState(dv.phone || cl?.phone || "")
  const [sit, setSit] = useState<number | null>(null), [more, setMore] = useState(false)
  const openF = (id?: string) => { if (!id) return; onClose(); modal({ kind: "factures", data: { id } }) }
  const sendSms = async () => {
    const ph = phone.trim()
    if (!looksPhone(ph)) { setMailErr("Indiquez le numéro de portable du client (ex. 06 12 34 56 78)."); return }
    setBusy(true); setMailErr("")
    const r = await sendDevisSms(String(dv.id), ph)
    setBusy(false)
    if (!r.ok) { setMailErr(r.error || "Le SMS n'a pas pu partir."); return }
    set(x => ({ ...x, devis: x.devis.map(y => y.id === dv.id ? { ...y, status: "env", phone: ph, sentAt: new Date().toISOString() } : y) }))
    toast(`Devis ${dv.num} envoyé par SMS au ${ph}`); onClose()
  }
  const sendAny = () => { if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) void send(); else if (looksPhone(phone)) void sendSms(); else setMailErr("Indiquez l'e-mail ou le portable du client.") }
  const nx = cp.next
  const act = () => {
    if (nx.key === "send") return sendAny()
    if (nx.key === "acompte_create") return void toFacture("acompte", acPct)
    if (nx.key === "facture_create") return void toFacture("facture")
    if (nx.factureId) return openF(nx.factureId)
  }
  const avenant = () => { onClose(); setTimeout(() => modal({ kind: "devisEditor", data: undefined, prefill: { client: dv.client, email: dv.email, phone: dv.phone, addr: dv.addr, objet: `Avenant au devis n° ${dv.num}`, parentId: String(dv.id) } } as never), 0) }
  const tone = nx.key === "refused" || nx.key === "lost" ? "warn" : nx.key === "done" ? "ok" : undefined
  const [signOn, setSignOn] = useState(false) // passe 2 · signature sur place
  const signEl = signOn && dv.token ? <SignSheet dv={dv} acPct={acPct} onClose={() => setSignOn(false)} onPdf={download}
    onSigned={(at, nom) => set(x => ({ ...x, devis: x.devis.map(y => y.id === dv.id ? { ...y, status: "val", signedAt: at, repliedAt: at, reply: y.reply } : y) }))}
    onConvert={() => { setSignOn(false); void toFacture("facture") }}
    chantier={ch.chantier ? { title: String((ch.chantier as { title?: string }).title || dv.objet), sub: `${String((ch.chantier as { title?: string }).title || dv.objet)} · À venir`, open: () => { onClose(); requestOpenChantier(String((ch.chantier as { id?: string }).id || "")); go("ch") } } : null} /> : null
  const footer = draft
    ? <Btn primary c={A.dev.c} className="w-full" disabled={busy} onClick={sendAny} data-next-action><Send size={16} />{busy ? "Envoi…" : "Envoyer au client"}</Btn>
    : nx.verb && nx.key !== "send" ? <Btn primary c={A.dev.c} className="w-full" disabled={factBusy} onClick={act} data-next-action>{factBusy ? "Un instant…" : nx.verb}</Btn>
    : <Btn className="w-full" onClick={onClose}>Fermer</Btn>
  return <Sheet title={`Devis N° ${dv.num}`} sub={draft ? "Brouillon — rien n'est encore envoyé" : ST[dv.status][0]} c={A.dev.c} onClose={onClose} footer={footer}>
    <Frise done={cp.done} current={cp.current} sub={cp.sub} c={A.dev.c} />
    <NextCard c={A.dev.c} title={nx.title} text={nx.text} tone={tone}>
      {nx.key === "facture_create" && <div className="mt-3 flex flex-wrap gap-2">
        {sit == null ? <Btn className="flex-1" onClick={() => setSit(50)}>Facturer une partie (situation)</Btn>
          : <div className="flex w-full flex-wrap items-center gap-2"><label className="flex min-w-0 flex-1 items-center gap-2 text-[15px] text-white/80">Avancement<input type="number" inputMode="decimal" min={1} max={100} value={sit} onChange={e => setSit(Number(e.target.value))} className="h-11 w-[84px] rounded-[12px] bg-white/[.08] px-2 text-center text-[16px] text-white outline-none" aria-label="Avancement en %" />%</label><Btn primary c={A.dev.c} disabled={factBusy} onClick={() => toFacture("situation", Number(sit))}>Créer la situation</Btn></div>}
      </div>}
      {nx.key === "acompte_create" && <div className="mt-3"><Btn className="w-full" disabled={factBusy} onClick={() => toFacture("facture")}>Facturer directement, sans acompte</Btn></div>}
    </NextCard>
    {!draft && (dv.status === "val" || dv.status === "ref" || dv.status === "sans" || dv.reply) && <div className="mb-4 rounded-[16px] bg-white/[.04] px-4 py-3 text-[14px] text-white/80">
      {dv.status === "val" && dv.repliedAt && <div>{signed ? `Signé électroniquement par ${signed.nom} le ${when(signed.at)}.` : `Accepté par le client le ${when(dv.repliedAt)}.`}</div>}
      {signed && <div className="mt-1 break-all text-[11.5px] text-white/40">Empreinte SHA-256 : {signed.hash} · {signed.events?.length || 0} entrée{(signed.events?.length || 0) > 1 ? "s" : ""} au journal de preuve</div>}
      {dv.status === "ref" && dv.repliedAt && <div>Refusé par le client le {when(dv.repliedAt)}.</div>}
      {dv.status === "sans" && <div>Sans réponse après les relances automatiques.</div>}
      {dv.reply && <div className={`${dv.repliedAt || dv.status === "sans" ? "mt-2" : ""} text-white/70`}>« {dv.reply} »</div>}
    </div>}
    {dv.status === "env" && <div className="mb-4 flex items-center justify-between gap-3 rounded-[16px] bg-white/[.04] px-4 py-3 text-[14px] text-white/75">
      <span className="min-w-0">{dv.remindersOff ? "Relances automatiques arrêtées." : `Relances automatiques à ${relDelaysL(delays)}, puis « perdu » après 30 jours.`}</span>
      {!dv.remindersOff && <button type="button" className="shrink-0 text-[14px] font-medium text-white" onClick={stopRem}>Arrêter</button>}
    </div>}
    {draft && <div className="mb-4 space-y-3 rounded-[20px] bg-white/[.04] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><div className={tx.cap}>Total TTC</div><div className="mt-1 text-[24px] font-semibold tabular-nums tracking-[-0.02em]">{e2(Math.round((ht + tax) * 100) / 100)}</div></div>
        <Btn c={A.dev.c} onClick={() => { onClose(); modal({ kind: "devisEditor", data: dv }) }}><FilePen size={16} strokeWidth={1.6} />Modifier</Btn></div>
      <F l="E-mail du client"><input className={inp} type="email" inputMode="email" autoCapitalize="off" value={email} placeholder="client@example.fr" onChange={e => { setEmail(e.target.value); setMailErr("") }} /></F>
      <F l="Ou son portable (envoi par SMS)"><input className={inp} type="tel" inputMode="tel" value={phone} placeholder="06 12 34 56 78" onChange={e => { setPhone(e.target.value); setMailErr("") }} /></F>
      {/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && looksPhone(phone) && <Btn className="w-full" disabled={busy} onClick={sendSms}><MessageSquare size={16} />Envoyer plutôt par SMS</Btn>}
    </div>}
    {draft && missingLegal("devis").length > 0 && <button type="button" onClick={() => modal({ kind: "entreprise" })} className="mb-3 block w-full rounded-[14px] border border-[#FFB340]/30 bg-[#FFB340]/10 px-4 py-3 text-left text-[14px] text-white/80">Mentions obligatoires manquantes : {missingLegal("devis").join(", ")}. <span className="font-medium text-white">Compléter</span></button>}
    {mailErr && <div role="alert" className="mb-3 rounded-[14px] bg-[#FF453A]/12 px-4 py-3 text-[14px] text-[#FF9B96]">{mailErr}</div>}
    {desk ? <Suspense fallback={null}><DevisPaper d={doc} sig={signed || undefined} /></Suspense>
      : <LinesCard lines={lines as never} tv={tv} tvaNA={CO.tvaNA} head={<div className="min-w-0"><div className="text-[13px] text-white/50">Devis n° {dv.num} · {dv.client || "Client"}</div><div className="mt-0.5 break-words text-[16px] font-medium leading-snug">{dv.objet}</div></div>} />}
    <div className="mt-3 grid grid-cols-1 gap-2"><Btn className="w-full" onClick={download}><FileText size={16} strokeWidth={1.6} />{signed ? "Voir le PDF signé" : "Voir le PDF"}</Btn>
      {dv.token && (dv.status === "env" || dv.status === "att") && <Btn primary className="w-full" onClick={() => setSignOn(true)} data-sign-onsite><FilePen size={16} strokeWidth={1.6} />Faire signer sur place</Btn>}
      {dv.token && !draft && <Btn className="w-full" onClick={() => { navigator.clipboard.writeText(`${webOrigin()}/accept/${dv.token}`); toast("Lien de signature copié") }}><Copy size={16} />Copier le lien de signature</Btn>}
      {dv.status === "val" && <Btn className="w-full" onClick={() => setMore(m => !m)} aria-expanded={more}>{more ? "Moins d'options" : "Autres actions"}</Btn>}
      {dv.status === "val" && more && <>
        <Btn className="w-full" onClick={avenant}><FilePen size={16} strokeWidth={1.6} />Faire un avenant (travaux en plus)</Btn>
        {cp.next.key !== "acompte_create" && !ch.factures.some(f => f.type === "acompte") && <Btn className="w-full" disabled={factBusy} onClick={() => toFacture("acompte", acPct)}>Demander un acompte de {acPct} %</Btn>}
        {cp.next.key !== "facture_create" && <Btn className="w-full" disabled={factBusy} onClick={() => setSit(s => s ?? 50)}>Facture de situation</Btn>}
        {sit != null && cp.next.key !== "facture_create" && <div className="flex flex-wrap items-center gap-2"><label className="flex min-w-0 flex-1 items-center gap-2 text-[15px] text-white/80">Avancement<input type="number" inputMode="decimal" min={1} max={100} value={sit} onChange={e => setSit(Number(e.target.value))} className="h-11 w-[84px] rounded-[12px] bg-white/[.08] px-2 text-center text-[16px] text-white outline-none" aria-label="Avancement en %" />%</label><Btn primary c={A.dev.c} disabled={factBusy} onClick={() => toFacture("situation", Number(sit))}>Créer</Btn></div>}
        {ch.factures.filter(f => f.numero || f.statut === "brouillon").map(f => <button key={f.id} type="button" onClick={() => openF(f.id)} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-[14px] bg-white/[.04] px-4 text-left text-[15px]"><span className="min-w-0 truncate">{f.type === "acompte" ? "Acompte" : f.type === "avoir" ? "Avoir" : f.type === "situation" ? "Situation" : "Facture"} {f.numero || "(brouillon)"}</span><span className="shrink-0 tabular-nums text-white/60">{e2(Number(f.total_ttc))}</span></button>)}
      </>}
    </div>
    {dv.ai && <div className="mt-3 flex items-center gap-2 px-1 text-[13px] text-white/45"><Sparkles size={13} strokeWidth={1.5} style={{ color: A.dev.c }} />Généré par Akno depuis l'appel {dv.from ? `d'${dv.from}` : "du client"}</div>}
    {signEl}
  </Sheet>
}
function numField(s: string) {
  const t = s.trim().replace(",", ".")
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
function TarifsSheet({ close }: { close: () => void }) {
  const { s, set, toast } = useC()
  const init = mergeTarifs(s.settings.tarifs)
  const [deplacement, setDeplacement] = useState(init.deplacement == null ? "" : String(init.deplacement))
  const [diagnostic, setDiagnostic] = useState(init.diagnostic == null ? "" : String(init.diagnostic))
  const [tauxHoraire, setTauxHoraire] = useState(init.tauxHoraire == null ? "" : String(init.tauxHoraire))
  const [devisGratuit, setDevisGratuit] = useState(init.devisGratuit ?? true)
  const [majorationUrgence, setMajorationUrgence] = useState(init.majorationUrgence == null ? "" : String(init.majorationUrgence))
  const [majorationWeekend, setMajorationWeekend] = useState(init.majorationWeekend == null ? "" : String(init.majorationWeekend))
  const [zoneKm, setZoneKm] = useState(init.zoneKm == null ? "" : String(init.zoneKm))
  const [entretienChaudiere, setEntretienChaudiere] = useState(init.entretienChaudiere == null ? "" : String(init.entretienChaudiere))
  const save = () => {
    set(x => ({
      ...x,
      settings: {
        ...x.settings,
        tarifs: mergeTarifs({
          deplacement: numField(deplacement),
          diagnostic: numField(diagnostic),
          tauxHoraire: numField(tauxHoraire),
          devisGratuit,
          majorationUrgence: numField(majorationUrgence),
          majorationWeekend: numField(majorationWeekend),
          zoneKm: numField(zoneKm),
          entretienChaudiere: numField(entretienChaudiere),
        }),
      },
    }))
    toast("Tarifs enregistrés")
    close()
  }
  return <Sheet title="Tarifs" sub="Frais fixes cités par la réceptionniste" c={A.dev.c} onClose={close}>
    <div className="space-y-3">
      <F l="Frais de déplacement (€)"><input className={inp} inputMode="decimal" value={deplacement} placeholder="49" onChange={e => setDeplacement(e.target.value)} /></F>
      <F l="Frais de diagnostic (€)"><input className={inp} inputMode="decimal" value={diagnostic} placeholder="Sur place" onChange={e => setDiagnostic(e.target.value)} /></F>
      <F l="Taux horaire (€)"><input className={inp} inputMode="decimal" value={tauxHoraire} placeholder="Non communiqué" onChange={e => setTauxHoraire(e.target.value)} /></F>
      <div className="flex items-center gap-3 px-1 text-[15px]"><Tg on={devisGratuit} onClick={() => setDevisGratuit(!devisGratuit)} label="Devis gratuit" />Devis gratuit</div>
      <F l="Majoration urgence (%)"><input className={inp} inputMode="decimal" value={majorationUrgence} placeholder="50" onChange={e => setMajorationUrgence(e.target.value)} /></F>
      <F l="Majoration week-end (%)"><input className={inp} inputMode="decimal" value={majorationWeekend} placeholder="Non communiquée" onChange={e => setMajorationWeekend(e.target.value)} /></F>
      <F l="Zone d'intervention (km)"><input className={inp} inputMode="decimal" value={zoneKm} placeholder="30" onChange={e => setZoneKm(e.target.value)} /></F>
      <F l="Entretien chaudière (€)"><input className={inp} inputMode="decimal" value={entretienChaudiere} placeholder="Non communiqué" onChange={e => setEntretienChaudiere(e.target.value)} /></F>
    </div>
    <p className={`mt-3 ${tx.cap}`}>La réceptionniste peut citer ces frais fixes. Elle ne chiffre jamais les travaux. Un champ vide reste « à confirmer » ; les valeurs 49 €, devis gratuit et +50 % d'urgence sont alors indiquées comme indicatives.</p>
    <Btn primary className="mt-6 w-full" onClick={save}>Enregistrer</Btn>
  </Sheet>
}
function UrgencePhoneSheet({ close }: { close: () => void }) {
  const { s, set, toast } = useC()
  const [v, setV] = useState(formatPhonePairs(s.settings.urgencePhone) || "")
  const [err, setErr] = useState("")
  const save = () => {
    const d = digitsFr(v)
    if (v.trim() && d.length < 10) { setErr("Indiquez un numéro français à 10 chiffres, ou laissez vide."); return }
    set(x => ({ ...x, settings: { ...x.settings, urgencePhone: d || undefined } }))
    toast(d ? "Numéro d'urgence enregistré" : "Numéro d'urgence retiré")
    close()
  }
  return <Sheet title="Numéro d'urgence" sub="Dicté uniquement en cas d'urgence" c={A.rec.c} onClose={close}>
    <F l="Numéro"><input className={inp} inputMode="tel" value={v} onChange={e => { setV(e.target.value); setErr("") }} placeholder="07 81 99 07 61" /></F>
    {err && <p className="mt-2 text-[13px] text-[#FF9B96]">{err}</p>}
    <p className={`mt-3 ${tx.cap}`}>En urgence, la réceptionniste demande d'abord si le client peut noter le numéro, attend la réponse, puis le dicte lentement par paires. Laissez vide pour ne pas le communiquer : elle prendra alors un rappel urgent.</p>
    <Btn primary className="mt-6 w-full" onClick={save}>Enregistrer</Btn>
  </Sheet>
}
function ReviewUrlSheet({ close }: { close: () => void }) {
  const { s, set, toast } = useC()
  const [url, setUrl] = useState(s.settings.reviewUrl || "")
  return <Sheet title="Lien d'avis Google" sub="Envoyé le lendemain d'un rendez-vous" c={A.rel.c} onClose={close}>
    <F l="URL de la page d'avis"><input className={inp} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://g.page/r/…/review" /></F>
    <p className={`mt-3 ${tx.cap}`}>Le lien de VOTRE fiche Google (Google Business Profile → « Demander des avis »). Un seul message par rendez-vous, par e-mail (ou SMS si activés). Sans lien, aucune demande d'avis ne part.</p>
    <Btn primary className="mt-6 w-full" onClick={() => { set(x => ({ ...x, settings: { ...x.settings, reviewUrl: url.trim() } })); toast(url.trim() ? "Lien d'avis enregistré" : "Lien d'avis retiré : aucune demande d'avis ne partira"); close() }}>Enregistrer</Btn>
  </Sheet>
}
function Forms({ m, close }: { m: NonNullable<Modal>; close: () => void }) {
  const { s, set, toast, go, modal, setChat, desk } = useC(), d = m.data || {}, rr = useRights(), { employes } = useChantiers()
  const clients = [...new Set([...s.calls.map(x => x.name), ...s.devis.map(x => x.client), ...s.rels.map(x => x.client)])]
  const [f, setF] = useState<any>(() => ({ name: d.name || d.client || "", topic: d.topic || d.objet || "", addr: d.addr || "", date: d.date || TODAY, start: hh(d.start ?? 9).padStart(5, "0"), dur: String(s.settings.duree), amount: d.amount ?? "", note: "", urgent: false, callback: true, type: "Relance devis", canal: "Appel", when: "Demain 9:00", kind: d.kind || "rdv", employeId: d.employeId || "", rrule: d.rrule || "", absenceKind: d.absenceKind || "conges" }))
  const v = (k: string) => ({ value: f[k], onChange: (e: any) => setF({ ...f, [k]: e.target.value }) })
  const toH = (t: string) => { const [a, b] = t.split(":").map(Number); return a + (b || 0) / 60 }
  const foot = (label: string, ok: boolean, run: () => void, c?: string, hint = "Indiquez le nom du client pour continuer") => <div className={`sticky bottom-0 z-10 mt-6 bg-[#121214] pt-3 ${desk ? "-mx-6 px-6" : "-mx-5 px-5"}`}><datalist id="akno-clients">{clients.map(x => <option key={x} value={x} />)}</datalist><div className="flex gap-2"><Btn className="flex-1" onClick={close}>Annuler</Btn><Btn primary c={c} className="flex-[1.4]" disabled={!ok} onClick={() => { run(); close() }}>{label}</Btn></div><p aria-live="polite" className={`h-5 pt-2 text-center text-[12px] text-white/50 transition-opacity ${ok ? "opacity-0" : "opacity-100"}`}>{ok ? "" : hint}</p></div>
  const relUpd = (id: string, st: Rel["status"], msg: string, date?: string) => { set(x => { const r = x.rels.find(y => y.id === id)!; return { ...x, rels: x.rels.map(y => y.id === id ? { ...y, status: st, date: date || y.date } : y), lastRel: st === "env" ? { client: r.client, type: r.type, time: "À l'instant", canal: r.canal } : x.lastRel } }); toast(msg) }
  if (m.kind === "call") return <Sheet title="Nouvelle note d'appel" c={A.rec.c} onClose={close}><div className="space-y-3"><F l="Client"><input autoFocus list="akno-clients" autoComplete="off" placeholder="Nom du client" className={inp} {...v("name")} /></F><F l="Objet"><input className={inp} {...v("topic")} placeholder="Fuite, devis, dépannage…" /></F><F l="Note"><textarea className={inp + " h-24 py-2.5"} {...v("note")} /></F>
    <div className="flex items-center gap-3 px-1 text-[15px]"><Tg on={f.urgent} onClick={() => setF({ ...f, urgent: !f.urgent })} label="Urgent" />Urgent</div><div className="flex items-center gap-3 px-1 text-[15px]"><Tg on={f.callback} onClick={() => setF({ ...f, callback: !f.callback })} label="À rappeler" />À rappeler</div></div>
    {foot("Enregistrer", !!f.name.trim(), () => { const now = new Date(); set(x => ({ ...x, calls: [{ id: uid(), name: f.name.trim(), topic: f.topic || "Appel", tag: f.topic || "Appel", note: f.note || "Note ajoutée manuellement.", urgent: f.urgent, callback: f.callback, time: `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`, dur: "0:00" }, ...x.calls] })); toast("Note d'appel ajoutée") })}</Sheet>
  if (m.kind === "client") return <ClientSheet name={d.name} callId={d.call} eventId={d.event} close={close} />
  if (m.kind === "callView") { const x = s.calls.find(y => y.id === d.id) || d as Call
    return <Sheet title={x.name} sub={`${x.time} · ${x.topic}`} c={A.rec.c} onClose={close}><CallPlayer call={x} onMic={() => { close(); setChat(true) }} /><div className="text-[15px] leading-relaxed text-white/70">{x.note}</div>{x.addr && <div className="mt-3"><Sub>{x.addr}</Sub></div>}<div className="mt-3"><Sub dot={x.callback ? (x.urgent ? "#FF5F57" : "#FFB340") : "#30D158"}>{x.callback ? (x.urgent ? "À rappeler · urgent" : "À rappeler") : "Traité"}</Sub>{x.callback && x.rappelAt && <div className={`mt-2 ${tx.cap}`}>Moment souhaité · {x.rappelAt}</div>}</div>
      <div className="mt-6 grid gap-2">{x.callback && <Btn primary onClick={() => { set(y => ({ ...y, calls: y.calls.map(z => z.id === x.id ? { ...z, callback: false } : z) })); toast("Marqué comme rappelé"); close() }}><Check size={15} />Marquer rappelé</Btn>}<div className="grid grid-cols-2 gap-2"><Btn onClick={() => modal({ kind: "devis", data: { client: x.name, objet: x.besoin || x.topic } })}><Receipt size={15} strokeWidth={1.5} />Créer un devis</Btn><Btn onClick={() => modal({ kind: "rdv", data: { name: x.name, topic: x.tag || x.topic, addr: x.addr } })}><CalendarDays size={15} strokeWidth={1.5} />Prendre RDV</Btn></div></div></Sheet> }
  if (m.kind === "rdv") return <Sheet title="Nouveau rendez-vous" c={A.ag.c} onClose={close}><div className="space-y-3" data-rdv-form><F l="Client"><input autoFocus list="akno-clients" autoComplete="off" placeholder="Nom du client" className={inp} {...v("name")} /></F><F l="Objet"><input className={inp} {...v("topic")} /></F><F l="Date"><input type="date" className={dt} {...v("date")} /></F><div className="grid grid-cols-2 gap-2"><F l="Heure"><input type="time" step={900} className={dt} {...v("start")} /></F><F l="Durée"><select className={dt + " sel"} {...v("dur")}>{DUR_OPTS.map(([val, lab]) => <option key={val} value={val}>{lab}</option>)}{DUR_OPTS.some(([val]) => val === String(f.dur)) ? null : <option value={f.dur}>{f.dur} h</option>}</select></F></div><F l="Adresse"><input className={inp} {...v("addr")} /></F>
      <F l="Type"><select className={dt + " sel"} {...v("kind")} data-rdv-kind><option value="rdv">RDV</option><option value="visite">Visite technique</option><option value="chantier">Chantier</option><option value="sav">SAV</option><option value="urgence">Urgence</option><option value="absence">Absence</option></select></F>
      {f.kind === "absence" && <F l="Motif"><select className={dt + " sel"} {...v("absenceKind")}><option value="conges">Congés</option><option value="maladie">Maladie</option><option value="formation">Formation</option></select></F>}
      <F l="Assigné à"><select className={dt + " sel"} {...v("employeId")} data-rdv-employe><option value="">Non assigné</option>{employes.map(e => <option key={e.id} value={e.id}>{e.first_name}{e.last_name ? ` ${e.last_name}` : ""}</option>)}</select></F>
      <F l="Récurrence"><select className={dt + " sel"} {...v("rrule")} data-rdv-rrule><option value="">Aucune</option><option value="FREQ=WEEKLY">Toutes les semaines</option><option value="FREQ=MONTHLY">Tous les mois</option><option value="FREQ=YEARLY">Tous les ans</option></select></F>
    </div>
    {foot("Créer le RDV", !!f.name.trim() && !!f.date, () => { set(x => ({ ...x, events: [...x.events, { id: uid(), date: f.date, start: toH(f.start), dur: Number(f.dur), name: f.name.trim(), topic: f.topic || "Intervention", addr: f.addr, created: Date.now(), kind: f.kind || "rdv", employeId: f.employeId || undefined, rrule: f.rrule || undefined, absenceKind: f.kind === "absence" ? f.absenceKind : undefined }] })); const wd = dd(f.date).getDay(); toast(wd === 0 || wd === 6 ? "RDV créé (week-end : visible sur mobile)" : "RDV créé"); go("ag") }, A.ag.c)}</Sheet>
  if (m.kind === "ev") { const raw = s.events.find(y => y.id === d.id || y.id === String(d.id || "").split("~")[0]) || d as Ev; const e = raw
    return <Suspense fallback={null}><EventSheet e={e} all={s.events} onClose={close} onChange={(p: Partial<Ev>) => set(x => ({ ...x, events: x.events.map(y => y.id === e.id ? { ...y, ...p } : y) }))}
      onOpenClient={() => modal({ kind: "client", data: { name: e.name, event: e.id } })}
      onOpenDevis={e.devisId ? () => modal({ kind: "devisPrev", data: s.devis.find(z => z.id === e.devisId) || { id: e.devisId } }) : undefined}
      onOpenFacture={e.factureId ? () => modal({ kind: "factures", data: { id: e.factureId } }) : undefined}
      onOpenChantier={e.chantierId ? () => { requestOpenChantier(e.chantierId!); close(); go("ch") } : undefined} /></Suspense> }
  if (m.kind === "rel") return <Sheet title="Nouvelle relance" c={A.rel.c} onClose={close}><div className="space-y-3"><F l="Client"><input autoFocus list="akno-clients" autoComplete="off" placeholder="Nom du client" className={inp} {...v("name")} /></F><F l="Type"><select className={inp} {...v("type")}>{["Relance devis", "Demande d'avis", "Rappel RDV", "Relance facture"].map(x => <option key={x}>{x}</option>)}</select></F><div className="grid grid-cols-2 gap-2"><F l="Canal"><select className={inp} {...v("canal")}><option>Appel</option><option>SMS</option><option>E-mail</option></select></F><F l="Quand"><input className={inp} {...v("when")} /></F></div><p className="px-1 text-[13px] leading-5 text-white/50">C'est un rappel pour vous : Akno ne l'envoie pas tout seul. Les relances de devis envoyés et les demandes d'avis, elles, partent automatiquement.</p></div>
    {foot("Programmer", !!f.name.trim(), () => { set(x => ({ ...x, rels: [{ id: uid(), client: f.name.trim(), type: f.type, canal: f.canal, status: "prog", date: f.when || "Demain" }, ...x.rels] })); toast("Relance programmée") })}</Sheet>
  if (m.kind === "pw") return <PwSheet close={close} />
  if (m.kind === "entreprise") return <EntrepriseSheet close={close} />
  if (m.kind === "abonnement") return billingHidden ? null : matchMedia("(min-width: 1024px)").matches ? <AbonnementSheet close={close} /> : <AbonnementPage close={close} />
  if (m.kind === "deleteAccount") return <DeleteAccountSheet close={close} />
  if (m.kind === "factures") return <Suspense fallback={null}><FacturesSheet key={String(d?.id || (d?.create ? "new" : "list"))} close={close} openId={d?.id} startNew={!!d?.create} clients={ctInfos(s)} /></Suspense>
  if (m.kind === "conformite") return <ConformiteSheet close={close} />
  if (m.kind === "leads") return rr.clients ? <LeadsSheet close={close} /> : null
  if (m.kind === "reception") return rr.reception ? <ReceptionSheet close={close} /> : null
  if (m.kind === "studio") return rr.reception ? <Suspense fallback={null}><ReceptionnisteStudio close={close} onHoraires={() => modal({ kind: "reception" })} /></Suspense> : null
  if (m.kind === "recReglages") return rr.reception ? <ReceptionnisteReglagesSheet close={close} onStudio={() => modal({ kind: "studio" })} onReception={() => modal({ kind: "reception" })} onUrgence={() => modal({ kind: "urgencePhone" })} /> : null
  if (m.kind === "agendaCal") return <AgendaCalSheet close={close} />
  if (m.kind === "sms") return <SmsSheet close={close} />
  if (m.kind === "listen") { const n = s.calls.filter(x => x.recording).length; return <Sheet title="À écouter" sub={`${n} enregistrement${n > 1 ? "s" : ""}`} c={A.rec.c} onClose={close}><ListenList /></Sheet> }
  if (m.kind === "calls") { const todo = s.calls.filter(x => x.callback).sort((a, b) => Number(b.urgent) - Number(a.urgent)), rest = s.calls.filter(x => !x.callback)
    return <Sheet title="Appels" sub={`${todo.length} à rappeler · ${s.calls.length} appels au total`} c={A.rec.c} onClose={close}><CallsList todo={todo} rest={rest} /></Sheet> }
  if (m.kind === "callbacks") { const todo = s.calls.filter(x => x.callback).sort((a, b) => Number(b.urgent) - Number(a.urgent))
    const done = (x: Call) => { set(y => ({ ...y, calls: y.calls.map(z => z.id === x.id ? { ...z, callback: false } : z) })); toast(`${x.name} · marqué rappelé`) }
    return <Sheet title="À rappeler" sub={`${todo.length} client${todo.length > 1 ? "s" : ""} · ${todo.filter(x => x.urgent).length} urgent${todo.filter(x => x.urgent).length > 1 ? "s" : ""}`} c={A.rec.c} onClose={close}>{todo.length ? <div className="-mx-5 bg-black/20">{todo.map((x, i) => <Row key={x.id} first={i === 0} label={x.name} urgent={!!x.urgent} onClick={() => modal({ kind: "client", data: { name: x.name, call: x.id } })} lead={<Av n={x.name} />} t={x.name} s={`${x.tag || x.topic}${x.rappelAt ? ` · ${x.rappelAt}` : ""} · ${x.day ? `${x.day.toLowerCase()} ` : ""}${x.time}`} r={<TBtn I={Phone} solid label={`Appeler ${x.name}`} href={`tel:${tel(x.name)}`} onClick={() => done(x)} />} />)}</div> : <div className={`py-8 text-center ${tx.cap}`}>Personne à rappeler. Tout est à jour.</div>}</Sheet> }
  if (m.kind === "relList") return <Sheet title="Relances" sub={`${s.rels.filter(r => r.status === "prog").length} à venir`} c={A.rel.c} onClose={close}><div className="-mx-5 bg-black/20">{s.rels.map((r, i) => <Row key={r.id} first={i === 0} label={r.client} onClick={() => modal({ kind: "relView", data: r })} lead={<Ic I={canalI[r.canal] || Send} />} t={r.client} s={`${r.type} · ${r.date}`} r={<Chip c={RS[r.status][1]}>{RS[r.status][0]}</Chip>} />)}</div></Sheet>
  if (m.kind === "reviewUrl") return <ReviewUrlSheet close={close} />
  if (m.kind === "urgencePhone") return <UrgencePhoneSheet close={close} />
  if (m.kind === "tarifs") return <TarifsSheet close={close} />
  if (m.kind === "clientReply") { const dv = s.devis.find(x => x.id === d.id) || d as Devis, ok = dv.status === "val"
    try { sessionStorage.setItem("akno-seen-" + dv.id, "1"); updateAppBadge(attentionCount(s)) } catch { }
    return <Sheet title={ok ? "Devis accepté" : "Devis refusé"} sub={dv.repliedAt ? new Date(dv.repliedAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "Réponse du client"} c={A.dev.c} onClose={close}>
      <div className="text-[15px] text-white/60">{dv.client} a {ok ? "accepté" : "refusé"} le devis n° {dv.num}{dv.objet ? ` · ${dv.objet}` : ""}.</div>
      {dv.reply && <div className="mt-4 rounded-[16px] bg-white/[.04] p-4 text-[14px] text-white/75">« {dv.reply} »</div>}
      <div className="mt-6"><Btn primary c={A.dev.c} className="w-full" onClick={() => modal({ kind: "devisPrev", data: dv })}>Voir le devis</Btn></div>
    </Sheet> }
  if (m.kind === "relView") { const r = s.rels.find(y => y.id === d.id) || d as Rel, on = s.settings.agents.rel
    const stopAll = () => { if (!r.devisId) return; set(x => ({ ...x, devis: x.devis.map(dv => dv.id === r.devisId ? { ...dv, remindersOff: true } : dv), rels: x.rels.map(y => y.devisId === r.devisId && y.status === "prog" ? { ...y, status: "pause" } : y) })); toast("Relances de ce devis arrêtées"); close() }
    return <Sheet title={r.client} sub={`${r.type} · ${r.canal}`} c={A.rel.c} onClose={close}><div className="space-y-2"><Sub dot={RS[r.status][1]}>{RS[r.status][0]} · {r.date}</Sub>{!on && <Sub>Agent Relance en pause : envoi manuel désactivé</Sub>}{r.devisId && <Sub>Relance automatique liée au devis</Sub>}</div>
      <div className="mt-6 grid grid-cols-2 gap-2">{r.devisId && (r.status === "prog" || r.status === "pause") ? <Btn className="col-span-2" onClick={stopAll} disabled={!!s.devis.find(dv => dv.id === r.devisId)?.remindersOff || r.status === "pause"}>{s.devis.find(dv => dv.id === r.devisId)?.remindersOff || r.status === "pause" ? "Relances arrêtées" : "Arrêter les relances de ce devis"}</Btn> : (r.status === "prog" || r.status === "pause") ? <><Btn primary disabled={!on} aria-label={`Envoyer ${r.client}`} onClick={() => { relUpd(r.id, "env", `Relance marquée comme faite · ${r.client}`, "Faite"); close() }}><Check size={14} strokeWidth={1.5} />Marquer faite</Btn><Btn onClick={() => { relUpd(r.id, r.status === "pause" ? "prog" : "pause", r.status === "pause" ? "Relance reprise" : "Relance en pause"); close() }}>{r.status === "pause" ? <><Play size={13} strokeWidth={1.5} />Reprendre</> : <><Pause size={13} strokeWidth={1.5} />Mettre en pause</>}</Btn></> : <Btn className="col-span-2" onClick={() => { relUpd(r.id, "prog", "Relance reprogrammée", "Demain 9:00"); close() }}><RotateCcw size={14} strokeWidth={1.5} />Reprogrammer</Btn>}</div></Sheet> }
  if (m.kind === "devisList") return <Sheet title="Devis" sub={`${s.devis.length} devis`} c={A.dev.c} onClose={close}><div className="-mx-5 bg-black/20">{[...s.devis].sort((a, b) => b.num - a.num).map((x, i) => <SwipeRow key={x.id} id={"list-" + x.id} first={i === 0} label="Supprimer" onAction={() => askDelDevis(x, set, toast)}><Row className="!rounded-none" first={i === 0} label={`Devis ${x.num}`} onClick={() => modal({ kind: "devisPrev", data: x })} lead={<Av n={x.client} />} t={x.client} s={`N° ${x.num} · ${x.objet}`} r={eur(x.amount)} rs={<Chip c={ST[x.status][1]}>{ST[x.status][0]}</Chip>} /></SwipeRow>)}</div></Sheet>
  if (m.kind === "aiPop") { const dv = s.devis.find(x => x.id === d.id) || d as Devis, n = s.devis.filter(toValidate).length
    if (!toValidate(dv)) return null
    return <Sheet title="Nouveau devis" sub="Brouillon — à valider" c={A.dev.c} onClose={close}>
      <div className="text-[15px] text-white/60">Nouveau devis pour</div><div className="mt-1 text-[24px] font-medium tracking-[-0.02em]">{dv.client}</div>
      <div className="mt-5 rounded-[20px] bg-white/[.04] p-4"><div className={tx.cap}>Montant</div><div className={`mt-1 text-[40px] ${tx.fig}`}>{eur(ttc(dv.amount, s.settings.tva))}</div><div className={`mt-1 ${tx.cap}`}>TTC · {eur(dv.amount)} HT · {dv.objet}</div></div>
      <div className="mt-4 flex items-center gap-2 text-[13px] text-white/50"><Sparkles size={14} strokeWidth={1.5} style={{ color: A.dev.c }} />Généré par Akno depuis l'appel {dv.from ? `d'${dv.from}` : "du client"}</div>
      {n > 1 && <div className={`mt-2 ${tx.cap}`}>+ {n - 1} autre{n > 2 ? "s" : ""} devis à valider</div>}
      <div className="mt-6"><Btn primary c={A.dev.c} className="w-full" onClick={() => modal({ kind: "devisPrev", data: dv })}>Regarder le devis</Btn></div></Sheet> }
  if (m.kind === "devisPrev") return <DevisPrevSheet initial={d as Devis} onClose={close} />
  if (m.kind === "prestations") return <PrestationsSheet close={close} />
  if (m.kind === "pilotage") return <Suspense fallback={null}><PilotageL close={close} /></Suspense>
  if (m.kind === "connect") return <Suspense fallback={null}><ConnectL close={close} /></Suspense>
  if (m.kind === "devisEdit") { const dv = s.devis.find(x => x.id === d.id) || d as Devis; const setS = (st: DevStatus) => { set(x => ({ ...x, devis: x.devis.map(y => y.id === dv.id ? { ...y, status: st } : y) })); toast(`Devis ${dv.num} : ${ST[st][0]}`) }
    return <Sheet title={`Devis N° ${dv.num}`} sub={`${dv.client} · ${dv.objet}`} c={A.dev.c} onClose={close}><div className={`text-[40px] ${tx.fig}`}>{eur(dv.amount)}</div><div className="mt-2"><Sub>HT · {eur(Math.round(dv.amount * (1 + s.settings.tva / 100)))} TTC (TVA {String(s.settings.tva).replace(".", ",")} %)</Sub></div>
      <div className="mt-5 grid grid-cols-2 gap-2"><Btn primary c={A.dev.c} onClick={() => modal({ kind: "devisPrev", data: dv })}><FileText size={16} strokeWidth={1.6} />Voir le devis</Btn><Btn onClick={() => modal({ kind: "devisEditor", data: dv })}><FilePen size={16} strokeWidth={1.6} />Modifier</Btn></div>
      <div className={`mb-3 mt-6 px-1 ${tx.cap}`}>Statut</div><div className="flex flex-wrap gap-1.5">{(Object.keys(ST) as DevStatus[]).map(k => <button key={k} onClick={() => setS(k)} className={`flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-medium ${dv.status === k ? "bg-white/[.16] text-white" : "bg-white/[.06] text-white/60"}`}><Dot c={ST[k][1]} />{ST[k][0]}</button>)}</div>
      <div className="mt-6 flex gap-2"><Btn className="flex-1" onClick={() => { if (confirm(`Supprimer le devis ${dv.num} ?`)) { set(x => ({ ...x, devis: x.devis.filter(y => y.id !== dv.id) })); toast("Devis supprimé"); close() } }}><Trash2 size={15} strokeWidth={1.5} />Supprimer</Btn><Btn primary className="flex-1" onClick={close}>Fermer</Btn></div></Sheet> }
  return null
}

/* ---------------- Assistant (moteur local, src/lib/assistant.ts) ---------------- */
/* update63 · même bot bleu en mode Factures : suggestions dédiées + réponses simples (à encaisser, en retard, nouvelle facture, facturer un devis) */
const FAC_CHIPS = ["Factures à encaisser", "Factures en retard", "Crée une facture", "Facturer un devis", "Combien reste à encaisser ?", "Devis à valider"]
function factureReply(raw: string): { text: string; acts?: RAct[]; chips?: string[]; create?: boolean } | null {
  const n = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  if (!/factur|impaye|encaiss/.test(n)) return null
  if (/(cree|creer|nouvelle|fais|faire|prepare|ouvre)\b.*factur/.test(n) && !/devis/.test(n)) return { text: "J'ouvre une nouvelle facture : renseignez le client et les lignes, puis « Émettre ».", create: true }
  if (/devis/.test(n) && /factur/.test(n)) return { text: "Pour facturer un devis : ouvrez-le (mode Devis), puis « Créer la facture », « Acompte » ou « Situation d'avancement ». Les acomptes déjà facturés sont déduits automatiquement.", acts: [{ l: "Voir les devis", k: "go", v: "dev" }], chips: ["Factures à encaisser"] }
  if (!/(encaiss|retard|impaye|attente|a payer|en cours|non payee|reste)/.test(n)) return null
  const st = factureState(), rows = st.rows || []
  if (st.rows === null) return { text: "Je charge vos factures… redemandez-moi dans un instant." }
  const late = /retard/.test(n)
  const list = rows.filter(f => late ? isLate(f) : isUnpaid(f))
  if (!list.length) return { text: late ? "Aucune facture en retard. 👍" : "Aucune facture à encaisser : tout est payé.", chips: ["Crée une facture"] }
  const tot = list.reduce((a, f) => a + dueOf(f), 0)
  const lines = list.slice(0, 6).map(f => `• ${f.numero || "brouillon"} · ${f.client_nom || "client ?"} · ${e2(dueOf(f))}${isLate(f) ? " (en retard)" : ""}`).join("\n")
  return { text: `${list.length} facture${list.length > 1 ? "s" : ""} ${late ? "en retard" : "à encaisser"} · ${e2(tot)}\n${lines}${list.length > 6 ? `\n… et ${list.length - 6} autre${list.length - 6 > 1 ? "s" : ""}` : ""}`, acts: [{ l: "Voir les factures", k: "go", v: "fac", primary: true }], chips: late ? ["Factures à encaisser"] : ["Factures en retard"] }
}
function Chat() {
  const { s, set, desk, setChat, page, go, modal, toast } = useC()
  const k: K = isK(page) ? page : "dev", c = A[k].c
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
      // update63 · mode Factures : questions simples sur les factures (le moteur local ne connaît que les devis)
      const fa = factureReply(text)
      if (fa) { pend.current = null; set(x => ({ ...x, chat: [...x.chat, { id: uid(), from: "ai", text: fa.text, acts: fa.acts, chips: fa.chips }] })); if (fa.create) modal({ kind: "factures", data: { create: true } }); setBusy(false); return }
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
  const facMode = page === "fac", chips = facMode ? FAC_CHIPS : HELP_CHIPS
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
  const input = <form onSubmit={e => { e.preventDefault(); send(v) }} className="flex h-12 shrink-0 items-center gap-2 rounded-full bg-white/[.07] pl-4 pr-1.5"><input aria-label="Message" value={v} onChange={e => setV(e.target.value)} placeholder={facMode ? "Une question sur vos factures ou devis…" : "Écrire à l'assistant…"} className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-white/30" /><Mic size={17} strokeWidth={1.5} className="shrink-0 text-white/40" /><button aria-label="Envoyer" disabled={!v.trim() || busy} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full disabled:opacity-60" style={{ background: c, color: c === "#E6E6E6" ? "#000" : "#fff" }}><ArrowUp size={16} strokeWidth={1.8} /></button></form>
  if (desk) return <motion.aside initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} className="flex w-[380px] shrink-0 flex-col border-l border-white/[.06] bg-[#0B0B0C]">
    <div className="flex h-16 shrink-0 items-center border-b border-white/[.06] px-5">{head}</div>{msgs}<div className="p-5">{input}</div></motion.aside>
  return <ModalSheet label="Assistant" onClose={() => setChat(false)} z={40} backdrop="bg-black/60" className="h-[560px] border-t border-white/[.08] bg-[#121214] px-5 pt-3" style={{ paddingBottom: 0 }}>
      <div className="flex min-h-0 flex-1 flex-col" data-chat-sheet>
      <div aria-hidden className="h-[5px] shrink-0" /><div className="mt-4 shrink-0">{head}</div>{msgs}
      <div data-chat-input className="shrink-0 pt-3" style={{ paddingBottom: "max(16px, var(--sab))" }}>{input}</div>
      </div></ModalSheet>
}

/* ---------------- App ---------------- */
const useDesk = () => { const q = "(min-width: 1024px)"; const [d, setD] = useState(() => matchMedia(q).matches); useEffect(() => { const m = matchMedia(q), f = () => setD(m.matches); m.addEventListener("change", f); return () => m.removeEventListener("change", f) }, []); return d }
const font = (desk: boolean) => ({ fontFamily: "'Geist Variable', -apple-system, sans-serif", fontFeatureSettings: desk ? "'tnum'" : "'tnum','ss01'" })
const ORD: P[] = ["rec", "ag", "rel", "dev", "set"]
/* ================= update67 · Transitions entre pages =================
   Onglets (et pages du +) : fondu enchaîné léger avec un petit glissement dans le sens de la barre ; la nouvelle page se pose
   au-dessus de l'ancienne (fond plein), l'ancienne ne s'efface pas : aucun « trou » noir, aucun flash.
   Réglages / Relance (pages de détail) : push iOS depuis la droite, retour inversé (l'ancienne page glisse de 28 % et s'assombrit).
   Ressorts communs (lib/motion.ts), prefers-reduced-motion : simple fondu (MotionConfig reducedMotion="user"). */
const LAZY: Partial<Record<P, { preload: () => Promise<void>; ready: () => boolean }>> = { ch: ChantiersPage, eq: EquipePage, cl: ClientsPage }
const ORDER: Partial<Record<string, number>> = { rec: 0, ag: 1, ch: 2, dev: 3, eq: 4, cl: 5 }
const isPushP = (p: string) => p === "set" || p === "rel"
type PT = { kind: "fade" | "push" | "pop" | "sheet" | "unsheet"; dir: number }
const OPA = { duration: .24, ease: [.22, 1, .36, 1] as const }
/* update69 · Pages conservées (Réception, Agenda, Chantiers, Devis | Factures) : une fois ouvertes (ou préparées au repos),
   elles restent montées et sont seulement masquées. Changer d'onglet ne recrée donc plus la page : aucun rendu lourd au
   moment du tap, la carte des chantiers n'est pas recréée, chaque onglet garde sa position de défilement.
   Les animations sont lancées à la main (transform + opacity uniquement, ressorts de lib/motion), une image après que la
   page entrante est prête : sur iPhone, l'animation ne « démarre » plus pendant un rendu bloquant (ce qui la rendait
   invisible : coupe sèche). Mouvements réduits : fondu enchaîné court, jamais de coupe. */
const KEEP = new Set(["rec", "ag", "ch", "dev"])
/** update69 · la page conservée est-elle celle affichée ? (une page masquée ne déclenche rien : fenêtres auto, etc.) */
const SlotActive = createContext(true)
const PAGE_C: Record<string, ComponentType> = { rec: Rec, ag: Ag, rel: RelP, dev: DevFac, set: SetP, ch: ChP, eq: EqP, cl: ClP }
const prefersReduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
type SlotBase = { fns: Partial<Ctx>; s: Ctx["s"]; desk: boolean; chat: boolean; q: string; loading: boolean }
function PageSlot({ k, page, active, base, setEl }: { k: string; page: P; active: boolean; base: SlotBase; setEl: (k: string, el: HTMLDivElement | null) => void }) {
  const Comp = PAGE_C[k] || Rec
  // valeur du contexte stable tant que rien de ce que lit la page ne change → une page masquée ne se re-rend pas au changement d'onglet
  const value = useMemo(() => ({ ...base.fns, s: base.s, desk: base.desk, page, chat: base.chat, q: base.q }) as Ctx, [base.fns, base.s, base.desk, page, base.chat, base.q])
  const el = useMemo(() => <Comp />, [Comp])
  const ref = useMemo(() => (n: HTMLDivElement | null) => setEl(k, n), [k, setEl])
  return <div ref={ref} data-page={active ? k : undefined} data-slot={k} aria-hidden={active ? undefined : true} inert={!active}
    className="absolute inset-0 flex flex-col bg-black">
    <C.Provider value={value}><SlotActive.Provider value={active}><Suspense fallback={<PageSkeleton mobile={!base.desk} />}>
      <SetupGate page={page} loading={base.loading} mobile={!base.desk} active={active}>{el}</SetupGate>
    </Suspense></SlotActive.Provider></C.Provider>
  </div>
}
const PAGE_SHADOW = "-16px 0 40px -8px rgba(0,0,0,.75)"
function Pages({ pkey, page, desk, loading }: { pkey: string; page: P; desk: boolean; loading: boolean }) {
  const ctx = useC()
  const latest = useRef(ctx); latest.current = ctx
  // fonctions du contexte stables (elles appellent toujours la version courante) : pas de re-rendu, pas de fermeture périmée
  const fns = useMemo(() => { const o: Record<string, unknown> = {}; for (const key of Object.keys(ctx)) if (typeof (ctx as any)[key] === "function") o[key] = (...a: unknown[]) => (latest.current as any)[key](...a); return o as Partial<Ctx> }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const base = useMemo<SlotBase>(() => ({ fns, s: ctx.s, desk, chat: ctx.chat, q: ctx.q, loading }), [fns, ctx.s, desk, ctx.chat, ctx.q, loading])
  const lastDoc = useRef<P>(page === "fac" ? "fac" : "dev"); if (page === "dev" || page === "fac") lastDoc.current = page
  const [slots, setSlots] = useState<string[]>(() => [pkey])
  if (!slots.includes(pkey)) setSlots([...slots, pkey])
  const els = useRef(new Map<string, HTMLDivElement>()), shown = useRef(pkey), cur = useRef(pkey); cur.current = pkey
  const setEl = useMemo(() => (k: string, el: HTMLDivElement | null) => {
    if (!el) { els.current.delete(k); return }
    els.current.set(k, el)
    if (k !== cur.current) { el.style.visibility = "hidden"; el.style.zIndex = "0" }
  }, [])
  // type de transition (inchangé depuis update67)
  const prev = useRef(pkey), pt = useRef<PT>({ kind: "fade", dir: 1 }), fromSet = useRef(false)
  if (prev.current !== pkey) {
    const a = prev.current, b = pkey, sub = (x: string) => x === "eq" || x === "cl"
    const deep = (x: string) => isPushP(x) || sub(x)
    // Refonte iOS : Réglages s'ouvre en feuille (monte du bas) depuis le « … » de la capsule, et redescend à la fermeture
    if (!desk && b === "set" && !sub(a)) { pt.current = { kind: "sheet", dir: 1 }; fromSet.current = false }
    else if (!desk && a === "set" && !sub(b)) { pt.current = { kind: "unsheet", dir: -1 }; fromSet.current = false }
    else if (!desk && a === "set" && sub(b)) { pt.current = { kind: "push", dir: 1 }; fromSet.current = true }
    else if (!desk && sub(a) && b === "set" && fromSet.current) { pt.current = { kind: "pop", dir: -1 }; fromSet.current = false }
    else {
      pt.current = !desk && deep(b) && !deep(a) ? { kind: "push", dir: 1 } : !desk && deep(a) && !deep(b) ? { kind: "pop", dir: -1 } : { kind: "fade", dir: (ORDER[b] ?? 9) >= (ORDER[a] ?? 9) ? 1 : -1 }
      fromSet.current = false
    }
    // update84 · navbar (rec/ag/ch/dev) : crossfade 180 ms. Relance / Réglages / sous-pages : push iOS.
    prev.current = b
  }
  const run = useRef<{ token: number; anims: { stop: () => void }[]; from: string | null }>({ token: 0, anims: [], from: null })
  const rest = (el: HTMLElement | undefined, hide: boolean) => { if (!el) return; el.style.transform = ""; el.style.opacity = ""; el.style.boxShadow = ""; el.style.willChange = "auto"; el.style.zIndex = hide ? "0" : "1"; el.style.visibility = hide ? "hidden" : "" }
  const drop = (k: string) => { if (!KEEP.has(k) && k !== cur.current) setSlots(l => l.includes(k) && k !== cur.current ? l.filter(x => x !== k) : l) }
  useLayoutEffect(() => {
    const from = shown.current, to = pkey
    if (from === to) return
    shown.current = to
    const r = run.current, token = ++r.token
    r.anims.forEach(a => a.stop()); r.anims = []
    // transition interrompue : l'ancienne page sortante disparaît tout de suite
    for (const [k, el] of els.current) if (k !== from && k !== to) { rest(el, true); if (r.from === k) drop(k) }
    r.from = from
    const elIn = els.current.get(to), elOut = els.current.get(from), t = pt.current
    if (!elIn) return
    const reduce = prefersReduced()
    const zIn = (t.kind === "pop" || t.kind === "unsheet") && !reduce ? "1" : "2", zOut = zIn === "2" ? "1" : "2"
    // état de départ posé immédiatement (aucune image de la nouvelle page à sa place finale avant l'animation)
    const dx = t.dir >= 0 ? 10 : -10
    const fromIn: Record<string, string> = reduce ? { opacity: "0" } : t.kind === "push" ? { transform: "translateX(100%)" } : t.kind === "pop" ? { transform: "translateX(-28%)", opacity: ".55" } : t.kind === "sheet" ? { transform: "translateY(100%)" } : t.kind === "unsheet" ? {} : { opacity: "0", transform: `translateX(${dx}px)` }
    elIn.style.visibility = ""; elIn.style.zIndex = zIn; elIn.style.transform = fromIn.transform || ""; elIn.style.opacity = fromIn.opacity || ""; elIn.style.willChange = "transform, opacity"
    if (!reduce && (t.kind === "push")) elIn.style.boxShadow = PAGE_SHADOW
    if (elOut) { elOut.style.visibility = ""; elOut.style.zIndex = zOut; elOut.style.willChange = "transform, opacity"; if (!reduce && t.kind === "pop") elOut.style.boxShadow = PAGE_SHADOW }
    const xT = t.kind === "fade" ? TAB : PUSH
    // lancement à l'image suivante : la page entrante est mise en page avant que l'horloge de l'animation parte
    const raf = requestAnimationFrame(() => {
      if (run.current.token !== token) return
      const list: any[] = []
      if (reduce) { list.push(animate(elIn, { opacity: [0, 1] }, { duration: .26, ease: [.22, 1, .36, 1] })); if (elOut) list.push(animate(elOut, { opacity: [1, 0] }, { duration: .2 })) }
      else if (t.kind === "push") { list.push(animate(elIn, { x: ["100%", "0%"] }, xT)); if (elOut) list.push(animate(elOut, { x: ["0%", "-28%"], opacity: [1, .55] }, { x: xT, opacity: xT })) }
      else if (t.kind === "sheet") { list.push(animate(elIn, { y: ["100%", "0%"] }, SHEET)); if (elOut) list.push(animate(elOut, { opacity: [1, .7] }, { duration: .3 })) }
      else if (t.kind === "unsheet") { if (elOut) list.push(animate(elOut, { y: ["0%", "100%"] }, SHEET)); list.push(animate(elIn, { opacity: [.7, 1] }, { duration: .3 })) }
      else if (t.kind === "pop") { list.push(animate(elIn, { x: ["-28%", "0%"], opacity: [.55, 1] }, { x: xT, opacity: xT })); if (elOut) list.push(animate(elOut, { x: ["0%", "100%"] }, xT)) }
      // update84 · onglets navbar : crossfade 180 ms + léger translate, les deux pages restent visibles (KEEP monté)
      else { list.push(animate(elIn, { opacity: [0, 1], x: [dx, 0] }, CROSSFADE)); if (elOut) list.push(animate(elOut, { opacity: [1, 0], x: [0, -dx] }, CROSSFADE)) }
      run.current.anims = list
      Promise.all(list.map(a => a.finished ?? a)).then(() => {
        if (run.current.token !== token) return
        elIn.style.opacity = "1"; elIn.style.transform = "none"
        rest(elIn, false); if (elOut && from !== cur.current) { rest(elOut, true); drop(from) }
        run.current.anims = []; run.current.from = null
      }, () => {})
    })
    return () => cancelAnimationFrame(raf)
  }, [pkey]) // eslint-disable-line react-hooks/exhaustive-deps
  // pages principales préparées au repos (montées masquées) : le premier passage sur un onglet n'a plus rien à construire
  useEffect(() => {
    if (loading) return
    let stop = false, i = 0
    const todo = ["rec", "ag", "dev", "ch"]
    const next = () => { if (stop) return; while (i < todo.length && slots.includes(todo[i])) i++; if (i >= todo.length) return; const k = todo[i++]; const L = LAZY[k as P]; const add = () => { if (!stop) setSlots(l => l.includes(k) ? l : [...l, k]); setTimeout(() => idle(next, 3000), 400) }; if (L && !L.ready()) void L.preload().then(add, () => {}); else add() }
    const t = setTimeout(() => idle(next, 800), 400)
    return () => { stop = true; clearTimeout(t) }
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="relative min-h-0 flex-1 overflow-hidden">
    {slots.map(k => <PageSlot key={k} k={k} page={(k === "dev" ? (pkey === "dev" ? page : lastDoc.current) : k) as P} active={k === pkey} base={base} setEl={setEl} />)}
  </div>
}

function AknoApp() {
  const pathname = useLocation().pathname, navigate = useNavigate()
  const [s, setS, loading, put] = useStore(), desk = useDesk()
  useClients() // update66 : les fiches clients alimentent les sélecteurs de client (devis, factures, chantiers)
  useEffect(() => { if (!loading) idle(() => { void loadClients() }) }, [loading])
  // update52 : éditeur de devis pro (plein écran, au-dessus des pages, sous les fiches)
  const [ed, setEd] = useState<EditorReq | null>(null)
  CL = s.clients || []
  const page: P = SLUG[(pathname || "").split("/")[1] || ""] || "rec"
  const [m, setM] = useState<Modal>(null), [chat, setChatS] = useState(() => new URLSearchParams(location.search).has("chat"))
  const [toastT, setToastT] = useState<{ t: string; k: number; undo?: () => void; err?: boolean; info?: boolean } | null>(null), [q, setQ] = useState("")
  const fst = useFacturesLite()
  useEffect(() => { void refreshFactures(); const f = () => { if (!document.hidden) void refreshFactures() }; document.addEventListener("visibilitychange", f); addEventListener("akno-refresh", f); return () => { document.removeEventListener("visibilitychange", f); removeEventListener("akno-refresh", f) } }, [])
  const hadModal = useRef(false)
  useEffect(() => { if (m?.kind === "factures" || m?.kind === "client" || m?.kind === "devisPrev") hadModal.current = true; else if (!m && hadModal.current) { hadModal.current = false; void refreshFactures() } }, [m])
  const [pushNote, setPushNote] = useState<{ title: string; body: string; url: string; k: number } | null>(null)
  // update48 · page d'arrivée : sans l'option Réceptionniste IA, on arrive sur l'Agenda (et non sur /reception).
  const rr = useRights(), landed = useRef(false), role = useAppRole()
  const isEmploye = role?.kind === "employe"
  useEffect(() => {
    if (landed.current || !rr.ready) return
    landed.current = true
    if (!rr.reception && page === "rec") navigate(`/${slugOf("ag")}${location.search}`, { replace: true })
  }, [rr.ready, rr.reception, page, navigate])
  useEffect(() => {
    if (!isEmploye) return
    if (page === "rec" || page === "dev" || page === "fac" || page === "rel" || page === "set" && false) navigate(`/${slugOf("ag")}${location.search}`, { replace: true })
  }, [isEmploye, page, navigate])
  useEffect(() => { document.title = `Akno · ${pageTitle(page)}` }, [page])
  useEffect(() => { if (!toastT) return; const t = setTimeout(() => setToastT(null), toastT.undo || toastT.err ? 6000 : 2600); return () => clearTimeout(t) }, [toastT])
  // Toast du haut (création devis / facture) : au-dessus des feuilles ; 2,5 s pour une confirmation, 5 s pour une erreur (le temps de lire).
  const [flashT, setFlashT] = useState<{ t: string; k: number; err?: boolean } | null>(null)
  const flash = (t: string, kind: "ok" | "err" = "ok") => setFlashT({ t, k: Date.now(), err: kind === "err" })
  useEffect(() => { if (!flashT) return; const t = setTimeout(() => setFlashT(null), flashT.err ? 5000 : 2500); return () => clearTimeout(t) }, [flashT])
  // update52 : toute écriture refusée par la base est signalée (fini les devis qui disparaissent sans explication)
  useEffect(() => { const f = (e: Event) => setToastT({ t: String((e as CustomEvent).detail || "Enregistrement impossible."), k: Date.now(), err: true }); addEventListener("akno-sync-error", f); return () => removeEventListener("akno-sync-error", f) }, [])
  useEffect(() => { if (!pushNote) return; const t = setTimeout(() => setPushNote(null), 10000); return () => clearTimeout(t) }, [pushNote])
  useEffect(() => { void registerPushWorker() }, [])
  useEffect(() => { if (s.settings.push) void ensurePush() }, [s.settings.push])
  useEffect(() => {
    const onLive = (e: Event) => {
      const d = (e as CustomEvent).detail as { table?: string; row?: Record<string, unknown> } | undefined
      if (!d?.table || !d.row) return
      if (d.table === "calls") {
        const name = String(d.row.nom_client || "Nouvel appel")
        const body = String(d.row.resume || d.row.motif || "Appel reçu par la réceptionniste").slice(0, 140)
        setPushNote({ title: name, body, url: "/reception", k: Date.now() })
      } else if (d.table === "appointments") {
        const client = String(d.row.client || "Client")
        const when = d.row.start ? new Date(String(d.row.start)).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""
        setPushNote({ title: "Nouveau rendez-vous", body: `${client}${when ? ` · ${when}` : ""}`, url: "/agenda", k: Date.now() })
      }
      try { dispatchEvent(new Event("akno-refresh")) } catch { /* */ }
    }
    addEventListener("akno-live", onLive)
    return () => removeEventListener("akno-live", onLive)
  }, [])
  useEffect(() => {
    const sync = () => updateAppBadge(attentionCount(s))
    sync()
    document.addEventListener("visibilitychange", sync)
    window.addEventListener("focus", sync)
    return () => { document.removeEventListener("visibilitychange", sync); window.removeEventListener("focus", sync) }
  }, [s.calls, s.devis])
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    const onMsg = (e: MessageEvent) => {
      const data = e.data as { type?: string; url?: string; title?: string; body?: string } | null
      if (data?.type === "akno-push") {
        setPushNote({ title: data.title || "Akno", body: data.body || "", url: data.url || "/reception", k: Date.now() })
        return
      }
      if (!data || data.type !== "akno-nav") return
      const raw = String(data.url || "/reception")
      let slug = "reception"
      try {
        const path = raw.startsWith("http") ? new URL(raw).pathname : raw
        slug = path.replace(/^\//, "").split("/")[0] || "reception"
      } catch { /* ignore */ }
      navigate(`/${slugOf(SLUG[slug] || "rec")}`, { replace: true })
    }
    navigator.serviceWorker.addEventListener("message", onMsg)
    return () => navigator.serviceWorker.removeEventListener("message", onMsg)
  }, [navigate])
  // update67 : une page chargée à part est d'abord reçue, puis affichée (la page courante reste visible en attendant : ni flash ni écran de chargement)
  // update72 : changer d'onglet REMPLACE l'entrée d'historique au lieu d'en empiler une. Sinon le geste iOS « glisser depuis le
  // bord gauche » (et history.back) ramenait l'onglet précédent (Factures → Chantiers). Les feuilles et fiches gardent leur entrée.
  const go = (p: P) => { noteTab(page); setQ(""); setM(null); if (p !== page) { const url = `/${slugOf(p)}${chat && desk ? "?chat=1" : ""}`, L = LAZY[p], nav = () => navigate(url, { replace: true }); if (L && !L.ready()) void L.preload().then(nav, nav); else nav() } if (!desk) setChatS(false) }
  // update72 · Android : le bouton retour, sans historique, ramène de Réglages / Relances / Équipe / Clients vers l'onglet d'accueil
  // (ou Réglages) au lieu de quitter l'app ; sur un onglet principal, l'app se met en arrière-plan comme avant.
  const goRef = useRef(go); goRef.current = go
  useEffect(() => { const f = (e: Event) => { const b = page === "eq" || page === "cl" ? "set" : page === "set" || page === "rel" ? (rr.reception || !rr.ready ? "rec" : "ag") : null; if (b) { e.preventDefault(); goRef.current(b as P) } }
    addEventListener("akno:back", f); return () => removeEventListener("akno:back", f) }, [page, rr.reception, rr.ready])
  const setChat = (b: boolean) => { setChatS(b); navigate(`/${slugOf(page)}${b ? "?chat=1" : ""}`, { replace: true }) }
  const modal = (x: Modal) => {
    if (x?.kind === "devis") { setM(null); const req = { prefill: x.data }; if (DevisEditor.ready()) setEd(req); else void DevisEditor.preload().then(() => setEd(req), () => setEd(req)); return }
    if (x?.kind === "devisEditor") { setM(null); const req = { initial: x.data, prefill: (x as { prefill?: EditorReq["prefill"] }).prefill }; if (DevisEditor.ready()) setEd(req); else void DevisEditor.preload().then(() => setEd(req), () => setEd(req)); return }
    if (x?.kind === "contacts") { go("cl"); return } // update66 : l'ancienne liste Clients est remplacée par la page /clients
    setM(x)
  }
  // update62 · raccourcis du bouton « + » : uniquement des parcours existants
  // update67 : Nouveau RDV / Nouveau devis / Nouvelle facture retirés du + (déjà dans Agenda et Devis | Factures)
  const onCreate = (k: CreateKind) => {
    if (k === "clients") go("cl") // update66 : la tuile Contact devient Clients
    else if (k === "chantier") { requestNewChantier(); go("ch") }
    else if (k === "equipe") go("eq") // update65 : Équipe remplace Note
    else if (k === "relances") go("rel") // update81 : accès Relances depuis le +
    else setToastT({ t: "Bientôt disponible", k: Date.now(), info: true })
  }
  const ctx: Ctx = { s, set: setS, desk, page, go, modal, chat, setChat, toast: (t: string, undo?: () => void) => setToastT({ t, k: Date.now(), undo }), q, setQ, put, flash }
  const pkey = page === "fac" ? "dev" : page // update63 : Devis ↔ Factures sans re-monter la page (le bot reste en place)
  // update67 : préchargement des pages et feuilles chargées à part, au repos (puis au toucher, cf. MobileNav)
  useEffect(() => { idle(() => { for (const L of [ChantiersPage, ClientsPage, EquipePage, FacturesSheet, ReceptionnisteStudio, DevisEditor, EventSheet, TeamView, AgendaTools, ClientChantiers, DevisPaper]) void L.preload().catch(() => {}); void loadChantiers() }) }, []) // update67 : pages et données Chantiers / Équipe prêtes avant le premier tap (pas de squelette)
  const prefetch = (p: P) => { void LAZY[p]?.preload().catch(() => {}) }
  return <C.Provider value={ctx}><MotionConfig reducedMotion="user"><div className="fixed inset-0 flex overflow-hidden bg-black text-white tabular-nums antialiased" style={font(desk)}>
    {desk ? <><Side /><div className="flex min-w-0 flex-1 flex-col"><Top /><main className="relative flex min-h-0 flex-1 flex-col overflow-hidden"><Pages pkey={pkey} page={page} desk loading={loading} /></main></div><AnimatePresence>{chat && <Chat />}</AnimatePresence></>
      : <div className="flex min-w-0 flex-1 flex-col"><Pages pkey={pkey} page={page} desk={false} loading={loading} />{page !== "set" && <MobileNav page={page} go={go} badge={(fst.rows || []).filter(isLate).length} recLocked={!rr.reception} onCreate={onCreate} onIntent={prefetch} employee={isEmploye} />}<AnimatePresence>{chat && <Chat />}</AnimatePresence></div>}
    <AnimatePresence>{ed && <Suspense fallback={null}><DevisEditor key={ed.initial?.id || "new"} req={ed} clients={ctInfos(s)} onClose={() => setEd(null)} onSend={(dv: Devis) => { setEd(null); setM({ kind: "devisPrev", data: dv }) }}
      // Création confirmée : toast du haut + retour haptique léger, puis le document créé s'ouvre.
      onCreated={(dv: Devis) => { setEd(null); flash(dv.num ? `Devis N° ${dv.num} créé` : "Devis créé"); void hapticSuccess(); setM({ kind: "devisPrev", data: dv }) }}
      onCreateFacture={async (dv: Devis) => {
      // L'éditeur reste ouvert (et rempli) tant que la facture n'existe pas : en cas d'erreur, rien n'est perdu.
      const { createFactureDraft } = await import("./sheets/FacturesSheet")
      const { devisToFactureLines } = await import("../../api/_lib/factureCalc")
      const r = await createFactureDraft({ client_nom: dv.client, client_email: dv.email, client_telephone: dv.phone, client_adresse: dv.addr, objet: dv.objet, lignes: devisToFactureLines(dv.lines || []) })
      if (!r.ok) return { ok: false, error: r.error || "Création de la facture impossible." }
      // un brouillon de facture n'a pas encore de numéro légal (attribué à l'émission)
      setEd(null); flash("Facture créée"); void hapticSuccess()
      setM({ kind: "factures", data: { id: r.facture_id } })
      return { ok: true }
    }} /></Suspense>}</AnimatePresence>
    <AnimatePresence>{m && <Forms key={m.kind + (m.data?.id || "")} m={m} close={() => setM(null)} />}</AnimatePresence>
    <Gate />
    <UpgradeHost />
    <ConfirmHost />
    <AnimatePresence>{pushNote && <motion.div key={pushNote.k} role="status" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onClick={() => { const raw = pushNote.url || "/reception"; let slug = "reception"; try { const path = raw.startsWith("http") ? new URL(raw).pathname : raw; slug = path.replace(/^\//, "").split("/")[0] || "reception" } catch { /* */ } navigate(`/${slugOf(SLUG[slug] || "rec")}`, { replace: true }); setPushNote(null) }} className={`fixed left-1/2 z-[70] w-[calc(100vw-32px)] max-w-[420px] -translate-x-1/2 cursor-pointer rounded-[22px] border border-white/[.06] bg-[#141416] px-4 py-3 ${desk ? "top-6" : "top-[max(12px,env(safe-area-inset-top))]"}`}><div className="text-[15px] font-semibold tracking-[-0.02em]">{pushNote.title}</div>{pushNote.body && <div className="mt-1 text-[13px] leading-5 text-white/70">{pushNote.body}</div>}</motion.div>}</AnimatePresence>
    {createPortal(<div className="pointer-events-none fixed inset-x-0 z-[95] grid justify-items-center px-4" style={{ top: "calc(var(--sat, 0px) + 10px)" }}>
      <AnimatePresence>{flashT && <motion.div key={flashT.k} role={flashT.err ? "alert" : "status"} data-toast data-toast-top data-kind={flashT.err ? "err" : "ok"}
        initial={{ opacity: 0, y: -18, scale: .94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: .97, transition: { duration: .18, ease: "easeOut" } }} transition={TOAST_TOP}
        className={`pointer-events-auto col-start-1 row-start-1 flex max-w-full items-center gap-2.5 border py-2 pl-2.5 pr-4 text-[14.5px] font-medium shadow-[0_16px_40px_-8px_rgba(0,0,0,.72),0_2px_8px_rgba(0,0,0,.35)] backdrop-blur-xl ${flashT.err ? "max-w-[min(520px,100%)] rounded-[20px] border-[#FF453A]/35 bg-[#2A1513]/95 text-[#FFB4AF]" : "rounded-full border-white/[.1] bg-[#1C1C1F]/92 text-white"}`}>
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${flashT.err ? "bg-[#FF453A]/25 text-[#FF7A72]" : "bg-white/[.14] text-white"}`}>{flashT.err ? <X size={14} strokeWidth={2.4} /> : <Check size={14} strokeWidth={2.6} />}</span>
        <span className={flashT.err ? "py-0.5 leading-5" : "truncate"}>{flashT.t}</span>
      </motion.div>}</AnimatePresence>
    </div>, document.body)}
    <AnimatePresence>{toastT && <motion.div key={toastT.k} role="status" data-toast initial={{ opacity: 0, y: 16, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: .98 }} transition={TOAST} className={`fixed left-1/2 z-[60] flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3 ${toastT.err ? "max-w-[min(520px,calc(100vw-32px))] rounded-[20px]" : "whitespace-nowrap rounded-full"} border border-white/[.08] bg-[#1C1C1F]/90 py-2 pl-3 text-[14px] shadow-[0_16px_40px_-8px_rgba(0,0,0,.72),0_2px_8px_rgba(0,0,0,.35)] backdrop-blur-xl ${toastT.undo ? "pr-2" : "pr-4"} ${desk ? "bottom-8" : "bottom-[calc(94px+max(var(--sab)-10px,12px))]"}`}>{toastT.err ? <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FF453A]/20 text-[#FF7A72]"><X size={14} strokeWidth={2.4} /></span> : toastT.info ? <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[.12] text-white/85"><Clock size={13} strokeWidth={2.2} /></span> : <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#30D158]/20 text-[#30D158]"><Check size={14} strokeWidth={2.2} /></span>}<span className={toastT.err ? "whitespace-normal py-0.5 leading-5" : "truncate"}>{toastT.t}</span>{toastT.undo && <button onClick={() => { toastT.undo?.(); setToastT({ t: "Action annulée", k: Date.now() }) }} className="h-8 shrink-0 rounded-full bg-white/10 px-3 text-[13px] font-semibold hover:bg-white/15">Annuler</button>}</motion.div>}</AnimatePresence>
  </div></MotionConfig></C.Provider>
}

const noop = () => () => {}
/** Rendu client uniquement : localStorage et matchMedia ne sont lus qu'après le montage (aucune erreur d'hydratation). */
class Boundary extends Component<{ children: ReactNode }, { err: boolean; upd?: boolean }> {
  state: { err: boolean; upd?: boolean } = { err: false }
  static getDerivedStateFromError(e: unknown) { return { err: true, upd: isChunkError(e) } }
  componentDidCatch(e: unknown) { console.error("Akno crash", e); if (isChunkError(e)) recoverChunkError() }
  render() {
    // update59 · morceau d'une ancienne version introuvable : même bouton bleu que dans l'en-tête
    if (this.state.err && this.state.upd) return <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 bg-black px-6 text-center text-white"><p className="text-[15px] text-white/60">Une nouvelle version d'Akno est disponible.</p><button onClick={() => void applyUpdate()} className="flex h-[52px] items-center gap-2.5 rounded-full px-7 text-[16px] font-semibold text-white" style={{ background: "#0A84FF" }}><CloudDownload size={19} strokeWidth={2} />Redémarrer pour mettre à jour</button></div>
    return this.state.err ? <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 bg-black px-6 text-center text-white"><p className="text-[15px] text-white/60">Un problème est survenu.</p><button onClick={() => location.reload()} className="h-[52px] rounded-full bg-white px-8 text-[16px] font-semibold text-black">Recharger</button></div> : this.props.children
  }
}
initAppUpdate()
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
  useEffect(() => { let hid = 0; const f = () => { if (document.hidden) hid = Date.now(); else if (hid && Date.now() - hid > 30000 && uid && hasLock(uid) && !isVoiceCallActive()) setLocked(true) }; document.addEventListener("visibilitychange", f); return () => document.removeEventListener("visibilitychange", f) }, [uid])
  // update47 · La création du code n'est plus proposée dès la connexion : Gate déclenche « akno-lock-setup »
  // une fois l'offre choisie / l'onboarding terminé, juste avant d'entrer dans l'app.
  useEffect(() => { if (!uid) setLocked(false) }, [uid])
  useEffect(() => { const f = () => setSetup(true); addEventListener("akno-lock-setup", f); return () => removeEventListener("akno-lock-setup", f) }, [])
  if (!ready || ses === undefined) return <div className="fixed inset-0 bg-black" />
  if (ses && locked) return <LockScreen uid={ses.user.id} onUnlock={() => setLocked(false)} />
  if (ses && setup && !rec) return <LockSetup uid={ses.user.id} email={ses.user.email || ""} onDone={() => { localStorage.setItem(`akno-lock-asked:${ses.user.id}`, "1"); setSetup(false) }} />
  if (rec && ses) return <Login mode="reset" onDone={() => { setRec(false); history.replaceState(null, "", "/reception") }} />
  // update49 · parcours d'accueil (vous → offre → entreprise → code) AVANT l'app, déduit des données serveur
  return ses ? <Flow key={ses.user.id} ses={ses}><AknoApp key={ses.user.id} /></Flow> : <Login mode={new URLSearchParams(location.search).has("signup") || location.pathname === "/inscription" ? "signup" : "login"} />
}
