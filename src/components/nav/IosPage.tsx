/* Refonte iOS (DA Designer) · gabarit commun des pages à onglet sur mobile.
   - Barre de navigation : titre à gauche (22 pt) + capsule en verre clair à droite (+ · action · …).
     Au défilement, le titre se replie (réduction + centrage façon « large title » iOS) et la barre devient translucide floutée.
   - Sélecteur (segmented) optionnel sous la barre, puis le haut de page noir : bot, état, chiffre clé.
   - Contenu dans une feuille blanche (coins 40, poignée), qui s'étend jusqu'en bas (rebond compris).
   Animations : transform / opacity uniquement, pilotées par le défilement (aucun saut de layout) ;
   prefers-reduced-motion → pas de repli animé (le titre reste net, la barre change seulement d'opacité). */
import { useRef, type ReactNode } from "react"
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react"
import { hapticTap } from "../../lib/haptics"

export type CapsBtn = { I: any; label: string; on: () => void; dis?: boolean; text?: string }

export function Capsule({ items }: { items: CapsBtn[] }) {
  if (!items.length) return null
  return <div data-caps className="ak-caps flex h-9 shrink-0 items-center rounded-[18px] px-0.5">
    {items.map(b => <motion.button key={b.label} type="button" data-caps-btn={b.label} aria-label={b.label} title={b.label} disabled={b.dis} whileTap={{ scale: .88 }} transition={{ type: "spring", stiffness: 600, damping: 30 }}
      onClick={() => { void hapticTap(); b.on() }} className={`flex h-9 ${b.text ? "px-3.5 text-[15px] font-semibold" : "w-12"} items-center justify-center text-[#000] outline-none disabled:opacity-35 [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-[#007AFF]/60 rounded-[18px]`}>
      {b.text || <b.I size={20} strokeWidth={1.6} />}
    </motion.button>)}
  </div>
}

export function NavBar({ title, caps, lead, scroller, compact }: { title: ReactNode; caps?: CapsBtn[]; lead?: ReactNode; scroller: React.RefObject<HTMLDivElement | null>; compact?: boolean }) {
  const reduce = useReducedMotion()
  const { scrollY } = useScroll({ container: scroller as React.RefObject<HTMLElement> })
  const bg = useTransform(scrollY, [24, 64], [0, 1])
  const sc = useTransform(scrollY, [0, 56], [1, .78])
  const tx = useTransform(scrollY, [0, 56], [0, 6])
  return <div data-mobile-head className="sticky top-0 z-20 shrink-0" style={{ paddingTop: "calc(var(--sat) + 2px)" }}>
    <motion.div aria-hidden className="absolute inset-0 border-b border-white/[.08] bg-black/70 backdrop-blur-[20px] backdrop-saturate-150" style={{ opacity: bg }} />
    <div className="relative flex h-11 items-center gap-2 px-5">
      {lead}
      <motion.h1 className={`min-w-0 flex-1 origin-left truncate font-semibold tracking-[-0.01em] text-[#fff] ${compact ? "text-[17px]" : "text-[22px] leading-7"}`} style={reduce || compact ? undefined : { scale: sc, y: tx }}>{title}</motion.h1>
      {caps && <Capsule items={caps} />}
    </div>
  </div>
}

export function IosPage({ title, caps, mid, hero, chips, children, lead }: { title: ReactNode; caps?: CapsBtn[]; mid?: ReactNode; hero?: ReactNode; chips?: ReactNode; children: ReactNode; lead?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  return <div ref={ref} data-page-scroll className="ak-page flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain" style={{ background: "#fff" }}>
    <div className="relative flex flex-col bg-[#000]">
      {/* fond noir au-dessus du haut de page pour le rebond iOS (pas de dégradé sur le conteneur : artefacts de tuiles WebKit) */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-full h-[100vh] bg-[#000]" />
      <NavBar title={title} caps={caps} lead={lead} scroller={ref} />
      {mid && <div className="relative z-10 px-5 pt-3">{mid}</div>}
      {hero && <div className="flex flex-col items-center px-5 pb-8 pt-6 text-center">{hero}</div>}
    </div>
    <div data-ios-sheet className="ak-sheet akno-light relative -mt-px flex flex-1 flex-col" style={{ minHeight: "62dvh" }}>
      <div aria-hidden className="ak-grab" />
      {chips && <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pt-4">{chips}</div>}
      <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: .03 } } }} className="flex flex-col gap-8 px-4 pt-4">{children}</motion.div>
      <div aria-hidden className="shrink-0" style={{ height: "var(--page-bottom)" }} />
    </div>
  </div>
}

