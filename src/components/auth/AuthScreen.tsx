/* update49 · Étape 1 du parcours : un seul écran pour se connecter OU créer son compte.
   Google / Apple (supabase.auth.signInWithOAuth) + e-mail et mot de passe.
   Les infos « vous » (prénom, entreprise, métier, téléphone, CGV) sont demandées à l'étape suivante,
   pour tout le monde (e-mail, Google ou Apple). Mot de passe oublié / nouveau mot de passe : Login.tsx (inchangés). */
import { useEffect, useRef, useState, type FormEvent } from "react"
import { AnimatePresence, MotionConfig, motion, useAnimate, useReducedMotion } from "motion/react"
import { Check, MailCheck } from "lucide-react"
import { supabase } from "../../lib/supabase"
import { Blob } from "../ui"
import { EASE, Field, Ghost, PasswordField, Spinner, Strength, Submit } from "./fields"
import { authErrorFr } from "./authErrors"
import FlowShell, { AlertBox, FlowSteps, Outline } from "./FlowShell"

type Mode = "signup" | "login"
type Provider = "google" | "apple"
type Alert = { t: string; action?: { l: string; on: () => void } } | null
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const RESEND_S = 45
const ENV = (import.meta.env || {}) as Record<string, string | undefined>
/** Boutons masqués tant que la variable ne vaut pas "1" (le provider doit d'abord être configuré dans Supabase). */
export const SHOW: Record<Provider, boolean> = { google: ENV.VITE_AUTH_GOOGLE === "1", apple: ENV.VITE_AUTH_APPLE === "1" }
const NAME: Record<Provider, string> = { google: "Google", apple: "Apple" }
const home = () => location.origin + "/"

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

