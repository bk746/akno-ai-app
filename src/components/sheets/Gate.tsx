import { useEffect, useState } from "react"
import { LogOut } from "lucide-react"
import { Btn, tx, useC } from "../ui"
import { api, reloadAccount, useAccount } from "../../lib/accountApi"
import { useProfile } from "../../lib/profile"
import { CGV_VERSION } from "../../lib/legal"
import { supabase } from "../../lib/supabase"
import Offres from "../billing/Offres"
import { hasLock } from "../../lib/lock"
import { billingHidden } from "../../lib/native"
import { NativeNoAccess } from "../billing/NativeAccess"

/* update45 · Écrans plein écran : retour de paiement, mur de paiement (essai terminé), onboarding, nouvelles CGV.
   update46 · Le mur de paiement devient le parcours « Choisissez votre offre » (billing/Offres.tsx), affiché AVANT l'app
   pour tout compte sans abonnement actif ou en essai (les comptes plan_override ont toujours accès). */
const Full = ({ children }: { children: React.ReactNode }) => <div className="fixed inset-0 z-[80] overflow-y-auto bg-black/95 backdrop-blur-xl"><div className="mx-auto flex min-h-full w-full max-w-[480px] flex-col justify-center px-5 py-[max(24px,env(safe-area-inset-top))]">{children}</div></div>
const out = () => { if (confirm("Se déconnecter ?")) void supabase.auth.signOut() }

export default function Gate() {
  const { toast } = useC()
  const a = useAccount()
  const { p } = useProfile()
  const [err, setErr] = useState("")
  // update46 · retour de Stripe (page hébergée ou redirection 3-D Secure) : ?billing=ok&session_id=cs_…
  const [ret, setRet] = useState("")
  const [offers, setOffers] = useState(false)
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    if (!q.has("billing")) return
    const b = q.get("billing"), sid = q.get("session_id") || ""
    if (b === "ok" && /^cs_(test|live)_/.test(sid)) { setRet(sid); setOffers(true) }
    else if (b === "ok") { toast("Paiement enregistré · merci !"); setTimeout(() => void reloadAccount(), 2500); setTimeout(() => void reloadAccount(), 8000) }
    else if (b === "portal") void reloadAccount()
    q.delete("billing"); q.delete("session_id"); history.replaceState(null, "", location.pathname + (q.toString() ? `?${q}` : ""))
  }, [toast])
  const e = a?.entitlements
  const needsPlan = !!e && e.billingEnabled && !e.access && e.status !== "past_due"
  // Une fois ouvert, le parcours reste affiché jusqu'au clic sur « Entrer dans Akno » (même si l'accès s'ouvre entre-temps)
  useEffect(() => { if (needsPlan) setOffers(true) }, [needsPlan])
  // update47 · Proposer la création du code d'accès seulement quand plus rien ne bloque l'entrée dans l'app
  // (offre choisie, paiement OK, onboarding terminé, CGV acceptées), une seule fois par compte.
  const blocked = !a || !p || offers || needsPlan || (!!e && e.billingEnabled && !e.access) || p.onboarding_done === false
    || (p.cgv_version !== CGV_VERSION && !sessionStorage.getItem("akno-cgv-later"))
  useEffect(() => {
    if (blocked) return
    const uid: string = (window as any).__aknoUid || "" // eslint-disable-line @typescript-eslint/no-explicit-any
    if (uid && !hasLock(uid) && !localStorage.getItem(`akno-lock-asked:${uid}`)) dispatchEvent(new Event("akno-lock-setup"))
  }, [blocked])
  // update70 · app native : jamais de choix d'offre ni de paiement, écran neutre si le compte n'a pas d'accès
  if (billingHidden && (offers || needsPlan || (!!e && e.billingEnabled && !e.access))) return <NativeNoAccess />
  if (offers || needsPlan) return <Offres mode="gate" returnSession={ret || undefined} onDone={() => { setOffers(false); setRet("") }} />
  if (e && e.billingEnabled && !e.access) return <Full>
    <div className="text-[26px] font-semibold tracking-[-0.03em]">Paiement en échec</div>
    <p className={`mt-2 ${tx.cap}`}>Mettez à jour votre moyen de paiement pour continuer. Vos données sont conservées.</p>
    <div className="mt-6"><Btn primary className="w-full" onClick={async () => { const r = await api("/api/account", { action: "portal" }); if (r.ok && typeof r.url === "string") location.href = r.url; else setErr(r.error || "Portail indisponible.") }}>Mettre à jour le paiement</Btn></div>
    {err && <p className="mt-3 text-[13px] text-[#FF9B96]">{err}</p>}
    <button className="mt-6 flex items-center justify-center gap-2 text-[14px] text-white/50" onClick={out}><LogOut size={15} />Se déconnecter</button>
  </Full>
  // update49 · l'étape « Entreprise et mentions légales » est maintenant dans le parcours d'accueil (onboarding/Flow.tsx)
  if (p && p.cgv_version !== CGV_VERSION && p.onboarding_done !== false && !sessionStorage.getItem("akno-cgv-later")) return <Full>
    <div className="text-[22px] font-semibold tracking-[-0.03em]">Nouvelles conditions</div>
    <p className={`mt-2 ${tx.cap}`}>Akno a publié ses conditions générales de vente, sa politique de confidentialité et son accord de sous-traitance des données (RGPD).</p>
    <div className="mt-4 flex flex-wrap gap-3 text-[14px] underline underline-offset-2">{[["CGV", "/cgv"], ["Confidentialité", "/confidentialite"], ["DPA", "/dpa"]].map(([l, h]) => <a key={h} href={h} target="_blank" rel="noreferrer">{l}</a>)}</div>
    <Btn primary className="mt-6 w-full" onClick={async () => { const r = await api("/api/account", { action: "accept_cgv", version: CGV_VERSION }); if (!r.ok) { setErr(r.error || "Erreur"); return } dispatchEvent(new Event("akno-refresh")) }}>J'accepte</Btn>
    <button className="mt-3 text-[13.5px] text-white/45" onClick={() => { sessionStorage.setItem("akno-cgv-later", "1"); dispatchEvent(new Event("akno-refresh")) }}>Plus tard</button>
    {err && <p className="mt-3 text-[13px] text-[#FF9B96]">{err}</p>}
  </Full>
  return null
}
