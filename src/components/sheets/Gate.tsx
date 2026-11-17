import { useEffect, useState } from "react"
import { LogOut, Search } from "lucide-react"
import { Btn, F, inp, tx, useC } from "../ui"
import { api, reloadAccount, useAccount } from "../../lib/accountApi"
import { useProfile } from "../../lib/profile"
import { CGV_VERSION } from "../../lib/legal"
import { supabase } from "../../lib/supabase"
import Offres from "../billing/Offres"
import { hasLock } from "../../lib/lock"

/* update45 · Écrans plein écran : retour de paiement, mur de paiement (essai terminé), onboarding, nouvelles CGV.
   update46 · Le mur de paiement devient le parcours « Choisissez votre offre » (billing/Offres.tsx), affiché AVANT l'app
   pour tout compte sans abonnement actif ou en essai (les comptes plan_override ont toujours accès). */
const Full = ({ children }: { children: React.ReactNode }) => <div className="fixed inset-0 z-[80] overflow-y-auto bg-black/95 backdrop-blur-xl"><div className="mx-auto flex min-h-full w-full max-w-[480px] flex-col justify-center px-5 py-[max(24px,env(safe-area-inset-top))]">{children}</div></div>
const out = () => { if (confirm("Se déconnecter ?")) void supabase.auth.signOut() }

