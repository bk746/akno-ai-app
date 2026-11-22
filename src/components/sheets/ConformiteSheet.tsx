import { useCallback, useEffect, useState } from "react"
import { Copy, FileCheck2, Link2, Plus, Trash2 } from "lucide-react"
import { AMBER, Btn, Card, Chip, F, GREEN, GREY, Ic, List, RED, Row, Sheet, inp, tx, useC } from "../ui"
import { supabase } from "../../lib/supabase"
import { useProfile } from "../../lib/profile"
import { webOrigin } from "../../lib/native"

/* update46 · Dossier de conformité : attestations Urssaf, Kbis, décennale… avec alertes d'expiration et lien de partage. */
export const DOC_TYPES: [string, string, number][] = [["urssaf", "Attestation de vigilance Urssaf", 6], ["kbis", "Extrait Kbis / avis de situation", 3], ["decennale", "Attestation décennale", 12], ["rc_pro", "Attestation RC Pro", 12], ["fiscale", "Attestation de régularité fiscale", 12], ["rge", "Certificat RGE", 48], ["qualibat", "Qualibat / Qualifelec", 48], ["autre", "Autre document", 12]]
type Doc = { id: string; type: string; libelle: string | null; file_path: string | null; date_emission: string | null; date_expiration: string | null }
const today = () => new Date().toISOString().slice(0, 10)
const addMonths = (iso: string, m: number) => { const d = new Date(iso + "T12:00:00"); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 10) }
const days = (iso: string) => Math.round((new Date(iso + "T12:00:00").getTime() - Date.now()) / 864e5)
const fr = (iso?: string | null) => iso ? new Date(iso + "T12:00:00").toLocaleDateString("fr-FR") : "—"
export const docState = (d: { date_expiration: string | null }): [string, string] => !d.date_expiration ? ["Sans date", GREY] : d.date_expiration < today() ? ["Expiré", RED] : days(d.date_expiration) <= 30 ? [`Expire dans ${days(d.date_expiration)} j`, AMBER] : [`Valide jusqu'au ${fr(d.date_expiration)}`, GREEN]

