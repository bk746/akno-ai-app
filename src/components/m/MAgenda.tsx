/* Refonte iOS passe 2 · Agenda mobile (maquettes 03-Agenda/agenda-v7-jour|semaine|mois|equipe|salarie).
   Jour : bande de la semaine + liste du jour · Semaine : grille L→V colorée par salarié · Mois : calendrier + liste du jour choisi ·
   Équipe : une carte par salarié (ses RDV du jour, « Libre » sinon). Filtre salarié en haut de la feuille (« Toute l'équipe »).
   Changer de jour / semaine / mois : glisser horizontalement (le bouton ↻ de la capsule revient à aujourd'hui). */
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { motion } from "motion/react"
import { Check, ChevronDown, MapPin, Phone, Users } from "lucide-react"
import type { Ev } from "../../lib/store"
import { addDays } from "../../lib/store"
import { loadChantiers, teamOf, useChantiers, type Employe } from "../../lib/chantiers"
import { effectiveStatus } from "../../lib/chantierCalc"
import { EmpAvatar } from "../chantiers/parts"
import ModalSheet from "../sheet/ModalSheet"
import { hapticTap } from "../../lib/haptics"

export type AgV = "j" | "s" | "m" | "e"
const dd = (iso: string) => new Date(iso + "T12:00:00")
const _n = new Date()
export const TODAY_M = `${_n.getFullYear()}-${String(_n.getMonth() + 1).padStart(2, "0")}-${String(_n.getDate()).padStart(2, "0")}`
const NOW_H = _n.getHours() + _n.getMinutes() / 60
export const hh2 = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`
const durL = (d: number) => d < 1 ? `${Math.round(d * 60)} min` : `${String(Math.round(d * 10) / 10).replace(".", ",")} h`
const L1 = ["L", "M", "M", "J", "V", "S", "D"]
export const MONTHS_L = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
const LONG = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
const cap = (w: string) => w[0].toUpperCase() + w.slice(1)
export const monOf = (x: string) => addDays(x, -((dd(x).getDay() + 6) % 7))
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
export const addMonth = (x: string, n: number) => { const d = dd(x); const t = new Date(d.getFullYear(), d.getMonth() + n, 1, 12); const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate(); t.setDate(Math.min(d.getDate(), last)); return iso(t) }
export const dayLong = (x: string) => { const d = dd(x); return `${LONG[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTHS_L[d.getMonth()]}` }
/** couleurs des salariés (maquette : Julien bleu, Karim vert, Thomas ocre, Sarah mauve) */
export const EMP_C = ["#5B7DB1", "#5E9C8A", "#B08D57", "#9A7BA8", "#C0766B", "#6F8FA8", "#8C9A5B"]
export const empColor = (emps: Employe[], id?: string | null) => { const i = id ? emps.findIndex(e => e.id === id) : -1; return i < 0 ? "#8E8E93" : EMP_C[i % EMP_C.length] }
export const empShort = (e: Employe) => `${e.first_name}${e.last_name ? ` ${e.last_name[0]}.` : ""}`
const hot = (e: Ev) => e.date === TODAY_M && e.start <= NOW_H && NOW_H < e.start + e.dur
const city = (a?: string) => { if (!a) return ""; const m = a.match(/\d{5}\s+([^,]+)/); return (m ? m[1] : a.split(",").slice(-1)[0] || "").trim() }

/** glisser horizontalement pour changer de période */
function Swipe({ onMove, children }: { onMove: (n: number) => void; children: ReactNode }) {
  return <motion.div drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={.18} dragDirectionLock dragSnapToOrigin
    onDragEnd={(_e, i) => { if (Math.abs(i.offset.x) > 60 || Math.abs(i.velocity.x) > 500) { void hapticTap("select"); onMove(i.offset.x < 0 ? 1 : -1) } }} style={{ touchAction: "pan-y" }}>{children}</motion.div>
}

/** pastille « Toute l'équipe » */
export function TeamPill({ sel, emps, onOpen }: { sel: string[] | null; emps: Employe[]; onOpen: () => void }) {
  const l = !sel || sel.length === emps.length ? "Toute l'équipe" : sel.length === 1 ? empShort(emps.find(e => e.id === sel[0]) || emps[0]) : `${sel.length} salariés`
  return <button type="button" onClick={() => { void hapticTap(); onOpen() }} aria-label={`Filtrer par salarié : ${l}`} className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[18px] bg-[#F2F2F7] pl-[11px] pr-2.5 text-[14px] font-semibold text-[#1C1C1E] active:opacity-70">
    <Users size={16} strokeWidth={1.75} className="text-[#3C3C43]" />{l}<ChevronDown size={15} strokeWidth={2} className="text-[#3C3C43]" />
  </button>
}
export const HRow = ({ t, right, className = "" }: { t: ReactNode; right?: ReactNode; className?: string }) =>
  <div className={`flex min-h-14 items-center justify-between gap-2 px-1 pb-1 pt-3.5 ${className}`}><h2 className="min-w-0 truncate text-[22px] font-semibold leading-7 tracking-[-0.01em] text-[#000]">{t}</h2>{right}</div>

/** bande L → D (maquette .strip / .d) */
export function Strip({ cur, evs, onPick, onMove }: { cur: string; evs: Ev[]; onPick: (d: string) => void; onMove: (n: number) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(monOf(cur), i))
  return <Swipe onMove={onMove}><div className="flex justify-between px-1 pt-1.5">{days.map((x, i) => { const on = x === cur, n = evs.some(e => e.date === x && e.kind !== "absence"), we = i >= 5
    return <button key={x} type="button" onClick={() => { void hapticTap("select"); onPick(x) }} aria-label={dayLong(x)} aria-pressed={on} className="flex h-[68px] w-9 flex-col items-center gap-0.5">
      <span className="text-[11px] font-semibold leading-[14px] tracking-[.02em] text-[#6E6E73]">{L1[i]}</span>
      <b className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-full text-[17px] leading-none ${on ? "bg-[#000] font-semibold text-[#fff]" : `font-medium ${we || x === TODAY_M ? "" : ""} ${we ? "text-[#6E6E73]" : "text-[#000]"}`}`}>{dd(x).getDate()}</b>
      <i className="mt-[3px] h-1 w-1 rounded-full" style={{ background: n && !on ? "#8E8E93" : "transparent" }} />
    </button> })}</div></Swipe>
}

