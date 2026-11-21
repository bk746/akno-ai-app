/* update52 · Bibliothèque de prestations : gestion (Réglages / page Devis), formulaire, et palette d'ajout rapide dans l'éditeur. */
import { useEffect, useMemo, useRef, useState } from "react"
import { motion } from "motion/react"
import ModalSheet from "../sheet/ModalSheet"
import { Search, Plus, Check, Trash2, Clock, Package, Tag, Sparkles, CloudOff } from "lucide-react"
import { Sheet, Btn, useC } from "../ui"
import { CO } from "../../lib/devisDoc"
import { KIND_LABEL, UNITS, fmtE, fmtN, r2, type LineKind } from "../../lib/devisCalc"
import { addMany, deletePrestation, savePrestation, starterPack, usePrestations, type PrestaInput, type Prestation } from "../../lib/prestations"
import { useProfile } from "../../lib/profile"
import { NumField, Seg, Stepper, TEAL, TEAL_T, field } from "./fields"

export const tauxDef = (tarifsTaux?: number | null) => tarifsTaux ?? CO.taux ?? null
/** Prix HT d'une prestation (heures × taux pour la main-d'œuvre). */
export const prestaPrice = (p: Prestation | PrestaInput, taux: number | null) => p.type === "mo" ? r2((p.duree_h ?? 1) * (p.taux_horaire ?? taux ?? 0)) : p.prix_unitaire
export const prestaMeta = (p: Prestation | PrestaInput, taux: number | null) => p.type === "mo"
  ? `${fmtN(p.duree_h ?? 1)} h × ${p.taux_horaire ?? taux ?? 0 ? fmtE(p.taux_horaire ?? taux ?? 0).replace(",00 €", " €") : "taux à définir"}/h`
  : p.type === "fft" ? "prix fixe" : `${fmtE(p.prix_unitaire)} / ${p.unite}`
const KIND_ICON: Record<LineKind, any> = { mo: Clock, fo: Package, fft: Tag }

const blank = (tv?: number): PrestaInput => ({ libelle: "", description: "", categorie: "", type: "mo", unite: "h", duree_h: 1, taux_horaire: null, prix_unitaire: 0, tva: tv ?? null, cout_achat: null })

