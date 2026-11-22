/* update78 · Acceptation de l'invitation employé /rejoindre/:token */
import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"

export default function RejoindrePublic() {
  const { token = "" } = useParams()
  const [info, setInfo] = useState<{ first_name?: string; email?: string; company?: string } | null>(null)
  const [err, setErr] = useState(""), [ok, setOk] = useState(false), [password, setPassword] = useState(""), [busy, setBusy] = useState(false)

  useEffect(() => {
    document.title = "Rejoindre l'équipe"
    fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "equipe_preview", token }) })
      .then(async x => { const j = await x.json().catch(() => ({})); if (!x.ok) setErr(j.error || "Lien invalide."); else setInfo(j) })
      .catch(() => setErr("Connexion impossible. Réessayez."))
  }, [token])

  const accept = async () => {
    setBusy(true); setErr("")
    const x = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "equipe_accept", token, password }) }).catch(() => null)
    const j = x ? await x.json().catch(() => ({})) : {}
    setBusy(false)
    if (x?.ok && j.ok) setOk(true)
    else setErr(j.error || "Impossible d'activer le compte.")
  }

  return <div className="min-h-[100dvh] bg-[#F6F6F8] text-[#141416] antialiased" data-rejoindre>
    <div className="mx-auto max-w-[560px] px-5 pb-[max(48px,env(safe-area-inset-bottom))] pt-[max(40px,env(safe-area-inset-top))]">
      {ok ? <><h1 className="text-[26px] font-semibold tracking-[-0.02em]">Compte activé</h1><p className="mt-2 text-[16px] text-[#3D3D42]">Vous pouvez maintenant ouvrir l'application Akno et vous connecter avec {info?.email}.</p><a href="/agenda" className="mt-6 flex h-14 items-center justify-center rounded-full bg-[#2F6BFF] text-[17px] font-semibold text-white">Se connecter</a></>
        : <>
          <div className="text-[13px] font-medium uppercase tracking-[.08em] text-[#2F6BFF]">Invitation équipe</div>
          <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.02em]">{info ? `${info.company} vous invite` : "Rejoindre l'équipe"}</h1>
          {info?.first_name && <p className="mt-2 text-[16px] text-[#3D3D42]">Bonjour {info.first_name}. Choisissez un mot de passe pour activer votre accès ({info.email}).</p>}
          {err && <p className="mt-3 text-[15px] text-[#C5221F]">{err}</p>}
          {info && <form className="mt-6 space-y-3" onSubmit={e => { e.preventDefault(); void accept() }}>
            <input type="password" required minLength={8} placeholder="Mot de passe (8 caractères min.)" className="h-12 w-full rounded-[14px] bg-white px-4 text-[16px]" value={password} onChange={e => setPassword(e.target.value)} />
            <button type="submit" disabled={busy || password.length < 8} className="h-14 w-full rounded-full bg-[#2F6BFF] text-[17px] font-semibold text-white disabled:opacity-60">{busy ? "Activation…" : "Activer mon accès"}</button>
          </form>}
        </>}
    </div>
  </div>
}
