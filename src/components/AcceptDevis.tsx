import { useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "react-router-dom"
import DevisPaper from "./DevisPaper"
import { CO, buildDoc, setCO, tvaReduiteDevis } from "../lib/devisDoc"
import type { SignProof } from "../lib/devisPdf"

/* update61 · Page publique de signature électronique du devis :
   devis complet (mentions légales), nom + case « Bon pour accord » + signature tracée,
   empreinte SHA-256 vérifiée par le serveur, journal de preuve, PDF signé avec certificat. */
type Line = { l?: string; q?: number; pu?: number; u?: string; tv?: number; k?: string; d?: string }
type Ev = NonNullable<SignProof["events"]>[number]
type Info = {
  numero?: string; objet?: string; client_nom?: string; client_adresse?: string | null; company?: string; lignes?: Line[]
  total_ht?: number; total_ttc?: number; tva_taux?: number; statut?: string; decided_at?: string; created_at?: string | null; envoye_le?: string | null
  document_hash?: string; artisan?: Record<string, unknown>; logo_url?: string; events?: Ev[]
  signed?: { nom: string; at: string; png?: string | null; hash?: string | null; certif_tva?: boolean | null } | null
  proof?: string; error?: string
}

const toDataUrl = (url: string) => fetch(url).then(r => r.blob()).then(b => new Promise<string>((ok, ko) => { const f = new FileReader(); f.onload = () => ok(String(f.result)); f.onerror = ko; f.readAsDataURL(b) }))

function SignaturePad({ onChange }: { onChange: (png: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null), drawing = useRef(false), last = useRef<[number, number] | null>(null), ink = useRef(0)
  useEffect(() => {
    const c = ref.current!, r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = r.width * dpr; c.height = r.height * dpr
    const g = c.getContext("2d")!; g.scale(dpr, dpr); g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = 2.4; g.strokeStyle = "#14141A"
  }, [])
  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as [number, number] }
  const down = (e: React.PointerEvent) => { e.preventDefault(); ref.current!.setPointerCapture(e.pointerId); drawing.current = true; last.current = pos(e) }
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return
    const g = ref.current!.getContext("2d")!, p = pos(e)
    g.beginPath(); g.moveTo(...last.current); g.lineTo(...p); g.stroke()
    ink.current += Math.hypot(p[0] - last.current[0], p[1] - last.current[1]); last.current = p
  }
  const up = () => { if (!drawing.current) return; drawing.current = false; last.current = null; onChange(ink.current > 40 ? ref.current!.toDataURL("image/png") : "") }
  const clear = () => { const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); ink.current = 0; onChange("") }
  return <div>
    <div className="relative overflow-hidden rounded-[14px] bg-white">
      <canvas ref={ref} aria-label="Zone de signature" className="block h-[150px] w-full touch-none" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
      <div className="pointer-events-none absolute inset-x-5 bottom-8 border-b border-dashed border-black/15" />
      <div className="pointer-events-none absolute bottom-2 left-5 text-[11px] text-black/35">Signez ici avec le doigt ou la souris</div>
    </div>
    <button type="button" onClick={clear} className="mt-1.5 text-[12.5px] text-white/50">Effacer</button>
  </div>
}

