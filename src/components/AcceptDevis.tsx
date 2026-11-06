import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"

type Line = { l?: string; q?: number; pu?: number; u?: string; tv?: number }
type Info = {
  numero?: string
  objet?: string
  client_nom?: string
  company?: string
  lignes?: Line[]
  total_ht?: number
  total_ttc?: number
  tva_taux?: number
  statut?: string
  decided_at?: string
  error?: string
}

const eur = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[\u202f\u00a0]/g, " ") + " €"

export default function AcceptDevis() {
  const { token } = useParams()
  const [info, setInfo] = useState<Info | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")

  useEffect(() => {
    let on = true
    fetch(`/api/devis-public?token=${encodeURIComponent(token || "")}`)
      .then(r => r.json())
      .then(d => { if (on) setInfo(d) })
      .catch(() => { if (on) setInfo({ error: "Impossible de charger le devis." }) })
    return () => { on = false }
  }, [token])

  const act = async (action: "accept" | "refuse") => {
    if (action === "refuse" && !confirm("Refuser ce devis ?")) return
    setBusy(true); setErr("")
    try {
      const r = await fetch("/api/devis-public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action }),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || "Impossible d'enregistrer votre réponse."); setBusy(false); return }
      setInfo(d)
    } catch { setErr("Impossible d'enregistrer votre réponse.") }
    setBusy(false)
  }

  const lines = Array.isArray(info?.lignes) ? info!.lignes! : []
  const done = info?.statut === "val" || info?.statut === "ref"
  const decided = info?.decided_at ? new Date(info.decided_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric" }) : ""

  return (
    <div className="min-h-dvh bg-[#0c0c0e] px-4 py-10 text-white">
      <div className="mx-auto w-full max-w-[520px]">
        <div className="mb-8 text-center">
          <div className="text-[13px] uppercase tracking-[0.16em] text-[#0E8F8F]">Devis</div>
          <h1 className="mt-2 text-[28px] font-medium tracking-[-0.03em]">{info?.company || "Votre artisan"}</h1>
        </div>
        {!info && <div className="rounded-[24px] bg-white/[.04] p-8 text-center text-white/60">Chargement du devis…</div>}
        {info?.error && <div className="rounded-[24px] bg-white/[.04] p-8 text-center text-[#FF9B96]">{info.error}</div>}
        {info && !info.error && (
          <div className="rounded-[24px] border border-white/[.08] bg-[#141416] p-6 shadow-[0_24px_60px_-24px_rgba(0,0,0,.8)]">
            <div className="text-[13px] text-white/45">Devis n° {info.numero}</div>
            <div className="mt-1 text-[22px] font-medium tracking-[-0.02em]">{info.objet || "Travaux"}</div>
            {info.client_nom && <div className="mt-1 text-[14px] text-white/55">Pour {info.client_nom}</div>}
            {lines.length > 0 && (
              <div className="mt-5 divide-y divide-white/[.06] rounded-[16px] bg-white/[.03]">
                {lines.map((x, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 px-3 py-3 text-[13.5px]">
                    <div className="min-w-0">
                      <div>{x.l}</div>
                      <div className="text-[12px] text-white/40">{x.q} {x.u || "u"} × {eur(Number(x.pu) || 0)}</div>
                    </div>
                    <div className="shrink-0 text-white/80">{eur((Number(x.q) || 0) * (Number(x.pu) || 0))}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 space-y-1 text-[14px] text-white/60">
              {info.total_ht != null && <div className="flex justify-between"><span>Total HT</span><span>{eur(Number(info.total_ht))}</span></div>}
              {info.total_ht != null && info.total_ttc != null && <div className="flex justify-between"><span>TVA</span><span>{eur(Number(info.total_ttc) - Number(info.total_ht))}</span></div>}
              {info.total_ttc != null && <div className="flex justify-between text-[16px] font-medium text-white"><span>Total TTC</span><span>{eur(Number(info.total_ttc))}</span></div>}
            </div>
            {done ? (
              <div className={`mt-6 rounded-[16px] px-4 py-3 text-[14px] ${info.statut === "val" ? "bg-[#30D158]/15 text-[#7dff9f]" : "bg-white/[.06] text-white/70"}`}>
                {info.statut === "val" ? `Devis accepté${decided ? ` le ${decided}` : ""}. Merci.` : `Devis refusé${decided ? ` le ${decided}` : ""}.`}
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-2 gap-2">
                <button disabled={busy} onClick={() => act("refuse")} className="h-12 rounded-full bg-white/[.08] text-[15px] font-medium disabled:opacity-40">Refuser</button>
                <button disabled={busy} onClick={() => act("accept")} className="h-12 rounded-full bg-[#0E8F8F] text-[15px] font-semibold text-white disabled:opacity-40">{busy ? "Envoi…" : "Accepter le devis"}</button>
              </div>
            )}
            {err && <p className="mt-3 text-center text-[13px] text-[#FF9B96]">{err}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
