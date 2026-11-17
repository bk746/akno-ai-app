/* update46 · Parcours d'abonnement plein écran, dans la DA de l'inscription (update45) :
   1. « Choisissez votre offre » (mensuel / annuel -20 %, Bureau ou Clients + Bureau, option Réceptionniste IA)
   2. Paiement Stripe intégré dans l'app (Embedded Checkout, aux couleurs Akno) avec le récapitulatif à côté
   3. Activation : on relit l'abonnement côté serveur (checkout_sync) puis on entre dans l'app.
   Affiché par Gate avant l'app (nouvel inscrit sans offre / essai terminé) et depuis Paramètres › Abonnement. */
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, MotionConfig, animate, motion, useReducedMotion } from "motion/react"
import { ArrowLeft, ArrowRight, Check, Lock, LogOut, RotateCcw, X } from "lucide-react"
import { A, Blob } from "../ui"
import { EASE, Spinner } from "../auth/fields"
import { api, reloadAccount, useAccount, type Plan } from "../../lib/accountApi"
import { OFFERS, RECEPTION, TVA, dateFr, eur, perMonth, perPeriod, yearly, type Interval } from "../../lib/offers"
import { supabase } from "../../lib/supabase"
import { FlowSteps } from "../auth/FlowShell"

const StripePane = lazy(() => import("./StripePane"))
const PK = String(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "").trim()
const PICK = "akno-offer-pick"

type Step = "choose" | "pay" | "done"
type Pick = { plan: Plan; interval: Interval; reception: boolean }

function readPick(): Pick {
  try {
    const x = JSON.parse(sessionStorage.getItem(PICK) || "null") as Partial<Pick> | null
    if (x && (x.plan === "bureau" || x.plan === "clients")) return { plan: x.plan, interval: x.interval === "year" ? "year" : "month", reception: x.reception !== false }
  } catch { /* stockage indisponible */ }
  return { plan: "clients", interval: "month", reception: true }
}

/** Montant animé (compte jusqu'à la nouvelle valeur ; instantané si mouvement réduit). */
function Num({ v, dec }: { v: number; dec?: 0 | 2 }) {
  const reduce = useReducedMotion()
  const [d, setD] = useState(v)
  const cur = useRef(v)
  useEffect(() => {
    if (reduce) { cur.current = v; setD(v); return }
    const c = animate(cur.current, v, { duration: .55, ease: EASE, onUpdate: x => { cur.current = x; setD(x) } })
    return () => c.stop()
  }, [v, reduce])
  const n = dec ?? (v % 1 ? 2 : 0)
  return <span className="tabular-nums">{d.toLocaleString("fr-FR", { minimumFractionDigits: n, maximumFractionDigits: n })} €</span>
}

const out = () => { if (confirm("Se déconnecter ?")) void supabase.auth.signOut() }

