import { useCallback, useEffect, useRef, useState } from "react"
import { BellRing, Download, FileCode2, FileText, Plus, Receipt, Send, ShieldCheck, Trash2 } from "lucide-react"
import { AMBER, Btn, Card, Chip, F, GREEN, GREY, Ic, List, RED, Row, Sheet, Tg, inp, tx, useC } from "../ui"
import { SwipeRow, askConfirm } from "../form/SwipeRow"
import { factureSwipeAction } from "../../lib/docDelete"
import { refreshFactures } from "../../lib/facturesLite"
import { supabase } from "../../lib/supabase"
import { api } from "../../lib/accountApi"
import { CO, e2, missingLegal } from "../../lib/devisDoc"
import { NATURE, TYPE_LABEL, downloadFacture, downloadFactureXml, factureFile, factureTotals, type FLine, type Facture } from "../../lib/facturePdf"
import { fmtPct } from "../../../api/_lib/factureCalc"
import { ClientRow, ContactSheet, DisclosureRow, IGroup, IRow, IToggleRow, Reveal, ival, type Contact } from "../form/grouped"
import { ServiceLineCard } from "../devis/fields"
import { LinesCard, NextCard } from "../devis/Chaine"
import { looksPhone, payLink, sendFactureSms } from "../../lib/chaine"
import { webOrigin } from "../../lib/native"
import { Copy, MessageSquare } from "lucide-react"

/* update46 · Factures : brouillon → émise (numéro légal) → envoyée → payée, avoirs, relances d'impayés validées par l'artisan.
   update63 · éditeur de facture au style iOS (sections Client, Chantier, Prestations, Conditions), même logique et mêmes champs.
   update76 · ouverture directe d'une facture (Récentes, À encaisser, devis, fiche client) : plus de feuille liste intermédiaire. */
type Rel = { id: string; facture_id: string; niveau: number; statut: string; sujet: string | null; corps: string | null; prepared_at: string }
const ST: Record<string, [string, string]> = { brouillon: ["Brouillon", GREY], emise: ["Émise", AMBER], envoyee: ["Envoyée", AMBER], payee: ["Payée", GREEN], annulee: ["Annulée", GREY] }
const NIV = ["", "Rappel courtois", "Relance", "Relance ferme", "Mise en demeure"]
const today = () => new Date().toISOString().slice(0, 10)
const late = (f: Facture) => (f.statut === "emise" || f.statut === "envoyee") && f.type !== "avoir" && !!f.date_echeance && f.date_echeance < today()
const due = (f: Facture) => Math.max(0, factureTotals(f).net)
const b64 = async (f: Facture) => (await factureFile(f)).base64
const label = (f: Facture) => f.type === "situation" && f.situation_numero ? `Situation n° ${f.situation_numero}` : TYPE_LABEL[f.type] || "Facture"

export async function createFactureFromDevis(devisId: string, type: "facture" | "acompte" | "situation" | "solde" = "facture", pourcentage?: number) {
  return api("/api/devis", { action: "facture_from_devis", devis_id: devisId, type, ...(type === "situation" ? { avancement: pourcentage } : { pourcentage }) })
}

/** update82 · brouillon de facture à partir d'un devis non encore accepté (client + lignes). Pas de migration. */
export async function createFactureDraft(input: { client_nom: string; client_email?: string; client_telephone?: string; client_adresse?: string; objet?: string; lignes: FLine[] }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: "Non authentifié." }
  const lignes = (input.lignes || []).filter(x => String(x.l || "").trim() && Number(x.q) > 0)
  const { data, error } = await supabase.from("factures").insert({
    artisan_id: user.id, type: "facture", statut: "brouillon",
    client_nom: input.client_nom, client_email: input.client_email || null, client_telephone: input.client_telephone || null,
    client_adresse: input.client_adresse || null, objet: input.objet || null, lignes,
    delai_paiement_jours: Number(CO.delai) || 30, ...(CO.tvaDebits ? { tva_sur_debits: true } : {}),
  }).select("id").maybeSingle()
  if (error || !data) return { ok: false as const, error: "Création de la facture impossible." }
  void refreshFactures()
  return { ok: true as const, facture_id: data.id as string }
}

