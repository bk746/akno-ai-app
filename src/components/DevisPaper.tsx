import { useEffect, useRef, useState } from "react"
import { CO, MENTIONS, contactLine, devisGratuitLabel, e2, legalLine, legalName, pct, qty, totals, type DDoc } from "../lib/devisDoc"

/* Aperçu A4 (794 × 1123 px à 96 dpi), mis à l'échelle de la largeur disponible */
/** update61 : couleur d'accent et pied de page personnalisés (Réglages → Entreprise), signature électronique affichée une fois signée. */
export default function DevisPaper({ d, sig }: { d: DDoc; sig?: { nom: string; at: string; png?: string | null } }) {
  const TEAL = /^#[0-9a-f]{6}$/i.test(CO.accent) ? CO.accent : "#0E8F8F"
  const wrap = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null), [k, setK] = useState(.45), [h, setH] = useState(1123), [, setLogo] = useState(0)
  useEffect(() => { const f = () => setLogo(x => x + 1); addEventListener("akno-logo", f); return () => removeEventListener("akno-logo", f) }, [])
  const [cl1, cl2] = contactLine()
  useEffect(() => { const ro = new ResizeObserver(() => { if (wrap.current) setK(wrap.current.clientWidth / 794); if (inner.current) setH(inner.current.offsetHeight) }); wrap.current && ro.observe(wrap.current); inner.current && ro.observe(inner.current); return () => ro.disconnect() }, [])
  // update73 · même gabarit épuré que le PDF (lib/devisPdf.ts) : en-tête, ligne n° / date / validité, Client + Chantier, objet,
  // lignes (sections, remises), totaux + conditions, signature, mentions légales discrètes sur deux colonnes.
  const t = totals(d), cap = "text-[10.5px] font-semibold uppercase tracking-[.1em]", mut = "text-[#6C6C74]"
  const cond = MENTIONS(d).find(([h]) => h === "Conditions de paiement")?.[1] || "", ms = MENTIONS(d).filter(([h]) => h !== "Conditions de paiement")
  const legal = legalLine()
  return <div ref={wrap} className="w-full overflow-hidden rounded-[6px] shadow-[0_10px_40px_rgba(0,0,0,.45)]" style={{ height: h * k }}>
    <div ref={inner} data-devis-paper className="origin-top-left bg-white text-[#16161A]" style={{ width: 794, minHeight: 1123, transform: `scale(${k})`, fontFamily: "'Geist Variable', Geist, system-ui, sans-serif" }}>
      <div style={{ height: 6, background: TEAL }} />
      <div className="px-[60px] pb-[36px] pt-[38px] text-[13px] leading-[1.45] [overflow-wrap:anywhere]">
        <div className="flex items-start justify-between gap-6">
          <div className="flex min-w-0 gap-4">{CO.logo && <img src={CO.logo} alt="" className="h-[74px] w-[74px] shrink-0 rounded-[8px] object-contain" />}
            <div className="min-w-0"><div className="text-[19px] font-semibold tracking-[-.01em]">{legalName() || "Votre entreprise"}</div>{(CO.form || CO.owner) && <div className={mut}>{[CO.form, CO.owner].filter(Boolean).join(" · ")}</div>}{cl1 && <div className={mut}>{cl1}</div>}{cl2 && <div className={mut}>{cl2}</div>}
              <div className={`mt-1 max-w-[430px] text-[10.5px] ${mut}`}>{legal || "Complétez SIRET, TVA et assurance dans Réglages → Entreprise"}</div></div></div>
          <div className="shrink-0 text-right"><div className={cap} style={{ color: TEAL }}>Devis</div><div className="mt-1 text-[28px] font-semibold tracking-[-.02em]">N° {d.num}</div></div>
        </div>
        <div className="mt-5 flex flex-wrap gap-x-8 gap-y-1 rounded-[8px] bg-[#F7F7F9] px-4 py-2.5 text-[12px]"><span><span className={mut}>Devis n°</span> <b>{d.num}</b></span><span><span className={mut}>Émis le</span> <b>{d.date}</b></span><span><span className={mut}>Valable jusqu'au</span> <b>{d.valid} ({d.validite} jours)</b></span></div>
        <div className="mt-5 grid grid-cols-2 gap-5">
          <div className="rounded-[8px] border border-[#E4E4E9] p-4"><div className={cap} style={{ color: TEAL }}>Client</div><div className="mt-1.5 text-[15px] font-semibold">{d.client.name}</div>{d.client.addr && <div className={mut}>{d.client.addr}</div>}{d.client.phone && <div className={mut}>Tél. {d.client.phone}</div>}{d.client.email && <div className={mut}>{d.client.email}</div>}</div>
          <div className="rounded-[8px] border border-[#E4E4E9] p-4"><div className={cap} style={{ color: TEAL }}>Adresse du chantier</div><div className="mt-1.5 font-semibold">{d.site || d.client.addr || "Adresse à préciser"}</div></div>
        </div>
        <div className="mt-6"><div className={cap} style={{ color: TEAL }}>Objet des travaux</div><div className="mt-1 text-[17px] font-semibold tracking-[-.01em]">{d.objet}</div></div>
        <table className="mt-4 w-full table-fixed border-collapse text-[12.5px]"><colgroup><col /><col className="w-[52px]" /><col className="w-[62px]" /><col className="w-[96px]" /><col className="w-[56px]" /><col className="w-[104px]" /></colgroup>
          <thead><tr className={`bg-[#F7F7F9] text-[11px] font-semibold ${mut}`}>{["Désignation", "Qté", "Unité", "PU HT", "TVA", "Total HT"].map((x, i) => <th key={x} className={`px-2.5 py-2 ${i === 0 ? "text-left" : i === 2 ? "text-center" : "text-right"}`}>{x}</th>)}</tr></thead>
          <tbody>{d.lines.map((x, i) => x.k === "sec"
            ? <tr key={i} className="border-b border-[#ECECF0]"><td colSpan={6} className="px-2.5 pb-2 pt-4 text-[13px] font-semibold" style={{ color: TEAL }}>{x.l}</td></tr>
            : x.k === "rem"
            ? <tr key={i} className="border-b border-[#ECECF0]"><td className={`px-2.5 py-2 italic ${mut}`}>{x.l}</td><td /><td /><td /><td className="whitespace-nowrap px-2.5 text-right">{pct(x.tv)}</td><td className="whitespace-nowrap px-2.5 text-right font-medium tabular-nums">{e2(x.q * x.pu)}</td></tr>
            : <tr key={i} className="border-b border-[#ECECF0] align-top"><td className="px-2.5 py-2.5">{x.l}{x.d && <div className={`mt-0.5 whitespace-pre-line text-[11px] leading-[1.4] ${mut}`}>{x.d}</div>}</td><td className="px-2.5 py-2.5 text-right tabular-nums">{qty(x.q)}</td><td className="whitespace-nowrap px-2.5 py-2.5 text-center">{x.u}</td><td className="whitespace-nowrap px-2.5 py-2.5 text-right tabular-nums">{e2(x.pu)}</td><td className="whitespace-nowrap px-2.5 py-2.5 text-right">{pct(x.tv)}</td><td className="whitespace-nowrap px-2.5 py-2.5 text-right font-semibold tabular-nums">{e2(x.q * x.pu)}</td></tr>)}</tbody></table>
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)_320px] items-start gap-8">
          <div className="text-[12px]"><div className={cap} style={{ color: TEAL }}>Conditions de paiement</div><div className="mt-1">{cond}</div>
            {d.notes && <><div className={`mt-4 ${cap}`} style={{ color: TEAL }}>Remarques</div><div className="mt-1 whitespace-pre-line">{d.notes}</div></>}</div>
          <div className="space-y-1.5 tabular-nums">
            {t.remise > 0.004 && <><div className="flex justify-between border-b border-[#ECECF0] pb-1.5"><span className={mut}>Total HT avant remise</span><span>{e2(t.brut)}</span></div><div className="flex justify-between border-b border-[#ECECF0] pb-1.5"><span className={mut}>Remise</span><span>- {e2(t.remise)}</span></div></>}
            <div className="flex justify-between border-b border-[#ECECF0] pb-1.5"><span className={mut}>Total HT</span><span>{e2(t.ht)}</span></div>
            {!CO.tvaNA && t.rates.map(r => <div key={r.r} className="flex justify-between border-b border-[#ECECF0] pb-1.5"><span className={mut}>TVA {pct(r.r)} sur {e2(r.base)}</span><span>{e2(r.tva)}</span></div>)}
            <div className="flex justify-between rounded-[6px] px-3.5 py-2.5 text-[16px] font-semibold text-white" style={{ background: TEAL }}><span>Total TTC</span><span>{e2(t.ttc)}</span></div>
            {d.acompte > 0 && <div className="flex justify-between px-0.5 pt-1 font-semibold"><span>Acompte à la signature ({String(d.acompte).replace(".", ",")} %)</span><span>{e2(t.acompte)}</span></div>}
          </div>
        </div>
        <div className="mt-8 flex items-start justify-between gap-6"><div className="text-[12px]"><div className="text-[13px] font-semibold" style={{ color: TEAL }}>{devisGratuitLabel()}</div><div className={`max-w-[300px] ${mut}`}>Le client reconnaît avoir pris connaissance du présent devis et en accepte les conditions.</div></div>
          <div className="min-h-[112px] w-[326px] rounded-[8px] border border-[#D0D0D6] p-3.5 text-[11px]"><div className="text-[13px] font-semibold">Bon pour accord</div>{sig ? <><div className="mt-1 font-semibold">Signé électroniquement par {sig.nom}</div><div className={mut}>le {new Date(sig.at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</div>{sig.png && <img src={sig.png} alt="Signature du client" className="mt-1 h-[48px] object-contain object-left" />}</> : <><div className={`mt-1.5 ${mut}`}>Date : ____ / ____ / ________</div><div className={`mt-8 ${mut}`}>Signature précédée de la mention « Devis reçu avant l'exécution des travaux, bon pour accord »</div></>}</div></div>
        {ms.length > 0 && <div className="mt-8 border-t border-[#E4E4E9] pt-3"><div className={`text-[9.5px] font-semibold uppercase tracking-[.08em] ${mut}`}>Mentions légales</div>
          <div className={`mt-1.5 columns-2 gap-6 text-[9.5px] leading-[1.4] ${mut}`}>{ms.map(([a, b]) => <p key={a} className="mb-1.5 break-inside-avoid-column"><b className="font-semibold">{a}</b><br />{b}</p>)}</div></div>}
        <div className={`mt-6 flex justify-between gap-4 border-t border-[#E4E4E9] pt-2.5 text-[10px] ${mut}`}><span>{CO.pied || [legalName(), CO.siret && `SIRET ${CO.siret}`, CO.rm].filter(Boolean).join(" · ")}</span><span className="shrink-0">Devis n° {d.num}</span></div>
      </div>
    </div>
  </div>
}