export default function Offres({ mode, onClose, onDone, returnSession, flow }: { mode: "gate" | "sheet"; onClose?: () => void; onDone: () => void; returnSession?: string; /** update49 · affiché dans le parcours d'accueil : indicateur commun + « Continuer » */ flow?: boolean }) {
  const a = useAccount()
  const reduce = useReducedMotion()
  const init = useRef(readPick()).current
  const [step, setStep] = useState<Step>(returnSession ? "done" : "choose")
  const [dir, setDir] = useState(1)
  const [plan, setPlan] = useState<Plan>(init.plan)
  const [interval, setIntv] = useState<Interval>(init.interval)
  const [reception, setReception] = useState(init.reception)
  const [secret, setSecret] = useState(""), [session, setSession] = useState(returnSession || "")
  const [busy, setBusy] = useState(false), [err, setErr] = useState("")
  const top = useRef<HTMLDivElement>(null)

  const annual = !!a?.billing.annual
  const trialDays = a?.billing.trial_days || 30
  const trial = a?.entitlements.trialEligible !== false
  const expired = a?.entitlements.status === "expired"
  useEffect(() => { if (a && !annual && interval === "year") setIntv("month") }, [a, annual, interval])

  const offer = OFFERS.find(o => o.id === plan) || OFFERS[0]
  const totalHT = perPeriod(offer.monthly, interval) + (reception ? perPeriod(RECEPTION.monthly, interval) : 0)
  const trialEnd = new Date(Date.now() + trialDays * 864e5)

  const go = (s: Step, d = 1) => { setDir(d); setErr(""); setStep(s); requestAnimationFrame(() => top.current?.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" })) }

  const start = async () => {
    if (busy) return
    setBusy(true); setErr("")
    try { sessionStorage.setItem(PICK, JSON.stringify({ plan, interval, reception })) } catch { /* ignore */ }
    const r = await api("/api/account", { action: "checkout", plan, interval, reception, embedded: !!PK })
    if (r.ok && typeof r.client_secret === "string") { setSecret(r.client_secret); setSession(String(r.session_id || "")); setBusy(false); go("pay"); return }
    if (r.ok && typeof r.url === "string") { location.href = r.url; return }
    setBusy(false); setErr(r.error || "Paiement indisponible pour le moment.")
  }
  const complete = useCallback(() => go("done"), []) // eslint-disable-line react-hooks/exhaustive-deps

  const steps = ["Offre", "Paiement", "Activation"], idx = step === "choose" ? 0 : step === "pay" ? 1 : 2
  const slide = { initial: (d: number) => ({ opacity: 0, x: reduce ? 0 : 28 * d, filter: reduce ? "none" : "blur(4px)" }), animate: { opacity: 1, x: 0, filter: "blur(0px)" }, exit: (d: number) => ({ opacity: 0, x: reduce ? 0 : -20 * d, filter: reduce ? "none" : "blur(4px)" }) }

  return <MotionConfig reducedMotion="user">
    <div ref={top} className="fixed inset-0 z-[80] overflow-y-auto bg-black text-white" role="dialog" aria-modal="true" aria-label="Choisir une offre Akno">
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 h-[420px] [background:radial-gradient(50%_60%_at_50%_0%,rgba(255,255,255,.07),transparent_70%)]" />
      <header className="relative mx-auto flex h-16 w-full max-w-[1160px] items-center justify-between gap-4 px-5 pt-[env(safe-area-inset-top)] sm:px-8">
        <div className="flex items-center gap-2.5"><Blob c="#E6E6E6" s={26} /><span className="text-[17px] font-semibold tracking-[-0.03em]">Akno</span></div>
        {flow ? <FlowSteps i={2} className="hidden sm:flex" /> : <ol className="hidden items-center gap-2 sm:flex" aria-label={`Étape ${idx + 1} sur 3 : ${steps[idx]}`}>
          {steps.map((l, i) => <li key={l} className="flex items-center gap-2" aria-current={i === idx ? "step" : undefined}>
            <span className={`flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11.5px] font-semibold transition-colors duration-300 ${i < idx ? "bg-white text-black" : i === idx ? "bg-white/[.14] text-white ring-1 ring-white/40" : "bg-white/[.05] text-white/35"}`}>{i < idx ? <Check size={12} strokeWidth={3} /> : i + 1}</span>
            <span className={`text-[13px] transition-colors duration-300 ${i === idx ? "font-medium text-white" : "text-white/40"}`}>{l}</span>
            {i < 2 && <span className="relative mx-1 h-px w-8 overflow-hidden bg-white/[.12]"><motion.span className="absolute inset-0 origin-left bg-white/70" initial={false} animate={{ scaleX: i < idx ? 1 : 0 }} transition={{ duration: .5, ease: EASE }} /></span>}
          </li>)}
        </ol>}
        {mode === "gate"
          ? <button type="button" onClick={out} className="flex h-9 items-center gap-2 rounded-full border border-white/[.12] px-3.5 text-[13.5px] font-medium text-white/75 transition-colors hover:border-white/25 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"><LogOut size={15} strokeWidth={1.9} /><span className="hidden sm:inline">Se déconnecter</span></button>
          : <button type="button" onClick={onClose} aria-label="Fermer" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[.08] text-white/80 transition-colors hover:bg-white/[.14] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"><X size={17} /></button>}
      </header>

      <main className="relative mx-auto w-full max-w-[1160px] px-5 pb-40 pt-6 sm:px-8 lg:pb-16 lg:pt-10">
        {flow && <FlowSteps i={2} className="mb-6 sm:hidden" />}
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div key={step} custom={dir} variants={slide} initial="initial" animate="animate" exit="exit" transition={{ duration: .34, ease: EASE }}>
            {step === "choose" && <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
              <section>
                <Rise i={0}><h1 className="text-[32px] font-semibold leading-[1.05] tracking-[-0.04em] text-balance sm:text-[40px]">{expired ? "Reprenez avec Akno" : "Choisissez votre offre"}</h1></Rise>
                <Rise i={1}><p className="mt-3 max-w-[540px] text-[15.5px] leading-[1.55] text-white/55 text-pretty">{trial
                  ? <>{trialDays} jours d'essai gratuit sur toutes les offres. <span className="text-white">0 € aujourd'hui</span>, sans engagement, résiliable à tout moment depuis Akno.</>
                  : <>Vos données sont conservées. Choisissez une offre pour reprendre là où vous en étiez.</>}</p></Rise>

                {annual && <Rise i={2} className="mt-7"><IntervalToggle v={interval} set={setIntv} /></Rise>}

                <fieldset className="mt-6 grid gap-3 sm:grid-cols-2">
                  <legend className="sr-only">Offre</legend>
                  {OFFERS.map((o, i) => <Rise key={o.id} i={3 + i} className="flex"><PlanCard o={o} sel={plan === o.id} interval={interval} onPick={() => setPlan(o.id)} /></Rise>)}
                </fieldset>

                <Rise i={5}><ReceptionRow on={reception} set={setReception} interval={interval} /></Rise>
                <Rise i={6}><p className="mt-4 px-1 text-[12.5px] leading-[1.6] text-white/40">Prix hors taxes, TVA de 20 % en sus. {interval === "year" ? "Facturation annuelle, soit 20 % de moins que 12 mois au tarif mensuel." : "Facturation mensuelle."} Un code promo peut être saisi à l'étape suivante.</p></Rise>
              </section>
              <Rise i={3} className="mt-8 lg:mt-0"><div className="lg:sticky lg:top-6">
                <Summary offerName={offer.full} plan={plan} interval={interval} reception={reception} totalHT={totalHT} trial={trial} trialDays={trialDays} trialEnd={trialEnd}>
                  <div className="mt-5 hidden lg:block"><Cta busy={busy} trial={trial} onClick={start} /></div>
                  <ErrorLine err={err} className="hidden lg:block" />
                </Summary>
              </div></Rise>
            </div>}

            {step === "pay" && <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
              <section className="min-w-0">
                <button type="button" onClick={() => go("choose", -1)} className="group mb-5 inline-flex items-center gap-1.5 rounded-md text-[14px] font-medium text-white/55 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"><ArrowLeft size={16} className="transition-transform group-hover:-translate-x-0.5" />Modifier l'offre</button>
                <h1 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.035em] text-balance sm:text-[32px]">Votre moyen de paiement</h1>
                <p className="mt-2.5 max-w-[540px] text-[15px] leading-[1.55] text-white/55 text-pretty">{trial ? <>Aucun prélèvement aujourd'hui. Votre carte sera débitée le <span className="text-white">{dateFr(trialEnd)}</span> si vous gardez Akno.</> : <>Le premier prélèvement a lieu aujourd'hui.</>}</p>
                <div className="mt-5 lg:hidden"><MiniSummary offerName={offer.full} interval={interval} reception={reception} totalHT={totalHT} trial={trial} trialEnd={trialEnd} /></div>
                <div className="relative mt-6 min-h-[520px] overflow-hidden rounded-[24px] border border-white/[.07] bg-[#0B0B0D] shadow-[inset_0_1px_0_rgba(255,255,255,.05),0_24px_60px_-30px_rgba(0,0,0,1)]">
                  <PaneSkeleton />
                  <div className="relative">{secret && PK && <Suspense fallback={null}><StripePane pk={PK} clientSecret={secret} onComplete={complete} cta={trial ? "Démarrer mon essai gratuit" : "Payer et activer Akno"} /></Suspense>}</div>
                </div>
                <p className="mt-4 flex items-center gap-2 px-1 text-[12.5px] text-white/40"><Lock size={13} strokeWidth={2} />Paiement traité par Stripe. Akno ne voit jamais votre numéro de carte.</p>
              </section>
              <aside className="hidden lg:block"><div className="lg:sticky lg:top-6">
                <Summary compact offerName={offer.full} plan={plan} interval={interval} reception={reception} totalHT={totalHT} trial={trial} trialDays={trialDays} trialEnd={trialEnd} />
              </div></aside>
            </div>}

            {step === "done" && <Done session={session} pick={{ plan, interval, reception }} offerName={offer.full} trial={trial} trialDays={trialDays} onEnter={onDone} enterLabel={flow ? "Continuer" : undefined} />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile : barre d'action fixe (récap court + bouton) */}
      <AnimatePresence>{step === "choose" && <motion.div initial={{ y: 90, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 90, opacity: 0 }} transition={{ duration: .4, ease: EASE, delay: .25 }}
        className="fixed inset-x-0 bottom-0 z-10 border-t border-white/[.08] bg-black/85 px-5 pb-[max(14px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl lg:hidden">
        <div className="mx-auto max-w-[560px]">
          <div className="mb-2.5 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="font-medium text-white">{trial ? <><span className="text-[#30D158]">0 € aujourd'hui</span> · {trialDays} jours offerts</> : "À payer aujourd'hui"}</span>
            <span className="tabular-nums text-white/50">puis <Num v={totalHT} dec={2} /> HT/{interval === "year" ? "an" : "mois"}</span>
          </div>
          <Cta busy={busy} trial={trial} onClick={start} />
          <ErrorLine err={err} />
        </div>
      </motion.div>}</AnimatePresence>
    </div>
  </MotionConfig>
}

/** Apparition en cascade, une seule fois à l'ouverture (désactivée si mouvement réduit). */
function Rise({ i, children, className = "" }: { i: number; children: ReactNode; className?: string }) {
  return <motion.div className={className} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5, ease: EASE, delay: .05 + i * .055 }}>{children}</motion.div>
}

function IntervalToggle({ v, set }: { v: Interval; set: (v: Interval) => void }) {
  return <fieldset>
    <legend className="sr-only">Fréquence de facturation</legend>
    <div className="inline-flex rounded-full border border-white/[.08] bg-[#0E0E10] p-1">
      {(["month", "year"] as const).map(x => <label key={x} className="relative cursor-pointer">
        <input type="radio" name="akno-interval" value={x} checked={v === x} onChange={() => set(x)} className="peer sr-only" />
        {v === x && <motion.span layoutId="akno-interval-pill" className="absolute inset-0 rounded-full bg-white shadow-[0_6px_20px_-8px_rgba(255,255,255,.5)]" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
        <span className={`relative flex h-9 items-center gap-2 rounded-full px-4 text-[14px] font-medium transition-colors duration-200 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-white/60 ${v === x ? "text-black" : "text-white/60 hover:text-white"}`}>
          {x === "month" ? "Mensuel" : "Annuel"}
          {x === "year" && <span className={`rounded-full px-1.5 py-[3px] text-[11.5px] font-semibold leading-none transition-colors duration-200 ${v === x ? "bg-[#30D158] text-black" : "bg-[#30D158]/15 text-[#30D158]"}`}>-20 %</span>}
        </span>
      </label>)}
    </div>
  </fieldset>
}

function PlanCard({ o, sel, interval, onPick }: { o: typeof OFFERS[number]; sel: boolean; interval: Interval; onPick: () => void }) {
  return <label className={`relative flex w-full cursor-pointer flex-col rounded-[22px] border p-5 transition-[border-color,background-color,box-shadow] duration-200 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-white/60 sm:p-6 ${sel ? "border-white/70 bg-[#121214] shadow-[0_0_0_4px_rgba(255,255,255,.05),0_30px_60px_-34px_rgba(255,255,255,.18)]" : "border-white/[.08] bg-[#0B0B0D] hover:border-white/20"}`}>
    <input type="radio" name="akno-plan" value={o.id} checked={sel} onChange={onPick} className="sr-only" />
    <div className="flex items-start justify-between gap-4">
      <div><div className="text-[18px] font-semibold tracking-[-0.02em]">{o.name}</div><div className="mt-1 text-[13.5px] leading-[1.45] text-white/50">{o.tagline}</div></div>
      <span aria-hidden className={`mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${sel ? "border-white bg-white text-black" : "border-white/25"}`}>
        <motion.span initial={false} animate={{ scale: sel ? 1 : 0, opacity: sel ? 1 : 0 }} transition={{ type: "spring", stiffness: 600, damping: 30 }}><Check size={13} strokeWidth={3} /></motion.span>
      </span>
    </div>
    <div className="mt-6 flex flex-wrap items-baseline gap-x-2">
      <span className="text-[36px] font-semibold leading-none tracking-[-0.045em]"><Num v={perMonth(o.monthly, interval)} /></span>
      <span className="text-[13.5px] text-white/45">HT / mois</span>
      <AnimatePresence initial={false}>{interval === "year" && <motion.s key="was" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} transition={{ duration: .3, ease: EASE }} className="text-[13.5px] tabular-nums text-white/35 decoration-white/40">{eur(o.monthly)}</motion.s>}</AnimatePresence>
    </div>
    <div className="mt-2 h-[18px] text-[12.5px] tabular-nums text-white/40">{interval === "year" ? <>{eur(yearly(o.monthly), 2)} HT facturés une fois par an</> : "Facturé chaque mois"}</div>
    <ul className="mt-5 space-y-2.5 border-t border-white/[.06] pt-5 text-[13.5px] leading-[1.45] text-white/75">
      {o.items.map(it => <li key={it.t} className="flex gap-2.5"><Check size={15} strokeWidth={2.4} className="mt-[2px] shrink-0" style={{ color: it.k ? (it.k === "rel" ? "#8A5CFF" : A[it.k].c) : "rgba(255,255,255,.45)" }} />{it.t}</li>)}
    </ul>
    <div className="mt-auto pt-5"><div className="rounded-[12px] bg-white/[.035] px-3 py-2 font-mono text-[11.5px] tabular-nums text-white/45">{o.quotas.devis} brouillons de devis IA · {o.quotas.sms} SMS par mois</div></div>
  </label>
}

function ReceptionRow({ on, set, interval }: { on: boolean; set: (v: boolean) => void; interval: Interval }) {
  return <label className={`mt-3 flex cursor-pointer items-center gap-4 rounded-[22px] border p-4 transition-[border-color,background-color] duration-200 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-white/60 sm:p-5 ${on ? "border-white/30 bg-[#121214]" : "border-white/[.08] bg-[#0B0B0D] hover:border-white/20"}`}>
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/[.06]"><Blob c={A.rec.c} s={26} /></span>
    <span className="min-w-0 flex-1">
      <span className="flex flex-wrap items-baseline gap-x-2"><span className="text-[15.5px] font-semibold tracking-[-0.01em]">Option {RECEPTION.name}</span><span className="text-[13.5px] text-white/60">+<Num v={perMonth(RECEPTION.monthly, interval)} /> HT / mois</span></span>
      <span className="mt-0.5 block text-[13px] leading-[1.45] text-white/50">{RECEPTION.desc} {RECEPTION.minutes} min d'appel incluses par mois.</span>
    </span>
    <input type="checkbox" role="switch" checked={on} onChange={e => set(e.target.checked)} className="sr-only" aria-label={`Option ${RECEPTION.name}`} />
    <span aria-hidden className={`relative h-[28px] w-[46px] shrink-0 rounded-full transition-colors duration-200 ${on ? "bg-white" : "bg-white/[.14]"}`}>
      <motion.span className={`absolute top-[3px] h-[22px] w-[22px] rounded-full shadow-[0_1px_3px_rgba(0,0,0,.4)] ${on ? "bg-black" : "bg-white"}`} initial={false} animate={{ left: on ? 21 : 3 }} transition={{ type: "spring", stiffness: 600, damping: 36 }} />
    </span>
  </label>
}

function Summary({ offerName, plan, interval, reception, totalHT, trial, trialDays, trialEnd, compact, children }: { offerName: string; plan: Plan; interval: Interval; reception: boolean; totalHT: number; trial: boolean; trialDays: number; trialEnd: Date; compact?: boolean; children?: ReactNode }) {
  const per = interval === "year" ? "an" : "mois"
  const o = OFFERS.find(x => x.id === plan) || OFFERS[0]
  return <div className="rounded-[24px] border border-white/[.07] bg-gradient-to-b from-[#121214] to-[#0B0B0D] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.05),0_24px_60px_-30px_rgba(0,0,0,1)] sm:p-6">
    <div className="text-[13px] font-medium text-white/45">Récapitulatif</div>
    <div className="mt-4 space-y-2.5 text-[14px]">
      <div className="flex items-baseline justify-between gap-3"><span className="text-white/85">{offerName}</span><span className="tabular-nums text-white/85"><Num v={perPeriod(o.monthly, interval)} dec={2} /></span></div>
      <AnimatePresence initial={false}>{reception && <motion.div key="rec" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: .25, ease: EASE }} className="overflow-hidden">
        <div className="flex items-baseline justify-between gap-3"><span className="text-white/85">Option {RECEPTION.name}</span><span className="tabular-nums text-white/85"><Num v={perPeriod(RECEPTION.monthly, interval)} dec={2} /></span></div>
      </motion.div>}</AnimatePresence>
      <div className="flex items-baseline justify-between gap-3 text-[13px] text-white/45"><span>Facturation {interval === "year" ? "annuelle (-20 %)" : "mensuelle"}</span><span className="tabular-nums">HT / {per}</span></div>
    </div>

    <div className="mt-5 border-t border-white/[.07] pt-5">
      {trial ? <ol className="relative">
        <span aria-hidden className="absolute bottom-[30px] left-[5px] top-[14px] w-px overflow-hidden bg-white/[.1]"><motion.span className="absolute inset-0 origin-top bg-gradient-to-b from-[#30D158] to-white/60" initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: .9, ease: EASE, delay: .35 }} /></span>
        <li className="relative flex items-start gap-3.5 pb-5">
          <span className="relative mt-[5px] h-[11px] w-[11px] shrink-0 rounded-full bg-[#30D158] shadow-[0_0_0_4px_rgba(48,209,88,.15)]" />
          <div className="min-w-0 flex-1"><div className="flex items-baseline justify-between gap-3"><span className="text-[14px] font-medium">Aujourd'hui</span><span className="text-[20px] font-semibold tabular-nums tracking-[-0.03em] text-[#30D158]">0 €</span></div>
            <div className="text-[13px] text-white/50">Essai gratuit de {trialDays} jours, toutes les fonctions de l'offre</div></div>
        </li>
        <li className="relative flex items-start gap-3.5">
          <span className="relative mt-[5px] h-[11px] w-[11px] shrink-0 rounded-full border-2 border-white/70 bg-black" />
          <div className="min-w-0 flex-1"><div className="flex items-baseline justify-between gap-3"><span className="text-[14px] font-medium">{dateFr(trialEnd)}</span><span className="text-[15px] font-semibold tabular-nums"><Num v={totalHT} dec={2} /> <span className="text-[12px] font-normal text-white/45">HT</span></span></div>
            <div className="text-[13px] text-white/50">Premier prélèvement, soit <span className="tabular-nums">{eur(Math.round(totalHT * (1 + TVA) * 100) / 100, 2)}</span> TTC, puis chaque {per === "an" ? "année" : "mois"}</div></div>
        </li>
      </ol> : <div className="flex items-baseline justify-between gap-3"><span className="text-[14px] font-medium">À payer aujourd'hui</span><span className="text-right"><span className="text-[20px] font-semibold tabular-nums tracking-[-0.03em]"><Num v={totalHT} dec={2} /></span> <span className="text-[12px] text-white/45">HT</span><span className="block text-[12.5px] tabular-nums text-white/45">soit {eur(Math.round(totalHT * (1 + TVA) * 100) / 100, 2)} TTC</span></span></div>}
    </div>
    {!compact && trial && <ul className="mt-5 space-y-1.5 text-[12.5px] text-white/45"><li className="flex items-center gap-2"><Check size={13} strokeWidth={2.2} className="text-white/45" />Résiliable à tout moment dans Paramètres › Abonnement</li><li className="flex items-center gap-2"><Lock size={12.5} strokeWidth={2} className="text-white/45" />Paiement sécurisé par Stripe</li></ul>}
    {children}
  </div>
}

