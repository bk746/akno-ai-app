/* passe 2 · Signature sur place (maquettes 06-Factures/signature, signature-ok).
   Le client signe sur le téléphone de l'artisan : même circuit que la page publique /accept/:token
   (POST /api/devis-public action « sign » : nom, signature tracée, consentement, empreinte SHA-256, journal de preuve). */
import { useEffect, useRef, useState } from "react"
import { Check, ChevronRight, FileText, Lock, Loader2, X } from "lucide-react"
import ModalSheet from "../sheet/ModalSheet"
import { tvaReduiteDevis } from "../../lib/devisDoc"
import { hapticTap } from "../../lib/haptics"
import type { Devis } from "../../lib/store"

type Info = { numero?: string; objet?: string; client_nom?: string; client_adresse?: string | null; lignes?: { k?: string; tv?: number }[]; total_ttc?: number; tva_taux?: number; statut?: string; document_hash?: string
  signed?: { nom: string; at: string; png?: string | null } | null; error?: string }
const eur = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\u202f|\u00a0/g, " ")} €`
const longAt = (d: Date | string) => new Date(d).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(" à ", " à ")

function Pad({ onChange }: { onChange: (png: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null), drawing = useRef(false), last = useRef<[number, number] | null>(null), ink = useRef(0)
  const [has, setHas] = useState(false)
  useEffect(() => { const c = ref.current!, r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1); c.width = r.width * dpr; c.height = r.height * dpr; const g = c.getContext("2d")!; g.scale(dpr, dpr); g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = 2.6; g.strokeStyle = "#14141A" }, [])
  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as [number, number] }
  const down = (e: React.PointerEvent) => { e.preventDefault(); ref.current!.setPointerCapture(e.pointerId); drawing.current = true; last.current = pos(e) }
  const move = (e: React.PointerEvent) => { if (!drawing.current || !last.current) return; const g = ref.current!.getContext("2d")!, p = pos(e); g.beginPath(); g.moveTo(...last.current); g.lineTo(...p); g.stroke(); ink.current += Math.hypot(p[0] - last.current[0], p[1] - last.current[1]); last.current = p; if (!has) setHas(true) }
  const up = () => { if (!drawing.current) return; drawing.current = false; last.current = null; onChange(ink.current > 40 ? ref.current!.toDataURL("image/png") : "") }
  const clear = () => { const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); ink.current = 0; setHas(false); onChange("") }
  return <div className="relative h-[178px] overflow-hidden rounded-[20px] bg-[#fff]">
    <canvas ref={ref} aria-label="Zone de signature du client" className="block h-full w-full touch-none" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
    <span aria-hidden className="pointer-events-none absolute bottom-[46px] left-[42px] right-5 h-px bg-[rgba(60,60,67,.29)]" />
    <X aria-hidden size={16} strokeWidth={2} className="pointer-events-none absolute bottom-[38px] left-5 text-[#8E8E93]" />
    {!has && <span className="pointer-events-none absolute inset-x-0 top-[62px] text-center text-[15px] text-[#C7C7CC]">Signez ici avec le doigt</span>}
    <button type="button" onClick={clear} className="absolute right-3 top-3 h-8 rounded-full bg-[#F2F2F7] px-3 text-[14px] font-semibold text-[#3C3C43]">Effacer</button>
  </div>
}

export default function SignSheet({ dv, onClose, onSigned, onConvert, onPdf, chantier, acPct = 30 }: { acPct?: number; dv: Devis; onClose: () => void; onSigned: (at: string, nom: string) => void; onConvert: () => void; onPdf: () => void; chantier?: { title: string; sub: string; open: () => void } | null }) {
  const [info, setInfo] = useState<Info | null>(null), [png, setPng] = useState(""), [tvaOk, setTvaOk] = useState(false)
  const [busy, setBusy] = useState(false), [err, setErr] = useState(""), [done, setDone] = useState<{ at: string; nom: string; png: string } | null>(null)
  const [now] = useState(() => new Date())
  useEffect(() => { let on = true; fetch(`/api/devis-public?token=${encodeURIComponent(dv.token || "")}`).then(r => r.json()).then((d: Info) => { if (on) { setInfo(d); if (d.signed) setDone({ at: d.signed.at, nom: d.signed.nom, png: d.signed.png || "" }) } }).catch(() => { if (on) setInfo({ error: "Impossible de charger le devis." }) }); return () => { on = false } }, [dv.token])
  const total = Number(info?.total_ttc ?? dv.amount) || 0
  const acompte = Math.round(total * acPct) / 100
  const nLines = (info?.lignes || dv.lines || []).filter((x: { k?: string }) => x.k !== "sec").length
  const tvas = [...new Set((info?.lignes || []).filter(x => x.k !== "sec" && x.tv != null).map(x => Number(x.tv)))]
  const tvaL = tvas.length === 1 ? `TVA ${String(tvas[0]).replace(".", ",")} % incluse` : "TVA incluse"
  const reduced = tvas.some(t => t === 10 || t === 5.5)
  const nom = (info?.client_nom || dv.client || "").trim()
  const sign = async () => {
    if (!png) { setErr("Le client doit tracer sa signature dans le cadre."); return }
    if (reduced && !tvaOk) { setErr("Cochez la certification relative au taux réduit de TVA."); return }
    if (nom.length < 3) { setErr("Nom du client manquant sur le devis."); return }
    setBusy(true); setErr("")
    try {
      const r = await fetch("/api/devis-public", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: dv.token, action: "sign", nom, signature: png, consent: true, certif_tva: reduced ? tvaOk : undefined, doc_hash: info?.document_hash }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || "Signature non enregistrée."); setBusy(false); return }
      const at = d?.signed?.at || d?.decided_at || new Date().toISOString()
      void hapticTap(); setDone({ at, nom, png }); onSigned(at, nom)
    } catch { setErr("Signature non enregistrée. Vérifiez la connexion.") }
    setBusy(false)
  }
  const num = `N° ${info?.numero || dv.num}`
  const row = "flex min-h-[52px] items-center justify-between gap-3 px-[18px]", sep = "border-t border-[rgba(60,60,67,.16)]"
  return <ModalSheet label="Signature" onClose={onClose} z={60} size="large" className="bg-[#F2F2F7]">
    <div className="akno-light flex h-full min-h-0 flex-col">
      <div className="flex h-[54px] shrink-0 items-center justify-between px-5 pt-2.5">
        {done ? <span className="w-16" /> : <button type="button" onClick={onClose} className="text-[17px] text-[#000]">Fermer</button>}
        <span className="text-[17px] font-semibold text-[#000]">{done ? "" : "Signature"}</span>
        {done ? <button type="button" onClick={onClose} className="text-[17px] font-semibold text-[#000]">Terminé</button> : <span className="w-16" />}
      </div>
      {!info ? <div className="flex flex-1 items-center justify-center"><Loader2 className="animate-spin text-[#8E8E93]" /></div>
        : info.error ? <p className="px-5 pt-6 text-[15px] text-[#B3261E]">{info.error}</p>
        : done ? <>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
            <div className="flex flex-col items-center pt-10 text-center">
              <span className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-[#0A84FF] text-[#fff] shadow-[0_10px_30px_rgba(10,132,255,.35)]"><Check size={40} strokeWidth={2.4} /></span>
              <h1 className="mt-6 text-[30px] font-bold leading-9 text-[#000]">Devis signé</h1>
              <div className="mt-1 text-[17px] text-[#6E6E73]">{nom} · {num}</div>
            </div>
            <div className="mt-6 overflow-hidden rounded-[20px] bg-[#fff]">
              <div className={row}><span className="text-[17px] text-[#6E6E73]">Total TTC</span><b className="text-[17px] font-semibold tabular-nums text-[#000]">{eur(total)}</b></div>
              {acompte > 0 && <div className={`${row} ${sep}`}><span className="text-[17px] text-[#6E6E73]">Acompte à encaisser</span><b className="text-[17px] font-semibold tabular-nums text-[#000]">{eur(acompte)}</b></div>}
              <div className={`${row} ${sep} py-2`}><span><span className="block text-[17px] font-semibold text-[#0071E3]">Signé</span><span className="block text-[14px] text-[#6E6E73]">{longAt(done.at)}</span></span>{done.png && <img src={done.png} alt={`Signature de ${done.nom}`} className="h-12 max-w-[150px] object-contain" />}</div>
              {chantier && <button type="button" onClick={chantier.open} className={`${row} ${sep} w-full py-2 text-left`}><span className="min-w-0"><span className="block text-[17px] text-[#000]">Chantier créé</span><span className="block truncate text-[14px] text-[#6E6E73]">{chantier.sub}</span></span><ChevronRight size={18} className="shrink-0 text-[#1C1C1E]" /></button>}
            </div>
          </div>
          <div className="shrink-0 space-y-2.5 px-5 pt-2" style={{ paddingBottom: "max(12px, var(--sab))" }}>
            <button type="button" onClick={onConvert} className="flex h-[56px] w-full items-center justify-center gap-2 rounded-full bg-[#000] text-[17px] font-semibold text-[#fff]"><FileText size={18} strokeWidth={1.8} />Convertir en facture</button>
            <button type="button" onClick={onPdf} className="flex h-[56px] w-full items-center justify-center rounded-full bg-[#fff] text-[17px] font-semibold text-[#000]">Envoyer le PDF signé</button>
          </div>
        </> : <>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
            <div className="pt-3 text-[13px] font-semibold uppercase tracking-[.04em] text-[#6E6E73]">Devis {num}</div>
            <h1 className="mt-1 text-[28px] font-bold leading-[34px] tracking-[-0.01em] text-[#000]">{info.objet || dv.objet}</h1>
            <div className="mt-1 text-[16px] text-[#6E6E73]">{[nom, info.client_adresse || dv.addr].filter(Boolean).join(" · ")}</div>
            <div className="mt-5 overflow-hidden rounded-[20px] bg-[#fff]">
              <div className={row}><span className="text-[17px] text-[#6E6E73]">Prestations</span><span className="flex items-center gap-1 text-[17px] text-[#000]">{nLines} ligne{nLines > 1 ? "s" : ""}<ChevronRight size={16} className="text-[#C7C7CC]" /></span></div>
              {acompte > 0 && <div className={`${row} ${sep}`}><span className="text-[17px] text-[#6E6E73]">Acompte à la signature</span><b className="text-[17px] font-semibold tabular-nums text-[#000]">{eur(acompte)}</b></div>}
              <div className={`${row} ${sep} min-h-[56px]`}><span className="text-[17px] font-semibold text-[#000]">Total TTC</span><b className="text-[24px] font-semibold tabular-nums text-[#000]">{eur(total)}</b></div>
            </div>
            <p className="mt-5 px-1 text-[15px] leading-[21px] text-[#000]"><b>Bon pour accord.</b> J’accepte ce devis pour un montant de {eur(total)} TTC, {tvaL}.</p>
            <div className="mt-3"><Pad onChange={v => { setPng(v); setErr("") }} /></div>
            {reduced && <label className="mt-3 flex items-start gap-2.5 px-1 text-[13px] leading-[18px] text-[#3C3C43]"><input type="checkbox" checked={tvaOk} onChange={e => setTvaOk(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#000]" /><span>{tvaReduiteDevis(tvas.includes(5.5))}</span></label>}
            <div className="mt-4 flex items-center justify-center gap-2 text-center text-[14px] leading-5 text-[#6E6E73]"><Lock size={14} className="shrink-0" /><span>Signature électronique sécurisée<br />{longAt(now)}</span></div>
            {err && <p role="alert" className="mt-3 text-center text-[14px] text-[#B3261E]">{err}</p>}
          </div>
          <div className="shrink-0 px-5 pt-2" style={{ paddingBottom: "max(12px, var(--sab))" }}>
            <button type="button" disabled={busy} onClick={() => void sign()} className="flex h-[56px] w-full items-center justify-center rounded-full bg-[#000] text-[17px] font-semibold text-[#fff] disabled:opacity-50">{busy ? <Loader2 className="animate-spin" /> : "Signer"}</button>
          </div>
        </>}
    </div>
  </ModalSheet>
}