/** Sélecteur segmenté iOS (sur fond noir) : pastille blanche qui glisse en ressort, haptique de sélection. */
export function Segmented<T extends string>({ value, items, onPick, label, layoutId }: { value: T; items: [T, ReactNode][]; onPick: (v: T) => void; label: string; layoutId: string }) {
  return <div role="tablist" aria-label={label} className="ak-seg relative flex h-10 w-full rounded-[20px] p-[3px]">
    {items.map(([k, l]) => { const on = value === k
      return <button key={k} role="tab" type="button" aria-selected={on} onClick={() => { if (!on) { void hapticTap("select"); onPick(k) } }}
        className={`relative min-w-0 flex-1 rounded-[17px] text-[14px] outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-white/50 ${on ? "font-semibold text-[#000]" : "font-medium text-[#EBEBF5]"}`}>
        {on && <motion.span layoutId={layoutId} aria-hidden className="absolute inset-0 rounded-[17px] bg-[#fff] shadow-[0_1px_4px_rgba(0,0,0,.25)]" transition={{ type: "spring", stiffness: 520, damping: 40, mass: .7 }} />}
        <span className="relative flex items-center justify-center gap-1 truncate">{l}</span>
      </button> })}
  </div>
}

/** Pastille d'action secondaire (en haut de la feuille blanche) */
export const Chip = ({ I, l, on, dis }: { I: any; l: string; on: () => void; dis?: boolean }) =>
  <motion.button type="button" whileTap={{ scale: .95 }} disabled={dis} onClick={() => { void hapticTap(); on() }} data-qa={l}
    className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[rgba(118,118,128,.12)] px-3.5 text-[14px] font-medium text-[#1C1C1E] disabled:opacity-35 [-webkit-tap-highlight-color:transparent]"><I size={16} strokeWidth={1.75} />{l}</motion.button>

/** Ligne de liste iOS (maquette Réception) : avatar, nom (rouge si à rappeler), motif, heure, bouton « i ».
 *  Toucher la ligne = action principale (appel si href tel:), « i » = fiche. Zone tactile ≥ 44 pt. */
export function IRow({ ini, name, red, sub, time, href, onClick, onInfo, first, infoLabel }: { ini: string; name: string; red?: boolean; sub?: ReactNode; time?: ReactNode; href?: string; onClick?: () => void; onInfo?: () => void; first?: boolean; infoLabel?: string }) {
  const body = <>
    <span data-av aria-hidden className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold">{ini}</span>
    <span className={`flex min-h-[64px] min-w-0 flex-1 items-center ${first ? "" : "border-t border-[rgba(60,60,67,.16)]"}`}>
      <span className="min-w-0 flex-1 py-2"><span className="block truncate text-[17px] font-semibold leading-[22px] tracking-[-0.01em]" style={{ color: red ? "var(--ak-red)" : "#000" }}>{name}</span>{sub && <span className="block truncate text-[15px] leading-5 text-[#6E6E73]">{sub}</span>}</span>
      {time && <span className="ml-2 shrink-0 text-[15px] tabular-nums text-[#6E6E73]">{time}</span>}
      {onInfo && <span className="w-[50px] shrink-0" />}
    </span></>
  const cls = "relative flex w-full items-center pl-1 text-left [-webkit-tap-highlight-color:transparent] active:bg-black/[.03]"
  return <div className="relative">
    {href ? <a href={href} onClick={() => { void hapticTap(); onClick?.() }} className={cls}>{body}</a> : <button type="button" onClick={() => { void hapticTap(); onClick?.() }} className={cls}>{body}</button>}
    {onInfo && <button type="button" aria-label={infoLabel || `Fiche de ${name}`} onClick={() => { void hapticTap(); onInfo() }} className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center [-webkit-tap-highlight-color:transparent]">
      <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[rgba(118,118,128,.12)] text-[#1C1C1E]"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6v.2" /></svg></span>
    </button>}
  </div>
}
export const IH2 = ({ t, more, moreL = "Tout voir" }: { t: string; more?: () => void; moreL?: string }) => <div className="flex items-end justify-between px-1 pb-1"><h2 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-[#000]">{t}</h2>{more && <button type="button" onClick={more} className="text-[15px] text-[#6E6E73]">{moreL}</button>}</div>
