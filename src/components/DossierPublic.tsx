import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"

/* update46 · Page publique du dossier de conformité (lien partagé par l'artisan à ses donneurs d'ordre). */
type D = { type: string; libelle: string; date_emission: string | null; date_expiration: string | null; valide: boolean; url: string }
type R = { company: string; siret: string; adresse: string; documents: D[] }
const fr = (iso?: string | null) => iso ? new Date(iso + "T12:00:00").toLocaleDateString("fr-FR") : "—"

export default function DossierPublic() {
  const { token = "" } = useParams()
  const [r, setR] = useState<R | null>(null), [err, setErr] = useState("")
  useEffect(() => {
    document.title = "Dossier de conformité"
    fetch(`/api/devis-public?dossier=${encodeURIComponent(token)}`).then(async x => { const j = await x.json().catch(() => ({})); if (!x.ok || !Array.isArray(j.documents)) setErr(j.error || "Dossier indisponible."); else setR(j as R) }).catch(() => setErr("Dossier indisponible."))
  }, [token])
  return <div className="min-h-[100dvh] bg-[#F6F6F8] text-[#141416] antialiased"><div className="mx-auto max-w-[640px] px-5 py-12">
    {err ? <p className="text-[15px] text-[#8A8A90]">{err}</p> : !r ? <p className="text-[15px] text-[#8A8A90]">Chargement…</p> : <>
      <div className="text-[13px] font-medium uppercase tracking-[.08em] text-[#0E8F8F]">Dossier de conformité</div>
      <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.03em]">{r.company}</h1>
      <p className="mt-1 text-[14px] text-[#6E6E76]">{[r.siret && `SIRET ${r.siret}`, r.adresse].filter(Boolean).join(" · ")}</p>
      <div className="mt-8 overflow-hidden rounded-[20px] bg-white shadow-sm">{r.documents.length ? r.documents.map((d, i) => <div key={i} className={`flex items-center gap-3 px-5 py-4 ${i ? "border-t border-black/[.06]" : ""}`}>
        <div className="min-w-0 flex-1"><div className="text-[15px] font-medium">{d.libelle}</div><div className="text-[13px] text-[#6E6E76]">Émis le {fr(d.date_emission)}{d.date_expiration ? ` · valable jusqu'au ${fr(d.date_expiration)}` : ""}</div></div>
        <span className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${d.valide ? "bg-[#30D158]/15 text-[#1E8E3E]" : "bg-[#FF5F57]/15 text-[#C5221F]"}`}>{d.valide ? "Valide" : "Expiré"}</span>
        {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="text-[14px] font-medium text-[#0E8F8F]">Voir</a>}
      </div>) : <p className="px-5 py-6 text-[14px] text-[#6E6E76]">Aucun document partagé.</p>}</div>
      <p className="mt-6 text-[12.5px] text-[#8A8A90]">Liens valables 1 heure. Document partagé via Akno.</p>
    </>}
  </div></div>
}
