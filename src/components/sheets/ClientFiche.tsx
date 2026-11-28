/* update61 · Fiche client complète : coordonnées modifiables, SIREN (client pro), notes privées (table client_fiches)
   et factures du client (table factures). Les appels, enregistrements, devis et RDV restent affichés par la fiche existante. */
import { useEffect, useState } from "react"
import { NotebookPen, Pencil, Receipt } from "lucide-react"
import { Btn, Chip, F, GREEN, AMBER, GREY, RED, inp, tx } from "../ui"
import { supabase } from "../../lib/supabase"
import { e2 } from "../../lib/devisDoc"

export type Fiche = { nom: string; telephone: string; email: string; adresse: string; siren: string; notes: string }
type FRow = { id: string; numero: string | null; type: string; statut: string; total_ttc: number; acompte_deduit: number; date_emission: string | null; date_echeance: string | null; situation_numero?: number | null }
export const ficheKey = (n: string) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/^(m\.|mme|mr|monsieur|madame)\s+/, "").replace(/\s+/g, " ").trim()
const ST: Record<string, [string, string]> = { brouillon: ["Brouillon", GREY], emise: ["Émise", AMBER], envoyee: ["Envoyée", AMBER], payee: ["Payée", GREEN], annulee: ["Annulée", GREY] }
const TL: Record<string, string> = { facture: "Facture", acompte: "Acompte", situation: "Situation", solde: "Solde", avoir: "Avoir" }
const MIG = "Notes et coordonnées : appliquez la migration 20261121_10 (voir LISEZMOI)."

/** Charge la fiche enregistrée (ou null). */
export function useFiche(name: string) {
  const [f, setF] = useState<Fiche | null>(null), [ok, setOk] = useState(true), [tick, setTick] = useState(0)
  useEffect(() => {
    let on = true
    void supabase.from("client_fiches").select("nom, telephone, email, adresse, siren, notes").eq("cle", ficheKey(name)).maybeSingle().then(({ data, error }) => {
      if (!on) return
      setOk(!error); setF(data ? { nom: data.nom || "", telephone: data.telephone || "", email: data.email || "", adresse: data.adresse || "", siren: data.siren || "", notes: data.notes || "" } : null)
    })
    return () => { on = false }
  }, [name, tick])
  return { fiche: f, available: ok, reload: () => setTick(x => x + 1) }
}

export function FicheEditor({ name, fiche, defaults, available, onSaved, startEdit, onCancel }: { name: string; fiche: Fiche | null; defaults: { phone?: string; email?: string; addr?: string }; available: boolean; onSaved: () => void; startEdit?: boolean; onCancel?: () => void }) {
  const init = (): Fiche => ({ nom: fiche?.nom || name, telephone: fiche?.telephone || defaults.phone || "", email: fiche?.email || defaults.email || "", adresse: fiche?.adresse || defaults.addr || "", siren: fiche?.siren || "", notes: fiche?.notes || "" })
  const [edit, setEdit] = useState(!!startEdit), [d, setD] = useState<Fiche>(init), [busy, setBusy] = useState(false), [err, setErr] = useState("")
  useEffect(() => { if (!edit) setD(init()) }, [fiche, edit]) // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    const siren = d.siren.replace(/\s/g, "")
    if (siren && !/^\d{9}$/.test(siren)) { setErr("Le SIREN comporte 9 chiffres."); return }
    if (d.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) { setErr("E-mail invalide."); return }
    setBusy(true); setErr("")
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from("client_fiches").upsert({ artisan_id: user!.id, cle: ficheKey(name), nom: d.nom.trim() || name, telephone: d.telephone.trim() || null, email: d.email.trim() || null, adresse: d.adresse.trim() || null, siren: siren || null, notes: d.notes.trim().slice(0, 4000) || null, updated_at: new Date().toISOString() }, { onConflict: "artisan_id,cle" })
    setBusy(false)
    if (error) { setErr(available ? "Enregistrement impossible." : MIG); return }
    setEdit(false); onSaved()
  }
  if (!edit) return <div className="mt-3 rounded-[20px] bg-white/[.04] p-4">
    <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-[14px] font-medium"><NotebookPen size={15} className="text-white/60" />Notes</div><button type="button" className="flex items-center gap-1.5 text-[13px] text-white/60" onClick={() => setEdit(true)}><Pencil size={13} />Modifier la fiche</button></div>
    <p className={`mt-1.5 whitespace-pre-line text-[14px] leading-relaxed ${fiche?.notes ? "text-white/75" : "text-white/35"}`}>{fiche?.notes || "Aucune note. Code d'accès, préférences, matériel en place…"}</p>
    {fiche?.siren && <div className={`mt-2 ${tx.cap}`}>Client professionnel · SIREN {fiche.siren}</div>}
    {!available && <div className="mt-2 text-[12px] text-white/40">{MIG}</div>}
  </div>
  return <div className="mt-3 space-y-2.5 rounded-[20px] bg-white/[.04] p-4">
    <F l="Nom"><input className={inp} value={d.nom} onChange={e => setD({ ...d, nom: e.target.value })} /></F>
    <div className="grid grid-cols-2 gap-2"><F l="Téléphone"><input className={inp} type="tel" value={d.telephone} onChange={e => setD({ ...d, telephone: e.target.value })} /></F><F l="E-mail"><input className={inp} type="email" value={d.email} onChange={e => setD({ ...d, email: e.target.value })} /></F></div>
    <F l="Adresse"><input className={inp} value={d.adresse} onChange={e => setD({ ...d, adresse: e.target.value })} /></F>
    <F l="SIREN (client professionnel)"><input className={inp} inputMode="numeric" placeholder="9 chiffres" value={d.siren} onChange={e => setD({ ...d, siren: e.target.value })} /></F>
    <F l="Notes privées"><textarea className={`${inp} h-28 py-3 leading-snug`} placeholder="Code d'accès, préférences, matériel en place…" value={d.notes} onChange={e => setD({ ...d, notes: e.target.value })} /></F>
    {err && <div className="text-[13px] text-[#FF9B96]">{err}</div>}
    <div className="flex gap-2"><Btn className="flex-1" onClick={() => { setEdit(false); setErr(""); onCancel?.() }}>Annuler</Btn><Btn primary className="flex-1" disabled={busy} onClick={() => void save()}>{busy ? "…" : "Enregistrer"}</Btn></div>
  </div>
}

