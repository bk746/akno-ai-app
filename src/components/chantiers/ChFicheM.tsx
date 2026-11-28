/* passe 2 · Fiche chantier mobile (maquettes 05-Chantiers/chantier-fiche, -scroll, -journal) :
   en-tête carte satellite, statut, titre, client, adresse, 4 actions rondes, Avancement, Sur place, Photos, Documents liés, Notes, Journal. */
import { useEffect, useMemo, useRef, useState } from "react"
import { Camera, ChevronsUpDown, FileText, Navigation, Phone, Plus, Share, MoreHorizontal } from "lucide-react"
import { useC } from "../ui"
import ChMap from "./ChMap"
import { EmpAvatar } from "./parts"
import { PushLayer, PushScroll, BackBtn } from "../m/MPage"
import { LSec, LCard, DocLine, Timeline, useClientFactures } from "../m/Fiche"
import { StDot, eurM, frShort } from "../m/DocRow"
import { itineraryUrl } from "../../lib/geo"
import { listChantierPhotos, patchChantier, photoUrl, uploadChantierPhoto, usePhotoTick, empName, type Chantier, type ChPhoto, type Employe } from "../../lib/chantiers"
import { STATUS_LABEL, dayIndex, durationDays, effectiveStatus, isLateCh, progressPct, rangeLabel, type ChStatus } from "../../lib/chantierCalc"
import { hapticTap } from "../../lib/haptics"
import type { Devis } from "../../lib/store"

const ST_C: Record<ChStatus, [string, string]> = { in_progress: ["#1E9E4A", "rgba(52,199,89,.16)"], upcoming: ["#B25E00", "rgba(255,159,10,.16)"], done: ["#3C3C43", "rgba(120,120,128,.14)"] }
const dLong = (d?: string | null) => d ? new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "—"
const whenL = (iso: string) => { if (!iso) return ""; const d = new Date(iso), t = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }), days = Math.floor((Date.now() - d.getTime()) / 864e5); return days < 1 && d.getDate() === new Date().getDate() ? `Aujourd’hui, ${t}` : `${d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }).replace(/^./, x => x.toUpperCase())}, ${t}` }
const ago = (iso: string) => { const n = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 864e5)); return n === 0 ? "aujourd’hui" : n === 1 ? "hier" : `il y a ${n} jours` }

function Act({ I, l, href, on, primary, dis }: { I: any; l: string; href?: string; on?: () => void; primary?: boolean; dis?: boolean }) {
  const c = <><span className={`flex h-14 w-14 items-center justify-center rounded-full ${primary ? "bg-[#000] text-[#fff]" : "bg-[#F2F2F7] text-[#1C1C1E]"} ${dis ? "opacity-40" : ""}`}><I size={21} strokeWidth={1.7} /></span><span className={`text-[13px] leading-4 ${dis ? "text-[#C7C7CC]" : "text-[#1C1C1E]"}`}>{l}</span></>
  const cls = "flex w-[72px] flex-col items-center gap-2 active:opacity-70"
  return href && !dis ? <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener" onClick={() => void hapticTap()} className={cls}>{c}</a> : <button type="button" disabled={dis} onClick={() => { void hapticTap(); on?.() }} className={cls}>{c}</button>
}

