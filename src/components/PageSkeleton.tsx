/* update70 · Squelette de page (façon Revolut) : affiché pendant un chargement (page pas encore prête, données en attente)
   au lieu d'un écran noir vide. Mêmes gabarits et rayons que les vraies pages (pilules, cartes 20 px), pulsation douce,
   coupée si l'utilisateur préfère réduire les animations. */
const B = "rounded-full bg-white/[.07]"
export default function PageSkeleton({ mobile = true }: { mobile?: boolean }) {
  return <div data-skeleton aria-busy="true" aria-label="Chargement" role="status" className="pointer-events-none absolute inset-0 overflow-hidden bg-black motion-safe:animate-pulse"
    style={mobile ? { paddingTop: "calc(var(--sat) + 2px)" } : { padding: 32 }}>
    {mobile && <div className="flex h-10 items-center px-5"><div className={`${B} h-[22px] w-[74px]`} /><div className={`${B} ml-auto h-[30px] w-[30px]`} /></div>}
    <div className="mt-6 flex flex-col items-center px-5">
      <div className={`${B} h-[106px] w-[106px]`} />
      <div className={`${B} mt-5 h-[10px] w-[120px]`} />
      <div className="mt-3 h-[40px] w-[150px] rounded-[14px] bg-white/[.08]" />
      <div className={`${B} mt-3 h-[10px] w-[180px]`} />
    </div>
    <div className="mt-8 grid grid-cols-4 gap-3 px-4">{[0, 1, 2, 3].map(i => <div key={i} className="flex flex-col items-center gap-2"><div className={`${B} h-[52px] w-[52px]`} /><div className={`${B} h-[8px] w-[46px]`} /></div>)}</div>
    <div className="mt-7 flex flex-col gap-3 px-4">{[0, 1, 2].map(i => <div key={i} className="flex h-[76px] items-center gap-3 rounded-[20px] bg-white/[.05] px-4">
      <div className={`${B} h-10 w-10 shrink-0`} /><div className="flex flex-1 flex-col gap-2"><div className={`${B} h-[10px] w-3/5`} /><div className={`${B} h-[8px] w-2/5`} /></div></div>)}</div>
  </div>
}
