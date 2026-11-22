/* update48 · Droits de l'offre appliqués à l'interface.
   - ReceptionLocked : la page Réception devient une présentation de l'option Réceptionniste IA (offre sans l'option).
   - LockTag : petit cadenas discret sur une fonction réservée à l'offre Clients.
   - UpgradeHost : écran « Ajouter l'option » / « Passer en Clients » sur l'abonnement existant (même pendant l'essai),
     avec aperçu du nouveau montant, confirmation, puis droits rafraîchis directement depuis Stripe. */
import { useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowRight, CalendarCheck, Check, FileText, Lock, PhoneIncoming, ShieldAlert, Timer, X } from "lucide-react"
import { A, Blob } from "../ui"
import { EASE, Spinner } from "../auth/fields"
import { api, reloadAccount, useRights, type UpgradeKind } from "../../lib/accountApi"
import { OFFERS, RECEPTION, TVA, dateFr, eur, yearly, type Interval } from "../../lib/offers"
import ModalSheet from "../sheet/ModalSheet"
import { billingHidden } from "../../lib/native"
import { NativeNotIncluded, NativeReceptionOff } from "./NativeAccess"

type Preview = { kind: UpgradeKind; interval: Interval; trialing: boolean; trialEnd: string | null; periodEnd: string | null; current: number; next: number; added: number; proration: number; taxPct: number }

/* Aperçu mis en cache quelques minutes (évite d'interroger Stripe à chaque affichage). */
const memo = new Map<UpgradeKind, { at: number; p: Preview }>()
async function fetchPreview(kind: UpgradeKind, fresh = false): Promise<{ p?: Preview; error?: string }> {
  const m = memo.get(kind)
  if (!fresh && m && Date.now() - m.at < 120000) return { p: m.p }
  const r = await api("/api/account", { action: "upgrade", add: kind })
  if (!r.ok || !r.preview) return { error: r.error || "Aperçu indisponible." }
  const p = r.preview as Preview
  memo.set(kind, { at: Date.now(), p })
  return { p }
}

const per = (i: Interval) => i === "year" ? "an" : "mois"
const c2e = (c: number) => c / 100

/** Cadenas discret « Offre Clients » affiché à droite d'une ligne de réglages. */
export const LockTag = ({ children = "Offre Clients" }: { children?: ReactNode }) =>
  // update70 · app native : aucune mention d'offre ni d'achat
  <span className="inline-flex h-[24px] items-center gap-1.5 whitespace-nowrap rounded-full bg-white/[.06] px-2.5 text-[12px] font-medium text-white/60"><Lock size={11} strokeWidth={2} aria-hidden />{billingHidden ? "Non incluse" : children}</span>

/* ---------------- Page Réception sans l'option ---------------- */
const FEATS = [
  { I: PhoneIncoming, t: "Décroche à votre place", d: "Même quand vous êtes sur un chantier ou au volant." },
  { I: ShieldAlert, t: "Qualifie chaque appel", d: "Motif, adresse, urgence : tout est noté dans la fiche client." },
  { I: CalendarCheck, t: "Prend le rendez-vous", d: "Directement dans votre agenda Akno." },
  { I: FileText, t: "Prépare le devis", d: "Un brouillon à partir de l'appel, prêt à valider." },
]

