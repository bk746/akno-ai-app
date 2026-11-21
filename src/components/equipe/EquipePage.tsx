/* update65 · Page Équipe (maquettes equipe-3ecrans.png / equipe-fiche.png / equipe-ajout.png).
   Liste (résumé, recherche, 3 groupes), fiche membre (appeler / message / e-mail, chantier en cours avec vignette satellite,
   semaine prochaine, infos, accès à l'app), ajout / modification (MemberForm partagé). Chargée à la demande. */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Check, ChevronLeft, ChevronRight, Loader2, Mail, MessageSquare, Phone, Plus, Search, Users, X } from "lucide-react"
import { useC } from "../ui"
import { SatThumb } from "../SatThumb"
import { MemberForm } from "../chantiers/EquipeSheet"
import { PushStack } from "../nav/PushStack"
import { Bar, EmpAvatar } from "../chantiers/parts"
import { inviteEmploye, loadChantiers, requestOpenChantier, setAccess, useChantiers, type Chantier, type Employe } from "../../lib/chantiers"
import { STATUS_COLOR, progressPct, rangeLabel, todayISO, untilLabel } from "../../lib/chantierCalc"
import { ROLE_LABEL, cityOf, entryDate, frPhone, groupTeam, initialsOf, invitedAgo, longDate, memberToday, rowSite, shortName, sinceLabel, weekPlan, weekRange, type AccessRole, type Today } from "../../lib/equipeCalc"
import ModalSheet from "../sheet/ModalSheet"

const NAV = "calc(92px + max(var(--sab) - 10px, 12px))"
const PUSH = { type: "spring" as const, stiffness: 420, damping: 40, mass: .9 }
const card = "rounded-[16px] bg-white/[.07]"

const PendingAv = ({ e, size = 36 }: { e: Employe; size?: number }) => <span aria-hidden className="flex shrink-0 items-center justify-center rounded-full bg-white/[.08] font-semibold text-white/75 ring-1 ring-inset ring-white/15" style={{ width: size, height: size, fontSize: size * .36 }}>{initialsOf(e)}</span>
const Dot = ({ c }: { c: string }) => <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: c }} />
const Head = ({ t, n, r }: { t: string; n?: number; r?: ReactNode }) => <div className="mb-2 mt-6 flex items-baseline justify-between px-1"><h2 className="text-[16px] font-semibold tracking-[-0.01em]">{t}</h2>{r ?? (n != null && <span className="text-[14px] tabular-nums text-white/45">{n}</span>)}</div>

