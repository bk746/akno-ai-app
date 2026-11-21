/* update64 · Réglages → Équipe : ajouter, modifier, supprimer des employés (prénom, nom, rôle, téléphone, photo).
   Style iOS des listes groupées (update63). Le planning d'équipe complet viendra plus tard. */
import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Camera, ChevronLeft, Phone, Plus, Trash2, UserPlus } from "lucide-react"
import { IGroup, IRow, ival } from "../form/grouped"
import { deleteEmploye, empName, loadChantiers, saveEmploye, uploadPhoto, useChantiers, type Employe } from "../../lib/chantiers"
import { EmpAvatar } from "./parts"

const ROLES = ["Chef de chantier", "Plombier", "Chauffagiste", "Électricien", "Carreleur", "Peintre", "Maçon", "Menuisier", "Plaquiste", "Apprenti", "Ouvrier"]
type Draft = { id: string | null; first_name: string; last_name: string; role: string; phone: string; photo_path: string | null }
const blank: Draft = { id: null, first_name: "", last_name: "", role: "", phone: "", photo_path: null }

export default function EquipeSheet({ close, desk, z = 70 }: { close: () => void; desk?: boolean; z?: number }) {
  const st = useChantiers(), [ed, setEd] = useState<Draft | null>(null), [busy, setBusy] = useState(""), [err, setErr] = useState("")
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => { if (!st.ready) void loadChantiers() }, [st.ready])
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key !== "Escape") return; e.stopImmediatePropagation(); if (ed) setEd(null); else close() }
    addEventListener("keydown", f, true); return () => removeEventListener("keydown", f, true)
  }, [ed, close])
  const open = (e?: Employe) => { setErr(""); setEd(e ? { id: e.id, first_name: e.first_name, last_name: e.last_name || "", role: e.role || "", phone: e.phone || "", photo_path: e.photo_path } : { ...blank }) }
  const save = async () => {
    if (!ed) return
    if (!ed.first_name.trim()) { setErr("Indiquez au moins le prénom."); return }
    setBusy("save"); const r = await saveEmploye(ed.id, { first_name: ed.first_name, last_name: ed.last_name, role: ed.role, phone: ed.phone, photo_path: ed.photo_path }); setBusy("")
    if (!r.ok) { setErr(r.error); return }
    setEd(null)
  }
  const del = async () => {
    if (!ed?.id || !confirm(`Supprimer ${ed.first_name} de l'équipe ? Il sera retiré de ses chantiers.`)) return
    setBusy("del"); const e = await deleteEmploye(ed.id); setBusy("")
    if (e) { setErr(e); return }
    setEd(null)
  }
  const pick = async (f?: File | null) => {
    if (!f || !ed) return
    setBusy("photo"); setErr(""); const r = await uploadPhoto(f); setBusy("")
    if (r.error) { setErr(r.error); return }
    setEd(d => d && { ...d, photo_path: r.path! })
  }
  const head = (l: React.ReactNode, title: string, r: React.ReactNode) => <div className="flex h-14 shrink-0 items-center justify-between px-4"><div className="w-24">{l}</div><span className="text-[17px] font-semibold">{title}</span><div className="flex w-24 justify-end">{r}</div></div>
  const preview: Employe | null = ed && { id: ed.id || "new", first_name: ed.first_name || "?", last_name: ed.last_name || null, role: null, phone: null, photo_path: ed.photo_path }

  return <motion.div className={`fixed inset-0 flex bg-black/60 backdrop-blur-[3px] ${desk ? "items-center justify-center" : "items-end"}`} style={{ zIndex: z }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
    <motion.div role="dialog" aria-modal="true" aria-label="Équipe" onClick={e => e.stopPropagation()} initial={desk ? { opacity: 0, scale: .97 } : { y: "100%" }} animate={desk ? { opacity: 1, scale: 1 } : { y: 0 }} exit={desk ? { opacity: 0, scale: .97 } : { y: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 36 }}
      className={`relative flex w-full flex-col overflow-hidden bg-[#0B0B0C] text-white ${desk ? "h-[82dvh] max-w-[520px] rounded-[24px] border border-white/[.08]" : "kb-panel h-[94dvh] rounded-t-[22px]"}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        {!ed ? <motion.div key="list" className="flex min-h-0 flex-1 flex-col" initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -40, opacity: 0 }} transition={{ type: "spring", stiffness: 420, damping: 38 }}>
          {!desk && <div className="mx-auto mt-2 h-[5px] w-9 shrink-0 rounded-full bg-white/20" />}
          {head(<span />, "Équipe", <button type="button" onClick={close} className="text-[16px] font-semibold text-[#7EA6FF]">OK</button>)}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-10 pt-2">
            {st.missing ? <div className="rounded-[18px] bg-[#FFB340]/[.09] px-4 py-4 text-[14px] leading-5 text-white/80">L'équipe arrive avec la mise à jour de la base : appliquez la migration <b>20261121_11_update64_chantiers_equipe.sql</b> (voir LISEZMOI update64).</div> : <>
              <IGroup title={`Employés${st.employes.length ? ` · ${st.employes.length}` : ""}`} foot="Assignez-les ensuite à vos chantiers. Le planning d'équipe complet arrive bientôt.">
                {st.employes.map(e => <button key={e.id} type="button" onClick={() => open(e)} className="ig-row flex w-full items-center gap-3 py-2.5 pl-4 pr-3 text-left active:bg-white/[.04]">
                  <EmpAvatar e={e} size={40} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[16px] font-medium">{empName(e)}</span><span className="block truncate text-[13px] text-white/45">{[e.role, e.phone].filter(Boolean).join(" · ") || "Rôle à préciser"}</span></span>
                  {e.phone && <a href={`tel:${e.phone.replace(/[^\d+]/g, "")}`} onClick={ev => ev.stopPropagation()} aria-label={`Appeler ${empName(e)}`} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[.08] text-white/80"><Phone size={15} /></a>}
                </button>)}
                <button type="button" onClick={() => open()} className="ig-row flex min-h-[56px] w-full items-center gap-3 pl-4 pr-3 text-left text-[16px] text-[#7EA6FF] active:bg-white/[.04]"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2F6BFF]/15"><UserPlus size={18} /></span>Ajouter un employé</button>
              </IGroup>
              {st.error && <p className="mt-3 px-4 text-[13px] text-[#FF9B96]">{st.error}</p>}
            </>}
          </div>
        </motion.div>
          : <motion.div key="edit" className="flex min-h-0 flex-1 flex-col" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ type: "spring", stiffness: 420, damping: 38 }}>
            {!desk && <div className="mx-auto mt-2 h-[5px] w-9 shrink-0 rounded-full bg-white/20" />}
            {head(<button type="button" onClick={() => setEd(null)} className="-ml-1 flex items-center text-[16px] text-[#7EA6FF]"><ChevronLeft size={22} />Équipe</button>, ed.id ? "Employé" : "Nouvel employé", <button type="button" disabled={!!busy} onClick={() => void save()} className="text-[16px] font-semibold text-[#7EA6FF] disabled:opacity-40">{busy === "save" ? "…" : "Enregistrer"}</button>)}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-10 pt-2">
              <div className="mb-6 flex flex-col items-center">
                <button type="button" onClick={() => file.current?.click()} aria-label="Choisir une photo" className="relative rounded-full active:scale-95">
                  {preview && <EmpAvatar e={preview} size={88} />}
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-[#2F6BFF] text-white ring-4 ring-[#0B0B0C]"><Camera size={15} /></span>
                </button>
                <div className="mt-2 flex gap-4 text-[14px]"><button type="button" onClick={() => file.current?.click()} className="text-[#7EA6FF]">{busy === "photo" ? "Envoi…" : ed.photo_path ? "Changer la photo" : "Ajouter une photo"}</button>{ed.photo_path && <button type="button" onClick={() => setEd({ ...ed, photo_path: null })} className="text-white/50">Retirer</button>}</div>
                <input ref={file} type="file" accept="image/*" className="hidden" onChange={e => { void pick(e.target.files?.[0]); e.target.value = "" }} />
              </div>
              <IGroup title="Identité">
                <IRow label="Prénom" htmlFor="em-fn"><input id="em-fn" className={ival} autoComplete="off" autoCapitalize="words" enterKeyHint="next" placeholder="Obligatoire" value={ed.first_name} maxLength={80} onChange={e => setEd({ ...ed, first_name: e.target.value })} /></IRow>
                <IRow label="Nom" htmlFor="em-ln"><input id="em-ln" className={ival} autoComplete="off" autoCapitalize="words" enterKeyHint="next" placeholder="Facultatif" value={ed.last_name} maxLength={80} onChange={e => setEd({ ...ed, last_name: e.target.value })} /></IRow>
                <IRow label="Rôle" htmlFor="em-role"><input id="em-role" className={ival} list="em-roles" autoComplete="off" autoCapitalize="sentences" enterKeyHint="next" placeholder="Ex. Plombier" value={ed.role} maxLength={80} onChange={e => setEd({ ...ed, role: e.target.value })} /><datalist id="em-roles">{ROLES.map(r => <option key={r} value={r} />)}</datalist></IRow>
                <IRow label="Téléphone" htmlFor="em-tel"><input id="em-tel" className={ival} type="tel" inputMode="tel" autoComplete="off" enterKeyHint="done" placeholder="06 12 34 56 78" value={ed.phone} maxLength={30} onChange={e => setEd({ ...ed, phone: e.target.value })} /></IRow>
              </IGroup>
              <div className="mt-3 flex flex-wrap gap-2 px-1">{ROLES.slice(0, 6).map(r => <button key={r} type="button" onClick={() => setEd({ ...ed, role: r })} className={`h-8 rounded-full px-3 text-[13.5px] transition-colors ${ed.role === r ? "bg-white text-black" : "bg-white/[.07] text-white/70"}`}>{r}</button>)}</div>
              {err && <p role="alert" className="mt-4 px-4 text-[13.5px] text-[#FF9B96]">{err}</p>}
              {ed.id && <button type="button" disabled={!!busy} onClick={() => void del()} className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-[#141416] text-[16px] text-[#FF6B6B] active:bg-white/[.06]"><Trash2 size={17} />Supprimer de l'équipe</button>}
            </div>
          </motion.div>}
      </AnimatePresence>
      {!ed && !st.missing && st.employes.length === 0 && st.ready && <div className="pointer-events-none absolute inset-x-0 top-[45%] text-center text-[14px] text-white/35"><Plus className="mx-auto mb-2 opacity-60" size={22} />Ajoutez votre premier employé</div>}
    </motion.div>
  </motion.div>
}
