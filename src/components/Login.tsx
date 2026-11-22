import { useState } from "react"
import { supabase } from "../lib/supabase"
import { Blob } from "./ui"
import AuthScreen from "./auth/AuthScreen"
import { webOrigin } from "../lib/native"

const inp = "h-[52px] w-full rounded-[16px] bg-white/[.06] px-4 text-[16px] text-white outline-none placeholder:text-white/35 focus:bg-white/[.09] focus:ring-1 focus:ring-white/20"
const btn = "mt-5 h-[52px] w-full rounded-full bg-white text-[16px] font-semibold text-black transition-opacity disabled:opacity-50"

/** Connexion e-mail + mot de passe (compatible trousseau iCloud / Face ID), mot de passe oublié, et nouveau mot de passe après lien de récupération. */
export default function Login({ mode: m0 = "login", onDone }: { mode?: "login" | "forgot" | "reset" | "signup"; onDone?: () => void }) {
  const [mode, setMode] = useState(m0), [email, setEmail] = useState(""), [pw, setPw] = useState(""), [pw2, setPw2] = useState(""), [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ t: string; ok?: boolean } | null>(null)
  const sw = (x: typeof mode) => { setMode(x); setMsg(null) }
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null)
    if (mode === "reset" && (pw.length < 8 || pw !== pw2)) return setMsg({ t: pw.length < 8 ? "8 caractères minimum." : "Les mots de passe ne correspondent pas." })
    setBusy(true)
    try {
    if (mode === "forgot") { const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: webOrigin() + "/reception?reset=1" }); setMsg(error ? { t: "Impossible d'envoyer l'e-mail. Réessayez." } : { t: "E-mail envoyé. Ouvrez le lien pour choisir un nouveau mot de passe.", ok: true }) }
    else { const { error } = await supabase.auth.updateUser({ password: pw }); if (error) setMsg({ t: "Impossible d'enregistrer ce mot de passe." }); else onDone?.() }
    } catch { setMsg({ t: "Connexion impossible. Vérifiez votre réseau." }) } finally { setBusy(false) }
  }
  // update49 : connexion ET création de compte sur le même écran (auth/AuthScreen.tsx, Google / Apple / e-mail).
  // Mot de passe oublié et nouveau mot de passe restent ici, inchangés.
  if (mode === "signup" || mode === "login") return <AuthScreen initial={mode} onForgot={() => sw("forgot")} />
  const sub = mode === "forgot" ? "Recevez un lien pour réinitialiser votre mot de passe" : "Choisissez un nouveau mot de passe"
  return <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-black px-6 text-white">
    <form onSubmit={go} method="post" action="#" className="w-full max-w-[360px]">
      <div className="mb-6 flex justify-center"><Blob c="#E6E6E6" s={64} /></div>
      <h1 className="text-center text-[28px] font-semibold tracking-[-0.02em]">Akno</h1>
      <p className="mb-8 mt-1.5 text-center text-[15px] text-white/50">{sub}</p>
      <div className="space-y-2.5">
        {mode !== "reset" && <input className={inp} id="email" name="email" type="email" autoComplete="username" inputMode="email" autoCapitalize="none" placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} required />}
        {mode === "reset" && <>
          <input id="new-password" name="new-password" type="password" autoComplete="new-password" className={inp} placeholder="Nouveau mot de passe (8 caractères min.)" value={pw} onChange={e => setPw(e.target.value)} required />
          <input id="confirm-password" name="confirm-password" type="password" autoComplete="new-password" className={inp} placeholder="Confirmer le mot de passe" value={pw2} onChange={e => setPw2(e.target.value)} required />
        </>}
      </div>
      <button type="submit" disabled={busy} className={btn}>{busy ? "Patientez…" : mode === "forgot" ? "Envoyer le lien" : "Enregistrer"}</button>
      {mode === "forgot" && <button type="button" onClick={() => sw("login")} className="mt-4 w-full text-center text-[14px] text-white/50 hover:text-white/80">Retour à la connexion</button>}
      {mode !== "reset" && <p className="mt-6 text-center text-[12px] text-white/35"><a href="/mentions-legales" className="hover:text-white/60">Mentions légales</a> · <a href="/confidentialite" className="hover:text-white/60">Confidentialité</a> · <a href="/cgv" className="hover:text-white/60">CGV</a></p>}
      {msg && <p role="status" className={`mt-4 text-center text-[14px] ${msg.ok ? "text-[#30D158]" : "text-[#FF453A]"}`}>{msg.t}</p>}
    </form>
  </div>
}
