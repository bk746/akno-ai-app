/* update49 · Parcours d'accueil unique, AVANT l'app :
   1. Compte (auth/AuthScreen, hors session)  2. Parlons de vous  3. Offre + paiement (billing/Offres)
   4. Entreprise et mentions légales  5. Code d'accès (Lock.tsx) → app.
   L'étape est toujours déduite des données serveur (fiche artisans + /api/account) : un rechargement
   ou un retour plus tard reprend au bon endroit. Tant que le compte n'est pas chargé, rien n'entre
   dans l'app : écran de chargement, ou erreur avec « Réessayer » si un appel échoue. */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { AnimatePresence, MotionConfig, motion, useAnimate, useReducedMotion } from "motion/react"
import type { Session } from "@supabase/supabase-js"
import { Check, LogOut, RotateCcw } from "lucide-react"
import { api, useAccountState } from "../../lib/accountApi"
import { useProfileState, type Profile } from "../../lib/profile"
import { CGV_VERSION } from "../../lib/legal"
import { digitsFr, fmtTel } from "../../lib/phone"
import { hasLock } from "../../lib/lock"
import { supabase } from "../../lib/supabase"
import { Blob } from "../ui"
import { EASE, Field, Ghost, Spinner, Submit } from "../auth/fields"
import FlowShell, { AlertBox, FlowSteps, Outline } from "../auth/FlowShell"
import Offres from "../billing/Offres"
import { LockSetup } from "../Lock"

type Step = "vous" | "offre" | "entreprise" | "code" | "app"
const METIERS = ["Électricien", "Plombier", "Chauffagiste", "Serrurier", "Peintre", "Menuisier", "Maçon", "Couvreur", "Carreleur", "Plaquiste", "Climaticien", "Multiservice", "Autre"]
const s = (x: unknown) => typeof x === "string" ? x.trim() : ""
const asked = (uid: string) => { try { return !!localStorage.getItem(`akno-lock-asked:${uid}`) } catch { return true } }
const signOut = () => { void supabase.auth.signOut() }

/** Infos « vous » manquantes : l'étape 2 s'affiche tant qu'elles ne sont pas là (inscription e-mail, Google ou Apple). */
export const needsProfile = (p: Profile | null) => !p || !s(p.prenom) || !(s(p.entreprise_nom) || s(p.nom_entreprise)) || !s(p.cgv_version)

export default function Flow({ ses, children }: { ses: Session; children: ReactNode }) {
  const uid = ses.user.id
  const acc = useAccountState(), prof = useProfileState()
  // Retour de Stripe (3-D Secure / page hébergée) : ?billing=ok&session_id=cs_… → on reprend l'écran d'activation
  const [ret] = useState(() => {
    const q = new URLSearchParams(location.search), sid = q.get("session_id") || ""
    if (q.get("billing") !== "ok" || !/^cs_(test|live)_/.test(sid)) return ""
    q.delete("billing"); q.delete("session_id"); history.replaceState(null, "", location.pathname + (q.toString() ? `?${q}` : ""))
    return sid
  })
  const [offerOpen, setOfferOpen] = useState(!!ret)
  const [lockDone, setLockDone] = useState(() => hasLock(uid) || asked(uid))
  const entered = useRef(false)

  const e = acc.a?.entitlements, p = prof.p
  const needsPlan = !!e && e.billingEnabled && !e.access && e.status !== "past_due"
  // Une fois ouvert, l'écran d'offre reste jusqu'au clic sur « Continuer » (même si l'accès s'ouvre entre-temps)
  useEffect(() => { if (needsPlan) setOfferOpen(true) }, [needsPlan])

  if (entered.current) return <>{children}</>
  if (acc.state === "error" || prof.state === "error") return <Problem msg={acc.state === "error" ? acc.error : "Votre fiche n'a pas pu être chargée."} retry={() => { void acc.retry(); void prof.reload() }} />
  if (acc.state !== "ok" || prof.state === "loading") return <Loading />

  const step: Step = needsProfile(p) ? "vous" : offerOpen || needsPlan ? "offre" : p?.onboarding_done === false ? "entreprise" : !lockDone ? "code" : "app"
  if (step === "app") { entered.current = true; return <>{children}</> }

  return <MotionConfig reducedMotion="user">
    <AnimatePresence mode="wait">
      {/* opacité seulement : un transform ici casserait les écrans en position fixe (offre, code) */}
      <motion.div key={step} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .25, ease: EASE }}>
        {step === "vous" && <Vous p={p} ses={ses} />}
        {step === "offre" && <Offres mode="gate" flow returnSession={ret || undefined} onDone={() => setOfferOpen(false)} />}
        {step === "entreprise" && p && <Entreprise p={p} />}
        {step === "code" && <LockSetup flow uid={uid} email={ses.user.email || ""} onDone={() => { try { localStorage.setItem(`akno-lock-asked:${uid}`, "1") } catch { /* ignore */ } setLockDone(true) }} />}
      </motion.div>
    </AnimatePresence>
  </MotionConfig>
}

