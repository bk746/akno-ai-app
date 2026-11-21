/* update64 · Créer / modifier un chantier (style iOS des listes groupées, comme les éditeurs update63). */
import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Check, Loader2, MapPin, Search, Trash2, Users } from "lucide-react"
import { ClientRow, ContactSheet, IGroup, IRow, IToggleRow, Reveal, ival, type Contact } from "../form/grouped"
import { Seg } from "../devis/fields"
import { PinMap } from "./ChMap"
import EquipeSheet from "./EquipeSheet"
import { EmpAvatar } from "./parts"
import { deleteChantier, empName, saveChantier, teamOf, useChantiers, type Chantier } from "../../lib/chantiers"
import { STATUS_LABEL, effectiveStatus, progressPct, type ChStatus } from "../../lib/chantierCalc"
import { reverseAddress, searchAddress, type Place } from "../../lib/geo"
import type { Devis } from "../../lib/store"

export type FormReq = { initial?: Chantier | null; at?: { lat: number; lng: number; address?: string } }
type D = { title: string; client_id: string | null; client_nom: string; client_telephone: string; address: string; lat: number | null; lng: number | null; start_date: string; end_date: string; status: ChStatus; manual: boolean; progress: number; notes: string; devis_id: string | null; team: string[] }
// même clé que les fiches clients (ClientFiche.ficheKey)
const cle = (n: string) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/^(m\.|mme|mr|monsieur|madame)\s+/, "").replace(/\s+/g, " ").trim()

