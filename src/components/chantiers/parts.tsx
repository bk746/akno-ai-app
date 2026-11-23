/* update64 · Éléments communs Chantiers : avatars d'équipe, carte compacte, fiche complète. */
import { useEffect, useRef, useState } from "react"
import { motion } from "motion/react"
import { Navigation, Phone, ExternalLink, X, MapPin } from "lucide-react"
import { STATUS_COLOR, STATUS_LABEL, dayIndex, durationDays, effectiveStatus, endLabel, isLateCh, progressPct, rangeLabel, rangeLong, untilLabel } from "../../lib/chantierCalc"
import { empName, patchChantier, photoUrl, usePhotoTick, type Chantier, type Employe } from "../../lib/chantiers"
import { itineraryUrl } from "../../lib/geo"

const ini = (e: Employe) => `${e.first_name[0] || ""}${e.last_name?.[0] || ""}`.toUpperCase()
export function EmpAvatar({ e, size = 36, ring }: { e: Employe; size?: number; ring?: boolean }) {
  usePhotoTick()
  const url = photoUrl(e.photo_path)
  return <span aria-hidden className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white ${ring ? "ring-2 ring-[#232326]" : ""}`} style={{ width: size, height: size, fontSize: size * .38, background: "#2C2C2E" }}>
    {url ? <img src={url} alt="" className="h-full w-full object-cover" draggable={false} /> : ini(e)}
  </span>
}
export function AvatarStack({ team, max = 3, size = 26 }: { team: Employe[]; max?: number; size?: number }) {
  if (!team.length) return null
  const shown = team.slice(0, max), more = team.length - shown.length
  return <span className="flex items-center" aria-label={`Équipe : ${team.map(empName).join(", ")}`}>
    {shown.map((e, i) => <span key={e.id} style={{ marginLeft: i ? -size * .3 : 0, zIndex: 10 - i }}><EmpAvatar e={e} size={size} ring /></span>)}
    {more > 0 && <span className="flex items-center justify-center rounded-full bg-[#3A3A3D] text-[11px] font-semibold text-white ring-2 ring-[#232326]" style={{ width: size, height: size, marginLeft: -size * .3, zIndex: 11 }}>+{more}</span>}
  </span>
}
export const StatusHead = ({ c, long }: { c: Chantier; long?: boolean }) => { const st = effectiveStatus(c), late = isLateCh(c); return <div className="flex min-w-0 items-center gap-1.5 text-[13px]">
  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: late ? "#FF5F57" : "rgba(255,255,255,.35)" }} /><span className={`font-medium ${late ? "text-[#FF5F57]" : "text-white/55"}`}>{late ? "En retard" : STATUS_LABEL[st]}</span>
  <span className="text-white/30">·</span><span className="truncate text-white/45">{long ? rangeLong(c) : rangeLabel(c)}</span></div> }
export const Bar = ({ pct, c = "#fff" }: { pct: number; c?: string }) => <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-white/[.14]"><motion.div className="h-full rounded-full" style={{ background: c }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 140, damping: 24 }} /></div>
const DashBar = () => <div aria-hidden className="h-[3px] flex-1 rounded-full" style={{ backgroundImage: "linear-gradient(to right, rgba(255,255,255,.28) 50%, transparent 50%)", backgroundSize: "9px 3px" }} />

export const RoundBtn = ({ href, label, children, onClick }: { href?: string; label: string; children: React.ReactNode; onClick?: () => void }) => {
  const cls = "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-[0_4px_14px_rgba(0,0,0,.3)] transition-transform active:scale-90"
  return href ? <a href={href} target="_blank" rel="noopener" aria-label={label} onClick={e => { e.stopPropagation(); onClick?.() }} className={cls}>{children}</a> : <button type="button" aria-label={label} onClick={e => { e.stopPropagation(); onClick?.() }} className={cls}>{children}</button>
}

/** Carte compacte (carrousel et liste ordinateur). */
export function ChCard({ c, team, onOpen, active, handle = true }: { c: Chantier; team: Employe[]; onOpen: () => void; active?: boolean; handle?: boolean }) {
  const st = effectiveStatus(c), pct = progressPct(c), hasPos = c.lat != null && c.lng != null
  return <div role="button" tabIndex={0} aria-label={`${c.title}, ${STATUS_LABEL[st]}. Ouvrir la fiche`} onClick={onOpen} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen() } }}
    className={`relative block w-full cursor-pointer select-none rounded-[22px] bg-[#141416] px-4 pb-4 pt-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/40 ${active ? "ring-1 ring-white/15" : ""}`}>
    {handle ? <div aria-hidden className="mx-auto mb-2 h-[4px] w-9 rounded-full bg-white/20" /> : <div className="h-1" />}
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1"><StatusHead c={c} /><div className="mt-1 truncate text-[19px] font-semibold tracking-[-0.02em] text-white">{c.title}</div></div>
      <RoundBtn href={hasPos || c.address ? itineraryUrl(c) : undefined} label={`Itinéraire vers ${c.title}`}><Navigation size={17} strokeWidth={2.2} className="-ml-px fill-black" /></RoundBtn>
    </div>
    <div className="mt-3.5 flex h-[26px] items-center gap-3">
      {st === "in_progress" ? <><Bar pct={pct} /><span className="w-[46px] shrink-0 text-right text-[14px] font-semibold tabular-nums text-white">{pct} %</span></>
        : st === "upcoming" ? <><DashBar /><span className="shrink-0 text-[13.5px] text-white/70">{untilLabel(c)}</span></>
          : <><Bar pct={100} c="rgba(255,255,255,.5)" /><span className="shrink-0 text-[13.5px] text-white/60">Terminé</span></>}
      {team.length > 0 && <span className="ml-1 shrink-0"><AvatarStack team={team} /></span>}
    </div>
    {!hasPos && <div className="mt-2 flex items-center gap-1 text-[12px] text-white/45"><MapPin size={12} />Adresse à placer sur la carte</div>}
  </div>
}

/** Contenu de la fiche complète. */
export function ChDetail({ c, team, onClose, onEdit, desk }: { c: Chantier; team: Employe[]; onClose: () => void; onEdit: () => void; desk?: boolean }) {
  const st = effectiveStatus(c), pct = progressPct(c), total = durationDays(c), day = dayIndex(c)
  const [notes, setNotes] = useState(c.notes || ""), [saved, setSaved] = useState<"" | "…" | "ok" | string>(""), t = useRef(0)
  useEffect(() => { setNotes(c.notes || "") }, [c.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (v: string) => { if ((c.notes || "") === v) return; setSaved("…"); const e = await patchChantier(c.id, { notes: v || null }); setSaved(e || "ok"); if (!e) setTimeout(() => setSaved(""), 1600) }
  const tel = (p?: string | null) => p ? `tel:${p.replace(/[^\d+]/g, "")}` : undefined
  const btn = "flex h-[62px] flex-1 flex-col items-center justify-center gap-1 rounded-[16px] text-[13.5px] font-semibold transition-transform active:scale-[.97]"
  return <div className="pb-6">
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1"><StatusHead c={c} long /><h2 id="ch-sheet-title" className="mt-1.5 text-[24px] font-semibold leading-tight tracking-[-0.025em]">{c.title}</h2></div>
      <button type="button" aria-label="Fermer la fiche" onClick={onClose} className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[.1] text-white/75 active:scale-90"><X size={17} strokeWidth={2.2} /></button>
    </div>
    <div className="mt-2 space-y-0.5 text-[14.5px] text-white/50">
      {(c.client_nom || c.client_telephone) && <div className="truncate">{[c.client_nom, c.client_telephone].filter(Boolean).join(" · ")}</div>}
      {c.address && <div className="truncate">{c.address}</div>}
    </div>
    <div className="mt-4 flex gap-2.5">
      {c.client_telephone ? <a href={tel(c.client_telephone)} className={`${btn} bg-white/[.09] text-white`}><Phone size={18} strokeWidth={2} />Appeler</a> : <span aria-disabled className={`${btn} bg-white/[.05] text-white/30`}><Phone size={18} strokeWidth={2} />Appeler</span>}
      <a href={itineraryUrl(c)} target="_blank" rel="noopener" className={`${btn} bg-white/[.09] text-white`}><Navigation size={18} strokeWidth={2} className="fill-white" />Itinéraire</a>
      <button type="button" onClick={onEdit} className={`${btn} ${desk ? "flex-[1.2]" : "flex-[1.35]"} bg-white text-black`}><ExternalLink size={18} strokeWidth={2} />Ouvrir le chantier</button>
    </div>
    <div className="mt-4 rounded-[18px] bg-white/[.06] p-4">
      <div className="flex items-center justify-between text-[14.5px]"><span className="text-white/55">Avancement</span><span className="font-semibold tabular-nums">{pct} %</span></div>
      <div className="mt-2.5 flex"><Bar pct={pct} /></div>
      <div className="mt-2.5 flex items-center justify-between text-[12.5px] text-white/45">
        <span>{st === "upcoming" ? `Début ${untilLabel(c).toLowerCase()}` : st === "done" ? "Chantier terminé" : total ? `Jour ${day} sur ${total}` : "Dates à fixer"}</span><span>{isLateCh(c) ? <span className="text-[#FF5F57]">Fin dépassée · {endLabel(c).replace("Fin prévue le ", "")}</span> : endLabel(c)}</span></div>
    </div>
    <div className="mt-6 flex items-baseline justify-between px-0.5"><h3 className="text-[17px] font-semibold tracking-[-0.01em]">Équipe</h3><span className="text-[13px] text-white/45">{team.length} personne{team.length > 1 ? "s" : ""}</span></div>
    <div className="mt-2.5 overflow-hidden rounded-[18px] bg-white/[.06]">
      {team.length ? team.map((e, i) => <div key={e.id} className={`flex items-center gap-3 px-3.5 py-2.5 ${i ? "border-t border-white/[.07]" : ""}`}>
        <EmpAvatar e={e} size={38} />
        <div className="min-w-0 flex-1"><div className="truncate text-[15.5px] font-medium">{empName(e)}</div><div className="truncate text-[13px] text-white/45">{e.role || "Équipe"}</div></div>
        {e.phone ? <a href={tel(e.phone)} aria-label={`Appeler ${empName(e)}`} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[.1] text-white/85 active:scale-90"><Phone size={15} strokeWidth={2} /></a> : null}
      </div>) : <button type="button" onClick={onEdit} className="w-full px-4 py-3.5 text-left text-[14.5px] text-white/50">Aucune personne assignée · <span className="text-[#7EA6FF]">Assigner l'équipe</span></button>}
    </div>
    <div className="mt-6 flex items-baseline justify-between px-0.5"><h3 className="text-[17px] font-semibold tracking-[-0.01em]">Notes</h3><span className="text-[12.5px] text-white/40" aria-live="polite">{saved === "…" ? "Enregistrement…" : saved === "ok" ? "Enregistré" : saved}</span></div>
    <textarea aria-label="Notes du chantier" value={notes} maxLength={5000} placeholder="Code d'accès, matériel, consignes…" onChange={e => { const v = e.target.value; setNotes(v); clearTimeout(t.current); t.current = window.setTimeout(() => void save(v), 900) }} onBlur={() => { clearTimeout(t.current); void save(notes) }}
      style={{ fieldSizing: "content" } as any} rows={3} className="mt-2.5 block min-h-[96px] w-full resize-none rounded-[18px] bg-white/[.06] px-4 py-3 text-[16px] leading-[22px] text-white outline-none caret-[#2F6BFF] placeholder:text-white/30 focus:bg-white/[.08]" />
  </div>
}