/* ---------------- Chargement / erreur ---------------- */
function Center({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-black px-6 text-center text-white">{children}</div>
}
function Loading() {
  const reduce = useReducedMotion()
  // Petit délai avant d'afficher le texte : pas de clignotement si tout répond vite
  const [show, setShow] = useState(false)
  useEffect(() => { const t = setTimeout(() => setShow(true), 450); return () => clearTimeout(t) }, [])
  return <Center>
    <motion.div animate={reduce ? undefined : { scale: [1, 1.06, 1] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}><Blob c="#E6E6E6" s={44} /></motion.div>
    <motion.p initial={{ opacity: 0 }} animate={{ opacity: show ? 1 : 0 }} className="mt-5 flex items-center gap-2 text-[14px] text-white/50" role="status"><Spinner />Préparation de votre espace…</motion.p>
  </Center>
}
function Problem({ msg, retry }: { msg: string; retry: () => void }) {
  return <Center>
    <Blob c="#E6E6E6" s={44} />
    <h1 className="mt-6 text-[24px] font-semibold tracking-[-0.03em]">Impossible de charger votre compte</h1>
    <p className="mt-2 max-w-[360px] text-[14.5px] leading-[1.55] text-white/55 text-pretty">{msg || "Le serveur ne répond pas."} Vérifiez votre connexion, puis réessayez.</p>
    <div className="mt-7 flex w-full max-w-[320px] flex-col gap-2.5">
      <button type="button" onClick={retry} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-[15.5px] font-semibold text-black transition-colors hover:bg-[#F2F2F2]"><RotateCcw size={16} />Réessayer</button>
      <Ghost onClick={signOut} className="mx-auto mt-2">Se déconnecter</Ghost>
    </div>
  </Center>
}

const OutBtn = () => <button type="button" onClick={signOut} className="flex h-9 items-center gap-2 rounded-full border border-white/[.12] px-3.5 text-[13.5px] font-medium text-white/75 transition-colors hover:border-white/25 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"><LogOut size={15} strokeWidth={1.9} /><span className="hidden sm:inline">Se déconnecter</span></button>
const rise = (i: number) => ({ initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: .4, ease: EASE, delay: .04 * i } })

/* ---------------- 2. Parlons de vous ---------------- */
function Vous({ p, ses }: { p: Profile | null; ses: Session }) {
  const reduce = useReducedMotion()
  const meta = (ses.user.user_metadata || {}) as Record<string, unknown>
  const guessPrenom = s(p?.prenom) || s(meta.prenom) || s(meta.given_name) || s(meta.full_name || meta.name).split(/\s+/)[0] || ""
  const m0 = s(p?.entreprise_metier) || s(meta.metier)
  const [prenom, setPrenom] = useState(guessPrenom), [entreprise, setEntreprise] = useState(s(p?.entreprise_nom) || s(p?.nom_entreprise) || s(meta.entreprise))
  const [metier, setMetier] = useState(m0 && !METIERS.includes(m0) ? "Autre" : m0), [autre, setAutre] = useState(m0 && !METIERS.includes(m0) ? m0 : "")
  const [tel, setTel] = useState(fmtTel(s(p?.telephone) || s(meta.telephone))), [cgv, setCgv] = useState(!!s(p?.cgv_version))
  const needCgv = !s(p?.cgv_version)
  const [busy, setBusy] = useState(false), [errs, setErrs] = useState<Record<string, string>>({}), [alert, setAlert] = useState("")
  const [scope, animate] = useAnimate<HTMLFormElement>()
  const clear = (k: string) => { if (errs[k]) setErrs(({ [k]: _, ...r }) => r); setAlert("") }
  const submit = async (ev: FormEvent) => {
    ev.preventDefault(); if (busy) return
    const x: Record<string, string> = {}
    if (!prenom.trim()) x.prenom = "Indiquez votre prénom."
    if (!entreprise.trim()) x.entreprise = "Indiquez le nom de votre entreprise."
    if (tel.trim() && digitsFr(tel).length !== 10) x.tel = "Numéro à 10 chiffres, par exemple 06 12 34 56 78."
    if (needCgv && !cgv) x.cgv = "Acceptez les conditions pour continuer."
    if (Object.keys(x).length) { setErrs(x); if (!reduce && scope.current) void animate(scope.current, { x: [0, -9, 8, -6, 4, -2, 0] }, { duration: .45 }); setTimeout(() => scope.current?.querySelector<HTMLElement>(`[data-f="${Object.keys(x)[0]}"]`)?.focus(), 30); return }
    setBusy(true); setAlert("")
    const met = metier === "Autre" ? autre.trim() : metier
    const row = { id: ses.user.id, email: ses.user.email || p?.email || null, prenom: prenom.trim(), nom_entreprise: entreprise.trim(), entreprise_nom: entreprise.trim(), entreprise_metier: met || null, telephone: tel.trim() || null }
    const { error } = await supabase.from("artisans").upsert(row, { onConflict: "id" })
    if (error) { console.error("[Akno · profil]", error); setBusy(false); setAlert("Enregistrement impossible. Vérifiez votre connexion, puis réessayez."); return }
    if (needCgv) {
      const r = await api("/api/account", { action: "accept_cgv", version: CGV_VERSION })
      if (!r.ok) { setBusy(false); setAlert(r.error || "Acceptation des conditions impossible. Réessayez."); return }
    }
    dispatchEvent(new Event("akno-refresh")) // recharge la fiche → étape suivante
  }
  return <FlowShell right={<OutBtn />}>
    <motion.div {...rise(0)}><FlowSteps i={1} className="mb-7" /></motion.div>
    <motion.h1 {...rise(1)} className="text-[30px] font-semibold leading-[1.1] tracking-[-0.035em] text-balance">Parlons de vous</motion.h1>
    <motion.p {...rise(2)} className="mt-2.5 text-[15px] leading-[1.5] text-white/50 text-pretty">Akno s'en sert pour vous présenter au téléphone et sur vos devis.</motion.p>
    <motion.form {...rise(3)} ref={scope} onSubmit={submit} noValidate className="mt-8 space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field data-f="prenom" label="Prénom" name="given-name" autoComplete="given-name" placeholder="Julien" value={prenom} onChange={e => { setPrenom(e.target.value); clear("prenom") }} error={errs.prenom} required />
        <Field data-f="entreprise" label="Entreprise" name="organization" autoComplete="organization" placeholder="Martin Plomberie" value={entreprise} onChange={e => { setEntreprise(e.target.value); clear("entreprise") }} error={errs.entreprise} required />
      </div>
      <fieldset>
        <legend className="mb-2.5 px-0.5 text-[13px] font-medium text-white/70">Métier <span className="font-normal text-white/35">· facultatif</span></legend>
        <div className="flex flex-wrap gap-1.5">{METIERS.map(m => <label key={m} className="cursor-pointer">
          <input type="radio" name="metier" value={m} checked={metier === m} onChange={() => setMetier(m)} onClick={() => metier === m && setMetier("")} className="peer sr-only" />
          <span className="flex h-8 items-center rounded-full border border-white/[.1] px-3 text-[13px] text-white/65 transition-[background-color,color,border-color,transform] duration-150 hover:border-white/25 hover:text-white active:scale-[.96] peer-checked:border-white peer-checked:bg-white peer-checked:font-medium peer-checked:!text-black peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-white/60">{m}</span>
        </label>)}</div>
        <AnimatePresence initial={false}>{metier === "Autre" && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: .25, ease: EASE }} className="overflow-hidden">
          <div className="pt-3"><Field label="Votre métier" name="metier-autre" placeholder="Façadier, vitrier, paysagiste…" value={autre} onChange={e => setAutre(e.target.value)} /></div>
        </motion.div>}</AnimatePresence>
      </fieldset>
      <Field data-f="tel" label="Téléphone portable" name="tel" type="tel" autoComplete="tel" inputMode="tel" placeholder="06 12 34 56 78" hint="Pour vous transférer les appels urgents." value={tel} onChange={e => { setTel(fmtTel(e.target.value)); clear("tel") }} error={errs.tel} />
      {needCgv && <div>
        <label className="group/c flex cursor-pointer items-start gap-3 text-[13px] leading-[1.55] text-white/55">
          <input data-f="cgv" type="checkbox" checked={cgv} onChange={e => { setCgv(e.target.checked); clear("cgv") }} aria-invalid={errs.cgv ? true : undefined} className="peer sr-only" />
          <span aria-hidden className={`mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-white/60 ${cgv ? "border-white bg-white text-black" : errs.cgv ? "border-[#FF453A]/80" : "border-white/25 group-hover/c:border-white/45"}`}>
            <motion.span initial={false} animate={{ scale: cgv ? 1 : 0, opacity: cgv ? 1 : 0 }} transition={{ type: "spring", stiffness: 600, damping: 30 }}><Check size={13} strokeWidth={3} /></motion.span></span>
          <span>J'accepte les <a href="/cgv" target="_blank" rel="noreferrer" className="text-white/80 underline decoration-white/30 underline-offset-2 hover:decoration-white">CGV</a>, le <a href="/dpa" target="_blank" rel="noreferrer" className="text-white/80 underline decoration-white/30 underline-offset-2 hover:decoration-white">contrat de traitement des données</a> et la <a href="/confidentialite" target="_blank" rel="noreferrer" className="text-white/80 underline decoration-white/30 underline-offset-2 hover:decoration-white">politique de confidentialité</a>.</span>
        </label>
        {errs.cgv && <p className="mt-2 pl-[30px] text-[12.5px] text-[#FF6B61]">{errs.cgv}</p>}
      </div>}
      <AnimatePresence initial={false}>{alert && <AlertBox key={alert} t={alert} />}</AnimatePresence>
      <div className="pt-1"><Submit busy={busy} busyLabel="Enregistrement…">Continuer</Submit></div>
    </motion.form>
  </FlowShell>
}

