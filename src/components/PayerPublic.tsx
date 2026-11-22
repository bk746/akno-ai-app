import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"

/* update71 · Page publique de paiement d'une facture (/payer/:token) : montant à régler, virement (IBAN + référence)
   et, si l'artisan l'a activé (Stripe Connect), paiement en ligne par carte ou prélèvement SEPA sur le compte de l'artisan. */
type R = { numero: string; type: string; objet?: string | null; client_nom?: string | null; total_ttc: number; acompte_deduit: number; reste: number; date_emission?: string | null; date_echeance?: string | null
  payee: boolean; payee_le?: string | null; company: string; siret?: string; iban?: string; bic?: string; reference: string; online: boolean }
const eur = (n: number) => (Math.round(Number(n || 0) * 100) / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })
const fr = (iso?: string | null) => iso ? new Date(String(iso).slice(0, 10) + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : ""

export default function PayerPublic() {
  const { token = "" } = useParams()
  const [r, setR] = useState<R | null>(null), [err, setErr] = useState(""), [busy, setBusy] = useState(false), [copied, setCopied] = useState("")
  const back = new URLSearchParams(location.search).has("paye")
  useEffect(() => {
    document.title = "Régler votre facture"
    fetch(`/api/devis-public?facture=${encodeURIComponent(token)}`).then(async x => { const j = await x.json().catch(() => ({})); if (!x.ok || !j.numero) setErr(j.error || "Facture indisponible."); else setR(j) }).catch(() => setErr("Connexion impossible. Réessayez."))
  }, [token])
  const pay = async () => {
    setBusy(true); setErr("")
    const x = await fetch("/api/devis-public", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ facture: token, action: "pay" }) }).catch(() => null)
    const j = x ? await x.json().catch(() => ({})) : {}
    if (x?.ok && j.url) { location.href = j.url; return }
    setBusy(false); setErr(j.error || "Paiement en ligne indisponible : réglez par virement.")
  }
  const copy = (k: string, v: string) => { void navigator.clipboard?.writeText(v.replace(/\s/g, k === "iban" ? "" : " ")).then(() => { setCopied(k); setTimeout(() => setCopied(""), 1800) }).catch(() => {}) }
  const Line = ({ k, l, v }: { k: string; l: string; v: string }) => <div className="flex items-center gap-3 border-t border-black/[.06] px-5 py-3.5 first:border-t-0">
    <div className="min-w-0 flex-1"><div className="text-[13px] text-[#6E6E76]">{l}</div><div className="break-all text-[16px] font-medium tabular-nums">{v}</div></div>
    <button type="button" onClick={() => copy(k, v)} className="h-10 shrink-0 rounded-full bg-black/[.06] px-4 text-[14px] font-medium">{copied === k ? "Copié" : "Copier"}</button></div>
  return <div className="min-h-[100dvh] bg-[#F6F6F8] text-[#141416] antialiased" data-payer><div className="mx-auto max-w-[560px] px-5 pb-[max(48px,env(safe-area-inset-bottom))] pt-[max(40px,env(safe-area-inset-top))]">
    {err && !r ? <p className="text-[16px] text-[#8A8A90]">{err}</p> : !r ? <p className="text-[16px] text-[#8A8A90]">Chargement…</p> : <>
      <div className="text-[13px] font-medium uppercase tracking-[.08em] text-[#2F6BFF]">{r.type === "acompte" ? "Facture d'acompte" : "Facture"} n° {r.numero}</div>
      <h1 className="mt-2 break-words text-[26px] font-semibold leading-tight tracking-[-0.02em]">{r.company}</h1>
      {r.objet && <p className="mt-1 break-words text-[15px] text-[#6E6E76]">{r.objet}</p>}
      <div className="mt-6 rounded-[22px] bg-white p-5 shadow-sm">
        {r.payee || back ? <><div className="text-[15px] text-[#1E8E3E]">{r.payee ? "Facture réglée" : "Merci ! Paiement en cours de confirmation"}</div><div className="mt-1 text-[30px] font-semibold tabular-nums">{eur(r.payee ? r.total_ttc - r.acompte_deduit : r.reste)}</div>{r.payee_le && <div className="text-[14px] text-[#6E6E76]">le {fr(r.payee_le)}</div>}</>
          : <><div className="text-[15px] text-[#6E6E76]">Montant à régler</div><div className="mt-1 text-[34px] font-semibold tabular-nums tracking-[-0.02em]">{eur(r.reste)}</div>
            <div className="text-[14px] text-[#6E6E76]">{r.acompte_deduit > 0 ? `Total ${eur(r.total_ttc)} − acompte déjà versé ${eur(r.acompte_deduit)}` : `Facture du ${fr(r.date_emission)}`}{r.date_echeance ? ` · à régler avant le ${fr(r.date_echeance)}` : ""}</div></>}
      </div>
      {!r.payee && !back && <>
        {r.online && <button type="button" onClick={pay} disabled={busy} className="mt-5 h-14 w-full rounded-full bg-[#2F6BFF] text-[17px] font-semibold text-white disabled:opacity-60">{busy ? "Ouverture du paiement…" : "Payer par carte ou prélèvement"}</button>}
        <h2 className="mt-7 text-[18px] font-semibold">{r.online ? "Ou payer par virement" : "Payer par virement"}</h2>
        {r.iban ? <div className="mt-3 overflow-hidden rounded-[22px] bg-white shadow-sm">
          <Line k="iban" l="IBAN" v={r.iban} />{r.bic && <Line k="bic" l="BIC" v={r.bic} />}<Line k="ref" l="Référence à indiquer" v={r.reference} /><Line k="amt" l="Montant" v={eur(r.reste)} />
        </div> : <p className="mt-2 text-[15px] text-[#6E6E76]">Contactez {r.company} pour obtenir ses coordonnées bancaires. Référence : {r.reference}.</p>}
        {err && <p className="mt-4 text-[14px] text-[#C5221F]">{err}</p>}
      </>}
      <p className="mt-8 text-[12.5px] text-[#8A8A90]">{r.siret ? `${r.company} · SIRET ${r.siret} · ` : ""}Facture transmise via Akno.</p>
    </>}
  </div></div>
}
