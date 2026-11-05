import { useState } from "react"
import { supabase } from "../lib/supabase"
import { BLOB } from "./blobPath"

/** Écran de connexion : e-mail + mot de passe, ou lien magique. */
export default function Login() {
  const [email, setEmail] = useState(""), [pw, setPw] = useState(""), [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ t: string; ok?: boolean } | null>(null)
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); if (!email) return; setBusy(true); setMsg(null)
    const r = pw ? await supabase.auth.signInWithPassword({ email, password: pw }) : await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + "/reception", shouldCreateUser: false } })
    setBusy(false)
    if (r.error) setMsg({ t: pw ? "E-mail ou mot de passe incorrect." : "Impossible d'envoyer le lien. Vérifiez l'adresse." })
    else if (!pw) setMsg({ t: "Lien de connexion envoyé. Ouvrez votre boîte mail.", ok: true })
  }
  const inp = "h-[52px] w-full rounded-[16px] bg-white/[.06] px-4 text-[16px] text-white outline-none placeholder:text-white/35 focus:bg-white/[.09] focus:ring-1 focus:ring-white/20"
  return <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-black px-6 text-white">
    <form onSubmit={go} className="w-full max-w-[360px]">
      <svg viewBox="0 0 266 278" className="mx-auto mb-6 h-16 w-16" aria-hidden><path d={BLOB} fill="white" fillOpacity=".92" /></svg>
      <h1 className="text-center text-[28px] font-semibold tracking-[-0.02em]">Akno</h1>
      <p className="mb-8 mt-1.5 text-center text-[15px] text-white/50">Connectez-vous à votre espace</p>
      <div className="space-y-2.5">
        <input className={inp} type="email" autoComplete="email" inputMode="email" placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} required />
        <input className={inp} type="password" autoComplete="current-password" placeholder="Mot de passe (facultatif)" value={pw} onChange={e => setPw(e.target.value)} />
      </div>
      <button disabled={busy} className="mt-5 h-[52px] w-full rounded-full bg-white text-[16px] font-semibold text-black transition-opacity disabled:opacity-50">{busy ? "Connexion…" : pw ? "Se connecter" : "Recevoir un lien de connexion"}</button>
      {msg && <p role="status" className={`mt-4 text-center text-[14px] ${msg.ok ? "text-[#30D158]" : "text-[#FF453A]"}`}>{msg.t}</p>}
    </form>
  </div>
}
