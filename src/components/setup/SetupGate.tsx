/* update51 · Première visite d'une page non configurée :
   la page reste visible derrière, floutée et inerte, avec une carte « Configurez vos devis » (etc.)
   et un mini-assistant en 2 ou 3 étapes. Une fois terminé : réglages enregistrés dans la fiche artisan
   (champs existants), page marquée configurée côté serveur (lib/setup.ts), le flou s'efface.
   Les comptes qui ont déjà de l'activité sur la page (appels, RDV, relances, devis) ne sont pas bloqués. */
import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowRight, Check, ChevronLeft, X } from "lucide-react"
import { A, Blob, Tg, ink, useC, type K, type P } from "../ui"
import { EASE, Field, Spinner } from "../auth/fields"
import { DAYS, DEF_H, type H } from "../sheets/ReglagesSheets"
import { useProfile, type Profile } from "../../lib/profile"
import { api, useAccount, useRights } from "../../lib/accountApi"
import { mergeTarifs } from "../../lib/tarifs"
import { digitsFr, fmtTel } from "../../lib/phone"
import { markSetupDone, setLockedPage, useSetupFlags } from "../../lib/setup"
import type { St } from "../../lib/store"

/* ---------------- Textes ---------------- */
const COPY: Record<K, { t: string; d: string; steps: string[]; done: string }> = {
  dev: { t: "Configurez vos devis", d: "Vos mentions légales, votre TVA et vos tarifs : Akno s'en sert pour préparer des devis conformes, prêts à envoyer.", steps: ["Mentions légales", "TVA et conditions", "Vos tarifs"], done: "Devis configurés" },
  rec: { t: "Configurez votre réceptionniste", d: "Dites-lui comment présenter votre entreprise, quand vous êtes joignable et où vous joindre en cas d'urgence.", steps: ["Accueil", "Horaires", "Urgences et zone"], done: "Réceptionniste configurée" },
  ag: { t: "Configurez votre agenda", d: "Vos horaires de travail et la durée de vos interventions, pour que chaque rendez-vous tombe au bon moment.", steps: ["Horaires", "Interventions"], done: "Agenda configuré" },
  rel: { t: "Configurez vos relances", d: "Choisissez quand relancer un devis resté sans réponse et au nom de qui partent les messages.", steps: ["Rythme", "Expéditeur"], done: "Relances configurées" },
}

/* ---------------- Déduction : page déjà utilisée = configurée ---------------- */
const str = (x: unknown) => typeof x === "string" ? x.trim() : ""
function alreadyUsed(k: K, s: St, p: Profile | null, calcom: boolean) {
  if (k === "rec") return s.calls.length > 0
  if (k === "ag") return s.events.length > 0 || calcom
  if (k === "rel") return s.rels.length > 0
  return s.devis.length > 0 || (mergeTarifs(p?.tarifs).tauxHoraire != null && digitsFr(str(p?.entreprise_siret)).length === 14)
}
const opened = new Set<string>() // une page ouverte le reste pendant la session (pas de re-verrouillage si les données changent)

type Status = "pending" | "locked" | "open"
export default function SetupGate({ page, loading, mobile, children }: { page: P; loading: boolean; mobile: boolean; children: ReactNode }) {
  const { s, toast } = useC(), rr = useRights(), acc = useAccount(), { p } = useProfile(), fl = useSetupFlags()
  const reduce = useReducedMotion()
  const k: K | null = page === "set" ? null : page
  const uid = p?.id || ""
  let st: Status
  if (!k || opened.has(`${uid}:${k}`)) st = "open"
  else if (k === "rec" && !rr.ready) st = "pending"
  else if (k === "rec" && !rr.reception) st = "open" // hors offre : l'écran d'option reste affiché
  else if (fl.flags[k]) st = "open"
  else if (!fl.loaded || !p) st = "pending"
  else if (alreadyUsed(k, s, p, !!acc?.integrations.calcom)) st = "open"
  else if (loading) st = "pending"
  else st = "locked"
  if (st === "open" && k && uid) opened.add(`${uid}:${k}`)

  const [wiz, setWiz] = useState(false), [reveal, setReveal] = useState(false), was = useRef<Status>(st)
  useEffect(() => {
    const prev = was.current; was.current = st
    if (prev === "locked" && st === "open") { setWiz(false); setReveal(true); const t = setTimeout(() => setReveal(false), 950); return () => clearTimeout(t) }
  }, [st])
  useEffect(() => { setLockedPage(st === "locked" ? page : null); return () => setLockedPage(null) }, [st, page])
  useEffect(() => { const f = () => { if (st === "locked") setWiz(true) }; addEventListener("akno-setup-open", f); return () => removeEventListener("akno-setup-open", f) }, [st])

  const locked = st === "locked", hidden = st === "pending"
  const box = mobile ? "relative flex min-h-0 flex-1 flex-col" : "relative h-full"
  const c = k ? A[k].c : "#fff"
  return <div className={box}>
    <div className={box} inert={locked || hidden} aria-hidden={locked || hidden || undefined}
      style={{ opacity: hidden ? 0 : 1, filter: locked ? "blur(18px) saturate(.7)" : reveal ? "blur(0px) saturate(1)" : undefined, transition: reduce ? "none" : "filter .9s cubic-bezier(.22,1,.36,1), opacity .35s ease", userSelect: locked ? "none" : undefined }}>
      {children}
    </div>
    <AnimatePresence>{locked && k && <motion.div key="setup-ov" className="absolute inset-0 z-20 flex items-center justify-center px-5"
      style={mobile ? { paddingTop: "calc(var(--sat) + 16px)", paddingBottom: "calc(96px + max(var(--sab) - 10px, 12px))" } : { paddingBottom: 24 }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: .45, ease: EASE } }} transition={{ duration: .35, ease: EASE }}>
      <div aria-hidden className="absolute inset-0" style={{ background: `radial-gradient(60% 50% at 50% 46%, ${c}${c === "#E6E6E6" ? "12" : "1F"} 0%, rgba(0,0,0,.35) 60%, rgba(0,0,0,.55) 100%)` }} />
      <motion.div className="relative flex w-full justify-center" animate={{ opacity: wiz ? 0 : 1, scale: wiz ? .98 : 1 }} transition={{ duration: .25, ease: EASE }}><Intro k={k} onStart={() => setWiz(true)} /></motion.div>
    </motion.div>}</AnimatePresence>
    {createPortal(<AnimatePresence>{wiz && locked && k && <Wizard key={k} k={k} onClose={() => setWiz(false)} onDone={() => toast(COPY[k].done)} />}</AnimatePresence>, document.body)}
  </div>
}

