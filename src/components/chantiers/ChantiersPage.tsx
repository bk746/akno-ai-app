/* update64 · Page Chantiers : carte satellite plein écran, repères par statut, carrousel de cartes synchronisé
   avec la carte, fiche complète glissable, création par « + » ou appui long. Chargée à la demande (Leaflet hors bundle principal). */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useDragControls, useReducedMotion } from "motion/react"
import { Check, ChevronDown, ChevronLeft, HardHat, Layers, LocateFixed, Loader2, MapPin, Plus, Sparkles, X } from "lucide-react"
import { useC } from "../ui"
import ChMap, { TILES, type MapApi, type MapLayer } from "./ChMap"
import ChantierForm, { type FormReq } from "./ChantierForm"
import { ChCard, ChDetail } from "./parts"
import { chState, loadChantiers, takeNewRequest, teamOf, useChantiers, type Chantier } from "../../lib/chantiers"
import { STATUS_COLOR, effectiveStatus, type ChStatus } from "../../lib/chantierCalc"
import { FRANCE, reverseAddress, searchAddress } from "../../lib/geo"
import { CO } from "../../lib/devisDoc"
import type { Contact } from "../form/grouped"

type Filter = "all" | ChStatus
const FILTERS: [Filter, string][] = [["all", "Tous"], ["in_progress", "En cours"], ["upcoming", "À venir"], ["done", "Terminés"]]
const RANK: Record<ChStatus, number> = { in_progress: 0, upcoming: 1, done: 2 }
const NAV = "calc(92px + max(var(--sab) - 10px, 12px))"
const ls = { get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* privé */ } } }
const glass = "bg-[#1C1C1E]/75 backdrop-blur-xl backdrop-saturate-150 border border-white/[.08] shadow-[0_8px_24px_-8px_rgba(0,0,0,.6)]"
const sortCh = (a: Chantier, b: Chantier) => { const sa = effectiveStatus(a), sb = effectiveStatus(b); if (sa !== sb) return RANK[sa] - RANK[sb]; const da = a.start_date || "9999", db = b.start_date || "9999"; return sa === "done" ? db.localeCompare(da) : da.localeCompare(db) }

function countLabel(n: Record<ChStatus, number>) {
  const p = [n.in_progress && `${n.in_progress} en cours`, n.upcoming && `${n.upcoming} à venir`].filter(Boolean) as string[]
  if (p.length) return p.join(" · ")
  return n.done ? `${n.done} terminé${n.done > 1 ? "s" : ""}` : "Aucun chantier"
}

