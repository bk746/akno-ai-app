import { useEffect, useRef, useState } from "react"
import { CO, MENTIONS, e2, pct, totals, type DDoc } from "../lib/devisDoc"

const TEAL = "#0E8F8F"
/* Aperçu A4 (794 × 1123 px à 96 dpi), mis à l'échelle de la largeur disponible */
export default function DevisPaper({ d }: { d: DDoc }) {
  const wrap = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null), [k, setK] = useState(.45), [h, setH] = useState(1123)
  useEffect(() => { const ro = new ResizeObserver(() => { if (wrap.current) setK(wrap.current.clientWidth / 794); if (inner.current) setH(inner.current.offsetHeight) }); wrap.current && ro.observe(wrap.current); inner.current && ro.observe(inner.current); return () => ro.disconnect() }, [])
  const t = totals(d), cap = "text-[10.5px] font-semibold uppercase tracking-[.1em]", mut = "text-[#6E6E76]"
  return <div ref={wrap} className="w-full overflow-hidden rounded-[6px] shadow-[0_10px_40px_rgba(0,0,0,.45)]" style={{ height: h * k }}>
    <div ref={inner} className="origin-top-left bg-white text-[#141416]" style={{ width: 794, minHeight: 1123, transform: `scale(${k})`, fontFamily: "'Geist Variable', Geist, system-ui, sans-serif" }}>
      <div style={{ height: 8, background: TEAL }} />
      <div className="px-[60px] pb-[40px] pt-[40px] text-[13px] leading-[1.45]">
        <div className="flex items-start justify-between">
          <div className="flex gap-4"><div className="flex h-[78px] w-[78px] items-center justify-center rounded-[8px] border border-dashed border-[#C8C8CD] text-[11px] text-[#9A9AA0]">LOGO</div>
            <div><div className="text-[19px] font-semibold tracking-[-.01em]">{CO.name}</div><div className={mut}>{CO.form} · {CO.owner}</div><div className={mut}>{CO.addr}, {CO.city}</div><div className={mut}>{CO.phone} · {CO.email}</div></div></div>
          <div className="text-right"><div className="text-[30px] font-semibold tracking-[-.02em]">DEVIS</div><div className="text-[15px] font-semibold" style={{ color: TEAL }}>N° {d.num}</div><div className={`mt-1 ${mut}`}>Date d'émission : {d.date}</div><div className={mut}>Validité : 30 jours ({d.valid})</div></div>
        </div>
        <div className={`mt-4 border-b border-[#E4E4E8] pb-3 text-[11px] ${mut}`}>SIRET {CO.siret} · TVA intracom. {CO.tva} · {CO.rm} · APE {CO.ape}</div>
        <div className="mt-5 grid grid-cols-2 gap-5">
          <div className="rounded-[8px] bg-[#F6F6F8] p-4"><div className={cap} style={{ color: TEAL }}>Client</div><div className="mt-1.5 text-[15px] font-semibold">{d.client.name}</div>{d.client.addr && <div className={mut}>{d.client.addr}</div>}{d.client.phone && <div className={mut}>Tél. {d.client.phone}</div>}</div>
          <div className="rounded-[8px] bg-[#F6F6F8] p-4"><div className={cap} style={{ color: TEAL }}>Adresse du chantier</div><div className="mt-1.5 font-medium">{d.site}</div><div className={`mt-1 ${mut}`}>Objet : {d.objet}</div></div>
        </div>
        <div className="mt-6 flex gap-3"><span className={cap} style={{ color: TEAL }}>Objet</span><span className="font-semibold">{d.objet}</span></div>
        <table className="mt-3 w-full border-collapse text-[12.5px]"><thead><tr className={`bg-[#F6F6F8] text-[11px] font-semibold ${mut}`}>{["Désignation", "Qté", "Unité", "PU HT", "TVA", "Total HT"].map((x, i) => <th key={x} className={`px-2.5 py-2 ${i === 0 ? "text-left" : i === 2 ? "text-center" : "text-right"}`}>{x}</th>)}</tr></thead>
          <tbody>{d.lines.map((x, i) => <tr key={i} className="border-b border-[#ECECF0]"><td className="px-2.5 py-2.5">{x.l}</td><td className="px-2.5 text-right tabular-nums">{String(x.q).replace(".", ",")}</td><td className="px-2.5 text-center">{x.u}</td><td className="whitespace-nowrap px-2.5 text-right tabular-nums">{e2(x.pu)}</td><td className="px-2.5 text-right">{pct(x.tv)}</td><td className="whitespace-nowrap px-2.5 text-right font-medium tabular-nums">{e2(x.q * x.pu)}</td></tr>)}</tbody></table>
        <div className="ml-auto mt-5 w-[330px] space-y-1.5 tabular-nums">
          <div className="flex justify-between"><span className={mut}>Total HT</span><span>{e2(t.ht)}</span></div>
          {t.rates.map(r => <div key={r.r} className="flex justify-between"><span className={mut}>TVA {pct(r.r)} (base {e2(r.base)})</span><span>{e2(r.tva)}</span></div>)}
          <div className="flex justify-between rounded-[6px] px-3 py-2 text-[15px] font-semibold text-white" style={{ background: TEAL }}><span>Total TTC</span><span>{e2(t.ttc)}</span></div>
          <div className="flex justify-between"><span className={mut}>Acompte à la signature ({d.acompte} %)</span><span>{e2(t.acompte)}</span></div>
        </div>
        <div className="mt-7 space-y-2.5 text-[11px]">{MENTIONS(d).map(([a, b]) => <div key={a}><div className="font-semibold" style={{ color: TEAL }}>{a}</div><div className={mut}>{b}</div></div>)}</div>
        <div className="mt-7 flex items-start justify-between gap-6"><div className="text-[11px]"><div className="text-[13px] font-semibold" style={{ color: TEAL }}>Devis gratuit</div><div className={`max-w-[300px] ${mut}`}>Le client reconnaît avoir pris connaissance du présent devis et en accepte les conditions.</div></div>
          <div className="h-[130px] w-[320px] rounded-[8px] border border-[#D2D2D7] p-3.5 text-[11px]"><div className="text-[13px] font-semibold">Bon pour accord</div><div className={`mt-1 ${mut}`}>Date : ____ / ____ / ________</div><div className={`mt-1 ${mut}`}>Signature précédée de la mention manuscrite « Devis reçu avant l'exécution des travaux, bon pour accord »</div></div></div>
        <div className={`mt-8 flex justify-between border-t border-[#E4E4E8] pt-2.5 text-[10px] ${mut}`}><span>{CO.name} · SIRET {CO.siret} · {CO.rm} · Données de démonstration</span><span>Page 1 / 1</span></div>
      </div>
    </div>
  </div>
}