export default function Gate() {
  const { toast } = useC()
  const a = useAccount()
  const { p, save } = useProfile()
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
  if (offers || needsPlan) return <Offres mode="gate" returnSession={ret || undefined} onDone={() => { setOffers(false); setRet("") }} />
  if (e && e.billingEnabled && !e.access) return <Full>
    <div className="text-[26px] font-semibold tracking-[-0.03em]">Paiement en échec</div>
    <p className={`mt-2 ${tx.cap}`}>Mettez à jour votre moyen de paiement pour continuer. Vos données sont conservées.</p>
    <div className="mt-6"><Btn primary className="w-full" onClick={async () => { const r = await api("/api/account", { action: "portal" }); if (r.ok && typeof r.url === "string") location.href = r.url; else setErr(r.error || "Portail indisponible.") }}>Mettre à jour le paiement</Btn></div>
    {err && <p className="mt-3 text-[13px] text-[#FF9B96]">{err}</p>}
    <button className="mt-6 flex items-center justify-center gap-2 text-[14px] text-white/50" onClick={out}><LogOut size={15} />Se déconnecter</button>
  </Full>
  if (p && p.onboarding_done === false) return <Onboarding p={p} save={save} />
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

const METIERS = ["Électricien", "Plombier", "Chauffagiste", "Serrurier", "Peintre", "Menuisier", "Maçon", "Couvreur", "Carreleur", "Plaquiste", "Climaticien", "Multiservice", "Autre"]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Onboarding({ p, save }: { p: Record<string, any>; save: (x: Record<string, unknown>) => Promise<string> }) {
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false), [err, setErr] = useState("")
  const [f, setF] = useState({ siret: String(p.entreprise_siret || ""), nom: String(p.entreprise_nom || p.nom_entreprise || ""), metier: String(p.entreprise_metier || ""), tel: String(p.telephone || ""), adresse: String(p.entreprise_adresse || ""), cpv: String(p.entreprise_cp_ville || ""), tva: String(p.entreprise_tva || ""), ape: String(p.entreprise_ape || ""), ei: !!p.entreprise_ei, avis: String(p.avis_url || ""), assureur: String(p.assurance_nom || ""), police: String(p.assurance_numero || "") })
  const lookup = async () => {
    setBusy(true); setErr("")
    const r = await api("/api/account", { action: "siret_lookup", siret: f.siret })
    setBusy(false)
    if (!r.ok) { setErr(r.error || "Introuvable : remplissez à la main."); return }
    setF({ ...f, siret: String(r.siret || f.siret), nom: f.nom || String(r.nom || ""), adresse: String(r.adresse || f.adresse), cpv: String(r.cp_ville || f.cpv), tva: String(r.tva || f.tva), ape: String(r.ape || f.ape), ei: r.entrepreneur_individuel === true || f.ei })
  }
  const finish = async (skip = false) => {
    setBusy(true)
    const patch: Record<string, unknown> = { onboarding_done: true }
    if (!skip) Object.assign(patch, { entreprise_siret: f.siret.replace(/\s/g, "") || null, entreprise_nom: f.nom || null, nom_entreprise: f.nom || p.nom_entreprise || null, entreprise_metier: f.metier || null, telephone: f.tel || null, entreprise_adresse: f.adresse || null, entreprise_cp_ville: f.cpv || null, entreprise_tva: f.tva || null, entreprise_ape: f.ape || null, entreprise_ei: f.ei, avis_url: /^https:\/\//.test(f.avis.trim()) ? f.avis.trim() : null, assurance_nom: f.assureur || null, assurance_numero: f.police || null })
    const e = await save(patch)
    setBusy(false)
    if (e) setErr(e)
  }
  const v = (k: keyof typeof f) => ({ value: String(f[k]), onChange: (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setErr("") } })
  return <Full>
    <div className={tx.cap}>Étape {step + 1} sur 3</div>
    <div className="mt-1 text-[26px] font-semibold tracking-[-0.03em]">{["Votre entreprise", "Vos mentions légales", "Vos avis Google"][step]}</div>
    <p className={`mt-2 ${tx.cap}`}>{["Akno s'en sert pour vos devis, vos factures et votre réceptionniste.", "Obligatoires sur les devis et factures du bâtiment. Modifiables ensuite dans Paramètres › Entreprise.", "Après un chantier terminé, Akno pourra envoyer ce lien à vos clients."][step]}</p>
    <div className="mt-6 space-y-3">
      {step === 0 && <>
        <F l="SIRET"><div className="flex gap-2"><input className={inp} inputMode="numeric" placeholder="14 chiffres" {...v("siret")} /><Btn onClick={lookup} disabled={busy || f.siret.replace(/\s/g, "").length < 9}><Search size={16} />Remplir</Btn></div></F>
        <F l="Nom de l'entreprise"><input className={inp} {...v("nom")} /></F>
        <F l="Métier"><select className={inp} {...v("metier")}><option value="">Choisir…</option>{METIERS.map(m => <option key={m}>{m}</option>)}</select></F>
        <F l="Téléphone portable"><input className={inp} type="tel" {...v("tel")} /></F>
      </>}
      {step === 1 && <>
        <F l="Adresse"><input className={inp} {...v("adresse")} /></F>
        <F l="Code postal et ville"><input className={inp} {...v("cpv")} /></F>
        <div className="grid grid-cols-2 gap-2"><F l="N° TVA"><input className={inp} {...v("tva")} /></F><F l="Code APE"><input className={inp} {...v("ape")} /></F></div>
        <div className="grid grid-cols-2 gap-2"><F l="Assureur décennale"><input className={inp} {...v("assureur")} /></F><F l="N° de police"><input className={inp} {...v("police")} /></F></div>
      </>}
      {step === 2 && <F l="Lien de votre fiche d'avis Google (facultatif)"><input className={inp} placeholder="https://g.page/r/…/review" {...v("avis")} /></F>}
    </div>
    {err && <p className="mt-3 text-[13px] text-[#FF9B96]">{err}</p>}
    <div className="mt-6 flex gap-2">{step > 0 && <Btn className="flex-1" onClick={() => setStep(step - 1)}>Retour</Btn>}<Btn primary className="flex-1" disabled={busy || (step === 0 && !f.nom.trim())} onClick={() => step < 2 ? setStep(step + 1) : finish()}>{step < 2 ? "Continuer" : busy ? "…" : "Terminer"}</Btn></div>
    <button className="mt-4 text-[13.5px] text-white/45" onClick={() => finish(true)}>Passer pour l'instant</button>
  </Full>
}