export default function ChantiersPage({ me, clients }: { me: ReactNode; clients: Contact[] }) {
  const { desk, s, setChat, go, toast } = useC(), st = useChantiers(), reduce = useReducedMotion()
  const map = useRef<MapApi>(null), sc = useRef<HTMLDivElement>(null), listRef = useRef<HTMLDivElement>(null)
  const [filter, setFilterS] = useState<Filter>(() => (ls.get("akno.ch.filter") as Filter) || "all"), [fOpen, setFOpen] = useState(false)
  const [layer, setLayerS] = useState<MapLayer>(() => ls.get("akno.ch.layer") === "plan" ? "plan" : "sat")
  const [sel, setSel] = useState<string | null>(null), [sheet, setSheet] = useState(false), [form, setForm] = useState<FormReq | null>(null)
  const [meLoc, setMe] = useState<{ lat: number; lng: number } | null>(null), [locBusy, setLocBusy] = useState(false)
  const [draft, setDraft] = useState<{ lat: number; lng: number; address?: string } | null>(null)
  const watch = useRef<number | null>(null), placedOnce = useRef(false), fromScroll = useRef(false)
  const setFilter = (f: Filter) => { setFilterS(f); ls.set("akno.ch.filter", f); setFOpen(false) }
  const setLayer = (l: MapLayer) => { setLayerS(l); ls.set("akno.ch.layer", l) }

  useEffect(() => { void loadChantiers() }, [])
  // « + » → Nouveau chantier (depuis n'importe quelle page)
  useEffect(() => { if (takeNewRequest()) setForm({}); const f = () => { if (takeNewRequest()) setForm({}) }; addEventListener("akno-chantier-new", f); return () => removeEventListener("akno-chantier-new", f) }, [])

  const all = useMemo(() => [...st.rows].sort(sortCh), [st.rows])
  const counts = useMemo(() => { const n = { in_progress: 0, upcoming: 0, done: 0 } as Record<ChStatus, number>; for (const c of all) n[effectiveStatus(c)]++; return n }, [all])
  const list = useMemo(() => filter === "all" ? all : all.filter(c => effectiveStatus(c) === filter), [all, filter])
  const cur = list.find(c => c.id === sel) || null
  const items = useMemo(() => list.filter(c => c.lat != null && c.lng != null).map(c => ({ id: c.id, lat: c.lat!, lng: c.lng!, color: STATUS_COLOR[effectiveStatus(c)], label: c.title })), [list])

  // décalage vertical : le repère se place au centre de la zone de carte visible (sous l'en-tête, au-dessus des cartes)
  const offsetFor = useCallback((open: boolean) => {
    if (desk) return 0
    const h = innerHeight, top = 120, bottom = open ? h * .34 : h - 270
    return Math.round(h / 2 - (top + (bottom - top) / 2))
  }, [desk])
  const flyTo = useCallback((c: Chantier | null | undefined, o: { instant?: boolean; open?: boolean } = {}) => {
    if (!c || c.lat == null || c.lng == null) return
    map.current?.flyTo(c.lat, c.lng, { zoom: o.instant ? 15 : Math.max(map.current.zoom(), 14), offsetY: offsetFor(!!o.open), instant: o.instant })
  }, [offsetFor])

  // sélection initiale : premier chantier en cours (tri en cours → à venir → terminés)
  useEffect(() => {
    if (!st.ready) return
    if (!list.length) { setSel(null); return }
    if (!sel || !list.some(c => c.id === sel)) { setSel(list[0].id); if (!placedOnce.current || sc.current) flyTo(list[0], { instant: !placedOnce.current }); placedOnce.current = true; sc.current?.scrollTo({ left: 0 }) }
  }, [st.ready, list]) // eslint-disable-line react-hooks/exhaustive-deps

  // aucun chantier : carte centrée sur l'adresse de l'entreprise (géocodée une fois, mise en cache) ou sur la France
  useEffect(() => {
    if (!st.ready || all.length) return
    const q = [CO.addr, CO.city].filter(Boolean).join(" ").trim()
    if (!q) { map.current?.view(FRANCE.lat, FRANCE.lng, FRANCE.zoom); return }
    try { const c = JSON.parse(ls.get("akno.ch.home") || "null"); if (c?.q === q) { map.current?.view(c.lat, c.lng, 13); return } } catch { /* cache illisible */ }
    void searchAddress(q).then(r => { if (r[0]) { ls.set("akno.ch.home", JSON.stringify({ q, lat: r[0].lat, lng: r[0].lng })); map.current?.view(r[0].lat, r[0].lng, 13) } else map.current?.view(FRANCE.lat, FRANCE.lng, FRANCE.zoom) })
  }, [st.ready, all.length])

  // ma position : démarre seule si l'autorisation est déjà donnée
  const startWatch = useCallback((fly: boolean) => {
    if (!("geolocation" in navigator)) { toast("Localisation indisponible sur cet appareil"); return }
    setLocBusy(fly)
    let first = true
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current)
    watch.current = navigator.geolocation.watchPosition(p => {
      const v = { lat: p.coords.latitude, lng: p.coords.longitude }; setMe(v); setLocBusy(false)
      if (first && fly) map.current?.flyTo(v.lat, v.lng, { zoom: 15, offsetY: offsetFor(false) })
      first = false
    }, e => { setLocBusy(false); if (fly) toast(e.code === 1 ? "Localisation refusée : autorisez-la dans les réglages du navigateur" : "Position introuvable pour le moment"); if (e.code === 1 && watch.current != null) { navigator.geolocation.clearWatch(watch.current); watch.current = null } }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 12000 })
  }, [toast, offsetFor])
  useEffect(() => {
    let alive = true
    navigator.permissions?.query({ name: "geolocation" as PermissionName }).then(p => { if (alive && p.state === "granted") startWatch(false) }).catch(() => {})
    return () => { alive = false; if (watch.current != null) navigator.geolocation.clearWatch(watch.current) }
  }, [startWatch])
  const recenter = () => { if (meLoc) map.current?.flyTo(meLoc.lat, meLoc.lng, { zoom: 15, offsetY: offsetFor(false) }); else startWatch(true) }

  // carrousel ↔ carte
  const scrollToId = useCallback((id: string, smooth = true) => {
    const box = sc.current; if (!box) return
    const el = box.querySelector<HTMLElement>(`[data-ch="${id}"]`); if (!el) return
    box.scrollTo({ left: el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2, behavior: smooth && !reduce ? "smooth" : "auto" })
  }, [reduce])
  const settle = useCallback(() => {
    const box = sc.current; if (!box) return
    const mid = box.scrollLeft + box.clientWidth / 2
    let best: HTMLElement | null = null, bd = 1e9
    box.querySelectorAll<HTMLElement>("[data-ch]").forEach(el => { const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = el } })
    const id = (best as HTMLElement | null)?.dataset.ch
    if (id && id !== sel) { fromScroll.current = true; setSel(id); flyTo(list.find(c => c.id === id)) }
  }, [sel, list, flyTo])
  useEffect(() => {
    const box = sc.current; if (!box) return
    let t = 0
    const onScroll = () => { clearTimeout(t); t = window.setTimeout(settle, 110) }
    const onEnd = () => { clearTimeout(t); settle() }
    box.addEventListener("scroll", onScroll, { passive: true }); box.addEventListener("scrollend", onEnd)
    return () => { clearTimeout(t); box.removeEventListener("scroll", onScroll); box.removeEventListener("scrollend", onEnd) }
  }, [settle])
  const pick = (id: string) => {
    setDraft(null)
    if (id === sel) { flyTo(list.find(c => c.id === id), { open: sheet }); return }
    setSel(id); flyTo(list.find(c => c.id === id), { open: sheet }); scrollToId(id)
    if (desk) { setSheet(true); listRef.current?.querySelector(`[data-ch="${id}"]`)?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" }) }
  }
  const openSheet = (id: string) => { if (id !== sel) { setSel(id); scrollToId(id) } setSheet(true); flyTo(list.find(c => c.id === id), { open: true }) }
  const closeSheet = () => { setSheet(false); flyTo(cur) }
  useEffect(() => { if (!sheet) return; const f = (e: KeyboardEvent) => { if (e.key === "Escape" && !form) closeSheet() }; addEventListener("keydown", f); return () => removeEventListener("keydown", f) }) // eslint-disable-line react-hooks/exhaustive-deps

  // appui long → repère provisoire + adresse
  const onLong = (lat: number, lng: number) => {
    if (st.missing) { toast("Appliquez d'abord la migration Chantiers"); return }
    setSheet(false); setDraft({ lat, lng }); map.current?.flyTo(lat, lng, { zoom: Math.max(map.current.zoom(), 15), offsetY: offsetFor(false) })
    void reverseAddress(lat, lng).then(a => setDraft(d => d && d.lat === lat && d.lng === lng ? { ...d, address: a || "Adresse introuvable" } : d))
  }
  const saved = (id: string) => { setForm(null); setDraft(null); if (filter !== "all") setFilterS("all"); setSel(id); setTimeout(() => { const c = chState().rows.find(x => x.id === id); flyTo(c, { open: sheet }); scrollToId(id) }, 60) }
  useEffect(() => { if (sel && !sheet) { const t = setTimeout(() => scrollToId(sel, false), 30); return () => clearTimeout(t) } }, [list.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const team = (c: Chantier) => teamOf(c.id, st)

  const mapEl = <ChMap ref={map} items={items} selected={sel} layer={layer} me={meLoc} draft={draft} initial={FRANCE} onSelect={pick} onLongPress={onLong} onMoveStart={() => setFOpen(false)} className="absolute inset-0" />
  const roundCtl = (label: string, onClick: () => void, icon: ReactNode, on?: boolean) => <motion.button type="button" whileTap={{ scale: .9 }} aria-label={label} title={label} onClick={onClick} className={`pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full text-white ${glass} ${on ? "!bg-white !text-black" : ""}`}>{icon}</motion.button>
  const ctrls = <div className="flex flex-col gap-2.5">
    {roundCtl(layer === "sat" ? "Afficher le plan" : "Afficher le satellite", () => setLayer(layer === "sat" ? "plan" : "sat"), <Layers size={19} strokeWidth={2} />)}
    {roundCtl("Ma position", recenter, locBusy ? <Loader2 size={19} className="animate-spin" /> : <LocateFixed size={19} strokeWidth={2} className={meLoc ? "text-[#4D9BFF]" : ""} />)}
  </div>
  const attribution = <span className="pointer-events-auto rounded-md bg-black/35 px-1.5 py-0.5 text-[10px] leading-none text-white/60 backdrop-blur-sm">{TILES[layer].attr}</span>

  const filterPill = <div className="relative">
    <motion.button type="button" whileTap={{ scale: .96 }} aria-haspopup="listbox" aria-expanded={fOpen} onClick={() => setFOpen(v => !v)} className={`pointer-events-auto flex h-10 items-center gap-1.5 rounded-full px-4 text-[14.5px] font-semibold text-white ${glass}`}>
      {filter === "all" ? <><span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR.in_progress }} />{st.ready && !st.missing ? countLabel(counts) : "Chantiers"}</> : <><span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[filter as ChStatus] }} />{FILTERS.find(f => f[0] === filter)![1]} · {counts[filter as ChStatus]}</>}
      <ChevronDown size={16} strokeWidth={2.4} className={`text-white/60 transition-transform ${fOpen ? "rotate-180" : ""}`} />
    </motion.button>
    <AnimatePresence>{fOpen && <motion.div role="listbox" aria-label="Filtrer les chantiers" initial={{ opacity: 0, y: -6, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: .97 }} transition={{ type: "spring", stiffness: 520, damping: 34 }}
      className={`pointer-events-auto absolute left-1/2 top-12 z-10 w-[220px] -translate-x-1/2 overflow-hidden rounded-[18px] p-1.5 ${glass} !bg-[#1C1C1E]/95`} style={{ originY: 0 }}>
      {FILTERS.map(([f, l]) => <button key={f} type="button" role="option" aria-selected={filter === f} onClick={() => setFilter(f)} className="flex h-11 w-full items-center gap-2.5 rounded-[12px] px-3 text-left text-[15px] text-white active:bg-white/[.08]">
        <span className="h-2 w-2 rounded-full" style={{ background: f === "all" ? "rgba(255,255,255,.5)" : STATUS_COLOR[f] }} /><span className="flex-1">{l}</span>
        <span className="text-[13px] tabular-nums text-white/40">{f === "all" ? all.length : counts[f]}</span>{filter === f && <Check size={16} className="text-[#7EA6FF]" />}</button>)}
    </motion.div>}</AnimatePresence>
  </div>

  const stateCard = !st.ready ? <div className={`flex h-[116px] items-center justify-center rounded-[22px] ${glass}`}><Loader2 size={20} className="animate-spin text-white/50" /></div>
    : st.missing ? <div className={`rounded-[22px] px-5 py-4 ${glass}`}><div className="flex items-center gap-2 text-[13px] font-medium text-[#FFB340]"><HardHat size={15} />Base à mettre à jour</div><div className="mt-1.5 text-[17px] font-semibold">Chantiers presque prêts</div><p className="mt-1 text-[13.5px] leading-5 text-white/60">Appliquez la migration <b className="text-white/85">20261121_11_update64_chantiers_equipe.sql</b> dans Supabase pour activer vos chantiers et votre équipe.</p></div>
      : st.error && !all.length ? <div className={`rounded-[22px] px-5 py-4 ${glass}`}><div className="text-[16px] font-semibold">Chantiers indisponibles</div><p className="mt-1 text-[13.5px] text-white/60">{st.error}</p><button type="button" onClick={() => void loadChantiers()} className="mt-3 h-10 rounded-full bg-white px-4 text-[14px] font-semibold text-black">Réessayer</button></div>
        : !all.length ? <div className={`rounded-[22px] px-5 pb-5 pt-4 ${glass}`}><div className="flex items-center gap-2 text-[13px] text-white/55"><MapPin size={14} />Aucun chantier pour l'instant</div><div className="mt-1 text-[19px] font-semibold tracking-[-0.02em]">Vos chantiers sur la carte</div><p className="mt-1 text-[13.5px] leading-5 text-white/55">Suivez l'avancement, l'équipe et l'itinéraire de chaque chantier. Astuce : appui long sur la carte.</p>
          <motion.button type="button" whileTap={{ scale: .97 }} onClick={() => setForm({})} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-[16px] font-semibold text-black"><Plus size={18} strokeWidth={2.4} />Créer votre premier chantier</motion.button></div>
          : !list.length ? <div className={`rounded-[22px] px-5 py-4 ${glass}`}><div className="text-[16px] font-semibold">Aucun chantier {FILTERS.find(f => f[0] === filter)![1].toLowerCase()}</div><button type="button" onClick={() => setFilter("all")} className="mt-2 text-[14.5px] font-semibold text-[#7EA6FF]">Voir tous les chantiers</button></div> : null

  const draftCard = draft && <motion.div key="draft" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ type: "spring", stiffness: 420, damping: 36 }} className={`pointer-events-auto rounded-[22px] px-4 pb-4 pt-3.5 ${glass} !bg-[#1C1C1E]/90`}>
    <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className="text-[13px] text-white/55">Nouveau chantier ici</div><div className="mt-0.5 line-clamp-2 text-[16.5px] font-semibold leading-snug">{draft.address || <span className="inline-flex items-center gap-2 text-white/50"><Loader2 size={15} className="animate-spin" />Recherche de l'adresse…</span>}</div></div>
      <button type="button" aria-label="Annuler" onClick={() => setDraft(null)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[.1] text-white/75"><X size={17} /></button></div>
    <motion.button type="button" whileTap={{ scale: .97 }} onClick={() => setForm({ at: { lat: draft.lat, lng: draft.lng, address: draft.address && draft.address !== "Adresse introuvable" ? draft.address : undefined } })} className="mt-3.5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-[16px] font-semibold text-black"><Plus size={18} strokeWidth={2.4} />Créer le chantier</motion.button>
  </motion.div>

  const formEl = <AnimatePresence>{form && <ChantierForm key="form" req={form} clients={clients} devis={s.devis} desk={desk} near={meLoc} onClose={() => setForm(null)} onSaved={saved} onDeleted={() => { setForm(null); setSheet(false); setSel(null) }} />}</AnimatePresence>

  /* ---------- ordinateur : liste + carte ---------- */
  if (desk) return <div className="flex h-full min-h-0">
    <aside className="flex w-[400px] shrink-0 flex-col border-r border-white/[.06]">
      <AnimatePresence mode="popLayout" initial={false}>
        {sheet && cur ? <motion.div key="d" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ type: "spring", stiffness: 420, damping: 38 }} className="flex min-h-0 flex-1 flex-col">
          <button type="button" onClick={() => setSheet(false)} className="flex h-14 shrink-0 items-center gap-1 px-4 text-[15px] text-white/70 hover:text-white"><ChevronLeft size={20} />Chantiers</button>
          <div className="min-h-0 flex-1 overflow-y-auto px-6"><ChDetail c={cur} team={team(cur)} desk onClose={() => setSheet(false)} onEdit={() => setForm({ initial: cur })} /></div>
        </motion.div>
          : <motion.div key="l" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ type: "spring", stiffness: 420, damping: 38 }} className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-end justify-between px-6 pb-4 pt-8"><div><h1 className="text-[32px] font-semibold leading-none tracking-[-0.03em]">Chantiers</h1><p className="mt-2 text-[14px] text-white/50">{st.ready && !st.missing ? countLabel(counts) : " "}</p></div>
              {!st.missing && <motion.button type="button" whileTap={{ scale: .96 }} onClick={() => setForm({})} className="flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-[14.5px] font-semibold text-black"><Plus size={17} strokeWidth={2.4} />Nouveau</motion.button>}</div>
            {!st.missing && all.length > 0 && <div role="tablist" aria-label="Filtrer" className="flex gap-1.5 px-6 pb-4">{FILTERS.map(([f, l]) => <button key={f} role="tab" aria-selected={filter === f} type="button" onClick={() => setFilter(f)} className={`h-8 rounded-full px-3 text-[13.5px] font-medium transition-colors ${filter === f ? "bg-white text-black" : "bg-white/[.07] text-white/65 hover:text-white"}`}>{l}{f !== "all" && counts[f] ? ` ${counts[f]}` : ""}</button>)}</div>}
            <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 pb-8">
              {stateCard}
              {list.map(c => <div key={c.id} data-ch={c.id} onMouseEnter={() => { if (c.id !== sel) { setSel(c.id); flyTo(c) } }} className={`rounded-[22px] transition-shadow ${c.id === sel ? "ring-2 ring-white/25" : ""}`}><ChCard c={c} team={team(c)} active={c.id === sel} handle={false} onOpen={() => openSheet(c.id)} /></div>)}
            </div>
          </motion.div>}
      </AnimatePresence>
    </aside>
    <div className="relative min-w-0 flex-1 overflow-hidden">
      {mapEl}
      <div className="pointer-events-none absolute right-4 top-4 z-10">{ctrls}</div>
      <div className="pointer-events-none absolute bottom-3 right-3 z-10">{attribution}</div>
      {draft && <div className="absolute bottom-10 left-1/2 z-10 w-[380px] -translate-x-1/2"><AnimatePresence>{draftCard}</AnimatePresence></div>}
    </div>
    {formEl}
  </div>

  /* ---------- mobile ---------- */
  return <div className="relative min-h-0 flex-1 overflow-hidden overscroll-none bg-[#0b0d0c]">
    {mapEl}
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[170px] bg-gradient-to-b from-black/70 via-black/30 to-transparent" />
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20" style={{ paddingTop: "calc(var(--sat) + 2px)" }}>
      <div className="flex h-11 items-center px-5">
        <img src="/logo.png" alt="Akno" className="h-[25px] w-auto drop-shadow-[0_1px_6px_rgba(0,0,0,.5)]" />
        <div className="pointer-events-auto ml-auto flex items-center gap-2">
          <motion.button type="button" whileTap={{ scale: .9 }} aria-label="Assistant" onClick={() => setChat(true)} className={`flex h-9 w-9 items-center justify-center rounded-full ${glass}`}><Sparkles size={17} strokeWidth={2} /></motion.button>
          <motion.button type="button" whileTap={{ scale: .9 }} aria-label="Réglages" title="Réglages" onClick={() => go("set")} className="flex h-9 w-9 items-center justify-center rounded-full">{me}</motion.button>
        </div>
      </div>
      <div className="mt-2 flex justify-center">{filterPill}</div>
    </header>

    <AnimatePresence>{!sheet && <motion.div key="bottom" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }} transition={{ type: "spring", stiffness: 380, damping: 36 }} className="pointer-events-none absolute inset-x-0 z-20 flex flex-col" style={{ bottom: NAV }}>
      <div className="flex items-end justify-between px-4 pb-2.5">{attribution}{ctrls}</div>
      <AnimatePresence mode="popLayout" initial={false}>
        {draft ? <div key="dr" className="px-4">{draftCard}</div>
          : stateCard ? <motion.div key="st" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-auto px-4">{stateCard}</motion.div>
            : <motion.div key="car" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div ref={sc} className="ch-carousel pointer-events-auto flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-7" style={{ touchAction: "pan-x" }} aria-roledescription="carrousel" aria-label="Chantiers">
                {list.map((c, i) => <motion.div key={c.id} data-ch={c.id} aria-roledescription="diapositive" aria-label={`${i + 1} sur ${list.length}`} className="w-[calc(100%-6px)] shrink-0 snap-center snap-always py-1"
                  onPanEnd={(_, p) => { if (p.offset.y < -36 && Math.abs(p.offset.y) > Math.abs(p.offset.x) * 1.2) openSheet(c.id) }}>
                  <ChCard c={c} team={team(c)} active={c.id === sel} onOpen={() => openSheet(c.id)} />
                </motion.div>)}
              </div>
              {list.length > 1 && <div className="flex justify-center gap-1.5 pt-2" aria-hidden>{list.slice(0, 12).map(c => <motion.span key={c.id} layout className="h-1.5 rounded-full shadow-[0_1px_3px_rgba(0,0,0,.5)]" animate={{ width: c.id === sel ? 16 : 6, backgroundColor: c.id === sel ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.5)" }} transition={{ type: "spring", stiffness: 500, damping: 36 }} />)}</div>}
            </motion.div>}
      </AnimatePresence>
    </motion.div>}</AnimatePresence>

    <AnimatePresence>{sheet && cur && <FullSheet key="sheet" onClose={closeSheet}><ChDetail c={cur} team={team(cur)} onClose={closeSheet} onEdit={() => setForm({ initial: cur })} /></FullSheet>}</AnimatePresence>
    {formEl}
  </div>
}

/** Fiche complète : monte depuis la carte, se ferme en la tirant vers le bas (poignée / en-tête) ou avec ×. */
function FullSheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const dc = useDragControls(), body = useRef<HTMLDivElement>(null), sec = useRef<HTMLElement>(null)
  // le contenu défile ; on ne tire la fiche que par la poignée ou l'en-tête (titre), quand le contenu est en haut
  const fromHead = (e: React.PointerEvent) => { const t = e.target as HTMLElement, top = sec.current?.getBoundingClientRect().top ?? 0; if (!t.closest("button,a,textarea,input") && (body.current?.scrollTop ?? 0) <= 0 && e.clientY - top < 120) dc.start(e) }
  return <>
    <motion.div aria-hidden className="absolute inset-0 z-[21] bg-black/25" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
    <motion.section ref={sec} role="dialog" aria-modal="true" aria-labelledby="ch-sheet-title" drag="y" dragControls={dc} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: .04, bottom: .7 }}
      onDragEnd={(_, i) => { if (i.offset.y > 110 || i.velocity.y > 650) onClose() }}
      initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 340, damping: 34, mass: .9 }}
      className="absolute inset-x-0 bottom-0 z-[22] flex flex-col rounded-t-[26px] border-t border-white/[.08] bg-[#161618]/95 text-white shadow-[0_-20px_50px_-10px_rgba(0,0,0,.7)] backdrop-blur-2xl" style={{ top: "calc(var(--sat) + 132px)" }}>
      <div onPointerDown={e => dc.start(e)} className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing" aria-hidden><div className="h-[5px] w-10 rounded-full bg-white/25" /></div>
      <div ref={body} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5" style={{ paddingBottom: NAV }}>
        <div onPointerDown={fromHead}>{children}</div>
      </div>
    </motion.section>
  </>
}
