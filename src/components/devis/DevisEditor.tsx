/* update52 · Éditeur de devis pro (desktop et mobile).
   - lignes depuis la bibliothèque (⌘K) ou libres ; main-d'œuvre : heures × taux recalculés instantanément
   - sections, réorganisation (glisser ou Alt+↑/↓), remise % ou €, TVA par taux, acompte, marge
   - brouillon enregistré automatiquement en base (indicateur « Enregistré »), copie de secours sur l'appareil
   - aucune disparition silencieuse : toute erreur d'enregistrement est affichée en français */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, Reorder, useDragControls } from "motion/react"
import { X, Plus, GripVertical, MoreHorizontal, Copy, ArrowUp, ArrowDown, Trash2, BookmarkPlus, Clock, Package, Tag, Layers, Eye, Send, Check, AlertCircle, Loader2, Search, ChevronDown, AlignLeft, Download, User, MapPin } from "lucide-react"
import { useC } from "../ui"
import DevisPaper from "../DevisPaper"
import { CO, buildDoc, missingLegal } from "../../lib/devisDoc"
import { KIND_LABEL, KIND_SHORT, TVA_RATES, UNITS, acompteFrom, computeTotals, fmtE, fmtN, fromStored, lid, r2, toStored, withAcompte, type DevisMeta, type EdLine, type LineKind } from "../../lib/devisCalc"
import { dropLocal, keepLocal, nextDevisNum, readLocal, saveDevis } from "../../lib/devisSave"
import type { Devis } from "../../lib/store"
import type { Prestation } from "../../lib/prestations"
import { NumField, Seg, Stepper, Menu, MenuItem, MenuSep, Kbd, isMac, TEAL, TEAL_T, field } from "./fields"
import { PrestaForm, PrestaPicker, tauxDef } from "./Prestations"

export type EditorReq = { initial?: Devis; prefill?: { client?: string; objet?: string; amount?: number; phone?: string; addr?: string; email?: string } }
export type CtInfo = { name: string; phone?: string; email?: string; addr?: string }
type Doc = { client: string; email: string; phone: string; addr: string; objet: string; items: EdLine[]; meta: DevisMeta }
type SaveSt = "new" | "dirty" | "saving" | "saved" | "error"

