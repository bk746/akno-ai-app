/* update66 · « Nouveau client » / « Modifier » (maquette clients-3ecrans.png, 3e écran) — même style que le formulaire membre (update65).
   Particulier / Professionnel (raison sociale, SIREN ou SIRET, type syndic), import depuis les contacts (Contact Picker ou fichier .vcf),
   téléphone français vérifié + détection des doublons, adresse avec suggestions api-adresse, notes d'accès, origine du contact. */
import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "motion/react"
import { ChevronRight, Loader2, MapPin, Trash2, UserRound } from "lucide-react"
import { useC } from "../ui"
import ModalSheet from "../sheet/ModalSheet"
import { Field, Group, inp } from "../chantiers/EquipeSheet"
import { deleteClient, displayName, saveClient, useClients, type ClientInput, type NewClientSeed } from "../../lib/clients"
import { ORIGINS, boldMatch, ficheKey, fromPicker, frPhone, parseVcf, phoneKey, sirenOf, validEmail, type Client, type Kind, type Picked } from "../../lib/clientsCalc"
import { searchAddress, type Place } from "../../lib/geo"
import { SuggestPop } from "../form/grouped"

const SPRING = { type: "spring" as const, stiffness: 420, damping: 36 }
type Draft = ClientInput & { pro: "pro" | "syndic" }
const CIV = /^(m\.?|mme|mlle|mr|monsieur|madame)$/i
function draftOf(c?: Client | null, seed?: NewClientSeed | null): Draft {
  const f = c?.fiche, kind: Kind = c?.kind || "particulier", name = c?.name || seed?.name || ""
  let prenom = f?.prenom || "", nom = f?.nom_famille || ""
  if (!f?.prenom && !f?.nom_famille && kind === "particulier" && name) { const w = name.trim().split(/\s+/); if (w.length > 1 && !CIV.test(w[0])) { prenom = w[0]; nom = w.slice(1).join(" ") } else nom = name.trim() }
  return {
    kind: kind === "particulier" ? "particulier" : "pro", pro: kind === "syndic" ? "syndic" : "pro", prenom, nom_famille: nom, societe: kind !== "particulier" ? name : "",
    telephone: frPhone(c?.phone || seed?.phone) || c?.phone || seed?.phone || "", email: c?.email || seed?.email || "", adresse: c?.addr || seed?.addr || "", ville: f?.ville || "",
    lat: f?.lat ?? null, lng: f?.lng ?? null, siren: f?.siren || "", notes: f?.notes || "", origine: f?.origine || seed?.origine || (!c && !seed ? null : c && !f && c.calls.length ? "appel" : null),
  }
}
const canPickContacts = () => typeof navigator !== "undefined" && "contacts" in navigator && typeof (navigator as unknown as { contacts?: { select?: unknown } }).contacts?.select === "function"

export function Seg<T extends string>({ value, options, onChange, label, id }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string; id: string }) {
  return <div role="radiogroup" aria-label={label} className="relative grid h-[38px] rounded-[11px] bg-white/[.07] p-[3px]" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
    {options.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={`relative rounded-[8px] text-[14px] font-semibold transition-colors ${value === v ? "text-white" : "text-white/55"}`}>
      {value === v && <motion.span layoutId={id} transition={{ type: "spring", stiffness: 520, damping: 38 }} className="absolute inset-0 rounded-[8px] bg-white/[.2] shadow-[0_1px_4px_rgba(0,0,0,.3)]" />}<span className="relative">{l}</span></button>)}
  </div>
}
const Chips = <T extends string>({ value, options, onChange, label }: { value: T | null; options: [T, string][]; onChange: (v: T | null) => void; label: string }) =>
  <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">{options.map(([v, l]) => { const on = value === v; return <motion.button key={v} type="button" role="radio" aria-checked={on} whileTap={{ scale: .94 }} onClick={() => onChange(on ? null : v)}
    className={`h-[34px] rounded-full px-3.5 text-[13.5px] font-medium transition-colors duration-150 ${on ? "bg-white text-black" : "bg-white/[.08] text-white/90"}`}>{l}</motion.button> })}</div>