/** Factures et avoirs du client (par nom). */
export function ClientFactures({ name, onOpen }: { name: string; onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<FRow[] | null>(null)
  useEffect(() => {
    let on = true
    void supabase.from("factures").select("id, numero, type, statut, total_ttc, acompte_deduit, date_emission, date_echeance, situation_numero").ilike("client_nom", name.replace(/[%_]/g, "")).order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => { if (on) setRows((data || []) as FRow[]) })
    return () => { on = false }
  }, [name])
  if (!rows?.length) return null
  const today = new Date().toISOString().slice(0, 10)
  const due = rows.filter(r => r.numero && r.type !== "avoir" && (r.statut === "emise" || r.statut === "envoyee")).reduce((a, r) => a + Number(r.total_ttc) - Number(r.acompte_deduit || 0), 0)
  return <>
    <div className="mb-2 mt-6 flex items-center justify-between px-1 text-[13px] font-medium text-white/45"><span>Factures</span>{due > 0 && <span className="text-[#FFB340]">{e2(due)} à encaisser</span>}</div>
    <div className="overflow-hidden rounded-[20px] bg-white/[.04]">{rows.map((r, i) => {
      const late = r.type !== "avoir" && (r.statut === "emise" || r.statut === "envoyee") && !!r.date_echeance && r.date_echeance < today
      const [l, c] = late ? ["En retard", RED] : ST[r.statut] || ST.brouillon
      return <button key={r.id} type="button" onClick={() => onOpen(r.id)} className={`flex w-full items-center gap-3 px-4 py-3 text-left ${i ? "border-t border-white/[.06]" : ""}`}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[.06] text-white/70"><Receipt size={15} /></span>
        <span className="min-w-0 flex-1"><span className="block truncate text-[14.5px]">{TL[r.type] || "Facture"}{r.type === "situation" && r.situation_numero ? ` n° ${r.situation_numero}` : ""} {r.numero || "(brouillon)"}</span><span className={tx.cap}>{r.date_emission ? new Date(r.date_emission + "T12:00:00").toLocaleDateString("fr-FR") : "Non émise"}</span></span>
        <span className="text-right"><span className="block text-[14px] tabular-nums">{e2(r.type === "avoir" ? -Number(r.total_ttc) : Number(r.total_ttc))}</span><Chip c={c}>{l}</Chip></span>
      </button>
    })}</div>
  </>
}