export default function ConformiteSheet({ close }: { close: () => void }) {
  const { toast } = useC()
  const { p, save } = useProfile()
  const [docs, setDocs] = useState<Doc[] | null>(null), [add, setAdd] = useState(false), [err, setErr] = useState(""), [busy, setBusy] = useState(false)
  const [n, setN] = useState({ type: "urssaf", libelle: "", date_emission: today(), date_expiration: addMonths(today(), 6) })
  const [file, setFile] = useState<File | null>(null)
  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase.from("documents_conformite").select("id, type, libelle, file_path, date_emission, date_expiration").eq("artisan_id", user.id).order("date_expiration", { ascending: true })
    if (error) { setErr("Dossier indisponible : appliquez la migration 03."); setDocs([]); return }
    setDocs((data || []) as Doc[])
  }, [])
  useEffect(() => { void load() }, [load])
  const label = (t: string) => DOC_TYPES.find(x => x[0] === t)?.[1] || "Document"
  const submit = async () => {
    if (!file) { setErr("Choisissez le fichier (PDF ou photo)."); return }
    if (file.size > 10_000_000) { setErr("10 Mo maximum."); return }
    if (!/^(application\/pdf|image\/(png|jpeg|webp|heic))$/.test(file.type)) { setErr("PDF ou image uniquement."); return }
    setBusy(true); setErr("")
    const { data: { user } } = await supabase.auth.getUser()
    const ext = (file.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "pdf"
    const path = `${user!.id}/${n.type}-${Date.now()}.${ext}`
    const up = await supabase.storage.from("conformite").upload(path, file, { contentType: file.type })
    if (up.error) { setBusy(false); setErr("Envoi du fichier impossible."); return }
    const { error } = await supabase.from("documents_conformite").insert({ artisan_id: user!.id, type: n.type, libelle: n.libelle || null, file_path: path, date_emission: n.date_emission || null, date_expiration: n.date_expiration || null })
    setBusy(false)
    if (error) { await supabase.storage.from("conformite").remove([path]); setErr("Enregistrement impossible."); return }
    toast("Document ajouté"); setAdd(false); setFile(null); void load()
  }
  const open = async (d: Doc) => {
    if (!d.file_path) return
    const { data } = await supabase.storage.from("conformite").createSignedUrl(d.file_path, 300)
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener")
  }
  const del = async (d: Doc) => {
    if (!confirm(`Supprimer « ${d.libelle || label(d.type)} » ?`)) return
    await supabase.from("documents_conformite").delete().eq("id", d.id)
    if (d.file_path) await supabase.storage.from("conformite").remove([d.file_path])
    void load()
  }
  const token = p?.dossier_token as string | null | undefined
  const link = token ? `${webOrigin()}/dossier/${token}` : ""
  const share = async (on: boolean) => { const e = await save({ dossier_token: on ? crypto.randomUUID() : null }); if (e) setErr(e); else toast(on ? "Lien de partage créé" : "Partage désactivé") }
  if (add) return <Sheet title="Ajouter un document" c="#FFFFFF" onClose={() => setAdd(false)} footer={<Btn primary className="w-full" disabled={busy} onClick={submit}>{busy ? "Envoi…" : "Ajouter"}</Btn>}>
    <div className="space-y-3">
      <F l="Type"><select className={inp} value={n.type} onChange={e => { const t = DOC_TYPES.find(x => x[0] === e.target.value)!; setN({ ...n, type: t[0], date_expiration: addMonths(n.date_emission || today(), t[2]) }) }}>{DOC_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></F>
      {n.type === "autre" && <F l="Nom du document"><input className={inp} value={n.libelle} onChange={e => setN({ ...n, libelle: e.target.value })} /></F>}
      <div className="grid grid-cols-2 gap-2"><F l="Date du document"><input className={inp} type="date" value={n.date_emission} onChange={e => { const t = DOC_TYPES.find(x => x[0] === n.type)!; setN({ ...n, date_emission: e.target.value, date_expiration: e.target.value ? addMonths(e.target.value, t[2]) : n.date_expiration }) }} /></F><F l="Valable jusqu'au"><input className={inp} type="date" value={n.date_expiration} onChange={e => setN({ ...n, date_expiration: e.target.value })} /></F></div>
      <label className="flex h-14 cursor-pointer items-center justify-center rounded-[14px] border border-dashed border-white/20 text-[14px] text-white/70">{file ? file.name : "Choisir le fichier (PDF ou photo)"}<input type="file" accept="application/pdf,image/*" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} /></label>
      <p className={`px-1 ${tx.cap}`}>L'attestation Urssaf est valable 6 mois : Akno vous prévient 30 jours et 7 jours avant l'expiration.</p>
    </div>
    {err && <p className="mt-3 px-1 text-[13px] text-[#FF9B96]">{err}</p>}
  </Sheet>
  const bad = (docs || []).filter(d => d.date_expiration && days(d.date_expiration) <= 30).length
  return <Sheet title="Dossier de conformité" sub={docs ? (bad ? `${bad} document${bad > 1 ? "s" : ""} à renouveler` : `${docs.length} document${docs.length > 1 ? "s" : ""} à jour`) : "Chargement…"} c="#FFFFFF" onClose={close} footer={<Btn primary className="w-full" onClick={() => { setErr(""); setAdd(true) }}><Plus size={18} />Ajouter un document</Btn>}>
    <List empty="Ajoutez votre attestation Urssaf, votre Kbis et votre décennale : vos clients pros les demandent." I={FileCheck2}>
      {(docs || []).map((d, i) => { const [l, c] = docState(d); return <Row key={d.id} first={!i} lead={<Ic I={FileCheck2} />} t={d.libelle || label(d.type)} s={`Émis le ${fr(d.date_emission)}`} rs={<div className="flex items-center gap-2"><Chip c={c}>{l}</Chip><button aria-label="Supprimer" onClick={e => { e.stopPropagation(); void del(d) }} className="text-white/35"><Trash2 size={16} /></button></div>} onClick={() => open(d)} label="Ouvrir le document" /> })}
    </List>
    <Card className="mt-4 p-4">
      <div className="flex items-center gap-2 text-[15px] font-medium"><Link2 size={17} />Lien pour vos donneurs d'ordre</div>
      <div className={`mt-1 ${tx.cap}`}>Une page en lecture seule avec vos documents à jour (liens valables 1 h).</div>
      {link ? <><div className="mt-3 flex gap-2"><input className={inp} readOnly value={link} aria-label="Lien de partage" /><Btn onClick={() => { void navigator.clipboard?.writeText(link); toast("Lien copié") }} aria-label="Copier"><Copy size={16} /></Btn></div><button className="mt-2 text-[13px] text-white/50" onClick={() => share(false)}>Désactiver le partage</button></> : <Btn className="mt-3 w-full" onClick={() => share(true)}>Créer le lien de partage</Btn>}
    </Card>
    {err && <p className="mt-3 px-1 text-[13px] text-[#FF9B96]">{err}</p>}
  </Sheet>
}