export default function EquipePage({ head }: { head?: ReactNode }) {
  const { desk, go, toast } = useC(), st = useChantiers(), reduce = useReducedMotion()
  const [q, setQ] = useState(""), [openId, setOpenId] = useState<string | null>(null), [form, setForm] = useState<{ e: Employe | null } | null>(null)
  const [relBusy, setRelBusy] = useState<string | null>(null), [today] = useState(() => todayISO())
  const scroller = useRef<HTMLDivElement>(null), pushed = useRef(false)
  useEffect(() => { void loadChantiers() }, [])

  // fiche ouverte = entrée d'historique (retour Android / navigateur referme la fiche)
  const open = useCallback((id: string) => {
    setOpenId(id)
    try { history.pushState({ ...(history.state || {}), aknoMember: id }, ""); pushed.current = true } catch { pushed.current = false }
  }, [])
  const back = useCallback(() => { if (pushed.current) { pushed.current = false; history.back() } else setOpenId(null) }, [])
  useEffect(() => { const f = () => { if (!history.state?.aknoMember) { pushed.current = false; setOpenId(null) } }; addEventListener("popstate", f); return () => removeEventListener("popstate", f) }, [])
  useEffect(() => { if (!openId || form) return; const f = (e: KeyboardEvent) => { if (e.key === "Escape") back() }; addEventListener("keydown", f); return () => removeEventListener("keydown", f) }, [openId, form, back])

  const sites = st.rows as (Chantier & { status: Chantier["status"] })[]
  const g = useMemo(() => groupTeam(st.employes, sites, st.links, today, q), [st.employes, sites, st.links, today, q])
  const member = openId ? st.employes.find(e => e.id === openId) || null : null
  useEffect(() => { if (openId && st.ready && !member) setOpenId(null) }, [openId, st.ready, member])

  const relancer = async (e: Employe) => {
    setRelBusy(e.id); const r = await inviteEmploye(e.id); setRelBusy(null)
    toast(r.ok ? `Invitation renvoyée à ${e.first_name}` : r.error || "Invitation non envoyée.")
  }
  const openSite = (id: string) => { requestOpenChantier(id); go("ch") }

  const row = (e: Employe, t: Today, pending = false) => {
    const site = rowSite(t)
    return <motion.div layout="position" key={e.id} className="eq-sep eq-sep-av">
      <button type="button" onClick={() => open(e.id)} aria-label={`${shortName(e)}, ${e.role || "membre"}`} className="flex w-full items-center gap-3 py-[9px] pl-3.5 pr-3 text-left transition-colors active:bg-white/[.05]">
        {pending ? <PendingAv e={e} /> : <EmpAvatar e={e} size={36} />}
        <span className="min-w-0 flex-1"><span className="block truncate text-[16px] font-medium leading-tight">{shortName(e)}</span>
          <span className="mt-0.5 block truncate text-[13.5px] text-white/50">{pending ? `${e.role || "Membre"} · ${invitedAgo(e.invited_at)}` : e.role || "Métier à préciser"}</span></span>
        {pending ? <span className="w-[86px]" /> : site && <span className="flex min-w-0 max-w-[46%] items-center gap-1.5 text-[13.5px] text-white/65"><Dot c={site.color} /><span className="truncate">{site.text}</span></span>}
        {!pending && <ChevronRight size={17} className="shrink-0 text-white/25" />}
      </button>
      {pending && <motion.button type="button" whileTap={{ scale: .94 }} disabled={relBusy === e.id} onClick={() => void relancer(e)} className="absolute right-3 top-1/2 flex h-8 -translate-y-1/2 items-center rounded-full bg-white/[.12] px-3.5 text-[13.5px] font-semibold text-white disabled:opacity-60">
        {relBusy === e.id ? <Loader2 size={14} className="animate-spin" /> : e.invited_at ? "Relancer" : "Envoyer"}</motion.button>}
    </motion.div>
  }

  const list = <div>
    {/* update67 : page comme les autres (absente de la barre) — en-tête commun avec le logo, pas de « < Compte » */}
    {!desk && head}
    <div className={`flex items-center justify-between ${desk ? "" : "mt-3"}`}>
      <h1 className="text-[34px] font-bold leading-none tracking-[-0.03em]">Équipe</h1>
      <motion.button type="button" whileTap={{ scale: .9 }} aria-label="Ajouter un membre" disabled={st.missing} onClick={() => setForm({ e: null })} className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black shadow-[0_4px_14px_rgba(255,255,255,.18)] disabled:opacity-40"><Plus size={20} strokeWidth={2.4} /></motion.button>
    </div>
    {st.missing ? <div className={`${card} mt-6 px-4 py-4 text-[14px] leading-5 text-white/75`}>Appliquez la migration <b>20261121_11_update64_chantiers_equipe.sql</b> pour activer l'équipe.</div>
      : !st.ready ? <div className="mt-5 space-y-3" aria-hidden>{[0, 1, 2].map(i => <div key={i} className={`${card} h-[64px] opacity-60`} />)}</div>
        : !st.employes.length ? <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={PUSH} className="flex flex-col items-center px-6 pb-8 pt-16 text-center">
          <span className="relative flex h-[84px] w-[84px] items-center justify-center rounded-full bg-gradient-to-b from-white/[.14] to-white/[.04] shadow-[inset_0_1px_0_rgba(255,255,255,.12)]"><Users size={34} strokeWidth={1.5} /></span>
          <p className="mt-6 text-[19px] font-semibold tracking-[-0.01em]">Votre équipe, en un coup d'œil</p>
          <p className="mt-2 max-w-[290px] text-[14.5px] leading-[21px] text-white/50">Ajoutez vos compagnons : qui est sur chantier aujourd'hui, qui est disponible, et leur planning de la semaine.</p>
          <motion.button type="button" whileTap={{ scale: .97 }} onClick={() => setForm({ e: null })} className="mt-7 flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[16px] font-semibold text-black"><Plus size={18} strokeWidth={2.4} />Ajouter un membre</motion.button>
        </motion.div>
          : <>
            <div className={`${card} mt-5 grid grid-cols-3 py-3`}>
              {[[g.total, "Membres"], [g.onsiteN, "Sur chantier"], [g.freeN, g.freeN > 1 ? "Disponibles" : "Disponible"]].map(([n, l], i) => <div key={i} className={`px-3.5 ${i ? "border-l border-white/[.09]" : ""}`}><div className="text-[22px] font-semibold leading-tight tabular-nums">{n}</div><div className="mt-0.5 text-[12.5px] text-white/50">{l}</div></div>)}
            </div>
            <label className={`${card} mt-3 flex h-10 items-center gap-2 px-3 text-white/45`}><Search size={16} strokeWidth={2} /><input type="search" enterKeyHint="search" aria-label="Rechercher un membre" placeholder="Rechercher un membre" value={q} onChange={e => setQ(e.target.value)} className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-white outline-none placeholder:text-white/40" />{q && <button type="button" aria-label="Effacer" onClick={() => setQ("")} className="flex h-5 w-5 items-center justify-center rounded-full bg-white/25 text-black"><X size={12} strokeWidth={3} /></button>}</label>
            {[["Sur chantier aujourd'hui", g.onsite, false], ["Disponibles", g.free, false], ["Invitation en attente", g.pending, true]].map(([t, xs, p]) => (xs as typeof g.onsite).length > 0 && <section key={t as string} aria-label={t as string}>
              <Head t={t as string} n={(xs as typeof g.onsite).length} />
              <div className={`${card} overflow-hidden`}>{(xs as typeof g.onsite).map(x => row(x.m as Employe, x.t, p as boolean))}</div>
            </section>)}
            {q && !g.onsite.length && !g.free.length && !g.pending.length && <p className="mt-10 text-center text-[14.5px] text-white/45">Aucun membre pour « {q} »</p>}
          </>}
  </div>

  const fiche = member && <Fiche e={member} today={today} onBack={back} onEdit={() => setForm({ e: member })} onSite={openSite} onRelancer={() => void relancer(member)} relBusy={relBusy === member.id} ext={st.ext} />

  return <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-black text-white">
    <PushStack ref={scroller} base={list} top={fiche || null} topKey={member ? `f-${member.id}` : undefined} inner={desk ? "max-w-[640px]" : ""}
      padTop={desk ? 28 : "calc(var(--sat) + 2px)"} padBottom={desk ? 40 : `calc(${NAV} + 16px)`} />
    <AnimatePresence>{form && <MemberForm key="mf" initial={form.e} desk={desk} onClose={() => setForm(null)} onSaved={id => { if (!form.e) open(id) }} onDeleted={() => { setOpenId(null); if (pushed.current) { pushed.current = false; history.back() } }} />}</AnimatePresence>
  </div>
}

