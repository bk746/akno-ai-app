/* Refonte iOS · passe 2 · liste / historique des chantiers (maquette 05-Chantiers/chantiers-historique) :
   page noire poussée (titre, + nouveau, retour carte), segmenté En cours · À venir · Terminés, feuille blanche,
   recherche, regroupement par mois, vignette photo, montant du devis et statut. Toucher une ligne ouvre la fiche. */
import { useEffect, useMemo, useState } from "react"
import { Search, HardHat, Plus, Map as MapI } from "lucide-react"
import { IosPage, Segmented } from "../nav/IosPage"
import { PushLayer } from "../m/MPage"
import { eurM } from "../m/DocRow"
import { effectiveStatus, type ChStatus } from "../../lib/chantierCalc"
import { listChantierPhotos, photoUrl, usePhotoTick, type Chantier } from "../../lib/chantiers"
import { hapticTap } from "../../lib/haptics"

const SEG: [ChStatus, string][] = [["in_progress", "En cours"], ["upcoming", "À venir"], ["done", "Terminés"]]
const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]
const dn = (d?: string | null) => d ? new Date(d + "T12:00:00") : null
const range = (c: Chantier) => { const a = dn(c.start_date), b = dn(c.end_date); if (!a) return ""; const m = (x: Date) => x.toLocaleDateString("fr-FR", { month: "short" }); if (!b || +a === +b) return `${a.getDate()} ${m(a)}`; return a.getMonth() === b.getMonth() ? `${a.getDate()} – ${b.getDate()} ${m(b)}` : `${a.getDate()} ${m(a)} – ${b.getDate()} ${m(b)}` }
const ST_C: Record<ChStatus, string> = { in_progress: "#1E9E4A", upcoming: "#B25E00", done: "#C7C7CC" }
const ST_L: Record<ChStatus, string> = { in_progress: "En cours", upcoming: "À venir", done: "Terminé" }
const first = new Map<string, string | null>()

function Thumb({ id }: { id: string }) {
  usePhotoTick()
  const [p, setP] = useState<string | null | undefined>(first.get(id))
  useEffect(() => { if (first.has(id)) return; let on = true; void listChantierPhotos(id).then(x => { const v = x[x.length - 1]?.path || null; first.set(id, v); if (on) setP(v) }); return () => { on = false } }, [id])
  const u = p ? photoUrl(p) : null
  return <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-[#F2F2F7] text-[#8E8E93]">{u ? <img src={u} alt="" className="h-full w-full object-cover" draggable={false} /> : <HardHat size={22} strokeWidth={1.6} />}</span>
}

export default function ChHistory({ rows, onPick, onClose, onNew, amount }: { rows: Chantier[]; onPick: (id: string) => void; onClose: () => void; onNew?: () => void; amount?: (c: Chantier) => number | null }) {
  const [seg, setSeg] = useState<ChStatus>("done"), [q, setQ] = useState("")
  const groups = useMemo(() => {
    const n = q.trim().toLowerCase()
    const xs = rows.filter(c => effectiveStatus(c) === seg && (!n || `${c.title} ${c.client_nom || ""} ${c.address || ""}`.toLowerCase().includes(n)))
      .sort((a, b) => seg === "upcoming" ? String(a.start_date || "9").localeCompare(String(b.start_date || "9")) : String(b.end_date || b.start_date || "").localeCompare(String(a.end_date || a.start_date || "")))
    const m = new Map<string, Chantier[]>()
    for (const c of xs) { const d = (seg === "upcoming" ? c.start_date : c.end_date || c.start_date) || c.created_at?.slice(0, 10) || ""; const k = d ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : "Sans date"; m.set(k, [...(m.get(k) || []), c]) }
    return [...m.entries()]
  }, [rows, seg, q])
  return <PushLayer label="Chantiers" onClose={onClose}>
    <IosPage title="Chantiers" flush spacer={14}
      caps={[...(onNew ? [{ I: Plus, label: "Nouveau chantier", on: onNew }] : []), { I: MapI, label: "Retour à la carte", on: onClose }]}
      mid={<Segmented label="Statut des chantiers" layoutId="ch-hist-seg" value={seg} onPick={v => { void hapticTap("select"); setSeg(v) }} items={SEG} />}>
      <div className="akno-light px-5 pb-6 pt-4">
        <label className="flex h-11 items-center gap-2 rounded-[22px] bg-[#F2F2F7] px-3.5 text-[#8E8E93]"><Search size={18} strokeWidth={1.8} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un chantier ou un client" aria-label="Rechercher un chantier ou un client" className="min-w-0 flex-1 bg-transparent text-[17px] text-[#000] outline-none placeholder:text-[#8E8E93]" /></label>
        {groups.length ? groups.map(([k, xs]) => <section key={k}><h3 className="pb-1 pt-5 text-[15px] font-semibold text-[#6E6E73]">{k}</h3>
          {xs.map((c, i) => { const st = effectiveStatus(c), am = amount?.(c); return <button key={c.id} type="button" onClick={() => { void hapticTap(); onPick(c.id) }} className="flex w-full items-center gap-3 text-left active:opacity-70">
            <Thumb id={c.id} />
            <span className={`relative flex min-h-[74px] min-w-0 flex-1 items-center gap-2 py-2 ${i ? "before:absolute before:left-0 before:right-0 before:top-0 before:h-[.5px] before:bg-[rgba(60,60,67,.16)]" : ""}`}>
              <span className="min-w-0 flex-1"><span className="block truncate text-[17px] leading-[22px] text-[#000]">{c.title}</span><span className="block truncate text-[14px] leading-[19px] text-[#6E6E73]">{[c.client_nom, range(c)].filter(Boolean).join(" · ")}</span></span>
              <span className="flex shrink-0 flex-col items-end gap-1">{am ? <b className="text-[17px] font-semibold tabular-nums text-[#000]">{eurM(am)}</b> : null}<span className="flex items-center gap-1 text-[12px] font-semibold" style={{ color: st === "done" ? "#6E6E73" : ST_C[st] }}><span className="h-[6px] w-[6px] rounded-full" style={{ background: ST_C[st] }} />{ST_L[st]}</span></span>
            </span></button> })}</section>)
          : <div className="mt-10 text-center text-[15px] text-[#6E6E73]">Aucun chantier {SEG.find(x => x[0] === seg)![1].toLowerCase()}.</div>}
      </div>
    </IosPage>
  </PushLayer>
}