export function ReceptionLocked(props: { desk: boolean; calls: number; onCalls: () => void }) {
  if (billingHidden) return <NativeReceptionOff {...props} /> // update70 · app native : ni prix ni bouton d'achat
  return <ReceptionLockedWeb {...props} />
}
function ReceptionLockedWeb({ desk, calls, onCalls }: { desk: boolean; calls: number; onCalls: () => void }) {
  const r = useRights(), reduce = useReducedMotion()
  const [p, setP] = useState<Preview | null>(null)
  useEffect(() => { if (r.canUpgrade) void fetchPreview("reception").then(x => x.p && setP(x.p)) }, [r.canUpgrade])
  const interval: Interval | null = p?.interval || null
  const price = interval ? c2e(p!.added) : null
  const rise = (i: number) => reduce ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: .5, ease: EASE, delay: .04 * i } }
  return <div className={`h-full overflow-y-auto ${desk ? "px-8 pt-10" : "px-5"}`}>
    {!desk && <div aria-hidden style={{ height: "calc(var(--sat) + 2px)" }} />}
    {!desk && <div className="flex h-10 items-center"><img src="/logo.png" alt="Akno" className="h-[25px] w-auto" /></div>}
    <div className={`mx-auto w-full ${desk ? "max-w-[980px]" : "max-w-[520px] pt-6"}`}>
      <div className={desk ? "grid grid-cols-[1.15fr_1fr] items-start gap-12" : ""}>
        <div>
          <motion.div {...rise(0)} className="relative flex h-[84px] w-[84px] items-center justify-center rounded-full bg-gradient-to-b from-[#1A1A1D] to-[#101012] shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_20px_40px_-20px_rgba(0,0,0,1)]"><Blob c={A.rec.c} s={44} /><span className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-[#1C1C1F] text-white/70 ring-4 ring-black"><Lock size={13} strokeWidth={2} /></span></motion.div>
          <motion.div {...rise(1)} className="mt-7 text-[12px] font-semibold uppercase tracking-[.08em] text-white/45">Option · {RECEPTION.name}</motion.div>
          <motion.h1 {...rise(2)} className={`mt-2 font-semibold leading-[1.06] tracking-[-0.035em] text-balance ${desk ? "text-[40px]" : "text-[32px]"}`}>Ne manquez plus aucun appel.</motion.h1>
          <motion.p {...rise(3)} className="mt-3 max-w-[460px] text-[15.5px] leading-[1.55] text-white/55 text-pretty">Votre réceptionniste IA répond à vos clients au nom de votre entreprise. Vous retrouvez chaque demande prête à traiter.</motion.p>
          <motion.ul {...rise(4)} className="mt-8 space-y-5">{FEATS.map(({ I, t, d }) => <li key={t} className="flex gap-3.5"><span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[.06] text-white/80"><I size={17} strokeWidth={1.6} /></span><div><div className="text-[15px] font-medium tracking-[-0.01em]">{t}</div><div className="mt-0.5 text-[13.5px] leading-[1.45] text-white/50">{d}</div></div></li>)}</motion.ul>
        </div>
        <motion.div {...rise(5)} className={`${desk ? "sticky top-2" : "mt-10"} rounded-[28px] border border-white/[.08] bg-gradient-to-b from-[#161618] to-[#0E0E10] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,.05)]`}>
          <div className="text-[13px] font-medium text-white/55">Ajoutée à votre abonnement</div>
          <div className="mt-3 flex items-baseline gap-1.5">{price != null
            ? <><span className="text-[44px] font-semibold leading-none tracking-[-0.04em]">{eur(price)}</span><span className="text-[15px] text-white/50">HT / {per(interval!)}</span></>
            : <><span className="text-[44px] font-semibold leading-none tracking-[-0.04em]">{eur(RECEPTION.monthly)}</span><span className="text-[15px] text-white/50">HT / mois</span></>}</div>
          <div className="mt-2 text-[13px] text-white/45">{price != null && interval === "year" ? `soit ${eur(Math.round(price / 12 * 100) / 100)} HT par mois · ` : price == null ? `ou ${eur(yearly(RECEPTION.monthly))} HT / an · ` : ""}{RECEPTION.minutes} minutes d'appels incluses par mois</div>
          <div className="my-5 h-px bg-white/[.07]" />
          <ul className="space-y-2.5 text-[14px] text-white/75">
            <li className="flex items-center gap-2.5"><Check size={15} strokeWidth={2.2} className="text-[#30D158]" />Sur votre abonnement actuel, même pendant l'essai</li>
            <li className="flex items-center gap-2.5"><Timer size={15} strokeWidth={2} className="text-white/50" />Active immédiatement</li>
            <li className="flex items-center gap-2.5"><Check size={15} strokeWidth={2.2} className="text-[#30D158]" />Résiliable à tout moment</li>
          </ul>
          <motion.button type="button" whileTap={{ scale: .985 }} onClick={() => openUpgradeEvt("reception")} className="group/b mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-[15.5px] font-semibold text-black transition-colors hover:bg-[#F2F2F2] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-white">Ajouter la Réceptionniste IA<ArrowRight size={17} strokeWidth={2} className="transition-transform duration-200 group-hover/b:translate-x-0.5" /></motion.button>
          {calls > 0 && <button type="button" onClick={onCalls} className="mt-4 w-full text-center text-[13px] text-white/50 underline decoration-white/20 underline-offset-2 hover:text-white/80">Vos {calls} appel{calls > 1 ? "s" : ""} déjà enregistré{calls > 1 ? "s" : ""} restent dans les fiches clients</button>}
        </motion.div>
      </div>
      <div aria-hidden style={{ height: desk ? 48 : "calc(110px + max(var(--sab) - 10px, 12px))" }} />
    </div>
  </div>
}
const openUpgradeEvt = (k: UpgradeKind) => dispatchEvent(new CustomEvent("akno-upgrade", { detail: k }))

/* ---------------- Écran de confirmation ---------------- */
type Phase = "load" | "confirm" | "busy" | "done" | "error"
const TITLE: Record<UpgradeKind, string> = { reception: "Ajouter la Réceptionniste IA", clients: "Passer à l'offre Clients" }
const GAINS: Record<UpgradeKind, string[]> = {
  reception: [RECEPTION.desc, `${RECEPTION.minutes} minutes d'appels incluses par mois`],
  clients: OFFERS[1].items.slice(1).map(i => i.t),
}

function Sheet({ kind, close }: { kind: UpgradeKind; close: () => void }) {
  const reduce = useReducedMotion()
  const wide = typeof matchMedia !== "undefined" && matchMedia("(min-width: 640px)").matches
  const [ph, setPh] = useState<Phase>("load"), [p, setP] = useState<Preview | null>(null), [err, setErr] = useState(""), [portal, setPortal] = useState(false)
  useEffect(() => { let on = true; void fetchPreview(kind, true).then(x => { if (!on) return; if (x.p) { setP(x.p); setPh("confirm") } else { setErr(x.error || ""); setPh("error") } }); return () => { on = false } }, [kind])
  useEffect(() => { const f = (e: KeyboardEvent) => { if (e.key === "Escape" && ph !== "busy") close() }; addEventListener("keydown", f); return () => removeEventListener("keydown", f) }, [ph, close])
  const confirm = async () => {
    setPh("busy")
    const r = await api("/api/account", { action: "upgrade", add: kind, confirm: true })
    if (!r.ok) { setErr(r.error || "La modification n'a pas abouti."); setPh("error"); return }
    if (r.preview) setP(r.preview as Preview)
    memo.clear()
    await reloadAccount()
    setPh("done")
  }
  const toPortal = async () => { setPortal(true); const r = await api("/api/account", { action: "portal" }); if (r.ok && typeof r.url === "string") location.href = r.url; else { setPortal(false); setErr(r.error || "Portail indisponible.") } }
  const i = p?.interval || "month", ttc = (c: number) => c2e(c) * (1 + (p?.taxPct ? TVA : 0))
  const addLabel = kind === "reception" ? RECEPTION.name : "Passage en Clients"
  const addAmt = p ? (kind === "reception" ? p.added : p.next - p.current) : 0
  const Row = ({ l, v, strong }: { l: ReactNode; v: ReactNode; strong?: boolean }) => <div className={`flex items-baseline justify-between gap-4 ${strong ? "text-[16px] font-semibold" : "text-[14.5px] text-white/70"}`}><span>{l}</span><span className="tabular-nums">{v}</span></div>
  return <ModalSheet label={TITLE[kind]} onClose={close} desk={wide} z={85} escape={false} dismissible={ph !== "busy"} backdrop="bg-black/70"
      className={`border border-white/[.08] bg-[#0E0E10] px-6 pt-6 ${wide ? "pb-6" : "pb-[max(24px,env(safe-area-inset-bottom))]"}`} deskClass="max-w-[460px] rounded-[28px]">
      <div className="min-h-0 overflow-y-auto overscroll-contain">
      {ph !== "busy" && <button type="button" aria-label="Fermer" onClick={close} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/[.06] text-white/60 hover:text-white"><X size={16} /></button>}
      <AnimatePresence mode="wait" initial={false}>
        {ph === "done" && p ? <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-2 text-center">
          <div className="relative mx-auto flex h-[76px] w-[76px] items-center justify-center rounded-full bg-gradient-to-b from-[#1A1A1D] to-[#101012]"><Blob c={kind === "reception" ? A.rec.c : A.rel.c} s={38} /><motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 22 }} className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-[#30D158] text-black ring-4 ring-[#0E0E10]"><Check size={14} strokeWidth={3} /></motion.span></div>
          <h2 className="mt-6 text-[24px] font-semibold tracking-[-0.03em]">{kind === "reception" ? "Réceptionniste IA activée" : "Offre Clients activée"}</h2>
          <p className="mt-2 text-[14.5px] leading-[1.55] text-white/55 text-pretty">Nouveau montant : <span className="text-white">{eur(c2e(p.next))} HT / {per(i)}</span>{p.trialing && p.trialEnd ? <>, à partir du {dateFr(new Date(p.trialEnd))}. Votre essai continue.</> : "."}</p>
          <button type="button" onClick={close} className="mt-7 flex h-12 w-full items-center justify-center rounded-full bg-white text-[15.5px] font-semibold text-black hover:bg-[#F2F2F2]">Continuer</button>
        </motion.div>
        : ph === "error" ? <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <h2 className="pr-10 text-[22px] font-semibold tracking-[-0.03em]">{TITLE[kind]}</h2>
          <p className="mt-3 text-[14.5px] leading-[1.55] text-white/60">{err || "Cette modification n'est pas disponible pour le moment."}</p>
          <div className="mt-6 flex gap-2"><button type="button" onClick={close} className="h-12 flex-1 rounded-full bg-white/[.08] text-[15px] font-medium hover:bg-white/[.12]">Fermer</button><button type="button" onClick={toPortal} disabled={portal} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-white text-[15px] font-semibold text-black disabled:opacity-60">{portal ? <Spinner /> : null}Gérer l'abonnement</button></div>
        </motion.div>
        : <motion.div key="confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="flex items-center gap-3 pr-10"><Blob c={kind === "reception" ? A.rec.c : A.rel.c} s={26} /><h2 className="text-[22px] font-semibold tracking-[-0.03em]">{TITLE[kind]}</h2></div>
          <ul className="mt-4 space-y-1.5">{GAINS[kind].map(g => <li key={g} className="flex gap-2 text-[13.5px] leading-[1.45] text-white/60"><Check size={14} strokeWidth={2.2} className="mt-[3px] shrink-0 text-[#30D158]" />{g}</li>)}</ul>
          <div className="mt-6 space-y-3 rounded-[20px] bg-white/[.04] p-4">
            {p ? <>
              <Row l="Abonnement actuel" v={`${eur(c2e(p.current))} HT`} />
              <Row l={addLabel} v={`+ ${eur(c2e(addAmt))} HT`} />
              <div className="h-px bg-white/[.08]" />
              <Row strong l={`Nouveau montant / ${per(i)}`} v={`${eur(c2e(p.next))} HT`} />
              {p.taxPct > 0 && <div className="-mt-2 text-right text-[12.5px] text-white/45">soit {eur(Math.round(ttc(p.next) * 100) / 100)} TTC</div>}
            </> : <div className="space-y-3">{[0, 1, 2].map(k => <div key={k} className="h-4 animate-pulse rounded-full bg-white/[.06]" style={{ width: `${90 - k * 18}%` }} />)}</div>}
          </div>
          <p className="mt-4 text-[13px] leading-[1.5] text-white/50 text-pretty">{!p ? "Calcul du nouveau montant…" : p.trialing ? <>Rien à payer aujourd'hui : votre essai continue{p.trialEnd ? <> jusqu'au <span className="text-white/80">{dateFr(new Date(p.trialEnd))}</span></> : null}. Premier prélèvement au nouveau montant ensuite.</> : p.proration > 0 ? <>Au prorata, <span className="text-white/80">{eur(c2e(p.proration), 2)} HT</span>{p.taxPct ? <> ({eur(c2e(p.proration) * (1 + p.taxPct / 100), 2)} TTC)</> : null} seront débités aujourd'hui sur votre moyen de paiement, puis {eur(c2e(p.next))} HT / {per(i)}.</> : <>Le nouveau montant s'applique à votre prochaine échéance{p.periodEnd ? ` (${dateFr(new Date(p.periodEnd))})` : ""}.</>}</p>
          <motion.button type="button" whileTap={{ scale: .985 }} disabled={ph !== "confirm"} onClick={confirm} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-[15.5px] font-semibold text-black transition-opacity hover:bg-[#F2F2F2] disabled:cursor-progress disabled:opacity-70">{ph === "busy" ? <><Spinner />Mise à jour…</> : kind === "reception" ? "Confirmer l'ajout" : "Confirmer le passage en Clients"}</motion.button>
        </motion.div>}
      </AnimatePresence>
      </div>
  </ModalSheet>
}

/** Monté une fois dans l'app : écoute openUpgrade(kind). */
export function UpgradeHost() {
  const [k, setK] = useState<UpgradeKind | null>(null)
  useEffect(() => { const f = (e: Event) => setK((e as CustomEvent<UpgradeKind>).detail); addEventListener("akno-upgrade", f); return () => removeEventListener("akno-upgrade", f) }, [])
  // update70 · app native : feuille neutre, sans aperçu de prix ni confirmation d'achat
  if (billingHidden) return createPortal(<AnimatePresence>{k && <NativeNotIncluded key={k} what={k === "reception" ? "Réceptionniste IA" : "Offre Clients"} close={() => setK(null)} />}</AnimatePresence>, document.body)
  return createPortal(<AnimatePresence>{k && <Sheet key={k} kind={k} close={() => setK(null)} />}</AnimatePresence>, document.body)
}