/** Mobile : récapitulatif en une carte compacte au-dessus du formulaire de paiement. */
function MiniSummary({ offerName, interval, reception, totalHT, trial, trialEnd }: { offerName: string; interval: Interval; reception: boolean; totalHT: number; trial: boolean; trialEnd: Date }) {
  return <div className="flex items-center gap-3.5 rounded-[18px] border border-white/[.07] bg-[#0B0B0D] px-4 py-3.5">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[.06]"><Blob c="#E6E6E6" s={22} /></span>
    <div className="min-w-0 flex-1">
      <div className="truncate text-[14px] font-medium">{offerName}{reception ? " + Réception IA" : ""}</div>
      <div className="text-[12.5px] tabular-nums text-white/50">{trial ? <>Puis {eur(totalHT, 2)} HT/{interval === "year" ? "an" : "mois"} dès le {dateFr(trialEnd, { day: "numeric", month: "short" })}</> : <>{eur(totalHT, 2)} HT/{interval === "year" ? "an" : "mois"}</>}</div>
    </div>
    <div className="text-right">{trial ? <><div className="text-[17px] font-semibold text-[#30D158]">0 €</div><div className="text-[11.5px] text-white/40">aujourd'hui</div></> : null}</div>
  </div>
}

function Cta({ busy, trial, onClick }: { busy: boolean; trial: boolean; onClick: () => void }) {
  return <motion.button type="button" onClick={onClick} disabled={busy} aria-busy={busy || undefined} whileTap={{ scale: .985 }}
    className="group/b relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-white text-[15.5px] font-semibold tracking-[-0.01em] text-black shadow-[0_1px_0_rgba(255,255,255,.4)_inset,0_10px_30px_-12px_rgba(255,255,255,.35)] transition-[background-color,opacity] duration-200 hover:bg-[#F2F2F2] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-white disabled:cursor-progress disabled:opacity-80">
    {busy ? <><Spinner /><span>Préparation du paiement…</span></> : <><span>{trial ? "Commencer l'essai gratuit" : "Continuer vers le paiement"}</span><ArrowRight size={17} strokeWidth={2} className="transition-transform duration-200 group-hover/b:translate-x-0.5" /></>}
  </motion.button>
}

const ErrorLine = ({ err, className = "" }: { err: string; className?: string }) => <div role="alert" aria-live="assertive" className={className}>{err && <p className="mt-3 text-[13px] leading-[1.5] text-[#FF6B61]">{err}</p>}</div>

function PaneSkeleton() {
  return <div aria-hidden className="absolute inset-0 p-6 sm:p-8">
    <div className="space-y-4 motion-safe:animate-pulse">
      {[44, 44, 92, 44, 44].map((h, i) => <div key={i} className="rounded-[12px] bg-white/[.04]" style={{ height: h }} />)}
      <div className="h-12 rounded-full bg-white/[.07]" />
    </div>
  </div>
}

/** Activation : relit l'abonnement chez Stripe côté serveur jusqu'à ce que l'accès soit ouvert. */
function Done({ session, pick, offerName, trial, trialDays, onEnter, enterLabel = "Entrer dans Akno" }: { session: string; pick: Pick; offerName: string; trial: boolean; trialDays: number; onEnter: () => void; enterLabel?: string }) {
  const reduce = useReducedMotion()
  const [ok, setOk] = useState(false), [slow, setSlow] = useState(false), [run, setRun] = useState(0), [end, setEnd] = useState<string | null>(null)
  const [inTrial, setInTrial] = useState(trial)
  useEffect(() => {
    let alive = true
    setSlow(false)
    ;(async () => {
      for (let i = 0; i < 14 && alive; i++) {
        const r = session && i % 3 === 0 ? await api("/api/account", { action: "checkout_sync", session_id: session }) : await api("/api/account", { action: "status" })
        const e = r.entitlements as { access?: boolean; status?: string; trialEndsAt?: string | null } | undefined
        if (r.ok && e?.access && e.status !== "none") {
          try { sessionStorage.removeItem(PICK) } catch { /* ignore */ }
          await reloadAccount()
          if (alive) { setEnd(e.trialEndsAt || null); setInTrial(e.status === "trial"); setOk(true) }
          return
        }
        await new Promise(res => setTimeout(res, 2200))
      }
      if (alive) setSlow(true)
    })()
    return () => { alive = false }
  }, [session, run])
  const endD = end ? new Date(end) : new Date(Date.now() + trialDays * 864e5)
  return <div className="mx-auto max-w-[460px] pt-6 text-center sm:pt-14">
    <div className="relative mx-auto mb-8 flex h-[112px] w-[112px] items-center justify-center">
      {!reduce && ok && [0, 1].map(i => <motion.span key={i} aria-hidden className="absolute inset-0 rounded-full border border-[#30D158]/40" initial={{ scale: .7, opacity: 0 }} animate={{ scale: [.7, 1.45], opacity: [.7, 0] }} transition={{ duration: 2.2, repeat: Infinity, delay: .2 + i * 1.1, ease: "easeOut" }} />)}
      <motion.div initial={{ scale: .6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }} className="relative flex h-[88px] w-[88px] items-center justify-center rounded-full bg-gradient-to-b from-[#1A1A1D] to-[#101012] shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_20px_40px_-20px_rgba(0,0,0,1)]">
        <Blob c="#E6E6E6" s={46} />
        <AnimatePresence>{ok && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 22 }} className="absolute -bottom-0.5 -right-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-[#30D158] text-black ring-4 ring-black"><Check size={16} strokeWidth={3} /></motion.span>}</AnimatePresence>
      </motion.div>
    </div>
    <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.035em] text-balance" aria-live="polite">{ok ? (inTrial ? "Votre essai a commencé" : "Bienvenue dans Akno") : "Activation de votre espace…"}</h1>
    <p className="mt-3 text-[15px] leading-[1.55] text-white/55 text-pretty">{ok
      ? inTrial ? <>{offerName}{pick.reception ? " avec la Réceptionniste IA" : ""}, gratuit jusqu'au <span className="text-white">{dateFr(endD)}</span>. Vous pouvez résilier à tout moment dans Paramètres › Abonnement.</> : <>{offerName}{pick.reception ? " avec la Réceptionniste IA" : ""} est actif.</>
      : "Nous confirmons votre abonnement auprès de Stripe. Cela prend quelques secondes."}</p>
    <div className="mt-8">
      <motion.button type="button" disabled={!ok} onClick={onEnter} whileTap={{ scale: .985 }} className="group/b flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-[15.5px] font-semibold text-black transition-opacity duration-200 hover:bg-[#F2F2F2] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-white disabled:cursor-progress disabled:opacity-70">
        {ok ? <>{enterLabel}<ArrowRight size={17} strokeWidth={2} className="transition-transform duration-200 group-hover/b:translate-x-0.5" /></> : <><Spinner />Activation…</>}
      </motion.button>
      {slow && !ok && <div className="mt-4 text-[13.5px] leading-[1.5] text-white/55">L'activation prend plus de temps que prévu. <button type="button" onClick={() => setRun(x => x + 1)} className="inline-flex items-center gap-1 font-semibold text-white underline decoration-white/40 underline-offset-2 hover:decoration-white"><RotateCcw size={13} />Réessayer</button></div>}
    </div>
  </div>
}
