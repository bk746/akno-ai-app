import { useCallback, useEffect, useRef, useState } from "react"
import { BellRing, Download, FileCode2, FileText, Plus, Receipt, Send, ShieldCheck, Trash2 } from "lucide-react"
import { AMBER, Btn, Card, Chip, F, GREEN, GREY, Ic, List, RED, Row, Sheet, Tg, inp, tx, useC } from "../ui"
import { supabase } from "../../lib/supabase"
import { api } from "../../lib/accountApi"
import { CO, e2, missingLegal } from "../../lib/devisDoc"
import { NATURE, TYPE_LABEL, downloadFacture, downloadFactureXml, factureFile, factureTotals, type FLine, type Facture } from "../../lib/facturePdf"
import { fmtPct } from "../../../api/_lib/factureCalc"

/* update46 · Factures : brouillon → émise (numéro légal) → envoyée → payée, avoirs, relances d'impayés validées par l'artisan. */
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

export default function FacturesSheet({ close, openId, startNew }: { close: () => void; openId?: string; startNew?: boolean }) {
  const [rows, setRows] = useState<Facture[] | null>(null), [rels, setRels] = useState<Rel[]>([])
  const [tab, setTab] = useState<"todo" | "all" | "paid">("all"), [open, setOpen] = useState<string | null>(openId || null), [err, setErr] = useState("")
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
  useEffect(() => { if (startNew && rows !== null && !err && !started.current) { started.current = true; void newBlank() } }, [startNew, rows, err]) // eslint-disable-line react-hooks/exhaustive-deps
  if (open && rows) { const f = rows.find(x => x.id === open); if (f) return <FactureDetail f={f} rels={rels.filter(r => r.facture_id === f.id)} close={() => { setOpen(null); void load() }} reload={load} openOther={id => { void load().then(() => setOpen(id)) }} /> }
  const unpaid = (rows || []).filter(x => (x.statut === "emise" || x.statut === "envoyee") && x.type !== "avoir")
  const list = (rows || []).filter(x => tab === "all" ? true : tab === "paid" ? x.statut === "payee" : late(x) || rels.some(r => r.facture_id === x.id) || x.statut === "brouillon")
  return <Sheet title="Factures" sub={rows ? `${unpaid.length} à encaisser · ${e2(unpaid.reduce((a, x) => a + due(x), 0))}` : "Chargement…"} c="#FFFFFF" onClose={close} footer={<Btn primary className="w-full" onClick={newBlank}><Plus size={18} />Nouvelle facture</Btn>}>
    {rels.length > 0 && <Card className="mb-4 p-4"><div className="flex items-center gap-2 text-[15px] font-medium"><BellRing size={17} className="text-[#FFB340]" />{rels.length} relance{rels.length > 1 ? "s" : ""} d'impayé à valider</div><div className={`mt-1 ${tx.cap}`}>Akno prépare le texte, vous relisez et envoyez. Rien ne part sans vous.</div></Card>}
    <div className="mb-3 flex gap-2">{([["all", "Toutes"], ["todo", "À traiter"], ["paid", "Payées"]] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`h-9 rounded-full px-4 text-[14px] font-medium ${tab === k ? "bg-white text-black" : "bg-white/[.07] text-white/70"}`}>{l}</button>)}</div>
    <List empty="Aucune facture. Créez-en une depuis un devis accepté ou avec « Nouvelle facture »." I={Receipt}>
      {list.map((x, i) => { const [l, c] = late(x) ? ["En retard", RED] : ST[x.statut] || ST.brouillon; return <Row key={x.id} first={!i} lead={<Ic I={x.type === "avoir" ? FileText : Receipt} />} t={`${label(x)} ${x.numero || "(brouillon)"}`} s={x.client_nom || "Client à renseigner"} r={e2(x.type === "avoir" ? -Number(x.total_ttc) : due(x))} rs={<Chip c={c}>{rels.some(r => r.facture_id === x.id) ? "Relance à valider" : l}</Chip>} onClick={() => setOpen(x.id)} label={`Ouvrir ${x.numero || "brouillon"}`} /> })}
    </List>
    {err && <p className="mt-3 px-1 text-[13px] text-[#FF9B96]">{err}</p>}
  </Sheet>
}