/* ---------------- 4. Entreprise et mentions légales ---------------- */
function Entreprise({ p }: { p: Profile }) {
  const [f, setF] = useState({ siret: s(p.entreprise_siret), nom: s(p.entreprise_nom) || s(p.nom_entreprise), adresse: s(p.entreprise_adresse), cpv: s(p.entreprise_cp_ville), tva: s(p.entreprise_tva), ape: s(p.entreprise_ape), ei: !!p.entreprise_ei, avis: s(p.avis_url), assureur: s(p.assurance_nom), police: s(p.assurance_numero) })
  const [look, setLook] = useState<"" | "busy" | "ok" | "ko">(""), [found, setFound] = useState(""), [busy, setBusy] = useState<"" | "save" | "later">(""), [errs, setErrs] = useState<Record<string, string>>({}), [alert, setAlert] = useState("")
  const last = useRef("")
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF(x => ({ ...x, [k]: e.target.value })); if (errs[k]) setErrs(({ [k]: _, ...r }) => r); setAlert("") }
  // Recherche automatique dès que les 14 chiffres du SIRET sont saisis (annuaire des entreprises, via /api/account)
  const digits = f.siret.replace(/\D/g, "")
  useEffect(() => {
    if (digits.length !== 14 || digits === last.current) return
    last.current = digits
    let on = true
    setLook("busy")
    const t = setTimeout(async () => {
      const r = await api("/api/account", { action: "siret_lookup", siret: digits })
      if (!on) return
      if (!r.ok) { setLook("ko"); setFound(r.error || "Entreprise introuvable : complétez à la main."); return }
      setF(x => ({ ...x, siret: String(r.siret || x.siret), nom: x.nom || String(r.nom || ""), adresse: String(r.adresse || x.adresse), cpv: String(r.cp_ville || x.cpv), tva: String(r.tva || x.tva), ape: String(r.ape || x.ape), ei: r.entrepreneur_individuel === true || x.ei }))
      setFound([r.nom, r.cp_ville].filter(Boolean).map(String).join(" · ")); setLook("ok")
    }, 250)
    return () => { on = false; clearTimeout(t) }
  }, [digits])
  const save = async (patch: Record<string, unknown>, k: "save" | "later") => {
    setBusy(k); setAlert("")
    const { error } = await supabase.from("artisans").update(patch).eq("id", p.id)
    if (error) { console.error("[Akno · entreprise]", error); setBusy(""); setAlert("Enregistrement impossible. Vérifiez votre connexion, puis réessayez."); return }
    dispatchEvent(new Event("akno-refresh")) // onboarding_done = true → étape suivante
  }
  const submit = (ev: FormEvent) => {
    ev.preventDefault(); if (busy) return
    const x: Record<string, string> = {}
    if (digits && digits.length !== 14) x.siret = "Le SIRET compte 14 chiffres."
    if (f.avis.trim() && !/^https:\/\//.test(f.avis.trim())) x.avis = "Le lien doit commencer par https://"
    if (Object.keys(x).length) { setErrs(x); return }
    void save({ onboarding_done: true, entreprise_siret: digits || null, entreprise_nom: f.nom.trim() || null, entreprise_adresse: f.adresse.trim() || null, entreprise_cp_ville: f.cpv.trim() || null, entreprise_tva: f.tva.trim() || null, entreprise_ape: f.ape.trim() || null, entreprise_ei: f.ei, avis_url: f.avis.trim() || null, assurance_nom: f.assureur.trim() || null, assurance_numero: f.police.trim() || null }, "save")
  }
  const Group = ({ t, d, children }: { t: string; d?: string; children: ReactNode }) => <section className="space-y-4">
    <div><h2 className="text-[15px] font-semibold tracking-[-0.01em]">{t}</h2>{d && <p className="mt-0.5 text-[12.5px] text-white/40">{d}</p>}</div>{children}</section>
  return <FlowShell right={<OutBtn />} wide>
    <motion.div {...rise(0)}><FlowSteps i={3} className="mb-7" /></motion.div>
    <motion.h1 {...rise(1)} className="text-[30px] font-semibold leading-[1.1] tracking-[-0.035em] text-balance">Votre entreprise</motion.h1>
    <motion.p {...rise(2)} className="mt-2.5 text-[15px] leading-[1.5] text-white/50 text-pretty">Les mentions obligatoires de vos devis et factures. Saisissez votre SIRET : Akno remplit le reste.</motion.p>
    <motion.form {...rise(3)} onSubmit={submit} noValidate className="mt-8 space-y-8">
      <Group t="Identité">
        <Field data-f="siret" label="SIRET" name="siret" inputMode="numeric" autoComplete="off" placeholder="14 chiffres" value={f.siret} onChange={set("siret")} error={errs.siret}
          hint={look === "" ? "Recherche automatique dans l'annuaire des entreprises." : undefined}
          trailing={look === "busy" ? <span className="flex h-9 w-9 items-center justify-center text-white/60"><Spinner /></span> : look === "ok" ? <span className="flex h-9 w-9 items-center justify-center text-[#30D158]"><Check size={18} strokeWidth={2.4} /></span> : undefined} />
        <AnimatePresence initial={false}>{(look === "ok" || look === "ko") && found && <motion.p key={look + found} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className={`-mt-1.5 overflow-hidden px-0.5 text-[12.5px] ${look === "ok" ? "text-[#30D158]" : "text-white/50"}`}>{look === "ok" ? `Trouvé : ${found}` : found}</motion.p>}</AnimatePresence>
        <Field label="Raison sociale" name="organization" autoComplete="organization" value={f.nom} onChange={set("nom")} />
      </Group>
      <Group t="Adresse du siège">
        <Field label="Adresse" name="street-address" autoComplete="street-address" placeholder="12 rue des Lilas" value={f.adresse} onChange={set("adresse")} />
        <Field label="Code postal et ville" name="postal" autoComplete="address-level2" placeholder="69003 Lyon" value={f.cpv} onChange={set("cpv")} />
      </Group>
      <Group t="TVA">
        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <Field label="N° de TVA intracommunautaire" name="tva" placeholder="FR12 345678901" value={f.tva} onChange={set("tva")} />
          <Field label="Code APE" name="ape" placeholder="43.21A" value={f.ape} onChange={set("ape")} />
        </div>
      </Group>
      <Group t="Assurance décennale" d="Obligatoire sur les devis du bâtiment.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Assureur" name="assureur" placeholder="AXA, MAAF, SMABTP…" value={f.assureur} onChange={set("assureur")} />
          <Field label="N° de police" name="police" value={f.police} onChange={set("police")} />
        </div>
      </Group>
      <Group t="Avis Google" d="Facultatif. Akno pourra l'envoyer à vos clients après un chantier.">
        <Field data-f="avis" label="Lien de votre fiche d'avis" name="avis" type="url" inputMode="url" placeholder="https://g.page/r/…/review" value={f.avis} onChange={set("avis")} error={errs.avis} />
      </Group>
      <AnimatePresence initial={false}>{alert && <AlertBox key={alert} t={alert} />}</AnimatePresence>
      <div className="space-y-4 pt-1">
        <Submit busy={busy === "save"} busyLabel="Enregistrement…">Enregistrer et continuer</Submit>
        <div className="rounded-[16px] border border-white/[.07] bg-white/[.02] p-4 text-[13px] leading-[1.5] text-white/50">
          Pas votre SIRET sous la main ? Vous pourrez tout compléter plus tard dans Paramètres › Entreprise. Ces mentions seront nécessaires pour envoyer des devis conformes.
          <Outline className="mt-3 h-10 w-full text-[14px]" disabled={!!busy} onClick={() => void save({ onboarding_done: true }, "later")}>{busy === "later" ? <Spinner /> : null}Compléter plus tard</Outline>
        </div>
      </div>
    </motion.form>
  </FlowShell>
}
