/* Refonte iOS (DA Designer, navbar-finale) · barre d'onglets en verre clair, 4 onglets : Réception · Agenda · Chantiers · Factures.
   Pastille de l'onglet actif qui glisse (ressort, transform uniquement), badge rouge = factures à relancer (en retard),
   retour haptique léger. Plus de « + » central : chaque page a son « + » dans la capsule en haut à droite.
   prefers-reduced-motion : géré par le MotionConfig de l'app (reducedMotion="user"). */
import { AnimatePresence, motion } from "motion/react"
import { Lock } from "lucide-react"
import type { P } from "../ui"
import { lastDocMode } from "../../lib/facturesLite"
import { hapticTap } from "../../lib/haptics"

export type CreateKind = "chantier" | "equipe" | "clients" | "relances"
type Tab = "rec" | "ag" | "ch" | "fac"

const Ico = ({ d }: { d: React.ReactNode }) => <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
const ICONS: Record<Tab, React.ReactNode> = {
  rec: <path d="M5.2 3.6h2.9c.4 0 .8.3.9.7l1.1 3.3c.1.4 0 .8-.3 1.1L8.2 10.2a12.5 12.5 0 005.6 5.6l1.5-1.6c.3-.3.7-.4 1.1-.3l3.3 1.1c.4.1.7.5.7.9v2.9c0 .9-.7 1.6-1.6 1.6C10.9 20.4 3.6 13.1 3.6 5.2c0-.9.7-1.6 1.6-1.6z" />,
  ag: <><rect x="3.5" y="5" width="17" height="15.5" rx="3.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  ch: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></>,
  fac: <><path d="M7 3h7l4.5 4.5V19a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" /><path d="M9 12h6M9 16h4" /></>,
}
const LABEL: Record<Tab, string> = { rec: "Réception", ag: "Agenda", ch: "Chantiers", fac: "Factures" }
/** Onglet actif : Devis, Factures et Relances vivent dans l'onglet Factures ; Clients sous Réception ; Équipe sous Agenda. */
export const tabOf = (p: P): Tab | null => p === "rec" || p === "ag" || p === "ch" ? p : p === "fac" || p === "dev" || p === "rel" ? "fac" : p === "cl" ? "rec" : p === "eq" ? "ag" : null
const spring = { type: "spring" as const, stiffness: 520, damping: 38, mass: .8 }
const PILL = { type: "spring" as const, stiffness: 420, damping: 36, mass: .85 }
const BAR_H = 56

function TabBtn({ t, on, badge, recLocked, onTap, onIntent }: { t: Tab; on: boolean; badge: number; recLocked: boolean; onTap: (t: Tab) => void; onIntent?: (p: P) => void }) {
  return <motion.button type="button" onClick={() => onTap(t)} onPointerDown={() => onIntent?.(t)} aria-label={t === "fac" && badge > 0 ? `${LABEL[t]}, ${badge} à relancer` : LABEL[t]} aria-current={on ? "page" : undefined} whileTap={{ scale: .92 }} transition={spring}
    className={`relative flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-[2px] rounded-[24px] outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-[#007AFF]/50 ${on ? "text-black" : "text-[#3C3C43]"}`} data-tab={t}>
    {on && <motion.span layoutId="m-tab-pill" data-tab-pill transition={PILL} className="absolute inset-0 rounded-[24px] bg-[rgba(120,120,128,.14)]" />}
    <span className="relative flex"><Ico d={ICONS[t]} />
      {t === "rec" && recLocked && <span aria-hidden className="absolute -bottom-1 -right-2 flex h-[15px] w-[15px] items-center justify-center rounded-full bg-[#E5E5EA] text-[#3C3C43] ring-2 ring-white"><Lock size={8} strokeWidth={2.6} /></span>}
      <AnimatePresence>{t === "fac" && badge > 0 && <motion.b key="b" aria-hidden initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} transition={spring}
        className="absolute -right-[9px] -top-[4px] flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[10.5px] font-bold not-italic leading-none text-white">{badge > 99 ? "99+" : badge}</motion.b>}</AnimatePresence>
    </span>
    <span className={`relative whitespace-nowrap text-[10.5px] leading-[13px] ${on ? "font-semibold" : "font-medium"}`}>{LABEL[t]}</span>
  </motion.button>
}

export default function MobileNav({ page, go, badge, recLocked, onIntent, employee }: { page: P; go: (p: P) => void; badge: number; recLocked: boolean; onCreate?: (k: CreateKind) => void; onIntent?: (p: P) => void; employee?: boolean }) {
  const active = tabOf(page)
  // l'onglet Factures rouvre le dernier mode (Devis ou Factures) ; un tap sur l'onglet courant ramène à sa racine (comportement iOS)
  const dest = (t: Tab): P => t === "fac" ? lastDocMode() : t
  const tapTab = (t: Tab) => { void hapticTap("select"); if (page !== dest(t) && !(t === "fac" && (page === "dev" || page === "fac"))) go(dest(t)) }
  return <>
    <div aria-hidden className="kb-hide pointer-events-none fixed inset-x-0 bottom-0 z-[29] h-[34px] bg-gradient-to-b from-white/0 via-white/85 to-white" style={{ height: "calc(var(--sab, 0px) + 18px)" }} />
    <nav aria-label="Navigation principale" data-mobile-nav className="kb-hide pointer-events-none fixed inset-x-5 z-30 flex justify-center" style={{ bottom: "var(--nav-gap)" }}>
      <div data-bar-pill className="ak-glass pointer-events-auto flex w-full max-w-[520px] items-center rounded-[28px] px-1" style={{ height: BAR_H }}>
        {employee ? <TabBtn t="ag" on={active === "ag"} badge={badge} recLocked={recLocked} onTap={tapTab} onIntent={onIntent} />
          : (["rec", "ag", "ch", "fac"] as Tab[]).map(t => <TabBtn key={t} t={t} on={active === t} badge={badge} recLocked={recLocked} onTap={tapTab} onIntent={onIntent} />)}
      </div>
    </nav>
  </>
}