/* ---------- Fiche membre ---------- */
function Fiche({ e, today, onBack, onEdit, onSite, onRelancer, relBusy, ext }: { e: Employe; today: string; onBack: () => void; onEdit: () => void; onSite: (id: string) => void; onRelancer: () => void; relBusy: boolean; ext: boolean }) {
  const { toast } = useC(), st = useChantiers(), [accessOpen, setAccessOpen] = useState(false)
  const t = memberToday(e, st.rows, st.links, today), week = weekPlan(e.id, st.rows, st.links, today)
  const ph = frPhone(e.phone) || e.phone || "", raw = (e.phone || "").replace(/[^\d+]/g, "")
  const c = t.current || t.next, isCur = !!t.current
  const badge = t.kind === "pending" ? ["Invitation en attente", "rgba(255,255,255,.45)"] : t.kind === "onsite" ? ["Sur chantier", "#FF9F0A"] : ["Disponible", "#30D158"]
  const btn = "flex h-[58px] flex-col items-center justify-center gap-1 rounded-[16px] text-[13.5px] font-semibold transition-transform active:scale-[.97]"
  const changeAccess = async (r: AccessRole | null) => {
    setAccessOpen(false)
    if ((e.access_role || null) === r) return
    const wasNone = !e.access_role
    const err = await setAccess(e.id, r)
    if (err) { toast(err); return }
    if (r && wasNone) { const inv = await inviteEmploye(e.id); toast(inv.ok ? `Invitation envoyée à ${e.first_name} par SMS` : inv.error || "Invitation non envoyée.") }
    else toast(r ? `Accès : ${ROLE_LABEL[r]}` : "Accès à l'app retiré")
  }
  const entry = entryDate(e)
  return <div>
    <div className="flex h-11 items-center justify-between">
      <motion.button type="button" whileTap={{ scale: .96 }} onClick={onBack} className="-ml-1.5 flex items-center text-[17px]"><ChevronLeft size={26} strokeWidth={2} />Équipe</motion.button>
      <button type="button" onClick={onEdit} className="text-[17px] text-white active:opacity-60">Modifier</button>
    </div>
    <div className="mt-3 flex items-center gap-5">
      {t.kind === "pending" && !e.photo_path ? <PendingAv e={e} size={100} /> : <EmpAvatar e={e} size={100} />}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[28px] font-bold leading-tight tracking-[-0.025em]">{shortName(e)}</h1>
        <p className="mt-0.5 truncate text-[15px] text-white/50">{[e.role || "Membre", sinceLabel(e)].filter(Boolean).join(" · ")}</p>
        <span className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-full bg-white/[.09] px-3 text-[13.5px] font-medium"><Dot c={badge[1]} />{badge[0]}</span>
      </div>
    </div>
    <div className="mt-6 grid grid-cols-3 gap-2.5">
      {raw ? <a href={`tel:${raw}`} className={`${btn} bg-white text-black`}><Phone size={19} strokeWidth={2} />Appeler</a> : <span aria-disabled className={`${btn} bg-white/40 text-black/60`}><Phone size={19} />Appeler</span>}
      {raw ? <a href={`sms:${raw}`} className={`${btn} bg-white/[.09] text-white`}><MessageSquare size={19} strokeWidth={2} />Message</a> : <span aria-disabled className={`${btn} bg-white/[.05] text-white/30`}><MessageSquare size={19} />Message</span>}
      {e.email ? <a href={`mailto:${e.email}`} className={`${btn} bg-white/[.09] text-white`}><Mail size={19} strokeWidth={2} />Email</a> : <span aria-disabled="true" title="Aucun e-mail" className={`${btn} bg-white/[.05] text-white/30`}><Mail size={19} strokeWidth={2} />Email</span>}
    </div>
    {t.kind === "pending" && <div className={`${card} mt-3 flex items-center gap-3 px-4 py-3`}><span className="min-w-0 flex-1 text-[14px] text-white/60">Invitation SMS {e.invited_at ? invitedAgo(e.invited_at).replace("invité ", "envoyée ") : "pas encore envoyée"}</span>
      <motion.button type="button" whileTap={{ scale: .94 }} disabled={relBusy} onClick={onRelancer} className="flex h-8 items-center rounded-full bg-white/[.12] px-3.5 text-[13.5px] font-semibold">{relBusy ? <Loader2 size={14} className="animate-spin" /> : e.invited_at ? "Relancer" : "Envoyer"}</motion.button></div>}

    <Head t={isCur ? "Chantier en cours" : t.next ? "Prochain chantier" : "Chantier en cours"} r={<span />} />
    {c ? <motion.button type="button" whileTap={{ scale: .985 }} onClick={() => onSite(c.id)} className={`${card} flex w-full items-center gap-3.5 p-3 text-left`}>
      {c.lat != null && c.lng != null ? <SatThumb lat={c.lat} lng={c.lng} color={STATUS_COLOR[isCur ? "in_progress" : "upcoming"]} /> : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[12px] bg-white/[.06]"><Dot c={STATUS_COLOR[isCur ? "in_progress" : "upcoming"]} /></span>}
      <span className="min-w-0 flex-1"><span className="block truncate text-[16.5px] font-semibold">{c.title}</span>
        <span className="mt-0.5 block truncate text-[13.5px] text-white/50">{[cityOf(c.address), rangeLabel(c)].filter(Boolean).join(" · ")}</span>
        <span className="mt-2 flex items-center gap-3">{isCur ? <><Bar pct={progressPct(c, today)} /><span className="text-[14px] font-semibold tabular-nums">{progressPct(c, today)} %</span></> : <span className="text-[13.5px] text-[#7EA6FF]">{untilLabel(c, today)}</span>}</span></span>
      <ChevronRight size={18} className="shrink-0 text-white/25" />
    </motion.button> : <div className={`${card} px-4 py-4 text-[14.5px] text-white/45`}>Aucun chantier en cours. Assignez {e.first_name} depuis la fiche d'un chantier.</div>}

    <Head t="Semaine prochaine" r={<span className="text-[14px] text-white/45">{weekRange(week)}</span>} />
    <div className="grid grid-cols-5 gap-1.5">
      {week.map((d, i) => <motion.button key={d.date} type="button" disabled={!d.site} onClick={() => d.site && onSite(d.site.id)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .03 * i, type: "spring", stiffness: 420, damping: 32 }}
        aria-label={`${d.wd} ${d.num} : ${d.site ? d.site.title : "libre"}`} className={`${card} flex min-w-0 flex-col items-center px-1 pb-2 pt-2`}>
        <span className="text-[13px] text-white/55">{d.wd}</span><span className="text-[19px] font-semibold leading-tight tabular-nums">{d.num}</span>
        <span className="mt-1 flex w-full min-w-0 items-center justify-center gap-1 text-[11px] text-white/70">{d.site ? <><Dot c={d.color!} /><span className="truncate">{d.client}</span></> : <span className="text-white/30">Libre</span>}</span>
      </motion.button>)}
    </div>

    <Head t="Infos" r={<span />} />
    <div className={`${card} overflow-hidden`}>
      <InfoRow l="Téléphone" v={ph || "—"} href={raw ? `tel:${raw}` : undefined} />
      {e.email && <InfoRow l="Email" v={e.email} href={`mailto:${e.email}`} />}
      {entry && <InfoRow l="Date d'entrée" v={longDate(entry)} />}
      {ext && <button type="button" onClick={() => setAccessOpen(true)} className="eq-sep flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-white/[.04]"><span className="min-w-0 flex-1"><span className="block text-[13px] text-white/50">Accès à l'app</span><span className="block text-[16.5px]">{e.access_role ? ROLE_LABEL[e.access_role] : "Aucun accès"}</span></span><ChevronRight size={18} className="text-white/25" /></button>}
    </div>
    <AccessSheet open={accessOpen} value={e.access_role || null} name={shortName(e)} onPick={r => void changeAccess(r)} onClose={() => setAccessOpen(false)} />
  </div>
}
const InfoRow = ({ l, v, href }: { l: string; v: string; href?: string }) => { const inner = <><span className="block text-[13px] text-white/50">{l}</span><span className="block truncate text-[16.5px]">{v}</span></>; return href ? <a href={href} className="eq-sep block px-4 py-2.5 active:bg-white/[.04]">{inner}</a> : <div className="eq-sep px-4 py-2.5">{inner}</div> }

function AccessSheet({ open, value, name, onPick, onClose }: { open: boolean; value: AccessRole | null; name: string; onPick: (r: AccessRole | null) => void; onClose: () => void }) {
  useEffect(() => { if (!open) return; const f = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose() } }; addEventListener("keydown", f, true); return () => removeEventListener("keydown", f, true) }, [open, onClose])
  const opts: [AccessRole | null, string, string][] = [["ouvrier", "Ouvrier", "Voit ses chantiers et son planning"], ["chef", "Chef d'équipe", "Gère les chantiers de son équipe"], ["admin", "Admin", "Accès complet, comme vous"], [null, "Aucun accès", "Pas de compte dans l'app"]]
  return <AnimatePresence>{open && <ModalSheet key="acc" label="Accès à l'app" onClose={onClose} z={70} escape={false} className="max-w-[520px] bg-[#1C1C1E] px-4 pt-4" style={{ paddingBottom: "max(calc(var(--sab) + 8px), 18px)" }}>
      <div className="py-3.5 text-center"><div className="text-[17px] font-semibold">Accès à l'app</div><div className="mt-0.5 text-[13px] text-white/45">{name} · une invitation SMS part si l'accès est nouveau</div></div>
      <div className={`${card} overflow-hidden`}>{opts.map(([r, l, s]) => <button key={l} type="button" role="menuitemradio" aria-checked={value === r} onClick={() => onPick(r)} className="eq-sep flex w-full items-center gap-3 px-4 py-3 text-left active:bg-white/[.05]">
        <span className="min-w-0 flex-1"><span className={`block text-[16.5px] ${r ? "" : "text-[#FF6B6B]"}`}>{l}</span><span className="block text-[13px] text-white/45">{s}</span></span>{value === r && <Check size={19} className="text-[#30D158]" />}</button>)}</div>
  </ModalSheet>}</AnimatePresence>
}
