/* update64 · Équipe — update65 : formulaire « Nouveau membre / Modifier » (maquette equipe-ajout.png), partagé par
   la page Équipe et par le formulaire chantier (« Gérer l'équipe »). Prénom, nom, métier en puces, téléphone (FR validé),
   e-mail, date d'entrée, photo (bucket privé equipe), accès à l'app + invitation SMS. */
import { useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Camera, ChevronRight, Loader2, Phone, Trash2, UserPlus, X } from "lucide-react"
import { useC } from "../ui"
import ModalSheet from "../sheet/ModalSheet"
import PhotoCropper from "../photo/PhotoCropper"
import { deleteEmploye, empName, inviteEmploye, loadChantiers, saveEmploye, uploadPhoto, useChantiers, type Employe } from "../../lib/chantiers"
import { METIERS, ROLE_LABEL, frPhone, isMobile, shortName, todayISOsafe, validEmail, type AccessRole } from "../../lib/equipeCalc"
import { EmpAvatar } from "./parts"

const SPRING = { type: "spring" as const, stiffness: 420, damping: 36 }
/** Encart groupé (maquette : fond gris clair, filets fins décalés). */
export const Group = ({ children, className = "" }: { children: ReactNode; className?: string }) => <div className={`overflow-hidden rounded-[16px] bg-white/[.07] ${className}`}>{children}</div>
export const Field = ({ label, htmlFor, children, err }: { label: string; htmlFor: string; children: ReactNode; err?: string }) => <div className="eq-sep">
  <div className="flex min-h-[50px] items-center gap-3 pl-4"><label htmlFor={htmlFor} className="w-[100px] shrink-0 text-[16px] text-white/50">{label}</label><div className="flex min-w-0 flex-1 items-center pr-4">{children}</div></div>
  <AnimatePresence initial={false}>{err && <motion.p role="alert" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden px-4 pb-2.5 text-[13px] text-[#FF6B6B]">{err}</motion.p>}</AnimatePresence>
</div>
export const inp = "h-[52px] w-full min-w-0 bg-transparent text-[16px] text-white outline-none caret-[#30D158] [color-scheme:dark] placeholder:text-white/28"
export function GreenSwitch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  const rm = useReducedMotion()
  return <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className="relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200" style={{ background: on ? "#30D158" : "rgba(120,120,128,.32)" }}>
    <motion.span aria-hidden className="absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,.25)]" initial={false} animate={{ x: on ? 20 : 0 }} transition={rm ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40, mass: .8 }} />
  </button>
}
export function RoleSeg({ value, onChange }: { value: AccessRole; onChange: (v: AccessRole) => void }) {
  return <div role="radiogroup" aria-label="Rôle dans l'app" className="relative grid h-10 grid-cols-3 rounded-[11px] bg-white/[.06] p-[3px]">
    {(Object.keys(ROLE_LABEL) as AccessRole[]).map(r => <button key={r} type="button" role="radio" aria-checked={value === r} onClick={() => onChange(r)} className={`relative rounded-[8px] text-[14px] font-semibold transition-colors ${value === r ? "text-white" : "text-white/55"}`}>
      {value === r && <motion.span layoutId="role-seg" transition={{ type: "spring", stiffness: 520, damping: 38 }} className="absolute inset-0 rounded-[8px] bg-white/[.18] shadow-[0_1px_4px_rgba(0,0,0,.3)]" />}<span className="relative">{ROLE_LABEL[r]}</span></button>)}
  </div>
}

type Draft = { first_name: string; last_name: string; metier: string; autre: string; phone: string; email: string; hired_on: string; photo_path: string | null; access: boolean; role: AccessRole }
const draftOf = (e?: Employe | null): Draft => {
  const r = e?.role?.trim() || "", known = (METIERS as readonly string[]).includes(r)
  return { first_name: e?.first_name || "", last_name: e?.last_name || "", metier: r ? (known ? r : "Autre") : "", autre: known ? "" : r, phone: e?.phone || "", email: e?.email || "", hired_on: e?.hired_on || "", photo_path: e?.photo_path || null, access: !!e?.access_role, role: e?.access_role || "ouvrier" }
}