export default function ChantierForm({ req, clients, devis, desk, onClose, onSaved, onDeleted, near }: { req: FormReq; clients: Contact[]; devis: Devis[]; desk: boolean; onClose: () => void; onSaved: (id: string) => void; onDeleted?: (id: string) => void; near?: { lat: number; lng: number } | null }) {
  const st = useChantiers(), c0 = req.initial || null
  const [d, setD] = useState<D>(() => ({
    title: c0?.title || "", client_id: c0?.client_id || null, client_nom: c0?.client_nom || "", client_telephone: c0?.client_telephone || "",
    address: c0?.address || req.at?.address || "", lat: c0?.lat ?? req.at?.lat ?? null, lng: c0?.lng ?? req.at?.lng ?? null,
    start_date: c0?.start_date || "", end_date: c0?.end_date || "", status: c0?.status || "upcoming",
    manual: c0?.progress_override != null, progress: c0?.progress_override ?? 0, notes: c0?.notes || "", devis_id: c0?.devis_id || null,
    team: c0 ? teamOf(c0.id, st).map(e => e.id) : [],
  }))
  const set = (p: Partial<D>) => setD(x => ({ ...x, ...p }))
  const [pickC, setPickC] = useState(false), [equipe, setEquipe] = useState(false), [busy, setBusy] = useState(""), [err, setErr] = useState("")
  const [sugg, setSugg] = useState<Place[]>([]), [addrFocus, setAddrFocus] = useState(false), [geoBusy, setGeoBusy] = useState(false)
  const ab = useRef<AbortController | null>(null), typed = useRef(false)

  // adresse saisie → suggestions (api-adresse.data.gouv.fr), 250 ms après la frappe
  useEffect(() => {
    if (!typed.current) return
    const q = d.address.trim()
    if (q.length < 3) { setSugg([]); return }
    const t = setTimeout(() => { ab.current?.abort(); const ac = new AbortController(); ab.current = ac; setGeoBusy(true); searchAddress(q, ac.signal, near || undefined).then(setSugg).catch(() => {}).finally(() => setGeoBusy(false)) }, 250)
    return () => clearTimeout(t)
  }, [d.address]) // eslint-disable-line react-hooks/exhaustive-deps
  // appui long : adresse retrouvée à partir du point
  useEffect(() => { if (req.at && !req.at.address && !c0) { const ac = new AbortController(); setGeoBusy(true); reverseAddress(req.at.lat, req.at.lng, ac.signal).then(a => { if (a) setD(x => x.address ? x : { ...x, address: a }) }).finally(() => setGeoBusy(false)); return () => ac.abort() } }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === "Escape" && !pickC && !equipe) { e.stopImmediatePropagation(); onClose() } }
    addEventListener("keydown", f, true); return () => removeEventListener("keydown", f, true)
  }, [pickC, equipe, onClose])

  const choose = (p: Place) => { typed.current = false; set({ address: p.label, lat: p.lat, lng: p.lng }); setSugg([]); (document.activeElement as HTMLElement | null)?.blur?.() }
  const movePin = (lat: number, lng: number) => { set({ lat, lng }); void reverseAddress(lat, lng).then(a => { if (a) { typed.current = false; set({ address: a }) } }) }
  const fromDevis = (id: string | null) => {
    const dv = devis.find(x => x.id === id)
    setD(x => ({ ...x, devis_id: id, ...(dv ? { title: x.title || dv.objet || "", client_nom: x.client_nom || dv.client || "", client_id: x.client_id || (dv.client ? cle(dv.client) : null), client_telephone: x.client_telephone || dv.phone || "", address: x.address || dv.addr || "" } : {}) }))
    if (dv?.addr && d.lat == null) void searchAddress(dv.addr).then(r => { if (r[0]) setD(x => x.lat == null ? { ...x, lat: r[0].lat, lng: r[0].lng } : x) })
  }
  const calc = progressPct({ status: d.status, start_date: d.start_date || null, end_date: d.end_date || null })
  const eff = effectiveStatus({ status: d.status, start_date: d.start_date || null, end_date: d.end_date || null })

  const save = async () => {
    setErr("")
    if (!d.title.trim()) { setErr("Donnez un titre au chantier."); return }
    if (d.start_date && d.end_date && d.end_date < d.start_date) { setErr("La date de fin doit suivre la date de début."); return }
    let { lat, lng } = d
    if ((lat == null || lng == null) && d.address.trim().length > 4) { const r = await searchAddress(d.address).catch(() => []); if (r[0]) { lat = r[0].lat; lng = r[0].lng } }
    setBusy("save")
    const r = await saveChantier(c0?.id || null, { title: d.title, client_id: d.client_id, client_nom: d.client_nom.trim() || null, client_telephone: d.client_telephone.trim() || null, address: d.address.trim() || null, lat, lng, start_date: d.start_date || null, end_date: d.end_date || null, status: d.status, progress_override: d.manual ? Math.round(d.progress) : null, notes: d.notes.trim() || null, devis_id: d.devis_id }, d.team)
    setBusy("")
    if (!r.ok) { setErr(r.error); return }
    onSaved(r.id)
  }
  const del = async () => {
    if (!c0 || !confirm(`Supprimer le chantier « ${c0.title} » ? Cette action est définitive.`)) return
    setBusy("del"); const e = await deleteChantier(c0.id); setBusy("")
    if (e) { setErr(e); return }
    onDeleted?.(c0.id)
  }
  const devisOpts = useMemo(() => [...devis].sort((a, b) => b.created - a.created).slice(0, 200), [devis])

  return <motion.div className={`fixed inset-0 z-[55] flex ${desk ? "items-center justify-center bg-black/60 backdrop-blur-[3px]" : ""}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={desk ? onClose : undefined}>
    <motion.div role="dialog" aria-modal="true" aria-label={c0 ? "Chantier" : "Nouveau chantier"} onClick={e => e.stopPropagation()}
      initial={desk ? { scale: .97, opacity: 0 } : { y: 28, opacity: 0 }} animate={desk ? { scale: 1, opacity: 1 } : { y: 0, opacity: 1 }} exit={desk ? { scale: .97, opacity: 0 } : { y: 28, opacity: 0 }} transition={{ type: "spring", stiffness: 380, damping: 34 }}
      className={`flex flex-col bg-black text-white ${desk ? "h-[88dvh] w-full max-w-[580px] overflow-hidden rounded-[24px] border border-white/[.08]" : "h-full w-full"}`}>
      <div className="shrink-0 border-b border-white/[.07] bg-black/80 backdrop-blur-xl" style={{ paddingTop: desk ? 0 : "var(--sat)" }}>
        <div className="flex h-14 items-center justify-between px-4">
          <button type="button" onClick={onClose} className="w-24 text-left text-[16px] text-[#7EA6FF]">Annuler</button>
          <span className="truncate text-[17px] font-semibold">{c0 ? "Chantier" : "Nouveau chantier"}</span>
          <button type="button" disabled={!!busy} onClick={() => void save()} className="flex w-24 justify-end text-[16px] font-semibold text-[#7EA6FF] disabled:opacity-40">{busy === "save" ? <Loader2 size={18} className="animate-spin" /> : c0 ? "Enregistrer" : "Créer"}</button>
        </div>
      </div>
      {err && <div role="alert" className="shrink-0 bg-[#FF453A]/12 px-5 py-2.5 text-[13.5px] text-[#FFB4AF]">{err}</div>}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-5" style={{ paddingBottom: "calc(40px + var(--sab) + var(--kb, 0px))" }}>
        <div className="space-y-7">
          <IGroup title="Chantier" id="cf-g-ch">
            <IRow label="Titre" htmlFor="cf-title"><input id="cf-title" className={ival} value={d.title} maxLength={160} autoCapitalize="sentences" enterKeyHint="next" placeholder="Ex. Rénovation salle de bain" onChange={e => set({ title: e.target.value })} /></IRow>
            <div className="ig-row flex min-h-12 items-center gap-3 py-1.5 pl-4 pr-3"><span className="min-w-0 flex-1 text-[15px] text-white/50">Statut</span><Seg size="sm" label="Statut du chantier" value={d.status} onChange={v => set({ status: v })} opts={[["upcoming", "À venir"], ["in_progress", "En cours"], ["done", "Terminé"]]} /></div>
          </IGroup>
          <IGroup title="Client" id="cf-g-cl">
            <ClientRow value={d.client_nom} phone={d.client_telephone} onOpen={() => setPickC(true)} />
            <IRow label="Téléphone" htmlFor="cf-tel"><input id="cf-tel" className={ival} type="tel" inputMode="tel" autoComplete="tel" placeholder="06 12 34 56 78" value={d.client_telephone} onChange={e => set({ client_telephone: e.target.value })} /></IRow>
          </IGroup>
          <IGroup title="Adresse" id="cf-g-ad" foot={d.lat != null ? "Touchez la carte ou déplacez le repère pour ajuster." : "Choisissez une adresse proposée pour placer le chantier sur la carte."}>
            <div className="ig-row flex min-h-12 items-center gap-2 pl-4 pr-3">
              <Search size={16} className="shrink-0 text-white/35" />
              <input id="cf-addr" aria-label="Adresse du chantier" role="combobox" aria-expanded={addrFocus && sugg.length > 0} aria-autocomplete="list" className={ival} autoComplete="street-address" autoCapitalize="words" enterKeyHint="search" placeholder="N°, rue, ville" value={d.address}
                onFocus={() => setAddrFocus(true)} onBlur={() => setTimeout(() => setAddrFocus(false), 150)} onChange={e => { typed.current = true; set({ address: e.target.value }) }}
                onKeyDown={e => { if (e.key === "Enter" && sugg[0]) { e.preventDefault(); choose(sugg[0]) } }} />
              {geoBusy && <Loader2 size={15} className="shrink-0 animate-spin text-white/40" />}
            </div>
            <Reveal open={addrFocus && sugg.length > 0}><div role="listbox" aria-label="Adresses proposées">
              {sugg.map(p => <button key={p.label} type="button" role="option" aria-selected={false} onMouseDown={e => e.preventDefault()} onClick={() => choose(p)} className="ig-row flex w-full items-center gap-3 py-2.5 pl-4 pr-3 text-left active:bg-white/[.05]"><MapPin size={16} className="shrink-0 text-[#7EA6FF]" /><span className="min-w-0 flex-1 truncate text-[15.5px]">{p.label}</span></button>)}
            </div></Reveal>
            {d.lat != null && d.lng != null && <div className="ig-row relative h-[190px] overflow-hidden"><PinMap lat={d.lat} lng={d.lng} onMove={movePin} /></div>}
          </IGroup>
          <IGroup title="Dates" id="cf-g-dt">
            <IRow label="Début" htmlFor="cf-start"><input id="cf-start" type="date" className={ival + " text-left"} value={d.start_date} onChange={e => set({ start_date: e.target.value, ...(d.end_date && e.target.value > d.end_date ? { end_date: e.target.value } : {}) })} /></IRow>
            <IRow label="Fin" htmlFor="cf-end"><input id="cf-end" type="date" className={ival + " text-left"} min={d.start_date || undefined} value={d.end_date} onChange={e => set({ end_date: e.target.value })} /></IRow>
          </IGroup>
          <IGroup title="Avancement" id="cf-g-av">
            <IToggleRow label="Avancement manuel" sub={d.manual ? undefined : `Calculé d'après les dates : ${calc} % (${STATUS_LABEL[eff].toLowerCase()})`} on={d.manual} onChange={v => set({ manual: v, progress: v ? (d.progress || calc) : d.progress })} />
            <Reveal open={d.manual}><div className="ig-row flex min-h-14 items-center gap-4 pl-4 pr-4">
              <input type="range" min={0} max={100} step={5} value={d.progress} aria-label="Avancement en pourcentage" onChange={e => set({ progress: Number(e.target.value) })} className="h-8 min-w-0 flex-1 accent-[#2F6BFF]" />
              <span className="w-12 text-right text-[16px] font-semibold tabular-nums">{d.progress} %</span>
            </div></Reveal>
          </IGroup>
          <IGroup title={`Équipe${d.team.length ? ` · ${d.team.length}` : ""}`} id="cf-g-eq">
            {st.employes.map(e => { const on = d.team.includes(e.id); return <button key={e.id} type="button" role="checkbox" aria-checked={on} onClick={() => set({ team: on ? d.team.filter(x => x !== e.id) : [...d.team, e.id] })} className="ig-row flex w-full items-center gap-3 py-2 pl-4 pr-4 text-left active:bg-white/[.04]">
              <EmpAvatar e={e} size={34} /><span className="min-w-0 flex-1"><span className="block truncate text-[16px]">{empName(e)}</span>{e.role && <span className="block truncate text-[12.5px] text-white/45">{e.role}</span>}</span>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${on ? "bg-[#2F6BFF] text-white" : "border border-white/25"}`}>{on && <Check size={14} strokeWidth={3} />}</span>
            </button> })}
            <button type="button" onClick={() => setEquipe(true)} className="ig-row flex min-h-12 w-full items-center gap-3 pl-4 pr-3 text-left text-[16px] text-[#7EA6FF] active:bg-white/[.04]"><Users size={18} />{st.employes.length ? "Gérer l'équipe…" : "Ajouter des employés"}</button>
          </IGroup>
          <IGroup title="Devis lié" id="cf-g-dv" foot="Facultatif. Le titre, le client et l'adresse du devis sont repris s'ils sont vides.">
            <IRow label="Devis" htmlFor="cf-devis"><select id="cf-devis" className={ival + " appearance-none"} value={d.devis_id || ""} onChange={e => fromDevis(e.target.value || null)}>
              <option value="">Aucun</option>{devisOpts.map(x => <option key={x.id} value={x.id}>N° {x.num} · {x.client}{x.objet ? ` · ${x.objet}` : ""}</option>)}
            </select></IRow>
          </IGroup>
          <IGroup title="Notes" id="cf-g-nt">
            <div className="ig-row"><textarea aria-label="Notes du chantier" rows={3} style={{ fieldSizing: "content" } as any} className={ival + " !h-auto min-h-[96px] resize-none py-3 pl-4 leading-[22px]"} maxLength={5000} placeholder="Code d'accès, matériel, consignes…" value={d.notes} onChange={e => set({ notes: e.target.value })} /></div>
          </IGroup>
          {c0 && <button type="button" disabled={!!busy} onClick={() => void del()} className="flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-[#141416] text-[16px] text-[#FF6B6B] active:bg-white/[.06]"><Trash2 size={17} />Supprimer le chantier</button>}
        </div>
      </div>
      <ContactSheet open={pickC} desk={desk} clients={clients} current={d.client_nom} onClose={() => setPickC(false)} onPick={(c, isNew) => {
        setPickC(false)
        setD(x => ({ ...x, client_nom: c.name, client_id: isNew ? null : cle(c.name), client_telephone: c.phone || (isNew ? x.client_telephone : x.client_telephone), address: x.address || (!isNew && c.addr) || "" }))
        if (!isNew && c.addr && d.lat == null && !d.address) void searchAddress(c.addr).then(r => { if (r[0]) setD(x => x.lat == null ? { ...x, lat: r[0].lat, lng: r[0].lng } : x) })
      }} />
      <AnimatePresence>{equipe && <EquipeSheet desk={desk} z={75} close={() => setEquipe(false)} />}</AnimatePresence>
    </motion.div>
  </motion.div>
}