const KIND_ICON: Record<LineKind, any> = { mo: Clock, fo: Package, fft: Tag }
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` }
const DEFAULT_COND = "Acompte de 30 % à la signature, solde à la fin des travaux."

export default function DevisEditor({ req, onClose, onSend, clients }: { req: EditorReq; onClose: () => void; onSend: (d: Devis) => void; clients: CtInfo[] }) {
  const { s, desk, toast, put } = useC()
  const tv0 = CO.tvaNA ? 0 : Number(s.settings.tva) || 10
  const taux = tauxDef(s.settings.tarifs?.tauxHoraire)
  const init = req.initial
  const localKey = init?.id || "new"
  const [base] = useState<Doc>(() => {
    const { items, meta } = fromStored(init?.lines, tv0, init ? { objet: init.objet, amount: init.amount } : undefined)
    const p = req.prefill || {}
    const conditions = meta.conditions || CO.conditions || DEFAULT_COND
    const fromCl = clients.find(c => c.name.toLowerCase() === String(init?.client || p.client || "").toLowerCase())
    if (!init && p.amount && !items.length) items.push({ id: lid(), k: "fft", l: p.objet || "Travaux", d: "", q: 1, u: "forfait", pu: r2(Number(p.amount)), tv: tv0 })
    return { client: init?.client || p.client || "", email: init?.email || p.email || fromCl?.email || "", phone: init?.phone || p.phone || fromCl?.phone || "", addr: init?.addr || p.addr || fromCl?.addr || "", objet: init?.objet || p.objet || "",
      items, meta: { ...meta, v: 2, conditions, validite: meta.validite || CO.validite || 30, acompte: meta.acompte ?? acompteFrom(conditions) ?? 30 } }
  })
  // Modifications non enregistrées d'une session précédente (coupure réseau…) : reprises automatiquement
  const [doc, setDoc] = useState<Doc>(() => { const r = init ? readLocal<Doc>(localKey) : null; return r && Array.isArray(r.items) ? r : base })
  const [restoreNew, setRestoreNew] = useState(() => { const r = !init ? readLocal<Doc>("new") : null; return r && Array.isArray(r.items) && (r.client || r.items.length) ? r : null })
  const [id, setId] = useState<string | null>(init?.id && /^[0-9a-f-]{36}$/i.test(init.id) ? init.id : null)
  const [num, setNum] = useState<number | null>(init?.num || null)
  const [st, setSt] = useState<SaveSt>(init ? "saved" : "new"), [err, setErr] = useState(""), [savedAt, setSavedAt] = useState<number | null>(null)
  const [picker, setPicker] = useState(false), [preview, setPreview] = useState(false), [form, setForm] = useState<{ initial: any } | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null), [condOpen, setCondOpen] = useState(false)
  const docRef = useRef(doc), idRef = useRef(id), numRef = useRef(num), saving = useRef<Promise<boolean> | null>(null), again = useRef(false), lastJson = useRef(init ? JSON.stringify(serialize(base)) : "")
  docRef.current = doc; idRef.current = id; numRef.current = num

  const T = useMemo(() => computeTotals(doc.items, doc.meta, { tvaNA: CO.tvaNA }), [doc.items, doc.meta])
  const canCreate = (d: Doc) => !!d.client.trim() && d.items.some(x => x.k !== "sec" && (x.l.trim() || x.q * x.pu))

  function serialize(d: Doc) { return { client: d.client, email: d.email, phone: d.phone, addr: d.addr, objet: d.objet, lines: toStored(d.items, d.meta) } }

  /* ---------- enregistrement ---------- */
  const saveNow = useCallback(async (): Promise<boolean> => {
    if (saving.current) { again.current = true; return saving.current }
    const run = (async () => {
      const d = docRef.current, ser = serialize(d), json = JSON.stringify(ser)
      if (json === lastJson.current && idRef.current) { setSt("saved"); return true }
      if (!idRef.current && !canCreate(d)) { setSt("new"); return false }
      setSt("saving")
      let n = numRef.current
      if (!n) { n = await nextDevisNum(s.devis.map(x => x.num)); setNum(n); numRef.current = n }
      const t = computeTotals(d.items, d.meta, { tvaNA: CO.tvaNA })
      const rates = t.rates.map(x => x.r)
      const r = await saveDevis(idRef.current, { num: n, client: d.client, email: d.email, phone: d.phone, addr: d.addr, objet: d.objet || d.items.find(x => x.k !== "sec" && x.l.trim())?.l || "Travaux", lines: ser.lines, ht: t.ht, ttc: t.ttc, tva: rates.length === 1 ? rates[0] : rates.includes(tv0) ? tv0 : rates[rates.length - 1] ?? tv0 })
      if (!r.ok) { setSt("error"); setErr(r.error); keepLocal(idRef.current || "new", d); return false }
      lastJson.current = json
      if (!idRef.current) { dropLocal("new") }
      dropLocal(r.devis.id)
      setId(r.devis.id); idRef.current = r.devis.id
      put?.(x => ({ ...x, devis: x.devis.some(y => y.id === r.devis.id) ? x.devis.map(y => y.id === r.devis.id ? { ...y, ...r.devis, created: y.created } : y) : [r.devis, ...x.devis] }))
      setErr(""); setSavedAt(Date.now())
      setSt(JSON.stringify(serialize(docRef.current)) === json ? "saved" : "dirty")
      return true
    })()
    saving.current = run
    const ok = await run
    saving.current = null
    if (again.current) { again.current = false; return saveNow() }
    return ok
  }, [s.devis, put, tv0])

  // Autosave : 900 ms après la dernière modification
  useEffect(() => {
    const json = JSON.stringify(serialize(doc))
    if (json === lastJson.current) return
    if (!idRef.current && !canCreate(doc)) { setSt("new"); if (doc.client || doc.items.length) keepLocal("new", doc); return }
    setSt(x => x === "error" ? "error" : "dirty")
    keepLocal(idRef.current || "new", doc)
    const t = setTimeout(() => { void saveNow() }, 900)
    return () => clearTimeout(t)
  }, [doc, saveNow])

  const close = async () => {
    if (st === "dirty" || st === "saving" || st === "error") {
      const ok = await saveNow()
      if (!ok && (idRef.current || canCreate(docRef.current)) && !confirm(`Le devis n'est pas enregistré${err ? ` (${err})` : ""}.\nFermer quand même ? Le brouillon reste gardé sur cet appareil.`)) return
    } else if (st === "new" && (doc.client.trim() || doc.items.length) && !canCreate(doc)) {
      if (!confirm("Ce devis n'est pas encore enregistré : il faut un client et au moins une ligne.\nFermer quand même ? Le brouillon reste gardé sur cet appareil.")) return
    }
    onClose()
  }
  const send = async () => {
    if (!doc.client.trim()) { setErr("Indiquez le client avant d'envoyer."); setSt("error"); return }
    if (!doc.items.some(x => x.k !== "sec" && x.q * x.pu > 0)) { setErr("Ajoutez au moins une ligne chiffrée avant d'envoyer."); setSt("error"); return }
    const ok = await saveNow()
    if (!ok || !idRef.current) return
    const dv = s.devis.find(x => x.id === idRef.current)
    const ser = serialize(docRef.current)
    onSend({ ...(dv || { status: "brouillon", created: Date.now() } as Devis), id: idRef.current, num: numRef.current || 0, client: doc.client, objet: doc.objet || "Travaux", amount: T.ttc, lines: ser.lines, email: doc.email || undefined, phone: doc.phone || undefined, addr: doc.addr || undefined })
  }

  /* ---------- édition ---------- */
  const set = (p: Partial<Doc>) => setDoc(d => ({ ...d, ...p }))
  const setMeta = (p: Partial<DevisMeta>) => setDoc(d => ({ ...d, meta: { ...d.meta, ...p } }))
  const setItems = (f: (xs: EdLine[]) => EdLine[]) => setDoc(d => ({ ...d, items: f(d.items) }))
  const patch = (lineId: string, p: Partial<EdLine>) => setItems(xs => xs.map(x => x.id === lineId ? { ...x, ...p } : x))
  const focusLine = (lineId: string, sel = "[data-f=l]") => { setFocusId(lineId); requestAnimationFrame(() => requestAnimationFrame(() => (document.querySelector(`[data-line="${lineId}"] ${sel}`) as HTMLInputElement | null)?.focus())) }
  const newLine = (k: LineKind | "sec", after?: string): EdLine => k === "sec" ? { id: lid(), k, l: "", d: "", q: 0, u: "", pu: 0, tv: tv0 } : { id: lid(), k, l: "", d: "", q: 1, u: k === "mo" ? "h" : k === "fft" ? "forfait" : "u", pu: k === "mo" ? taux ?? 0 : 0, tv: tv0 }
  const insert = (x: EdLine, after?: string | null) => { setItems(xs => { const i = after ? xs.findIndex(y => y.id === after) : -1; return i < 0 ? [...xs, x] : [...xs.slice(0, i + 1), x, ...xs.slice(i + 1)] }); focusLine(x.id) }
  const addKind = (k: LineKind | "sec") => insert(newLine(k), focusId && doc.items.some(x => x.id === focusId) ? focusId : null)
  const fromPresta = (p: Prestation) => {
    const k = p.type, line: EdLine = { id: lid(), k, l: p.libelle, d: p.description || "", q: k === "mo" ? p.duree_h ?? 1 : 1, u: k === "mo" ? "h" : p.unite || (k === "fft" ? "forfait" : "u"), pu: k === "mo" ? p.taux_horaire ?? taux ?? 0 : p.prix_unitaire, tv: CO.tvaNA ? 0 : p.tva ?? tv0, pid: p.id, ...(p.cout_achat != null ? { ca: p.cout_achat } : {}) }
    setItems(xs => [...xs, line]); setFocusId(line.id)
  }
  const move = (lineId: string, dir: -1 | 1) => setItems(xs => { const i = xs.findIndex(x => x.id === lineId), j = i + dir; if (i < 0 || j < 0 || j >= xs.length) return xs; const c = [...xs];[c[i], c[j]] = [c[j], c[i]]; return c })
  const dup = (lineId: string) => { const x = doc.items.find(y => y.id === lineId); if (x) insert({ ...x, id: lid() }, lineId) }
  const remove = (lineId: string) => { const snap = doc.items; setItems(xs => xs.filter(x => x.id !== lineId)); toast("Ligne supprimée", () => setDoc(d => ({ ...d, items: snap }))) }
  const asPresta = (x: EdLine) => setForm({ initial: { libelle: x.l, description: x.d, type: x.k === "sec" ? "fo" : x.k, unite: x.u, duree_h: x.k === "mo" ? x.q : null, taux_horaire: x.k === "mo" ? (x.pu === taux ? null : x.pu) : null, prix_unitaire: x.k === "mo" ? 0 : x.pu, tva: x.tv === tv0 ? null : x.tv, cout_achat: x.ca ?? null, categorie: "" } })

  /* ---------- raccourcis clavier (desktop) ---------- */
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (form || picker) return
      if (preview) { if (e.key === "Escape") { e.preventDefault(); setPreview(false) } return }
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); setPicker(true) }
      else if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); void saveNow() }
      else if (mod && e.key.toLowerCase() === "p") { e.preventDefault(); setPreview(true) }
      else if (mod && e.key === "Enter") { e.preventDefault(); const last = [...docRef.current.items].reverse().find(x => x.k !== "sec"); addKind(last && last.k !== "sec" ? last.k : "mo") }
      else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && focusId) { e.preventDefault(); move(focusId, e.key === "ArrowUp" ? -1 : 1); requestAnimationFrame(() => (document.activeElement as HTMLElement | null)?.scrollIntoView?.({ block: "nearest" })) }
      else if (e.key === "Escape") { const t = e.target as HTMLElement; if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) t.blur(); else { e.preventDefault(); void close() } }
    }
    addEventListener("keydown", f)
    return () => removeEventListener("keydown", f)
  })

  /* ---------- rendu ---------- */
  const mk = isMac() ? "⌘" : "Ctrl"
  const sub = (lineIdx: number) => { let t = 0; for (let i = lineIdx + 1; i < doc.items.length && doc.items[i].k !== "sec"; i++) t += r2(doc.items[i].q * doc.items[i].pu); return t }
  const missing = missingLegal("devis")
  const pdoc = () => buildDoc({ num: num || 0, objet: doc.objet || "Travaux", amount: T.ttc, client: doc.client || "Client", lines: serialize(doc).lines, addr: doc.addr, email: doc.email, phone: doc.phone }, undefined, tv0, today())

  const Status = () => <div className="flex items-center gap-1.5 text-[12.5px]" aria-live="polite">
    {st === "saving" ? <><Loader2 size={13} className="animate-spin text-white/45" /><span className="text-white/50">Enregistrement…</span></>
      : st === "saved" ? <><span className="flex h-4 w-4 items-center justify-center rounded-full" style={{ background: TEAL + "33", color: TEAL_T }}><Check size={10} strokeWidth={3} /></span><span className="text-white/55">Enregistré{savedAt ? ` · ${new Date(savedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}</span></>
      : st === "dirty" ? <><span className="h-1.5 w-1.5 rounded-full bg-[#FFB340]" /><span className="text-white/50">Modifications en cours</span></>
      : st === "error" ? <><AlertCircle size={13} className="text-[#FF7A72]" /><button type="button" onClick={() => void saveNow()} className="font-medium text-[#FF9B96] underline-offset-2 hover:underline">Non enregistré · Réessayer</button></>
      : <span className="text-white/40">{doc.client.trim() ? "Ajoutez une ligne pour enregistrer" : "Indiquez le client pour enregistrer"}</span>}
  </div>

  const header = <div className="flex shrink-0 items-center gap-3 border-b border-white/[.07] bg-black/80 px-4 backdrop-blur-xl lg:px-6" style={{ paddingTop: desk ? 0 : "var(--sat)", minHeight: desk ? 64 : undefined }}>
    <div className={`flex w-full items-center gap-3 ${desk ? "h-16" : "h-14"}`}>
      <button type="button" aria-label="Fermer l'éditeur" onClick={() => void close()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[.07] text-white/70 transition-colors hover:text-white"><X size={19} strokeWidth={1.75} /></button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2"><span className="truncate text-[16px] font-semibold tracking-[-0.02em]">{num ? `Devis N° ${num}` : "Nouveau devis"}</span>{doc.client.trim() && desk && <span className="truncate text-[14px] text-white/40">· {doc.client}</span>}</div>
        <Status />
      </div>
      {desk && <button type="button" onClick={() => setPreview(true)} className="flex h-10 items-center gap-2 rounded-full bg-white/[.07] px-4 text-[14px] font-medium text-white/85 transition-colors hover:bg-white/[.11]"><Eye size={16} strokeWidth={1.7} />Aperçu<Kbd>{mk} P</Kbd></button>}
      {desk && <button type="button" onClick={() => void send()} className="flex h-10 items-center gap-2 rounded-full px-5 text-[14px] font-semibold text-white transition-[filter] hover:brightness-110" style={{ background: TEAL }}><Send size={15} strokeWidth={1.9} />Valider et envoyer</button>}
      {!desk && <button type="button" aria-label="Aperçu du devis" onClick={() => setPreview(true)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[.07] text-white/80"><Eye size={18} strokeWidth={1.7} /></button>}
    </div>
  </div>

  const clientCard = <section className="rounded-[22px] border border-white/[.06] bg-[#0F0F11] p-4 lg:p-5">
    <div className="grid gap-3 lg:grid-cols-2">
      <ClientField value={doc.client} clients={clients} onChange={v => set({ client: v })} onPick={c => set({ client: c.name, email: c.email || doc.email, phone: c.phone || doc.phone, addr: c.addr || doc.addr })} />
      <Lbl t="Objet des travaux"><input className={field + " !h-11"} value={doc.objet} maxLength={160} placeholder="Ex. Rénovation de la salle de bain" onChange={e => set({ objet: e.target.value })} /></Lbl>
      <Lbl t="E-mail du client"><input type="email" inputMode="email" autoComplete="off" className={field + " !h-11"} value={doc.email} placeholder="Pour l'envoi du devis" onChange={e => set({ email: e.target.value })} /></Lbl>
      <Lbl t="Téléphone"><input type="tel" inputMode="tel" autoComplete="off" className={field + " !h-11"} value={doc.phone} placeholder="06 12 34 56 78" onChange={e => set({ phone: e.target.value })} /></Lbl>
      <Lbl t="Adresse du client"><input className={field + " !h-11"} value={doc.addr} placeholder="N°, rue, code postal, ville" onChange={e => set({ addr: e.target.value })} /></Lbl>
      <Lbl t={<span className="flex items-center justify-between">Adresse du chantier{!doc.meta.site && doc.addr && <span className="text-white/30">identique</span>}</span>}><input className={field + " !h-11"} value={doc.meta.site || ""} placeholder={doc.addr || "Si différente de celle du client"} onChange={e => setMeta({ site: e.target.value })} /></Lbl>
    </div>
  </section>

  const lineHead = desk && <div className="grid items-center gap-2 px-3 pb-2 text-[11.5px] font-medium text-white/35" style={{ gridTemplateColumns: COLS(CO.tvaNA) }}>
    <span /><span>Désignation</span><span className="text-center">Qté / heures</span><span className="text-center">Unité</span><span className="text-right">PU HT</span>{!CO.tvaNA && <span className="text-center">TVA</span>}<span className="text-right">Total HT</span><span />
  </div>

  const lines = <section>
    <div className="mb-3 flex items-end justify-between px-1">
      <div><h2 className="text-[17px] font-semibold tracking-[-0.02em]">Lignes du devis</h2><p className="mt-0.5 text-[12.5px] text-white/40">{doc.items.filter(x => x.k !== "sec").length ? `${doc.items.filter(x => x.k !== "sec").length} ligne${doc.items.filter(x => x.k !== "sec").length > 1 ? "s" : ""}` : "Ajoutez vos prestations ou des lignes libres"}</p></div>
      <button type="button" onClick={() => setPicker(true)} className="flex h-9 items-center gap-2 rounded-full bg-white/[.07] pl-3 pr-2 text-[13px] font-medium text-white/85 transition-colors hover:bg-white/[.11]"><Search size={14} strokeWidth={1.8} />Mes prestations{desk && <Kbd>{mk} K</Kbd>}</button>
    </div>
    {doc.items.length > 0 && lineHead}
    {doc.items.length > 0 ? <Reorder.Group axis="y" values={doc.items} onReorder={xs => setDoc(d => ({ ...d, items: xs as EdLine[] }))} className="space-y-2">
      {doc.items.map((x, i) => <LineRow key={x.id} x={x} desk={desk} focused={focusId === x.id} taux={taux} subtotal={x.k === "sec" ? sub(i) : 0} first={i === 0} last={i === doc.items.length - 1}
        onFocus={() => setFocusId(x.id)} onPatch={p => patch(x.id, p)} onMove={d => move(x.id, d)} onDup={() => dup(x.id)} onRemove={() => remove(x.id)} onSave={() => asPresta(x)} onEnter={() => addKind(x.k)} />)}
    </Reorder.Group>
      : <div className="rounded-[22px] border border-dashed border-white/[.1] px-6 py-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full" style={{ background: TEAL + "22", color: TEAL_T }}><Package size={21} strokeWidth={1.6} /></div>
        <div className="mt-3 text-[15.5px] font-medium">Commencez par vos prestations</div>
        <p className="mx-auto mt-1 max-w-[340px] text-[13px] leading-5 text-white/45">Ajoutez en un clic une tâche à l'heure, une fourniture ou un forfait déjà chiffré, ou saisissez une ligne libre.</p>
        <button type="button" onClick={() => setPicker(true)} className="mx-auto mt-4 flex h-10 items-center gap-2 rounded-full px-5 text-[14px] font-semibold text-white" style={{ background: TEAL }}><Search size={15} />Choisir une prestation</button>
      </div>}
    <div className="mt-3 flex flex-wrap gap-2">
      {([["mo", "Main-d'œuvre"], ["fo", "Fourniture"], ["fft", "Forfait"], ["sec", "Section"]] as [LineKind | "sec", string][]).map(([k, l]) => { const I = k === "sec" ? Layers : KIND_ICON[k]; return <button key={k} type="button" onClick={() => addKind(k)} className="flex h-9 items-center gap-1.5 rounded-full border border-white/[.08] px-3.5 text-[13px] font-medium text-white/70 transition-colors hover:border-white/[.16] hover:text-white"><Plus size={14} strokeWidth={2} className="text-white/40" /><I size={14} strokeWidth={1.7} />{l}</button> })}
    </div>
    {desk && <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 px-1 text-[12px] text-white/35"><span><Kbd>{mk} K</Kbd> prestations</span><span><Kbd>{mk} ↵</Kbd> nouvelle ligne</span><span><Kbd>Alt ↑↓</Kbd> déplacer</span><span><Kbd>{mk} S</Kbd> enregistrer</span><span><Kbd>{mk} P</Kbd> aperçu</span></div>}
  </section>

  const recap = <section className="rounded-[22px] border border-white/[.06] bg-[#0F0F11] p-5">
    <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Récapitulatif</h2>
    <div className="mt-4 space-y-2.5 text-[14px]">
      <Rw l={T.remise > 0 ? "Total HT avant remise" : "Total HT"} v={fmtE(T.brut)} />
      <div className="flex items-center justify-between gap-3">
        <span className="text-white/55">Remise</span>
        <div className="flex items-center gap-2"><Seg size="sm" label="Type de remise" value={doc.meta.remise?.t || "pct"} onChange={t => setMeta({ remise: { t, v: doc.meta.remise?.v || 0 } })} opts={[["pct", "%"], ["eur", "€"]]} />
          <NumField className="w-[92px]" inputClass="!h-8" value={doc.meta.remise?.v || null} placeholder="0" onChange={n => setMeta({ remise: { t: doc.meta.remise?.t || "pct", v: n || 0 } })} max={doc.meta.remise?.t === "eur" ? undefined : 100} ariaLabel="Montant de la remise" suffix={doc.meta.remise?.t === "eur" ? "€" : "%"} /></div>
      </div>
      {T.remise > 0 && <><Rw l="Remise" v={`− ${fmtE(T.remise)}`} /><Rw l="Total HT" v={fmtE(T.ht)} strong /></>}
      {CO.tvaNA ? <Rw l="TVA non applicable, art. 293 B du CGI" v="0,00 €" /> : T.rates.map(r => <Rw key={r.r} l={`TVA ${fmtN(r.r)} %`} hint={`sur ${fmtE(r.base)}`} v={fmtE(r.tva)} />)}
    </div>
    <div className="mt-4 flex items-baseline justify-between border-t border-white/[.07] pt-4"><span className="text-[14px] font-medium">Total TTC</span><motion.span key={T.ttc} initial={{ opacity: .4 }} animate={{ opacity: 1 }} className="text-[26px] font-semibold tabular-nums tracking-[-0.03em]">{fmtE(T.ttc)}</motion.span></div>
    <div className="mt-4 flex items-center justify-between gap-3 text-[14px]"><span className="text-white/55">Acompte à la signature</span><div className="flex items-center gap-2"><NumField className="w-[78px]" inputClass="!h-8" value={doc.meta.acompte ?? 30} max={100} onChange={n => setDoc(d => ({ ...d, meta: { ...d.meta, acompte: n ?? 0, conditions: withAcompte(d.meta.conditions || "", n ?? 0) } }))} ariaLabel="Pourcentage d'acompte" suffix="%" /><span className="w-[92px] text-right tabular-nums text-white/80">{fmtE(T.acompte)}</span></div></div>
    {T.marge != null && <div className="mt-3 flex items-center justify-between gap-3 rounded-[12px] bg-white/[.03] px-3 py-2 text-[13px]"><span className="min-w-0 text-white/45">Marge estimée<span className="block text-[11.5px] text-white/30">sur les coûts d'achat renseignés</span></span><span className="shrink-0 whitespace-nowrap tabular-nums text-white/75">{fmtE(T.marge)}{T.ht > 0 && <span className="ml-1.5 text-white/40">{Math.round(T.marge / T.ht * 100)} %</span>}</span></div>}
    <button type="button" onClick={() => setCondOpen(o => !o)} className="mt-4 flex w-full items-center justify-between border-t border-white/[.07] pt-4 text-left text-[13.5px]"><span><span className="text-white/80">Conditions</span><span className="ml-2 text-white/40">validité {doc.meta.validite || 30} j</span></span><ChevronDown size={16} className={`text-white/40 transition-transform ${condOpen ? "rotate-180" : ""}`} /></button>
    {condOpen && <div className="mt-3 space-y-3">
      <div className="flex items-center justify-between"><span className="text-[13px] text-white/55">Validité</span><Seg size="sm" label="Validité du devis" value={doc.meta.validite || 30} onChange={v => setMeta({ validite: v })} opts={[[15, "15 j"], [30, "30 j"], [60, "60 j"], [90, "90 j"]]} /></div>
      <Lbl t="Conditions de paiement"><textarea className={field + " !h-[72px] resize-none py-2 leading-5"} maxLength={300} value={doc.meta.conditions || ""} onChange={e => setMeta({ conditions: e.target.value, acompte: acompteFrom(e.target.value) ?? doc.meta.acompte })} /></Lbl>
      <Lbl t="Remarques pour le client"><textarea className={field + " !h-[72px] resize-none py-2 leading-5"} maxLength={1000} placeholder="Facultatif : accès, délais, précisions…" value={doc.meta.notes || ""} onChange={e => setMeta({ notes: e.target.value })} /></Lbl>
    </div>}
    {missing.length > 0 && <div className="mt-4 rounded-[14px] border border-[#FFB340]/25 bg-[#FFB340]/[.08] px-3.5 py-3 text-[12.5px] leading-5 text-white/75">Mentions obligatoires manquantes : {missing.join(", ")}. À compléter dans Réglages → Entreprise avant l'envoi.</div>}
  </section>

  return <motion.div className="fixed inset-0 z-[45] flex flex-col bg-black text-white" initial={{ opacity: 0, y: desk ? 0 : 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: desk ? 0 : 24 }} transition={{ type: "spring", stiffness: 360, damping: 34 }} role="dialog" aria-modal="true" aria-label={num ? `Devis N° ${num}` : "Nouveau devis"}>
    {header}
    {st === "error" && err && <div role="alert" className="flex shrink-0 items-center gap-3 border-b border-[#FF453A]/20 bg-[#FF453A]/10 px-4 py-2.5 text-[13px] text-[#FFB4AF] lg:px-6"><AlertCircle size={15} className="shrink-0" /><span className="flex-1">{err}</span><button type="button" onClick={() => void saveNow()} className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-[12.5px] font-semibold text-white hover:bg-white/15">Réessayer</button></div>}
    {restoreNew && st === "new" && !doc.client && !doc.items.length && <div className="flex shrink-0 items-center gap-3 border-b border-white/[.07] bg-white/[.03] px-4 py-2.5 text-[13px] text-white/70 lg:px-6"><span className="flex-1">Un devis non enregistré{restoreNew.client ? ` pour ${restoreNew.client}` : ""} a été gardé sur cet appareil.</span><button type="button" onClick={() => { setDoc(restoreNew); setRestoreNew(null) }} className="shrink-0 rounded-full bg-white px-3 py-1 text-[12.5px] font-semibold text-black">Reprendre</button><button type="button" onClick={() => { dropLocal("new"); setRestoreNew(null) }} className="shrink-0 text-[12.5px] text-white/45">Ignorer</button></div>}
    {desk ? <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-[1320px] grid-cols-[minmax(0,1fr)_360px] items-start gap-6 px-6 py-6">
        <div className="min-w-0 space-y-6">{clientCard}{lines}</div>
        <aside className="sticky top-6 space-y-4">{recap}
          <button type="button" onClick={() => setPreview(true)} className="group block w-full overflow-hidden rounded-[18px] border border-white/[.06] bg-[#0F0F11] p-3 text-left transition-colors hover:border-white/[.14]">
            <div className="pointer-events-none max-h-[150px] overflow-hidden rounded-[8px] opacity-90 [mask-image:linear-gradient(to_bottom,#000_60%,transparent)]"><DevisPaper d={pdoc()} /></div>
            <div className="mt-2 flex items-center justify-between px-1 text-[12.5px] text-white/50"><span>Rendu client</span><span className="text-white/70 group-hover:text-white">Ouvrir l'aperçu</span></div>
          </button>
        </aside>
      </div>
    </div> : <>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4" style={{ paddingBottom: "calc(96px + var(--sab))" }}>
        <div className="space-y-6">{clientCard}{lines}{recap}</div>
      </div>
      <div className="absolute inset-x-0 bottom-0 z-10 border-t border-white/[.08] bg-[#0B0B0C]/95 px-4 pt-3 backdrop-blur-xl" style={{ paddingBottom: "max(12px, var(--sab))" }}>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1"><div className="text-[11.5px] text-white/45">Total TTC{T.remise > 0 ? " · remise incluse" : ""}</div><div className="truncate text-[20px] font-semibold tabular-nums tracking-[-0.02em]">{fmtE(T.ttc)}</div></div>
          <button type="button" onClick={() => setPicker(true)} aria-label="Ajouter une prestation" className="flex h-12 w-12 items-center justify-center rounded-full bg-white/[.08] text-white"><Plus size={20} /></button>
          <button type="button" onClick={() => void send()} className="flex h-12 items-center gap-2 rounded-full px-5 text-[15px] font-semibold text-white" style={{ background: TEAL }}><Send size={16} />Envoyer</button>
        </div>
      </div>
    </>}

    <AnimatePresence>{picker && <PrestaPicker desk={desk} onClose={() => setPicker(false)} onPick={p => fromPresta(p)} onNew={() => { setPicker(false); setForm({ initial: {} }) }} />}</AnimatePresence>
    <AnimatePresence>{form && <PrestaForm initial={form.initial} title={form.initial?.libelle ? "Enregistrer comme prestation" : undefined} onCancel={() => setForm(null)} onDone={p => { setForm(null); if (p) { toast(`« ${p.libelle} » ajoutée à vos prestations`); if (!form.initial?.libelle) fromPresta(p) } }} />}</AnimatePresence>
    <AnimatePresence>{preview && <motion.div className="fixed inset-0 z-[55] flex flex-col bg-black/85 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPreview(false)}>
      <div className="flex shrink-0 items-center gap-3 px-4 py-3 lg:px-6" style={{ paddingTop: desk ? undefined : "calc(var(--sat) + 8px)" }} onClick={e => e.stopPropagation()}>
        <span className="flex-1 text-[15px] font-semibold">Aperçu · ce que reçoit le client</span>
        <button type="button" onClick={() => import("../../lib/devisPdf").then(m => { m.downloadPdf(pdoc()); toast(`Devis-${num || "brouillon"}.pdf téléchargé`) })} className="flex h-10 items-center gap-2 rounded-full bg-white/[.1] px-4 text-[14px] font-medium hover:bg-white/[.14]"><Download size={16} />PDF</button>
        <button type="button" aria-label="Fermer l'aperçu" onClick={() => setPreview(false)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[.1] hover:bg-white/[.14]"><X size={18} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-10 lg:px-6" onClick={e => e.stopPropagation()}><div className="mx-auto w-full max-w-[820px]"><DevisPaper d={pdoc()} /></div></div>
    </motion.div>}</AnimatePresence>
  </motion.div>
}

const COLS = (tvaNA: boolean) => tvaNA ? "20px minmax(0,1fr) 132px 84px 120px 116px 36px" : "20px minmax(0,1fr) 132px 84px 120px 84px 116px 36px"
const Lbl = ({ t, children }: { t: any; children: any }) => <label className="block min-w-0"><span className="mb-1.5 block px-0.5 text-[12.5px] text-white/45">{t}</span>{children}</label>
const Rw = ({ l, v, strong, hint }: { l: string; v: string; strong?: boolean; hint?: string }) => <div className="flex items-baseline justify-between gap-3"><span className={strong ? "font-medium text-white" : "text-white/55"}>{l}{hint && <span className="ml-1.5 text-[12px] text-white/30">{hint}</span>}</span><span className={`tabular-nums ${strong ? "font-medium text-white" : "text-white/85"}`}>{v}</span></div>

function ClientField({ value, clients, onChange, onPick }: { value: string; clients: CtInfo[]; onChange: (v: string) => void; onPick: (c: CtInfo) => void }) {
  const [open, setOpen] = useState(false), [sel, setSel] = useState(0)
  const q = value.trim().toLowerCase()
  const list = clients.filter(c => c.name && (!q || c.name.toLowerCase().includes(q) || (c.phone || "").replace(/\s/g, "").includes(q.replace(/\s/g, ""))) && c.name.toLowerCase() !== q).slice(0, 6)
  return <Lbl t="Client"><div className="relative">
    <User size={15} strokeWidth={1.7} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
    <input className={field + " !h-11 pl-9 text-[15px] font-medium"} value={value} placeholder="Nom du client ou choix dans vos contacts" autoComplete="off" role="combobox" aria-expanded={open && list.length > 0} aria-autocomplete="list"
      onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)} onChange={e => { onChange(e.target.value); setOpen(true); setSel(0) }}
      onKeyDown={e => { if (!open || !list.length) return; if (e.key === "ArrowDown") { e.preventDefault(); setSel(i => Math.min(list.length - 1, i + 1)) } else if (e.key === "ArrowUp") { e.preventDefault(); setSel(i => Math.max(0, i - 1)) } else if (e.key === "Enter") { e.preventDefault(); onPick(list[sel]); setOpen(false) } }} />
    {open && list.length > 0 && <div role="listbox" className="absolute inset-x-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-[16px] border border-white/[.1] bg-[#1A1A1D] p-1.5 shadow-[0_24px_60px_-12px_rgba(0,0,0,.95)]">
      {list.map((c, i) => <button key={c.name} type="button" role="option" aria-selected={i === sel} onMouseDown={e => { e.preventDefault(); onPick(c); setOpen(false) }} onMouseMove={() => setSel(i)} className={`flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left ${i === sel ? "bg-white/[.07]" : ""}`}>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[.08] text-[11px] font-semibold text-white/70">{c.name.replace(/^(M\.|Mme)\s*/, "").split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase()}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-[14px]">{c.name}</span>{(c.addr || c.phone) && <span className="flex items-center gap-1 truncate text-[12px] text-white/40">{c.addr ? <><MapPin size={11} />{c.addr}</> : c.phone}</span>}</span>
      </button>)}
    </div>}
  </div></Lbl>
}

function LineRow({ x, desk, focused, taux, subtotal, first, last, onFocus, onPatch, onMove, onDup, onRemove, onSave, onEnter }: { x: EdLine; desk: boolean; focused: boolean; taux: number | null; subtotal: number; first: boolean; last: boolean; onFocus: () => void; onPatch: (p: Partial<EdLine>) => void; onMove: (d: -1 | 1) => void; onDup: () => void; onRemove: () => void; onSave: () => void; onEnter: () => void }) {
  const controls = useDragControls(), [menu, setMenu] = useState(false), [desc, setDesc] = useState(!!x.d)
  const total = r2(x.q * x.pu)
  const setKind = (k: LineKind) => onPatch({ k, u: k === "mo" ? "h" : k === "fft" ? "forfait" : x.u === "h" || x.u === "forfait" ? "u" : x.u, ...(k === "mo" && !x.pu && taux ? { pu: taux } : {}) })
  const handle = <button type="button" aria-label="Déplacer la ligne" onPointerDown={e => { e.preventDefault(); controls.start(e) }} className="flex h-10 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-white/20 transition-colors hover:text-white/60 active:cursor-grabbing"><GripVertical size={16} /></button>
  const menuEl = <Menu open={menu} setOpen={setMenu} trigger={<button type="button" aria-label="Actions de la ligne" aria-haspopup="menu" onClick={() => setMenu(o => !o)} className={`flex h-9 w-9 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/[.07] hover:text-white ${menu ? "bg-white/[.07] text-white" : ""}`}><MoreHorizontal size={17} /></button>}>
    {x.k !== "sec" && <>{(["mo", "fo", "fft"] as LineKind[]).map(k => { const I = KIND_ICON[k]; return <MenuItem key={k} I={I} onClick={() => { setKind(k); setMenu(false) }} hint={x.k === k ? "✓" : undefined}>{KIND_LABEL[k]}{k === "mo" ? " à l'heure" : ""}</MenuItem> })}<MenuSep />
      {!desc && <MenuItem I={AlignLeft} onClick={() => { setDesc(true); setMenu(false) }}>Ajouter une description</MenuItem>}
      <MenuItem I={BookmarkPlus} onClick={() => { onSave(); setMenu(false) }}>Enregistrer comme prestation</MenuItem></>}
    <MenuItem I={Copy} onClick={() => { onDup(); setMenu(false) }}>Dupliquer</MenuItem>
    {!first && <MenuItem I={ArrowUp} hint="Alt ↑" onClick={() => { onMove(-1); setMenu(false) }}>Monter</MenuItem>}
    {!last && <MenuItem I={ArrowDown} hint="Alt ↓" onClick={() => { onMove(1); setMenu(false) }}>Descendre</MenuItem>}
    <MenuSep /><MenuItem I={Trash2} danger onClick={() => { setMenu(false); onRemove() }}>Supprimer</MenuItem>
  </Menu>
  const ring = focused ? "border-white/[.14] bg-[#141416]" : "border-white/[.06] bg-[#0F0F11]"

  if (x.k === "sec") return <Reorder.Item value={x} dragListener={false} dragControls={controls} data-line={x.id} onFocusCapture={onFocus} className="relative pt-3">
    <div className={`flex items-center gap-2 rounded-[16px] px-2 py-1 ${focused ? "bg-white/[.03]" : ""}`}>
      {handle}
      <span aria-hidden className="h-5 w-[3px] shrink-0 rounded-full" style={{ background: TEAL_T }} />
      <input data-f="l" value={x.l} maxLength={120} placeholder="Titre de section (ex. Salle de bain)" onChange={e => onPatch({ l: e.target.value })} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onEnter() } }} className="h-10 min-w-0 flex-1 bg-transparent text-[15.5px] font-semibold tracking-[-0.01em] text-white outline-none placeholder:font-normal placeholder:text-white/30" />
      {subtotal > 0 && <span className="shrink-0 text-[12.5px] tabular-nums text-white/40">Sous-total {fmtE(subtotal)}</span>}
      {menuEl}
    </div>
  </Reorder.Item>

  const I = KIND_ICON[x.k]
  const qtyEl = x.k === "mo" ? <Stepper big={!desk} value={x.q} onChange={q => onPatch({ q })} step={0.5} suffix="h" ariaLabel="Nombre d'heures" />
    : x.k === "fft" ? <Stepper big={!desk} value={x.q} onChange={q => onPatch({ q })} step={1} ariaLabel="Quantité" />
    : <Stepper big={!desk} value={x.q} onChange={q => onPatch({ q })} step={x.u === "u" || x.u === "lot" ? 1 : 0.5} ariaLabel="Quantité" />
  const unitEl = x.k === "mo" ? <div className="flex h-10 items-center justify-center text-[13px] text-white/40">heure</div>
    : <select aria-label="Unité" value={x.u} onChange={e => onPatch({ u: e.target.value })} className={field + " !px-2 text-center"}>{[...new Set([x.u, ...UNITS.filter(u => u !== "h")])].map(u => <option key={u} value={u}>{u}</option>)}</select>
  const puEl = <NumField value={x.pu} onChange={n => onPatch({ pu: n ?? 0 })} suffix={x.k === "mo" ? "€/h" : "€"} ariaLabel={x.k === "mo" ? "Taux horaire HT" : "Prix unitaire HT"} onEnter={onEnter} inputClass={!desk ? "!h-11" : ""} />
  const tvaEl = <select aria-label="TVA" value={x.tv} onChange={e => onPatch({ tv: Number(e.target.value) })} className={field + " !px-2 text-center"}>{TVA_RATES.map(r => <option key={r} value={r}>{fmtN(r)} %</option>)}</select>
  const label = <div className="min-w-0 flex-1">
    <input data-f="l" value={x.l} maxLength={280} placeholder={x.k === "mo" ? "Ex. Pose et raccordement" : x.k === "fft" ? "Ex. Mise en service" : "Ex. Mitigeur thermostatique"} onChange={e => onPatch({ l: e.target.value })} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onEnter() } }} className="h-10 w-full min-w-0 rounded-[10px] bg-transparent px-1.5 text-[14.5px] font-medium text-white outline-none transition-colors placeholder:font-normal placeholder:text-white/28 hover:bg-white/[.03] focus:bg-white/[.05]" />
    {desc && <textarea value={x.d} maxLength={1000} rows={Math.min(6, Math.max(1, x.d.split("\n").reduce((a, l) => a + Math.max(1, Math.ceil(l.length / (desk ? 64 : 38))), 0)))} style={{ fieldSizing: "content" } as any} placeholder="Description (imprimée sous la ligne)" onChange={e => onPatch({ d: e.target.value })} onBlur={() => { if (!x.d.trim()) setDesc(false) }} autoFocus={!x.d} className="mt-0.5 block w-full resize-none rounded-[10px] bg-transparent px-1.5 py-1 text-[13px] leading-5 text-white/60 outline-none placeholder:text-white/25 hover:bg-white/[.03] focus:bg-white/[.05]" />}
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 px-1.5 pt-0.5 text-[11.5px] text-white/35 [&>span]:whitespace-nowrap"><span className="flex items-center gap-1.5"><I size={11} strokeWidth={1.8} />{KIND_SHORT[x.k]}</span>{x.k === "mo" && <span>· {fmtN(x.q)} h × {fmtN(x.pu)} €/h</span>}{x.pid && <span>· bibliothèque</span>}{x.ca != null && x.pu > 0 && <span>· marge {fmtE(r2((x.pu - x.ca) * x.q))}</span>}</div>
  </div>

  if (desk) return <Reorder.Item value={x} dragListener={false} dragControls={controls} data-line={x.id} onFocusCapture={onFocus} className={`grid items-start gap-2 rounded-[16px] border px-3 py-2 transition-colors ${ring}`} style={{ gridTemplateColumns: COLS(CO.tvaNA) }}>
    {handle}{label}<div>{qtyEl}</div><div>{unitEl}</div><div>{puEl}</div>{!CO.tvaNA && <div>{tvaEl}</div>}
    <motion.div key={total} initial={{ opacity: .35 }} animate={{ opacity: 1 }} className="flex h-10 items-center justify-end text-[14.5px] font-semibold tabular-nums">{fmtE(total)}</motion.div>
    <div className="flex h-10 items-center justify-end">{menuEl}</div>
  </Reorder.Item>

  return <Reorder.Item value={x} dragListener={false} dragControls={controls} data-line={x.id} onFocusCapture={onFocus} className={`rounded-[18px] border p-3 transition-colors ${ring}`}>
    <div className="flex items-start gap-1">{handle}{label}{menuEl}</div>
    <div className="mt-2 grid grid-cols-[1fr_1fr] gap-2">
      <div><div className="mb-1 px-0.5 text-[11.5px] text-white/40">{x.k === "mo" ? "Heures" : "Quantité"}</div>{qtyEl}</div>
      <div><div className="mb-1 px-0.5 text-[11.5px] text-white/40">{x.k === "mo" ? "Taux horaire" : x.k === "fft" ? "Prix du forfait" : "Prix unitaire"}</div>{puEl}</div>
    </div>
    <div className="mt-2 flex items-center gap-2">
      {x.k === "fo" && <div className="w-[88px]">{unitEl}</div>}
      {!CO.tvaNA && <div className="w-[88px]">{tvaEl}</div>}
      <motion.div key={total} initial={{ opacity: .35 }} animate={{ opacity: 1 }} className="ml-auto text-right"><div className="text-[11px] text-white/35">Total HT</div><div className="text-[17px] font-semibold tabular-nums">{fmtE(total)}</div></motion.div>
    </div>
  </Reorder.Item>
}
