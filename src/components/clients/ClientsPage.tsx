/* update66 · Page Clients — carnet d'adresses relié au reste de l'app (maquettes clients-3ecrans.png, clients-fiche.png, clients-liste.png).
   Liste (résumé, recherche, filtres, statut couleur de la carte), fiche (coordonnées, vignette satellite, 4 actions, chiffres, chantier en cours,
   historique automatique, documents), ajout / modification (ClientForm). Même style que la page Équipe (update65). Chargée à la demande. */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ChevronLeft, ChevronRight, FileText, Mail, MapPin, MessageSquare, Navigation, Phone, Plus, Search, UsersRound, X } from "lucide-react"
import { useC } from "../ui"
import { SatThumb } from "../SatThumb"
import { Bar, AvatarStack } from "../chantiers/parts"
import { ClientForm } from "./ClientForm"
import { PushStack } from "../nav/PushStack"
import { geocode, loadClients, takeNewClient, takeOpenClient, useClients, type NewClientSeed } from "../../lib/clients"
import { loadChantiers, requestOpenChantier, teamOf, useChantiers } from "../../lib/chantiers"
import { dueOf, refreshFactures, useFacturesLite } from "../../lib/facturesLite"
import { useProfile } from "../../lib/profile"
import { itineraryUrl } from "../../lib/geo"
import { STATUS_COLOR, STATUS_LABEL, effectiveStatus, progressPct, rangeLabel, todayISO, untilLabel } from "../../lib/chantierCalc"
import { FILTERS, KIND_LABEL, addrLines, buildDirectory, caTotal, chantiersCount, currentSite, documents, ficheKey, histDate, history as buildHistory, initials, matchFilter, matchQuery, phoneKey, statusOf, summary, type Client, type Filter, type HKind } from "../../lib/clientsCalc"

const NAV = "var(--page-bottom)"
const PUSH = { type: "spring" as const, stiffness: 420, damping: 40, mass: .9 }
const card = "rounded-[22px] bg-[#141416]"
const MOL = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]
export const eur0 = (n: number) => `${Math.round(n).toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ")} €`
const Head = ({ t, n, r }: { t: string; n?: number; r?: ReactNode }) => <div className="mb-2 mt-6 flex items-center justify-between px-1"><h2 className="text-[17px] font-semibold tracking-[-0.02em] text-white">{t}</h2>{r ?? (n != null && <span className="text-[15px] font-medium tabular-nums text-white/45">{n}</span>)}</div>
const Dot = ({ c }: { c: string }) => <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: c }} />
export const ClientAv = ({ c, size = 36 }: { c: Pick<Client, "name" | "kind">; size?: number }) => <span aria-hidden className={`flex shrink-0 select-none items-center justify-center font-semibold text-white/90 ring-1 ring-inset ring-white/[.08] ${c.kind === "particulier" ? "rounded-full" : "rounded-[30%]"}`}
  style={{ width: size, height: size, fontSize: size * .36, background: "#2C2C2E" }}>{initials(c.name)}</span>

