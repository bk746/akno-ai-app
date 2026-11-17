import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { AnimatePresence, MotionConfig, motion, useAnimate, useReducedMotion } from "motion/react"
import { AlertCircle, Check, MailCheck } from "lucide-react"
import { supabase } from "../../lib/supabase"
import { CGV_VERSION } from "../../lib/legal"
import { digitsFr, fmtTel } from "../../lib/phone"
import { Blob } from "../ui"
import { EASE, Field, Ghost, PasswordField, Spinner, Steps, Strength, Submit, pwScore } from "./fields"
import { authErrorFr } from "./authErrors"
import BrandPanel from "./BrandPanel"

/* update45 · Écran d'inscription (/inscription) : 2 étapes, panneau de marque animé, écran « Vérifiez votre boîte mail ».
   Même appel Supabase qu'avant (signUp + métadonnées lues par le trigger handle_new_user).
   La connexion, le mot de passe oublié et le nouveau mot de passe restent dans Login.tsx (inchangés). */
type View = "signup1" | "signup2" | "sentSignup"
type Errs = Partial<Record<"email" | "pw" | "prenom" | "entreprise" | "tel" | "metier" | "cgv", string>>
type Alert = { t: string; action?: { l: string; on: () => void } } | null

const METIERS = ["Électricien", "Plombier", "Chauffagiste", "Serrurier", "Peintre", "Menuisier", "Maçon", "Couvreur", "Carreleur", "Plaquiste", "Climaticien", "Multiservice", "Autre"]
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const RESEND_S = 45

const head: Record<View, [string, string]> = {
  signup1: ["Créez votre espace Akno", "30 jours d'essai gratuit, sans carte bancaire."],
  signup2: ["Parlez-nous de votre entreprise", "Akno s'en sert pour vous présenter au téléphone et sur vos devis."],
  sentSignup: ["Vérifiez votre boîte mail", ""],
}

