/* update71 · Suivi et compta : CA signé, CA encaissé, reste à encaisser, taux de transformation des devis ;
   export du journal des ventes (CSV, Excel) et du FEC pour le comptable. Paiement en ligne (Stripe Connect) : ConnectSheet. */
import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, ShieldCheck } from "lucide-react"
import { Btn, Card, Sheet, useC } from "../ui"
import { supabase } from "../../lib/supabase"
import { CO, e2, sirenOf } from "../../lib/devisDoc"
import { exportCsv, exportFec, pilotage, type FactLite } from "../../lib/compta"
import { connectOnboard, connectStatus } from "../../lib/chaine"

const save = (name: string, content: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
export function Tiles({ k }: { k: ReturnType<typeof pilotage> }) {
  const T = ({ l, v, s }: { l: string; v: string; s: string }) => <div className="min-w-0 rounded-[18px] bg-white/[.05] p-3.5"><div className="text-[13px] leading-tight text-white/55">{l}</div><div className="mt-1 break-words text-[20px] font-semibold tabular-nums leading-tight tracking-[-0.02em]">{v}</div><div className="mt-0.5 text-[12.5px] leading-tight text-white/45">{s}</div></div>
  return <div data-pilotage className="grid grid-cols-2 gap-2">
    <T l="Signé" v={e2(k.caSigne)} s={`${k.nbSignes} devis signé${k.nbSignes > 1 ? "s" : ""}`} />
    <T l="Encaissé" v={e2(k.caEncaisse)} s="Factures payées" />
    <T l="Reste à encaisser" v={e2(k.resteAEncaisser)} s={`${k.nbAEncaisser} facture${k.nbAEncaisser > 1 ? "s" : ""} en attente`} />
    <T l="Devis signés" v={`${k.tauxTransformation} %`} s={`${k.nbSignes} sur ${k.nbEnvoyes} envoyé${k.nbEnvoyes > 1 ? "s" : ""}`} />
  </div>
}

export default function PilotageSheet({ close }: { close: () => void }) {
  const { s, toast } = useC()
  const [year, setYear] = useState(new Date().getFullYear()), [rows, setRows] = useState<FactLite[] | null>(null)
  useEffect(() => { void (async () => {
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return
    const { data } = await supabase.from("factures").select("id, numero, type, statut, client_nom, nature, devis_id, total_ht, total_tva, total_ttc, acompte_deduit, retenue_garantie_pct, date_emission, payee_le, mode_paiement, objet").eq("artisan_id", user.id).limit(5000)
    setRows((data || []) as FactLite[])
  })() }, [])
  const dv = s.devis.map(d => ({ status: d.status, amount: d.amount, at: d.at, sentAt: d.sentAt }))
  const k = pilotage(dv, rows || [], year)
  const inYear = (rows || []).filter(f => f.numero && String(f.date_emission || "").startsWith(String(year)))
  const csv = () => { save(`Akno-ventes-${year}.csv`, exportCsv(inYear), "text/csv;charset=utf-8"); toast("Journal des ventes téléchargé") }
  const fec = () => { const siren = sirenOf(CO.siret); if (!siren) { toast("Ajoutez votre SIRET dans Réglages › Entreprise"); return } const r = exportFec(rows || [], { siren, year }); save(r.filename, r.content, "text/plain;charset=utf-8"); toast(`${r.filename} téléchargé`) }
  return <Sheet title="Suivi et comptabilité" sub="Chiffre d'affaires et exports" c="#FFFFFF" onClose={close}>
    <div className="mb-4 flex items-center justify-between rounded-[16px] bg-white/[.04] px-2 py-1.5">
      <button type="button" aria-label="Année précédente" onClick={() => setYear(y => y - 1)} className="flex h-11 w-11 items-center justify-center rounded-full text-white/70 active:bg-white/[.06]"><ChevronLeft size={20} /></button>
      <span className="text-[17px] font-semibold tabular-nums">{year}</span>
      <button type="button" aria-label="Année suivante" onClick={() => setYear(y => y + 1)} className="flex h-11 w-11 items-center justify-center rounded-full text-white/70 active:bg-white/[.06]"><ChevronRight size={20} /></button>
    </div>
    {rows === null ? <div className="h-[180px] animate-pulse rounded-[18px] bg-white/[.04]" /> : <Tiles k={k} />}
    <h3 className="mb-2 mt-6 px-1 text-[17px] font-semibold">Pour votre comptable</h3>
    <Card className="space-y-3 p-4">
      <p className="text-[15px] leading-snug text-white/70">Téléchargez les factures de {year} et envoyez le fichier à votre comptable.</p>
      <Btn primary className="w-full" disabled={!rows} onClick={csv}><FileSpreadsheet size={17} />Tableau Excel (CSV)</Btn>
      <Btn className="w-full" disabled={!rows} onClick={fec}><Download size={17} />Fichier FEC (format officiel)</Btn>
      <p className="text-[13px] leading-snug text-white/45">FEC : fichier des écritures comptables demandé par l'administration fiscale (ventes et encaissements). {inYear.length} facture{inYear.length > 1 ? "s" : ""} en {year}.</p>
    </Card>
  </Sheet>
}

export function ConnectSheet({ close }: { close: () => void }) {
  const { toast } = useC()
  const [st, setSt] = useState<{ enabled?: boolean; connected?: boolean; charges?: boolean } | null>(null), [busy, setBusy] = useState(false)
  useEffect(() => { void connectStatus().then(r => setSt(r.ok ? r as never : { enabled: false })) }, [])
  const go = async () => { setBusy(true); const r = await connectOnboard(); setBusy(false); if (r.ok && typeof r.url === "string") location.href = r.url; else toast(r.error || "Paiement en ligne indisponible") }
  return <Sheet title="Paiement en ligne" sub="Carte bancaire et prélèvement SEPA" c="#FFFFFF" onClose={close}>
    <Card className="space-y-3 p-4 text-[15px] leading-snug text-white/75">
      <p>Vos clients paient la facture ou l'acompte depuis le lien reçu, par carte ou prélèvement. L'argent arrive sur <b className="text-white">votre</b> compte bancaire, et la facture passe en « Payée » toute seule.</p>
      <p className="flex items-start gap-2 text-[13.5px] text-white/55"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-[#30D158]" />Service sécurisé par Stripe. Le virement reste toujours proposé à vos clients.</p>
    </Card>
    <div className="mt-4">{st === null ? <div className="h-12 animate-pulse rounded-full bg-white/[.06]" />
      : !st.enabled ? <p className="rounded-[16px] bg-white/[.04] px-4 py-3 text-[15px] text-white/70">Bientôt disponible. En attendant, vos clients paient par virement (IBAN et référence sur la facture).</p>
      : st.charges ? <p className="rounded-[16px] bg-[#30D158]/12 px-4 py-3 text-[15px] text-white">Activé : vos clients peuvent payer en ligne.</p>
      : <Btn primary className="w-full" disabled={busy} onClick={go}>{busy ? "Ouverture…" : st.connected ? "Terminer l'activation" : "Activer le paiement en ligne"}</Btn>}</div>
  </Sheet>
}