/** Formulaire membre (feuille modale). */
export function MemberForm({ initial, desk, onClose, onSaved, onDeleted, z = 72 }: { initial?: Employe | null; desk: boolean; onClose: () => void; onSaved?: (id: string) => void; onDeleted?: (id: string) => void; z?: number }) {
  const { toast } = useC(), st = useChantiers(), edit = !!initial
  const [d, setD] = useState<Draft>(() => draftOf(initial)), [busy, setBusy] = useState(""), [errs, setErrs] = useState<Record<string, string>>({}), [confirmDel, setConfirmDel] = useState(false)
  const file = useRef<HTMLInputElement>(null), autreRef = useRef<HTMLInputElement>(null)
  const [crop, setCrop] = useState<File | null>(null)
  const set = (p: Partial<Draft>) => { setD(x => ({ ...x, ...p })); setErrs(e => { const n = { ...e }; for (const k of Object.keys(p)) delete n[k]; return n }) }
  useEffect(() => { if (d.metier === "Autre" && !initial) setTimeout(() => autreRef.current?.focus(), 220) }, [d.metier]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key !== "Escape") return; e.stopImmediatePropagation(); if (crop) setCrop(null); else if (confirmDel) setConfirmDel(false); else onClose() }
    addEventListener("keydown", f, true); return () => removeEventListener("keydown", f, true)
  }, [confirmDel, onClose, crop])
  // update67 : la photo choisie passe d'abord par le recadrage circulaire, puis part (carré 512 px) dans le bucket « equipe »
  const pick = (f?: File | null) => { if (!f) return; if (!/^image\//.test(f.type)) { toast("Choisissez une image."); return } setCrop(f) }
  const upload = async (f: File) => {
    setCrop(null)
    setBusy("photo"); const r = await uploadPhoto(f); setBusy("")
    if (r.error) { toast(r.error); return }
    set({ photo_path: r.path! })
  }
  const save = async () => {
    const e: Record<string, string> = {}, ph = d.phone.trim() ? frPhone(d.phone) : ""
    if (!d.first_name.trim()) e.first_name = "Indiquez le prénom."
    if (d.phone.trim() && !ph) e.phone = "Numéro français à 10 chiffres (ex. 06 41 22 87 15)."
    if (st.ext && d.access && !ph) e.phone = e.phone || "Un numéro de mobile est nécessaire pour l'invitation SMS."
    else if (st.ext && d.access && !isMobile(ph)) e.phone = "L'invitation part par SMS : indiquez un mobile (06 ou 07)."
    if (st.ext && d.email.trim() && !validEmail(d.email)) e.email = "Adresse e-mail invalide."
    if (d.metier === "Autre" && !d.autre.trim()) e.autre = "Précisez le métier."
    setErrs(e)
    if (Object.keys(e).length) { navigator.vibrate?.(8); return }
    const was = initial?.access_role ? initial.invite_status || "pending" : null
    const newlyInvited = st.ext && d.access && (!initial?.access_role || (initial.invite_status === "pending" && !initial.invited_at))
    setBusy("save")
    const r = await saveEmploye(initial?.id || null, {
      first_name: d.first_name, last_name: d.last_name, role: d.metier === "Autre" ? d.autre : d.metier || null, phone: ph || null, photo_path: d.photo_path,
      email: d.email, hired_on: d.hired_on || (edit ? null : todayISOsafe()), access_role: d.access ? d.role : null, invite_status: d.access ? (was === "accepted" ? "accepted" : "pending") : null,
    })
    if (!r.ok) { setBusy(""); toast(r.error); return }
    if (newlyInvited) {
      const inv = await inviteEmploye(r.id)
      toast(inv.ok ? `Invitation envoyée à ${d.first_name.trim()} par SMS` : inv.error || "Invitation non envoyée.")
    } else toast(edit ? "Modifications enregistrées" : `${d.first_name.trim()} ajouté à l'équipe`)
    setBusy(""); onSaved?.(r.id); onClose()
  }
  const del = async () => {
    if (!initial) return
    setBusy("del"); const e = await deleteEmploye(initial.id); setBusy("")
    if (e) { toast(e); return }
    toast(`${shortName(initial)} retiré de l'équipe`); setConfirmDel(false); onDeleted?.(initial.id); onClose()
  }
  const preview: Employe | null = d.photo_path ? { id: initial?.id || "new", first_name: d.first_name || "?", last_name: d.last_name || null, role: null, phone: null, photo_path: d.photo_path } : null
  const title = edit ? "Modifier" : "Nouveau membre"

  return <ModalSheet label={title} onClose={onClose} desk={desk} z={z} size="large" escape={false} className="bg-[#161618]" deskClass="h-[86dvh] max-w-[480px]">
      <div className="relative flex h-[56px] shrink-0 items-center justify-center px-4">
        <button type="button" onClick={onClose} className="absolute left-4 text-[16px] text-white/55 active:text-white">Annuler</button>
        <span className="text-[17px] font-semibold">{title}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4" style={{ paddingBottom: 110 }}>
        <div className="flex flex-col items-center pb-5 pt-1">
          <motion.button type="button" whileTap={{ scale: .94 }} onClick={() => file.current?.click()} aria-label={d.photo_path ? "Changer la photo" : "Ajouter une photo"} className="relative flex h-[84px] w-[84px] items-center justify-center rounded-full border border-dashed border-white/30 bg-white/[.03] text-white/70">
            {preview ? <span className="absolute inset-0"><EmpAvatar e={preview} size={84} /></span> : busy === "photo" ? <Loader2 size={22} className="animate-spin" /> : <Camera size={24} strokeWidth={1.7} />}
          </motion.button>
          <div className="mt-2.5 flex items-center gap-4 text-[14.5px] font-medium"><button type="button" onClick={() => file.current?.click()}>{busy === "photo" ? "Envoi…" : d.photo_path ? "Changer la photo" : "Ajouter une photo"}</button>{d.photo_path && <button type="button" onClick={() => set({ photo_path: null })} className="text-white/45">Retirer</button>}</div>
          <input ref={file} type="file" accept="image/*" className="hidden" onChange={e => { pick(e.target.files?.[0]); e.target.value = "" }} />
        </div>
        <Group>
          <Field label="Prénom" htmlFor="mf-fn" err={errs.first_name}><input id="mf-fn" className={inp} autoComplete="off" autoCapitalize="words" enterKeyHint="next" placeholder="Obligatoire" maxLength={80} value={d.first_name} onChange={e => set({ first_name: e.target.value })} /></Field>
          <Field label="Nom" htmlFor="mf-ln"><input id="mf-ln" className={inp} autoComplete="off" autoCapitalize="words" enterKeyHint="next" placeholder="Facultatif" maxLength={80} value={d.last_name} onChange={e => set({ last_name: e.target.value })} /></Field>
        </Group>
        <div className="mb-2 mt-5 px-1 text-[13.5px] text-white/50">Métier</div>
        <div role="radiogroup" aria-label="Métier" className="flex flex-wrap gap-1.5">
          {[...METIERS, "Autre"].map(m => { const on = d.metier === m; return <motion.button key={m} type="button" role="radio" aria-checked={on} whileTap={{ scale: .94 }} onClick={() => set({ metier: on ? "" : m })}
            className={`h-[34px] rounded-full px-3 text-[13.5px] font-medium transition-colors duration-150 ${on ? "bg-white text-black" : "bg-white/[.08] text-white/90"}`}>{m}</motion.button> })}
        </div>
        <AnimatePresence initial={false}>{d.metier === "Autre" && <motion.div key="autre" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ height: SPRING, opacity: { duration: .15 } }} className="overflow-hidden">
          <Group className="mt-3"><Field label="Métier" htmlFor="mf-autre" err={errs.autre}><input ref={autreRef} id="mf-autre" className={inp} autoCapitalize="sentences" placeholder="Ex. Chef de chantier, Plaquiste…" maxLength={80} value={d.autre} onChange={e => set({ autre: e.target.value })} /></Field></Group>
        </motion.div>}</AnimatePresence>
        <Group className="mt-5">
          <Field label="Téléphone" htmlFor="mf-tel" err={errs.phone}><input id="mf-tel" className={inp} type="tel" inputMode="tel" autoComplete="off" enterKeyHint="next" placeholder="06 12 34 56 78" maxLength={20} value={d.phone} onChange={e => set({ phone: e.target.value })} onBlur={() => { const p = frPhone(d.phone); if (p) set({ phone: p }) }} /></Field>
          {st.ext && <Field label="Email" htmlFor="mf-mail" err={errs.email}><input id="mf-mail" className={inp} type="email" inputMode="email" autoComplete="off" autoCapitalize="none" enterKeyHint="done" placeholder="Optionnel" maxLength={254} value={d.email} onChange={e => set({ email: e.target.value })} /></Field>}
          {st.ext && edit && <Field label="Date d'entrée" htmlFor="mf-hired"><input id="mf-hired" className={inp} type="date" max="2100-12-31" value={d.hired_on} onChange={e => set({ hired_on: e.target.value })} /></Field>}
        </Group>
        {st.ext ? <div className="mt-5 rounded-[16px] bg-white/[.07] px-4 py-3.5">
          <div className="flex items-center gap-3"><div className="min-w-0 flex-1"><div className="text-[16.5px] font-medium">Accès à l'app</div><div className="mt-0.5 text-[13.5px] text-white/50">{initial?.invite_status === "accepted" ? "Compte activé" : initial?.access_role && initial.invited_at ? "Invitation déjà envoyée" : "Envoyer une invitation par SMS"}</div></div><GreenSwitch on={d.access} onChange={v => set({ access: v, phone: d.phone })} label="Accès à l'app" /></div>
          <AnimatePresence initial={false}>{d.access && <motion.div key="seg" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ height: SPRING, opacity: { duration: .15 } }} className="overflow-hidden"><div className="pt-3.5"><RoleSeg value={d.role} onChange={r => set({ role: r })} /></div></motion.div>}</AnimatePresence>
        </div> : <p className="mt-5 px-1 text-[12.5px] leading-[18px] text-white/35">E-mail, date d'entrée et accès à l'app arrivent avec la migration 20261121_12 (voir LISEZMOI update65).</p>}
        {edit && <button type="button" onClick={() => setConfirmDel(true)} className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-white/[.07] text-[16px] font-medium text-[#FF6B6B] active:bg-white/[.1]"><Trash2 size={17} />Retirer de l'équipe</button>}
      </div>
      <div className="kb-hide pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#161618] via-[#161618]/95 to-transparent px-4 pt-6" style={{ paddingBottom: desk ? 18 : "max(calc(var(--sab) + 6px), 18px)" }}>
        <motion.button type="button" whileTap={{ scale: .98 }} disabled={!!busy} onClick={() => void save()} className="pointer-events-auto flex h-[54px] w-full items-center justify-center rounded-full bg-white text-[17px] font-semibold text-black shadow-[0_8px_24px_-8px_rgba(255,255,255,.25)] disabled:opacity-60">
          {busy === "save" ? <Loader2 size={20} className="animate-spin" /> : edit ? "Enregistrer" : "Ajouter à l'équipe"}</motion.button>
      </div>
      <AnimatePresence>{confirmDel && initial && <motion.div className="absolute inset-0 z-10 flex items-end bg-black/55" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setConfirmDel(false)}>
        <motion.div role="alertdialog" aria-label="Retirer de l'équipe" onClick={e => e.stopPropagation()} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={SPRING} className="w-full p-3" style={{ paddingBottom: "max(calc(var(--sab) + 4px), 14px)" }}>
          <div className="overflow-hidden rounded-[16px] bg-[#2A2A2D] text-center"><p className="px-6 py-4 text-[13.5px] leading-5 text-white/60">Retirer {shortName(initial)} de l'équipe ? Il sera retiré de ses chantiers. Cette action est définitive.</p>
            <button type="button" disabled={!!busy} onClick={() => void del()} className="h-14 w-full border-t border-white/[.08] text-[18px] font-semibold text-[#FF453A] active:bg-white/[.05]">{busy === "del" ? "Retrait…" : `Retirer ${shortName(initial)}`}</button></div>
          <button type="button" onClick={() => setConfirmDel(false)} className="mt-2 h-14 w-full rounded-[16px] bg-[#2A2A2D] text-[18px] font-semibold text-[#7EA6FF]">Annuler</button>
        </motion.div></motion.div>}</AnimatePresence>
    <AnimatePresence>{crop && <PhotoCropper key="crop" file={crop} z={z + 10} onCancel={() => setCrop(null)} onDone={f => void upload(f)} />}</AnimatePresence>
  </ModalSheet>
}

