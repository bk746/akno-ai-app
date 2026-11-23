/* update78 · Vue équipe côte à côte : qui est libre, assignation par glisser-déposer, conflits et temps de trajet. */
import { useEffect, useMemo, useState } from "react"
import type { Ev } from "../../lib/store"
import { attachTravel, expandForGrid, findConflicts, kindColor, kindLabel } from "../../lib/agenda"
import { loadChantiers, useChantiers } from "../../lib/chantiers"

const H0 = 7, H1 = 19
const hh = (n: number) => `${String(Math.floor(n)).padStart(2, "0")}:${String(Math.round((n % 1) * 60)).padStart(2, "0")}`

export default function TeamView({ date, evs, onEv, onAssign, onSlot }: {
  date: string
  evs: Ev[]
  onEv: (e: Ev) => void
  onAssign: (ev: Ev, employeId: string | null) => void
  onSlot?: (employeId: string | null, start: number) => void
}) {
  const { employes } = useChantiers()
  useEffect(() => { void loadChantiers() }, [])
  const team = employes.filter(e => e.access_role || true)
  const cols = [{ id: null as string | null, name: "Non assigné" }, ...team.map(e => ({ id: e.id as string | null, name: e.first_name + (e.last_name ? ` ${e.last_name[0]}.` : "") }))]
  const day = useMemo(() => attachTravel(expandForGrid(evs.filter(e => e.date === date))), [evs, date])
  const absences = evs.filter(e => e.date === date && e.kind === "absence")
  const conflicts = useMemo(() => findConflicts(evs.filter(e => e.date === date)), [evs, date])
  const conflictIds = new Set(conflicts.flatMap(c => [c.a, c.b]))
  const [drag, setDrag] = useState<Ev | null>(null)
  const hours = Array.from({ length: H1 - H0 }, (_, i) => H0 + i)
  const HH = 44

  return <div className="overflow-hidden rounded-[16px] border border-white/[.05] bg-black/40" data-team-view>
    <div className="overflow-x-auto">
      <div style={{ minWidth: Math.max(520, cols.length * 140) }}>
        <div className="flex border-b border-white/[.06]">
          <div className="w-12 shrink-0" />
          {cols.map(c => <div key={c.id || "na"} className="flex min-w-0 flex-1 flex-col items-center py-2.5">
            <span className="truncate px-1 text-[13px] font-medium text-white/85">{c.name}</span>
            {absences.some(a => a.employeId === c.id) && <span className="mt-0.5 text-[10px] uppercase tracking-wide text-white/40">Absent</span>}
          </div>)}
        </div>
        <div className="relative flex" style={{ height: (H1 - H0) * HH }} onDragOver={e => e.preventDefault()}>
          <div className="w-12 shrink-0">{hours.map(h => <div key={h} className="relative" style={{ height: HH }}><span className="absolute -top-[6px] right-1.5 text-[10px] tabular-nums text-white/35">{h > H0 ? `${h}h` : ""}</span></div>)}</div>
          {cols.map(c => {
            const list = day.filter(e => (e.employeId || null) === c.id)
            const off = absences.some(a => a.employeId === c.id)
            return <div key={c.id || "na"} className={`relative flex-1 border-l border-white/[.06] ${off ? "bg-white/[.03]" : ""} ${drag ? "outline outline-1 outline-white/10" : ""}`}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); if (drag) onAssign(drag, c.id); setDrag(null) }}
              onClick={e => { if (!onSlot) return; const r = e.currentTarget.getBoundingClientRect(); onSlot(c.id, Math.floor(H0 + (e.clientY - r.top) / HH * 2) / 2) }}>
              {hours.map(h => <div key={h} className="border-t border-white/[.05] first:border-t-0" style={{ height: HH }} />)}
              {list.map(e => {
                const col = kindColor(e.kind)
                const bad = conflictIds.has(e.id)
                return <button key={e.id} draggable onDragStart={() => setDrag(e)} onDragEnd={() => setDrag(null)}
                  onClick={x => { x.stopPropagation(); onEv(e) }}
                  aria-label={`${e.name} · ${kindLabel(e.kind, e.absenceKind)} · ${hh(e.start)}`}
                  className="absolute left-0.5 right-0.5 overflow-hidden rounded-[8px] px-1.5 py-1 text-left"
                  style={{ top: (e.start - H0) * HH + 1, height: Math.max(20, e.dur * HH - 3), background: `${col}14`, boxShadow: `inset 2px 0 0 ${bad ? "#FF5F57" : col}` }}>
                  <div className="truncate text-[11px] font-semibold leading-tight" style={{ color: col }}>{e.name}</div>
                  {e.dur * HH > 28 && <div className="truncate text-[10px] text-white/55">{kindLabel(e.kind, e.absenceKind)}{e.travelMin ? ` · ${e.travelMin} min` : ""}</div>}
                </button>
              })}
            </div>
          })}
        </div>
      </div>
    </div>
    {conflicts.length > 0 && <p className="px-3 py-2 text-[12px] text-[#FF453A]">{conflicts.length} conflit{conflicts.length > 1 ? "s" : ""} : même personne au même moment, ou intervention pendant une absence.</p>}
  </div>
}
