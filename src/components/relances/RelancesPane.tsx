/* Refonte iOS · onglet Factures > Relances (maquettes 06-Factures/facturation-relances, 07-Relances).
   - Relances auto J+3 / J+7 / J+15 (réglage artisans.relances_auto, envoyées par le cron /api/relances).
   - Factures impayées → « Relancer » : feuille d'envoi SMS (Twilio) / E-mail (Resend) / Appel IA, via /api/devis action facture_relance_now.
   - Devis sans réponse → fiche devis (relance du devis existante) ; Clients à rappeler → appel direct.
   - Toucher une facture → historique de ses relances (table facture_relances, lecture RLS). */
import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Check, ChevronRight, CircleCheck, FileText, Link2, Mail, MessageSquareText, Phone, PhoneCall, Repeat2, ShieldCheck } from "lucide-react"
import ModalSheet from "../sheet/ModalSheet"
import { useC, type QAi } from "../ui"
import { dueOf, isLate, isUnpaid, refreshFactures, useFacturesLite, type FactureLite } from "../../lib/facturesLite"
import { useProfile } from "../../lib/profile"
import { supabase } from "../../lib/supabase"
import { api } from "../../lib/accountApi"
import { webOrigin } from "../../lib/native"
import { hapticSuccess, hapticTap } from "../../lib/haptics"
import type { Devis } from "../../lib/store"

