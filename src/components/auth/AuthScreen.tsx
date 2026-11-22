/* update61 · Accueil au style de la maquette : Bienvenue (Apple / Google / e-mail) → « Votre e-mail » → mot de passe.
   update49 · Étape 1 du parcours : un seul écran pour se connecter OU créer son compte.
   Google / Apple (supabase.auth.signInWithOAuth) + e-mail et mot de passe.
   Les infos « vous » (prénom, entreprise, métier, téléphone, CGV) sont demandées à l'étape suivante,
   pour tout le monde (e-mail, Google ou Apple). Mot de passe oublié / nouveau mot de passe : Login.tsx (inchangés). */
import { useEffect, useRef, useState, type FormEvent } from "react"
import { AnimatePresence, MotionConfig, motion, useAnimate, useReducedMotion } from "motion/react"
import { Eye, EyeOff, MailCheck } from "lucide-react"
import { supabase } from "../../lib/supabase"
import { authRedirect, isRealNative, openOAuth, webOrigin } from "../../lib/native"
import { Blob } from "../ui"
import { EASE, Ghost, Spinner, Strength } from "./fields"
import { authErrorFr } from "./authErrors"
import FlowShell, { AlertBox, Outline } from "./FlowShell"
import { MButton, MInput, MScreen, MSub, MTitle } from "../onboarding/Mobile"

type Mode = "signup" | "login"
type Provider = "google" | "apple"
type Alert = { t: string; action?: { l: string; on: () => void } } | null
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const RESEND_S = 45
const ENV = (import.meta.env || {}) as Record<string, string | undefined>
/** update70 : boutons MASQUÉS par défaut (web et app native) tant que les providers ne sont pas activés dans Supabase.
    Mettre VITE_AUTH_GOOGLE=1 / VITE_AUTH_APPLE=1 (Vercel + build natif) une fois Google / Apple configurés.
    App Store 4.8 : si Google est proposé, proposer aussi Apple (activer les deux ensemble). */
export const SHOW: Record<Provider, boolean> = { google: ENV.VITE_AUTH_GOOGLE === "1", apple: ENV.VITE_AUTH_APPLE === "1" }
const NAME: Record<Provider, string> = { google: "Google", apple: "Apple" }
const home = () => webOrigin() + "/"

