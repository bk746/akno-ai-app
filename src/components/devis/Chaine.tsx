/* update71 · Composants simples de la chaîne devis → paiement :
   - Frise : 6 étapes lisibles (Devis, Signé, Acompte, Chantier, Facturé, Payé), l'étape en cours en couleur ;
   - NextCard : « Prochaine étape », une phrase, rien d'autre ;
   - LinesCard : le document lisible sur iPhone sans zoom (désignations sur plusieurs lignes, « 2 × 68,00 € », TVA par taux). */
import type { ReactNode } from "react"
import { Check } from "lucide-react"
import { STEPS } from "../../lib/chaine"
import { e2 } from "../../lib/devisDoc"
import { lineHT } from "../../../api/_lib/factureCalc"

export function Frise({ done, current, sub, c }: { done: boolean[]; current: number; sub?: string[]; c: string }) {
  return <ol data-frise aria-label="Avancement" className="mb-4 grid grid-cols-6 gap-0 rounded-[20px] bg-white/[.04] px-1 py-3">
    {STEPS.map((l, i) => {
      const ok = done[i], now = i === current
      return <li key={l} data-step={l} data-done={ok ? "1" : "0"} data-current={now ? "1" : "0"} aria-current={now ? "step" : undefined} className="relative flex min-w-0 flex-col items-center text-center">
        {i > 0 && <span aria-hidden className="absolute right-1/2 top-[13px] h-[2px] w-full -translate-x-[13px]" style={{ background: done[i - 1] ? c : "rgba(255,255,255,.12)" }} />}
        <span className="relative z-[1] flex h-[26px] w-[26px] items-center justify-center rounded-full text-[12px] font-semibold"
          style={ok ? { background: c, color: "#000" } : now ? { background: "#121214", boxShadow: `inset 0 0 0 2px ${c}`, color: c } : { background: "#26262a", color: "rgba(255,255,255,.45)" }}>
          {ok ? <Check size={15} strokeWidth={3} /> : i + 1}
        </span>
        <span className={`mt-1.5 text-[12px] leading-tight ${ok || now ? "font-semibold text-white" : "text-white/50"}`}>{l}</span>
        {sub?.[i] && <span className="text-[11px] leading-tight text-white/45">{sub[i]}</span>}
      </li>
    })}
  </ol>
}

export function NextCard({ title, text, c, children, tone }: { title: string; text?: string; c: string; children?: ReactNode; tone?: "ok" | "warn" }) {
  return <section data-next className="mb-4 rounded-[20px] border px-4 py-4" style={{ borderColor: tone === "warn" ? "rgba(255,179,64,.35)" : `${c}55`, background: tone === "warn" ? "rgba(255,179,64,.08)" : `${c}14` }}>
    <div className="text-[12px] font-semibold uppercase tracking-[.06em]" style={{ color: tone === "warn" ? "#FFB340" : c }}>{tone === "ok" ? "Terminé" : "Prochaine étape"}</div>
    <h3 className="mt-1 text-[19px] font-semibold leading-snug tracking-[-0.02em] text-white">{title}</h3>
    {text && <p className="mt-1 text-[15px] leading-snug text-white/70">{text}</p>}
    {children}
  </section>
}

type L = { l: string; d?: string; q: number; pu: number; u?: string; tv?: number; k?: string; rl?: { t: "pct" | "eur"; v: number } }
/** Lignes + totaux, lisibles sur téléphone. `tvaNA` : franchise en base (pas de TVA). */
export function LinesCard({ lines, tv = 20, tvaNA, head, deduit = 0, label = "Total TTC", noTotals }: { lines: L[]; tv?: number; tvaNA?: boolean; head?: ReactNode; deduit?: number; label?: string; noTotals?: boolean }) {
  const items = lines.filter(x => x.k !== "meta")
  const rates = new Map<number, number>()
  let ht = 0
  for (const x of items) { if (x.k === "sec") continue; const v = lineHT(x); ht += v; const r = Number(x.tv ?? tv); rates.set(r, (rates.get(r) || 0) + v) }
  const tvaBy = [...rates.entries()].filter(([, b]) => b).sort((a, b) => a[0] - b[0]).map(([r, b]) => [r, Math.round(b * r) / 100] as const)
  const tva = tvaNA ? 0 : tvaBy.reduce((a, [, v]) => a + v, 0), ttc = Math.round((ht + tva) * 100) / 100
  const num = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",")
  return <div data-lines-card className="mb-4 overflow-hidden rounded-[20px] bg-white/[.04]">
    {head && <div className="border-b border-white/[.06] px-4 py-3.5">{head}</div>}
    <ul className="divide-y divide-white/[.06]">
      {items.map((x, i) => x.k === "sec"
        ? <li key={i} className="px-4 pb-1.5 pt-3.5 text-[13px] font-semibold uppercase tracking-[.05em] text-white/55">{x.l}</li>
        : <li key={i} className="flex items-start gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="whitespace-pre-line break-words text-[15px] leading-snug text-white">{x.l}</div>
            {x.d && <div className="mt-0.5 whitespace-pre-line break-words text-[13px] leading-snug text-white/50">{x.d}</div>}
            <div className="mt-1 text-[13px] tabular-nums text-white/50">{num(x.q)} {x.u && x.u !== "u" ? x.u : ""} × {e2(Number(x.pu))}{!tvaNA ? ` · TVA ${String(x.tv ?? tv).replace(".", ",")} %` : ""}</div>
          </div>
          <div className="shrink-0 pt-px text-[15px] font-medium tabular-nums text-white">{e2(lineHT(x))}</div>
        </li>)}
    </ul>
    {!noTotals && <div className="space-y-1 border-t border-white/[.08] px-4 py-3.5 text-[14px] tabular-nums">
      <div className="flex justify-between text-white/60"><span>Total HT</span><span>{e2(Math.round(ht * 100) / 100)}</span></div>
      {tvaNA ? <div className="text-[12.5px] text-white/45">TVA non applicable, art. 293 B du CGI</div>
        : tvaBy.map(([r, v]) => <div key={r} className="flex justify-between text-white/60"><span>TVA {String(r).replace(".", ",")} %</span><span>{e2(v)}</span></div>)}
      <div className="flex items-baseline justify-between pt-1 text-white"><span className="text-[15px] font-semibold">{label}</span><span className="text-[20px] font-semibold">{e2(ttc)}</span></div>
      {deduit > 0 && <>
        <div className="flex justify-between text-white/60"><span>Acompte déjà facturé</span><span>− {e2(deduit)}</span></div>
        <div className="flex items-baseline justify-between text-white"><span className="text-[15px] font-semibold">Reste à payer</span><span className="text-[20px] font-semibold">{e2(Math.round((ttc - deduit) * 100) / 100)}</span></div>
      </>}
    </div>}
  </div>
}