const RED = "#E0221B", ORANGE = "#B25E00", BLUE = "#0071E3"
const eur = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString("fr-FR", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).replace(/\u202f|\u00a0/g, " ")} €`
const todayYmd = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" })
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5)
const ini = (n: string) => n.replace(/^(M\.|Mme)\s*/i, "").split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join("").toUpperCase() || "?"
const Av = ({ n }: { n: string }) => <span data-av className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold">{ini(n)}</span>
const frD = (iso?: string | null) => iso ? new Date(iso.length === 10 ? iso + "T12:00:00" : iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : ""
const frDT = (iso?: string | null) => iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }) : ""
export const lateLabel = (f: FactureLite) => { if (!f.date_echeance) return ""; const d = daysBetween(f.date_echeance, todayYmd()); return d > 0 ? `en retard de ${d} j` : d === 0 ? "échéance aujourd'hui" : `dans ${-d} j` }

const SmallBtn = ({ children, on, label }: { children: React.ReactNode; on: () => void; label: string }) =>
  <motion.button type="button" whileTap={{ scale: .94 }} aria-label={label} onClick={e => { e.stopPropagation(); void hapticTap(); on() }}
    className="h-8 shrink-0 rounded-full bg-[rgba(118,118,128,.12)] px-3.5 text-[14px] font-semibold text-[#000] [-webkit-tap-highlight-color:transparent]">{children}</motion.button>

function LRow({ lead, t, tc, s, sc, r, onClick, first }: { lead: React.ReactNode; t: string; tc?: string; s: React.ReactNode; sc?: string; r?: React.ReactNode; onClick?: () => void; first?: boolean }) {
  // pas de bouton imbriqué dans un bouton : la zone principale (avatar + textes) et l'action de droite sont deux contrôles frères
  return <div className="flex min-h-[64px] items-center gap-3 pl-1">
    {lead}
    <div className={`flex min-h-[64px] min-w-0 flex-1 items-center gap-2 py-2 ${first ? "" : "border-t border-[rgba(60,60,67,.16)]"}`}>
      <button type="button" disabled={!onClick} onClick={onClick} className="min-w-0 flex-1 text-left [-webkit-tap-highlight-color:transparent] active:opacity-60"><div className="truncate text-[17px] font-semibold leading-[22px] tracking-[-0.01em]" style={{ color: tc || "#000" }}>{t}</div><div className="truncate text-[15px] leading-5" style={{ color: sc || "#6E6E73" }}>{s}</div></button>
      {r}
    </div>
  </div>
}
const H2 = ({ t, aside }: { t: string; aside?: React.ReactNode }) => <div className="flex items-end justify-between px-1 pb-1"><h2 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-[#000]">{t}</h2>{aside && <span className="text-[15px] text-[#6E6E73]">{aside}</span>}</div>

export function useRelancesCounts() {
  const { s } = useC(), st = useFacturesLite()
  const late = (st.rows || []).filter(f => isLate(f) && f.type !== "avoir")
  const devis = s.devis.filter(d => d.status === "env" || d.status === "sans")
  const calls = s.calls.filter(c => c.callback)
  return { late, devis, calls, total: late.length + devis.length + calls.length }
}

/** Contenu de la vue Relances pour le gabarit Shell (même forme que les vues Devis / Factures). */
export function useRelancesView() {
  const { late, devis, calls, total } = useRelancesCounts()
  const parts = [late.length && `${late.length} facture${late.length > 1 ? "s" : ""}`, devis.length && `${devis.length} devis`, calls.length && `${calls.length} rappel${calls.length > 1 ? "s" : ""}`].filter(Boolean)
  return { fig: <span>{total}</span>, sub: <span className="flex flex-col items-center"><span>relances en cours</span>{parts.length > 0 && <span className="mt-1 text-[15px] text-[#A1A1A6]">{parts.join(" · ")}</span>}</span>, actions: [] as QAi[], body: <RelancesBody /> }
}

function RelancesBody() {
  const { s, modal, toast, go } = useC(), st = useFacturesLite(), { p: prof, save } = useProfile()
  const [send, setSend] = useState<FactureLite | null>(null), [hist, setHist] = useState<FactureLite | null>(null)
  useEffect(() => { void refreshFactures() }, [])
  const unpaid = useMemo(() => (st.rows || []).filter(f => isUnpaid(f) && f.type !== "avoir" && !!f.numero).sort((a, b) => Number(isLate(b)) - Number(isLate(a)) || String(a.date_echeance || "").localeCompare(String(b.date_echeance || ""))), [st.rows])
  const devis = s.devis.filter(d => d.status === "env" || d.status === "sans")
  const calls = s.calls.filter(c => c.callback).sort((a, b) => Number(b.urgent) - Number(a.urgent))
  const auto = prof?.relances_auto !== false
  const toggleAuto = async () => { void hapticTap("select"); const nx = !auto; const e = await save({ relances_auto: nx }); toast(e ? "Réglage indisponible pour le moment." : nx ? "Relances automatiques J+3, J+7, J+15 activées" : "Relances à valider avant envoi") }
  const sinceSent = (d: Devis) => d.sentAt ? daysBetween(d.sentAt.slice(0, 10), todayYmd()) : null
  return <>
    <button type="button" onClick={toggleAuto} role="switch" aria-checked={auto} className="flex w-full items-center gap-3 rounded-[16px] bg-[#F2F2F7] px-4 py-3 text-left">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#fff] text-[#000]"><ShieldCheck size={18} strokeWidth={1.75} /></span>
      <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold text-[#000]">Relances auto {auto ? "activées" : "en pause"}</span><span className="block text-[13px]" style={{ color: auto ? "#6E6E73" : ORANGE }}>J+3, J+7, J+15 après l'échéance{auto ? "" : " · à valider avant envoi"}</span></span>
      <span aria-hidden className="relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors" style={{ background: auto ? "#000" : "rgba(120,120,128,.16)" }}><span className="absolute top-[2px] h-[27px] w-[27px] rounded-full bg-[#fff] shadow-[0_3px_8px_rgba(0,0,0,.15)] transition-all" style={{ left: auto ? 22 : 2 }} /></span>
    </button>
    <section>
      <H2 t="Factures impayées" aside={unpaid.length || undefined} />
      {unpaid.length ? unpaid.map((f, i) => <LRow key={f.id} first={i === 0} onClick={() => setHist(f)} lead={<Av n={f.client_nom || "?"} />} t={f.client_nom || "Client"} tc={isLate(f) ? RED : undefined}
        s={<>{f.numero} · <span style={{ color: isLate(f) ? RED : ORANGE }}>{lateLabel(f)}</span></>}
        r={<div className="flex items-center gap-2"><span className="text-[15px] font-semibold tabular-nums">{eur(dueOf(f))}</span><SmallBtn label={`Relancer ${f.client_nom || ""}`} on={() => setSend(f)}>Relancer</SmallBtn></div>} />)
        : <Empty t={st.rows === null ? "Chargement…" : "Aucune facture impayée. Tout est encaissé."} />}
    </section>
    <section>
      <H2 t="Devis sans réponse" aside={devis.length || undefined} />
      {devis.length ? devis.map((d, i) => { const n = sinceSent(d); return <LRow key={d.id} first={i === 0} onClick={() => modal({ kind: "devisPrev", data: d })} lead={<Av n={d.client} />} t={d.client} tc={n !== null && n >= 10 ? RED : undefined}
        s={<>D-{d.num} · <span style={{ color: n !== null && n >= 10 ? RED : ORANGE }}>{n === null ? "envoyé" : `sans retour ${n} j`}</span></>}
        r={<div className="flex items-center gap-2"><span className="text-[15px] font-semibold tabular-nums">{eur(d.amount)}</span><SmallBtn label={`Relancer le devis de ${d.client}`} on={() => modal({ kind: "devisPrev", data: d })}>Relancer</SmallBtn></div>} /> })
        : <Empty t="Aucun devis en attente de réponse." />}
    </section>
    <section>
      <H2 t="Clients à rappeler" aside={calls.length || undefined} />
      {calls.length ? calls.map((c, i) => <LRow key={c.id} first={i === 0} onClick={() => modal({ kind: "client", data: { name: c.name, call: c.id } })} lead={<Av n={c.name} />} t={c.name}
        s={<>{c.tag || c.topic}{c.urgent ? <span style={{ color: RED }}> · urgent</span> : c.day ? ` · ${c.day.toLowerCase()}` : ""}</>}
        r={c.phone ? <a href={`tel:${c.phone.replace(/\s/g, "")}`} onClick={e => { e.stopPropagation(); void hapticTap() }} className="h-8 shrink-0 rounded-full bg-[rgba(118,118,128,.12)] px-3.5 text-[14px] font-semibold leading-8 text-[#000]">Appeler</a> : undefined} />)
        : <Empty t="Personne à rappeler." />}
    </section>
    <button type="button" onClick={() => go("rel")} className="flex w-full items-center gap-3 rounded-[16px] bg-[#F2F2F7] px-4 py-3 text-left">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#fff] text-[#000]"><Repeat2 size={18} strokeWidth={1.75} /></span>
      <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold text-[#000]">Relances de devis et demandes d'avis</span><span className="block text-[13px] text-[#6E6E73]">Historique et programmation</span></span><ChevronRight size={18} className="text-[#C7C7CC]" />
    </button>
    <AnimatePresence>{send && <RelanceSendSheet key="send" f={send} onClose={() => setSend(null)} />}</AnimatePresence>
    <AnimatePresence>{hist && <RelanceHistorySheet key="hist" f={hist} onClose={() => setHist(null)} onSend={() => { const f = hist; setHist(null); setTimeout(() => setSend(f), 260) }} />}</AnimatePresence>
  </>
}
const Empty = ({ t }: { t: string }) => <div className="flex h-[72px] items-center justify-center gap-2 rounded-[16px] bg-[#F2F2F7] text-[15px] text-[#6E6E73]"><Check size={16} />{t}</div>

type Full = { id: string; numero: string | null; client_nom: string | null; client_email: string | null; client_telephone: string | null; token: string | null; date_echeance: string | null; date_emission: string | null; envoyee_le: string | null; payee_le: string | null; statut: string }
type Canal = "sms" | "email" | "appel"

/** Feuille « Relance » : SMS · E-mail · Appel IA, message modifiable, lien de paiement. */
export function RelanceSendSheet({ f, onClose }: { f: FactureLite; onClose: () => void }) {
  const { s, flash, toast } = useC()
  const [full, setFull] = useState<Full | null>(null), [canal, setCanal] = useState<Canal>("email"), [busy, setBusy] = useState(false)
  const [sujet, setSujet] = useState(""), [corps, setCorps] = useState(""), [sms, setSms] = useState(""), [link, setLink] = useState(true), [err, setErr] = useState("")
  const company = s.settings.company || "notre entreprise", due = eur(dueOf(f))
  useEffect(() => { let on = true; void supabase.from("factures").select("id, numero, client_nom, client_email, client_telephone, token, date_echeance, date_emission, envoyee_le, payee_le, statut").eq("id", f.id).maybeSingle().then(({ data }) => { if (on && data) setFull(data as Full) }); return () => { on = false } }, [f.id])
  const pay = full?.token ? `${webOrigin()}/payer/${full.token}` : ""
  useEffect(() => {
    const ech = f.date_echeance ? new Date(f.date_echeance + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) : ""
    setSujet(`Facture ${f.numero} en attente`)
    setCorps(`Bonjour,\n\nSauf erreur de notre part, la facture ${f.numero} de ${due}${ech ? `, échue le ${ech},` : ""} reste à ce jour impayée.${link && pay ? `\nVous pouvez la régler en ligne ici : ${pay}` : ""}\n\nMerci par avance. Cordialement,\n${company}`)
    setSms(`${company} : rappel, la facture ${f.numero} (${due}) reste à régler.${link && pay ? ` ${pay}` : ""}`)
  }, [f.id, f.numero, f.date_echeance, due, company, pay, link])
  const to = canal === "email" ? full?.client_email : full?.client_telephone
  const submit = async () => {
    if (busy) return
    setErr(""); setBusy(true)
    const r = await api("/api/devis", { action: "facture_relance_now", facture_id: f.id, canal, sujet, corps, sms })
    setBusy(false)
    if (!r.ok) { setErr(r.error || "La relance n'a pas pu partir."); return }
    void hapticSuccess(); void refreshFactures()
    ;(flash || toast)(canal === "sms" ? "Relance envoyée par SMS" : "Relance envoyée par e-mail")
    onClose()
  }
  const late = isLate(f)
  return <ModalSheet label="Relance" onClose={onClose} size="large" className="rounded-t-[22px]">
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between px-4 pt-2"><button type="button" onClick={onClose} className="text-[17px] text-[#000]">Annuler</button><span className="text-[17px] font-semibold">Relance</span><span className="w-[60px]" /></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <div className="px-1 pt-2 text-[12px] font-semibold uppercase tracking-[.04em] text-[#6E6E73]">Facture {f.numero}</div>
        <div className="px-1 text-[28px] font-bold leading-[34px] tracking-[-0.02em]">{f.client_nom || "Client"}</div>
        <div className="px-1 text-[15px]"><span className="font-semibold">{due}</span> · <span style={{ color: late ? RED : ORANGE }}>{lateLabel(f)}</span></div>
        <div className="mt-4 rounded-[14px] bg-[#fff] px-4 py-3"><div className="text-[15px] font-semibold">{f.client_nom || "Client"}</div><div className="truncate text-[13px] text-[#6E6E73]">{canal === "email" ? (full?.client_email || "E-mail du client à renseigner sur la facture") : (full?.client_telephone || "Portable du client à renseigner sur la facture")}</div></div>
        <div role="tablist" aria-label="Canal de relance" className="relative mt-3 flex h-10 rounded-[12px] bg-[rgba(118,118,128,.12)] p-[3px]">
          {([["sms", "SMS", MessageSquareText], ["email", "E-mail", Mail], ["appel", "Appel IA", PhoneCall]] as [Canal, string, any][]).map(([k, l, I]) => <button key={k} role="tab" type="button" aria-selected={canal === k} onClick={() => { void hapticTap("select"); setCanal(k); setErr("") }} className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-[9px] text-[14px] ${canal === k ? "font-semibold text-[#000]" : "font-medium text-[#3C3C43]"}`}>
            {canal === k && <motion.span layoutId="rel-canal" className="absolute inset-0 rounded-[9px] bg-[#fff] shadow-[0_1px_4px_rgba(0,0,0,.12)]" transition={{ type: "spring", stiffness: 520, damping: 40 }} />}<I size={15} strokeWidth={1.75} className="relative" /><span className="relative">{l}</span></button>)}
        </div>
        {canal === "email" && <div className="mt-3 overflow-hidden rounded-[14px] bg-[#fff]">
          <label className="flex items-center gap-2 border-b border-[rgba(60,60,67,.16)] px-4 py-3 text-[15px]"><span className="text-[#6E6E73]">Objet</span><input value={sujet} onChange={e => setSujet(e.target.value)} className="min-w-0 flex-1 bg-transparent outline-none" /></label>
          <textarea value={corps} onChange={e => setCorps(e.target.value)} rows={9} aria-label="Message" className="block w-full resize-none bg-transparent px-4 py-3 text-[15px] leading-[21px] outline-none" />
        </div>}
        {canal === "sms" && <div className="mt-3 rounded-[14px] bg-[#fff]"><textarea value={sms} onChange={e => setSms(e.target.value.slice(0, 480))} rows={5} aria-label="SMS" className="block w-full resize-none bg-transparent px-4 py-3 text-[15px] leading-[21px] outline-none" /><div className="px-4 pb-2 text-right text-[12px] text-[#6E6E73]">{sms.length} / 480</div></div>}
        {canal === "appel" && <div className="mt-3 rounded-[14px] bg-[#fff] px-4 py-4 text-[15px] leading-[21px]"><div className="font-semibold">Appel par la réceptionniste IA</div><div className="mt-1 text-[#6E6E73]">Bientôt disponible : l'IA appellera le client pour lui rappeler la facture et proposer le lien de paiement. En attendant, appelez-le vous-même.</div>
          {full?.client_telephone && <a href={`tel:${full.client_telephone.replace(/\s/g, "")}`} className="mt-3 flex h-11 items-center justify-center gap-2 rounded-full bg-[rgba(118,118,128,.12)] font-semibold text-[#000]"><Phone size={16} />Appeler {f.client_nom || "le client"}</a>}</div>}
        {canal !== "appel" && <div className="mt-3 overflow-hidden rounded-[14px] bg-[#fff]">
          <div className="flex items-center gap-3 px-4 py-3"><FileText size={18} className="text-[#6E6E73]" /><div className="min-w-0 flex-1"><div className="text-[15px]">Facture {f.numero}</div><div className="text-[12px] text-[#6E6E73]">Consultable depuis le lien de paiement</div></div></div>
          <button type="button" role="switch" aria-checked={link} disabled={!pay} onClick={() => setLink(!link)} className="flex w-full items-center gap-3 border-t border-[rgba(60,60,67,.16)] px-4 py-3 text-left disabled:opacity-40"><Link2 size={18} className="text-[#6E6E73]" /><div className="min-w-0 flex-1"><div className="text-[15px]">Lien de paiement</div><div className="text-[12px] text-[#6E6E73]">{pay ? "Paiement par carte · inclus" : "Indisponible pour cette facture"}</div></div>
            <span aria-hidden className="relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors" style={{ background: link && pay ? "#000" : "rgba(120,120,128,.16)" }}><span className="absolute top-[2px] h-[27px] w-[27px] rounded-full bg-[#fff] shadow-[0_3px_8px_rgba(0,0,0,.15)] transition-all" style={{ left: link && pay ? 22 : 2 }} /></span></button>
        </div>}
        {err && <div role="alert" className="mt-3 rounded-[12px] bg-[#E0221B]/10 px-4 py-3 text-[14px]" style={{ color: RED }}>{err}</div>}
      </div>
      <div className="shrink-0 px-4 pt-2" style={{ paddingBottom: "var(--sheet-bottom)" }}>
        <motion.button type="button" whileTap={{ scale: .97 }} onClick={submit} disabled={busy || canal === "appel" || !to} className="flex h-[52px] w-full items-center justify-center rounded-full bg-[#000] text-[17px] font-semibold text-[#fff] disabled:opacity-35">{busy ? "Envoi…" : canal === "appel" ? "Bientôt disponible" : "Envoyer la relance"}</motion.button>
      </div>
    </div>
  </ModalSheet>
}