/** Formulaire de prestation (création, modification, ou « enregistrer cette ligne comme prestation »). */
export function PrestaForm({ initial, id, onDone, onCancel, title }: { initial?: Partial<PrestaInput>; id?: string; onDone: (p?: Prestation) => void; onCancel: () => void; title?: string }) {
  const { s } = useC(), lib = usePrestations(), taux = tauxDef(s.settings.tarifs?.tauxHoraire)
  const [v, setV] = useState<PrestaInput>({ ...blank(), ...initial } as PrestaInput), [busy, setBusy] = useState(false), [err, setErr] = useState("")
  const up = (p: Partial<PrestaInput>) => { setV(x => ({ ...x, ...p })); setErr("") }
  const setType = (t: LineKind) => up({ type: t, unite: t === "mo" ? "h" : t === "fft" ? "forfait" : v.unite === "h" || v.unite === "forfait" ? "u" : v.unite, duree_h: t === "mo" ? v.duree_h ?? 1 : v.duree_h })
  const cats = [...new Set(lib.items.map(x => x.categorie).filter(Boolean))]
  const price = prestaPrice(v, taux), marge = v.cout_achat != null && v.type !== "mo" ? r2(price - v.cout_achat) : null
  const save = async () => {
    if (!v.libelle.trim()) { setErr("Donnez un nom à la prestation."); return }
    if (v.type !== "mo" && !(v.prix_unitaire >= 0)) { setErr("Indiquez un prix."); return }
    setBusy(true)
    const r = await savePrestation(id || null, v)
    setBusy(false)
    if (!r.ok) { setErr(r.error); return }
    onDone(r.item)
  }
  const del = async () => { if (!id || !confirm(`Supprimer « ${v.libelle} » de vos prestations ?`)) return; setBusy(true); const r = await deletePrestation(id); setBusy(false); if (!r.ok) { setErr(r.error); return } onDone() }
  const L = ({ children }: any) => <span className="mb-1.5 block px-0.5 text-[12.5px] text-white/50">{children}</span>
  return <Sheet title={title || (id ? "Modifier la prestation" : "Nouvelle prestation")} sub={id ? v.categorie || "Bibliothèque" : "Réutilisable dans tous vos devis"} c={TEAL} onClose={onCancel}
    footer={<div className="flex gap-2">{id ? <Btn aria-label="Supprimer la prestation" disabled={busy} onClick={del} className="!px-4"><Trash2 size={16} strokeWidth={1.6} /></Btn> : <Btn disabled={busy} onClick={onCancel} className="flex-1">Annuler</Btn>}<Btn primary c={TEAL} disabled={busy} className="flex-[1.6]" onClick={save}>{busy ? "Enregistrement…" : id ? "Enregistrer" : "Ajouter à mes prestations"}</Btn></div>}>
    <div className="space-y-4">
      <label className="block"><L>Libellé</L><input autoFocus className={field + " !h-11 text-[15px]"} placeholder="Ex. Pose de ballon d'eau chaude" value={v.libelle} maxLength={200} onChange={e => up({ libelle: e.target.value })} /></label>
      <label className="block"><L>Description <span className="text-white/30">· facultatif, imprimée sous le libellé</span></L><textarea className={field + " !h-20 resize-none py-2.5 leading-5"} placeholder="Détail des travaux compris" value={v.description} maxLength={1000} onChange={e => up({ description: e.target.value })} /></label>
      <div><L>Type</L><Seg label="Type de prestation" value={v.type} onChange={setType} opts={[["mo", "À l'heure"], ["fo", "Fourniture"], ["fft", "Forfait"]]} /></div>
      {v.type === "mo" ? <div className="grid grid-cols-2 gap-3">
        <div><L>Durée par défaut</L><Stepper big value={v.duree_h ?? 1} onChange={n => up({ duree_h: n })} suffix="h" ariaLabel="Durée en heures" /></div>
        <div><L>Taux horaire HT</L><NumField value={v.taux_horaire} onChange={n => up({ taux_horaire: n })} suffix="€/h" ariaLabel="Taux horaire" placeholder={taux != null ? `${fmtN(taux)} (réglages)` : "Ex. 55"} inputClass="!h-11" /></div>
      </div> : <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3">
        <div><L>{v.type === "fft" ? "Prix du forfait HT" : "Prix unitaire HT"}</L><NumField value={v.prix_unitaire} onChange={n => up({ prix_unitaire: n ?? 0 })} suffix="€" ariaLabel="Prix unitaire HT" inputClass="!h-11" /></div>
        <label className="block"><L>Unité</L><select className={field + " !h-11"} value={v.unite} disabled={v.type === "fft"} onChange={e => up({ unite: e.target.value })}>{UNITS.filter(u => u !== "h").map(u => <option key={u} value={u}>{u}</option>)}</select></label>
      </div>}
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><L>Catégorie</L><input list="akno-presta-cats" className={field + " !h-11"} placeholder="Ex. Plomberie" value={v.categorie} maxLength={60} onChange={e => up({ categorie: e.target.value })} /><datalist id="akno-presta-cats">{cats.map(c => <option key={c} value={c} />)}</datalist></label>
        <div><L>Coût d'achat HT <span className="text-white/30">· facultatif</span></L><NumField value={v.cout_achat} onChange={n => up({ cout_achat: n })} suffix={v.type === "mo" ? "€/h" : "€"} ariaLabel="Coût d'achat" placeholder="Pour la marge" inputClass="!h-11" /></div>
      </div>
      <div><L>TVA</L><Seg label="Taux de TVA" value={v.tva == null ? "def" : String(v.tva)} onChange={x => up({ tva: x === "def" ? null : Number(x) })} opts={[["def", `Par défaut (${fmtN(s.settings.tva)} %)`], ["5.5", "5,5 %"], ["10", "10 %"], ["20", "20 %"]]} /></div>
      <div className="flex items-center justify-between rounded-[14px] border border-white/[.06] bg-white/[.03] px-4 py-3 text-[13.5px]">
        <span className="text-white/55">{v.type === "mo" ? `${fmtN(v.duree_h ?? 1)} h × ${fmtN(v.taux_horaire ?? taux ?? 0)} €/h` : v.type === "fft" ? "Forfait" : `Par ${v.unite}`}{marge != null && <span className="ml-2 text-white/35">· marge {fmtE(marge)}</span>}</span>
        <span className="font-semibold tabular-nums text-white">{fmtE(price)} HT</span>
      </div>
      {v.type === "mo" && v.taux_horaire == null && taux == null && <p className="px-1 text-[12.5px] text-[#FFB340]">Aucun taux horaire dans vos réglages : indiquez-en un ici.</p>}
      {err && <div role="alert" className="rounded-[14px] bg-[#FF453A]/12 px-4 py-3 text-[13px] text-[#FF9B96]">{err}</div>}
    </div>
  </Sheet>
}