/* ---------------- Carte d'introduction ---------------- */
function Intro({ k, onStart }: { k: K; onStart: () => void }) {
  const t = COPY[k], c = A[k].c, id = useId(), reduce = useReducedMotion()
  return <motion.section aria-labelledby={id} initial={reduce ? false : { opacity: 0, y: 14, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: .985 }} transition={{ duration: .5, ease: EASE }}
    className="relative w-full max-w-[400px] overflow-hidden rounded-[28px] border border-white/[.09] bg-[#121214]/85 px-7 pb-7 pt-8 text-center shadow-[0_40px_80px_-30px_rgba(0,0,0,.95),inset_0_1px_0_rgba(255,255,255,.06)] backdrop-blur-xl">
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-[180px] w-[280px] -translate-x-1/2 -translate-y-1/3 rounded-full" style={{ background: `radial-gradient(circle, ${c}${c === "#E6E6E6" ? "24" : "40"} 0%, transparent 68%)` }} />
    <div className="relative flex justify-center"><motion.div animate={reduce ? undefined : { y: [0, -3, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}><Blob c={c} s={64} /></motion.div></div>
    <h2 id={id} className="relative mt-5 text-[23px] font-semibold leading-tight tracking-[-0.03em] text-balance">{t.t}</h2>
    <p className="relative mx-auto mt-2.5 max-w-[320px] text-[14.5px] leading-[1.55] text-white/55 text-pretty">{t.d}</p>
    <ol className="relative mx-auto mt-6 max-w-[300px] space-y-2.5 text-left" aria-label="Étapes de la configuration">
      {t.steps.map((x, i) => <li key={x} className="flex items-center gap-3 text-[14px] text-white/75">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/[.14] text-[11.5px] font-medium tabular-nums text-white/60">{i + 1}</span>{x}</li>)}
    </ol>
    <motion.button type="button" autoFocus whileTap={{ scale: .985 }} onClick={onStart}
      className="group/b relative mt-7 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-[15.5px] font-semibold tracking-[-0.01em] text-black shadow-[0_10px_30px_-12px_rgba(255,255,255,.35)] transition-colors hover:bg-[#F2F2F2] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-white">
      Configurer<ArrowRight size={17} strokeWidth={2} className="transition-transform duration-200 group-hover/b:translate-x-0.5" />
    </motion.button>
    <p className="relative mt-3 text-[12.5px] text-white/35">Environ {t.steps.length === 2 ? "1 minute" : "2 minutes"} · modifiable ensuite dans Paramètres</p>
  </motion.section>
}

/* ---------------- Briques de formulaire ---------------- */
function Seg<T extends string | number>({ label, value, opts, onChange, hint }: { label: string; value: T; opts: [T, string][]; onChange: (v: T) => void; hint?: string }) {
  const id = useId()
  return <div>
    <div id={id} className="mb-2 px-0.5 text-[13px] font-medium text-white/70">{label}</div>
    <div role="radiogroup" aria-labelledby={id} className="grid gap-1 rounded-[14px] border border-white/[.09] bg-[#0E0E10] p-1" style={{ gridTemplateColumns: `repeat(${opts.length}, minmax(0, 1fr))` }}>
      {opts.map(([v, l]) => { const on = v === value; return <button key={String(v)} type="button" role="radio" aria-checked={on} onClick={() => onChange(v)}
        className={`relative h-10 rounded-[10px] text-[14px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-white/60 ${on ? "text-black" : "text-white/60 hover:text-white"}`}>
        {on && <motion.span layoutId={`seg-${id}`} transition={{ type: "spring", stiffness: 420, damping: 34 }} className="absolute inset-0 rounded-[10px] bg-white" />}<span className="relative">{l}</span></button> })}
    </div>
    {hint && <p className="mt-2 px-0.5 text-[12.5px] text-white/40">{hint}</p>}
  </div>
}
function Area({ label, value, onChange, max, hint, error, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; max: number; hint?: string; error?: string; rows?: number }) {
  const id = useId()
  return <div className="group/f">
    <div className="mb-2 flex items-baseline justify-between px-0.5"><label htmlFor={id} className="text-[13px] font-medium text-white/70 group-focus-within/f:text-white">{label}</label><span className="text-[11.5px] tabular-nums text-white/30">{value.length}/{max}</span></div>
    <textarea id={id} rows={rows} maxLength={max} value={value} onChange={e => onChange(e.target.value)} aria-invalid={error ? true : undefined}
      className={`w-full resize-none rounded-[12px] border bg-[#0E0E10] px-4 py-3 text-[15px] leading-[1.5] text-white outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-white/25 hover:border-white/[.16] focus:border-white/45 focus:shadow-[0_0_0_4px_rgba(255,255,255,.07)] ${error ? "border-[#FF453A]/70" : "border-white/[.09]"}`} />
    {hint && !error && <p className="mt-2 px-0.5 text-[12.5px] text-white/40">{hint}</p>}
    {error && <p className="mt-2 px-0.5 text-[12.5px] text-[#FF6B61]">{error}</p>}
  </div>
}
function SwitchRow({ on, set, t, d }: { on: boolean; set: (v: boolean) => void; t: string; d?: string }) {
  return <div className="flex items-center gap-4 rounded-[14px] border border-white/[.09] bg-[#0E0E10] px-4 py-3.5">
    <div className="min-w-0 flex-1"><div className="text-[14.5px] font-medium">{t}</div>{d && <div className="mt-0.5 text-[12.5px] leading-[1.45] text-white/45">{d}</div>}</div>
    <Tg on={on} onClick={() => set(!on)} label={t} />
  </div>
}
const timeCls = "h-10 w-[88px] shrink-0 rounded-[10px] border border-white/[.09] bg-[#0E0E10] px-2 text-center [&::-webkit-calendar-picker-indicator]:hidden text-[14.5px] tabular-nums text-white outline-none [color-scheme:dark] focus:border-white/45"
const PRESETS: [string, H][] = [
  ["Lun–ven, 8 h–18 h", DEF_H],
  ["Lun–sam, 8 h–18 h", { ...DEF_H, sam: ["08:00", "18:00"] }],
  ["Lun–ven, 7 h 30–17 h", { lun: ["07:30", "17:00"], mar: ["07:30", "17:00"], mer: ["07:30", "17:00"], jeu: ["07:30", "17:00"], ven: ["07:30", "17:00"], sam: null, dim: null }],
]
function Hours({ h, set, error }: { h: H; set: (h: H) => void; error?: string }) {
  const same = (a: H, b: H) => DAYS.every(([d]) => JSON.stringify(a[d] || null) === JSON.stringify(b[d] || null))
  return <div>
    <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Horaires types">{PRESETS.map(([l, v]) => { const on = same(h, v); return <button key={l} type="button" aria-pressed={on} onClick={() => set({ ...v })}
      className={`h-9 rounded-full border px-3 text-[13px] font-medium transition-colors ${on ? "border-white bg-white text-black" : "border-white/[.12] text-white/70 hover:border-white/25 hover:text-white"}`}>{l}</button> })}</div>
    <div className="divide-y divide-white/[.06] rounded-[14px] border border-white/[.09] bg-[#0E0E10] px-4">
      {DAYS.map(([d, l]) => { const v = h[d]; return <div key={d} className="flex h-14 items-center gap-3">
        <Tg on={!!v} onClick={() => set({ ...h, [d]: v ? null : ["08:00", "18:00"] })} label={`${l} travaillé`} />
        <span className={`w-[38px] shrink-0 text-[14.5px] sm:w-[84px] ${v ? "text-white" : "text-white/45"}`}><span className="sm:hidden" aria-hidden>{l.slice(0, 3)}.</span><span className="max-sm:sr-only">{l}</span></span>
        {v ? <div className="ml-auto flex items-center gap-1.5"><input type="time" className={timeCls} value={v[0]} onChange={e => set({ ...h, [d]: [e.target.value, v[1]] })} aria-label={`${l}, début`} /><span className="text-white/30">–</span><input type="time" className={timeCls} value={v[1]} onChange={e => set({ ...h, [d]: [v[0], e.target.value] })} aria-label={`${l}, fin`} /></div>
          : <span className="ml-auto text-[14px] text-white/35">Fermé</span>}
      </div> })}
    </div>
    {error && <p className="mt-2 px-0.5 text-[12.5px] text-[#FF6B61]">{error}</p>}
  </div>
}
const hoursErr = (h: H) => { const v = DAYS.map(([d]) => h[d]).filter(Boolean) as [string, string][]; return !v.length ? "Ouvrez au moins un jour." : v.some(x => !x[0] || !x[1] || x[0] >= x[1]) ? "Une plage horaire se termine avant de commencer." : "" }
const numF = (x: string) => { const t = x.trim().replace(",", "."); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : NaN }
const asHours = (raw: unknown): H => raw && typeof raw === "object" && !Array.isArray(raw) ? { ...DEF_H, ...(raw as H) } : { ...DEF_H }
const companyKey = (p: Profile) => str(p.entreprise_nom) ? "entreprise_nom" : "nom_entreprise"
const companyOf = (p: Profile) => str(p.entreprise_nom) || str(p.nom_entreprise)
const ZONES: [number, string][] = [[10, "10 km"], [20, "20 km"], [30, "30 km"], [50, "50 km"], [80, "80 km"]]
const nearZone = (z: number | null | undefined) => z == null ? 30 : ZONES.reduce((a, [v]) => Math.abs(v - z) < Math.abs(a - z) ? v : a, 30)

/* ---------------- Assistant ---------------- */
type StepDef = { title: string; desc: string; body: ReactNode; check: () => Record<string, string> }
function Wizard({ k, onClose, onDone }: { k: K; onClose: () => void; onDone: () => void }) {
  const { desk, s, set } = useC(), { p, save } = useProfile(), rr = useRights()
  const reduce = useReducedMotion(), tid = useId(), ref = useRef<HTMLDivElement>(null), head = useRef<HTMLHeadingElement>(null)
  const [i, setI] = useState(0), [dir, setDir] = useState(1), [errs, setErrs] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false), [alert, setAlert] = useState("")
  const f = useForm(k, p, s)
  const closeRef = useRef(onClose); closeRef.current = busy ? () => {} : onClose
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = ref.current; if (!el) return
      if (e.key === "Escape") { e.preventDefault(); closeRef.current(); return }
      if (e.key !== "Tab") return
      const xs = [...el.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex='-1'])")].filter(x => x.offsetParent !== null)
      if (!xs.length) return
      const a = xs[0], b = xs[xs.length - 1]
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus() } else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus() }
    }
    addEventListener("keydown", onKey); return () => removeEventListener("keydown", onKey) }, [])
  useEffect(() => { head.current?.focus({ preventScroll: true }) }, [i, !!f.v])
  useEffect(() => { if (f.look === "ok") setErrs(e => ({ ...e, nom: "", adresse: "", cpv: "" })) }, [f.look])
  if (!p || !f.v) return null
  const v = f.v, up = f.up, E = (key: string) => errs[key]
  const field = (key: keyof typeof v) => ({ value: String(v[key] ?? ""), onChange: (e: { target: { value: string } }) => { up({ [key]: e.target.value } as Partial<typeof v>); if (errs[key as string]) setErrs({ ...errs, [key as string]: "" }) } })
  const sms = rr.has("sms")

  const steps: StepDef[] = k === "dev" ? [
    { title: "Vos mentions légales", desc: "Elles figurent obligatoirement sur chaque devis.", check: () => ({
        siret: digitsFr(v.siret).length !== 14 ? "Le SIRET compte 14 chiffres." : "", nom: !v.nom.trim() ? "Indiquez la raison sociale." : "",
        adresse: !v.adresse.trim() ? "Indiquez l'adresse du siège." : "", cpv: !/^\d{5}\s*\S/.test(v.cpv.trim()) ? "Code postal (5 chiffres) puis ville." : "" }),
      body: <div className="space-y-4">
        <Field label="SIRET" inputMode="numeric" autoComplete="off" placeholder="14 chiffres" {...field("siret")} onChange={e => { const x = e.target.value; up({ siret: x }); setErrs({ ...errs, siret: "" }); if (digitsFr(x).length === 14 && digitsFr(x) !== digitsFr(v.siret)) void f.lookup(x) }} error={E("siret")}
          hint={f.look === "busy" ? "Recherche dans l'annuaire des entreprises…" : f.look === "ok" ? "Trouvé dans l'annuaire : vérifiez les champs ci-dessous." : f.look === "ko" ? "Introuvable dans l'annuaire : complétez à la main." : "Recherche automatique dans l'annuaire des entreprises."}
          trailing={f.look === "busy" ? <span className="flex h-9 w-9 items-center justify-center text-white/60"><Spinner /></span> : f.look === "ok" ? <span className="flex h-9 w-9 items-center justify-center text-[#30D158]"><Check size={18} strokeWidth={2.4} /></span> : undefined} />
        <Field label="Raison sociale" autoComplete="organization" {...field("nom")} error={E("nom")} />
        <Field label="Adresse du siège" autoComplete="street-address" placeholder="12 rue des Lilas" {...field("adresse")} error={E("adresse")} />
        <Field label="Code postal et ville" autoComplete="address-level2" placeholder="69003 Lyon" {...field("cpv")} error={E("cpv")} />
        <SwitchRow on={v.tvaNA} set={x => up({ tvaNA: x })} t="TVA non applicable" d="Micro-entreprise en franchise : « TVA non applicable, art. 293 B du CGI »." />
        {!v.tvaNA && <Field label="N° de TVA intracommunautaire" placeholder="FR12 345678901" {...field("tvaNum")} hint="Facultatif si vous ne l'avez pas encore." />}
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Assurance décennale" placeholder="AXA, MAAF, SMABTP…" {...field("assureur")} /><Field label="N° de police" {...field("police")} /></div>
        <p className="-mt-1 px-0.5 text-[12.5px] text-white/40">L'assurance est obligatoire sur les devis du bâtiment ; vous pourrez l'ajouter plus tard.</p>
      </div> },
    { title: "TVA et conditions", desc: "Appliquées par défaut à chaque nouveau devis, modifiables ligne par ligne.", check: () => ({ conditions: !v.conditions.trim() ? "Indiquez vos conditions de paiement." : "" }),
      body: <div className="space-y-5">
        {v.tvaNA ? <div className="rounded-[14px] border border-white/[.09] bg-[#0E0E10] px-4 py-3.5 text-[13.5px] leading-[1.5] text-white/60">Vos devis porteront la mention « TVA non applicable, art. 293 B du CGI ».</div>
          : <Seg label="TVA par défaut" value={v.tva} onChange={x => up({ tva: x })} opts={[[5.5, "5,5 %"], [10, "10 %"], [20, "20 %"]]} hint={"10\u00a0% pour la rénovation d'un logement de plus de 2\u00a0ans, 5,5\u00a0% pour la rénovation énergétique, 20\u00a0% pour le neuf."} />}
        <Seg label="Validité du devis" value={v.validite} onChange={x => up({ validite: x })} opts={[[15, "15 j"], [30, "30 j"], [60, "60 j"], [90, "90 j"]]} />
        <Area label="Conditions de paiement" value={v.conditions} onChange={x => { up({ conditions: x }); setErrs({ ...errs, conditions: "" }) }} max={300} error={E("conditions")} />
        <div className="-mt-2 flex flex-wrap gap-2">{["Acompte de 30 % à la signature, solde à la fin des travaux.", "Acompte de 40 % à la commande, solde à réception des travaux.", "Paiement à réception de la facture."].map(x =>
          <button key={x} type="button" onClick={() => { up({ conditions: x }); setErrs({ ...errs, conditions: "" }) }} aria-pressed={v.conditions === x} className={`h-8 rounded-full border px-3 text-[12.5px] transition-colors ${v.conditions === x ? "border-white bg-white text-black" : "border-white/[.12] text-white/60 hover:text-white"}`}>{x.split(",")[0].replace(/\.$/, "")}</button>)}</div>
      </div> },
    { title: "Vos tarifs", desc: "Le point de départ des devis préparés par Akno. Vous gardez la main sur chaque prix.", check: () => { const t = numF(v.taux), d = numF(v.depl); return { taux: t == null || isNaN(t) || t <= 0 || t > 500 ? "Indiquez votre taux horaire (en € HT)." : "", depl: d != null && (isNaN(d) || d < 0 || d > 500) ? "Montant invalide." : "" } },
      body: <div className="space-y-4">
        <Field label="Taux horaire de main-d'œuvre (€ HT)" inputMode="decimal" placeholder="Ex. 55" {...field("taux")} error={E("taux")} trailing={<span className="pr-3 text-[14px] text-white/35">€/h</span>} />
        <Field label="Frais de déplacement (€ HT)" inputMode="decimal" placeholder="Ex. 49 · laissez vide si aucun" {...field("depl")} error={E("depl")} trailing={<span className="pr-3 text-[14px] text-white/35">€</span>} />
        <SwitchRow on={v.gratuit} set={x => up({ gratuit: x })} t="Devis gratuit" d="Indiqué à vos clients au téléphone et sur le devis." />
      </div> },
  ] : k === "rec" ? [
    { title: "L'accueil", desc: "Ce que vos clients entendent en décrochant.", check: () => ({ nom: !v.nom.trim() ? "Indiquez le nom annoncé." : "" }),
      body: <div className="space-y-4">
        <Field label="Nom annoncé au téléphone" autoComplete="organization" {...field("nom")} onChange={e => { const x = e.target.value; up({ nom: x, ...(f.touched ? {} : { msg: greet(x) }) }); setErrs({ ...errs, nom: "" }) }} error={E("nom")} />
        <Area label="Message d'accueil" value={v.msg} onChange={x => { f.touch(); up({ msg: x }) }} max={300} rows={4} hint="L'annonce d'enregistrement de l'appel est ajoutée automatiquement (RGPD)." />
      </div> },
    { title: "Vos horaires", desc: "En dehors, elle prend un message et vous le transmet.", check: () => ({ h: hoursErr(v.h) }), body: <Hours h={v.h} set={h => { up({ h }); setErrs({}) }} error={E("h")} /> },
    { title: "Urgences et zone", desc: "Pour les urgences, et pour savoir quels chantiers accepter.", check: () => ({ urg: v.urg.trim() && digitsFr(v.urg).length < 10 ? "Numéro français à 10 chiffres, ou laissez vide." : "" }),
      body: <div className="space-y-5">
        <Field label="Numéro pour les urgences" type="tel" inputMode="tel" autoComplete="tel" placeholder="06 12 34 56 78" {...field("urg")} onChange={e => { up({ urg: fmtTel(e.target.value) }); setErrs({}) }} error={E("urg")} hint="Dicté au client seulement en cas d'urgence. Vide : elle prend un rappel urgent." />
        <Seg label="Zone d'intervention" value={v.zone} onChange={x => up({ zone: x })} opts={ZONES} hint="Rayon autour de votre adresse." />
      </div> },
  ] : k === "ag" ? [
    { title: "Vos horaires de travail", desc: "Les rendez-vous ne sont proposés que sur ces plages.", check: () => ({ h: hoursErr(v.h) }), body: <Hours h={v.h} set={h => { up({ h }); setErrs({}) }} error={E("h")} /> },
    { title: "Vos interventions", desc: "Pour bloquer le bon créneau à chaque nouveau rendez-vous.", check: () => ({}),
      body: <div className="space-y-5">
        <Seg label="Durée d'un rendez-vous par défaut" value={v.duree} onChange={x => up({ duree: x })} opts={[[0.5, "30 min"], [1, "1 h"], [1.5, "1 h 30"], [2, "2 h"]]} />
        <Seg label="Zone d'intervention" value={v.zone} onChange={x => up({ zone: x })} opts={ZONES} hint="Rayon autour de votre adresse." />
        <p className="px-0.5 text-[12.5px] leading-[1.5] text-white/40">Vous utilisez Cal.com ? Vous pourrez le connecter ensuite dans Paramètres › Agenda en ligne.</p>
      </div> },
  ] : [
    { title: "Le rythme des relances", desc: "Après l'envoi d'un devis resté sans réponse. Elles s'arrêtent dès que le client répond.", check: () => ({}),
      body: <div role="radiogroup" aria-label="Rythme des relances" className="space-y-2">{RYTHMES.map(([d, l, sub]) => { const on = JSON.stringify(d) === JSON.stringify(v.delays); return <button key={l} type="button" role="radio" aria-checked={on} onClick={() => up({ delays: d })}
        className={`flex w-full items-center gap-4 rounded-[16px] border px-4 py-3.5 text-left transition-colors ${on ? "border-white/60 bg-white/[.06]" : "border-white/[.09] bg-[#0E0E10] hover:border-white/20"}`}>
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${on ? "border-white bg-white" : "border-white/25"}`}>{on && <span className="h-2 w-2 rounded-full bg-black" />}</span>
        <span className="min-w-0 flex-1"><span className="block text-[14.5px] font-medium">{l}</span><span className="mt-0.5 block text-[12.5px] text-white/45">{sub}</span></span>
        <Timeline d={d} c={A.rel.c} on={on} />
      </button> })}</div> },
    { title: "L'expéditeur", desc: "Les relances partent par e-mail, au nom de votre entreprise.", check: () => ({ nom: !v.nom.trim() ? "Indiquez le nom de l'entreprise." : "", email: !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim()) ? "Adresse e-mail invalide." : "", sender: sms && v.sms && v.sender.trim() && !/^[A-Za-z][A-Za-z0-9 ]{2,10}$/.test(v.sender.trim()) ? "3 à 11 lettres ou chiffres, en commençant par une lettre." : "" }),
      body: <div className="space-y-4">
        <Field label="Nom de l'entreprise" autoComplete="organization" {...field("nom")} error={E("nom")} />
        <Field label="E-mail où recevoir les réponses" type="email" inputMode="email" autoComplete="email" {...field("email")} error={E("email")} />
        {sms && <SwitchRow on={v.sms} set={x => up({ sms: x })} t="Compléter par SMS" d="Un SMS court en plus de l'e-mail quand le client a laissé son numéro." />}
        {sms && v.sms && <Field label="Nom d'expéditeur des SMS" maxLength={11} placeholder="DupontElec" {...field("sender")} error={E("sender")} hint="11 caractères maximum. Vos clients peuvent répondre STOP." />}
        <MailPreview company={v.nom.trim() || "Votre entreprise"} first={v.delays[0]} />
      </div> },
  ]

  const last = i === steps.length - 1, cur = steps[i], c = A[k].c
  const next = async () => {
    const e = Object.fromEntries(Object.entries(cur.check()).filter(([, x]) => x))
    if (Object.keys(e).length) { setErrs(e); const first = ref.current?.querySelector<HTMLElement>("[aria-invalid=true]"); first?.focus(); return }
    setErrs({}); setAlert("")
    if (!last) { setDir(1); setI(i + 1); return }
    setBusy(true)
    const err = await f.commit(save, set, sms)
    if (err) { setBusy(false); setAlert(err); return }
    const e2 = await markSetupDone(k)
    setBusy(false)
    if (e2) { setAlert(e2); return }
    onDone()
  }
  const back = () => { setErrs({}); setAlert(""); setDir(-1); setI(i - 1) }

  return <motion.div className={`fixed inset-0 z-50 flex bg-black/60 backdrop-blur-[3px] ${desk ? "items-center justify-center p-6" : "items-end kb-sheet"}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { if (!busy) onClose() }}>
    <motion.div ref={ref} role="dialog" aria-modal="true" aria-labelledby={tid} onClick={e => e.stopPropagation()}
      initial={reduce ? { opacity: 0 } : desk ? { opacity: 0, scale: .97 } : { y: 48, opacity: 0 }} animate={desk ? { opacity: 1, scale: 1 } : { y: 0, opacity: 1 }} exit={desk ? { opacity: 0, scale: .98 } : { y: 48, opacity: 0 }} transition={{ type: "spring", stiffness: 340, damping: 34, mass: .9 }}
      className={`relative flex w-full flex-col overflow-hidden border-white/[.08] bg-[#121214] shadow-[0_-30px_60px_-20px_rgba(0,0,0,.9)] ${desk ? "h-[min(680px,88dvh)] max-w-[520px] rounded-[28px] border" : "kb-panel h-[92dvh] rounded-t-[28px] border-t"}`}>
      <div className={desk ? "px-7 pt-6" : "px-5 pt-2.5"}>
        {!desk && <div aria-hidden className="mx-auto mb-3 h-[5px] w-9 rounded-full bg-white/20" />}
        <div className="flex items-center gap-3">
          <Blob c={c} s={26} />
          <div className="min-w-0 flex-1 text-[13px] text-white/50"><span className="text-white/80">{A[k].n}</span> · étape {i + 1} sur {steps.length}</div>
          <button type="button" aria-label="Fermer" disabled={busy} onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[.07] text-white/70 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-white/60"><X size={19} strokeWidth={1.75} /></button>
        </div>
        <div className="mt-4 flex gap-1.5" aria-hidden>{steps.map((_, j) => <span key={j} className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/[.09]">
          <motion.span className="absolute inset-0 origin-left rounded-full" style={{ background: ink(c) }} initial={false} animate={{ scaleX: j <= i ? 1 : 0 }} transition={{ duration: .5, ease: EASE }} /></span>)}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div key={i} custom={dir} initial={reduce ? { opacity: 0 } : { opacity: 0, x: 18 * dir }} animate={{ opacity: 1, x: 0 }} exit={reduce ? { opacity: 0 } : { opacity: 0, x: -18 * dir }} transition={{ duration: .26, ease: EASE }} className={desk ? "px-7 pb-8 pt-6" : "px-5 pb-8 pt-5"}>
            <h2 id={tid} ref={head} tabIndex={-1} className="text-[22px] font-semibold leading-tight tracking-[-0.03em] outline-none">{cur.title}</h2>
            <p className="mt-1.5 text-[14px] leading-[1.5] text-white/50 text-pretty">{cur.desc}</p>
            <div className="mt-6">{cur.body}</div>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className={`border-t border-white/[.06] bg-[#121214] ${desk ? "px-7 py-5" : "px-5 pt-4"}`} style={desk ? undefined : { paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
        <AnimatePresence initial={false}>{alert && <motion.p key={alert} role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden pb-3 text-[13px] text-[#FF6B61]">{alert}</motion.p>}</AnimatePresence>
        <div className="flex gap-3">
          {i > 0 && <button type="button" onClick={back} disabled={busy} aria-label="Étape précédente" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/[.08] text-white transition-colors hover:bg-white/[.12] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-white/60"><ChevronLeft size={20} strokeWidth={1.9} /></button>}
          <motion.button type="button" whileTap={{ scale: .985 }} onClick={() => void next()} disabled={busy} aria-busy={busy || undefined}
            className="group/b flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-white text-[15.5px] font-semibold tracking-[-0.01em] text-black transition-colors hover:bg-[#F2F2F2] disabled:cursor-progress disabled:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-white">
            {busy ? <><Spinner />Enregistrement…</> : last ? <>Terminer<Check size={17} strokeWidth={2.2} /></> : <>Continuer<ArrowRight size={17} strokeWidth={2} className="transition-transform duration-200 group-hover/b:translate-x-0.5" /></>}
          </motion.button>
        </div>
      </div>
    </motion.div>
  </motion.div>
}

/* ---------------- Relances : rythmes et aperçu ---------------- */
const RYTHMES: [number[], string, string][] = [
  [[3, 7], "Équilibré", "Relance à J+3 puis à J+7"],
  [[2, 5, 10], "Soutenu", "J+2, J+5 puis J+10"],
  [[7, 14], "Discret", "J+7 puis J+14"],
  [[3, 7, 15], "Persévérant", "J+3, J+7 puis J+15"],
]
function Timeline({ d, c, on }: { d: number[]; c: string; on: boolean }) {
  const W = 92, max = 15
  return <svg width={W} height={18} viewBox={`0 0 ${W} 18`} aria-hidden className="shrink-0">
    <line x1={4} y1={9} x2={W - 4} y2={9} stroke="rgba(255,255,255,.14)" strokeWidth={1.5} strokeLinecap="round" />
    <circle cx={4} cy={9} r={3} fill="rgba(255,255,255,.4)" />
    {d.map(x => <circle key={x} cx={4 + (x / max) * (W - 8)} cy={9} r={4} fill={on ? c : "rgba(255,255,255,.35)"} stroke={on ? "#fff" : "none"} strokeWidth={on ? 1 : 0} />)}
  </svg>
}
function MailPreview({ company, first }: { company: string; first: number }) {
  return <div className="mt-2 overflow-hidden rounded-[16px] border border-white/[.09] bg-[#0E0E10]">
    <div className="border-b border-white/[.06] px-4 py-3 text-[12.5px] leading-[1.6] text-white/45">
      <div><span className="text-white/30">De</span> <span className="text-white/80">{company}</span></div>
      <div className="truncate"><span className="text-white/30">Objet</span> <span className="text-white/80">Rappel — devis n° 1042 — {company}</span></div>
    </div>
    <p className="px-4 py-3 text-[13px] leading-[1.55] text-white/55">Envoyé à J+{first} si votre client n'a ni accepté ni refusé le devis, avec le lien pour le consulter et le signer en ligne.</p>
  </div>
}

/* ---------------- État du formulaire, pré-rempli ---------------- */
const greet = (nom: string) => `${nom.trim() || "Votre entreprise"}, bonjour ! Je suis l'assistante de l'entreprise. Comment puis-je vous aider ?`
const relDelays = (raw: unknown) => { const a = Array.isArray(raw) ? [...new Set(raw.map(Number).filter(n => n >= 1 && n <= 60))].sort((x, y) => x - y).slice(0, 3) : []; return a.length ? a : [3, 7] }
type V = { siret: string; nom: string; adresse: string; cpv: string; tvaNum: string; tvaNA: boolean; assureur: string; police: string; tva: number; validite: number; conditions: string; taux: string; depl: string; gratuit: boolean; msg: string; h: H; urg: string; zone: number; duree: number; delays: number[]; email: string; sms: boolean; sender: string }
function initV(p: Profile, s: St): V {
  const t = mergeTarifs(p.tarifs), nom = companyOf(p) || s.settings.company || ""
  const RY = RYTHMES.map(r => JSON.stringify(r[0])), dl = relDelays(p.relance_delais)
  const msg = str(p.message_accueil)
  return {
    siret: str(p.entreprise_siret), nom, adresse: str(p.entreprise_adresse), cpv: str(p.entreprise_cp_ville), tvaNum: str(p.entreprise_tva), tvaNA: !!p.tva_non_applicable,
    assureur: str(p.assurance_nom), police: str(p.assurance_numero), tva: [5.5, 10, 20].includes(s.settings.tva) ? s.settings.tva : 10,
    validite: [15, 30, 60, 90].includes(Number(p.devis_validite_jours)) ? Number(p.devis_validite_jours) : 30,
    conditions: str(p.devis_conditions) || "Acompte de 30 % à la signature, solde à la fin des travaux.",
    taux: t.tauxHoraire == null ? "" : String(t.tauxHoraire).replace(".", ","), depl: t.deplacement == null ? "" : String(t.deplacement).replace(".", ","), gratuit: t.devisGratuit ?? true,
    msg: msg || greet(nom), h: asHours(p.horaires), urg: fmtTel(digitsFr(str(p.telephone_urgence) || str(p.entreprise_telephone) || str(p.telephone))), zone: nearZone(t.zoneKm),
    duree: [0.5, 1, 1.5, 2].includes(s.settings.duree) ? s.settings.duree : 1,
    delays: RY.includes(JSON.stringify(dl)) ? dl : [3, 7],
    email: str(p.entreprise_email) || str(p.email) || s.settings.email || "",
    sms: !!p.sms_enabled, sender: str(p.sms_sender) || nom.normalize("NFD").replace(/[^A-Za-z0-9]/g, "").slice(0, 11),
  }
}
function useForm(k: K, p: Profile | null, s: St) {
  const [v, setV] = useState<V | null>(() => p ? initV(p, s) : null), [touched, setTouched] = useState(() => !!str(p?.message_accueil)), [look, setLook] = useState<"" | "busy" | "ok" | "ko">("")
  useEffect(() => { if (p && !v) { setV(initV(p, s)); setTouched(!!str(p.message_accueil)) } }, [p, v, s])
  const up = (x: Partial<V>) => setV(o => o ? { ...o, ...x } : o)
  const lookup = async (siret: string) => {
    setLook("busy")
    const r = await api("/api/account", { action: "siret_lookup", siret: digitsFr(siret) })
    if (!r.ok) { setLook("ko"); return }
    setLook("ok")
    setV(o => o ? { ...o, nom: o.nom || String(r.nom || ""), adresse: o.adresse || String(r.adresse || ""), cpv: o.cpv || String(r.cp_ville || ""), tvaNum: o.tvaNum || String(r.tva || "") } : o)
  }
  /** Enregistre dans les champs existants de la fiche artisan (et les réglages locaux TVA / durée). */
  const commit = async (save: (patch: Record<string, unknown>) => Promise<string>, set: (f: (s: St) => St) => void, sms: boolean) => {
    if (!v || !p) return "Fiche introuvable."
    const t = mergeTarifs(p.tarifs)
    let patch: Record<string, unknown>
    if (k === "dev") patch = {
      entreprise_siret: digitsFr(v.siret), entreprise_nom: v.nom.trim(), ...(str(p.nom_entreprise) ? {} : { nom_entreprise: v.nom.trim() }),
      entreprise_adresse: v.adresse.trim(), entreprise_cp_ville: v.cpv.trim(), tva_non_applicable: v.tvaNA, entreprise_tva: v.tvaNA ? null : v.tvaNum.trim() || null,
      assurance_nom: v.assureur.trim() || null, assurance_numero: v.police.trim() || null, devis_validite_jours: v.validite, devis_conditions: v.conditions.trim(),
      tarifs: mergeTarifs({ ...t, tauxHoraire: numF(v.taux), deplacement: numF(v.depl), devisGratuit: v.gratuit }),
    }
    else if (k === "rec") patch = { [companyKey(p)]: v.nom.trim(), message_accueil: v.msg.trim().slice(0, 300) || null, horaires: v.h, telephone_urgence: digitsFr(v.urg) || null, tarifs: mergeTarifs({ ...t, zoneKm: v.zone }) }
    else if (k === "ag") patch = { horaires: v.h, tarifs: mergeTarifs({ ...t, zoneKm: v.zone }) }
    else patch = { relance_delais: v.delays, [companyKey(p)]: v.nom.trim(), entreprise_email: v.email.trim(), ...(sms ? { sms_enabled: v.sms, sms_sender: v.sender.trim() || null } : {}) }
    const e = await save(patch)
    if (e) return e
    if (k === "dev" && !v.tvaNA) set(x => ({ ...x, settings: { ...x.settings, tva: v.tva } }))
    if (k === "ag") set(x => ({ ...x, settings: { ...x.settings, duree: v.duree } }))
    return ""
  }
  return { v, up, touched, touch: () => setTouched(true), look, lookup, commit }
}