/** Inscription en 2 étapes. `onLogin` ramène à l'écran de connexion (Login.tsx). */
export default function Signup({ onLogin }: { onLogin: () => void }) {
  const reduce = useReducedMotion()
  const [view, setView] = useState<View>("signup1")
  const [email, setEmail] = useState(""), [pw, setPw] = useState("")
  const [prenom, setPrenom] = useState(""), [entreprise, setEntreprise] = useState(""), [metier, setMetier] = useState(""), [autre, setAutre] = useState(""), [telephone, setTelephone] = useState(""), [cgv, setCgv] = useState(false)
  const [busy, setBusy] = useState(false), [errs, setErrs] = useState<Errs>({}), [alert, setAlert] = useState<Alert>(null)
  const [cool, setCool] = useState(0), [resent, setResent] = useState("")
  const [scope, animate] = useAnimate<HTMLDivElement>()
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => { if (cool <= 0) return; const t = setTimeout(() => setCool(c => c - 1), 1000); return () => clearTimeout(t) }, [cool])
  // Après chaque changement d'étape : focus sur le premier champ
  useEffect(() => { const t = setTimeout(() => root.current?.querySelector<HTMLElement>("form input:not([type=hidden]):not([type=radio]):not([type=checkbox])")?.focus({ preventScroll: true }), reduce ? 0 : 260); return () => clearTimeout(t) }, [view, reduce])

  const go = (v: View) => { setErrs({}); setAlert(null); setResent(""); setView(v) }
  const fail = (e: Errs, a: Alert = null) => {
    setErrs(e); setAlert(a)
    if (!reduce && scope.current) void animate(scope.current, { x: [0, -9, 8, -6, 4, -2, 0] }, { duration: .45, ease: "easeOut" })
    const first = Object.keys(e)[0]
    if (first) setTimeout(() => root.current?.querySelector<HTMLElement>(`[data-f="${first}"]`)?.focus(), 30)
  }
  const clear = (k: keyof Errs) => { if (errs[k]) setErrs(({ [k]: _, ...r }) => r); if (alert) setAlert(null) }

  const resend = async () => {
    setBusy(true); setResent(""); setAlert(null)
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: location.origin + "/reception" } })
      if (error) setAlert({ t: authErrorFr(error, "resend") }); else { setResent("Nouvel e-mail envoyé."); setCool(RESEND_S) }
    } catch (e) { setAlert({ t: authErrorFr(e, "resend") }) } finally { setBusy(false) }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (busy) return
    setAlert(null)
    const em = email.trim()
    if (view === "signup1") {
      const x: Errs = {}; if (!EMAIL_RE.test(em)) x.email = "Saisissez une adresse e-mail valide."; if (pw.length < 8) x.pw = "8 caractères minimum."
      if (Object.keys(x).length) return fail(x)
      return go("signup2")
    }
    const x: Errs = {}
    if (!prenom.trim()) x.prenom = "Indiquez votre prénom."
    if (!entreprise.trim()) x.entreprise = "Indiquez le nom de votre entreprise."
    if (telephone.trim() && digitsFr(telephone).length !== 10) x.tel = "Numéro à 10 chiffres, par exemple 06 12 34 56 78."
    if (!cgv) x.cgv = "Acceptez les conditions pour créer votre compte."
    if (Object.keys(x).length) return fail(x)
    setBusy(true)
    try {
      const met = metier === "Autre" ? autre.trim() : metier
      const { data, error } = await supabase.auth.signUp({ email: em, password: pw, options: { emailRedirectTo: location.origin + "/reception", data: { prenom: prenom.trim(), entreprise: entreprise.trim(), metier: met, telephone: telephone.trim(), cgv_version: CGV_VERSION } } })
      // Avec la protection anti-énumération, un e-mail déjà inscrit revient sans erreur mais avec identities = []
      const exists = error ? /^(user_already_exists|email_exists|identity_already_exists)$/.test(String(error.code)) || /already/i.test(error.message) : !!data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0
      if (exists) { if (!error) console.warn("[Akno auth · signup] e-mail déjà inscrit (identities vide)"); else console.error("[Akno auth · signup]", error); fail({}, { t: "Un compte existe déjà avec cet e-mail. Connectez-vous ou réinitialisez votre mot de passe.", action: { l: "Se connecter", on: onLogin } }) }
      else if (error) {
        const t = authErrorFr(error, "signup")
        if (error.code === "weak_password") { setView("signup1"); fail({ pw: t }) }
        else if (error.code === "email_address_invalid") { setView("signup1"); fail({ email: t }) }
        else fail({}, { t })
      }
      else if (!data.session) { setCool(RESEND_S); setView("sentSignup") }
      // Avec session : AknoRoot bascule seul vers l'app (puis l'onboarding)
    } catch (err) { fail({}, { t: authErrorFr(err, "signup") }) }
    finally { setBusy(false) }
  }

  const [h1, sub] = head[view]
  const trans = { initial: { opacity: 0, y: 12, filter: "blur(4px)" }, animate: { opacity: 1, y: 0, filter: "blur(0px)" }, exit: { opacity: 0, y: -8, filter: "blur(4px)" }, transition: { duration: .32, ease: EASE } }

  return <MotionConfig reducedMotion="user">
    <div ref={root} className="min-h-[100dvh] bg-black text-white lg:grid lg:h-[100dvh] lg:grid-cols-[minmax(460px,1fr)_minmax(0,1.08fr)]">
      <main className="flex min-h-[100dvh] flex-col px-6 pb-6 pt-[max(20px,env(safe-area-inset-top))] sm:px-10 lg:min-h-0 lg:overflow-y-auto lg:px-14 lg:py-8">
        <header className="flex h-10 items-center justify-between">
          <a href="/reception" className="flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/50" aria-label="Akno">
            <Blob c="#E6E6E6" s={26} /><span className="text-[17px] font-semibold tracking-[-0.03em]">Akno</span>
          </a>
          {<div className="flex items-center gap-3 text-[13.5px]">
            <span className="hidden text-white/40 sm:inline">Déjà client ?</span>
            <button type="button" onClick={onLogin} className="h-9 rounded-full border border-white/[.12] px-4 font-medium text-white/90 transition-colors hover:border-white/25 hover:bg-white/[.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60">Se connecter</button>
          </div>}
        </header>

        <div className="flex flex-1 justify-center pt-12 sm:pt-16 lg:py-8">
          <div ref={scope} className="w-full max-w-[384px] lg:my-auto">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={view} {...trans}>
                {view === "sentSignup" ? <Sent email={email.trim()} cool={cool} busy={busy} resent={resent} alert={alert} onResend={resend} onBack={() => go("signup1")} onLogin={onLogin} /> : <>
                  {<Steps step={view === "signup1" ? 1 : 2} total={2} />}
                  <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.035em] text-balance">{h1}</h1>
                  <p className="mt-2.5 text-[15px] leading-[1.5] text-white/50 text-pretty">{sub}</p>

                  <form onSubmit={submit} method="post" action="#" noValidate className="mt-8 space-y-5">
                    {view === "signup1" && <Field data-f="email" label="E-mail professionnel" id="email" name="email" type="email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="vous@entreprise.fr" value={email} onChange={e => { setEmail(e.target.value); clear("email") }} error={errs.email} required />}
                    {view === "signup2" && <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />}

                    {view === "signup1" && <div>
                      <PasswordField data-f="pw" label="Mot de passe" id="new-password" name="new-password" autoComplete="new-password" minLength={8} value={pw} onChange={e => { setPw(e.target.value); clear("pw") }} error={errs.pw} required aria-describedby="pw-strength" />
                      <Strength pw={pw} id="pw-strength" />
                    </div>}

                    {view === "signup2" && <>
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
                      <Field data-f="tel" label="Téléphone portable" name="tel" type="tel" autoComplete="tel" inputMode="tel" placeholder="06 12 34 56 78" hint="Pour vous transférer les appels urgents." value={telephone} onChange={e => { setTelephone(fmtTel(e.target.value)); clear("tel") }} error={errs.tel} />
                      <div>
                        <label className="group/c flex cursor-pointer items-start gap-3 text-[13px] leading-[1.55] text-white/55">
                          <input data-f="cgv" type="checkbox" checked={cgv} onChange={e => { setCgv(e.target.checked); clear("cgv") }} aria-invalid={errs.cgv ? true : undefined} aria-describedby={errs.cgv ? "cgv-err" : undefined} className="peer sr-only" />
                          <span aria-hidden className={`mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-white/60 ${cgv ? "border-white bg-white text-black" : errs.cgv ? "border-[#FF453A]/80" : "border-white/25 group-hover/c:border-white/45"}`}>
                            <motion.span initial={false} animate={{ scale: cgv ? 1 : 0, opacity: cgv ? 1 : 0 }} transition={{ type: "spring", stiffness: 600, damping: 30 }}><Check size={13} strokeWidth={3} /></motion.span></span>
                          <span>J'accepte les <a href="/cgv" target="_blank" rel="noreferrer" className="text-white/80 underline decoration-white/30 underline-offset-2 hover:decoration-white">CGV</a>, le <a href="/dpa" target="_blank" rel="noreferrer" className="text-white/80 underline decoration-white/30 underline-offset-2 hover:decoration-white">contrat de traitement des données</a> et la <a href="/confidentialite" target="_blank" rel="noreferrer" className="text-white/80 underline decoration-white/30 underline-offset-2 hover:decoration-white">politique de confidentialité</a>.</span>
                        </label>
                        {errs.cgv && <p id="cgv-err" className="mt-2 pl-[30px] text-[12.5px] text-[#FF6B61]">{errs.cgv}</p>}
                      </div>
                    </>}

                    <AlertBox a={alert} />

                    <div className="pt-1">
                      {view === "signup2" ? <div className="flex gap-2.5">
                        <button type="button" onClick={() => go("signup1")} className="h-12 shrink-0 rounded-full border border-white/[.12] px-5 text-[15px] font-medium text-white/80 transition-colors hover:border-white/25 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60">Retour</button>
                        <div className="flex-1"><Submit busy={busy} busyLabel="Création…">Créer mon compte</Submit></div>
                      </div> : <Submit busy={busy}>Continuer</Submit>}
                    </div>

                    {view === "signup1" && <ul className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1 text-[12.5px] text-white/40">{["30 jours offerts", "Sans carte bancaire", "Sans engagement"].map(t => <li key={t} className="flex items-center gap-1.5"><Check size={13} strokeWidth={2.2} className="text-white/55" />{t}</li>)}</ul>}
                  </form>
                </>}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {<footer className="mt-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[12px] text-white/30 lg:justify-start">
          <span>© {new Date().getFullYear()} Akno</span>
          {[["Mentions légales", "/mentions-legales"], ["Confidentialité", "/confidentialite"], ["CGV", "/cgv"]].map(([l, h]) => <a key={h} href={h} className="transition-colors hover:text-white/70">{l}</a>)}
        </footer>}
      </main>
      <aside className="hidden p-3 pl-0 lg:block" aria-label="Ce que fait Akno"><BrandPanel /></aside>
    </div>
  </MotionConfig>
}

