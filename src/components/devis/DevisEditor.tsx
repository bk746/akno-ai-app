/* update52 · Éditeur de devis pro (desktop et mobile).
   - lignes depuis la bibliothèque (⌘K) ou libres ; main-d'œuvre : heures × taux recalculés instantanément
   - sections, réorganisation (glisser ou Alt+↑/↓), remise % ou €, TVA par taux, acompte, marge
   - brouillon enregistré automatiquement en base (indicateur « Enregistré »), copie de secours sur l'appareil
   - aucune disparition silencieuse : toute erreur d'enregistrement est affichée en français
   update63 · refonte visuelle « iOS » : sections groupées (Client, Chantier, Prestations, Conditions), libellés en ligne,
   choix du client en feuille de recherche, coordonnées repliables, « Identique à l'adresse client », lignes en cartes
   (balayer pour supprimer), barre du bas compacte HT / TVA / TTC. Logique, champs, modèles et brouillons inchangés. */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, animate, motion, Reorder, useDragControls, useMotionValue, useReducedMotion, useTransform } from "motion/react"
import { X, Plus, GripVertical, MoreHorizontal, Copy, ArrowUp, ArrowDown, Trash2, BookmarkPlus, Clock, Package, Tag, Layers, Eye, Send, Check, AlertCircle, Loader2, Search, AlignLeft, Download, LayoutTemplate, Percent } from "lucide-react"
import { useC } from "../ui"
import DevisPaper from "../DevisPaper"
import { CO, buildDoc, missingLegal } from "../../lib/devisDoc"
import { KIND_LABEL, KIND_SHORT, TVA_RATES, UNITS, acompteFrom, computeTotals, fmtE, fmtN, fromStored, lid, lineDisc, lineGross, lineHT, r2, toStored, withAcompte, type DevisMeta, type EdLine, type LineKind } from "../../lib/devisCalc"
import { dropLocal, keepLocal, nextDevisNum, readLocal, saveDevis } from "../../lib/devisSave"
import type { Devis } from "../../lib/store"
import { usePrestations, type Prestation } from "../../lib/prestations"
import { NumField, Seg, Stepper, Menu, MenuItem, MenuSep, Kbd, isMac, TEAL, TEAL_T, field, ServiceLineCard } from "./fields"
import { PrestaForm, PrestaPicker, tauxDef } from "./Prestations"
import Modeles, { type Modele } from "./Modeles"
import { ClientRow, ContactSheet, DisclosureRow, IGroup, IRow, IToggleRow, Pill, Reveal, SuggestPop, ival } from "../form/grouped"
import { createPortal } from "react-dom"
import ModalSheet from "../sheet/ModalSheet"
import { askConfirm } from "../form/SwipeRow"

export type EditorReq = { initial?: Devis; prefill?: { client?: string; objet?: string; amount?: number; phone?: string; addr?: string; email?: string; parentId?: string } }
export type CtInfo = { name: string; phone?: string; email?: string; addr?: string }
type Doc = { client: string; email: string; phone: string; addr: string; objet: string; items: EdLine[]; meta: DevisMeta }
type SaveSt = "new" | "dirty" | "saving" | "saved" | "error"