export default function ChFicheM({ c, team, onClose, onEdit }: { c: Chantier; team: Employe[]; onClose: () => void; onEdit: () => void }) {
  const { s, modal, toast } = useC(); usePhotoTick()
  const st = effectiveStatus(c), pct = progressPct(c), late = isLateCh(c), total = durationDays(c), day = dayIndex(c)
  const [photos, setPhotos] = useState<ChPhoto[] | null>(null), [busy, setBusy] = useState(false), [view, setView] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => { let on = true; void listChantierPhotos(c.id).then(x => { if (on) setPhotos(x) }); return () => { on = false } }, [c.id])
  const [notes, setNotes] = useState(c.notes || ""), [saved, setSaved] = useState(""), t = useRef(0)
  useEffect(() => { setNotes(c.notes || "") }, [c.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const saveNotes = async (v: string) => { if ((c.notes || "") === v) return; setSaved("…"); const e = await patchChantier(c.id, { notes: v || null }); setSaved(e || "Enregistré"); if (!e) setTimeout(() => setSaved(""), 1600) }
  const addPhoto = async (f?: File | null) => { if (!f) return; setBusy(true); const r = await uploadChantierPhoto(c.id, f); setBusy(false); if (r.error) { toast(r.error); return } toast("Photo ajoutée"); setPhotos(await listChantierPhotos(c.id)) }
  const tel = c.client_telephone ? `tel:${c.client_telephone.replace(/[^\d+]/g, "")}` : undefined
  const share = async () => { const text = [c.title, c.client_nom, c.address].filter(Boolean).join(" · "); try { if (navigator.share) await navigator.share({ title: c.title, text, url: c.address ? itineraryUrl(c) : undefined }); else { await navigator.clipboard.writeText(text); toast("Copié") } } catch { /* annulé */ } }
  const setStatus = async (v: ChStatus) => { const e = await patchChantier(c.id, { status: v, ...(v === "done" ? { progress_override: 100 } : {}) }); toast(e || `Chantier ${STATUS_LABEL[v].toLowerCase()}`) }
  const devis: Devis[] = useMemo(() => s.devis.filter(d => d.id === c.devis_id || (!!c.client_nom && d.client.trim().toLowerCase() === c.client_nom.trim().toLowerCase() && d.status === "val")), [s.devis, c.devis_id, c.client_nom])
  const facts = useClientFactures(c.client_nom || "\u0000")
  const today = new Date().toISOString().slice(0, 10)
  const todayEv = s.events.filter(e => e.date === today)
  const hoursOf = (e: Employe) => { const x = todayEv.filter(v => v.employeId === e.id).sort((a, b) => a.start - b.start)[0]; return x ? `${String(Math.floor(x.start)).padStart(2, "0")}:${String(Math.round((x.start % 1) * 60)).padStart(2, "0")}` : "" }
  const journal = useMemo(() => {
    const it: { t: string; w: string; at: string }[] = []
    if (st === "in_progress" && team.length) it.push({ t: "Équipe sur place", w: team.map(e => e.first_name).join(", "), at: new Date().toISOString() })
    ;(photos || []).slice(0, 3).forEach(p => it.push({ t: "Photo ajoutée", w: "", at: p.at }))
    ;(facts || []).filter(f => f.date_emission).forEach(f => it.push({ t: `Facture ${f.numero || ""} ${f.statut === "payee" ? "payée" : "envoyée"}`.trim(), w: "", at: f.date_emission! + "T09:00:00" }))
    devis.forEach(d => it.push({ t: `Devis N° ${d.num} ${d.status === "val" ? "signé" : "créé"}`, w: d.client, at: d.signedAt || d.at || new Date(d.created).toISOString() }))
    if (c.created_at) it.push({ t: "Chantier créé", w: "", at: c.created_at })
    return it.filter(x => x.at).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8).map((x, i) => ({ t: x.t, w: [x.w, whenL(x.at)].filter(Boolean).join(" · "), hot: i === 0 }))
  }, [photos, facts, devis, team, st, c.created_at])
  const [sc, ss] = ST_C[late ? "upcoming" : st]
  const hasPos = c.lat != null && c.lng != null
  const head = <div className="relative bg-[#000]">
    <div className="pointer-events-none relative h-[calc(var(--sat)+230px)] overflow-hidden">
      {hasPos ? <ChMap items={[{ id: c.id, lat: c.lat!, lng: c.lng!, color: st === "in_progress" ? "#30D158" : st === "upcoming" ? "#FF9F0A" : "#0A84FF", label: "" }]} selected={c.id} layer="sat" me={null} initial={{ lat: c.lat!, lng: c.lng!, zoom: 17 }} onSelect={() => {}} className="absolute inset-0" />
        : <div className="absolute inset-0 bg-[linear-gradient(180deg,#2C2C2E,#1C1C1E)]" />}
      <div aria-hidden className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/45 to-transparent" />
    </div>
    <div className="relative z-[1] -mt-10 rounded-t-[40px] bg-[#fff] px-5 pt-5">
      <label className="relative inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[15px] font-semibold" style={{ color: sc, background: ss }}>
        <span className="h-2 w-2 rounded-full" style={{ background: sc }} />{late ? "En retard" : STATUS_LABEL[st]}<ChevronsUpDown size={13} strokeWidth={2} className="opacity-70" />
        <select aria-label="Statut du chantier" value={c.status} onChange={e => void setStatus(e.target.value as ChStatus)} className="absolute inset-0 opacity-0">{(["upcoming", "in_progress", "done"] as ChStatus[]).map(k => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}</select>
      </label>
      <h1 className="mt-3 text-[30px] font-semibold leading-[36px] tracking-[-0.02em] text-[#000]">{c.title}</h1>
      {c.client_nom && <div className="mt-1 text-[19px] leading-6 text-[#3C3C43]">{c.client_nom}</div>}
      {c.address && <div className="mt-0.5 text-[16px] leading-[22px] text-[#6E6E73]">{c.address.replace(/,?\s*\d{5}\s*/, " · ").replace(/\s·\s$/, "")}</div>}
      <div className="mt-6 flex justify-between px-1">
        <Act I={Navigation} l="Itinéraire" primary href={hasPos || c.address ? itineraryUrl(c) : undefined} dis={!hasPos && !c.address} />
        <Act I={Camera} l="Photo" on={() => file.current?.click()} dis={busy} />
        <Act I={Phone} l="Appeler" href={tel} dis={!tel} />
        <Act I={Share} l="Partager" on={() => void share()} />
      </div>
    </div>
  </div>
  const ph = photos || [], shown = ph.slice(0, 6)
  return <PushLayer label={c.title} onClose={onClose} bg="#fff">
    <PushScroll at={300} dark={false} padTop="max(calc(var(--sat) + 2px), 8px)" head={head} title={c.title} sub={c.client_nom || undefined}
      left={<BackBtn on={onClose} />} right={<button type="button" onClick={onEdit} className="ak-caps flex h-9 items-center rounded-full px-4 text-[16px] font-semibold text-[#000]">Modifier</button>} right2={<button type="button" aria-label="Modifier le chantier" onClick={onEdit} className="ak-caps flex h-10 w-10 items-center justify-center rounded-full text-[#000]"><MoreHorizontal size={20} strokeWidth={2} /></button>}>
      <input ref={file} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { void addPhoto(e.target.files?.[0]); e.target.value = "" }} />
      <div className="akno-light bg-[#fff] px-5 pb-6">
        <LSec t="Avancement" aside={<span className="text-[15px] text-[#6E6E73]">{rangeLabel(c)}</span>} />
        <LCard className="px-[18px] pb-4 pt-4">
          <div className="flex items-baseline justify-between"><b className="text-[34px] font-semibold leading-[40px] tracking-[-0.02em] tabular-nums text-[#000]">{st === "upcoming" ? 0 : pct} %</b><span className="text-[15px] text-[#6E6E73]">{st === "upcoming" ? "Pas commencé" : st === "done" ? "Terminé" : total ? `Jour ${day} sur ${total}` : "Dates à fixer"}</span></div>
          <div className="mt-3 h-[5px] overflow-hidden rounded-full bg-[rgba(120,120,128,.2)]"><div className="h-full rounded-full bg-[#000]" style={{ width: `${st === "upcoming" ? 0 : pct}%` }} /></div>
          <div className="mt-4 grid grid-cols-2 border-t border-[rgba(60,60,67,.16)] pt-3"><div><div className="text-[13px] text-[#6E6E73]">Début</div><div className="text-[17px] font-semibold text-[#000]">{dLong(c.start_date)}</div></div><div><div className="text-[13px] text-[#6E6E73]">Fin prévue</div><div className={`text-[17px] font-semibold ${late ? "text-[#E0221B]" : "text-[#000]"}`}>{dLong(c.end_date)}</div></div></div>
        </LCard>
        <LSec t="Sur place" aside={<span className="text-[15px] text-[#6E6E73]">{team.length ? `Aujourd’hui · ${team.length} personne${team.length > 1 ? "s" : ""}` : ""}</span>} />
        <LCard>{team.length ? team.map((e, i) => { const h = hoursOf(e); return <div key={e.id} className={`relative flex h-[60px] items-center gap-3 px-4 ${i ? "before:absolute before:left-[64px] before:right-0 before:top-0 before:h-[.5px] before:bg-[rgba(60,60,67,.16)]" : ""}`}>
          <EmpAvatar e={e} size={36} light /><span className="min-w-0 flex-1"><span className="block truncate text-[17px] leading-[22px] text-[#000]">{empName(e)}</span><span className="block truncate text-[14px] leading-[18px] text-[#6E6E73]">{e.role || "Équipe"}</span></span>
          {h ? <span className="flex items-center gap-1.5 text-[15px] tabular-nums text-[#6E6E73]"><span className="h-[7px] w-[7px] rounded-full bg-[#34C759]" />{h}</span> : null}</div> })
          : <button type="button" onClick={onEdit} className="h-[60px] w-full px-4 text-left text-[16px] text-[#6E6E73]">Personne d’assigné · <span className="text-[#0071E3]">Assigner l’équipe</span></button>}</LCard>
        <LSec t="Photos" aside={<button type="button" onClick={() => file.current?.click()} disabled={busy} className="flex h-9 items-center gap-1.5 rounded-full bg-[#F2F2F7] px-3.5 text-[16px] font-medium text-[#000]"><Plus size={17} strokeWidth={2} />{busy ? "Envoi…" : "Ajouter"}</button>} />
        {ph.length ? <><div className="grid grid-cols-3 gap-1.5">{shown.map((p, i) => { const u = photoUrl(p.path), more = i === 5 && ph.length > 6
            return <button key={p.path} type="button" onClick={() => u && setView(u)} className="relative aspect-square overflow-hidden rounded-[12px] bg-[#E5E5EA]">{u && <img src={u} alt="" className="h-full w-full object-cover" draggable={false} />}{more && <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[22px] font-semibold text-[#fff]">+{ph.length - 5}</span>}</button> })}</div>
          <p className="mt-2.5 text-[14px] text-[#6E6E73]">{ph.length} photo{ph.length > 1 ? "s" : ""} · ajoutée {ago(ph[0].at)}</p></>
          : <button type="button" onClick={() => file.current?.click()} className="flex h-[88px] w-full items-center justify-center gap-2 rounded-[20px] bg-[#F2F2F7] text-[16px] text-[#6E6E73]"><Camera size={19} strokeWidth={1.7} />{photos ? "Aucune photo pour l’instant" : "Chargement…"}</button>}
        <LSec t="Documents liés" />
        {devis.length || (facts && facts.length) ? <LCard>
          {devis.map((d, i) => <DocLine key={d.id} first={i === 0} I={FileText} t={`Devis N° ${d.num}`} s={<><b className="font-semibold text-[#000]">{eurM(d.amount)}</b> · {frShort(d.at || new Date(d.created).toISOString())}</>} am="" st={d.status === "val" ? <StDot t="green">Signé</StDot> : <StDot t="grey">En attente</StDot>} on={() => modal({ kind: "devisPrev", data: d })} />)}
          {(facts || []).slice(0, 4).map((f, i) => <DocLine key={f.id} first={!devis.length && i === 0} I={FileText} t={`Facture ${f.numero || "(brouillon)"}`} s={<><b className="font-semibold text-[#000]">{eurM(Number(f.total_ttc))}</b>{f.date_emission ? ` · ${frShort(f.date_emission)}` : ""}</>} am="" st={f.statut === "payee" ? <StDot t="green">Payée</StDot> : f.statut === "brouillon" ? <StDot t="draft">Brouillon</StDot> : <StDot t="orange">À payer</StDot>} on={() => modal({ kind: "factures", data: { id: f.id } })} />)}
        </LCard> : <LCard className="px-4 py-4 text-[16px] text-[#6E6E73]">Aucun devis ni facture lié.</LCard>}
        <p className="mt-2.5 text-[14px] leading-5 text-[#6E6E73]">Les photos du chantier se joignent au devis et aux factures.</p>
        <LSec t="Notes" aside={<span className="text-[13px] text-[#6E6E73]" aria-live="polite">{saved === "…" ? "Enregistrement…" : saved}</span>} />
        <textarea aria-label="Notes du chantier" value={notes} maxLength={5000} placeholder="Code d’accès, matériel, consignes…" onChange={e => { const v = e.target.value; setNotes(v); clearTimeout(t.current); t.current = window.setTimeout(() => void saveNotes(v), 900) }} onBlur={() => { clearTimeout(t.current); void saveNotes(notes) }}
          style={{ fieldSizing: "content" } as any} rows={3} className="block min-h-[96px] w-full resize-none rounded-[20px] bg-[#F2F2F7] px-[18px] py-4 text-[17px] leading-[24px] text-[#000] outline-none placeholder:text-[#8E8E93]" />
        {journal.length > 0 && <><LSec t="Journal" /><Timeline items={journal} /></>}
      </div>
    </PushScroll>
    {view && <button type="button" aria-label="Fermer la photo" onClick={() => setView(null)} className="fixed inset-0 z-[80] flex items-center justify-center bg-black/95"><img src={view} alt="" className="max-h-full max-w-full object-contain" /></button>}
  </PushLayer>
}
