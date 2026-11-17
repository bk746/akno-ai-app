import { useState } from "react"
import { supabase } from "../lib/supabase"
import { BLOB } from "./blobPath"
import { CGV_VERSION } from "../lib/legal"

const inp = "h-[52px] w-full rounded-[16px] bg-white/[.06] px-4 text-[16px] text-white outline-none placeholder:text-white/35 focus:bg-white/[.09] focus:ring-1 focus:ring-white/20"
const btn = "mt-5 h-[52px] w-full rounded-full bg-white text-[16px] font-semibold text-black transition-opacity disabled:opacity-50"

/** Connexion e-mail + mot de passe (compatible trousseau iCloud / Face ID), mot de passe oublié, et nouveau mot de passe après lien de récupération. */
export default function Login({ mode: m0 = "login", onDone }: { mode?: "login" | "forgot" | "reset" | "signup"; onDone?: () => void }) {
  const [mode, setMode] = useState(m0), [email, setEmail] = useState(""), [pw, setPw] = useState(""), [pw2, setPw2] = useState(""), [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ t: string; ok?: boolean } | null>(null)
  // update45 : inscription en libre-service (la fiche artisan est créée par le trigger handle_new_user)
  const [prenom, setPrenom] = useState(""), [entreprise, setEntreprise] = useState(""), [metier, setMetier] = useState(""), [telephone, setTelephone] = useState(""), [cgv, setCgv] = useState(false)
  const sw = (x: typeof mode) => { setMode(x); setMsg(null) }
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null)
    if (mode === "reset" && (pw.length < 8 || pw !== pw2)) return setMsg({ t: pw.length < 8 ? "8 caractères minimum." : "Les mots de passe ne correspondent pas." })
    if (mode === "signup" && pw.length < 8) return setMsg({ t: "Mot de passe : 8 caractères minimum." })
    if (mode === "signup" && !cgv) return setMsg({ t: "Acceptez les CGV et la politique de confidentialité pour continuer." })
    setBusy(true)
    try {
    if (mode === "login") { const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw }); if (error) setMsg({ t: "E-mail ou mot de passe incorrect." }) }
    else if (mode === "forgot") { const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + "/reception?reset=1" }); setMsg(error ? { t: "Impossible d'envoyer l'e-mail. Réessayez." } : { t: "E-mail envoyé. Ouvrez le lien pour choisir un nouveau mot de passe.", ok: true }) }
    else if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: pw, options: { emailRedirectTo: location.origin + "/reception", data: { prenom: prenom.trim(), entreprise: entreprise.trim(), metier: metier.trim(), telephone: telephone.trim(), cgv_version: CGV_VERSION } } })
      if (error) setMsg({ t: /registered|exists/i.test(error.message) ? "Un compte existe déjà avec cet e-mail. Connectez-vous." : "Inscription impossible. Vérifiez l'e-mail et réessayez." })
      else if (!data.session) setMsg({ t: "Compte créé. Ouvrez l'e-mail de confirmation pour activer votre espace.", ok: true })
    }
    else { const { error } = await supabase.auth.updateUser({ password: pw }); if (error) setMsg({ t: "Impossible d'enregistrer ce mot de passe." }); else onDone?.() }
    } catch { setMsg({ t: "Connexion impossible. Vérifiez votre réseau." }) } finally { setBusy(false) }
  }
  const sub = mode === "signup" ? "30 jours d'essai gratuit, sans carte bancaire" : mode === "login" ? "Connectez-vous à votre espace" : mode === "forgot" ? "Recevez un lien pour réinitialiser votre mot de passe" : "Choisissez un nouveau mot de passe"
  return <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-black px-6 text-white">
    <form onSubmit={go} method="post" action="#" className="w-full max-w-[360px]">
      <svg viewBox="0 0 266 278" className="mx-auto mb-6 h-16 w-16" aria-hidden><path d={BLOB} fill="white" fillOpacity=".92" /></svg>
      <h1 className="text-center text-[28px] font-semibold tracking-[-0.02em]">Akno</h1>
      <p className="mb-8 mt-1.5 text-center text-[15px] text-white/50">{sub}</p>
      <div className="space-y-2.5">
        {mode === "signup" && <>
          <input className={inp} name="given-name" autoComplete="given-name" placeholder="Prénom" value={prenom} onChange={e => setPrenom(e.target.value)} required />
          <input className={inp} name="organization" autoComplete="organization" placeholder="Nom de l'entreprise" value={entreprise} onChange={e => setEntreprise(e.target.value)} required />
          <input className={inp} name="metier" placeholder="Métier (plombier, électricien…)" value={metier} onChange={e => setMetier(e.target.value)} />
          <input className={inp} name="tel" type="tel" autoComplete="tel" inputMode="tel" placeholder="Téléphone portable" value={telephone} onChange={e => setTelephone(e.target.value)} />
        </>}
        {mode !== "reset" && <input className={inp} id="email" name="email" type="email" autoComplete="username" inputMode="email" autoCapitalize="none" placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} required />}
        {mode === "login" && <input className={inp} id="password" name="password" type="password" autoComplete="current-password" placeholder="Mot de passe" value={pw} onChange={e => setPw(e.target.value)} required />}
        {mode === "signup" && <input className={inp} id="new-password" name="new-password" type="password" autoComplete="new-password" placeholder="Mot de passe (8 caractères min.)" value={pw} onChange={e => setPw(e.target.value)} required />}
        {mode === "signup" && <label className="flex items-start gap-2.5 px-1 pt-1 text-[13px] leading-5 text-white/55"><input type="checkbox" checked={cgv} onChange={e => setCgv(e.target.checked)} className="mt-0.5 h-4 w-4 accent-white" />J'accepte les <a href="/cgv" target="_blank" className="underline">CGV</a>, le <a href="/dpa" target="_blank" className="underline">contrat de traitement des données</a> et la <a href="/confidentialite" target="_blank" className="underline">politique de confidentialité</a>.</label>}
        {mode === "reset" && <>
          <input id="new-password" name="new-password" type="password" autoComplete="new-password" className={inp} placeholder="Nouveau mot de passe (8 caractères min.)" value={pw} onChange={e => setPw(e.target.value)} required />
          <input id="confirm-password" name="confirm-password" type="password" autoComplete="new-password" className={inp} placeholder="Confirmer le mot de passe" value={pw2} onChange={e => setPw2(e.target.value)} required />
        </>}
      </div>
      <button type="submit" disabled={busy} className={btn}>{busy ? "Patientez…" : mode === "login" ? "Se connecter" : mode === "signup" ? "Créer mon compte" : mode === "forgot" ? "Envoyer le lien" : "Enregistrer"}</button>
      {mode === "login" && <button type="button" onClick={() => sw("forgot")} className="mt-4 w-full text-center text-[14px] text-white/50 hover:text-white/80">Mot de passe oublié ?</button>}
      {mode === "login" && <button type="button" onClick={() => sw("signup")} className="mt-2 w-full text-center text-[14px] text-white/70 hover:text-white">Pas encore de compte ? Essayer gratuitement</button>}
      {(mode === "forgot" || mode === "signup") && <button type="button" onClick={() => sw("login")} className="mt-4 w-full text-center text-[14px] text-white/50 hover:text-white/80">{mode === "signup" ? "Déjà un compte ? Se connecter" : "Retour à la connexion"}</button>}
      {mode !== "reset" && <p className="mt-6 text-center text-[12px] text-white/35"><a href="/mentions-legales" className="hover:text-white/60">Mentions légales</a> · <a href="/confidentialite" className="hover:text-white/60">Confidentialité</a> · <a href="/cgv" className="hover:text-white/60">CGV</a></p>}
      {msg && <p role="status" className={`mt-4 text-center text-[14px] ${msg.ok ? "text-[#30D158]" : "text-[#FF453A]"}`}>{msg.t}</p>}
    </form>
  </div>
}