/** Carnet calculé à partir des données déjà chargées par l'app (appels, devis, RDV) + fiches, factures et chantiers. */
export function useDirectory() {
  const { s } = useC(), cs = useClients(), ch = useChantiers(), fl = useFacturesLite()
  useEffect(() => { void loadClients(); if (!ch.ready) void loadChantiers(); void refreshFactures() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const factures = useMemo(() => (fl.rows || []).map(f => ({ ...f, due: dueOf(f) })), [fl.rows])
  const list = useMemo(() => buildDirectory({
    fiches: cs.fiches,
    calls: s.calls.map(x => ({ id: x.id, name: x.name, phone: x.phone, createdAt: x.createdAt, note: x.note, topic: x.topic, besoin: x.besoin, addr: x.addr })),
    devis: s.devis.map(d => ({ id: String(d.id), num: d.num, client: d.client, objet: d.objet, status: d.status, amount: d.amount, at: d.at, sentAt: d.sentAt, repliedAt: d.repliedAt, reply: d.reply, phone: d.phone, email: d.email, addr: d.addr, callId: d.callId })),
    factures, chantiers: ch.rows, events: s.events.map(e => ({ id: e.id, date: e.date, name: e.name, topic: e.topic, phone: e.phone, callId: e.callId, addr: e.addr })),
  }), [cs.fiches, s.calls, s.devis, s.events, factures, ch.rows])
  return { list, factures, cs, ch, ready: cs.ready && fl.rows !== null }
}

export default function ClientsPage({ head }: { head?: ReactNode }) {
  const { desk, go } = useC(), reduce = useReducedMotion(), prof = useProfile().p
  const { list, factures, cs, ch, ready } = useDirectory()
  const delay = useMemo(() => { const a = Array.isArray(prof?.relance_delais) ? (prof!.relance_delais as unknown[]).map(Number).filter(n => n >= 1 && n <= 60).sort((x, y) => x - y) : []; return a[0] || 3 }, [prof])
  const [q, setQ] = useState(""), [filter, setFilter] = useState<Filter>("all"), [openKey, setOpenKey] = useState<string | null>(null), [form, setForm] = useState<{ c: Client | null; seed?: NewClientSeed | null } | null>(null)
  const [today] = useState(() => todayISO()), scroller = useRef<HTMLDivElement>(null), pushed = useRef(false)

  const open = useCallback((key: string) => {
    setOpenKey(key)
    try { history.pushState({ ...(history.state || {}), aknoClient: key }, ""); pushed.current = true } catch { pushed.current = false }
  }, [])
  const back = useCallback(() => { if (pushed.current) { pushed.current = false; history.back() } else setOpenKey(null) }, [])
  useEffect(() => { const f = () => { if (!history.state?.aknoClient) { pushed.current = false; setOpenKey(null) } }; addEventListener("popstate", f); return () => removeEventListener("popstate", f) }, [])
  useEffect(() => { if (!openKey || form) return; const f = (e: KeyboardEvent) => { if (e.key === "Escape") back() }; addEventListener("keydown", f); return () => removeEventListener("keydown", f) }, [openKey, form, back])
  // demandes venues d'ailleurs (fiche d'appel → « Ajouter aux clients » / « Fiche client »)
  const pendingOpen = useRef<string | null>(null)
  useEffect(() => {
    const fo = () => { const k = takeOpenClient(); if (k) pendingOpen.current = k }
    const fn = () => { const sd = takeNewClient(); if (sd) setForm({ c: null, seed: sd }) }
    fo(); fn(); addEventListener("akno-client-open", fo); addEventListener("akno-client-new", fn)
    return () => { removeEventListener("akno-client-open", fo); removeEventListener("akno-client-new", fn) }
  }, [])
  useEffect(() => {
    const k = pendingOpen.current; if (!k || !ready) return
    const [key, name, phone] = k.split("\u0001"), p = phoneKey(phone), n = ficheKey(name || "")
    const c = list.find(x => x.key === key) || (p ? list.find(x => phoneKey(x.phone) === p) : undefined) || list.find(x => x.key === n || ficheKey(x.name) === n)
    pendingOpen.current = null; if (c) open(c.key)
  }, [ready, list, open])

  const shown = useMemo(() => list.filter(c => matchFilter(c, filter, today, delay) && matchQuery(c, q)).sort((a, b) => b.last.localeCompare(a.last) || a.name.localeCompare(b.name, "fr")), [list, filter, q, today, delay])
  const sum = useMemo(() => summary(list, ch.rows, factures, today), [list, ch.rows, factures, today])
  const client = openKey ? list.find(c => c.key === openKey) || null : null
  useEffect(() => { if (openKey && ready && !client) setOpenKey(null) }, [openKey, ready, client])

  const row = (c: Client) => {
    const st = statusOf(c, today), sub = c.kind === "syndic" ? ["Syndic", c.city].filter(Boolean).join(" · ") : c.city || (c.kind === "pro" ? "Professionnel" : c.phone || "—")
    return <motion.div layout="position" key={c.key} className="eq-sep eq-sep-cl">
      <button type="button" onClick={() => open(c.key)} aria-label={`${c.name}${st ? `, ${st.label}` : ""}`} className="flex w-full items-center gap-3 py-[9px] pl-3.5 pr-3 text-left transition-colors active:bg-white/[.05]">
        <ClientAv c={c} size={38} />
        <span className="min-w-0 flex-1"><span className="block truncate text-[16px] font-semibold leading-tight tracking-[-0.02em]">{c.name}</span><span className="mt-0.5 block truncate text-[13.5px] text-white/50">{sub}</span></span>
        {st && <span className={`flex shrink-0 items-center gap-1.5 text-[13.5px] font-medium ${st.tone === "late" ? "text-[#FF5F57]" : "text-white/45"}`}>{st.tone === "late" && <Dot c="#FF5F57" />}{st.label}</span>}
        <ChevronRight size={17} className="shrink-0 text-white/25" />
      </button>
    </motion.div>
  }

  const listView = <div>
    {/* update67 : page comme les autres (absente de la barre) — en-tête commun avec le logo, pas de « < Compte » */}
    {!desk && head}
    <div className={`flex items-center justify-between ${desk ? "" : "mt-3"}`}>
      <h1 className="text-[34px] font-bold leading-none tracking-[-0.03em]">Clients</h1>
      <motion.button type="button" whileTap={{ scale: .9 }} aria-label="Ajouter un client" disabled={cs.missing} onClick={() => setForm({ c: null })} className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black shadow-[0_4px_14px_rgba(255,255,255,.18)] disabled:opacity-40"><Plus size={20} strokeWidth={2.4} /></motion.button>
    </div>
    {!ready ? <div className="mt-5 space-y-3" aria-hidden>{[0, 1, 2].map(i => <div key={i} className={`${card} h-[64px] opacity-60`} />)}</div>
      : !list.length ? <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={PUSH} className="flex flex-col items-center px-6 pb-8 pt-16 text-center">
        <span className="flex h-[84px] w-[84px] items-center justify-center rounded-full bg-gradient-to-b from-white/[.14] to-white/[.04] shadow-[inset_0_1px_0_rgba(255,255,255,.12)]"><UsersRound size={34} strokeWidth={1.5} /></span>
        <p className="mt-6 text-[19px] font-semibold tracking-[-0.01em]">Votre carnet d'adresses</p>
        <p className="mt-2 max-w-[300px] text-[14.5px] leading-[21px] text-white/50">Chaque client avec ses chantiers, devis, factures et appels, au même endroit. Les clients de vos devis et de vos appels apparaissent ici tout seuls.</p>
        <motion.button type="button" whileTap={{ scale: .97 }} disabled={cs.missing} onClick={() => setForm({ c: null })} className="mt-7 flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[16px] font-semibold text-black disabled:opacity-40"><Plus size={18} strokeWidth={2.4} />Ajouter un client</motion.button>
        {cs.missing && <p className="mt-4 text-[12.5px] text-white/35">Les fiches clients demandent la migration 20261121_10 (update61).</p>}
      </motion.div>
        : <>
          <div className={`${card} mt-5 grid grid-cols-[1fr_1fr_1.35fr] py-3`}>
            {([[String(sum.clients), "Clients"], [String(sum.onsite), "En cours"], [eur0(sum.due), "À encaisser"]] as const).map(([n, l], i) => <div key={l} className={`min-w-0 px-3.5 ${i ? "border-l border-white/[.09]" : ""}`}><div className="truncate text-[22px] font-semibold leading-tight tabular-nums">{n}</div><div className="mt-0.5 text-[12.5px] text-white/50">{l}</div></div>)}
          </div>
          <label className={`${card} mt-3 flex h-10 items-center gap-2 px-3 text-white/45`}><Search size={16} strokeWidth={2} /><input type="search" enterKeyHint="search" aria-label="Rechercher un client" placeholder="Nom, ville, téléphone" value={q} onChange={e => setQ(e.target.value)} className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-white outline-none placeholder:text-white/40" />{q && <button type="button" aria-label="Effacer" onClick={() => setQ("")}><X size={16} /></button>}</label>
          <div role="tablist" aria-label="Filtrer les clients" className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {FILTERS.map(([f, l]) => <motion.button key={f} type="button" role="tab" aria-selected={filter === f} whileTap={{ scale: .95 }} onClick={() => setFilter(f)} className={`relative h-[34px] shrink-0 rounded-full px-3.5 text-[14px] font-medium transition-colors ${filter === f ? "text-black" : "bg-white/[.08] text-white/85"}`}>
              {filter === f && <motion.span layoutId="cl-filter" transition={{ type: "spring", stiffness: 520, damping: 40 }} className="absolute inset-0 rounded-full bg-white" />}<span className="relative">{l}</span></motion.button>)}
          </div>
          <Head t={filter === "all" && !q ? "Récents" : FILTERS.find(f => f[0] === filter)![1] === "Tous" ? "Résultats" : FILTERS.find(f => f[0] === filter)![1]} n={shown.length} />
          {shown.length ? <div className={`${card} overflow-hidden`}><AnimatePresence initial={false}>{shown.map(row)}</AnimatePresence></div>
            : <p className="mt-10 text-center text-[14.5px] text-white/45">{q ? `Aucun client pour « ${q} »` : filter === "relance" ? "Aucun client à relancer. Tout est à jour." : "Aucun client pour ce filtre."}</p>}
        </>}
  </div>

  return <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-black text-white">
    <PushStack ref={scroller} base={listView} top={client ? <Fiche c={client} today={today} sigs={cs.sigs} onBack={back} onEdit={() => setForm({ c: client })} /> : null} topKey={client ? `f-${client.key}` : undefined}
      inner={desk ? "max-w-[640px]" : ""} padTop={desk ? 28 : "calc(var(--sat) + 2px)"} padBottom={desk ? 40 : "calc(var(--page-bottom) + 16px)"} />
    <AnimatePresence>{form && <ClientForm key="cf" initial={form.c} seed={form.seed} directory={list} desk={desk} onClose={() => setForm(null)} onOpen={k => open(k)} onSaved={k => { if (!form.c) open(k) }} onDeleted={() => { setOpenKey(null); if (pushed.current) { pushed.current = false; history.back() } }} />}</AnimatePresence>
  </div>
}

/* ---------- Fiche client ---------- */
const HI: Record<HKind, typeof Phone> = { call: Phone, devis: FileText, chantier: MapPin, facture: FileText }
function Fiche({ c, today, sigs, onBack, onEdit }: { c: Client; today: string; sigs: { devis_id: string; at: string }[]; onBack: () => void; onEdit: () => void }) {
  const { s, modal, go } = useC(), st = useChantiers(), [all, setAll] = useState(false)
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(c.fiche?.lat != null && c.fiche?.lng != null ? { lat: c.fiche.lat, lng: c.fiche.lng } : null)
  useEffect(() => { if (pos || !c.addr) return; let on = true; void geocode(c.addr).then(p => { if (on && p) setPos(p) }); return () => { on = false } }, [c.addr, pos])
  const raw = c.phone.replace(/[^\d+]/g, ""), [l1, l2] = addrLines(c.addr)
  const since = c.since ? `depuis ${MOL[+c.since.slice(5, 7) - 1]}${c.since.slice(0, 4) !== today.slice(0, 4) ? ` ${c.since.slice(0, 4)}` : ""}` : ""
  const site = currentSite(c, today), team = site ? teamOf(site.id, st) : [], cnt = chantiersCount(c, today)
  const hist = useMemo(() => buildHistory(c, sigs, today), [c, sigs, today]), docs = useMemo(() => documents(c, today), [c, today])
  const due = c.factures.filter(f => !!f.numero && (f.statut === "emise" || f.statut === "envoyee") && f.type !== "avoir").reduce((a, f) => a + Math.max(0, f.due), 0)
  const openSite = (id: string) => { requestOpenChantier(id); go("ch") }
  const openDoc = (kind: "devis" | "facture", id: string) => { if (kind === "facture") modal({ kind: "factures", data: { id } }); else { const d = s.devis.find(x => String(x.id) === id); if (d) modal({ kind: "devisPrev", data: d }) } }
  const btn = "flex h-[58px] flex-col items-center justify-center gap-1 rounded-[16px] text-[13.5px] font-semibold transition-transform active:scale-[.97]"
  const A = ({ href, I, l, primary, ext }: { href?: string; I: typeof Phone; l: string; primary?: boolean; ext?: boolean }) => href
    ? <a href={href} {...(ext ? { target: "_blank", rel: "noreferrer" } : {})} className={`${btn} ${primary ? "bg-white text-black" : "bg-white/[.09] text-white"}`}><I size={19} strokeWidth={2} />{l}</a>
    : <span aria-disabled="true" className={`${btn} ${primary ? "bg-white/40 text-black/60" : "bg-white/[.05] text-white/30"}`}><I size={19} strokeWidth={2} />{l}</span>
  const sst = site ? effectiveStatus(site, today) : null
  const others = c.chantiers.filter(x => x.id !== site?.id).sort((a, b) => (b.start_date || "").localeCompare(a.start_date || ""))
  const shownH = all ? hist : hist.slice(0, 4)
  return <div>
    <div className="flex h-11 items-center justify-between">
      <motion.button type="button" whileTap={{ scale: .96 }} onClick={onBack} className="-ml-1.5 flex items-center text-[17px]"><ChevronLeft size={26} strokeWidth={2} />Clients</motion.button>
      <button type="button" onClick={onEdit} className="text-[17px] text-white active:opacity-60">Modifier</button>
    </div>
    <div className="mt-3 flex items-start gap-4">
      <ClientAv c={c} size={72} />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[24px] font-bold leading-tight tracking-[-0.025em]">{c.name}</h1>
        <p className="mt-0.5 truncate text-[14px] text-white/50">{[KIND_LABEL[c.kind], since].filter(Boolean).join(" · ")}</p>
        {l1 && <p className="mt-0.5 text-[14px] leading-[19px] text-white/80"><span className="block truncate">{l1}</span>{l2 && <span className="block truncate">{l2}</span>}</p>}
      </div>
      {pos ? <a href={itineraryUrl({ lat: pos.lat, lng: pos.lng, address: c.addr })} target="_blank" rel="noreferrer" aria-label="Voir l'adresse sur une carte" className="shrink-0"><SatThumb lat={pos.lat} lng={pos.lng} size={66} /></a> : null}
    </div>
    <div className="mt-5 grid grid-cols-4 gap-2">
      <A href={raw ? `tel:${raw}` : undefined} I={Phone} l="Appeler" primary />
      <A href={raw ? `sms:${raw}` : undefined} I={MessageSquare} l="SMS" />
      <A href={c.addr ? itineraryUrl({ lat: pos?.lat, lng: pos?.lng, address: c.addr }) : undefined} I={Navigation} l="Itinéraire" ext />
      <A href={c.email ? `mailto:${c.email}` : undefined} I={Mail} l="Email" />
    </div>
    <div className="mt-3 grid grid-cols-3 gap-2">
      {([["CA total", eur0(caTotal(c)), ""], ["À encaisser", eur0(due), ""], ["Chantiers", String(cnt.n), cnt.l]] as const).map(([l, v, u]) => <div key={l} className={`${card} min-w-0 px-3 py-2.5`}><div className="text-[12.5px] text-white/50">{l}</div><div className="mt-0.5 flex items-baseline gap-1 truncate"><span className="text-[19px] font-semibold tabular-nums">{v}</span>{u && <span className="text-[13px] text-white/50">{u}</span>}</div></div>)}
    </div>

    {site && <motion.button type="button" whileTap={{ scale: .985 }} onClick={() => openSite(site.id)} className={`${card} mt-3 flex w-full items-center gap-3 px-4 py-3.5 text-left`}>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[13px] text-white/55"><Dot c={STATUS_COLOR[sst!]} />{sst === "in_progress" ? "En cours" : "À venir"} · {rangeLabel(site)}</span>
        <span className="mt-1 block truncate text-[16.5px] font-semibold">{site.title}</span>
        {sst === "in_progress" ? <span className="mt-2.5 flex items-center gap-3"><Bar pct={progressPct(site, today)} /><span className="text-[14px] font-semibold tabular-nums">{progressPct(site, today)} %</span></span> : <span className="mt-1.5 block text-[13.5px] text-[#7EA6FF]">{untilLabel(site, today)}</span>}
      </span>
      {team.length > 0 && <span className="self-center"><AvatarStack team={team} size={26} /></span>}
      <ChevronRight size={18} className="shrink-0 text-white/25" />
    </motion.button>}

    {hist.length > 0 && <>
      <Head t="Historique" r={hist.length > 4 ? <button type="button" onClick={() => setAll(x => !x)} className="text-[14px] text-white/55 active:opacity-60">{all ? "Réduire" : `Tout voir (${hist.length})`}</button> : <span />} />
      <div className={`${card} px-3.5 py-1.5`}><AnimatePresence initial={false}>{shownH.map((h, i) => { const I = HI[h.kind]; return <motion.div key={h.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ height: { type: "spring", stiffness: 420, damping: 38 }, opacity: { duration: .15 } }} className="relative overflow-hidden">
        {i < shownH.length - 1 && <span aria-hidden className="absolute bottom-0 left-[13px] top-[34px] w-px bg-white/[.12]" />}
        <div className="flex items-start gap-3 py-2"><span className="mt-0.5 flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full bg-white/[.09] text-white/70"><I size={13.5} strokeWidth={2} /></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-medium leading-[20px]">{h.title}</span><span className="block truncate text-[13px] text-white/50">{h.sub}</span></span>
          <span className="shrink-0 pt-0.5 text-[13px] text-white/45">{histDate(h.at, today)}</span></div>
      </motion.div> })}</AnimatePresence></div>
    </>}

    <Head t="Documents" r={<motion.button type="button" whileTap={{ scale: .95 }} onClick={() => modal({ kind: "devis", data: { client: c.name, phone: c.phone || undefined, email: c.email || undefined, addr: c.addr || undefined } })} className="flex h-8 items-center gap-1 rounded-full bg-white/[.1] px-3 text-[14px] font-semibold"><Plus size={15} strokeWidth={2.4} />Nouveau devis</motion.button>} />
    {docs.length ? <div className={`${card} overflow-hidden`}>{docs.map(d => <button key={d.kind + d.id} type="button" onClick={() => openDoc(d.kind, d.id)} className="eq-sep flex w-full items-center gap-3 px-3.5 py-2.5 text-left active:bg-white/[.04]">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white/[.08] text-white/70"><FileText size={16} strokeWidth={1.9} /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-[15.5px] font-medium">{d.title}</span><span className="block truncate text-[13px] text-white/50">{d.sub}</span></span>
      <span className="shrink-0 text-[15.5px] font-semibold tabular-nums">{eur0(d.amount)}</span>
      <span className={`shrink-0 rounded-full px-2.5 py-[3px] text-[12px] font-medium ${d.tone === "late" ? "bg-[#FF453A]/15 text-[#FF7A72]" : "bg-white/[.1] text-white/65"}`}>{d.status}</span>
    </button>)}</div> : <div className={`${card} px-4 py-4 text-[14.5px] text-white/45`}>Aucun devis ni facture pour l'instant.</div>}

    {/* autres chantiers du client (ceux qui ne sont pas dans la carte « en cours » ci-dessus), comme la section update65 de la fiche client */}
    {others.length > 0 && <><Head t="Chantiers et équipe" n={others.length} /><div className={`${card} overflow-hidden`}>{others.map(x => { const xs = effectiveStatus(x, today), tm = teamOf(x.id, st); return <button key={x.id} type="button" onClick={() => openSite(x.id)} className="eq-sep flex w-full items-center gap-3 px-4 py-3 text-left active:bg-white/[.04]">
      <Dot c={STATUS_COLOR[xs]} />
      <span className="min-w-0 flex-1"><span className="block truncate text-[15.5px] font-medium">{x.title}</span><span className="block truncate text-[13px] text-white/50">{STATUS_LABEL[xs]} · {rangeLabel(x)}{tm.length ? "" : " · équipe à assigner"}</span></span>
      {tm.length > 0 && <AvatarStack team={tm} size={26} />}
      <ChevronRight size={16} className="shrink-0 text-white/25" />
    </button> })}</div></>}

    {(c.fiche?.notes || c.fiche?.siren) && <><Head t="Notes" r={<span />} /><div className={`${card} px-4 py-3`}>
      {c.fiche?.notes && <p className="whitespace-pre-line text-[15px] leading-[21px] text-white/80">{c.fiche.notes}</p>}
      {c.fiche?.siren && <p className={`${c.fiche?.notes ? "mt-2" : ""} text-[13px] text-white/45`}>SIREN {c.fiche.siren.replace(/(\d{3})(?=\d)/g, "$1 ")}</p>}
    </div></>}
  </div>
}
