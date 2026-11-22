/* update78 · Lien de réservation public, export ICS, occupation, export paie CSV. */
import { useEffect, useState } from "react"
import { api } from "../../lib/accountApi"
import { downloadIcs, occupationRate, payrollCsv, payrollRows, type AgendaEv } from "../../lib/agenda"
import { useChantiers } from "../../lib/chantiers"

export default function AgendaTools({ evs, day }: { evs: AgendaEv[]; day: string }) {
  const { employes } = useChantiers()
  const [link, setLink] = useState(""), [bookingOn, setBookingOn] = useState(true), [sms, setSms] = useState(true), [copied, setCopied] = useState(false), [err, setErr] = useState("")
  useEffect(() => { void api("/api/account", { action: "booking_link" }).then(r => {
    if (r.ok && typeof r.url === "string") { setLink(r.url); setBookingOn(r.booking_on !== false); setSms(r.agenda_sms !== false) }
    else if (r.status === 409) setErr(r.error || "Migration update78 requise pour le lien public.")
  }) }, [])
  const names = Object.fromEntries(employes.map(e => [e.id, `${e.first_name}${e.last_name ? " " + e.last_name : ""}`]))
  const occ = employes.length ? Math.round(employes.reduce((s, e) => s + occupationRate(evs, e.id, day), 0) / employes.length * 100) : Math.round(occupationRate(evs, undefined, day) * 100)
  const copy = () => { if (!link) return; void navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600) }) }
  const toggle = async (patch: { booking_on?: boolean; agenda_sms?: boolean }) => {
    const r = await api("/api/account", { action: "booking_link", ...patch })
    if (r.ok) { if (patch.booking_on != null) setBookingOn(!!patch.booking_on); if (patch.agenda_sms != null) setSms(!!patch.agenda_sms); if (typeof r.url === "string") setLink(r.url) }
  }
  const csv = () => {
    const from = day.slice(0, 8) + "01"
    const last = new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0).getDate()
    const to = `${day.slice(0, 8)}${String(last).padStart(2, "0")}`
    const blob = new Blob([payrollCsv(payrollRows(evs, names, from, to))], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `paie-akno-${from}.csv`; a.click()
  }
  return <div className="mt-4 space-y-3 rounded-[20px] bg-[#141416] p-4" data-agenda-tools>
    <div className="flex items-center justify-between gap-3">
      <div><div className="text-[15px] font-medium">Occupation du jour</div><div className="text-[12.5px] text-white/45">{occupLabel(occ)} · prévue contre réelle dans l'export paie</div></div>
      <div className="whitespace-nowrap text-[22px] font-semibold tabular-nums">{occ}%</div>
    </div>
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => downloadIcs(evs.filter(e => !e.virtual), "akno-agenda.ics")} className="h-10 rounded-full bg-white/[.08] px-3.5 text-[13.5px] font-medium">Exporter ICS</button>
      <button type="button" onClick={csv} className="h-10 rounded-full bg-white/[.08] px-3.5 text-[13.5px] font-medium">Export paie CSV</button>
    </div>
    <div>
      <div className="text-[15px] font-medium">Lien de réservation</div>
      {err ? <p className="mt-1 text-[12.5px] text-white/45">{err}</p> : <>
        <p className="mt-1 break-all text-[12.5px] text-white/55">{link || "Chargement…"}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" disabled={!link} onClick={copy} className="h-10 rounded-full bg-white px-3.5 text-[13.5px] font-semibold text-black disabled:opacity-40">{copied ? "Copié" : "Copier le lien"}</button>
          <button type="button" onClick={() => void toggle({ booking_on: !bookingOn })} className="h-10 rounded-full bg-white/[.08] px-3.5 text-[13.5px] font-medium">{bookingOn ? "Désactiver le lien" : "Activer le lien"}</button>
          <button type="button" onClick={() => void toggle({ agenda_sms: !sms })} className="h-10 rounded-full bg-white/[.08] px-3.5 text-[13.5px] font-medium">{sms ? "SMS agenda on" : "SMS agenda off"}</button>
        </div>
      </>}
    </div>
  </div>
}

function occupLabel(n: number) {
  if (n >= 90) return "Journée très chargée"
  if (n >= 60) return "Journée bien remplie"
  if (n >= 30) return "Journée calme"
  return "Beaucoup de créneaux libres"
}
