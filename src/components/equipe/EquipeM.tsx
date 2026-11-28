/* passe 2 · Équipe mobile (maquettes 04-Equipe/equipe, fiche-salarie, -scroll, -scroll2).
   Page : retour, capsule (+ membre · agenda · …), haut noir « N sur chantier · M disponible(s) », feuille blanche
   « Sur chantier aujourd'hui » / « Disponibles » / « Invitation en attente ». Fiche : photo, métier, statut, 4 actions,
   Planning (semaine + RDV du jour), Informations (+ habilitations / compétences si renseignées), Heures de la semaine, Chantiers récents. */
import { useEffect, useMemo, useState } from "react"
import { AnimatePresence } from "motion/react"
import { CalendarDays, CalendarPlus, ChevronRight, Info, Loader2, MessageSquare, MoreHorizontal, Navigation, Phone, Plus } from "lucide-react"
import { useC, Blob } from "../ui"
import { motion } from "motion/react"
import { IosPage } from "../nav/IosPage"
import { BackBtn, PushLayer, PushScroll } from "../m/MPage"
import { LSec, LCard } from "../m/Fiche"
import { EmpAvatar } from "../chantiers/parts"
import { MemberForm } from "../chantiers/EquipeSheet"
import { Strip, EvRow, TODAY_M, monOf, dayLong, empColor } from "../m/MAgenda"
import { inviteEmploye, loadChantiers, photoUrl, requestOpenChantier, usePhotoTick, useChantiers, type Employe } from "../../lib/chantiers"
import { effectiveStatus, isLateCh, todayISO } from "../../lib/chantierCalc"
import { clientShort, frPhone, groupTeam, invitedAgo, shortName, shortTitle, sitesOf } from "../../lib/equipeCalc"
import { expandRecurring } from "../../lib/agenda"
import { addDays } from "../../lib/store"
import { hapticTap } from "../../lib/haptics"
import type { Ev } from "../../lib/store"