type RelRow = { id: string; niveau: number; statut: string; canal: string; sent_at: string | null; prepared_at: string | null }
/** Feuille « Historique » d'une facture : émise, échue, relances (J+3 SMS, J+7 e-mail…), payée. */
export function RelanceHistorySheet({ f, onClose, onSend }: { f: FactureLite; onClose: () => void; onSend: () => void }) {
  const [rows, setRows] = useState<RelRow[] | null>(null)
  useEffect(() => { let on = true; void supabase.from("facture_relances").select("id, niveau, statut, canal, sent_at, prepared_at").eq("facture_id", f.id).order("niveau").then(({ data }) => { if (on) setRows((data || []) as RelRow[]) }); return () => { on = false } }, [f.id])
  const steps: { t: string; s: string; d?: string; c?: string; on?: boolean }[] = []
  if (f.date_emission) steps.push({ t: "Facture émise", s: f.numero || "", d: frD(f.date_emission) })
  if (f.date_echeance) steps.push({ t: "Facture échue", s: "Relances automatiques J+3, J+7 et J+15", d: frD(f.date_echeance), c: isLate(f) ? RED : undefined })
  for (const r of rows || []) steps.push({ t: r.niveau >= 4 ? "Mise en demeure" : `Relance ${r.niveau}${r.canal ? ` · ${r.canal}` : ""}`, s: r.statut === "envoyee" ? "Envoyée" : r.statut === "a_valider" ? "À valider" : "Ignorée", d: frDT(r.sent_at || r.prepared_at), c: r.statut === "a_valider" ? ORANGE : undefined })
  const paid = f.statut === "payee"
  if (paid) steps.push({ t: `Paiement reçu · ${eur(Number(f.total_ttc || 0))}`, s: "Réglée", d: frD(f.payee_le), c: BLUE, on: true })
  const sent = (rows || []).filter(r => r.statut === "envoyee").length
  return <ModalSheet label="Historique de la relance" onClose={onClose} size="large">
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between px-4 pt-2"><button type="button" onClick={onClose} className="text-[17px] text-[#000]">Fermer</button><span className="text-[17px] font-semibold">Historique</span><span className="w-[52px]" /></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        <div className="px-1 pt-2 text-[12px] font-semibold uppercase tracking-[.04em] text-[#6E6E73]">Facture {f.numero}</div>
        <div className="px-1 text-[28px] font-bold leading-[34px] tracking-[-0.02em]">{f.client_nom || "Client"}</div>
        <div className="px-1 text-[15px] text-[#6E6E73]">{f.objet ? `${f.objet} · ` : ""}{eur(dueOf(f))}</div>
        <div className="mt-4 rounded-[16px] bg-[#fff] px-4 py-2">
          {rows === null ? <div className="py-6 text-center text-[15px] text-[#6E6E73]">Chargement…</div> : steps.map((x, i) => <div key={i} className="relative flex gap-3 py-3">
            <div className="relative flex w-3 justify-center"><span className="mt-1.5 h-2.5 w-2.5 rounded-full" style={{ background: x.c || (i === steps.length - 1 ? "#000" : "#C7C7CC") }} />{i < steps.length - 1 && <span className="absolute top-5 bottom-[-14px] w-px bg-[rgba(60,60,67,.18)]" />}</div>
            <div className="min-w-0 flex-1"><div className="flex items-baseline justify-between gap-2"><span className="truncate text-[15px] font-semibold" style={{ color: x.c && x.on ? x.c : "#000" }}>{x.t}</span><span className="shrink-0 text-[13px] text-[#6E6E73]">{x.d}</span></div><div className="text-[13px]" style={{ color: x.c && !x.on ? x.c : "#6E6E73" }}>{x.s}</div></div>
          </div>)}
        </div>
        {paid && <div className="mt-3 flex items-center gap-3 rounded-[16px] bg-[#fff] px-4 py-3"><CircleCheck size={22} color={BLUE} /><div><div className="text-[15px] font-semibold">Réglée{sent ? ` après ${sent} relance${sent > 1 ? "s" : ""}` : ""}</div><div className="text-[13px] text-[#6E6E73]">Merci de votre suivi</div></div></div>}
      </div>
      {!paid && <div className="shrink-0 px-4 pt-2" style={{ paddingBottom: "var(--sheet-bottom)" }}><motion.button type="button" whileTap={{ scale: .97 }} onClick={onSend} className="flex h-[52px] w-full items-center justify-center rounded-full bg-[#000] text-[17px] font-semibold text-[#fff]">Relancer maintenant</motion.button></div>}
    </div>
  </ModalSheet>
}