export default function FacturesSheet({ close, openId, startNew, clients = [] }: { close: () => void; openId?: string; startNew?: boolean; clients?: Contact[] }) {
  const [rows, setRows] = useState<Facture[] | null>(null), [rels, setRels] = useState<Rel[]>([])
  const [tab, setTab] = useState<"todo" | "all" | "paid">("all"), [open, setOpen] = useState<string | null>(openId || null), [err, setErr] = useState("")
  // true seulement si on est entré par la liste (« Toutes ») : le X du détail y ramène. Sinon le X ferme tout (retour à l'accueil).
  const fromList = useRef(!openId && !startNew)
  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [f, r] = await Promise.all([
      supabase.from("factures").select("*").eq("artisan_id", user.id).order("created_at", { ascending: false }).limit(500),
      supabase.from("facture_relances").select("id, facture_id, niveau, statut, sujet, corps, prepared_at").eq("artisan_id", user.id).eq("statut", "a_valider").order("prepared_at", { ascending: false }),
    ])
    if (f.error) { setErr("Factures indisponibles : appliquez la migration 03 (voir LISEZMOI)."); setRows([]); return }
    const list = (f.data || []) as Facture[]
    const byId = new Map(list.map(x => [x.id, x]))
    const devisIds = [...new Set(list.map(x => x.devis_id).filter(Boolean))] as string[]
    const dn = devisIds.length ? await supabase.from("devis").select("id, numero").in("id", devisIds) : { data: [] }
    const devNum = new Map(((dn.data || []) as { id: string; numero: string | null }[]).map(x => [x.id, x.numero]))
    setRows(list.map(x => { const o = x.facture_origine_id ? byId.get(x.facture_origine_id) : undefined; return { ...x, origine_numero: o?.numero || "", origine_date: o?.date_emission || null, devis_numero: x.devis_id ? devNum.get(x.devis_id) || null : null } }))
    setRels((r.data || []) as Rel[])
  }, [])
  useEffect(() => { void load() }, [load])
  const newBlank = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from("factures").insert({ artisan_id: user!.id, type: "facture", statut: "brouillon", client_nom: "", lignes: [], delai_paiement_jours: Number(CO.delai) || 30, ...(CO.tvaDebits ? { tva_sur_debits: true } : {}) }).select("id").maybeSingle()
    if (error || !data) { setErr("Création impossible."); return }
    await load(); setOpen(data.id)
  }
  // update62 · bouton « + » → « Nouvelle facture » : ouvre directement un brouillon (même parcours que le bouton du bas)
  const started = useRef(false)
  useEffect(() => { if (openId) setOpen(openId) }, [openId])
  useEffect(() => { if (startNew && !openId && rows !== null && !err && !started.current) { started.current = true; void newBlank() } }, [startNew, openId, rows, err]) // eslint-disable-line react-hooks/exhaustive-deps
  const swipeFacture = (x: Facture) => {
    const act = factureSwipeAction(x)
    if (act === "blocked") {
      askConfirm({ title: "Cet avoir ne peut pas être supprimé", text: "Un avoir émis est une pièce comptable à conserver. Pour le corriger, ouvrez la facture d'origine.", onlyOk: true, confirmLabel: "Compris" })
      return
    }
    if (act === "avoir") {
      askConfirm({
        title: "Créer un avoir pour cette facture ?",
        text: "La facture n'est pas supprimée. Un avoir en brouillon sera créé pour l'annuler ou la corriger.",
        confirmLabel: "Créer un avoir",
        onConfirm: async () => {
          const r = await api("/api/devis", { action: "avoir", facture_id: x.id })
          if (!r.ok || typeof r.facture_id !== "string") { setErr(r.error || "Création de l'avoir impossible."); return }
          await load()
          void refreshFactures()
          setOpen(r.facture_id)
        },
      })
      return
    }
    askConfirm({
      title: "Supprimer ce brouillon ?",
      text: "Ce brouillon n'a pas encore de numéro. Il sera définitivement effacé.",
      confirmLabel: "Supprimer", danger: true,
      onConfirm: async () => {
        const { error } = await supabase.from("factures").delete().eq("id", x.id).is("numero", null)
        if (error) { setErr("Suppression impossible."); return }
        await load()
        void refreshFactures()
      },
    })
  }
    const closeDetail = () => { if (!fromList.current) { close(); return } setOpen(null); void load() }
  if (open && rows) {
    const f = rows.find(x => x.id === open || x.id === openId || (x.numero && (x.numero === open || x.numero === openId)))
    if (f) return <FactureDetail clients={clients} f={f} rels={rels.filter(r => r.facture_id === f.id)} close={closeDetail} reload={load} openOther={id => { void load().then(() => setOpen(id)) }} />
  }
  // Entrée directe (une facture ou « Nouvelle ») : jamais la liste « Toutes / À traiter / Payées » en dessous.
  if (!fromList.current) {
    return <Sheet title="Facture" sub={err || "Chargement…"} c="#FFFFFF" onClose={close}><div className={tx.cap}>{err || "Chargement…"}</div></Sheet>
  }
  const unpaid = (rows || []).filter(x => (x.statut === "emise" || x.statut === "envoyee") && x.type !== "avoir")
  const list = (rows || []).filter(x => tab === "all" ? true : tab === "paid" ? x.statut === "payee" : late(x) || rels.some(r => r.facture_id === x.id) || x.statut === "brouillon")
  return <Sheet title="Factures" sub={rows ? `${unpaid.length} à encaisser · ${e2(unpaid.reduce((a, x) => a + due(x), 0))}` : "Chargement…"} c="#FFFFFF" onClose={close} footer={<Btn primary className="w-full" data-factures-new onClick={newBlank}><Plus size={18} />Nouvelle facture</Btn>}>
    <div data-factures-list hidden />{rels.length > 0 && <Card className="mb-4 p-4"><div className="flex items-center gap-2 text-[15px] font-medium"><BellRing size={17} className="text-[#FFB340]" />{rels.length} relance{rels.length > 1 ? "s" : ""} d'impayé à valider</div><div className={`mt-1 ${tx.cap}`}>Akno prépare le texte, vous relisez et envoyez. Rien ne part sans vous.</div></Card>}
    <div className="mb-3 flex gap-2">{([["all", "Toutes"], ["todo", "À traiter"], ["paid", "Payées"]] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`h-9 rounded-full px-4 text-[14px] font-medium ${tab === k ? "bg-white text-black" : "bg-white/[.07] text-white/70"}`}>{l}</button>)}</div>
    <List empty="Aucune facture. Créez-en une depuis un devis accepté ou avec « Nouvelle facture »." I={Receipt}>
      {list.map((x, i) => { const [l, c] = late(x) ? ["En retard", RED] : ST[x.statut] || ST.brouillon; const act = factureSwipeAction(x); return <SwipeRow key={x.id} id={"sheet-" + x.id} first={!i} label={act === "avoir" ? "Avoir" : "Supprimer"} tone={act === "avoir" ? "accent" : "danger"} onAction={() => swipeFacture(x)}><Row className="!rounded-none" first={!i} lead={<Ic I={x.type === "avoir" ? FileText : Receipt} />} t={`${label(x)} ${x.numero || "(brouillon)"}`} s={x.client_nom || "Client à renseigner"} r={e2(x.type === "avoir" ? -Number(x.total_ttc) : due(x))} rs={<Chip c={c}>{rels.some(r => r.facture_id === x.id) ? "Relance à valider" : l}</Chip>} onClick={() => setOpen(x.id)} label={`Ouvrir ${x.numero || "brouillon"}`} /></SwipeRow> })}
    </List>
    {err && <p className="mt-3 px-1 text-[13px] text-[#FF9B96]">{err}</p>}
  </Sheet>
}
const FRow = ({ l, v, strong }: { l: string; v: string; strong?: boolean }) => <div className={`ig-row flex min-h-11 items-center justify-between gap-3 py-2 pl-4 pr-4 ${strong ? "text-[16px] font-semibold" : "text-[15px]"}`}><span className={strong ? "text-white" : "text-white/55"}>{l}</span><span className={`tabular-nums ${strong ? "text-white" : "text-white/85"}`}>{v}</span></div>