const hhL = (h: number) => `${Math.floor(h)} h${Math.round((h % 1) * 60) ? String(Math.round((h % 1) * 60)).padStart(2, "0") : ""}`
const hm = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`
const WD = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"]
const sep = "before:absolute before:left-[64px] before:right-0 before:top-0 before:h-[.5px] before:bg-[rgba(60,60,67,.16)]"

function useTeamEvents() {
  const { s } = useC()
  return useMemo(() => expandRecurring(s.events, addDays(TODAY_M, -21), addDays(TODAY_M, 42)).filter(e => e.kind !== "absence") as Ev[], [s.events])
}

export default function EquipeM() {
  const { go, toast, setChat } = useC(), st = useChantiers()
  const [openId, setOpenId] = useState<string | null>(null), [form, setForm] = useState<{ e: Employe | null } | null>(null), [rel, setRel] = useState<string | null>(null)
  useEffect(() => { void loadChantiers() }, [])
  const today = todayISO(), evs = useTeamEvents()
  const g = useMemo(() => groupTeam(st.employes, st.rows, st.links, today), [st.employes, st.rows, st.links, today])
  const todayOf = (id: string) => evs.filter(e => e.date === today && e.employeId === id).sort((a, b) => a.start - b.start)
  // sur chantier = chantier en cours assigné ou rendez-vous de chantier aujourd'hui
  const onsite = st.employes.filter(e => e.invite_status !== "pending" && (g.onsite.some(x => x.m.id === e.id) || todayOf(e.id).some(v => v.kind === "chantier")))
  const free = st.employes.filter(e => e.invite_status !== "pending" && !onsite.includes(e)), pending = st.employes.filter(e => e.invite_status === "pending")
  const subOn = (e: Employe) => {
    const v = todayOf(e.id).find(x => x.kind === "chantier"), c = g.onsite.find(x => x.m.id === e.id)?.t.current
    if (v) return `${v.topic ? shortTitle(v.topic) : "Chantier"} ${clientShort(v.name)} · ${hhL(v.start)} – ${hhL(v.start + v.dur)}`
    return c ? `${shortTitle(c.title)} ${clientShort(c.client_nom)}`.trim() : e.role || "Sur chantier"
  }
  const subFree = (e: Employe) => { const n = evs.filter(v => v.employeId === e.id && (v.date > today || (v.date === today && v.start >= new Date().getHours()))).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)[0]
    return n ? `Libre · prochain RDV ${n.date === today ? "aujourd’hui" : n.date === addDays(today, 1) ? "demain" : WD[new Date(n.date + "T12:00:00").getDay()]} ${hm(n.start)}` : `Libre${e.role ? ` · ${e.role}` : ""}` }
  const relancer = async (e: Employe) => { setRel(e.id); const r = await inviteEmploye(e.id); setRel(null); toast(r.ok ? `Invitation renvoyée à ${e.first_name}` : r.error || "Invitation non envoyée.") }
  const Row = ({ e, sub, i, right }: { e: Employe; sub: string; i: number; right?: React.ReactNode }) => <div className={`relative flex h-[64px] items-center gap-3 ${i ? sep : ""}`}>
    <button type="button" onClick={() => { void hapticTap(); setOpenId(e.id) }} className="flex min-w-0 flex-1 items-center gap-3 text-left">
      <span className="rounded-full p-[2px]" style={{ boxShadow: `0 0 0 1.5px ${empColor(st.employes, e.id)}` }}><EmpAvatar e={e} size={40} light /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-[17px] leading-[22px] text-[#000]">{shortName(e)}</span><span className="block truncate text-[15px] leading-5 text-[#6E6E73]">{sub}</span></span>
    </button>
    {right ?? <button type="button" aria-label={`Fiche de ${shortName(e)}`} onClick={() => setOpenId(e.id)} className="flex h-11 w-11 shrink-0 items-center justify-center"><span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[rgba(118,118,128,.12)] text-[#1C1C1E]"><Info size={18} strokeWidth={1.6} /></span></button>}
  </div>
  const member = openId ? st.employes.find(e => e.id === openId) || null : null
  const now = new Date(), stamp = `${dayLong(today)} · ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
  return <>
    <IosPage title="Équipe" lead={<BackBtn on={() => go("ag")} dark />} caps={[{ I: Plus, label: "Ajouter un membre", on: () => setForm({ e: null }), dis: st.missing }, { I: CalendarDays, label: "Agenda de l'équipe", on: () => go("ag") }, { I: MoreHorizontal, label: "Réglages", on: () => go("set") }]}
      hero={<><button type="button" aria-label="Ouvrir l'assistant" onClick={() => setChat(true)} className="flex h-24 w-24 items-center justify-center"><motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}><Blob c="#E6E6E6" s={96} /></motion.div></button><div className="mt-[14px] text-[15px] text-[rgba(235,235,245,.6)]">{stamp}</div><div className="mt-[14px] text-[64px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-[#fff]">{onsite.length}</div><div className="mt-[6px] text-[19px] text-[rgba(235,235,245,.6)]">sur chantier · {free.length} disponible{free.length > 1 ? "s" : ""}</div></>}>
      <div className="akno-light pb-4">
        {st.missing ? <p className="pt-5 text-[15px] text-[#6E6E73]">Appliquez la migration 20261121_11_update64_chantiers_equipe.sql pour activer l’équipe.</p>
          : !st.ready ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[#8E8E93]" /></div>
          : !st.employes.length ? <button type="button" onClick={() => setForm({ e: null })} className="mt-5 flex h-[64px] w-full items-center justify-center gap-2 rounded-[20px] bg-[#F2F2F7] text-[16px] text-[#000]"><Plus size={18} />Ajouter un membre</button>
          : <>
            {onsite.length > 0 && <><h2 className="pb-1.5 pt-[21px] text-[22px] font-semibold leading-7 text-[#000]">Sur chantier aujourd’hui</h2>{onsite.map((e, i) => <Row key={e.id} e={e} i={i} sub={subOn(e)} />)}</>}
            {free.length > 0 && <><h2 className={`pb-1.5 ${onsite.length ? "pt-[30px]" : "pt-[21px]"} text-[22px] font-semibold leading-7 text-[#000]`}>Disponibles</h2>{free.map((e, i) => <Row key={e.id} e={e} i={i} sub={subFree(e)} />)}</>}
            {pending.length > 0 && <><h2 className="pb-1.5 pt-[30px] text-[22px] font-semibold leading-7 text-[#000]">Invitation en attente</h2>{pending.map((e, i) => <Row key={e.id} e={e} i={i} sub={`${e.role || "Membre"} · ${invitedAgo(e.invited_at)}`} right={<button type="button" disabled={rel === e.id} onClick={() => void relancer(e)} className="h-9 shrink-0 rounded-full bg-[#F2F2F7] px-3.5 text-[15px] font-semibold text-[#000]">{rel === e.id ? <Loader2 size={14} className="animate-spin" /> : e.invited_at ? "Relancer" : "Envoyer"}</button>} />)}</>}
          </>}
      </div>
    </IosPage>
    <AnimatePresence>{member && <FicheSalarie key={member.id} e={member} evs={evs} onClose={() => setOpenId(null)} onEdit={() => setForm({ e: member })} />}</AnimatePresence>
    <AnimatePresence>{form && <MemberForm key="mf" initial={form.e} desk={false} onClose={() => setForm(null)} onSaved={id => { if (!form.e) setOpenId(id) }} onDeleted={() => setOpenId(null)} />}</AnimatePresence>
  </>
}

