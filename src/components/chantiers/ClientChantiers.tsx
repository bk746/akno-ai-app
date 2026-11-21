/* update65 · Fiche client : chantiers de ce client et l'équipe assignée (photos), lien vers la carte. */
import { useEffect } from "react"
import { ChevronRight } from "lucide-react"
import { loadChantiers, teamOf, useChantiers, type Chantier } from "../../lib/chantiers"
import { STATUS_COLOR, STATUS_LABEL, effectiveStatus, rangeLabel } from "../../lib/chantierCalc"
import { AvatarStack } from "./parts"

// même clé que les fiches clients (ClientFiche.ficheKey)
const cle = (n: string) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/^(m\.|mme|mr|monsieur|madame)\s+/, "").replace(/\s+/g, " ").trim()
export const chantiersOfClient = (rows: Chantier[], name: string) => { const k = cle(name); return k ? rows.filter(c => c.client_id === k || (c.client_nom && cle(c.client_nom) === k)) : [] }

export default function ClientChantiers({ name, onOpen }: { name: string; onOpen: (id: string) => void }) {
  const st = useChantiers()
  useEffect(() => { if (!st.ready) void loadChantiers() }, [st.ready])
  const list = chantiersOfClient(st.rows, name).sort((a, b) => (b.start_date || "").localeCompare(a.start_date || ""))
  if (st.missing || !list.length) return null
  return <><div className="mb-2 mt-6 px-1 text-[13px] font-medium text-white/45">Chantiers et équipe</div>
    <div className="overflow-hidden rounded-[20px] bg-white/[.04]">{list.map((c, i) => { const s = effectiveStatus(c), team = teamOf(c.id, st); return <button key={c.id} type="button" onClick={() => onOpen(c.id)} className={`flex w-full items-center gap-3 px-4 py-3 text-left active:bg-white/[.04] ${i ? "border-t border-white/[.06]" : ""}`}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_COLOR[s] }} />
      <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-medium">{c.title}</span><span className="block truncate text-[13px] text-white/45">{STATUS_LABEL[s]} · {rangeLabel(c)}{team.length ? ` · ${team.length} personne${team.length > 1 ? "s" : ""}` : " · équipe à assigner"}</span></span>
      {team.length > 0 && <AvatarStack team={team} size={26} />}
      <ChevronRight size={16} className="shrink-0 text-white/25" />
    </button> })}</div></>
}
