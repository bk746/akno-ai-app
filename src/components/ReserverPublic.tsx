/* update78 · Lien de réservation public /reserver/:token — créneaux libres de l'agenda Akno. */
import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"

type Slot = { start: string; end?: string; label: string; date: string; heure: string }

export default function ReserverPublic() {
  const { token = "" } = useParams()
  const [company, setCompany] = useState(""), [slots, setSlots] = useState<Slot[]>([]), [err, setErr] = useState(""), [ok, setOk] = useState("")
  const [form, setForm] = useState({ client: "", telephone: "", email: "", adresse: "", objet: "Rendez-vous" })
  const [pick, setPick] = useState<Slot | null>(null), [busy, setBusy] = useState(false)

  useEffect(() => {
    document.title = "Réserver un créneau"
    const from = new Date().toISOString().slice(0, 10)
    const toD = new Date(); toD.setDate(toD.getDate() + 14)
    fetch("/api/booking", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "public_slots", token, date_from: from, date_to: toD.toISOString().slice(0, 10), duree_minutes: 60 }) })
      .then(async x => { const j = await x.json().catch(() => ({})); if (!x.ok) setErr(j.error || "Créneaux indisponibles."); else { setCompany(j.company || ""); setSlots(j.slots || []) } })
      .catch(() => setErr("Connexion impossible. Réessayez."))
  }, [token])

  const book = async () => {
    if (!pick || !form.client.trim()) return
    setBusy(true); setErr("")
    const x = await fetch("/api/booking", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "public_book", token, client: form.client, telephone: form.telephone, email: form.email, adresse: form.adresse, objet: form.objet, date: pick.date, heure: pick.heure, duree_minutes: 60 }) }).catch(() => null)
    const j = x ? await x.json().catch(() => ({})) : {}
    setBusy(false)
    if (x?.ok && j.ok) { setOk(j.confirmation || "Rendez-vous confirmé."); setPick(null); setSlots(s => s.filter(s => s.start !== pick.start)) }
    else setErr(j.error || "Ce créneau n'est plus disponible.")
  }

  return <div className="min-h-[100dvh] bg-[#F6F6F8] text-[#141416] antialiased" data-reserver>
    <div className="mx-auto max-w-[560px] px-5 pb-[max(48px,env(safe-area-inset-bottom))] pt-[max(40px,env(safe-area-inset-top))]">
      {ok ? <><h1 className="text-[26px] font-semibold tracking-[-0.02em]">C'est réservé</h1><p className="mt-2 text-[16px] text-[#3D3D42]">{ok}</p></> : <>
        <div className="text-[13px] font-medium uppercase tracking-[.08em] text-[#2F6BFF]">Réservation en ligne</div>
        <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.02em]">{company || "Prendre rendez-vous"}</h1>
        {err && <p className="mt-3 text-[15px] text-[#C5221F]">{err}</p>}
        {!err && !slots.length && !company ? <p className="mt-4 text-[16px] text-[#8A8A90]">Chargement des créneaux…</p> : null}
        <div className="mt-5 space-y-2" data-slots>
          {slots.map(s => <button key={s.start} type="button" onClick={() => setPick(s)} className={`flex h-12 w-full items-center justify-between rounded-[16px] px-4 text-left text-[15px] font-medium ${pick?.start === s.start ? "bg-[#2F6BFF] text-white" : "bg-white shadow-sm"}`}>{s.label}</button>)}
          {!slots.length && company && !err && <p className="text-[15px] text-[#6E6E76]">Aucun créneau libre sur les deux prochaines semaines.</p>}
        </div>
        {pick && <form className="mt-5 space-y-3" onSubmit={e => { e.preventDefault(); void book() }} data-book-form>
          <input required placeholder="Votre nom" className="h-12 w-full rounded-[14px] bg-white px-4 text-[16px]" value={form.client} onChange={e => setForm({ ...form, client: e.target.value })} />
          <input placeholder="Téléphone" type="tel" className="h-12 w-full rounded-[14px] bg-white px-4 text-[16px]" value={form.telephone} onChange={e => setForm({ ...form, telephone: e.target.value })} />
          <input placeholder="E-mail" type="email" className="h-12 w-full rounded-[14px] bg-white px-4 text-[16px]" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <input placeholder="Adresse de l'intervention" className="h-12 w-full rounded-[14px] bg-white px-4 text-[16px]" value={form.adresse} onChange={e => setForm({ ...form, adresse: e.target.value })} />
          <button type="submit" disabled={busy || !form.client.trim()} className="h-14 w-full rounded-full bg-[#2F6BFF] text-[17px] font-semibold text-white disabled:opacity-60">{busy ? "Réservation…" : "Confirmer le rendez-vous"}</button>
        </form>}
      </>}
      <p className="mt-8 text-[12.5px] text-[#8A8A90]">Réservation transmise via Akno.</p>
    </div>
  </div>
}
