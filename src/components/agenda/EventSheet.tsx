/* update78 · Fiche événement : liens client / adresse / devis / facture, assignation, conflits,
   vue terrain (Waze, Maps, pointage, photos, notes, signature), SMS « on arrive ». */
import { useRef, useState, type PointerEvent } from "react"
import { Check, MapPin, Navigation, Phone, Signature } from "lucide-react"
import type { Ev } from "../../lib/store"
import { actualHours, findConflicts, kindColor, kindLabel, mapsUrl, plannedHours, wazeUrl, EV_KIND, ABSENCE_KIND } from "../../lib/agenda"
import { api } from "../../lib/accountApi"
import { useChantiers } from "../../lib/chantiers"
import { supabase } from "../../lib/supabase"
import { useAppRole } from "../../lib/role"
import { Btn, F, inp, Sheet } from "../ui"

const hh = (n: number) => `${String(Math.floor(n)).padStart(2, "0")}:${String(Math.round((n % 1) * 60)).padStart(2, "0")}`
const A_AG = "#0A84FF"

export default function EventSheet({ e, all, onChange, onClose, onOpenClient, onOpenDevis, onOpenFacture, onOpenChantier }: {
  e: Ev
  all: Ev[]
  onChange: (p: Partial<Ev>) => void
  onClose: () => void
  onOpenClient?: () => void
  onOpenDevis?: () => void
  onOpenFacture?: () => void
  onOpenChantier?: () => void
}) {
  const role = useAppRole()
  const employee = role?.kind === "employe"
  const { employes } = useChantiers()
  const conflicts = findConflicts(all).filter(c => c.a === e.id || c.b === e.id)
  const color = kindColor(e.kind)
  const [note, setNote] = useState(e.notesTerrain || "")
  const [busy, setBusy] = useState("")
  const [signOn, setSignOn] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  const patch = (p: Partial<Ev>) => onChange(p)
  const punch = async (kind: "arrive" | "depart" | "en_route") => {
    setBusy(kind)
    if (kind === "en_route") {
      const r = await api("/api/account", { action: "agenda_on_arrive", appointment_id: e.id })
      patch({ status: "en_route", ...(r.ok ? {} : {}) })
      setBusy("")
      return
    }
    const iso = new Date().toISOString()
    if (kind === "arrive") patch({ status: "arrive", arrivedAt: iso })
    else patch({ status: "termine", departedAt: iso })
    setBusy("")
  }
  const photo = async (file: File) => {
    setBusy("photo")
    const { data: { user } } = await supabase.auth.getUser()
    const root = role?.kind === "employe" ? role.artisanId : (user?.id || "agenda")
    const path = `${root}/${e.id}/${Date.now()}.jpg`
    const { error } = await supabase.storage.from("agenda").upload(path, file, { contentType: file.type || "image/jpeg", upsert: false })
    setBusy("")
    if (error) return
    patch({ photos: [...(e.photos || []), path] })
  }
  const saveNote = () => { patch({ notesTerrain: note }); setBusy("") }
  const startDraw = (ev: PointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current; if (!c) return
    drawing.current = true
    const ctx = c.getContext("2d")!
    const r = c.getBoundingClientRect()
    ctx.strokeStyle = "#141416"; ctx.lineWidth = 2.2; ctx.lineCap = "round"
    ctx.beginPath()
    ctx.moveTo((ev.clientX - r.left) * (c.width / r.width), (ev.clientY - r.top) * (c.height / r.height))
  }
  const moveDraw = (ev: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !canvas.current) return
    const c = canvas.current, ctx = c.getContext("2d")!, r = c.getBoundingClientRect()
    ctx.lineTo((ev.clientX - r.left) * (c.width / r.width), (ev.clientY - r.top) * (c.height / r.height))
    ctx.stroke()
  }
  const saveSign = () => {
    const c = canvas.current; if (!c) return
    patch({ signature: c.toDataURL("image/png"), status: e.status === "termine" ? e.status : "termine", departedAt: e.departedAt || new Date().toISOString() })
    setSignOn(false)
  }

  const addr = e.addr || ""
  return <Sheet title={e.name} sub={`${kindLabel(e.kind, e.absenceKind)} · ${hh(e.start)} · ${e.dur} h`} c={color || A_AG} onClose={onClose}>
    <div className="space-y-4" data-event-sheet>
      <div className="flex flex-wrap gap-1.5">{EV_KIND.map(k => <button key={k.id} type="button" disabled={employee} onClick={() => patch({ kind: k.id })}
        className={`h-8 rounded-full px-3 text-[12.5px] font-medium ${e.kind === k.id || (!e.kind && k.id === "rdv") ? "text-black" : "bg-white/[.08] text-white/80"}`}
        style={e.kind === k.id || (!e.kind && k.id === "rdv") ? { background: k.color } : {}}>{k.label}</button>)}</div>
      {e.kind === "absence" && <div className="flex flex-wrap gap-1.5">{ABSENCE_KIND.map(k => <button key={k.id} type="button" disabled={employee} onClick={() => patch({ absenceKind: k.id })}
        className={`h-8 rounded-full px-3 text-[12.5px] font-medium ${e.absenceKind === k.id ? "bg-white text-black" : "bg-white/[.08]"}`}>{k.label}</button>)}</div>}

      {conflicts.length > 0 && <p className="rounded-[14px] bg-[#FF453A]/15 px-3 py-2 text-[13px] text-[#FF8A80]">Conflit d'agenda : même personne déjà prise, ou intervention pendant une absence.</p>}

      <div className="grid grid-cols-2 gap-2">
        {onOpenClient && <Btn onClick={onOpenClient}>Fiche client</Btn>}
        {addr && <a href={mapsUrl(addr)} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center gap-1.5 rounded-full bg-white/[.08] text-[14.5px] font-medium"><MapPin size={15} />Maps</a>}
        {addr && <a href={wazeUrl(addr, e.lat, e.lng)} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center gap-1.5 rounded-full bg-white/[.08] text-[14.5px] font-medium"><Navigation size={15} />Waze</a>}
        {e.phone && <a href={`tel:${e.phone}`} className="flex h-11 items-center justify-center gap-1.5 rounded-full bg-white/[.08] text-[14.5px] font-medium"><Phone size={15} />Appeler</a>}
        {e.devisId && onOpenDevis && <Btn onClick={onOpenDevis}>Voir le devis</Btn>}
        {e.factureId && onOpenFacture && <Btn onClick={onOpenFacture}>Voir la facture</Btn>}
        {e.chantierId && onOpenChantier && <Btn onClick={onOpenChantier}>Voir le chantier</Btn>}
      </div>

      {!employee && <F l="Assigné à"><select className={inp} value={e.employeId || ""} onChange={ev => patch({ employeId: ev.target.value || undefined })}>
        <option value="">Non assigné</option>
        {employes.map(x => <option key={x.id} value={x.id}>{x.first_name}{x.last_name ? ` ${x.last_name}` : ""}</option>)}
      </select></F>}

      {e.rrule && <p className="text-[13px] text-white/50">Événement récurrent.</p>}
      {typeof e.travelMin === "number" && e.travelMin > 0 && <p className="text-[13px] text-white/55">Trajet estimé depuis l'intervention précédente : {e.travelMin} min (approx. 35 km/h).</p>}
      <p className="text-[13px] text-white/45">Heures prévues {plannedHours(e).toFixed(1)} h{actualHours(e) != null ? ` · réelles ${actualHours(e)!.toFixed(1)} h` : ""}</p>

      <div className="rounded-[16px] bg-white/[.06] p-3" data-field-view>
        <div className="mb-2 text-[13px] font-medium text-white/60">Sur le terrain</div>
        <div className="grid grid-cols-2 gap-2">
          <Btn primary={e.status !== "en_route" && e.status !== "arrive" && e.status !== "termine"} disabled={!!busy || e.status === "termine"} onClick={() => void punch("en_route")}>{busy === "en_route" ? "Envoi…" : "On arrive"}</Btn>
          <Btn primary={e.status === "en_route"} disabled={!!busy || e.status === "termine"} onClick={() => void punch("arrive")}>{e.arrivedAt ? "Arrivé" : "Pointer l'arrivée"}</Btn>
          <Btn className="col-span-2" primary={e.status === "arrive"} disabled={!!busy || !e.arrivedAt} onClick={() => void punch("depart")}>{e.departedAt ? "Parti" : "Pointer le départ"}</Btn>
        </div>
        <F l="Notes de terrain"><textarea className={inp + " min-h-[88px]"} value={note} onChange={ev => setNote(ev.target.value)} onBlur={saveNote} placeholder="Observations, matériel, suite à donner…" /></F>
        <label className="mt-2 flex h-11 items-center justify-center rounded-full bg-white/[.08] text-[14.5px] font-medium">
          {busy === "photo" ? "Envoi…" : "Ajouter une photo"}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={ev => { const f = ev.target.files?.[0]; if (f) void photo(f); ev.target.value = "" }} />
        </label>
        {(e.photos || []).length > 0 && <p className="mt-1 text-[12.5px] text-white/45">{e.photos!.length} photo{e.photos!.length > 1 ? "s" : ""} jointe{e.photos!.length > 1 ? "s" : ""}</p>}
        <button type="button" onClick={() => setSignOn(true)} className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-white/[.08] text-[14.5px] font-medium"><Signature size={16} />{e.signature ? "Signature enregistrée" : "Signature de fin"}</button>
      </div>

      {signOn && <div className="fixed inset-0 z-[80] flex items-end bg-black/55 p-3" data-sign-sheet>
        <div className="w-full rounded-[20px] bg-[#1C1C1E] p-4">
          <div className="mb-2 text-[15px] font-medium">Signature du client</div>
          <canvas ref={canvas} width={600} height={240} className="h-[160px] w-full touch-none rounded-[14px] bg-white"
            onPointerDown={startDraw} onPointerMove={moveDraw} onPointerUp={() => { drawing.current = false }} onPointerLeave={() => { drawing.current = false }} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Btn onClick={() => { const c = canvas.current?.getContext("2d"); if (c && canvas.current) c.clearRect(0, 0, canvas.current.width, canvas.current.height) }}>Effacer</Btn>
            <Btn primary onClick={saveSign}><Check size={15} />Enregistrer</Btn>
          </div>
          <button type="button" className="mt-2 h-11 w-full text-[14px] text-white/55" onClick={() => setSignOn(false)}>Annuler</button>
        </div>
      </div>}
    </div>
  </Sheet>
}