/** Liste compacte (formulaire chantier → « Gérer l'équipe ») ; ajout / modification via MemberForm. */
export default function EquipeSheet({ close, desk, z = 70 }: { close: () => void; desk?: boolean; z?: number }) {
  const st = useChantiers(), [form, setForm] = useState<{ e: Employe | null } | null>(null)
  useEffect(() => { if (!st.ready) void loadChantiers() }, [st.ready])
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === "Escape" && !form) { e.stopImmediatePropagation(); close() } }
    addEventListener("keydown", f, true); return () => removeEventListener("keydown", f, true)
  }, [form, close])
  return <>
    <ModalSheet label="Équipe" onClose={close} desk={!!desk} z={z} size="large" escape={false} className="bg-[#0B0B0C] text-white" deskClass="h-[82dvh] max-w-[520px]">
      <div className="flex h-14 shrink-0 items-center justify-between px-4"><span className="w-16" /><span className="text-[17px] font-semibold">Équipe</span><button type="button" onClick={close} className="flex w-16 justify-end text-[16px] font-semibold text-[#7EA6FF]">OK</button></div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-10 pt-2">
        {st.missing ? <div className="rounded-[18px] bg-[#FFB340]/[.09] px-4 py-4 text-[14px] leading-5 text-white/80">Appliquez la migration <b>20261121_11_update64_chantiers_equipe.sql</b> (voir LISEZMOI update64).</div> : <Group>
          {st.employes.map(e => <button key={e.id} type="button" onClick={() => setForm({ e })} className="eq-sep flex w-full items-center gap-3 py-2.5 pl-4 pr-3 text-left active:bg-white/[.04]">
            <EmpAvatar e={e} size={40} />
            <span className="min-w-0 flex-1"><span className="block truncate text-[16px] font-medium">{empName(e)}</span><span className="block truncate text-[13px] text-white/45">{[e.role, e.phone].filter(Boolean).join(" · ") || "Métier à préciser"}</span></span>
            {e.phone && <a href={`tel:${e.phone.replace(/[^\d+]/g, "")}`} onClick={ev => ev.stopPropagation()} aria-label={`Appeler ${empName(e)}`} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[.08] text-white/80"><Phone size={15} /></a>}
            <ChevronRight size={17} className="text-white/25" />
          </button>)}
          <button type="button" onClick={() => setForm({ e: null })} className="eq-sep flex min-h-[56px] w-full items-center gap-3 pl-4 pr-3 text-left text-[16px] text-[#7EA6FF] active:bg-white/[.04]"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2F6BFF]/15"><UserPlus size={18} /></span>Ajouter un membre</button>
        </Group>}
      </div>
      <button type="button" aria-label="Fermer" onClick={close} className="sr-only"><X /></button>
    </ModalSheet>
    <AnimatePresence>{form && <MemberForm key="mf" initial={form.e} desk={!!desk} z={z + 5} onClose={() => setForm(null)} />}</AnimatePresence>
  </>
}