function FAct({ I, l, href, on, dis }: { I: any; l: string; href?: string; on?: () => void; dis?: boolean }) {
  const c = <><span className={`flex h-[52px] w-[52px] items-center justify-center rounded-full ${l === "Appeler" ? "bg-[#fff] text-[#000]" : "bg-[#2C2C2E] text-[#fff]"} ${dis ? "opacity-40" : ""}`}><I size={20} strokeWidth={1.7} /></span><span className="text-[13px] leading-4 text-[#fff]">{l}</span></>
  const cls = "flex w-[76px] flex-col items-center gap-2 active:opacity-70"
  return href && !dis ? <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener" className={cls}>{c}</a> : <button type="button" disabled={dis} onClick={on} className={cls}>{c}</button>
}
const Chip = ({ t }: { t: string }) => <span className="inline-flex h-[34px] items-center rounded-full bg-[#fff] px-3.5 text-[15px] text-[#000] shadow-[0_0_0_.5px_rgba(0,0,0,.08)]">{t}</span>
const arr = (v: unknown) => Array.isArray(v) ? v.filter(x => typeof x === "string" && x.trim()) as string[] : typeof v === "string" && v.trim() ? v.split(",").map(x => x.trim()).filter(Boolean) : []

function FicheSalarie({ e, evs, onClose, onEdit }: { e: Employe; evs: Ev[]; onClose: () => void; onEdit: () => void }) {
  const { go, modal } = useC(), st = useChantiers(); usePhotoTick()
  const [cur, setCur] = useState(TODAY_M), today = todayISO()
  const mine = evs.filter(v => v.employeId === e.id)
  const raw = (e.phone || "").replace(/[^\d+]/g, ""), ph = frPhone(e.phone) || e.phone || ""
  const nowV = mine.find(v => v.date === today && v.kind === "chantier")
  const site = sitesOf(e.id, st.rows, st.links)
  const curSite = site.find(c => effectiveStatus(c) === "in_progress")
  const where = nowV ? `Sur chantier · ${nowV.topic ? shortTitle(nowV.topic) + " " : ""}${clientShort(nowV.name)}` : curSite ? `Sur chantier · ${shortTitle(curSite.title)} ${clientShort(curSite.client_nom)}` : e.invite_status === "pending" ? "Invitation en attente" : "Disponible"
  const dest = nowV?.addr || curSite?.address
  const m0 = monOf(today), days = [0, 1, 2, 3, 4].map(i => addDays(m0, i))
  const hrs = days.map(d => mine.filter(v => v.date === d).reduce((a, v) => a + v.dur, 0)), tot = Math.round(hrs.reduce((a, b) => a + b, 0) * 10) / 10, mx = Math.max(8, ...hrs)
  const habil = arr((e as any).habilitations), comp = arr((e as any).competences)
  const url = photoUrl(e.photo_path)
  const list = mine.filter(v => v.date === cur).sort((a, b) => a.start - b.start)
  const recent = [...site].sort((a, b) => String(b.start_date || "").localeCompare(String(a.start_date || ""))).slice(0, 5)
  const stC = (c: typeof site[number]) => { const s = effectiveStatus(c); return isLateCh(c) ? ["#B25E00", "#FF9F0A", "En retard"] : s === "in_progress" ? ["#1E9E4A", "#34C759", "En cours"] : s === "upcoming" ? ["#0071E3", "#0071E3", "À venir"] : ["#6E6E73", "#8E8E93", "Terminé"] }
  const head = <div className="flex flex-col items-center bg-[#000] px-5 pb-[50px] text-center" style={{ paddingTop: "calc(max(calc(var(--sat) - 9px), 6px) + 52px)" }}>
    <span className="flex h-[100px] w-[100px] items-center justify-center overflow-hidden rounded-full" style={{ boxShadow: `0 0 0 2.5px ${empColor(st.employes, e.id)}` }}>{url ? <img src={url} alt="" className="h-[92px] w-[92px] rounded-full object-cover" /> : <EmpAvatar e={e} size={92} light />}</span>
    <h1 className="mt-3 text-[30px] font-bold leading-9 tracking-[-0.02em] text-[#fff]">{shortName(e)}</h1>
    <div className="mt-1 text-[17px] text-[rgba(235,235,245,.6)]">{e.role || "Membre de l’équipe"}</div>
    <div className="mt-1 flex items-center gap-1.5 text-[15px] text-[rgba(235,235,245,.6)]"><span className="h-[7px] w-[7px] rounded-full" style={{ background: where.startsWith("Sur") ? "#30D158" : where.startsWith("Dispo") ? "#0A84FF" : "#8E8E93" }} />{where}</div>
    <div className="mt-5 flex w-full justify-between px-1">
      <FAct I={Phone} l="Appeler" href={raw ? `tel:${raw}` : undefined} dis={!raw} />
      <FAct I={MessageSquare} l="Message" href={raw ? `sms:${raw}` : undefined} dis={!raw} />
      <FAct I={Navigation} l="Itinéraire" href={dest ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}` : undefined} dis={!dest} />
      <FAct I={CalendarPlus} l="Planifier" on={() => modal({ kind: "rdv", data: { date: today, employeId: e.id } })} />
    </div>
  </div>
  return <PushLayer label={shortName(e)} onClose={onClose} bg="#000">
    <PushScroll at={210} dark noFoot padTop="max(calc(var(--sat) - 9px), 6px)" head={head} title={shortName(e)} sub={e.role || undefined} left={<BackBtn on={onClose} />} right={<button type="button" onClick={onEdit} className="ak-caps flex h-9 items-center rounded-full px-4 text-[16px] font-semibold text-[#000]">Modifier</button>} right2={<span />}>
      <div className="akno-light relative z-[1] -mt-10 rounded-t-[40px] bg-[#fff] px-5" style={{ paddingBottom: "calc(var(--page-bottom) + 24px)", minHeight: "calc(100% - 300px)" }}>
        <div aria-hidden className="flex justify-center pt-2"><span className="block h-[5px] w-11 rounded-[3px] bg-[rgba(60,60,67,.28)]" /></div>
        <div className="flex items-center justify-between pb-2 pt-3"><h2 className="text-[22px] font-semibold leading-7 text-[#000]">Planning</h2>
          <button type="button" onClick={() => go("ag")} className="flex h-9 items-center gap-1.5 rounded-full bg-[#F2F2F7] px-3.5 text-[15px] font-semibold text-[#000]"><CalendarDays size={16} strokeWidth={1.8} />Voir dans l’Agenda<ChevronRight size={15} className="text-[#8E8E93]" /></button></div>
        <Strip cur={cur} evs={mine} onPick={setCur} onMove={n => setCur(x => addDays(x, 7 * n))} />
        <div className="pt-1">{list.length ? list.map((v, i) => <EvRow key={v.id} e={v} first={i === 0} onEv={x => modal({ kind: "ev", data: x })} />) : <p className="py-4 text-[15px] text-[#6E6E73]">Aucun rendez-vous {cur === today ? "aujourd’hui" : "ce jour"}.</p>}</div>
        <LSec t="Informations" />
        <LCard>
          <a href={raw ? `tel:${raw}` : undefined} className="flex h-[52px] items-center px-[18px] text-[17px]"><span className="w-[104px] shrink-0 text-[#6E6E73]">Téléphone</span><span className="truncate text-[#000]">{ph || "—"}</span></a>
          {e.email && <a href={`mailto:${e.email}`} className="relative flex h-[52px] items-center px-[18px] text-[17px] before:absolute before:left-[18px] before:right-0 before:top-0 before:h-[.5px] before:bg-[rgba(60,60,67,.16)]"><span className="w-[104px] shrink-0 text-[#6E6E73]">E-mail</span><span className="truncate text-[#000]">{e.email}</span></a>}
          {habil.length > 0 && <div className="border-t border-[rgba(60,60,67,.16)] px-[18px] pb-4 pt-3"><div className="pb-2.5 text-[14px] font-semibold text-[#6E6E73]">Habilitations</div><div className="flex flex-wrap gap-2">{habil.map(t => <Chip key={t} t={t} />)}</div></div>}
          {comp.length > 0 && <div className="border-t border-[rgba(60,60,67,.16)] px-[18px] pb-4 pt-3"><div className="pb-2.5 text-[14px] font-semibold text-[#6E6E73]">Compétences</div><div className="flex flex-wrap gap-2">{comp.map(t => <Chip key={t} t={t} />)}</div></div>}
        </LCard>
        <LSec t="Heures de la semaine" />
        <LCard className="px-[18px] pb-4 pt-4">
          <div className="flex items-baseline justify-between"><span><b className="text-[34px] font-semibold leading-10 tracking-[-0.02em] text-[#000]">{String(tot).replace(".", ",")} h</b><span className="ml-2 text-[19px] text-[#6E6E73]">prévues</span></span><span className="text-[15px] text-[#6E6E73]">sur 35 h</span></div>
          <div className="mt-4 grid h-[78px] grid-cols-5 items-end gap-6 px-1">{hrs.map((h, i) => <span key={i} className={`block rounded-[10px] ${days[i] === today ? "bg-[#000]" : h ? "bg-[#D1D1D6]" : "bg-[#D1D1D6]"}`} style={{ height: h ? Math.max(14, Math.round(h / mx * 60)) : 3 }} />)}</div>
          <div className="mt-2 grid grid-cols-5 gap-6 px-1 text-center text-[13px]">{["L", "M", "M", "J", "V"].map((l, i) => <span key={i} className={days[i] === today ? "font-semibold text-[#000]" : "text-[#6E6E73]"}>{l}</span>)}</div>
        </LCard>
        {recent.length > 0 && <><LSec t="Chantiers récents" /><LCard>{recent.map((c, i) => { const [tc, dc, l] = stC(c); return <button key={c.id} type="button" onClick={() => { requestOpenChantier(c.id); go("ch") }} className={`relative flex h-[72px] w-full items-center gap-3 px-4 text-left ${i ? "before:absolute before:left-[76px] before:right-0 before:top-0 before:h-[.5px] before:bg-[rgba(60,60,67,.16)]" : ""}`}>
          <span className="h-12 w-12 shrink-0 rounded-[10px] bg-[#E5E5EA]" /><span className="min-w-0 flex-1"><span className="block truncate text-[17px] leading-[22px] text-[#000]">{shortTitle(c.title)}</span><span className="block truncate text-[15px] leading-5 text-[#6E6E73]">{c.client_nom || ""}</span></span>
          <span className="flex shrink-0 items-center gap-1.5 text-[15px] font-semibold" style={{ color: tc }}><span className="h-[7px] w-[7px] rounded-full" style={{ background: dc }} />{l}</span></button> })}</LCard></>}
      </div>
    </PushScroll>
  </PushLayer>
}