function FactureDetail({ f, rels, close, reload, openOther, clients }: { f: Facture; rels: Rel[]; close: () => void; reload: () => Promise<void>; openOther: (id: string) => void; clients: Contact[] }) {
  const { toast, desk } = useC()
  const issued = f.statut === "emise" || f.statut === "envoyee" || f.statut === "payee" || f.statut === "annulee"
  const draft = f.statut === "brouillon" || (!f.numero && !issued)
  const [d, setD] = useState<Facture>(f), [busy, setBusy] = useState(""), [err, setErr] = useState(""), [mode, setMode] = useState("Virement")
  const [rel, setRel] = useState<Rel | null>(rels[0] || null)
  const [pickC, setPickC] = useState(false), [coordOpen, setCoordOpen] = useState(() => !(f.client_nom?.trim() && (f.client_email || f.client_telephone || f.client_adresse)))
  const [siteDiff, setSiteDiff] = useState(() => !!f.adresse_chantier && f.adresse_chantier !== f.client_adresse)
  useEffect(() => { setD(f) }, [f])
  const set = (p: Partial<Facture>) => { setD({ ...d, ...p }); setErr("") }
  const setLine = (i: number, p: Partial<FLine>) => set({ lignes: d.lignes.map((x, j) => j === i ? { ...x, ...p } : x) })
  const t = factureTotals(d)
  const saveDraft = async () => {
    const lignes = d.lignes.filter(x => x.l.trim() && Number(x.q) > 0).map(x => ({ l: x.l.trim(), q: Number(x.q), u: x.u || "u", pu: Number(x.pu) || 0, tv: Number(x.tv ?? 20), ...(x.rl && Number(x.rl.v) > 0 ? { rl: x.rl } : {}) }))
    const tt = factureTotals({ ...d, lignes })
    const ext = Number(d.retenue_garantie_pct) > 0 || Number(f.retenue_garantie_pct) > 0 ? { retenue_garantie_pct: Math.min(5, Math.max(0, Number(d.retenue_garantie_pct) || 0)) } : {}
    const { error } = await supabase.from("factures").update({ client_nom: d.client_nom, client_email: d.client_email || null, client_telephone: d.client_telephone || null, client_adresse: d.client_adresse || null, adresse_chantier: d.adresse_chantier || null, client_pro: !!d.client_pro, client_siren: d.client_siren?.replace(/\s/g, "") || null, client_tva: d.client_tva || null, objet: d.objet || null, autoliquidation: !!d.autoliquidation, tva_sur_debits: !!d.tva_sur_debits, nature: d.nature || "services", date_execution: d.date_execution || null, lignes, total_ht: tt.ht, total_tva: tt.tva, total_ttc: tt.ttc, ...ext }).eq("id", f.id)
    if (error) { setErr(Object.keys(ext).length ? "Retenue de garantie indisponible : appliquez la migration 20261121_10." : "Enregistrement impossible."); return false }
    return true
  }
  const run = async (k: string, fn: () => Promise<void>) => { setBusy(k); setErr(""); try { await fn() } finally { setBusy("") } }
  const emit = () => run("emit", async () => {
    if (!d.client_nom?.trim()) { setErr("Indiquez le nom du client."); return }
    if (!d.lignes.some(x => x.l.trim() && Number(x.q) > 0)) { setErr("Ajoutez au moins une ligne."); return }
    if (d.client_pro && !/^\d{9}$/.test((d.client_siren || "").replace(/\s/g, "").slice(0, 9))) { setErr("Client professionnel : le SIREN (9 chiffres) est obligatoire sur la facture."); return }
    if (!confirm("Émettre la facture ? Elle recevra un numéro définitif et ne pourra plus être modifiée (seulement annulée par un avoir).")) return
    if (!(await saveDraft())) return
    const r = await api("/api/devis", { action: "facture_emit", facture_id: f.id })
    if (!r.ok) { setErr(r.error || "Émission impossible."); return }
    toast(`${label(f)} n° ${r.numero} émis${f.type === "avoir" ? "" : "e"}`); await reload()
  })
  const download = () => run("pdf", async () => { const r = await downloadFacture(d); toast(r.facturx ? `${r.filename} · Factur-X (PDF/A-3 + XML)` : r.filename) })
  const send = () => run("send", async () => {
    const email = (d.client_email || "").trim() || prompt("E-mail du client ?") || ""
    if (!email) return
    const r = await api("/api/devis", { action: "facture_send", facture_id: f.id, email, pdf_base64: await b64(d) })
    if (!r.ok) { setErr(r.error || "Envoi impossible."); if (r.download) void downloadFacture(d); return }
    toast(`Envoyée à ${email}`); await reload()
  })
  const sendSms = () => run("sms", async () => {
    const phone = (d.client_telephone || "").trim() || prompt("Téléphone portable du client ?") || ""
    if (!phone) return
    if (!looksPhone(phone)) { setErr("Numéro de portable invalide (ex. 06 12 34 56 78)."); return }
    const r = await sendFactureSms(f.id, phone)
    if (!r.ok) { setErr(r.error || "Envoi par SMS impossible."); return }
    toast(`Lien envoyé par SMS au ${phone}`); await reload()
  })
  const tok = (f as Facture & { token?: string | null }).token
  const copyPay = () => { const u = payLink(webOrigin(), tok); if (!u) return; void navigator.clipboard?.writeText(u).catch(() => {}); toast("Lien de paiement copié") }
  const paid = (v: boolean) => run("paid", async () => {
    const r = await api("/api/devis", { action: "facture_paid", facture_id: f.id, paid: v, mode })
    if (!r.ok) { setErr(r.error || "Mise à jour impossible."); return }
    toast(v ? "Marquée payée · relances arrêtées" : "Marquée non payée"); await reload()
  })
  const avoir = () => run("avoir", async () => {
    if (!confirm("Créer un avoir pour annuler ou corriger cette facture ?")) return
    const r = await api("/api/devis", { action: "avoir", facture_id: f.id })
    if (!r.ok || typeof r.facture_id !== "string") { setErr(r.error || "Création impossible."); return }
    openOther(r.facture_id)
  })
  const sendRel = () => run("rel", async () => {
    if (!rel) return
    const r = await api("/api/devis", { action: "facture_relance_send", relance_id: rel.id, sujet: rel.sujet, corps: rel.corps, pdf_base64: await b64(d) })
    if (!r.ok) { setErr(r.error || "Envoi impossible."); if (r.copy && rel.corps) void navigator.clipboard?.writeText(rel.corps).catch(() => {}); return }
    toast("Relance envoyée"); setRel(null); await reload()
  })
  const ignoreRel = () => run("rel", async () => {
    if (!rel) return
    await supabase.from("facture_relances").update({ statut: "ignoree" }).eq("id", rel.id)
    setRel(null); await reload()
  })
  const delDraft = () => run("del", async () => {
    if (!confirm("Supprimer ce brouillon ?")) return
    const { error } = await supabase.from("factures").delete().eq("id", f.id).is("numero", null)
    if (error) { setErr("Suppression impossible."); return }
    close()
  })
  const miss = missingLegal("facture")
  const [stl, stc] = late(f) ? ["En retard", RED] : ST[f.statut] || ST.brouillon
  const ro = !draft
  const v = (k: keyof Facture) => ({ value: String(d[k] ?? ""), disabled: ro, onChange: (e: { target: { value: string } }) => set({ [k]: e.target.value } as Partial<Facture>) })
  const sum = <div className="mb-2.5 flex items-baseline justify-between gap-3 px-1" aria-label={`Total ${e2(t.ttc)} TTC`}>
    <span className="truncate text-[12px] tabular-nums text-white/45">HT {e2(t.ht)}{!CO.tvaNA && ` · TVA ${e2(t.tva)}`}{(t.acompte > 0 || t.retenue > 0) && ` · net ${e2(t.net)}`}</span>
    <span className="shrink-0 text-[19px] font-semibold tabular-nums tracking-[-0.02em]">{e2(t.ttc)}<span className="ml-1 text-[12px] font-medium text-white/45">TTC</span></span>
  </div>
  return <Sheet title={`${label(f)} ${f.numero || ""}`.trim()} sub={<Chip c={stc}>{stl}</Chip>} c="#FFFFFF" onClose={close}
    footer={<div className="kb-hide">{sum}{draft
      ? <div className="flex gap-2"><Btn className="flex-1" disabled={!!busy} onClick={() => run("save", async () => { if (await saveDraft()) { toast("Brouillon enregistré"); await reload() } })}>Enregistrer</Btn><Btn primary className="flex-1" disabled={!!busy} onClick={emit}>{busy === "emit" ? "Validation…" : "Valider la facture"}</Btn></div>
      : <div className="flex gap-2"><Btn className="shrink-0 !px-4" disabled={!!busy} onClick={download} aria-label="Voir le PDF"><Download size={17} />{busy === "pdf" ? "…" : "PDF"}</Btn>
        {f.statut === "annulee" || f.type === "avoir" ? null
          : f.statut === "payee" ? <Btn className="min-w-0 flex-1" disabled={!!busy} onClick={send}><Send size={17} />Renvoyer</Btn>
          : !f.envoyee_le ? <Btn primary className="min-w-0 flex-1" disabled={!!busy} onClick={send} data-next-action><Send size={17} />{busy === "send" ? "Envoi…" : "Envoyer au client"}</Btn>
          : <Btn primary c={GREEN} className="min-w-0 flex-1" disabled={!!busy} onClick={() => paid(true)} data-next-action>{busy === "paid" ? "…" : "Marquer comme payée"}</Btn>}</div>}</div>}>
    <div data-facture-detail hidden />
    {(() => { // update71 · une seule « prochaine étape », en clair
      if (f.type === "avoir" || f.statut === "annulee") return null
      if (draft) return <NextCard c="#2F7BFF" title="Vérifiez puis validez la facture" text="Une fois validée, elle reçoit son numéro définitif et ne se modifie plus (en cas d'erreur, on fait un avoir)." />
      if (f.statut === "payee") return <NextCard c={GREEN} tone="ok" title={`Payée${f.payee_le ? ` le ${new Date(f.payee_le).toLocaleDateString("fr-FR")}` : ""}`} text="Les relances sont arrêtées. Rien d'autre à faire." />
      if (!f.envoyee_le) return <NextCard c="#2F7BFF" title="Envoyez la facture au client" text="Il la reçoit par e-mail avec le PDF et un lien pour payer." >
        <div className="mt-3 flex flex-wrap gap-2"><Btn className="flex-1" disabled={!!busy} onClick={sendSms}><MessageSquare size={16} />{busy === "sms" ? "Envoi…" : "Par SMS"}</Btn>{tok && <Btn className="flex-1" onClick={copyPay}><Copy size={16} />Copier le lien</Btn>}</div></NextCard>
      return <NextCard c={late(f) ? AMBER : "#2F7BFF"} tone={late(f) ? "warn" : undefined} title={late(f) ? "Paiement en retard" : "En attente de paiement"} text={late(f) ? "Akno relance le client à J+1, J+7 et J+15. Dès que vous recevez le paiement, marquez la facture payée." : "Dès que vous recevez le paiement, marquez la facture payée. Akno relance le client si l'échéance passe."}>
        <div className="mt-3 flex flex-wrap gap-2">{tok && <Btn className="flex-1" onClick={copyPay}><Copy size={16} />Lien de paiement</Btn>}<Btn className="flex-1" disabled={!!busy} onClick={sendSms}><MessageSquare size={16} />{busy === "sms" ? "Envoi…" : "Renvoyer par SMS"}</Btn></div></NextCard>
    })()}
    {draft && miss.length > 0 && <div className="mb-5 rounded-[14px] bg-[#FFB340]/[.09] px-4 py-3 text-[13.5px] text-white/80">Mentions manquantes (Paramètres › Entreprise) : {miss.join(", ")}.</div>}
    {rel && <Card className="mb-4 p-4">
      <div className="flex items-center gap-2 text-[15px] font-medium"><BellRing size={17} className="text-[#FFB340]" />{NIV[rel.niveau] || "Relance"} à valider</div>
      <input className={`${inp} mt-3`} value={rel.sujet || ""} onChange={e => setRel({ ...rel, sujet: e.target.value })} aria-label="Objet" />
      <textarea className={`${inp} mt-2 h-48 py-3 leading-snug`} value={rel.corps || ""} onChange={e => setRel({ ...rel, corps: e.target.value })} aria-label="Message" />
      <div className="mt-3 flex gap-2"><Btn className="flex-1" disabled={!!busy} onClick={ignoreRel}>Ignorer</Btn><Btn primary className="flex-1" disabled={!!busy} onClick={sendRel}>{busy === "rel" ? "Envoi…" : "Valider et envoyer"}</Btn></div>
    </Card>}
    <div className="space-y-7 [&_.ig]:!bg-[#1C1C1F] [&_.ig-card]:!bg-[#1C1C1F]">
      <IGroup title="Client" id="fa-g-client">
        <ClientRow value={d.client_nom || ""} phone={d.client_telephone || ""} email={d.client_email || ""} onOpen={() => setPickC(true)} disabled={ro} />
        <DisclosureRow open={coordOpen} onToggle={() => setCoordOpen(o => !o)} title="Coordonnées" sub={d.client_adresse || (d.client_email || d.client_telephone ? "Adresse à compléter" : "E-mail, téléphone, adresse")} />
        <Reveal open={coordOpen}><div>
          <IRow label="E-mail" htmlFor="fa-email"><input id="fa-email" className={ival} type="email" inputMode="email" autoComplete="email" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="Pour l'envoi de la facture" value={d.client_email || ""} onChange={e => set({ client_email: e.target.value })} /></IRow>
          <IRow label="Téléphone" htmlFor="fa-tel"><input id="fa-tel" className={ival} type="tel" inputMode="tel" autoComplete="tel" placeholder="06 12 34 56 78" {...v("client_telephone")} /></IRow>
          <IRow label="Adresse" htmlFor="fa-addr"><input id="fa-addr" className={ival} autoComplete="street-address" autoCapitalize="words" placeholder="N°, rue, code postal, ville" {...v("client_adresse")} /></IRow>
        </div></Reveal>
        <IToggleRow label="Client professionnel" sub="SIREN, pénalités de retard, indemnité de 40 €" on={!!d.client_pro} disabled={ro} onChange={() => !ro && set({ client_pro: !d.client_pro })} />
        <Reveal open={!!d.client_pro}><div>
          <IRow label="SIREN" htmlFor="fa-siren"><input id="fa-siren" className={ival} inputMode="numeric" autoComplete="off" placeholder="9 chiffres" {...v("client_siren")} /></IRow>
          <IRow label="N° TVA" htmlFor="fa-tva"><input id="fa-tva" className={ival} autoComplete="off" autoCapitalize="characters" placeholder="FR…" {...v("client_tva")} /></IRow>
          {!CO.tvaNA && <IToggleRow label="Autoliquidation" sub="Sous-traitance BTP : autoliquidation de la TVA" on={!!d.autoliquidation} disabled={ro} onChange={() => !ro && set({ autoliquidation: !d.autoliquidation })} />}
        </div></Reveal>
      </IGroup>
      <IGroup title="Chantier" id="fa-g-chantier" foot={f.type === "situation" && f.avancement_pct != null ? `Avancement cumulé : ${fmtPct(Number(f.avancement_pct))}${f.devis_numero ? ` · devis n° ${f.devis_numero}` : ""}` : undefined}>
        <IRow label="Objet" htmlFor="fa-objet"><input id="fa-objet" className={ival} placeholder="Ex. Remplacement chauffe-eau" autoCapitalize="sentences" {...v("objet")} /></IRow>
        <IToggleRow label="Identique à l'adresse client" sub={!siteDiff ? (d.client_adresse || "Adresse du client à compléter") : undefined} on={!siteDiff} disabled={ro} onChange={on => { if (ro) return; setSiteDiff(!on); if (on) set({ adresse_chantier: "" }) }} />
        <Reveal open={siteDiff}><IRow label="Adresse" htmlFor="fa-site"><input id="fa-site" className={ival} autoComplete="street-address" autoCapitalize="words" placeholder="Adresse du chantier" {...v("adresse_chantier")} /></IRow></Reveal>
        <IRow label="Travaux le" htmlFor="fa-date"><input id="fa-date" className={ival + " text-left"} type="date" {...v("date_execution")} /></IRow>
        <IRow label="Nature" htmlFor="fa-nature"><select id="fa-nature" className={ival + " appearance-none"} value={d.nature || "services"} disabled={ro} onChange={e => set({ nature: e.target.value })}>{Object.entries(NATURE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></IRow>
      </IGroup>
      {ro ? <section><div className="mb-1.5 px-4 text-[12.5px] font-medium uppercase tracking-[.06em] text-white/42">Prestations</div><LinesCard lines={d.lignes.map(x => ({ ...x, tv: CO.tvaNA || d.autoliquidation ? 0 : x.tv }))} tvaNA={CO.tvaNA || !!d.autoliquidation} noTotals /></section> : <section>
        <div className="mb-1.5 px-4 text-[12.5px] font-medium uppercase tracking-[.06em] text-white/42">Prestations{d.lignes.length > 0 && <span className="ml-1.5 normal-case tracking-normal text-white/30">· {d.lignes.length} ligne{d.lignes.length > 1 ? "s" : ""}</span>}</div>
        <div className="space-y-2.5">
          {d.lignes.map((x, i) => <ServiceLineCard key={i} x={x} ro={ro} defaultTv={Number(x.tv) > 0 ? Number(x.tv) : 20} tvaNA={CO.tvaNA || !!d.autoliquidation} idPrefix={`fa-${i}`} index={i + 1} onPatch={p => setLine(i, p)}
            menu={!ro ? <button type="button" aria-label="Supprimer la ligne" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/35 hover:text-[#FF9B96]" onClick={() => set({ lignes: d.lignes.filter((_, j) => j !== i) })}><Trash2 size={16} /></button> : undefined} />)}
          {!ro && <button type="button" className="ig-card flex h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-[#141416] text-[15.5px] font-medium text-[#7EA6FF] transition-colors active:bg-white/[.06]" onClick={() => set({ lignes: [...d.lignes, { l: "", q: 1, u: "", pu: 0, tv: CO.tvaNA || d.autoliquidation ? 0 : 20 }] })}><Plus size={17} strokeWidth={2.2} />Ajouter une ligne</button>}
        </div>
      </section>}
      {(!CO.tvaNA || (f.type !== "avoir" && f.type !== "acompte")) && <IGroup title="Conditions" id="fa-g-cond">
        {!CO.tvaNA && <IToggleRow label="TVA sur les débits" sub="Option pour le paiement de la TVA d'après les débits" on={!!d.tva_sur_debits} disabled={ro} onChange={() => !ro && set({ tva_sur_debits: !d.tva_sur_debits })} />}
        {f.type !== "avoir" && f.type !== "acompte" && <IToggleRow label="Retenue de garantie" sub={Number(d.retenue_garantie_pct) > 0 ? fmtPct(Number(d.retenue_garantie_pct)) + " du TTC" : "5 % maximum"} on={Number(d.retenue_garantie_pct) > 0} disabled={ro} onChange={() => !ro && set({ retenue_garantie_pct: Number(d.retenue_garantie_pct) > 0 ? 0 : 5 })} />}
      </IGroup>}
      <IGroup title="Total" id="fa-g-total" foot={f.date_echeance ? `Échéance : ${new Date(f.date_echeance + "T12:00:00").toLocaleDateString("fr-FR")}` : undefined}>
        <FRow l="Total HT" v={e2(t.ht)} />
        {t.rates.map(r => <FRow key={r.r} l={`TVA ${String(r.r).replace(".", ",")} %`} v={e2(r.tva)} />)}
        {CO.tvaNA && <FRow l="TVA non applicable, art. 293 B du CGI" v="" />}
        <FRow l="Total TTC" v={e2(t.ttc)} strong />
        {t.acompte > 0 && <FRow l="Acomptes déduits" v={`- ${e2(t.acompte)}`} />}
        {t.retenue > 0 && <FRow l="Retenue de garantie" v={`- ${e2(t.retenue)}`} />}
        {(t.acompte > 0 || t.retenue > 0) && <FRow l="Net à payer" v={e2(t.net)} strong />}
      </IGroup>
      {!draft && f.type !== "avoir" && <Card className="space-y-1 p-4 text-[13.5px]"><div className="font-medium">Virement bancaire</div>{CO.iban ? <><div className="text-white/70">IBAN {CO.iban}{CO.bic ? ` · BIC ${CO.bic}` : ""}</div><div className="text-white/70">Référence : <b>{f.reference_paiement || f.numero}</b></div></> : <div className="text-[#FFB340]">Ajoutez votre IBAN dans Paramètres › Entreprise pour qu'il figure sur la facture.</div>}</Card>}
      {!draft && <Card className="space-y-2 p-4 text-[13px]">
        <div className="flex items-center gap-2 font-medium"><ShieldCheck size={16} className="text-[#30D158]" />Facture électronique verrouillée</div>
        <div className="text-white/55">Numéro définitif, contenu figé{f.document_hash ? ` · empreinte SHA-256 ${f.document_hash.slice(0, 16)}…` : ""}. Le PDF est au format Factur-X (PDF/A-3 avec XML EN 16931). Correction uniquement par avoir.</div>
        <button className="flex items-center gap-1.5 text-white/70" onClick={() => void downloadFactureXml(d)}><FileCode2 size={15} />Télécharger le XML seul</button>
      </Card>}
      {!draft && f.type !== "avoir" && f.statut !== "annulee" && <Card className="space-y-3 p-4">
        {f.statut === "payee"
          ? <div className="flex items-center justify-between"><span className="text-[14px]">Payée{f.payee_le ? ` le ${new Date(f.payee_le).toLocaleDateString("fr-FR")}` : ""}</span><button className="text-[13px] text-white/50" onClick={() => paid(false)}>Annuler</button></div>
          : <><div className="text-[15px] font-medium">Paiement reçu ?</div><div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><select className={inp} value={mode} onChange={e => setMode(e.target.value)} aria-label="Mode de paiement">{["Virement", "Chèque", "Espèces", "Carte", "Autre"].map(m => <option key={m}>{m}</option>)}</select><Btn c={GREEN} primary disabled={!!busy} onClick={() => paid(true)}>Marquer comme payée</Btn></div></>}
        {f.statut !== "payee" && <button className="w-full text-[13.5px] text-white/55" onClick={avoir}>Corriger ou annuler par un avoir</button>}
      </Card>}
      {draft && <button className="w-full py-2 text-[13.5px] text-[#FF9B96]" onClick={delDraft}>Supprimer le brouillon</button>}
    </div>
    {err && <p className="mt-3 px-1 text-[13px] text-[#FF9B96]">{err}</p>}
    <div aria-hidden className="h-10" />
    <ContactSheet open={pickC} desk={desk} clients={clients} current={d.client_nom || ""} onClose={() => setPickC(false)} onPick={(c, isNew) => {
      setPickC(false)
      if (isNew) { set({ client_nom: c.name }); setCoordOpen(true) }
      else { const nx = { client_nom: c.name, client_email: c.email || d.client_email, client_telephone: c.phone || d.client_telephone, client_adresse: c.addr || d.client_adresse }; set(nx); setCoordOpen(!(nx.client_email || nx.client_telephone || nx.client_adresse)) }
    }} />
  </Sheet>
}
