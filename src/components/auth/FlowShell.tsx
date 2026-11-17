/* update49 · Cadre commun du parcours d'accueil (compte → vous → offre → entreprise → code d'accès),
   dans la DA de l'inscription update45 : colonne de formulaire + panneau de marque animé sur desktop. */
import type { ReactNode } from "react"
import { motion } from "motion/react"
import { Check } from "lucide-react"
import { Blob } from "../ui"
import { EASE } from "./fields"
import BrandPanel from "./BrandPanel"

export const FLOW = ["Compte", "Vous", "Offre", "Entreprise", "Code d'accès"] as const
export type FlowIdx = 0 | 1 | 2 | 3 | 4

/** Indicateur d'étapes discret : 5 segments + libellé de l'étape en cours. */
export function FlowSteps({ i, className = "", compact }: { i: FlowIdx; className?: string; /** libellé masqué sur petit écran */ compact?: boolean }) {
  return <div className={`flex items-center gap-3 ${className}`} aria-label={`Étape ${i + 1} sur ${FLOW.length} : ${FLOW[i]}`}>
    <ol className="flex gap-1.5" aria-hidden>{FLOW.map((l, k) => <li key={l} title={l} className="relative h-1 w-7 overflow-hidden rounded-full bg-white/[.1] sm:w-9">
      <motion.span className="absolute inset-0 origin-left rounded-full bg-white" initial={false} animate={{ scaleX: k < i ? 1 : k === i ? .5 : 0, opacity: k <= i ? 1 : 0 }} transition={{ duration: .55, ease: EASE }} />
    </li>)}</ol>
    <span className="flex items-center gap-1.5 text-[12px] text-white/45"><span className="font-mono tabular-nums">{i + 1}/{FLOW.length}</span><span aria-hidden className={compact ? "hidden sm:inline" : ""}>·</span><span className={`text-white/70 ${compact ? "hidden sm:inline" : ""}`}>{FLOW[i]}</span></span>
  </div>
}

/** Petit rappel des étapes déjà faites (desktop), sous le titre. */
export const DoneTag = ({ children }: { children: ReactNode }) => <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[.06] px-2.5 py-1 text-[12px] text-white/60"><Check size={12} strokeWidth={2.4} className="text-[#30D158]" />{children}</span>

export default function FlowShell({ children, right, wide, panel = true }: { children: ReactNode; right?: ReactNode; wide?: boolean; panel?: boolean }) {
  return <div className={`min-h-[100dvh] bg-black text-white ${panel ? "lg:grid lg:h-[100dvh] lg:grid-cols-[minmax(460px,1fr)_minmax(0,1.08fr)] lg:grid-rows-[100dvh] lg:overflow-hidden" : ""}`}>
    <main className={`flex min-h-[100dvh] flex-col px-6 pb-6 pt-[max(20px,env(safe-area-inset-top))] sm:px-10 ${panel ? "lg:min-h-0 lg:overflow-y-auto lg:px-14 lg:py-8" : ""}`}>
      <header className="flex h-10 items-center justify-between gap-3">
        <span className="flex items-center gap-2.5" aria-label="Akno"><Blob c="#E6E6E6" s={26} /><span className="text-[17px] font-semibold tracking-[-0.03em]">Akno</span></span>
        {right}
      </header>
      <div className="flex flex-1 justify-center pt-10 sm:pt-14 lg:py-8">
        <div className={`w-full ${wide ? "max-w-[460px]" : "max-w-[384px]"} lg:my-auto`}>{children}</div>
      </div>
      <footer className="mt-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[12px] text-white/30 lg:justify-start">
        <span>© {new Date().getFullYear()} Akno</span>
        {[["Mentions légales", "/mentions-legales"], ["Confidentialité", "/confidentialite"], ["CGV", "/cgv"]].map(([l, h]) => <a key={h} href={h} target="_blank" rel="noreferrer" className="transition-colors hover:text-white/70">{l}</a>)}
      </footer>
    </main>
    {panel && <aside className="hidden h-[100dvh] min-h-0 overflow-hidden p-3 pl-0 lg:block" aria-label="Ce que fait Akno"><BrandPanel /></aside>}
  </div>
}

/** Bouton secondaire (contour) de la DA. */
export const Outline = ({ children, onClick, disabled, className = "", type = "button" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; className?: string; type?: "button" | "submit" }) =>
  <button type={type} onClick={onClick} disabled={disabled} className={`flex h-12 items-center justify-center gap-2.5 rounded-full border border-white/[.12] px-5 text-[15px] font-medium text-white/90 transition-colors hover:border-white/25 hover:bg-white/[.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 disabled:cursor-not-allowed disabled:opacity-45 ${className}`}>{children}</button>

/** Encadré d'erreur (repris de l'inscription update45). */
export function AlertBox({ t, action }: { t: string; action?: { l: string; on: () => void } }) {
  return <motion.div role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: .25, ease: EASE }} className="overflow-hidden">
    {/* update50 · état d'erreur plus discret : pas de cadre, une ligne douce */}
    <div className="flex items-start gap-2.5 rounded-[12px] bg-[#FF453A]/[.07] px-3.5 py-2.5 text-[13px] leading-[1.5] text-[#FFB0A9]">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FF6B61" strokeWidth="2" strokeLinecap="round" className="mt-[2px] shrink-0" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 8v4.5M12 16h.01" /></svg>
      <div className="min-w-0 flex-1">{t}{action && <> <button type="button" onClick={action.on} className="font-semibold text-white underline decoration-white/40 underline-offset-2 hover:decoration-white">{action.l}</button></>}</div>
    </div>
  </motion.div>
}