/** ligne de RDV (maquette .row + .tt) */
export function EvRow({ e, onEv, first, dur = true }: { e: Ev; onEv: (e: Ev) => void; first?: boolean; dur?: boolean }) {
  const sub = [e.topic, city(e.addr)].filter(Boolean).join(" · ")
  const tel = (e.phone || "").replace(/[^\d+]/g, "")
  return <div className="relative flex h-[60px] items-center pl-1">
    <button type="button" onClick={() => { void hapticTap(); onEv(e) }} className="flex h-full min-w-0 flex-1 items-center text-left active:opacity-60">
      <span className="mr-3 w-12 shrink-0"><b className="block text-[15px] font-semibold leading-5 tabular-nums text-[#000]">{e.kind === "absence" ? "—" : hh2(e.start)}</b>{dur && <span className="block text-[13px] leading-4 text-[#6E6E73]">{durL(e.dur)}</span>}</span>
      <span className="min-w-0 flex-1 pr-0.5"><span className="flex items-baseline justify-between gap-2"><span className="truncate text-[17px] font-semibold leading-[22px] tracking-[-0.01em] text-[#000]">{e.name}</span>{hot(e) && <span className="flex shrink-0 items-center gap-[5px] text-[13px] font-semibold text-[#B25E00]"><i className="h-1.5 w-1.5 rounded-full bg-[#FF9F0A]" />En cours</span>}</span><span className="block truncate text-[15px] leading-5 text-[#6E6E73]">{sub}</span></span>
    </button>
    {dur && (e.addr || tel) && <a href={e.addr ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(e.addr)}` : `tel:${tel}`} target={e.addr ? "_blank" : undefined} rel="noreferrer" aria-label={e.addr ? `Itinéraire vers ${e.name}` : `Appeler ${e.name}`} onClick={() => void hapticTap()} className="ml-0.5 flex h-11 w-11 shrink-0 items-center justify-center"><span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[rgba(118,118,128,.12)] text-[#1C1C1E]">{e.addr ? <MapPin size={18} strokeWidth={1.6} /> : <Phone size={17} strokeWidth={1.6} />}</span></a>}
    {!first && <span aria-hidden className="absolute left-[64px] right-1 top-0 h-[.5px] bg-[rgba(60,60,67,.16)]" />}
  </div>
}
const Empty = ({ t, on }: { t: string; on?: () => void }) => <button type="button" onClick={on} className="mt-1 flex h-[60px] w-full items-center justify-center rounded-[16px] bg-[#F2F2F7] text-[15px] text-[#6E6E73]">{t}</button>

export function AgDay({ cur, evs, onEv, onPick, onMove, pill, onNew }: { cur: string; evs: Ev[]; onEv: (e: Ev) => void; onPick: (d: string) => void; onMove: (n: number) => void; pill: ReactNode; onNew: () => void }) {
  const list = evs.filter(e => e.date === cur).sort((a, b) => a.start - b.start)
  return <>
    <Strip cur={cur} evs={evs} onPick={onPick} onMove={n => onMove(7 * n)} />
    <HRow t={cur === TODAY_M ? "Aujourd’hui" : cur === addDays(TODAY_M, 1) ? "Demain" : dayLong(cur)} right={pill} />
    {list.length ? list.map((e, i) => <EvRow key={e.id} e={e} onEv={onEv} first={i === 0} />) : <Empty t="Journée libre · touchez pour ajouter un RDV" on={onNew} />}
  </>
}

export function AgWeek({ cur, evs, emps, onEv, onSlot, onMove, pill }: { cur: string; evs: Ev[]; emps: Employe[]; onEv: (e: Ev) => void; onSlot: (d: string, h: number) => void; onMove: (n: number) => void; pill: ReactNode }) {
  const m0 = monOf(cur), wkend = (dd(cur).getDay() + 6) % 7 >= 5 || evs.some(e => e.kind !== "absence" && (e.date === addDays(m0, 5) || e.date === addDays(m0, 6)))
  const days = Array.from({ length: wkend ? 7 : 5 }, (_, i) => addDays(m0, i))
  const wk = evs.filter(e => days.includes(e.date) && e.kind !== "absence")
  const h0 = Math.min(8, ...wk.map(e => Math.floor(e.start))), h1 = Math.max(18, ...wk.map(e => Math.ceil(e.start + e.dur)))
  const PH = 44, H = (h1 - h0) * PH
  const a = dd(days[0]), b = dd(days[days.length - 1]), mo = (d: Date) => d.toLocaleDateString("fr-FR", { month: "short" })
  const t = `${a.getDate()}${a.getMonth() !== b.getMonth() ? ` ${mo(a)}` : ""} – ${b.getDate()} ${mo(b)}`
  const used = emps.filter(e => wk.some(x => x.employeId === e.id))
  return <Swipe onMove={n => onMove(7 * n)}>
    <HRow t={t} right={pill} />
    {used.length > 0 && <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 pb-2">{used.map(e => <span key={e.id} className="flex items-center gap-1.5 text-[12px] text-[#6E6E73]"><i className="h-[7px] w-[7px] rounded-full" style={{ background: empColor(emps, e.id) }} />{e.first_name}</span>)}</div>}
    <div className="-mx-4 flex pl-10 pr-4">{days.map(x => <div key={x} className="flex h-[52px] flex-1 flex-col items-center"><span className="text-[11px] font-semibold leading-[14px] text-[#6E6E73]">{L1[(dd(x).getDay() + 6) % 7]}</span><b className={`mt-[3px] flex h-8 w-8 items-center justify-center rounded-full text-[17px] leading-none ${x === TODAY_M ? "bg-[#000] font-semibold text-[#fff]" : "font-medium text-[#000]"}`}>{dd(x).getDate()}</b></div>)}</div>
    <div className="relative -mx-4 ml-6 mr-0 mt-1.5 pl-4 pr-4" style={{ height: H + 8 }}>
      <div className="relative ml-0 h-full" style={{ marginLeft: 0 }}>
        {Array.from({ length: (h1 - h0) + 1 }, (_, i) => <div key={i} className="absolute -left-8 right-0 h-[.5px] bg-[rgba(60,60,67,.10)]" style={{ top: i * PH }}>{i % 2 === 0 && <em className="absolute -top-[7px] left-0 bg-[#fff] pr-[5px] text-[11px] not-italic tabular-nums text-[#8E8E93]">{hh2(h0 + i)}</em>}</div>)}
        <div className="absolute inset-0 flex">{days.map(x => <div key={x} className="relative h-full flex-1" onClick={ev => { const r = (ev.currentTarget as HTMLDivElement).getBoundingClientRect(); const h = h0 + Math.floor(((ev.clientY - r.top) / PH) * 2) / 2; onSlot(x, h) }}>
          {wk.filter(e => e.date === x).map(e => { const c = empColor(emps, e.employeId)
            return <button key={e.id} type="button" onClick={ev => { ev.stopPropagation(); void hapticTap(); onEv(e) }} aria-label={`${e.name}, ${hh2(e.start)}`} className="absolute left-[3px] right-[3px] overflow-hidden rounded-[8px] pl-2 pr-0.5 pt-[5px] text-left" style={{ top: (e.start - h0) * PH + 1.5, height: Math.max(22, e.dur * PH - 3), background: `${c}22`, boxShadow: `inset 2.5px 0 0 ${c}` }}>
              <b className="block truncate text-[12.5px] font-semibold leading-4 text-[#000]">{e.name.split(" ")[0]}</b><i className="mt-px block text-[11px] not-italic leading-[14px] tabular-nums text-[#6E6E73]">{hh2(e.start)}</i>
            </button> })}
        </div>)}</div>
      </div>
    </div>
  </Swipe>
}

export function AgMonth({ cur, evs, onEv, onPick, onMove, pill }: { cur: string; evs: Ev[]; onEv: (e: Ev) => void; onPick: (d: string) => void; onMove: (n: number) => void; pill: ReactNode }) {
  const d = dd(cur), first = iso(new Date(d.getFullYear(), d.getMonth(), 1, 12)), st = monOf(first)
  const weeks = Math.ceil(((dd(first).getDay() + 6) % 7 + new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()) / 7)
  const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(st, i))
  const list = evs.filter(e => e.date === cur).sort((a, b) => a.start - b.start)
  return <>
    <Swipe onMove={onMove}>
      <HRow t={`${cap(MONTHS_L[d.getMonth()])} ${d.getFullYear()}`} right={pill} />
      <div className="grid grid-cols-7 px-1 pb-1 pt-1">{L1.map((l, i) => <span key={i} className="text-center text-[11px] font-semibold leading-[14px] text-[#6E6E73]">{l}</span>)}</div>
      <div className="grid grid-cols-7 px-1 pt-1">{cells.map(x => { const out = x.slice(0, 7) !== cur.slice(0, 7), on = x === cur, n = evs.some(e => e.date === x && e.kind !== "absence")
        return <button key={x} type="button" onClick={() => { void hapticTap("select"); onPick(x) }} aria-label={dayLong(x)} aria-pressed={on} className="flex h-[46px] flex-col items-center">
          <b className={`flex h-[34px] w-[34px] items-center justify-center rounded-full text-[17px] leading-none ${on ? "bg-[#000] font-semibold text-[#fff]" : out ? "font-normal text-[#C7C7CC]" : "font-normal text-[#000]"}`}>{dd(x).getDate()}</b>
          <i className="mt-0.5 h-1 w-1 rounded-full" style={{ background: n && !on && !out ? "#8E8E93" : "transparent" }} />
        </button> })}</div>
    </Swipe>
    <div className="-mx-4 mt-2 border-t border-[rgba(60,60,67,.16)] px-5 pb-1 pt-4 text-[15px] font-semibold text-[#6E6E73]">{dayLong(cur)}</div>
    {list.length ? list.map((e, i) => <EvRow key={e.id} e={e} onEv={onEv} first={i === 0} dur={false} />) : <p className="px-1 py-3 text-[15px] text-[#6E6E73]">Aucun rendez-vous.</p>}
  </>
}

export function AgTeam({ cur, evs, emps, onEv }: { cur: string; evs: Ev[]; emps: Employe[]; onEv: (e: Ev) => void }) {
  const st = useChantiers()
  const day = evs.filter(e => e.date === cur && e.kind !== "absence").sort((a, b) => a.start - b.start)
  const sites = st.rows.filter(c => effectiveStatus(c, cur) === "in_progress").map(c => ({ c, team: teamOf(c.id, st) })).filter(x => x.team.length > 1)
  const card = "mt-2.5 rounded-[20px] bg-[#F2F2F7] px-4 py-3.5"
  const unassigned = day.filter(e => !e.employeId)
  const pm = (e: Ev) => e.start >= 12
  return <>
    <HRow t={dayLong(cur)} />
    {sites.map(({ c, team }) => <div key={c.id} className={card}><div className="flex min-h-[34px] items-center gap-3"><span className="flex w-[82px] shrink-0">{team.slice(0, 3).map((e, i) => <span key={e.id} className="rounded-full border-2 border-[#F2F2F7]" style={{ marginLeft: i ? -12 : 0 }}><EmpAvatar e={e} size={34} light /></span>)}</span><span className="min-w-0 flex-1"><span className="block truncate text-[17px] font-semibold leading-[22px] text-[#000]">{c.client_nom || c.title}</span><span className="mt-px block truncate text-[14px] leading-[18px] text-[#6E6E73]">Chantier · {c.title}</span></span></div></div>)}
    {sites.length > 0 && <div className="px-1 pt-5 text-[13px] font-semibold tracking-[.01em] text-[#6E6E73]">{day.some(pm) ? "Cet après-midi" : "Rendez-vous"}</div>}
    {emps.map(e => { const mine = day.filter(x => x.employeId === e.id)
      return <div key={e.id} className={card}><div className="flex min-h-[34px] items-center gap-3"><EmpAvatar e={e} size={34} light /><span className="min-w-0 flex-1 truncate text-[17px] font-semibold leading-[22px] text-[#000]">{empShort(e)}</span>{!mine.length && <em className="ml-auto text-[15px] not-italic text-[#6E6E73]">Libre</em>}</div>
        {mine.map(x => <button key={x.id} type="button" onClick={() => onEv(x)} className="flex w-full gap-3.5 pl-[46px] pt-2.5 text-left text-[15px] leading-5 text-[#000]"><span className="w-11 shrink-0 tabular-nums text-[#6E6E73]">{hh2(x.start)}</span><span className="truncate">{x.name}</span></button>)}
      </div> })}
    {unassigned.length > 0 && <div className={card}><div className="flex min-h-[34px] items-center gap-3"><span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[#fff] text-[#3C3C43]"><Users size={17} strokeWidth={1.75} /></span><span className="min-w-0 flex-1 truncate text-[17px] font-semibold leading-[22px] text-[#000]">Non assignés</span></div>
      {unassigned.map(x => <button key={x.id} type="button" onClick={() => onEv(x)} className="flex w-full gap-3.5 pl-[46px] pt-2.5 text-left text-[15px] leading-5 text-[#000]"><span className="w-11 shrink-0 tabular-nums text-[#6E6E73]">{hh2(x.start)}</span><span className="truncate">{x.name}</span></button>)}</div>}
    {!emps.length && !day.length && <p className="px-1 py-4 text-[15px] text-[#6E6E73]">Aucun salarié ni rendez-vous ce jour.</p>}
  </>
}

/** feuille « Équipe » : choix des salariés affichés (maquette agenda-v7-salarie) */
export function TeamFilterSheet({ emps, sel, onDone, onClose }: { emps: Employe[]; sel: string[] | null; onDone: (s: string[] | null) => void; onClose: () => void }) {
  const [x, setX] = useState<string[]>(sel || emps.map(e => e.id))
  const all = x.length === emps.length
  const tog = (id: string) => { void hapticTap("select"); setX(v => v.includes(id) ? v.filter(y => y !== id) : [...v, id]) }
  const Ck = ({ on, c }: { on: boolean; c: string }) => <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={on ? { background: c } : { boxShadow: "inset 0 0 0 1.5px #C7C7CC" }}>{on && <Check size={14} strokeWidth={2.6} className="text-[#fff]" />}</span>
  const row = "relative flex h-16 w-full items-center gap-3 px-4 text-left"
  return <ModalSheet label="Équipe" onClose={onClose} z={60} backdrop="bg-black/40" className="rounded-t-[40px] bg-[#F2F2F7] px-5 pt-2" style={{ paddingBottom: "max(var(--sab), 20px)" }}>
    <div className="akno-light">
      <div className="flex items-center justify-between pb-4 pt-1"><h2 className="text-[22px] font-semibold text-[#000]">Équipe</h2><button type="button" onClick={() => { void hapticTap(); onDone(x.length === emps.length || !x.length ? null : x) }} className="h-9 rounded-[18px] bg-[#000] px-4 text-[15px] font-semibold text-[#fff]">OK</button></div>
      <div className="overflow-hidden rounded-[20px] bg-[#fff]">
        <button type="button" onClick={() => { void hapticTap("select"); setX(all ? [] : emps.map(e => e.id)) }} className={row}><span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F2F2F7] text-[#3C3C43]"><Users size={18} strokeWidth={1.75} /></span><span className="min-w-0 flex-1"><span className="block text-[17px] font-semibold leading-[22px] text-[#000]">Toute l’équipe</span><span className="block text-[14px] leading-[18px] text-[#6E6E73]">{emps.length} personne{emps.length > 1 ? "s" : ""}</span></span><Ck on={all} c="#1C1C1E" /></button>
        {emps.map(e => <button key={e.id} type="button" onClick={() => tog(e.id)} className={`${row} before:absolute before:left-16 before:right-0 before:top-0 before:h-[.5px] before:bg-[rgba(60,60,67,.16)]`}><EmpAvatar e={e} size={36} light /><span className="min-w-0 flex-1"><span className="block truncate text-[17px] font-semibold leading-[22px] text-[#000]">{empShort(e)}</span><span className="block truncate text-[14px] leading-[18px] text-[#6E6E73]">{e.role || "Métier à préciser"}</span></span><Ck on={x.includes(e.id)} c={empColor(emps, e.id)} /></button>)}
      </div>
      {!emps.length && <p className="px-1 pt-4 text-[14px] text-[#6E6E73]">Ajoutez vos salariés dans Réglages › Salariés.</p>}
    </div>
  </ModalSheet>
}

/** état partagé de l'agenda mobile */
export function useAgendaM() {
  const st = useChantiers()
  useEffect(() => { if (!st.ready) void loadChantiers() }, [st.ready])
  const [v, setV] = useState<AgV>("j"), [cur, setCur] = useState(TODAY_M), [sel, setSel] = useState<string[] | null>(null), [pick, setPick] = useState(false)
  const emps = st.employes
  const filt = useMemo(() => (e: Ev) => !sel || (!!e.employeId && sel.includes(e.employeId)), [sel])
  return { v, setV, cur, setCur, sel, setSel, pick, setPick, emps, filt }
}
