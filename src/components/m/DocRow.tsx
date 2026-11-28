/* Refonte iOS passe 2 · lignes de documents des maquettes 06-Factures (.fr, 68 pt) :
   avatar · nom (rouge si à relancer) · détail | montant gras · statut à pastille. */
import type { ReactNode } from "react"
import { hapticTap } from "../../lib/haptics"

export const ini = (n: string) => n.replace(/^(M\.|Mme)\s*/i, "").split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join("").toUpperCase() || "?"
export const eurM = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString("fr-FR", { minimumFractionDigits: Math.round(n * 100) % 100 ? 2 : 0, maximumFractionDigits: 2 }).replace(/\u202f|\u00a0/g, " ")} €`
export const MO_L = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
export const frShort = (iso?: string | null) => iso ? new Date(iso.length === 10 ? iso + "T12:00:00" : iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : ""

/** statut à pastille (maquette .st) */
export type StT = "draft" | "grey" | "blue" | "orange" | "red" | "green"
const ST_C: Record<StT, [string, string]> = { draft: ["#6E6E73", "#D1D1D6"], grey: ["#6E6E73", "#AEAEB2"], blue: ["#0071E3", "#007AFF"], orange: ["#B25E00", "#FF9F0A"], red: ["#D70015", "#FF3B30"], green: ["#248A3D", "#34C759"] }
export const StDot = ({ t, children, size = 13 }: { t: StT; children: ReactNode; size?: number }) =>
  <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-semibold leading-4" style={{ color: ST_C[t][0], fontSize: size }}><i aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: ST_C[t][1] }} />{children}</span>

export const MAv = ({ n, size = 40 }: { n: string; size?: number }) =>
  <span data-av aria-hidden className="flex shrink-0 items-center justify-center rounded-full font-semibold text-[#fff]" style={{ width: size, height: size, fontSize: size * .375, background: "linear-gradient(180deg,#A2A2A7,#7C7C81)" }}>{ini(n)}</span>

export function DocRow({ name, red, sub, amount, st, onClick, first, label }: { name: string; red?: boolean; sub: ReactNode; amount: string; st?: ReactNode; onClick?: () => void; first?: boolean; label?: string }) {
  return <button type="button" aria-label={label} onClick={() => { void hapticTap(); onClick?.() }} className="flex h-[68px] w-full items-center pl-1 text-left [-webkit-tap-highlight-color:transparent] active:bg-black/[.03]">
    <span className="mr-3"><MAv n={name} /></span>
    <span className={`flex h-full min-w-0 flex-1 items-center ${first ? "" : "border-t border-[rgba(60,60,67,.16)]"}`}>
      <span className="min-w-0 flex-1"><span className="block truncate text-[17px] font-medium leading-[22px] tracking-[-0.01em]" style={{ color: red ? "#E0221B" : "#000" }}>{name}</span><span className="block truncate text-[15px] leading-5 text-[#6E6E73]">{sub}</span></span>
      <span className="ml-2 flex shrink-0 flex-col items-end gap-[3px] pr-1"><b className="text-[17px] font-semibold leading-[22px] tracking-[-0.01em] tabular-nums text-[#000]">{amount}</b>{st}</span>
    </span>
  </button>
}

/** grand chiffre en euros du haut de page (« € » réduit, maquette .big small) */
export const BigEur = ({ n }: { n: number }) => <>{Math.round(n).toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ")}<small className="ml-[7px] text-[30px] font-medium tracking-normal text-[rgba(255,255,255,.85)]">€</small></>