export function ClientForm({ initial, seed, directory, desk, onClose, onSaved, onOpen, onDeleted, z = 72 }: {
  initial?: Client | null; seed?: NewClientSeed | null; directory: Client[]; desk: boolean; onClose: () => void; onSaved?: (key: string) => void; onOpen?: (key: string) => void; onDeleted?: (key: string) => void; z?: number
}) {
  const { toast } = useC(), cs = useClients(), edit = !!initial
  const [d, setD] = useState<Draft>(() => draftOf(initial, seed)), [errs, setErrs] = useState<Record<string, string>>({}), [busy, setBusy] = useState(""), [confirmDel, setConfirmDel] = useState(false)
  const [sug, setSug] = useState<Place[]>([]), [addrFocus, setAddrFocus] = useState(false), picked = useRef(d.adresse), vcf = useRef<HTMLInputElement>(null)
  const set = (p: Partial<Draft>) => { setD(x => ({ ...x, ...p })); setErrs(e => { const n = { ...e }; for (const k of Object.keys(p)) delete n[k]; return n }) }
  const pro = d.kind !== "particulier"
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key !== "Escape") return; e.stopImmediatePropagation(); if (confirmDel) setConfirmDel(false); else if (sug.length && addrFocus) setSug([]); else onClose() }
    addEventListener("keydown", f, true); return () => removeEventListener("keydown", f, true)
  }, [confirmDel, onClose, sug.length, addrFocus])
  // suggestions d'adresse (api-adresse.data.gouv.fr), 250 ms après la frappe
  useEffect(() => {
    const q = d.adresse.trim()
    if (!addrFocus || q.length < 3 || q === picked.current) { setSug([]); return }
    const ac = new AbortController(), t = setTimeout(() => { searchAddress(q, ac.signal).then(r => setSug(r.slice(0, 4))).catch(() => { /* hors ligne */ }) }, 250)
    return () => { clearTimeout(t); ac.abort() }
  }, [d.adresse, addrFocus])
  const pick = (p: Place) => { picked.current = p.label; set({ adresse: p.label, ville: p.city || "", lat: p.lat, lng: p.lng }); setSug([]) }

  // doublons : même téléphone ou même nom qu'un autre client
  const self = initial?.key
  const dupPhone = useMemo(() => { const k = phoneKey(d.telephone); return k ? directory.find(c => c.key !== self && phoneKey(c.phone) === k) || null : null }, [d.telephone, directory, self])
  const dupName = useMemo(() => { if (edit) return null; const k = ficheKey(displayName(d)); return k ? directory.find(c => c.key === k) || null : null }, [d, directory, edit])
  const dup = dupPhone || dupName

  const applyPicked = (p: Picked | null) => {
    if (!p) { toast("Aucun contact lisible dans ce fichier."); return }
    picked.current = p.addr
    set({ prenom: p.first || d.prenom, nom_famille: p.last || d.nom_famille, ...(p.company && !p.first && !p.last ? { kind: "pro" as Kind, societe: p.company } : p.company ? { societe: p.company } : {}), telephone: frPhone(p.phone) || p.phone || d.telephone, email: p.email || d.email, adresse: p.addr || d.adresse, ...(p.addr ? { lat: null, lng: null, ville: "" } : {}) })
    toast("Contact importé")
  }
  const importContacts = async () => {
    if (canPickContacts()) {
      try {
        const nav = navigator as unknown as { contacts: { select: (p: string[], o: { multiple: boolean }) => Promise<Parameters<typeof fromPicker>[0][]>; getProperties?: () => Promise<string[]> } }
        const avail = nav.contacts.getProperties ? await nav.contacts.getProperties() : ["name", "tel", "email"]
        const r = await nav.contacts.select(["name", "tel", "email", "address"].filter(x => avail.includes(x)), { multiple: false })
        if (r?.[0]) applyPicked(fromPicker(r[0]))
        return
      } catch { /* refus ou non pris en charge : on propose le fichier */ }
    }
    vcf.current?.click()
  }
  const readVcf = async (f?: File | null) => { if (!f) return; if (f.size > 2e6) { toast("Fichier trop volumineux."); return } applyPicked(parseVcf(await f.text())) }

  const save = async () => {
    const e: Record<string, string> = {}, ph = d.telephone.trim() ? frPhone(d.telephone) : ""
    if (pro && !d.societe.trim()) e.societe = "Indiquez la raison sociale."
    if (!pro && !d.prenom.trim() && !d.nom_famille.trim()) e.nom_famille = "Indiquez au moins un nom."
    if (d.telephone.trim() && !ph) e.telephone = "Numéro français à 10 chiffres (ex. 06 58 12 40 93)."
    if (d.email.trim() && !validEmail(d.email)) e.email = "Adresse e-mail invalide."
    if (pro && d.siren.trim() && !sirenOf(d.siren)) e.siren = "SIREN (9 chiffres) ou SIRET (14 chiffres)."
    if (!edit && dupName && !dupName.fiche) { /* nom déjà vu dans un devis / appel : la fiche s'y rattache, pas de doublon */ }
    else if (!edit && dupName) e.nom_famille = e.societe = "Un client porte déjà ce nom : ouvrez sa fiche."
    setErrs(e)
    if (Object.keys(e).length) { navigator.vibrate?.(8); return }
    setBusy("save")
    const r = await saveClient(edit ? initial!.key : dupName && !dupName.fiche ? dupName.key : null, { ...d, kind: pro ? (cs.ext ? d.pro : "pro") : "particulier", telephone: ph, siren: pro ? sirenOf(d.siren) : "" })
    setBusy("")
    if (!r.ok) { toast(r.error); return }
    toast(edit ? "Modifications enregistrées" : `${displayName(d)} ajouté à vos clients`)
    onSaved?.(r.cle); onClose()
  }
  const linked = !!initial && (initial.devis.length + initial.factures.length + initial.chantiers.length + initial.calls.length + initial.events.length > 0)
  const canDelete = edit && !!initial?.fiche && !linked
  const del = async () => { if (!initial) return; setBusy("del"); const e = await deleteClient(initial.key); setBusy(""); if (e) { toast(e); return } toast(`${initial.name} supprimé`); setConfirmDel(false); onDeleted?.(initial.key); onClose() }
  const title = edit ? "Modifier" : "Nouveau client"

  return <ModalSheet label={title} onClose={onClose} desk={desk} z={z} size="large" escape={false} className="bg-[#161618]" deskClass="h-[86dvh] max-w-[480px]">
      <div className="relative flex h-[56px] shrink-0 items-center justify-center px-4">
        <button type="button" onClick={onClose} className="absolute left-4 text-[16px] text-white/55 active:text-white">Annuler</button>
        <span className="text-[17px] font-semibold">{title}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4" style={{ paddingBottom: 110 }}>
        <Seg id="cl-kind" label="Type de client" value={pro ? "pro" : "particulier"} options={[["particulier", "Particulier"], ["pro", "Professionnel"]]} onChange={v => set({ kind: v as Kind })} />
        <button type="button" onClick={() => void importContacts()} className="mx-auto mt-3 flex items-center gap-1.5 text-[14px] font-medium text-white/85 active:opacity-60"><UserRound size={15} strokeWidth={2} />Importer depuis les contacts</button>
        <input ref={vcf} type="file" accept=".vcf,text/vcard,text/x-vcard" className="hidden" aria-label="Fichier de contact (.vcf)" onChange={e => { void readVcf(e.target.files?.[0]); e.target.value = "" }} />

        <AnimatePresence initial={false}>{pro && <motion.div key="pro" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ height: SPRING, opacity: { duration: .15 } }} className="overflow-hidden">
          <Group className="mt-4"><Field label="Société" htmlFor="cf-soc" err={errs.societe}><input id="cf-soc" className={inp} autoComplete="off" autoCapitalize="words" placeholder="Raison sociale" maxLength={160} value={d.societe} onChange={e => set({ societe: e.target.value })} /></Field></Group>
          {cs.ext && <div className="mt-2.5 flex items-center gap-2 px-1"><span className="text-[13.5px] text-white/50">Type</span><Chips label="Type de professionnel" value={d.pro} options={[["pro", "Entreprise"], ["syndic", "Syndic"]]} onChange={v => set({ pro: v || "pro" })} /></div>}
        </motion.div>}</AnimatePresence>
        <Group className="mt-4">
          <Field label="Prénom" htmlFor="cf-fn"><input id="cf-fn" className={inp} autoComplete="off" autoCapitalize="words" placeholder={pro ? "Contact (facultatif)" : ""} maxLength={80} value={d.prenom} onChange={e => set({ prenom: e.target.value })} /></Field>
          <Field label="Nom" htmlFor="cf-ln" err={pro ? undefined : errs.nom_famille}><input id="cf-ln" className={inp} autoComplete="off" autoCapitalize="words" placeholder={pro ? "Facultatif" : ""} maxLength={80} value={d.nom_famille} onChange={e => set({ nom_famille: e.target.value })} /></Field>
        </Group>
        <Group className="mt-4">
          <Field label="Téléphone" htmlFor="cf-tel" err={errs.telephone}><input id="cf-tel" className={inp} type="tel" inputMode="tel" autoComplete="off" placeholder="06 12 34 56 78" maxLength={20} value={d.telephone} onChange={e => set({ telephone: e.target.value })} onBlur={() => { const p = frPhone(d.telephone); if (p) set({ telephone: p }) }} /></Field>
          <Field label="Email" htmlFor="cf-mail" err={errs.email}><input id="cf-mail" className={inp} type="email" inputMode="email" autoComplete="off" autoCapitalize="none" placeholder="Optionnel" maxLength={254} value={d.email} onChange={e => set({ email: e.target.value })} /></Field>
        </Group>
        <AnimatePresence initial={false}>{dup && <motion.div key="dup" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ height: SPRING, opacity: { duration: .15 } }} className="overflow-hidden">
          <div role="status" className="mt-2.5 flex items-center gap-3 rounded-[14px] bg-[#FF9F0A]/[.12] px-3.5 py-2.5 ring-1 ring-inset ring-[#FF9F0A]/25">
            <span className="min-w-0 flex-1 text-[13.5px] leading-[18px] text-white/85">{dupPhone ? <>Ce numéro est déjà celui de <b>{dupPhone.name}</b>.</> : dupName?.fiche ? <><b>{dupName.name}</b> est déjà dans vos clients.</> : <><b>{dupName!.name}</b> apparaît déjà dans vos devis ou appels : la fiche s'y rattachera.</>}</span>
            {onOpen && (dupPhone || dupName?.fiche) && <button type="button" onClick={() => { onClose(); onOpen((dupPhone || dupName)!.key) }} className="flex h-8 shrink-0 items-center gap-0.5 rounded-full bg-white px-3 text-[13px] font-semibold text-black">Ouvrir<ChevronRight size={14} /></button>}
          </div></motion.div>}</AnimatePresence>
        <Group className="mt-4">
          <Field label="Adresse" htmlFor="cf-addr"><input id="cf-addr" className={inp} autoComplete="off" role="combobox" aria-expanded={sug.length > 0} aria-controls="cf-addr-list" placeholder="Rue, ville…" maxLength={240} value={d.adresse} onFocus={() => setAddrFocus(true)} onBlur={() => setTimeout(() => setAddrFocus(false), 180)} onChange={e => set({ adresse: e.target.value, lat: null, lng: null, ville: "" })} /></Field>
          <SuggestPop show={sug.length > 0} id="cf-addr-list" label="Suggestions d'adresse">
            <ul>
            {sug.map(p => { const top = p.name || p.label.split(/\s\d{5}\s/)[0], [a, b, c] = boldMatch(top, d.adresse), bottom = [p.postcode, p.city].filter(Boolean).join(" ") + (p.label.includes(",") ? "" : ""); return <li key={p.label} role="option" aria-selected={false}>
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => pick(p)} className="eq-sep flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-white/[.05]">
                <MapPin size={16} className="shrink-0 text-white/45" /><span className="min-w-0 flex-1"><span className="block truncate text-[15px] text-white/70">{a}<b className="font-semibold text-white">{b}</b>{c}</span><span className="block truncate text-[12.5px] text-white/45">{bottom || p.label}</span></span>
              </button></li> })}
            </ul>
          </SuggestPop>
        </Group>
        <Group className="mt-4"><div className="eq-sep flex gap-3 pl-4"><label htmlFor="cf-notes" className="w-[100px] shrink-0 pt-[15px] text-[16px] text-white/50">Notes</label>
          <textarea id="cf-notes" rows={2} className="min-h-[52px] w-full min-w-0 resize-none bg-transparent py-[14px] pr-4 text-[16px] leading-[22px] text-white outline-none caret-[#30D158] placeholder:text-white/28" placeholder="Code portail, étage, accès…" maxLength={4000} value={d.notes} onChange={e => { set({ notes: e.target.value }); e.target.style.height = "auto"; e.target.style.height = `${Math.min(180, e.target.scrollHeight)}px` }} /></div></Group>
        <AnimatePresence initial={false}>{pro && <motion.div key="siren" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
          <Group className="mt-4"><Field label="SIREN" htmlFor="cf-siren" err={errs.siren}><input id="cf-siren" className={inp} inputMode="numeric" autoComplete="off" placeholder="SIREN ou SIRET (optionnel)" maxLength={20} value={d.siren} onChange={e => set({ siren: e.target.value })} /></Field></Group>
        </motion.div>}</AnimatePresence>
        {cs.ext ? <><div className="mb-2 mt-5 px-1 text-[13.5px] text-white/50">Origine du contact</div><Chips label="Origine du contact" value={d.origine} options={ORIGINS} onChange={v => set({ origine: v })} /></>
          : <p className="mt-5 px-1 text-[12.5px] leading-[18px] text-white/35">Type syndic, origine du contact et position de l'adresse arrivent avec la migration 20261121_13 (voir LISEZMOI update66).</p>}
        {canDelete && <button type="button" onClick={() => setConfirmDel(true)} className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-white/[.07] text-[16px] font-medium text-[#FF6B6B] active:bg-white/[.1]"><Trash2 size={17} />Supprimer le client</button>}
        {edit && !canDelete && linked && <p className="mt-6 px-1 text-center text-[12.5px] leading-[18px] text-white/35">Ce client a des devis, factures, chantiers ou appels : sa fiche ne peut pas être supprimée.</p>}
      </div>
      <div className="kb-hide pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#161618] via-[#161618]/95 to-transparent px-4 pt-6" style={{ paddingBottom: desk ? 18 : "max(calc(var(--sab) + 6px), 18px)" }}>
        <motion.button type="button" whileTap={{ scale: .98 }} disabled={!!busy} onClick={() => void save()} className="pointer-events-auto flex h-[54px] w-full items-center justify-center rounded-full bg-white text-[17px] font-semibold text-black shadow-[0_8px_24px_-8px_rgba(255,255,255,.25)] disabled:opacity-60">
          {busy === "save" ? <Loader2 size={20} className="animate-spin" /> : edit ? "Enregistrer" : "Ajouter le client"}</motion.button>
      </div>
      <AnimatePresence>{confirmDel && initial && <motion.div className="absolute inset-0 z-10 flex items-end bg-black/55" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setConfirmDel(false)}>
        <motion.div role="alertdialog" aria-label="Supprimer le client" onClick={e => e.stopPropagation()} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={SPRING} className="w-full p-3" style={{ paddingBottom: "max(calc(var(--sab) + 4px), 14px)" }}>
          <div className="overflow-hidden rounded-[16px] bg-[#2A2A2D] text-center"><p className="px-6 py-4 text-[13.5px] leading-5 text-white/60">Supprimer la fiche de {initial.name} ? Ses coordonnées et notes seront effacées. Cette action est définitive.</p>
            <button type="button" disabled={!!busy} onClick={() => void del()} className="h-14 w-full border-t border-white/[.08] text-[18px] font-semibold text-[#FF453A] active:bg-white/[.05]">{busy === "del" ? "Suppression…" : `Supprimer ${initial.name}`}</button></div>
          <button type="button" onClick={() => setConfirmDel(false)} className="mt-2 h-14 w-full rounded-[16px] bg-[#2A2A2D] text-[18px] font-semibold text-[#7EA6FF]">Annuler</button>
        </motion.div></motion.div>}</AnimatePresence>
  </ModalSheet>
}
