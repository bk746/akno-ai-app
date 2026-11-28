/* Refonte iOS · liste / historique des chantiers (maquette 05-Chantiers/chantiers-historique) :
   segmenté En cours · À venir · Terminés, recherche, regroupement par mois. Toucher une ligne ouvre la fiche sur la carte. */
import { useMemo, useState } from "react"
import { motion } from "motion/react"
import { Search, HardHat } from "lucide-react"
import ModalSheet from "../sheet/ModalSheet"
import { effectiveStatus, type ChStatus } from "../../lib/chantierCalc"
import type { Chantier } from "../../lib/chantiers"
import { hapticTap } from "../../lib/haptics"

const SEG: [ChStatus, string][] = [["in_progress", "En cours"], ["upcoming", "À venir"], ["done", "Terminés"]]
const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]
const fr = (d?: string | null) => d ? new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : ""
const ST_C: Record<ChStatus, string> = { in_progress: "#0071E3", upcoming: "#B25E00", done: "#6E6E73" }
const ST_L: Record<ChStatus, string> = { in_progress: "En cours", upcoming: "À venir", done: "Terminé" }

export default function ChHistory({ rows, onPick, onClose }: { rows: Chantier[]; onPick: (id: string) => void; onClose: () => void }) {
  const [seg, setSeg] = useState<ChStatus>("done"), [q, setQ] = useState("")
  const groups = useMemo(() => {
    const n = q.trim().toLowerCase()
    const xs = rows.filter(c => effectiveStatus(c) === seg && (!n || `${c.title} ${c.client_nom || ""} ${c.address || ""}`.toLowerCase().includes(n)))
      .sort((a, b) => String(b.end_date || b.start_date || "").localeCompare(String(a.end_date || a.start_date || "")))
    const m = new Map<string, Chantier[]>()
    for (const c of xs) { const d = c.end_date || c.start_date || c.created_at?.slice(0, 10) || ""; const k = d ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : "Sans date"; m.set(k, [...(m.get(k) || []), c]) }
    return [...m.entries()]
  }, [rows, seg, q])
  return <ModalSheet label="Chantiers" onClose={onClose} size="large">
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between px-4 pt-2"><span className="w-[60px]" /><span className="text-[17px] font-semibold">Chantiers</span><button type="button" onClick={onClose} className="w-[60px] text-right text-[17px] font-semibold text-[#007AFF]">OK</button></div>
      <div className="px-4">
        <div role="tablist" aria-label="Statut" className="flex h-9 rounded-[10px] bg-[rgba(118,118,128,.12)] p-[2px]">
          {SEG.map(([k, l]) => <button key={k} role="tab" type="button" aria-selected={seg === k} onClick={() => { void hapticTap("select"); setSeg(k) }} className={`relative flex-1 rounded-[8px] text-[14px] ${seg === k ? "font-semibold" : "font-medium text-[#3C3C43]"}`}>
            {seg === k && <motion.span layoutId="ch-seg" className="absolute inset-0 rounded-[8px] bg-[#fff] shadow-[0_1px_4px_rgba(0,0,0,.12)]" transition={{ type: "spring", stiffness: 520, damping: 40 }} />}<span className="relative">{l}</span></button>)}
        </div>
        <label className="mt-3 flex h-10 items-center gap-2 rounded-[10px] bg-[rgba(118,118,128,.12)] px-3 text-[#6E6E73]"><Search size={17} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un chantier ou un client" className="min-w-0 flex-1 bg-transparent text-[17px] text-[#000] outline-none" /></label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-2">
        {groups.length ? groups.map(([k, xs]) => <section key={k} className="mt-3"><h3 className="px-1 pb-1 text-[15px] font-semibold text-[#6E6E73]">{k}</h3>
          <div className="overflow-hidden rounded-[14px] bg-[#fff]">{xs.map((c, i) => { const st = effectiveStatus(c); return <button key={c.id} type="button" onClick={() => { void hapticTap(); onPick(c.id) }} className="flex w-full items-center gap-3 pl-3 text-left active:bg-[#000]/[.04]">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-[#F2F2F7] text-[#6E6E73]"><HardHat size={18} /></span>
            <span className={`flex min-h-[60px] min-w-0 flex-1 items-center gap-2 py-2 pr-3 ${i ? "border-t border-[rgba(60,60,67,.16)]" : ""}`}>
              <span className="min-w-0 flex-1"><span className="block truncate text-[16px] font-semibold">{c.title}</span><span className="block truncate text-[13px] text-[#6E6E73]">{[c.client_nom, [fr(c.start_date), fr(c.end_date)].filter(Boolean).join(" – ")].filter(Boolean).join(" · ")}</span></span>
              <span className="shrink-0 text-[12px] font-medium" style={{ color: ST_C[st] }}>● {ST_L[st]}</span>
            </span></button> })}</div></section>)
          : <div className="mt-10 text-center text-[15px] text-[#6E6E73]">Aucun chantier {SEG.find(x => x[0] === seg)![1].toLowerCase()}.</div>}
      </div>
    </div>
  </ModalSheet>
}