const KIND_ICON: Record<LineKind, any> = { mo: Clock, fo: Package, fft: Tag }
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` }
const DEFAULT_COND = "Acompte de 30 % à la signature, solde à la fin des travaux."

export default function DevisEditor({ req, onClose, onSend, onCreateFacture, clients }: { req: EditorReq; onClose: () => void; onSend: (d: Devis) => void; onCreateFacture?: (d: Devis) => void | Promise<void>; clients: CtInfo[] }) {
  const { s, desk, toast, put } = useC()
  const footRef = useRef<HTMLDivElement>(null)
  const [footH, setFootH] = useState(168)
  useLayoutEffect(() => {
    const el = footRef.current
    if (!el) return
    const apply = () => setFootH(el.offsetHeight)
    const ro = new ResizeObserver(apply)
    ro.observe(el); apply()
    return () => ro.disconnect()
  }, [desk])
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
  const [modeles, setModeles] = useState(false) // update61 : modèles de devis
  const [picker, setPicker] = useState(false), [preview, setPreview] = useState(false), [form, setForm] = useState<{ initial: any } | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  // update63 · feuille de choix du client, coordonnées repliables, adresse de chantier distincte
  const [pickC, setPickC] = useState(false), [coordOpen, setCoordOpen] = useState(() => !(doc.client.trim() && (doc.email || doc.phone || doc.addr))), [offerSaveId, setOfferSaveId] = useState<string | null>(null)
  const [siteDiff, setSiteDiff] = useState(() => !!doc.meta.site)
  const [remOpen, setRemOpen] = useState(() => !!(doc.meta.remise && doc.meta.remise.v > 0)), [moreOpen, setMoreOpen] = useState(false) // update73
  useEffect(() => { if (doc.meta.site && !siteDiff) setSiteDiff(true) }, [doc.meta.site]) // eslint-disable-line react-hooks/exhaustive-deps
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
      const r = await saveDevis(idRef.current, { parentId: req.prefill?.parentId, num: n, client: d.client, email: d.email, phone: d.phone, addr: d.addr, objet: d.objet || d.items.find(x => x.k !== "sec" && x.l.trim())?.l || "Travaux", lines: ser.lines, ht: t.ht, ttc: t.ttc, tva: rates.length === 1 ? rates[0] : rates.includes(tv0) ? tv0 : rates[rates.length - 1] ?? tv0 })
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
      if (!ok && (idRef.current || canCreate(docRef.current))) {
        askConfirm({
          title: "Fermer le devis ?",
          text: `Le devis n'est pas enregistré${err ? ` (${err})` : ""}. Fermer quand même ? Le brouillon reste gardé sur cet appareil.`,
          confirmLabel: "OK", cancelLabel: "Annuler",
          onConfirm: () => onClose(),
        })
        return
      }
    } else if (st === "new" && (doc.client.trim() || doc.items.length) && !canCreate(doc)) {
      askConfirm({
        title: "Fermer le devis ?",
        text: "Ce devis n'est pas encore enregistré : il faut un client et au moins une ligne. Fermer quand même ? Le brouillon reste gardé sur cet appareil.",
        confirmLabel: "OK", cancelLabel: "Annuler",
        onConfirm: () => onClose(),
      })
      return
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

  const readyDoc = () => {
    if (!doc.client.trim()) { setErr("Indiquez le client."); setSt("error"); return false }
    if (!doc.items.some(x => x.k !== "sec" && (lineHT(x) > 0 || x.q * x.pu > 0))) { setErr("Ajoutez au moins une ligne chiffrée."); setSt("error"); return false }
    return true
  }
  const snapshot = (): Devis => {
    const dv = s.devis.find(x => x.id === idRef.current)
    const ser = serialize(docRef.current)
    return { ...(dv || { status: "brouillon", created: Date.now() } as Devis), id: idRef.current!, num: numRef.current || 0, client: doc.client, objet: doc.objet || "Travaux", amount: T.ttc, lines: ser.lines, email: doc.email || undefined, phone: doc.phone || undefined, addr: doc.addr || undefined }
  }
  const createDevis = async () => {
    if (!readyDoc()) return
    const ok = await saveNow()
    if (!ok || !idRef.current) return
    toast(numRef.current ? `Devis N° ${numRef.current} créé` : "Devis créé")
    onClose()
  }
  const createFacture = async () => {
    if (!readyDoc()) return
    const ok = await saveNow()
    if (!ok || !idRef.current) return
    if (onCreateFacture) await onCreateFacture(snapshot())
    else onClose()
  }

  /* ---------- édition ---------- */
  const set = (p: Partial<Doc>) => setDoc(d => ({ ...d, ...p }))
  const applyModele = (m: Modele, mode: "replace" | "append") => {
    const { items, meta } = fromStored(m.lignes, tv0)
    setDoc(d => mode === "replace" ? { ...d, items, meta: { ...d.meta, ...meta, site: d.meta.site }, objet: d.objet || m.objet || m.nom } : { ...d, items: [...d.items, ...items] })
    setModeles(false); toast(mode === "replace" ? `Modèle « ${m.nom} » appliqué` : `Lignes de « ${m.nom} » ajoutées`)
  }
  const setMeta = (p: Partial<DevisMeta>) => setDoc(d => ({ ...d, meta: { ...d.meta, ...p } }))
  const setItems = (f: (xs: EdLine[]) => EdLine[]) => setDoc(d => ({ ...d, items: f(d.items) }))
  const patch = (lineId: string, p: Partial<EdLine>) => setItems(xs => xs.map(x => x.id === lineId ? { ...x, ...p } : x))
  const focusLine = (lineId: string, sel = "[data-f=l]") => { setFocusId(lineId); requestAnimationFrame(() => requestAnimationFrame(() => { const row = document.querySelector(`[data-line="${lineId}"]`) as HTMLElement | null; row?.scrollIntoView({ block: "center", behavior: "smooth" }); (row?.querySelector(sel) as HTMLInputElement | null)?.focus() })) }
  const newLine = (k: LineKind | "sec", after?: string): EdLine => k === "sec" ? { id: lid(), k, l: "", d: "", q: 0, u: "", pu: 0, tv: tv0 } : { id: lid(), k, l: "", d: "", q: 1, u: k === "mo" ? "h" : k === "fft" ? "forfait" : "u", pu: k === "mo" ? taux ?? 0 : 0, tv: tv0 }
  const insert = (x: EdLine, after?: string | null) => { setItems(xs => { const i = after ? xs.findIndex(y => y.id === after) : -1; return i < 0 ? [...xs, x] : [...xs.slice(0, i + 1), x, ...xs.slice(i + 1)] }); focusLine(x.id) }
  const addKind = (k: LineKind | "sec") => insert(newLine(k), focusId && doc.items.some(x => x.id === focusId) ? focusId : null)
  const addFree = (name: string) => { const line = { ...newLine("fft"), l: name.trim() }; insert(line); setOfferSaveId(line.id) }
  const fromPresta = (p: Prestation) => {
    const k = p.type, line: EdLine = { id: lid(), k, l: p.libelle, d: p.description || "", q: k === "mo" ? p.duree_h ?? 1 : 1, u: k === "mo" ? "h" : p.unite || (k === "fft" ? "forfait" : "u"), pu: k === "mo" ? p.taux_horaire ?? taux ?? 0 : p.prix_unitaire, tv: CO.tvaNA ? 0 : p.tva ?? tv0, pid: p.id, ...(p.cout_achat != null ? { ca: p.cout_achat } : {}) }
    setItems(xs => [...xs, line]); focusLine(line.id)
  }
  const move = (lineId: string, dir: -1 | 1) => setItems(xs => { const i = xs.findIndex(x => x.id === lineId), j = i + dir; if (i < 0 || j < 0 || j >= xs.length) return xs; const c = [...xs];[c[i], c[j]] = [c[j], c[i]]; return c })
  const dup = (lineId: string) => { const x = doc.items.find(y => y.id === lineId); if (x) insert({ ...x, id: lid() }, lineId) }
  const remove = (lineId: string) => { const snap = doc.items; setItems(xs => xs.filter(x => x.id !== lineId)); toast("Ligne supprimée", () => setDoc(d => ({ ...d, items: snap }))) }
  const asPresta = (x: EdLine) => setForm({ initial: { libelle: x.l, description: x.d, type: x.k === "sec" ? "fo" : x.k, unite: x.u, duree_h: x.k === "mo" ? x.q : null, taux_horaire: x.k === "mo" ? (x.pu === taux ? null : x.pu) : null, prix_unitaire: x.k === "mo" ? 0 : x.pu, tva: x.tv === tv0 ? null : x.tv, cout_achat: x.ca ?? null, categorie: "" } })

  /* ---------- raccourcis clavier (desktop) ---------- */
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (form || picker || pickC) return
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
  const sub = (lineIdx: number) => { let t = 0; for (let i = lineIdx + 1; i < doc.items.length && doc.items[i].k !== "sec"; i++) t += lineHT(doc.items[i]); return t }
  const missing = missingLegal("devis")
  const pdoc = () => buildDoc({ num: num || 0, objet: doc.objet || "Travaux", amount: T.ttc, client: doc.client || "Client", lines: serialize(doc).lines, addr: doc.addr, email: doc.email, phone: doc.phone }, undefined, tv0, today())

  const Status = () => <div className="flex items-center gap-1.5 text-[12.5px]" aria-live="polite">
    {st === "saving" ? <><Loader2 size={13} className="animate-spin text-white/45" /><span className="text-white/50">Enregistrement…</span></>
      : st === "saved" ? <><span className="flex h-4 w-4 items-center justify-center rounded-full" style={{ background: TEAL + "33", color: TEAL_T }}><Check size={10} strokeWidth={3} /></span><span className="text-white/55">Enregistré{savedAt ? ` · ${new Date(savedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}</span></>
      : st === "dirty" ? <><span className="h-1.5 w-1.5 rounded-full bg-[#FFB340]" /><span className="text-white/50">Modifications en cours</span></>
      : st === "error" ? <><AlertCircle size={13} className="text-[#FF7A72]" /><button type="button" onClick={() => void saveNow()} className="font-medium text-[#FF9B96] underline-offset-2 hover:underline">Non enregistré · Réessayer</button></>
      : <span className="text-white/40">{doc.client.trim() ? "Ajoutez une ligne pour enregistrer" : "Indiquez le client pour enregistrer"}</span>}
  </div>

  const header = <div className="flex shrink-0 items-center gap-3 border-b border-white/[.07] bg-black/80 px-4 backdrop-blur-xl lg:px-6" style={{ paddingTop: desk ? 0 : 8, minHeight: desk ? 64 : undefined }}>
    <div className={`flex w-full items-center gap-3 ${desk ? "h-16" : "h-14"}`}>
      <button type="button" aria-label="Fermer l'éditeur" onClick={() => void close()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[.07] text-white/70 transition-colors hover:text-white"><X size={19} strokeWidth={1.75} /></button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2"><span className="truncate text-[16px] font-semibold tracking-[-0.02em]">{num ? `Devis N° ${num}` : "Nouveau devis"}</span>{doc.client.trim() && desk && <span className="truncate text-[14px] text-white/40">· {doc.client}</span>}</div>
        <Status />
      </div>
      {desk && <button type="button" onClick={() => setModeles(true)} className="flex h-10 items-center gap-2 rounded-full bg-white/[.07] px-4 text-[14px] font-medium text-white/85 transition-colors hover:bg-white/[.11]"><LayoutTemplate size={16} strokeWidth={1.7} />Modèles</button>}
      {desk && <button type="button" onClick={() => setPreview(true)} className="flex h-10 items-center gap-2 rounded-full bg-white/[.07] px-4 text-[14px] font-medium text-white/85 transition-colors hover:bg-white/[.11]"><Eye size={16} strokeWidth={1.7} />Aperçu<Kbd>{mk} P</Kbd></button>}
      {desk && <button type="button" onClick={() => void send()} className="flex h-10 items-center gap-2 rounded-full px-5 text-[14px] font-semibold text-white transition-[filter] hover:brightness-110" style={{ background: TEAL }}><Send size={15} strokeWidth={1.9} />Valider et envoyer</button>}
      {!desk && <button type="button" aria-label="Modèles de devis" onClick={() => setModeles(true)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[.07] text-white/80"><LayoutTemplate size={18} strokeWidth={1.7} /></button>}
      {!desk && <button type="button" aria-label="Aperçu du devis" onClick={() => setPreview(true)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[.07] text-white/80"><Eye size={18} strokeWidth={1.7} /></button>}
    </div>
  </div>

  const coordSum = [doc.phone, doc.email, doc.addr].filter(Boolean).join(" · ")
  const clientCard = <div className={desk ? "grid items-start gap-6 lg:grid-cols-2" : "space-y-7"}>
    <IGroup title={<StepT n={1} t="Client" />} id="dv-g-client">
      <ClientRow value={doc.client} phone={doc.phone} email={doc.email} onOpen={() => setPickC(true)} />
      <DisclosureRow open={coordOpen} onToggle={() => setCoordOpen(o => !o)} title="Coordonnées" sub={coordSum || "E-mail, téléphone, adresse"} />
      <Reveal open={coordOpen}><div>
        <IRow label="E-mail" htmlFor="dv-email"><input id="dv-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="next" className={ival} value={doc.email} placeholder="Pour l'envoi du devis" onChange={e => set({ email: e.target.value })} /></IRow>
        <IRow label="Téléphone" htmlFor="dv-tel"><input id="dv-tel" type="tel" inputMode="tel" autoComplete="tel" enterKeyHint="next" className={ival} value={doc.phone} placeholder="06 12 34 56 78" onChange={e => set({ phone: e.target.value })} /></IRow>
        <IRow label="Adresse" htmlFor="dv-addr"><input id="dv-addr" autoComplete="street-address" autoCapitalize="words" enterKeyHint="done" className={ival} value={doc.addr} placeholder="N°, rue, code postal, ville" onChange={e => set({ addr: e.target.value })} /></IRow>
      </div></Reveal>
    </IGroup>
    <IGroup title={<StepT n={2} t="Chantier" />} id="dv-g-chantier">
      <IRow label="Objet" htmlFor="dv-objet"><input id="dv-objet" className={ival} value={doc.objet} maxLength={160} autoCapitalize="sentences" enterKeyHint="done" placeholder="Ex. Rénovation salle de bain" onChange={e => set({ objet: e.target.value })} /></IRow>
      <IToggleRow label="Identique à l'adresse client" sub={!siteDiff ? (doc.addr || "Adresse du client à compléter") : undefined} on={!siteDiff} onChange={v => { setSiteDiff(!v); if (v) setMeta({ site: "" }) }} />
      <Reveal open={siteDiff}><IRow label="Adresse" htmlFor="dv-site"><input id="dv-site" autoComplete="street-address" autoCapitalize="words" enterKeyHint="done" className={ival} value={doc.meta.site || ""} placeholder="Adresse du chantier" onChange={e => setMeta({ site: e.target.value })} /></IRow></Reveal>
    </IGroup>
  </div>

  const lineHead = desk && <div className="grid items-center gap-2 px-3 pb-2 text-[11.5px] font-medium text-white/35" style={{ gridTemplateColumns: COLS(CO.tvaNA) }}>
    <span /><span>Désignation</span><span className="text-center">Qté / heures</span><span className="text-center">Unité</span><span className="text-right">PU HT</span>{!CO.tvaNA && <span className="text-center">TVA</span>}<span className="text-right">Total HT</span><span />
  </div>

  const nLines = doc.items.filter(x => x.k !== "sec").length
  const lines = <section data-prestations>
    <div className="mb-1.5 flex items-end justify-between gap-3 px-4">
      <h2 className="text-[12.5px] font-medium uppercase tracking-[.06em] text-white/42"><StepT n={3} t="Prestations" />{nLines > 0 && <span className="ml-1.5 normal-case tracking-normal text-white/30">· {nLines} ligne{nLines > 1 ? "s" : ""}</span>}</h2>
      <button type="button" onClick={() => setPicker(true)} className="-mb-0.5 flex h-8 items-center gap-1.5 rounded-full pl-1 pr-1 text-[14px] font-medium text-[#7EA6FF] transition-colors hover:text-white"><Search size={14} strokeWidth={2} />Mes prestations{desk && <Kbd>{mk} K</Kbd>}</button>
    </div>
    <Reorder.Group axis="y" values={doc.items} onReorder={xs => setDoc(d => ({ ...d, items: xs as EdLine[] }))} className={desk ? "space-y-1.5" : "space-y-2.5"}>
      <AnimatePresence initial={false}>
      {doc.items.map((x, i) => <LineRow key={x.id} x={x} n={x.k === "sec" ? 0 : doc.items.slice(0, i + 1).filter(y => y.k !== "sec").length} desk={desk} focused={focusId === x.id} taux={taux} tv0={tv0} subtotal={x.k === "sec" ? sub(i) : 0} first={i === 0} last={i === doc.items.length - 1} offerSave={offerSaveId === x.id}
        onFocus={() => setFocusId(x.id)} onPatch={p => patch(x.id, p)} onMove={d => move(x.id, d)} onDup={() => dup(x.id)} onRemove={() => { if (offerSaveId === x.id) setOfferSaveId(null); remove(x.id) }} onSave={() => asPresta(x)} onEnter={() => addKind(x.k)} />)}
      </AnimatePresence>
    </Reorder.Group>
    <AddPrestaRow onPick={p => fromPresta(p)} onCreate={addFree} />
    {desk && <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 px-1 text-[12px] text-white/35"><span><Kbd>{mk} K</Kbd> prestations</span><span><Kbd>{mk} ↵</Kbd> nouvelle ligne</span><span><Kbd>Alt ↑↓</Kbd> déplacer</span><span><Kbd>{mk} S</Kbd> enregistrer</span><span><Kbd>{mk} P</Kbd> aperçu</span></div>}
  </section>

  const numIn = desk ? "!h-9" : "!h-10 !border-0 !bg-white/[.06] !text-[16px]"
  const recap = <div className="space-y-7">
    <IGroup title={<StepT n={4} t="Total" />} id="dv-g-total">
      {/* update73 · remise globale visible ici, en % ou en € (les remises par ligne sont dans le menu « … » de chaque ligne) */}
      {!remOpen ? <button type="button" onClick={() => { setRemOpen(true); if (!doc.meta.remise) setMeta({ remise: { t: "pct", v: 0 } }) }} className="ig-row flex min-h-12 w-full items-center gap-2 pl-4 pr-4 text-left text-[15px] text-[#7EA6FF]"><Percent size={16} />Ajouter une remise</button>
        : <div data-remise-globale className="ig-row flex min-h-12 items-center gap-2 py-1.5 pl-4 pr-2"><span className="min-w-0 flex-1 text-[15px] text-white/60">Remise</span>
          <Seg size="sm" label="Type de remise" value={doc.meta.remise?.t || "pct"} onChange={t => setMeta({ remise: { t, v: doc.meta.remise?.v || 0 } })} opts={[["pct", "%"], ["eur", "€"]]} />
          <NumField className="w-[96px]" inputClass={numIn} value={doc.meta.remise?.v || null} placeholder="0" onChange={n => setMeta({ remise: { t: doc.meta.remise?.t || "pct", v: n || 0 } })} max={doc.meta.remise?.t === "eur" ? undefined : 100} ariaLabel="Montant de la remise" suffix={doc.meta.remise?.t === "eur" ? "€" : "%"} />
          <button type="button" aria-label="Retirer la remise" onClick={() => { setRemOpen(false); setMeta({ remise: undefined }) }} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/40"><X size={16} /></button></div>}
      <TotRow l={T.remise > 0 ? "Total HT avant remise" : "Total HT"} v={fmtE(T.brut)} />
      {T.remise > 0 && <><TotRow l="Remise" v={`− ${fmtE(T.remise)}`} /><TotRow l="Total HT après remise" v={fmtE(T.ht)} strong /></>}
      {CO.tvaNA ? <TotRow l="TVA non applicable, art. 293 B du CGI" v="0,00 €" /> : T.rates.map(r => <TotRow key={r.r} l={`TVA ${fmtN(r.r)} %`} hint={`sur ${fmtE(r.base)}`} v={fmtE(r.tva)} />)}
      <div className="ig-row flex items-baseline justify-between gap-3 py-3.5 pl-4 pr-4"><span className="text-[16px] font-semibold">Total TTC</span><motion.span key={T.ttc} initial={{ opacity: .4 }} animate={{ opacity: 1 }} className="text-[24px] font-semibold tabular-nums tracking-[-0.03em]">{fmtE(T.ttc)}</motion.span></div>
      {(doc.meta.acompte ?? 30) > 0 && <TotRow l={`Acompte à la signature (${fmtN(doc.meta.acompte ?? 30)} %)`} v={fmtE(T.acompte)} />}
      {T.marge != null && <div className="ig-row flex items-center justify-between gap-3 py-3 pl-4 pr-4 text-[14px]"><span className="min-w-0 text-white/50">Marge estimée<span className="block text-[12px] text-white/30">sur les coûts d'achat renseignés</span></span><span className="shrink-0 whitespace-nowrap tabular-nums text-white/80">{fmtE(T.marge)}{T.ht > 0 && <span className="ml-1.5 text-white/40">{Math.round(T.marge / T.ht * 100)} %</span>}</span></div>}
    </IGroup>
    {missing.length > 0 && <div className="-mt-4 rounded-[14px] bg-[#FFB340]/[.09] px-4 py-3 text-[13px] leading-5 text-white/75">Mentions obligatoires manquantes : {missing.join(", ")}. À compléter dans Réglages → Entreprise avant l'envoi.</div>}
    <IGroup id="dv-g-cond" foot={missing.length > 0 ? undefined : "Les mentions légales sont ajoutées automatiquement au devis."}>
      <DisclosureRow open={moreOpen} onToggle={() => setMoreOpen(o => !o)} title="Plus d'options" sub={`Acompte ${fmtN(doc.meta.acompte ?? 30)} % · valable ${doc.meta.validite || 30} jours${doc.meta.notes ? " · remarques" : ""}`} />
      <Reveal open={moreOpen}><div>
      <div className="ig-row flex min-h-12 items-center gap-3 py-1.5 pl-4 pr-3"><span className="min-w-0 flex-1 text-[15px] text-white/50">Acompte<span className="block text-[12.5px] text-white/35 tabular-nums">{fmtE(T.acompte)} à la signature</span></span>
        <NumField className="w-[84px]" inputClass={numIn} value={doc.meta.acompte ?? 30} max={100} onChange={n => setDoc(d => ({ ...d, meta: { ...d.meta, acompte: n ?? 0, conditions: withAcompte(d.meta.conditions || "", n ?? 0) } }))} ariaLabel="Pourcentage d'acompte" suffix="%" /></div>
      <div className="ig-row flex min-h-12 items-center gap-3 py-1.5 pl-4 pr-3"><span className="min-w-0 flex-1 text-[15px] text-white/50">Validité</span><Seg size="sm" label="Validité du devis" value={doc.meta.validite || 30} onChange={v => setMeta({ validite: v })} opts={[[15, "15 j"], [30, "30 j"], [60, "60 j"], [90, "90 j"]]} /></div>
      <IRow top label="Paiement" htmlFor="dv-cond"><textarea id="dv-cond" rows={2} style={{ fieldSizing: "content" } as any} className={ival + " !h-auto min-h-12 resize-none py-[13px] leading-[22px]"} maxLength={300} value={doc.meta.conditions || ""} onChange={e => setMeta({ conditions: e.target.value, acompte: acompteFrom(e.target.value) ?? doc.meta.acompte })} /></IRow>
      <IRow top label="Remarques" htmlFor="dv-notes"><textarea id="dv-notes" rows={1} style={{ fieldSizing: "content" } as any} className={ival + " !h-auto min-h-12 resize-none py-[13px] leading-[22px]"} maxLength={1000} placeholder="Facultatif : accès, délais…" value={doc.meta.notes || ""} onChange={e => setMeta({ notes: e.target.value })} /></IRow>
      </div></Reveal>
    </IGroup>
  </div>

  const restorePill = <AnimatePresence initial={false}>{restoreNew && st === "new" && !doc.client && !doc.items.length && <div key="rp" className="mb-5 flex justify-center">
    <Pill onDismiss={() => { dropLocal("new"); setRestoreNew(null) }} action={<button type="button" onClick={() => { setDoc(restoreNew); setRestoreNew(null); setSiteDiff(!!restoreNew.meta?.site); setCoordOpen(!(restoreNew.email || restoreNew.phone || restoreNew.addr)) }} className="shrink-0 rounded-full bg-white px-3 py-1 text-[12.5px] font-semibold text-black">Reprendre</button>}>Brouillon{restoreNew.client ? ` · ${restoreNew.client}` : ""} gardé</Pill>
  </div>}</AnimatePresence>

  const body = <>
    {header}
    {st === "error" && err && <div role="alert" className="flex shrink-0 items-center gap-3 border-b border-[#FF453A]/20 bg-[#FF453A]/10 px-4 py-2.5 text-[13px] text-[#FFB4AF] lg:px-6"><AlertCircle size={15} className="shrink-0" /><span className="flex-1">{err}</span><button type="button" onClick={() => void saveNow()} className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-[12.5px] font-semibold text-white hover:bg-white/15">Réessayer</button></div>}
    {desk ? <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-[1320px] grid-cols-[minmax(0,1fr)_360px] items-start gap-6 px-6 py-6">
        <div className="min-w-0 space-y-8">{restorePill}{clientCard}{lines}</div>
        <aside className="sticky top-6 space-y-5">{recap}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" data-create-devis onClick={() => void createDevis()} className="flex h-11 items-center justify-center rounded-full bg-white/[.1] px-3 text-[14.5px] font-semibold text-white">Créer un devis</button>
            <button type="button" data-create-facture onClick={() => void createFacture()} className="flex h-11 items-center justify-center rounded-full px-3 text-[14.5px] font-semibold text-white" style={{ background: TEAL }}>Créer une facture</button>
          </div>
          <button type="button" onClick={() => setPreview(true)} className="group block w-full overflow-hidden rounded-[18px] border border-white/[.06] bg-[#0F0F11] p-3 text-left transition-colors hover:border-white/[.14]">
            <div className="pointer-events-none max-h-[150px] overflow-hidden rounded-[8px] opacity-90 [mask-image:linear-gradient(to_bottom,#000_60%,transparent)]"><DevisPaper d={pdoc()} /></div>
            <div className="mt-2 flex items-center justify-between px-1 text-[12.5px] text-white/50"><span>Rendu client</span><span className="text-white/70 group-hover:text-white">Ouvrir l'aperçu</span></div>
          </button>
        </aside>
      </div>
    </div> : <>
      <div data-devis-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-5" style={{ paddingBottom: `calc(${footH}px + 24px + var(--kb, 0px))` }}>
        {restorePill}
        <div className="space-y-8">{clientCard}{lines}{recap}</div>
      </div>
      <div ref={footRef} data-devis-footer className="absolute inset-x-0 bottom-0 z-10 border-t border-white/[.06] bg-[#0B0B0C] px-4 pt-2.5" style={{ paddingBottom: "max(10px, var(--sab))" }}>
        <div className="flex items-center gap-2.5">
          <div className="min-w-0 flex-1" aria-label={`Total ${fmtE(T.ttc)} TTC`}>
            <div className="flex gap-2.5 truncate text-[11.5px] tabular-nums text-white/45"><span>HT {fmtE(T.ht)}</span>{!CO.tvaNA && <span>TVA {fmtE(T.tva)}</span>}{T.remise > 0 && <span>remise incluse</span>}</div>
            <div className="flex items-baseline gap-1.5"><motion.span key={T.ttc} initial={{ opacity: .5, y: 2 }} animate={{ opacity: 1, y: 0 }} className="truncate text-[20px] font-semibold tabular-nums tracking-[-0.02em]">{fmtE(T.ttc)}</motion.span><span className="text-[12px] font-medium text-white/45">TTC</span></div>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" data-create-devis onClick={() => void createDevis()} className="flex h-11 items-center justify-center rounded-full bg-white/[.1] px-3 text-[14.5px] font-semibold text-white transition-transform active:scale-[.97]">Créer un devis</button>
          <button type="button" data-create-facture onClick={() => void createFacture()} className="flex h-11 items-center justify-center rounded-full px-3 text-[14.5px] font-semibold text-white transition-transform active:scale-[.97]" style={{ background: TEAL }}>Créer une facture</button>
        </div>
      </div>
    </>}

    <ContactSheet open={pickC} desk={desk} clients={clients} current={doc.client} onClose={() => setPickC(false)} onPick={(c, isNew) => {
      const nx = { client: c.name, email: c.email || (isNew ? "" : doc.email), phone: c.phone || (isNew ? "" : doc.phone), addr: c.addr || (isNew ? "" : doc.addr) }
      set(nx)
      setCoordOpen(!(nx.email || nx.phone || nx.addr) || !!isNew)
      setPickC(false)
    }} />
    <AnimatePresence>{modeles && <Modeles desk={desk} current={{ objet: doc.objet, lignes: serialize(doc).lines }} onClose={() => setModeles(false)} onApply={applyModele} />}</AnimatePresence>
    <AnimatePresence>{picker && <PrestaPicker desk={desk} onClose={() => setPicker(false)} onPick={p => fromPresta(p)} onNew={name => setForm({ initial: name ? { libelle: name } : {} })} />}</AnimatePresence>
    <AnimatePresence>{form && <PrestaForm initial={form.initial} title={form.initial?.libelle && !picker ? "Enregistrer comme prestation" : undefined} onCancel={() => setForm(null)} onDone={p => { setForm(null); if (p) { toast(`« ${p.libelle} » ajoutée à vos prestations`); if (!form.initial?.libelle || picker) fromPresta(p) } }} />}</AnimatePresence>
    {createPortal(<AnimatePresence>{preview && <motion.div className="fixed inset-0 z-[55] flex flex-col bg-black/85 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPreview(false)}>
      <div className="flex shrink-0 items-center gap-3 px-4 py-3 lg:px-6" style={{ paddingTop: desk ? undefined : "calc(var(--sat) + 8px)" }} onClick={e => e.stopPropagation()}>
        <span className="flex-1 text-[15px] font-semibold">Aperçu · ce que reçoit le client</span>
        <button type="button" onClick={() => import("../../lib/devisPdf").then(m => { m.downloadPdf(pdoc()); toast(`Devis-${num || "brouillon"}.pdf téléchargé`) })} className="flex h-10 items-center gap-2 rounded-full bg-white/[.1] px-4 text-[14px] font-medium hover:bg-white/[.14]"><Download size={16} />PDF</button>
        <button type="button" aria-label="Fermer l'aperçu" onClick={() => setPreview(false)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[.1] hover:bg-white/[.14]"><X size={18} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-10 lg:px-6" onClick={e => e.stopPropagation()}><div className="mx-auto w-full max-w-[820px]"><DevisPaper d={pdoc()} /></div></div>
    </motion.div>}</AnimatePresence>, document.body)}
  </>
  const label = num ? `Devis N° ${num}` : "Nouveau devis"
  // update67 · ordinateur : plein écran (fondu) ; mobile : grande feuille iOS (poignée, glisser vers le bas = fermer, avec la même garde « non enregistré »)
  return desk
    ? <motion.div className="fixed inset-0 z-[45] flex flex-col bg-black text-white" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .2 }} role="dialog" aria-modal="true" aria-label={label}>{body}</motion.div>
    : <ModalSheet label={label} onClose={() => void close()} z={45} size="large" escape={false} className="bg-black">{body}</ModalSheet>
}

/** update73 · titre d'étape numéroté (1. Client, 2. Chantier, 3. Prestations, 4. Total) */
const StepT = ({ n, t }: { n: number; t: string }) => <span className="inline-flex items-center gap-2"><span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full bg-white/[.1] text-[11.5px] font-semibold tabular-nums text-white/80">{n}</span>{t}</span>
const COLS = (tvaNA: boolean) => tvaNA ? "20px minmax(0,1fr) 132px 84px 120px 116px 36px" : "20px minmax(0,1fr) 132px 84px 120px 84px 116px 36px"
const TotRow = ({ l, v, strong, hint }: { l: string; v: string; strong?: boolean; hint?: string }) => <div className="ig-row flex min-h-11 items-center justify-between gap-3 py-2 pl-4 pr-4 text-[15px]"><span className={strong ? "font-medium text-white" : "text-white/55"}>{l}{hint && <span className="ml-1.5 text-[12.5px] text-white/30">{hint}</span>}</span><span className={`tabular-nums ${strong ? "font-medium text-white" : "text-white/85"}`}>{v}</span></div>


function normQ(s: string) { return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") }
/** update85 · une seule ligne compacte pour ajouter une prestation (catalogue ou texte libre). */
function AddPrestaRow({ onPick, onCreate }: { onPick: (p: Prestation) => void; onCreate: (name: string) => void }) {
  const lib = usePrestations()
  const [q, setQ] = useState(""), [on, setOn] = useState(false)
  const words = normQ(q).trim().split(/\s+/).filter(Boolean)
  const list = lib.items.filter(x => !words.length || words.every(w => normQ(`${x.libelle} ${x.description} ${x.categorie}`).includes(w))).slice(0, 8)
  const exact = list.some(x => x.libelle.toLowerCase() === q.trim().toLowerCase())
  const commit = (raw: string, p?: Prestation) => {
    const t = raw.trim(); if (!t && !p) return
    if (p) onPick(p)
    else { const hit = list.find(x => x.libelle.toLowerCase() === t.toLowerCase()); if (hit) onPick(hit); else onCreate(t) }
    setQ(""); setOn(false)
  }
  return <div data-add-presta className="relative mt-2.5">
    <div className="flex h-12 items-center gap-2 rounded-[16px] bg-[#141416] px-3.5 ring-1 ring-white/[.06]">
      <Plus size={16} strokeWidth={2.2} className="shrink-0 text-[#7EA6FF]" />
      <input data-add-presta-input value={q} maxLength={200} placeholder="Ajouter une prestation" aria-label="Ajouter une prestation" autoComplete="off" autoCorrect="off" className="h-full min-w-0 flex-1 bg-transparent text-[15.5px] text-white outline-none placeholder:text-white/40"
        onChange={e => { setQ(e.target.value); setOn(true) }} onFocus={() => setOn(true)} onBlur={() => setTimeout(() => setOn(false), 180)}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(q) } }} />
    </div>
    <SuggestPop show={on && (q.trim().length > 0 || list.length > 0)} label="Prestations">
      <div data-add-presta-sug className="mt-1.5 overflow-hidden rounded-[16px] bg-[#1C1C1E] ring-1 ring-white/[.08]">
        {q.trim() && !exact && <button type="button" data-add-presta-create onMouseDown={e => e.preventDefault()} onClick={() => commit(q)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-[#7EA6FF] active:bg-white/[.05]">
          <Plus size={15} /><span className="min-w-0 flex-1 truncate text-[14.5px] font-medium">Créer « {q.trim()} »</span>
        </button>}
        {list.map(p => <button key={p.id} type="button" data-add-presta-item onMouseDown={e => e.preventDefault()} onClick={() => commit(p.libelle, p)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left active:bg-white/[.05]">
          <span className="min-w-0 flex-1"><span className="block truncate text-[14.5px] font-medium">{p.libelle}</span>{p.categorie && <span className="block truncate text-[12px] text-white/40">{p.categorie}</span>}</span>
        </button>)}
      </div>
    </SuggestPop>
  </div>
}
function LineRow({ x, n, desk, focused, taux, tv0, subtotal, first, last, offerSave, onFocus, onPatch, onMove, onDup, onRemove, onSave, onEnter }: { x: EdLine; n: number; desk: boolean; focused: boolean; taux: number | null; tv0: number; subtotal: number; first: boolean; last: boolean; offerSave?: boolean; onFocus: () => void; onPatch: (p: Partial<EdLine>) => void; onMove: (d: -1 | 1) => void; onDup: () => void; onRemove: () => void; onSave: () => void; onEnter: () => void }) {
  const controls = useDragControls(), [menu, setMenu] = useState(false), [desc, setDesc] = useState(!!x.d)
  const [remOpen, setRemOpen] = useState(!!x.rl)
  const setKind = (k: LineKind | "sec") => onPatch(k === "sec" ? { k: "sec", u: "", pu: 0, q: 0 } : { k, u: k === "mo" ? "h" : k === "fft" ? "forfait" : x.u === "h" || x.u === "forfait" ? "u" : x.u, q: x.k === "sec" ? 1 : x.q, ...(k === "mo" && !x.pu && taux ? { pu: taux } : {}) })
  const handle = <button type="button" data-nodrag aria-label="Déplacer la ligne" onPointerDown={e => { e.preventDefault(); controls.start(e) }} className="flex h-10 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-white/20 transition-colors hover:text-white/60 active:cursor-grabbing"><GripVertical size={16} /></button>
  const menuEl = <Menu open={menu} setOpen={setMenu} trigger={<button type="button" aria-label="Actions de la ligne" aria-haspopup="menu" onClick={() => setMenu(o => !o)} className={`flex h-9 w-9 items-center justify-center rounded-full text-white/40 transition-colors hover:bg-white/[.07] hover:text-white ${menu ? "bg-white/[.07] text-white" : ""}`}><MoreHorizontal size={17} /></button>}>
    <>{([["mo", "À l'heure"], ["fo", "Fourniture"], ["fft", "Forfait"], ["sec", "Titre de partie"]] as [LineKind | "sec", string][]).map(([k, l]) => { const I = k === "sec" ? Layers : KIND_ICON[k]; return <MenuItem key={k} I={I} onClick={() => { setKind(k); setMenu(false) }} hint={x.k === k ? "✓" : undefined}>{l}</MenuItem> })}<MenuSep />
      {x.k !== "sec" && !desc && <MenuItem I={AlignLeft} onClick={() => { setDesc(true); setMenu(false) }}>Ajouter une description</MenuItem>}
      {x.k !== "sec" && !remOpen && <MenuItem I={Percent} onClick={() => { setRemOpen(true); if (!x.rl) onPatch({ rl: { t: "pct", v: 0 } }); setMenu(false) }}>Faire une remise sur cette ligne</MenuItem>}
      {x.k !== "sec" && <MenuItem I={BookmarkPlus} onClick={() => { onSave(); setMenu(false) }}>Enregistrer comme prestation</MenuItem>}</>
    <MenuItem I={Copy} onClick={() => { onDup(); setMenu(false) }}>Dupliquer</MenuItem>
    {!first && <MenuItem I={ArrowUp} hint="Alt ↑" onClick={() => { onMove(-1); setMenu(false) }}>Monter</MenuItem>}
    {!last && <MenuItem I={ArrowDown} hint="Alt ↓" onClick={() => { onMove(1); setMenu(false) }}>Descendre</MenuItem>}
    <MenuSep /><MenuItem I={Trash2} danger onClick={() => { setMenu(false); onRemove() }}>Supprimer</MenuItem>
  </Menu>
  // update63 · mobile : balayer la carte vers la gauche pour révéler « Supprimer »
  const rm = useReducedMotion(), xc = useDragControls(), mx = useMotionValue(0), delOp = useTransform(mx, [-56, -6, 0], [1, 0, 0]), [swiped, setSwiped] = useState(false)
  const snap = (open: boolean) => { setSwiped(open); void animate(mx, open ? -SWIPE : 0, rm ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 42 }) }

  if (x.k === "sec") return <Reorder.Item value={x} layout dragListener={false} dragControls={controls} data-line={x.id} onFocusCapture={onFocus} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="relative pt-3">
    <div className={`flex items-center gap-2 rounded-[16px] px-2 py-1 ${focused ? "bg-white/[.03]" : ""}`}>
      {handle}
      <span aria-hidden className="h-5 w-[3px] shrink-0 rounded-full" style={{ background: TEAL_T }} />
      <input data-f="l" value={x.l} maxLength={120} placeholder="Titre de section (ex. Salle de bain)" onChange={e => onPatch({ l: e.target.value })} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onEnter() } }} className="h-10 min-w-0 flex-1 bg-transparent text-[16px] font-semibold tracking-[-0.01em] text-white outline-none placeholder:font-normal placeholder:text-white/30" />
      {subtotal > 0 && <span className="shrink-0 text-[12.5px] tabular-nums text-white/40">Sous-total {fmtE(subtotal)}</span>}
      {menuEl}
    </div>
  </Reorder.Item>

  // update83 · carte pleine largeur : poignée et « … » dans l'en-tête (Ligne n)
  const form = <ServiceLineCard x={x} onPatch={p => onPatch(p)} defaultTv={x.tv > 0 ? x.tv : (CO.tvaNA ? 0 : tv0)} tvaNA={CO.tvaNA} idPrefix={x.id} index={n || undefined} handle={handle} menu={menuEl} />

  if (desk) return <Reorder.Item value={x} layout dragListener={false} dragControls={controls} data-line={x.id} onFocusCapture={onFocus} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className={`relative ${focused ? "ring-1 ring-white/15 rounded-[18px]" : ""}`}>
    {form}
    {offerSave && <button type="button" data-line-save-presta onClick={onSave} className="mt-1.5 flex items-center gap-1.5 px-2 text-[12.5px] font-medium text-[#7EA6FF]"><BookmarkPlus size={13} />Enregistrer dans mes prestations</button>}
  </Reorder.Item>

  return <Reorder.Item value={x} layout dragListener={false} dragControls={controls} data-line={x.id} onFocusCapture={onFocus} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="relative">
    {offerSave && <button type="button" data-line-save-presta onClick={onSave} className="mb-1.5 ml-1 flex items-center gap-1.5 text-[12.5px] font-medium text-[#7EA6FF]"><BookmarkPlus size={13} />Enregistrer dans mes prestations</button>}
    <motion.div aria-hidden={!swiped} style={{ opacity: delOp }} className="absolute inset-y-0 right-0 flex w-[120px] items-stretch justify-end overflow-hidden rounded-[18px] bg-[#FF453A]">
      <button type="button" tabIndex={swiped ? 0 : -1} aria-label="Supprimer la ligne" onClick={() => { snap(false); onRemove() }} className="flex w-[88px] flex-col items-center justify-center gap-1 text-[12.5px] font-semibold text-white"><Trash2 size={19} strokeWidth={1.9} />Supprimer</button>
    </motion.div>
    <motion.div drag="x" dragDirectionLock dragListener={false} dragControls={xc} onPointerDown={e => { if (!(e.target as HTMLElement).closest("[data-nodrag]")) xc.start(e) }} dragConstraints={{ left: -SWIPE, right: 0 }} dragElastic={{ left: .12, right: 0 }} dragMomentum={false} style={{ x: mx, touchAction: "pan-y" }}
      onDragEnd={(_, i) => snap(i.offset.x < -44 || i.velocity.x < -350 ? true : false)} onClickCapture={e => { if (swiped) { e.stopPropagation(); e.preventDefault(); snap(false) } }}
      className="relative">
      {form}
    </motion.div>
  </Reorder.Item>
}
const SWIPE = 96
