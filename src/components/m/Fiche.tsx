/* Refonte iOS passe 2 · fiches poussées (maquettes 01-Reception/fiche-contact, 02-Contacts/fiche-client, 04-Equipe/fiche-salarie) :
   haut noir (retour + « Modifier », photo 96 pt, nom 30 pt, état, 4 actions rondes, Détails | Historique),
   puis contenu : cartes sombres (contact issu d'un appel) ou feuille blanche (client, salarié). */
import { type ReactNode, useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { motion } from "motion/react"
import { ChevronRight } from "lucide-react"
import { hapticTap } from "../../lib/haptics"
import { BackBtn, GlassBtn, PushScroll } from "./MPage"
import { Segmented } from "../nav/IosPage"

export type FAct = { I: any; l: string; href?: string; on?: () => void; ext?: boolean; dis?: boolean }

function ActBtn({ a, primary, dark }: { a: FAct; primary?: boolean; dark?: boolean }) {
  const circle = <span className={`flex items-center justify-center rounded-full ${dark ? "h-14 w-14" : "h-[52px] w-[52px]"}`} style={{ background: primary ? "#fff" : dark ? "#1C1C1E" : "rgba(255,255,255,.14)", color: primary ? "#000" : "#fff", boxShadow: dark && !primary ? "inset 0 .5px 0 rgba(255,255,255,.1)" : undefined }}><a.I size={21} strokeWidth={1.6} /></span>
  const lab = <span className={`text-[12px] font-medium ${dark ? "text-[#AEAEB2]" : "text-[#EBEBF5]"}`}>{a.l}</span>
  const cls = `flex w-[68px] flex-col items-center ${dark ? "gap-1.5" : "gap-[7px]"} [-webkit-tap-highlight-color:transparent] disabled:opacity-35`
  if (a.href && !a.dis) return <motion.a whileTap={{ scale: .9 }} href={a.href} target={a.ext ? "_blank" : undefined} rel={a.ext ? "noreferrer" : undefined} onClick={() => { void hapticTap(); a.on?.() }} className={cls} aria-label={a.l}>{circle}{lab}</motion.a>
  return <motion.button type="button" whileTap={{ scale: .9 }} disabled={a.dis || !a.on} onClick={() => { void hapticTap(); a.on?.() }} className={cls} aria-label={a.l}>{circle}{lab}</motion.button>
}

/** sélecteur étroit en verre de la fiche contact (232 pt) */
function NarrowSeg<T extends string>({ value, items, onPick }: { value: T; items: [T, string][]; onPick: (v: T) => void }) {
  return <div role="tablist" className="mx-auto mt-6 flex h-9 w-[232px] rounded-[18px] border-[.5px] border-[rgba(255,255,255,.12)] bg-[rgba(120,120,128,.24)] p-[3px]">
    {items.map(([k, l]) => <button key={k} role="tab" type="button" aria-selected={value === k} onClick={() => { if (value !== k) { void hapticTap("select"); onPick(k) } }}
      className={`flex-1 rounded-[15px] text-[14px] ${value === k ? "bg-[rgba(255,255,255,.18)] font-semibold text-[#fff]" : "font-medium text-[#EBEBF5]"}`}>{l}</button>)}
  </div>
}

export type Tab = "det" | "hist"
export function FicheShell({ name, sub, status, avatar, acts, tab, onTab, onBack, onEdit, editLabel = "Modifier", dark, children, extraTop }: {
  name: string; sub?: ReactNode; status?: ReactNode; avatar: ReactNode; acts: FAct[]; tab: Tab; onTab: (t: Tab) => void; onBack: () => void; onEdit?: () => void; editLabel?: string
  /** variante « contact » : tout en sombre, cartes #1C1C1E */
  dark?: boolean; children: ReactNode; extraTop?: ReactNode
}) {
  const head = <div className={`relative ${dark ? "bg-[radial-gradient(90%_380px_at_50%_120px,#2a2a2e,rgba(20,20,22,0)_70%),linear-gradient(#0d0d0f,#000_600px)]" : "bg-[#000]"}`} style={{ paddingTop: dark ? "calc(max(calc(var(--sat) + 5px), 6px) + 60px)" : "calc(max(calc(var(--sat) - 7px), 6px) + 52px)" }}>
    <div className="flex flex-col items-center px-4">
      {avatar}
      <h1 className={`${dark ? "mt-3.5" : "mt-4"} max-w-full truncate text-center text-[30px] leading-9 tracking-[-0.025em] text-[#fff] ${dark ? "font-bold" : "font-semibold"}`}>{name}</h1>
      {sub && <div className="mt-0.5 text-center text-[17px] leading-[22px] text-[rgba(235,235,245,.6)]">{sub}</div>}
      {status && <div className={`${dark ? "mt-0.5" : "mt-1.5"} flex items-center justify-center gap-1.5 text-center text-[15px] leading-5`}>{status}</div>}
    </div>
    <div className={`flex justify-between ${dark ? "px-[30px] pt-[22px]" : "px-[24px] pt-5"}`}>{acts.map((a, i) => <ActBtn key={a.l} a={a} primary={i === 0} dark={dark} />)}</div>
    {extraTop}
    {dark ? <NarrowSeg value={tab} onPick={onTab} items={[["det", "Détails"], ["hist", "Historique"]]} />
      : <div className="px-5 pb-[62px] pt-6"><Segmented label="Détails ou historique" layoutId={`fiche-seg-${name}`} value={tab} onPick={onTab} items={[["det", "Détails"], ["hist", "Historique"]]} /></div>}
  </div>
  return <PushScroll dark={dark ? true : undefined} at={dark ? 220 : 300} title={name} sub={typeof sub === "string" ? sub : undefined}
    left={<BackBtn on={onBack} dark={dark} />} right={onEdit ? <GlassBtn dark={dark} on={onEdit}>{editLabel}</GlassBtn> : undefined}
    head={head}>
    {dark ? <div className="px-4 pt-6">{children}</div>
      : <div className="ak-sheet akno-light relative z-[1] -mt-10 min-h-[60dvh] px-5 pb-2"><div aria-hidden className="ak-grab" /><div className="pt-1">{children}</div></div>}
  </PushScroll>
}

/* ---- briques sombres (fiche contact) ---- */
export const DBlk = ({ children, className = "" }: { children: ReactNode; className?: string }) => <div className={`mt-4 rounded-[20px] bg-[#1C1C1E] shadow-[inset_0_.5px_0_rgba(255,255,255,.07)] first:mt-0 ${className}`}>{children}</div>
export function DRow({ l, v, href, on, first }: { l: string; v: ReactNode; href?: string; on?: () => void; first?: boolean }) {
  const inner = <><span className="min-w-0 flex-1"><span className="block text-[13px] leading-4 text-[#8E8E93]">{l}</span><span className="mt-px block truncate text-[17px] leading-[22px] text-[#fff]">{v}</span></span><ChevronRight size={18} className="shrink-0 text-[#636366]" /></>
  const cls = `relative flex min-h-14 w-full items-center pl-5 pr-4 text-left ${first ? "" : "before:absolute before:left-5 before:right-0 before:top-0 before:h-[.5px] before:bg-[rgba(255,255,255,.1)]"}`
  return href ? <a href={href} className={cls}>{inner}</a> : <button type="button" onClick={on} className={cls}>{inner}</button>
}

/* ---- briques claires (fiche client / salarié) ---- */
export function KV({ k, v, href, first }: { k: string; v: ReactNode; href?: string; first?: boolean }) {
  const cls = `relative flex min-h-[54px] items-center px-[18px] text-[17px] ${first ? "" : "before:absolute before:left-[18px] before:right-0 before:top-0 before:h-[.5px] before:bg-[rgba(60,60,67,.16)]"}`
  const inner = <><span className="w-24 shrink-0 text-[#6E6E73]">{k}</span><span className="min-w-0 flex-1 whitespace-pre-line break-words py-2 leading-[22px] text-[#000]">{v}</span></>
  return href ? <a href={href} className={cls}>{inner}</a> : <div className={cls}>{inner}</div>
}
export const LSec = ({ t, aside, first }: { t: ReactNode; aside?: ReactNode; first?: boolean }) => <div className={`flex items-center justify-between px-0 pb-2.5 ${first ? "pt-5" : "pt-[26px]"}`}><h2 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-[#000]">{t}</h2>{aside}</div>
export const LCard = ({ children, className = "" }: { children: ReactNode; className?: string }) => <div className={`overflow-hidden rounded-[20px] bg-[#F2F2F7] ${className}`}>{children}</div>
/** ligne de document (devis / facture) d'une fiche : icône blanche 40 pt, titre, détail, montant + statut */
export function DocLine({ I, t, s, am, st, on, first }: { I: any; t: string; s: ReactNode; am: string; st?: ReactNode; on?: () => void; first?: boolean }) {
  return <button type="button" onClick={() => { void hapticTap(); on?.() }} className={`relative flex h-[68px] w-full items-center pl-4 text-left active:bg-black/[.03] ${first ? "" : "before:absolute before:left-[68px] before:right-0 before:top-0 before:h-[.5px] before:bg-[rgba(60,60,67,.16)]"}`}>
    <span className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-[#fff] text-[#1C1C1E] shadow-[0_0_0_.5px_rgba(0,0,0,.06)]"><I size={19} strokeWidth={1.6} /></span>
    <span className="min-w-0 flex-1"><span className="block truncate text-[17px] font-medium leading-[22px] text-[#000]">{t}</span><span className="block truncate text-[14px] leading-[19px] text-[#6E6E73]">{s}</span></span>
    <span className="flex shrink-0 flex-col items-end gap-[3px] pr-4"><b className="text-[17px] font-semibold leading-[22px] tabular-nums text-[#000]">{am}</b>{st}</span>
  </button>
}
/** appel d'une fiche (titre, date, résumé) */
export function CallLine({ t, m, s, first, children }: { t: string; m: string; s?: string; first?: boolean; children?: ReactNode }) {
  return <div className={`relative px-[18px] py-3.5 ${first ? "" : "before:absolute before:left-[18px] before:right-0 before:top-0 before:h-[.5px] before:bg-[rgba(60,60,67,.16)]"}`}>
    <div className="flex items-baseline justify-between gap-2"><span className="truncate text-[17px] font-medium leading-[22px] text-[#000]">{t}</span><span className="shrink-0 whitespace-nowrap text-[13px] text-[#6E6E73]">{m}</span></div>
    {s && <p className="mt-1 text-[15px] leading-[21px] text-[#3C3C43]">{s}</p>}
    {children}
  </div>
}
/** frise d'historique (maquettes chantier-fiche-journal, relance-historique) */
export function Timeline({ items, dark }: { items: { t: string; w: string; s?: string; hot?: boolean }[]; dark?: boolean }) {
  return <div className="relative">
    {items.map((h, i) => <div key={i} className="relative flex gap-4 pb-5 last:pb-0">
      {i < items.length - 1 && <span aria-hidden className={`absolute left-[5px] top-4 bottom-0 w-px ${dark ? "bg-[rgba(255,255,255,.14)]" : "bg-[rgba(60,60,67,.18)]"}`} />}
      <span aria-hidden className="relative mt-[7px] h-[11px] w-[11px] shrink-0 rounded-full" style={{ background: h.hot ? (dark ? "#fff" : "#000") : dark ? "#636366" : "#C7C7CC" }} />
      <div className="min-w-0 flex-1"><div className={`text-[17px] leading-[22px] ${dark ? "text-[#fff]" : "text-[#000]"}`}>{h.t}</div><div className={`text-[13px] leading-[18px] ${dark ? "text-[#8E8E93]" : "text-[#6E6E73]"}`}>{h.w}{h.s ? ` · ${h.s}` : ""}</div></div>
    </div>)}
  </div>
}

/* factures d'un client (lecture RLS, même requête que ClientFactures) */
export type CFact = { id: string; numero: string | null; type: string; statut: string; total_ttc: number; acompte_deduit: number | null; date_emission: string | null; date_echeance: string | null; objet?: string | null }
export function useClientFactures(name: string) {
  const [rows, setRows] = useState<CFact[] | null>(null)
  useEffect(() => {
    let on = true
    void supabase.from("factures").select("id, numero, type, statut, total_ttc, acompte_deduit, date_emission, date_echeance, objet").ilike("client_nom", name.replace(/[%_]/g, "")).order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => { if (on) setRows((data || []) as CFact[]) }, () => { if (on) setRows([]) })
    return () => { on = false }
  }, [name])
  return rows
}

/* « Modifier » depuis une fiche client : ouvre le formulaire complet de la page Clients */
let editReq: string | null = null
export const requestEditClient = (name: string) => { editReq = name; try { dispatchEvent(new Event("akno-client-edit")) } catch { /* */ } }
export const takeEditClient = () => { const n = editReq; editReq = null; return n }