function AlertBox({ a }: { a: Alert }) {
  return <div role="alert" aria-live="assertive">
    <AnimatePresence initial={false}>{a && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: .25, ease: EASE }} className="overflow-hidden">
      <div className="flex items-start gap-3 rounded-[12px] border border-[#FF453A]/25 bg-[#FF453A]/[.08] px-3.5 py-3 text-[13.5px] leading-[1.5] text-[#FFB4AE]">
        <AlertCircle size={17} strokeWidth={1.9} className="mt-[1px] shrink-0 text-[#FF6B61]" />
        <div className="min-w-0 flex-1">{a.t}{a.action && <> <button type="button" onClick={a.action.on} className="font-semibold text-white underline decoration-white/40 underline-offset-2 hover:decoration-white">{a.action.l}</button></>}</div>
      </div>
    </motion.div>}</AnimatePresence>
  </div>
}

const B = ({ children, on, dis }: { children: ReactNode; on: () => void; dis?: boolean }) => <button type="button" onClick={on} disabled={dis} className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-white/[.12] text-[15px] font-medium text-white/90 transition-colors hover:border-white/25 hover:bg-white/[.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 disabled:cursor-not-allowed disabled:opacity-45">{children}</button>

function Sent({ email, cool, busy, resent, alert, onResend, onBack, onLogin }: { email: string; cool: number; busy: boolean; resent: string; alert: Alert; onResend: () => void; onBack: () => void; onLogin: () => void }) {
  const reduce = useReducedMotion()
  return <div className="text-center sm:text-left">
    <div className="relative mx-auto mb-8 flex h-[104px] w-[104px] items-center justify-center sm:mx-0">
      {!reduce && [0, 1].map(i => <motion.span key={i} aria-hidden className="absolute inset-0 rounded-full border border-white/20" initial={{ scale: .7, opacity: 0 }} animate={{ scale: [.7, 1.35], opacity: [.6, 0] }} transition={{ duration: 2.4, repeat: Infinity, delay: .6 + i * 1.2, ease: "easeOut" }} />)}
      <motion.div initial={{ scale: .6, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 18 }} className="relative flex h-[84px] w-[84px] items-center justify-center rounded-full bg-gradient-to-b from-[#1A1A1D] to-[#101012] shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_20px_40px_-20px_rgba(0,0,0,1)]">
        <Blob c="#E6E6E6" s={44} />
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: .45, type: "spring", stiffness: 500, damping: 22 }} className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-[#30D158] text-black ring-4 ring-black"><MailCheck size={14} strokeWidth={2.4} /></motion.span>
      </motion.div>
    </div>
    <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.035em]">Vérifiez votre boîte mail</h1>
    <p className="mt-3 text-[15px] leading-[1.55] text-white/55 text-pretty">Nous avons envoyé un lien d'activation à <span className="font-medium text-white">{email}</span>. Ouvrez-le pour accéder à votre espace et commencer vos 30 jours d'essai.</p>
    <p className="mt-3 text-[13px] text-white/35">Rien reçu d'ici 2 minutes ? Regardez dans les courriers indésirables.</p>
    <div className="mt-8 space-y-2.5">
      <B on={onResend} dis={busy || cool > 0}>{busy ? <><Spinner />Envoi…</> : cool > 0 ? <>Renvoyer l'e-mail <span className="font-mono text-[13px] tabular-nums text-white/45">{cool} s</span></> : "Renvoyer l'e-mail"}</B>
      <div role="status" aria-live="polite" className="min-h-[20px] text-[13px] text-[#30D158]">{resent}</div>
      <AlertBox a={alert} />
      <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 sm:justify-start">
        {<Ghost onClick={onBack}>Modifier l'adresse e-mail</Ghost>}
        <Ghost onClick={onLogin}>J'ai confirmé, me connecter</Ghost>
      </div>
    </div>
  </div>
}