/** Le provider est-il activé dans Supabase ? (GET /auth/v1/settings, public). null = inconnu (réseau). */
async function providerEnabled(p: Provider): Promise<boolean | null> {
  try {
    const r = await fetch(`${ENV.VITE_SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: String(ENV.VITE_SUPABASE_ANON_KEY || "") } })
    if (!r.ok) return null
    const j = await r.json() as { external?: Record<string, boolean> }
    return !!j.external?.[p]
  } catch { return null }
}

/** Erreur renvoyée dans l'URL au retour de Google / Apple (?error=…&error_description=… ou #error=…). */
function oauthReturnError(): string {
  const q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.replace(/^#/, ""))
  const err = q.get("error") || h.get("error"), desc = (q.get("error_description") || h.get("error_description") || "").replace(/\+/g, " ")
  if (!err) return ""
  for (const k of ["error", "error_code", "error_description"]) q.delete(k)
  history.replaceState(null, "", location.pathname + (q.toString() ? `?${q}` : ""))
  console.error("[Akno auth · oauth]", err, desc)
  if (/provider is not enabled|unsupported provider/i.test(desc)) return "Cette méthode de connexion n'est pas encore activée sur Akno. Utilisez votre e-mail et un mot de passe."
  if (err === "access_denied") return "Connexion annulée. Vous pouvez réessayer ou utiliser votre e-mail."
  if (/signups? not allowed/i.test(desc)) return "Les inscriptions sont momentanément fermées. Réessayez plus tard ou contactez-nous."
  if (/email/i.test(desc) && /already|exists/i.test(desc)) return "Un compte existe déjà avec cet e-mail. Connectez-vous avec votre mot de passe."
  return "La connexion n'a pas abouti. Réessayez ou utilisez votre e-mail et un mot de passe."
}

const GoogleG = () => <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
const AppleLogo = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M16.37 12.6c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.28-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.76-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.65zM14.1 5.86c.63-.77 1.06-1.83.94-2.89-.91.04-2.02.61-2.67 1.37-.58.67-1.09 1.76-.96 2.8 1.02.08 2.06-.52 2.69-1.28z" /></svg>

type Screen = "welcome" | "email" | "password"
export default function AuthScreen({ initial = "signup", onForgot }: { initial?: Mode; onForgot: () => void }) {
  const reduce = useReducedMotion()
  const [mode, setMode] = useState<Mode>(initial)
  const [screen, setScreen] = useState<Screen>("welcome")
  const [sent, setSent] = useState(false)
  const [email, setEmail] = useState(""), [pw, setPw] = useState(""), [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState<"" | "form" | Provider>(""), [errs, setErrs] = useState<{ email?: string; pw?: string }>({}), [alert, setAlert] = useState<Alert>(null)
  const [cool, setCool] = useState(0), [resent, setResent] = useState("")
  const [scope, animate] = useAnimate<HTMLDivElement>()
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => { const e = oauthReturnError(); if (e) setAlert({ t: e }) }, [])
  useEffect(() => { if (cool <= 0) return; const t = setTimeout(() => setCool(c => c - 1), 1000); return () => clearTimeout(t) }, [cool])

  const shake = () => { if (!reduce && scope.current) void animate(scope.current, { x: [0, -9, 8, -6, 4, -2, 0] }, { duration: .45, ease: "easeOut" }) }
  const fail = (e: typeof errs, a: Alert = null) => { setErrs(e); setAlert(a); shake(); const f = Object.keys(e)[0]; if (f) setTimeout(() => root.current?.querySelector<HTMLElement>(`[data-f="${f}"]`)?.focus(), 30) }
  const switchMode = (m: Mode) => { if (m === mode) return; setMode(m); setErrs({}); setAlert(null) }
  const go = (sc: Screen) => { setScreen(sc); setErrs({}); setAlert(null) }

  const oauth = async (p: Provider) => {
    if (busy) return
    setBusy(p); setAlert(null)
    const on = await providerEnabled(p)
    if (on === false) { setBusy(""); fail({}, { t: `La connexion avec ${NAME[p]} n'est pas encore activée sur Akno. Continuez avec votre e-mail en attendant.`, action: { l: "Continuer avec un e-mail", on: () => { switchMode("signup"); go("email") } } }); return }
    // update70 · app native : la page Google / Apple s'ouvre dans le navigateur système et revient par com.akno.app://auth/callback
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: p, options: { redirectTo: authRedirect(), skipBrowserRedirect: isRealNative } })
    if (!error && isRealNative && data?.url) { try { await openOAuth(data.url) } finally { setBusy("") } return }
    if (error) { setBusy(""); fail({}, { t: /not enabled|unsupported provider/i.test(error.message) ? `La connexion avec ${NAME[p]} n'est pas encore activée sur Akno.` : authErrorFr(error, "login") }) }
    // Sinon : le navigateur part chez Google / Apple, puis revient sur l'app connecté.
  }

  const nextFromEmail = (e: FormEvent) => {
    e.preventDefault()
    if (!EMAIL_RE.test(email.trim())) return fail({ email: "Saisissez une adresse e-mail valide." })
    go("password")
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (busy) return
    setAlert(null)
    const em = email.trim(), x: typeof errs = {}
    if (!EMAIL_RE.test(em)) { go("email"); return fail({ email: "Saisissez une adresse e-mail valide." }) }
    if (mode === "signup" ? pw.length < 8 : !pw) x.pw = mode === "signup" ? "8 caractères minimum." : "Saisissez votre mot de passe."
    if (Object.keys(x).length) return fail(x)
    setBusy("form")
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: em, password: pw })
        if (error) fail({}, { t: authErrorFr(error, "login") })
        return
      }
      // update50 · le déclencheur SQL d'inscription (handle_new_user) écrit prenom / nom_entreprise, colonnes NOT NULL :
      // valeurs vides (un espace, ignoré partout grâce à trim) en attendant les écrans « métier » et « prénom ».
      const { data, error } = await supabase.auth.signUp({ email: em, password: pw, options: { emailRedirectTo: home(), data: { prenom: " ", entreprise: " " } } })
      // Avec la protection anti-énumération, un e-mail déjà inscrit revient sans erreur mais avec identities = []
      const exists = error ? /^(user_already_exists|email_exists|identity_already_exists)$/.test(String(error.code)) || /already/i.test(error.message) : !!data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0
      if (exists) fail({}, { t: "Un compte existe déjà avec cet e-mail.", action: { l: "Se connecter", on: () => switchMode("login") } })
      else if (error) { const t = authErrorFr(error, "signup"); if (error.code === "weak_password") fail({ pw: t }); else if (error.code === "email_address_invalid") { go("email"); fail({ email: t }) } else fail({}, { t }) }
      else if (!data.session) { setCool(RESEND_S); setSent(true) }
      // Avec session : AknoRoot passe seul à l'étape suivante (métier, prénom, « C'est prêt »).
    } catch (err) { fail({}, { t: authErrorFr(err, mode) }) }
    finally { setBusy(b => b === "form" ? "" : b) }
  }
  const resend = async () => {
    setBusy("form"); setResent(""); setAlert(null)
    try { const { error } = await supabase.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: home() } }); if (error) setAlert({ t: authErrorFr(error, "resend") }); else { setResent("Nouvel e-mail envoyé."); setCool(RESEND_S) } }
    catch (e) { setAlert({ t: authErrorFr(e, "resend") }) } finally { setBusy("") }
  }

  const trans = { initial: { opacity: 0, x: reduce ? 0 : 18 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: reduce ? 0 : -18 }, transition: { duration: .26, ease: EASE } }
  const signup = mode === "signup"
  const alertBox = <AnimatePresence initial={false}>{alert && <div className="mt-4"><AlertBox key={alert.t} t={alert.t} action={alert.action} /></div>}</AnimatePresence>

  if (sent) return <MotionConfig reducedMotion="user"><FlowShell><Sent email={email.trim()} cool={cool} busy={busy === "form"} resent={resent} alert={alert} onResend={resend} onBack={() => { setSent(false); go("email") }} onLogin={() => { setSent(false); switchMode("login"); go("password") }} /></FlowShell></MotionConfig>

  return <MotionConfig reducedMotion="user"><div ref={root}><AnimatePresence mode="wait" initial={false}>
    {screen === "welcome" && <motion.div key="welcome" {...trans}><MScreen footer={<div ref={scope}>
      <div className="space-y-2.5">
        {SHOW.apple && <MButton busy={busy === "apple"} disabled={!!busy} onClick={() => void oauth("apple")}><AppleLogo />Continuer avec Apple</MButton>}
        {SHOW.google && <MButton variant="dark" busy={busy === "google"} disabled={!!busy} onClick={() => void oauth("google")}><GoogleG />Continuer avec Google</MButton>}
      </div>
      <button type="button" onClick={() => { switchMode("signup"); go("email") }} className="mt-4 h-11 w-full rounded-full text-[15.5px] font-medium text-white transition-colors hover:bg-white/[.05]">Continuer avec un e-mail</button>
      {alertBox}
      <p className="mx-auto mt-4 max-w-[300px] text-center text-[12px] leading-[1.5] text-white/35">En continuant, vous acceptez les <a href="/cgv" target="_blank" rel="noreferrer" className="underline decoration-white/25 underline-offset-2 hover:text-white/60">CGV</a> et la <a href="/confidentialite" target="_blank" rel="noreferrer" className="underline decoration-white/25 underline-offset-2 hover:text-white/60">Politique de confidentialité</a>.</p>
      <p className="mt-3 text-center text-[13px] text-white/45">Déjà un compte ? <button type="button" onClick={() => { switchMode("login"); go("email") }} className="font-medium text-white underline decoration-white/25 underline-offset-[3px] hover:decoration-white">Se connecter</button></p>
    </div>}>
      <div className="flex flex-1 flex-col items-center justify-center pb-4 text-center">
        <motion.div initial={{ scale: .8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 180, damping: 18 }}><Blob c="#E6E6E6" s={124} /></motion.div>
        <h1 className="mt-9 text-[30px] font-semibold leading-[1.12] tracking-[-0.035em]">Tout votre métier,<br />dans une seule app.</h1>
        <p className="mt-3 text-[15px] text-white/50">15 jours gratuits, sans engagement.</p>
      </div>
    </MScreen></motion.div>}

    {screen === "email" && <motion.div key="email" {...trans}><form onSubmit={nextFromEmail} noValidate method="post" action="#">
      <MScreen back={() => go("welcome")} footer={<MButton type="submit">Continuer</MButton>}>
        <div ref={scope}>
          <MTitle>Votre e-mail</MTitle>
          {!signup && <MSub>Connectez-vous pour retrouver votre espace.</MSub>}
          <div className="mt-6"><MInput data-f="email" autoFocus name="email" type="email" autoComplete={signup ? "email" : "username"} inputMode="email" autoCapitalize="none" placeholder="vous@entreprise.fr" aria-label="Adresse e-mail" value={email} onChange={e => { setEmail(e.target.value); setErrs({}) }} error={errs.email} /></div>
          {alertBox}
        </div>
      </MScreen>
    </form></motion.div>}

    {screen === "password" && <motion.div key={`password-${mode}`} {...trans}><form onSubmit={submit} noValidate method="post" action="#">
      <MScreen back={() => go("email")} footer={<MButton type="submit" busy={busy === "form"}>{busy === "form" ? (signup ? "Création…" : "Connexion…") : signup ? "Créer mon compte" : "Se connecter"}</MButton>}>
        <div ref={scope}>
          <MTitle>{signup ? "Choisissez un mot de passe" : "Votre mot de passe"}</MTitle>
          <MSub>{email.trim()}</MSub>
          {/* identifiant caché : le trousseau (Face ID / iCloud) associe le mot de passe à l'e-mail */}
          <input type="email" name="username" autoComplete="username" value={email.trim()} readOnly hidden />
          <div className="relative mt-6">
            <MInput data-f="pw" autoFocus name="password" type={showPw ? "text" : "password"} autoComplete={signup ? "new-password" : "current-password"} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder={signup ? "8 caractères minimum" : "Mot de passe"} aria-label="Mot de passe" value={pw} onChange={e => { setPw(e.target.value); setErrs({}) }} error={errs.pw} className="pr-12" />
            <button type="button" onClick={() => setShowPw(v => !v)} aria-label={showPw ? "Masquer le mot de passe" : "Afficher le mot de passe"} className="absolute right-2 top-[7px] flex h-10 w-10 items-center justify-center rounded-[10px] text-white/45 hover:text-white">{showPw ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>
          {signup && <Strength pw={pw} />}
          {!signup && <button type="button" onClick={onForgot} className="mt-3 px-1 text-[13.5px] font-medium text-white/55 hover:text-white">Mot de passe oublié ?</button>}
          {alertBox}
          <p className="mt-6 text-[13.5px] text-white/45">{signup ? "Déjà un compte ?" : "Pas encore de compte ?"}{" "}
            <button type="button" onClick={() => switchMode(signup ? "login" : "signup")} className="font-medium text-white underline decoration-white/25 underline-offset-[3px] hover:decoration-white">{signup ? "Se connecter" : "Créer un compte"}</button></p>
        </div>
      </MScreen>
    </form></motion.div>}
  </AnimatePresence></div></MotionConfig>
}

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
    <p className="mt-3 text-[15px] leading-[1.55] text-white/55 text-pretty">Nous avons envoyé un lien d'activation à <span className="font-medium text-white">{email}</span>. Ouvrez-le pour continuer la création de votre espace.</p>
    <p className="mt-3 text-[13px] text-white/35">Rien reçu d'ici 2 minutes ? Regardez dans les courriers indésirables.</p>
    <div className="mt-8 space-y-2.5">
      <Outline className="w-full" onClick={onResend} disabled={busy || cool > 0}>{busy ? <><Spinner />Envoi…</> : cool > 0 ? <>Renvoyer l'e-mail <span className="font-mono text-[13px] tabular-nums text-white/45">{cool} s</span></> : "Renvoyer l'e-mail"}</Outline>
      <div role="status" aria-live="polite" className="min-h-[20px] text-[13px] text-[#30D158]">{resent}</div>
      <AnimatePresence initial={false}>{alert && <AlertBox key={alert.t} t={alert.t} />}</AnimatePresence>
      <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 sm:justify-start"><Ghost onClick={onBack}>Modifier l'adresse e-mail</Ghost><Ghost onClick={onLogin}>J'ai confirmé, me connecter</Ghost></div>
    </div>
  </div>
}
