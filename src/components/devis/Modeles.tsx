/* update61 · Modèles de devis réutilisables (par artisan, table devis_modeles) :
   enregistrer le devis en cours comme modèle, l'appliquer (remplacer ou ajouter), le mettre à jour, le renommer, le supprimer. */
import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { X, LayoutTemplate, Plus, Pencil, Trash2, RefreshCw, Loader2 } from "lucide-react"
import { supabase } from "../../lib/supabase"
import { fmtE, type StoredLine } from "../../lib/devisCalc"
import { TEAL, field } from "./fields"

export type Modele = { id: string; nom: string; objet: string | null; lignes: StoredLine[]; updated_at: string }
const htOf = (ls: StoredLine[]) => ls.filter(x => x && x.k !== "sec" && x.k !== "meta").reduce((a, x) => a + Number(x.q) * Number(x.pu), 0)
const countOf = (ls: StoredLine[]) => ls.filter(x => x && x.k !== "sec" && x.k !== "meta").length
const MIG = "Modèles indisponibles : la migration 20261121_10 n'est pas encore appliquée (voir LISEZMOI)."

export default function Modeles({ desk, current, onApply, onClose }: { desk: boolean; current: { objet: string; lignes: StoredLine[] }; onApply: (m: Modele, mode: "replace" | "append") => void; onClose: () => void }) {
  const [rows, setRows] = useState<Modele[] | null>(null), [err, setErr] = useState(""), [busy, setBusy] = useState("")
  const [nom, setNom] = useState(current.objet || ""), [edit, setEdit] = useState<string | null>(null), [rename, setRename] = useState("")
  const hasCurrent = countOf(current.lignes) > 0
  const load = async () => {
    const { data, error } = await supabase.from("devis_modeles").select("id, nom, objet, lignes, updated_at").order("updated_at", { ascending: false }).limit(200)
    if (error) { setErr(MIG); setRows([]); return }
    setRows((data || []) as Modele[])
  }
  useEffect(() => { void load() }, [])
  const run = async (k: string, fn: () => Promise<string | void>) => { setBusy(k); setErr(""); const e = await fn(); if (e) setErr(e); setBusy("") }
  const create = () => run("new", async () => {
    const n = nom.trim()
    if (!n) return "Donnez un nom au modèle."
    if (!hasCurrent) return "Ajoutez d'abord des lignes au devis."
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from("devis_modeles").insert({ artisan_id: user!.id, nom: n.slice(0, 120), objet: current.objet || null, lignes: current.lignes })
    if (error) return error.code === "42P01" || /devis_modeles/.test(error.message) ? MIG : "Enregistrement impossible."
    setNom(""); await load()
  })
  const update = (m: Modele) => run(m.id, async () => {
    if (!hasCurrent) return "Le devis en cours est vide."
    if (!confirm(`Remplacer le contenu du modèle « ${m.nom} » par le devis en cours ?`)) return
    const { error } = await supabase.from("devis_modeles").update({ lignes: current.lignes, objet: current.objet || m.objet, updated_at: new Date().toISOString() }).eq("id", m.id)
    if (error) return "Mise à jour impossible."
    await load()
  })
  const saveName = (m: Modele) => run(m.id, async () => {
    const n = rename.trim(); if (!n) return "Nom vide."
    const { error } = await supabase.from("devis_modeles").update({ nom: n.slice(0, 120), updated_at: new Date().toISOString() }).eq("id", m.id)
    if (error) return "Renommage impossible."
    setEdit(null); await load()
  })
  const del = (m: Modele) => run(m.id, async () => {
    if (!confirm(`Supprimer le modèle « ${m.nom} » ?`)) return
    const { error } = await supabase.from("devis_modeles").delete().eq("id", m.id)
    if (error) return "Suppression impossible."
    await load()
  })
  const panel = <div className="flex max-h-[86dvh] flex-col">
    <div className="flex items-center gap-3 border-b border-white/[.07] px-5 py-4">
      <LayoutTemplate size={18} style={{ color: TEAL }} />
      <div className="flex-1"><div className="text-[16px] font-semibold">Modèles de devis</div><div className="text-[12.5px] text-white/45">Vos devis types, prêts en un geste</div></div>
      <button type="button" aria-label="Fermer" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[.07] text-white/70"><X size={17} /></button>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <div className="rounded-[18px] border border-white/[.06] bg-white/[.03] p-3">
        <div className="text-[13px] font-medium text-white/80">Enregistrer le devis en cours comme modèle</div>
        <div className="mt-2 flex gap-2"><input className={field + " !h-11"} placeholder="Ex. Remplacement chauffe-eau 200 L" value={nom} maxLength={120} onChange={e => setNom(e.target.value)} /><button type="button" disabled={!!busy} onClick={() => void create()} className="flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold text-white disabled:opacity-40" style={{ background: TEAL }}>{busy === "new" ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}Créer</button></div>
        {!hasCurrent && <div className="mt-1.5 text-[12px] text-white/40">Le devis en cours n'a pas encore de lignes.</div>}
      </div>
      {err && <div className="mt-3 rounded-[14px] bg-[#FF453A]/12 px-4 py-3 text-[13px] text-[#FF9B96]">{err}</div>}
      <div className="mt-4 space-y-2">
        {rows === null && <div className="py-6 text-center text-[13px] text-white/45">Chargement…</div>}
        {rows?.length === 0 && !err && <div className="py-6 text-center text-[13px] text-white/45">Aucun modèle pour l'instant. Préparez un devis type puis enregistrez-le ici.</div>}
        {rows?.map(m => <div key={m.id} className="rounded-[18px] border border-white/[.06] bg-[#141416] p-3.5">
          {edit === m.id
            ? <div className="flex gap-2"><input autoFocus className={field + " !h-10"} value={rename} onChange={e => setRename(e.target.value)} onKeyDown={e => e.key === "Enter" && void saveName(m)} /><button type="button" onClick={() => void saveName(m)} className="h-10 shrink-0 rounded-full bg-white px-4 text-[13px] font-semibold text-black">OK</button></div>
            : <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="truncate text-[15px] font-medium">{m.nom}</div><div className="text-[12.5px] text-white/45">{countOf(m.lignes)} ligne{countOf(m.lignes) > 1 ? "s" : ""} · {fmtE(htOf(m.lignes))} HT{m.objet && m.objet !== m.nom ? ` · ${m.objet}` : ""}</div></div>
              <button type="button" aria-label={`Renommer ${m.nom}`} onClick={() => { setEdit(m.id); setRename(m.nom) }} className="p-1.5 text-white/45 hover:text-white"><Pencil size={15} /></button>
              <button type="button" aria-label={`Mettre à jour ${m.nom} avec le devis en cours`} title="Mettre à jour avec le devis en cours" onClick={() => void update(m)} className="p-1.5 text-white/45 hover:text-white"><RefreshCw size={15} /></button>
              <button type="button" aria-label={`Supprimer ${m.nom}`} onClick={() => void del(m)} className="p-1.5 text-white/45 hover:text-[#FF9B96]"><Trash2 size={15} /></button></div>}
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { if (!hasCurrent || confirm("Remplacer les lignes du devis en cours par ce modèle ?")) onApply(m, "replace") }} className="h-10 rounded-full text-[13.5px] font-semibold text-white" style={{ background: TEAL }}>Utiliser</button>
            <button type="button" disabled={!hasCurrent} onClick={() => onApply(m, "append")} className="h-10 rounded-full bg-white/[.07] text-[13.5px] font-medium text-white/85 disabled:opacity-35">Ajouter les lignes</button>
          </div>
        </div>)}
      </div>
    </div>
  </div>
  return <motion.div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 lg:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
    <motion.div role="dialog" aria-label="Modèles de devis" className={`w-full overflow-hidden border border-white/[.08] bg-[#0F0F11] text-white ${desk ? "max-w-[560px] rounded-[24px]" : "rounded-t-[26px] pb-[var(--sab)]"}`} initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }} onClick={e => e.stopPropagation()}>{panel}</motion.div>
  </motion.div>
}