function FactureDetail({ f, rels, close, reload, openOther }: { f: Facture; rels: Rel[]; close: () => void; reload: () => Promise<void>; openOther: (id: string) => void }) {
  const { toast } = useC()
  const draft = !f.numero
  const [d, setD] = useState<Facture>(f), [busy, setBusy] = useState(""), [err, setErr] = useState(""), [mode, setMode] = useState("Virement")
  const [rel, setRel] = useState<Rel | null>(rels[0] || null)
  useEffect(() => { setD(f) }, [f])
  const set = (p: Partial<Facture>) => { setD({ ...d, ...p }); setErr("") }
  const setLine = (i: number, p: Partial<FLine>) => set({ lignes: d.lignes.map((x, j) => j === i ? { ...x, ...p } : x) })
  const t = factureTotals(d)
  const saveDraft = async () => {
    const lignes = d.lignes.filter(x => x.l.trim() && Number(x.q) > 0).map(x => ({ l: x.l.trim(), q: Number(x.q), u: x.u || "u", pu: Number(x.pu) || 0, tv: Number(x.tv ?? 20) }))
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
  return <Sheet title={`${label(f)} ${f.numero || ""}`.trim()} sub={<Chip c={stc}>{stl}</Chip>} c="#FFFFFF" onClose={close}
    footer={draft
      ? <div className="flex gap-2"><Btn className="flex-1" disabled={!!busy} onClick={() => run("save", async () => { if (await saveDraft()) { toast("Brouillon enregistré"); await reload() } })}>Enregistrer</Btn><Btn primary className="flex-1" disabled={!!busy} onClick={emit}>{busy === "emit" ? "Émission…" : "Émettre"}</Btn></div>
      : <div className="flex gap-2"><Btn className="flex-1" disabled={!!busy} onClick={download}><Download size={17} />{busy === "pdf" ? "…" : "PDF"}</Btn>{f.statut !== "annulee" && <Btn primary className="flex-1" disabled={!!busy} onClick={send}><Send size={17} />{busy === "send" ? "Envoi…" : f.envoyee_le ? "Renvoyer" : "Envoyer"}</Btn>}</div>}>
    {draft && miss.length > 0 && <div className="mb-4 rounded-[16px] border border-[#FFB340]/30 bg-[#FFB340]/10 px-4 py-3 text-[13.5px] text-white/80">Mentions manquantes (Paramètres › Entreprise) : {miss.join(", ")}.</div>}
    {rel && <Card className="mb-4 p-4">
      <div className="flex items-center gap-2 text-[15px] font-medium"><BellRing size={17} className="text-[#FFB340]" />{NIV[rel.niveau] || "Relance"} à valider</div>
      <input className={`${inp} mt-3`} value={rel.sujet || ""} onChange={e => setRel({ ...rel, sujet: e.target.value })} aria-label="Objet" />
      <textarea className={`${inp} mt-2 h-48 py-3 leading-snug`} value={rel.corps || ""} onChange={e => setRel({ ...rel, corps: e.target.value })} aria-label="Message" />
      <div className="mt-3 flex gap-2"><Btn className="flex-1" disabled={!!busy} onClick={ignoreRel}>Ignorer</Btn><Btn primary className="flex-1" disabled={!!busy} onClick={sendRel}>{busy === "rel" ? "Envoi…" : "Valider et envoyer"}</Btn></div>
    </Card>}
    <div className="space-y-3">
      <F l="Client"><input className={inp} placeholder="Nom ou raison sociale" {...v("client_nom")} /></F>
      <div className="grid grid-cols-2 gap-2"><F l="E-mail"><input className={inp} type="email" value={d.client_email || ""} onChange={e => set({ client_email: e.target.value })} /></F><F l="Téléphone"><input className={inp} type="tel" {...v("client_telephone")} /></F></div>
      <F l="Adresse du client"><input className={inp} {...v("client_adresse")} /></F>
      <F l="Adresse du chantier (si différente)"><input className={inp} {...v("adresse_chantier")} /></F>
      <div className="flex items-center gap-3 px-1 text-[14px]"><Tg on={!!d.client_pro} onClick={() => !ro && set({ client_pro: !d.client_pro })} label="Client professionnel" />Client professionnel (SIREN, pénalités de retard, 40 €)</div>
      {d.client_pro && <div className="grid grid-cols-2 gap-2"><F l="SIREN du client"><input className={inp} inputMode="numeric" {...v("client_siren")} /></F><F l="TVA du client"><input className={inp} {...v("client_tva")} /></F></div>}
      {d.client_pro && !CO.tvaNA && <div className="flex items-center gap-3 px-1 text-[14px]"><Tg on={!!d.autoliquidation} onClick={() => !ro && set({ autoliquidation: !d.autoliquidation })} label="Autoliquidation" />Sous-traitance BTP : autoliquidation de la TVA</div>}
      <div className="grid grid-cols-[1.4fr_1fr] gap-2"><F l="Objet"><input className={inp} {...v("objet")} /></F><F l="Date des travaux"><input className={inp} type="date" {...v("date_execution")} /></F></div>
      <F l="Nature des opérations"><select className={inp} value={d.nature || "services"} disabled={ro} onChange={e => set({ nature: e.target.value })}>{Object.entries(NATURE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></F>
      {!CO.tvaNA && <div className="flex items-center gap-3 px-1 text-[14px]"><Tg on={!!d.tva_sur_debits} onClick={() => !ro && set({ tva_sur_debits: !d.tva_sur_debits })} label="TVA sur les débits" />Option pour le paiement de la TVA d'après les débits</div>}
      {f.type !== "avoir" && f.type !== "acompte" && <div className="flex items-center gap-3 px-1 text-[14px]"><Tg on={Number(d.retenue_garantie_pct) > 0} onClick={() => !ro && set({ retenue_garantie_pct: Number(d.retenue_garantie_pct) > 0 ? 0 : 5 })} label="Retenue de garantie" />Retenue de garantie {Number(d.retenue_garantie_pct) > 0 ? fmtPct(Number(d.retenue_garantie_pct)) : "(5 % max)"}</div>}
      {f.type === "situation" && f.avancement_pct != null && <div className={`px-1 ${tx.cap}`}>Avancement cumulé : {fmtPct(Number(f.avancement_pct))}{f.devis_numero ? ` · devis n° ${f.devis_numero}` : ""}</div>}
      <div className={`px-1 pt-2 ${tx.cap}`}>Lignes</div>
      {d.lignes.map((x, i) => <Card key={i} className="space-y-2 p-3">
        <div className="flex gap-2"><input className={inp} placeholder="Désignation" value={x.l} disabled={ro} onChange={e => setLine(i, { l: e.target.value })} />{!ro && <button aria-label="Supprimer la ligne" className="px-2 text-white/40" onClick={() => set({ lignes: d.lignes.filter((_, j) => j !== i) })}><Trash2 size={17} /></button>}</div>
        <div className="grid grid-cols-[minmax(0,1fr)_1fr_1.3fr_1fr] gap-2"><input className={inp} type="number" step="0.01" aria-label="Quantité" value={x.q} disabled={ro} onChange={e => setLine(i, { q: Number(e.target.value) })} /><input className={inp} aria-label="Unité" value={x.u || "u"} disabled={ro} onChange={e => setLine(i, { u: e.target.value })} /><input className={inp} type="number" step="0.01" aria-label="Prix unitaire HT" value={x.pu} disabled={ro} onChange={e => setLine(i, { pu: Number(e.target.value) })} /><select className={inp} aria-label="TVA" value={x.tv ?? 20} disabled={ro || CO.tvaNA || !!d.autoliquidation} onChange={e => setLine(i, { tv: Number(e.target.value) })}>{[20, 10, 5.5, 2.1, 0].map(r => <option key={r} value={r}>{String(r).replace(".", ",")} %</option>)}</select></div>
      </Card>)}
      {!ro && <Btn className="w-full" onClick={() => set({ lignes: [...d.lignes, { l: "", q: 1, u: "u", pu: 0, tv: 10 }] })}><Plus size={17} />Ajouter une ligne</Btn>}
      <Card className="space-y-1.5 p-4 text-[14px]">
        <div className="flex justify-between text-white/60"><span>Total HT</span><span>{e2(t.ht)}</span></div>
        {t.rates.map(r => <div key={r.r} className="flex justify-between text-white/60"><span>TVA {String(r.r).replace(".", ",")} %</span><span>{e2(r.tva)}</span></div>)}
        {CO.tvaNA && <div className="text-[12.5px] text-white/45">TVA non applicable, art. 293 B du CGI</div>}
        <div className="flex justify-between font-semibold"><span>Total TTC</span><span>{e2(t.ttc)}</span></div>
        {t.acompte > 0 && <div className="flex justify-between text-white/60"><span>Acomptes déduits</span><span>- {e2(t.acompte)}</span></div>}
        {t.retenue > 0 && <div className="flex justify-between text-white/60"><span>Retenue de garantie</span><span>- {e2(t.retenue)}</span></div>}
        {(t.acompte > 0 || t.retenue > 0) && <div className="flex justify-between font-semibold"><span>Net à payer</span><span>{e2(t.net)}</span></div>}
        {f.date_echeance && <div className={tx.cap}>Échéance : {new Date(f.date_echeance + "T12:00:00").toLocaleDateString("fr-FR")}</div>}
      </Card>
      {!draft && f.type !== "avoir" && <Card className="space-y-1 p-4 text-[13.5px]"><div className="font-medium">Virement bancaire</div>{CO.iban ? <><div className="text-white/70">IBAN {CO.iban}{CO.bic ? ` · BIC ${CO.bic}` : ""}</div><div className="text-white/70">Référence : <b>{f.reference_paiement || f.numero}</b></div></> : <div className="text-[#FFB340]">Ajoutez votre IBAN dans Paramètres › Entreprise pour qu'il figure sur la facture.</div>}</Card>}
      {!draft && <Card className="space-y-2 p-4 text-[13px]">
        <div className="flex items-center gap-2 font-medium"><ShieldCheck size={16} className="text-[#30D158]" />Facture électronique verrouillée</div>
        <div className="text-white/55">Numéro définitif, contenu figé{f.document_hash ? ` · empreinte SHA-256 ${f.document_hash.slice(0, 16)}…` : ""}. Le PDF est au format Factur-X (PDF/A-3 avec XML EN 16931). Correction uniquement par avoir.</div>
        <button className="flex items-center gap-1.5 text-white/70" onClick={() => void downloadFactureXml(d)}><FileCode2 size={15} />Télécharger le XML seul</button>
      </Card>}
      {!draft && f.type !== "avoir" && f.statut !== "annulee" && <Card className="space-y-3 p-4">
        {f.statut === "payee"
          ? <div className="flex items-center justify-between"><span className="text-[14px]">Payée{f.payee_le ? ` le ${new Date(f.payee_le).toLocaleDateString("fr-FR")}` : ""}</span><button className="text-[13px] text-white/50" onClick={() => paid(false)}>Annuler</button></div>
          : <div className="flex gap-2"><select className={inp} value={mode} onChange={e => setMode(e.target.value)} aria-label="Mode de paiement">{["Virement", "Chèque", "Espèces", "Carte", "Autre"].map(m => <option key={m}>{m}</option>)}</select><Btn c={GREEN} disabled={!!busy} onClick={() => paid(true)}>Marquer payée</Btn></div>}
        {f.statut !== "payee" && <button className="w-full text-[13.5px] text-white/55" onClick={avoir}>Corriger ou annuler par un avoir</button>}
      </Card>}
      {draft && <button className="w-full py-2 text-[13.5px] text-[#FF9B96]" onClick={delDraft}>Supprimer le brouillon</button>}
    </div>
    {err && <p className="mt-3 px-1 text-[13px] text-[#FF9B96]">{err}</p>}
  </Sheet>
}