export default function AuthScreen({ initial = "signup", onForgot }: { initial?: Mode; onForgot: () => void }) {
  const reduce = useReducedMotion()
  const [mode, setMode] = useState<Mode>(initial)
  const [sent, setSent] = useState(false)
  const [email, setEmail] = useState(""), [pw, setPw] = useState("")
  const [busy, setBusy] = useState<"" | "form" | Provider>(""), [errs, setErrs] = useState<{ email?: string; pw?: string }>({}), [alert, setAlert] = useState<Alert>(null)
  const [cool, setCool] = useState(0), [resent, setResent] = useState("")
  const [scope, animate] = useAnimate<HTMLDivElement>()
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => { const e = oauthReturnError(); if (e) setAlert({ t: e }) }, [])
  useEffect(() => { if (cool <= 0) return; const t = setTimeout(() => setCool(c => c - 1), 1000); return () => clearTimeout(t) }, [cool])

  const shake = () => { if (!reduce && scope.current) void animate(scope.current, { x: [0, -9, 8, -6, 4, -2, 0] }, { duration: .45, ease: "easeOut" }) }
  const fail = (e: typeof errs, a: Alert = null) => { setErrs(e); setAlert(a); shake(); const f = Object.keys(e)[0]; if (f) setTimeout(() => root.current?.querySelector<HTMLElement>(`[data-f="${f}"]`)?.focus(), 30) }
  const switchMode = (m: Mode) => { if (m === mode) return; setMode(m); setErrs({}); setAlert(null) }

  const oauth = async (p: Provider) => {
    if (busy) return
    setBusy(p); setAlert(null)
    const on = await providerEnabled(p)
    if (on === false) { setBusy(""); fail({}, { t: `La connexion avec ${NAME[p]} n'est pas encore activée sur Akno. Utilisez votre e-mail et un mot de passe en attendant.` }); return }
    const { error } = await supabase.auth.signInWithOAuth({ provider: p, options: { redirectTo: home() } })
    if (error) { setBusy(""); fail({}, { t: /not enabled|unsupported provider/i.test(error.message) ? `La connexion avec ${NAME[p]} n'est pas encore activée sur Akno.` : authErrorFr(error, "login") }) }
    // Sinon : le navigateur part chez Google / Apple, puis revient sur l'app connecté.
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (busy) return
    setAlert(null)
    const em = email.trim(), x: typeof errs = {}
    if (!EMAIL_RE.test(em)) x.email = "Saisissez une adresse e-mail valide."
    if (mode === "signup" ? pw.length < 8 : !pw) x.pw = mode === "signup" ? "8 caractères minimum." : "Saisissez votre mot de passe."
    if (Object.keys(x).length) return fail(x)
    setBusy("form")
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: em, password: pw })
        if (error) fail({}, { t: authErrorFr(error, "login") })
        return
      }
      const { data, error } = await supabase.auth.signUp({ email: em, password: pw, options: { emailRedirectTo: home() } })
      // Avec la protection anti-énumération, un e-mail déjà inscrit revient sans erreur mais avec identities = []
      const exists = error ? /^(user_already_exists|email_exists|identity_already_exists)$/.test(String(error.code)) || /already/i.test(error.message) : !!data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0
      if (exists) fail({}, { t: "Un compte existe déjà avec cet e-mail.", action: { l: "Se connecter", on: () => switchMode("login") } })
      else if (error) { const t = authErrorFr(error, "signup"); if (error.code === "weak_password") fail({ pw: t }); else if (error.code === "email_address_invalid") fail({ email: t }); else fail({}, { t }) }
      else if (!data.session) { setCool(RESEND_S); setSent(true) }
      // Avec session : AknoRoot passe seul à l'étape suivante (« Parlons de vous »).
    } catch (err) { fail({}, { t: authErrorFr(err, mode) }) }
    finally { setBusy(b => b === "form" ? "" : b) }
  }
  const resend = async () => {
    setBusy("form"); setResent(""); setAlert(null)
    try { const { error } = await supabase.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: home() } }); if (error) setAlert({ t: authErrorFr(error, "resend") }); else { setResent("Nouvel e-mail envoyé."); setCool(RESEND_S) } }
    catch (e) { setAlert({ t: authErrorFr(e, "resend") }) } finally { setBusy("") }
  }

  const providers = (Object.keys(SHOW) as Provider[]).filter(p => SHOW[p])
  const trans = { initial: { opacity: 0, y: 12, filter: "blur(4px)" }, animate: { opacity: 1, y: 0, filter: "blur(0px)" }, exit: { opacity: 0, y: -8, filter: "blur(4px)" }, transition: { duration: .32, ease: EASE } }
  const signup = mode === "signup"

  return <MotionConfig reducedMotion="user"><div ref={root}><FlowShell>
    <div ref={scope}>
      <AnimatePresence mode="wait" initial={false}>
        {sent ? <motion.div key="sent" {...trans}><Sent email={email.trim()} cool={cool} busy={busy === "form"} resent={resent} alert={alert} onResend={resend} onBack={() => setSent(false)} onLogin={() => { setSent(false); switchMode("login") }} /></motion.div>
        : <motion.div key="form" {...trans}>
          <div className="mb-7 h-4">{signup ? <FlowSteps i={0} /> : null}</div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={mode} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .22, ease: EASE }}>
              <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.035em] text-balance">{signup ? "Créez votre espace Akno" : "Bon retour sur Akno"}</h1>
              <p className="mt-2.5 text-[15px] leading-[1.5] text-white/50 text-pretty">{signup ? "30 jours d'essai gratuit, 0 € aujourd'hui." : "Connectez-vous pour retrouver votre espace."}</p>
            </motion.div>
          </AnimatePresence>

          <div role="tablist" aria-label="Connexion ou création de compte" className="mt-7 grid grid-cols-2 rounded-full bg-white/[.05] p-1">
            {(["signup", "login"] as Mode[]).map(m => <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => switchMode(m)} className={`relative h-9 rounded-full text-[13.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 ${mode === m ? "text-black" : "text-white/60 hover:text-white"}`}>
              {mode === m && <motion.span layoutId="auth-tab" className="absolute inset-0 rounded-full bg-white" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
              <span className="relative">{m === "signup" ? "Créer un compte" : "Se connecter"}</span>
            </button>)}
          </div>

          {providers.length > 0 && <>
            <div className="mt-6 space-y-2.5">{providers.map(p => <Outline key={p} className="w-full" disabled={!!busy} onClick={() => oauth(p)}>{busy === p ? <Spinner /> : p === "google" ? <GoogleG /> : <AppleLogo />}Continuer avec {NAME[p]}</Outline>)}</div>
            <div className="my-6 flex items-center gap-3 text-[12px] text-white/35"><span className="h-px flex-1 bg-white/[.08]" />ou avec votre e-mail<span className="h-px flex-1 bg-white/[.08]" /></div>
          </>}

          <form onSubmit={submit} noValidate method="post" action="#" className={`${providers.length ? "" : "mt-7"} space-y-5`}>
            <Field data-f="email" label="E-mail professionnel" name="email" type="email" autoComplete={signup ? "email" : "username"} inputMode="email" autoCapitalize="none" placeholder="vous@entreprise.fr" value={email} onChange={e => { setEmail(e.target.value); setErrs(x => ({ ...x, email: undefined })) }} error={errs.email} required />
            <div>
              <PasswordField data-f="pw" label="Mot de passe" name="password" autoComplete={signup ? "new-password" : "current-password"} placeholder={signup ? "8 caractères minimum" : "Votre mot de passe"} value={pw} onChange={e => { setPw(e.target.value); setErrs(x => ({ ...x, pw: undefined })) }} error={errs.pw} required
                aside={!signup ? <button type="button" onClick={onForgot} className="rounded text-[12.5px] font-medium text-white/50 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-white/50">Mot de passe oublié ?</button> : undefined} />
              {signup && <Strength pw={pw} />}
            </div>
            <AnimatePresence initial={false}>{alert && <AlertBox key={alert.t} t={alert.t} action={alert.action} />}</AnimatePresence>
            <div className="pt-1"><Submit busy={busy === "form"} busyLabel={signup ? "Création…" : "Connexion…"}>{signup ? "Créer mon compte" : "Se connecter"}</Submit></div>
            {signup && <ul className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1 text-[12.5px] text-white/40">{["30 jours offerts", "0 € aujourd'hui", "Sans engagement"].map(t => <li key={t} className="flex items-center gap-1.5"><Check size={13} strokeWidth={2.2} className="text-white/55" />{t}</li>)}</ul>}
          </form>
        </motion.div>}
      </AnimatePresence>
    </div>
  </FlowShell></div></MotionConfig>
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