function StorageNote({ mode }: { mode: "db" | "local" }) {
  if (mode !== "local") return null
  return <div className="mb-4 flex items-start gap-2.5 rounded-[14px] border border-white/[.06] bg-white/[.03] px-3.5 py-3 text-[12.5px] leading-5 text-white/55"><CloudOff size={15} strokeWidth={1.6} className="mt-0.5 shrink-0 text-white/40" />Vos prestations sont gardées sur cet appareil pour l'instant. Elles passeront automatiquement sur votre compte dès la mise à jour de la base.</div>
}

/** Gestion de la bibliothèque (Réglages → Devis, et page Devis). */
export function PrestationsSheet({ close }: { close: () => void }) {
  const { s, toast } = useC(), lib = usePrestations(), taux = tauxDef(s.settings.tarifs?.tauxHoraire), [q, setQ] = useState(""), [edit, setEdit] = useState<Prestation | "new" | null>(null), [busy, setBusy] = useState(false)
  const prof = useProfile()
  const list = lib.items.filter(x => !q || `${x.libelle} ${x.description} ${x.categorie}`.toLowerCase().includes(q.toLowerCase()))
  const groups = useMemo(() => { const g = new Map<string, Prestation[]>(); list.forEach(x => { const k = x.categorie || "Sans catégorie"; g.set(k, [...(g.get(k) || []), x]) }); return [...g.entries()] }, [list])
  const metier = String(prof.p?.entreprise_metier || "")
  const starter = async () => {
    setBusy(true)
    const dep = s.settings.tarifs?.deplacement
    const r = await addMany(starterPack(metier).map(x => x.libelle === "Déplacement" && dep != null ? { ...x, prix_unitaire: dep } : x))
    setBusy(false)
    if (!r.ok) toast(r.error); else toast("Prestations types ajoutées · ajustez les prix")
  }
  if (edit) return <PrestaForm id={edit === "new" ? undefined : edit.id} initial={edit === "new" ? { tva: null } : edit} onCancel={() => setEdit(null)} onDone={() => { setEdit(null); toast(edit === "new" ? "Prestation ajoutée" : "Prestation enregistrée") }} />
  return <Sheet title="Mes prestations" sub={lib.ready ? `${lib.items.length} prestation${lib.items.length > 1 ? "s" : ""} enregistrée${lib.items.length > 1 ? "s" : ""}` : "Chargement…"} c={TEAL} onClose={close}
    footer={<Btn primary c={TEAL} className="w-full" onClick={() => setEdit("new")}><Plus size={17} />Nouvelle prestation</Btn>}>
    <StorageNote mode={lib.mode} />
    {lib.error && <div role="alert" className="mb-4 rounded-[14px] bg-[#FF453A]/12 px-4 py-3 text-[13px] text-[#FF9B96]">{lib.error}</div>}
    {lib.items.length > 0 && <div className="relative mb-4"><Search size={16} strokeWidth={1.6} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher une prestation" aria-label="Rechercher une prestation" className={field + " !h-11 pl-10"} /></div>}
    {lib.ready && !lib.items.length && <div className="rounded-[20px] border border-white/[.06] bg-white/[.02] px-5 py-6 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full" style={{ background: TEAL + "26", color: TEAL_T }}><Package size={20} strokeWidth={1.6} /></div>
      <div className="mt-3 text-[15px] font-medium">Vos prestations, prêtes à chiffrer</div>
      <p className="mx-auto mt-1.5 max-w-[320px] text-[13px] leading-5 text-white/50">Enregistrez une fois vos tâches, fournitures et forfaits avec leurs heures et leurs prix. Ils s'ajoutent ensuite à un devis en un clic.</p>
      <Btn disabled={busy} onClick={starter} className="mx-auto mt-4 !h-10 text-[14px]"><Sparkles size={15} strokeWidth={1.6} />{busy ? "Ajout…" : "Partir de prestations types"}</Btn>
    </div>}
    <div className="space-y-5">{groups.map(([g, xs]) => <div key={g}>
      <div className="mb-2 flex items-baseline justify-between px-1"><span className="text-[13px] font-semibold text-white/60">{g}</span><span className="text-[12px] text-white/30">{xs.length}</span></div>
      <div className="overflow-hidden rounded-[18px] border border-white/[.06] bg-white/[.02]">{xs.map((x, i) => { const I = KIND_ICON[x.type]; return <button key={x.id} type="button" onClick={() => setEdit(x)} className={`flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-white/[.04] ${i ? "border-t border-white/[.05]" : ""}`}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[.06] text-white/55"><I size={15} strokeWidth={1.7} /></span>
        <span className="min-w-0 flex-1"><span className="block truncate text-[14.5px] font-medium">{x.libelle}</span><span className="block truncate text-[12.5px] text-white/45">{KIND_LABEL[x.type]} · {prestaMeta(x, taux)}</span></span>
        <span className="shrink-0 text-[14px] font-medium tabular-nums text-white/85">{fmtE(prestaPrice(x, taux))}</span>
      </button> })}</div>
    </div>)}</div>
    {lib.items.length > 0 && !list.length && <p className="py-8 text-center text-[13.5px] text-white/45">Aucune prestation ne correspond.</p>}
  </Sheet>
}

/** Palette d'ajout rapide (⌘K) : recherche, flèches, Entrée pour ajouter, reste ouverte pour enchaîner. */
export function PrestaPicker({ onPick, onClose, onNew, desk }: { onPick: (p: Prestation) => void; onClose: () => void; onNew: () => void; desk: boolean }) {
  const { s } = useC(), lib = usePrestations(), taux = tauxDef(s.settings.tarifs?.tauxHoraire)
  const [q, setQ] = useState(""), [cat, setCat] = useState(""), [sel, setSel] = useState(0), [flash, setFlash] = useState<string | null>(null), inp = useRef<HTMLInputElement>(null), listRef = useRef<HTMLDivElement>(null)
  const cats = [...new Set(lib.items.map(x => x.categorie).filter(Boolean))]
  const words = q.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/).filter(Boolean)
  const list = lib.items.filter(x => (!cat || x.categorie === cat) && words.every(w => `${x.libelle} ${x.description} ${x.categorie}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(w)))
  useEffect(() => { setSel(0) }, [q, cat])
  useEffect(() => { listRef.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" }) }, [sel])
  const pick = (p: Prestation) => { onPick(p); setFlash(p.id); setTimeout(() => setFlash(f => f === p.id ? null : f), 900); inp.current?.focus() }
  const key = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel(i => Math.min(list.length - 1, i + 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel(i => Math.max(0, i - 1)) }
    else if (e.key === "Enter") { e.preventDefault(); const p = list[sel]; if (p) pick(p) }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose() }
  }
  return <ModalSheet label="Ajouter une prestation" onClose={onClose} desk={desk} z={50} deskAlign="top" backdrop="bg-black/60" className={`border-white/[.09] bg-[#121214] ${desk ? "" : "h-[86dvh] border-t"}`} deskClass="max-h-[70vh] max-w-[620px]">
      {!desk && <div className="h-[22px] shrink-0" />}
      <div className="flex shrink-0 items-center gap-3 border-b border-white/[.07] px-4 py-3">
        <Search size={18} strokeWidth={1.7} className="shrink-0 text-white/40" />
        <input ref={inp} autoFocus value={q} onChange={e => setQ(e.target.value)} onKeyDown={key} placeholder="Rechercher une prestation…" aria-label="Rechercher une prestation" className="h-10 min-w-0 flex-1 bg-transparent text-[16px] text-white outline-none placeholder:text-white/35" />
        <button type="button" onClick={onClose} className="shrink-0 rounded-full bg-white/[.07] px-3 py-1.5 text-[12.5px] font-medium text-white/70 hover:text-white">{desk ? "Échap" : "Fermer"}</button>
      </div>
      {cats.length > 1 && <div className="flex shrink-0 gap-1.5 overflow-x-auto px-4 py-2.5 [scrollbar-width:none]">{["", ...cats].map(c => <button key={c || "all"} type="button" onClick={() => setCat(c)} className={`h-7 shrink-0 rounded-full px-3 text-[12.5px] font-medium transition-colors ${cat === c ? "bg-white text-black" : "bg-white/[.06] text-white/60 hover:text-white"}`}>{c || "Toutes"}</button>)}</div>}
      <StorageNoteInline mode={lib.mode} />
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {list.map((x, i) => { const I = KIND_ICON[x.type], on = i === sel, ok = flash === x.id; return <button key={x.id} data-i={i} type="button" onMouseMove={() => setSel(i)} onClick={() => pick(x)} className={`flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors ${on ? "bg-white/[.07]" : ""}`}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[.06] text-white/55"><I size={15} strokeWidth={1.7} /></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-[14.5px] font-medium">{x.libelle}</span><span className="block truncate text-[12.5px] text-white/45">{x.categorie ? `${x.categorie} · ` : ""}{prestaMeta(x, taux)}</span></span>
          <span className="shrink-0 text-[14px] tabular-nums text-white/80">{fmtE(prestaPrice(x, taux))}</span>
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${ok ? "text-black" : on ? "bg-white/[.08] text-white/70" : "text-white/25"}`} style={ok ? { background: TEAL_T } : {}}>{ok ? <Check size={15} strokeWidth={2.4} /> : <Plus size={15} strokeWidth={2} />}</span>
        </button> })}
        {lib.ready && !list.length && <div className="px-4 py-10 text-center text-[13.5px] text-white/45">{lib.items.length ? "Aucune prestation ne correspond." : "Votre bibliothèque est vide."}<div className="mt-3"><button type="button" onClick={onNew} className="text-[13.5px] font-medium" style={{ color: TEAL_T }}>Créer une prestation{q ? ` « ${q} »` : ""}</button></div></div>}
      </div>
      <div className="flex shrink-0 items-center justify-between border-t border-white/[.07] px-4 py-2.5 text-[12px] text-white/40" style={desk ? {} : { paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        {desk ? <span>↑ ↓ pour choisir · Entrée pour ajouter · la palette reste ouverte</span> : <span>Touchez pour ajouter</span>}
        <button type="button" onClick={onNew} className="flex items-center gap-1 font-medium text-white/70 hover:text-white"><Plus size={14} />Nouvelle</button>
      </div>
  </ModalSheet>
}
const StorageNoteInline = ({ mode }: { mode: "db" | "local" }) => mode === "local" ? <div className="mx-4 mb-1 flex items-center gap-2 text-[11.5px] text-white/35"><CloudOff size={12} />Bibliothèque gardée sur cet appareil</div> : null