export default function AcceptDevis() {
  const { token } = useParams()
  const [info, setInfo] = useState<Info | null>(null), [ready, setReady] = useState(0)
  const [busy, setBusy] = useState(false), [err, setErr] = useState("")
  const [nom, setNom] = useState(""), [ok, setOk] = useState(false), [tvaOk, setTvaOk] = useState(false), [png, setPng] = useState("")

  useEffect(() => {
    let on = true
    fetch(`/api/devis-public?token=${encodeURIComponent(token || "")}`)
      .then(r => r.json())
      .then(async (d: Info) => {
        if (!on) return
        if (d.artisan) { setCO(d.artisan); CO.logo = ""; if (d.logo_url) { try { CO.logo = await toDataUrl(d.logo_url) } catch { /* logo facultatif */ } } }
        setInfo(d); setReady(x => x + 1)
      })
      .catch(() => { if (on) setInfo({ error: "Impossible de charger le devis." }) })
    return () => { on = false }
  }, [token])

  const doc = useMemo(() => {
    if (!info || info.error || !ready) return null
    const day = String(info.envoye_le || info.created_at || new Date().toISOString()).slice(0, 10)
    return buildDoc({ num: parseInt(String(info.numero || "").replace(/\D/g, ""), 10) || 0, objet: info.objet || "", amount: Number(info.total_ttc) || 0, client: info.client_nom || "", lines: (info.lignes || []) as never, addr: info.client_adresse || undefined }, undefined, Number(info.tva_taux) || 20, day)
  }, [info, ready])
  const reduced = !!doc && !CO.tvaNA && doc.lines.some(x => x.k !== "sec" && (x.tv === 10 || x.tv === 5.5))
  const energie = !!doc && doc.lines.some(x => x.k !== "sec" && x.tv === 5.5)

  const post = async (payload: Record<string, unknown>) => {
    setBusy(true); setErr("")
    try {
      const r = await fetch("/api/devis-public", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, ...payload }) })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || "Impossible d'enregistrer votre réponse."); setBusy(false); return }
      setInfo(x => ({ ...x, ...d }))
    } catch { setErr("Impossible d'enregistrer votre réponse.") }
    setBusy(false)
  }
  const sign = () => {
    if (nom.trim().length < 3) { setErr("Indiquez vos nom et prénom."); return }
    if (!png) { setErr("Tracez votre signature dans le cadre."); return }
    if (!ok) { setErr("Cochez « Bon pour accord »."); return }
    if (reduced && !tvaOk) { setErr("Cochez la certification relative au taux réduit de TVA."); return }
    void post({ action: "sign", nom: nom.trim(), signature: png, consent: true, certif_tva: reduced ? tvaOk : undefined, doc_hash: info?.document_hash })
  }
  const refuse = () => { if (confirm("Refuser ce devis ?")) void post({ action: "refuse" }) }
  const downloadSigned = async () => {
    if (!doc || !info?.signed) return
    const { downloadPdf } = await import("../lib/devisPdf")
    downloadPdf(doc, { nom: info.signed.nom, at: info.signed.at, png: info.signed.png, hash: info.signed.hash || info.document_hash || "", certifTva: info.signed.certif_tva, events: info.events })
  }

  const done = info?.statut === "val" || info?.statut === "ref"
  const decided = info?.decided_at ? new Date(info.decided_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""

  return (
    <div className="min-h-dvh bg-[#0c0c0e] px-4 pb-8 pt-[max(32px,calc(env(safe-area-inset-top)+16px))] text-white">
      <div className="mx-auto w-full max-w-[820px]">
        <div className="mb-6 text-center">
          <div className="text-[13px] uppercase tracking-[0.16em] text-[#3FD0C9]">{info?.signed ? "Devis signé" : info?.statut === "val" ? "Devis accepté" : info?.statut === "ref" ? "Devis refusé" : "Devis à signer"}</div>
          <h1 className="mt-2 text-[26px] font-medium tracking-[-0.03em]">{info?.company || "Votre artisan"}</h1>
          {info?.numero && <div className="mt-1 text-[14px] text-white/50">Devis n° {info.numero}{info.objet ? ` · ${info.objet}` : ""}</div>}
        </div>
        {!info && <div className="rounded-[24px] bg-white/[.04] p-8 text-center text-white/60">Chargement du devis…</div>}
        {info?.error && <div className="rounded-[24px] bg-white/[.04] p-8 text-center text-[#FF9B96]">{info.error}</div>}
        {doc && <DevisPaper d={doc} sig={info?.signed ? { nom: info.signed.nom, at: info.signed.at, png: info.signed.png } : undefined} />}
        {info && !info.error && <div className="mx-auto mt-6 max-w-[560px] rounded-[24px] border border-white/[.08] bg-[#141416] p-5 shadow-[0_24px_60px_-24px_rgba(0,0,0,.8)]">
          {done ? <>
            <div className={`rounded-[16px] px-4 py-3 text-[14px] ${info.statut === "val" ? "bg-[#30D158]/15 text-[#7dff9f]" : "bg-white/[.06] text-white/70"}`}>
              {info.statut === "val" ? (info.signed ? `Devis signé électroniquement par ${info.signed.nom}${decided ? ` le ${decided}` : ""}. Merci !` : `Devis accepté${decided ? ` le ${decided}` : ""}. Merci.`) : `Devis refusé${decided ? ` le ${decided}` : ""}.`}
            </div>
            {info.signed && <>
              <button onClick={downloadSigned} className="mt-3 h-12 w-full rounded-full bg-white text-[15px] font-semibold text-black">Télécharger le devis signé (PDF)</button>
              <p className="mt-3 break-all text-[11.5px] leading-[1.5] text-white/40">Empreinte SHA-256 du devis signé : {info.signed.hash || info.document_hash}</p>
            </>}
          </> : <>
            <div className="text-[17px] font-medium">Signer le devis</div>
            <p className="mt-1 text-[13px] leading-[1.5] text-white/55">Lisez le devis ci-dessus. En signant, vous indiquez l'avoir reçu avant l'exécution des travaux et l'accepter.</p>
            <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Vos nom et prénom" autoComplete="name" className="mt-4 h-12 w-full rounded-[14px] bg-white/[.06] px-4 text-[15px] outline-none placeholder:text-white/35" />
            <div className="mt-3"><SignaturePad onChange={setPng} /></div>
            <label className="mt-3 flex items-start gap-2.5 text-[13px] leading-[1.45] text-white/70"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#0E8F8F]" /><span>« Devis reçu avant l'exécution des travaux, <b>bon pour accord</b> ». J'accepte ce devis et ses conditions.</span></label>
            {reduced && <label className="mt-3 flex items-start gap-2.5 text-[12px] leading-[1.45] text-white/60"><input type="checkbox" checked={tvaOk} onChange={e => setTvaOk(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#0E8F8F]" /><span>{tvaReduiteDevis(energie)}</span></label>}
            <p className="mt-3 text-[11.5px] leading-[1.5] text-white/40">Signature électronique simple (règlement eIDAS, art. 1366 et 1367 du Code civil). Votre nom, votre signature, la date et l'heure, votre adresse IP, votre navigateur et l'empreinte SHA-256 du devis sont enregistrés comme preuve. Particulier : délai de rétractation de 14 jours si le devis est signé à distance (art. L221-18 du Code de la consommation).</p>
            <button disabled={busy} onClick={sign} className="mt-4 h-12 w-full rounded-full bg-[#0E8F8F] text-[15px] font-semibold text-white disabled:opacity-40">{busy ? "Signature…" : "Signer le devis"}</button>
            <button disabled={busy} onClick={refuse} className="mt-2 h-11 w-full rounded-full text-[14px] text-white/55 disabled:opacity-40">Refuser le devis</button>
          </>}
          {err && <p className="mt-3 text-center text-[13px] text-[#FF9B96]">{err}</p>}
        </div>}
      </div>
    </div>
  )
}
