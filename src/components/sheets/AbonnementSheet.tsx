import { useState } from "react"
import { createPortal } from "react-dom"
import { Btn, Card, Chip, GREEN, AMBER, RED, GREY, Sheet, tx, useC } from "../ui"
import { api, openUpgrade, reloadAccount, rights, useAccount } from "../../lib/accountApi"
import Offres from "../billing/Offres"
import { Check } from "lucide-react"
import { IosPage } from "../nav/IosPage"
import { PushLayer, BackBtn } from "../m/MPage"

/* update45 · Abonnement : offres Stripe, essai 30 jours, portail client, usage du mois.
   update46 · Le choix d'offre ouvre le parcours plein écran billing/Offres.tsx (mensuel / annuel -20 %, paiement intégré). */
const fmt = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : ""

export default function AbonnementSheet({ close }: { close: () => void }) {
  const { toast } = useC()
  const a = useAccount()
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false), [offers, setOffers] = useState(false)
  const e = a?.entitlements
  const portal = async () => {
    setBusy(true); setErr("")
    const r = await api("/api/account", { action: "portal" })
    if (r.ok && typeof r.url === "string") { location.href = r.url; return }
    setBusy(false); setErr(r.error || "Portail indisponible.")
  }
  const label = !e ? "…" : e.status === "free" ? "Accès ouvert (paiement non activé)" : e.status === "trial" ? `Essai gratuit jusqu'au ${fmt(e.trialEndsAt)}` : e.status === "active" ? `${e.plan === "clients" ? "Clients + Bureau" : "Bureau"}${e.reception ? " + Réceptionniste" : ""}` : e.status === "past_due" ? "Paiement en échec" : e.status === "none" ? "Aucune offre" : "Essai terminé"
  const color = !e ? GREY : e.status === "active" || e.status === "free" ? GREEN : e.status === "trial" ? AMBER : RED
  // Choix d'offre : tout compte sans abonnement Stripe en cours (y compris un compte plan_override qui veut tester)
  const showPicker = !!e && e.billingEnabled && (e.status === "none" || e.status === "expired" || (!e.hasStripeCustomer && e.status !== "trial" && e.status !== "past_due"))
  return <Sheet title="Abonnement" sub="Offres, essai et facturation" c="#FFFFFF" onClose={close}>
    <Card className="p-4">
      <div className="flex items-center justify-between"><div className={tx.cap}>Offre actuelle</div><Chip c={color}>{label}</Chip></div>
      {e?.periodEnd && e.status === "active" && <div className={`mt-2 ${tx.cap}`}>{e.cancelAtPeriodEnd ? `Se termine le ${fmt(e.periodEnd)}` : `Prochain renouvellement le ${fmt(e.periodEnd)}`}</div>}
      {a && <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[["Brouillons IA", a.usage.devis_drafts, e?.quotas.devis_drafts], ["Minutes récept.", a.usage.voice_minutes, e?.quotas.voice_minutes], ["SMS", a.usage.sms, e?.quotas.sms]].map(([l, u, q]) => <div key={String(l)} className="rounded-[14px] bg-white/[.04] px-2 py-3"><div className="text-[17px] font-semibold">{String(u)}{q ? <span className="text-[12px] font-normal text-white/45"> / {String(q)}</span> : null}</div><div className="mt-0.5 text-[11.5px] text-white/50">{String(l)} ce mois</div></div>)}
      </div>}
    </Card>
    {e?.hasStripeCustomer && <Btn className="mt-4 w-full" disabled={busy} onClick={portal}>{busy ? "Ouverture…" : "Gérer mon abonnement (carte, factures, résiliation)"}</Btn>}
    {/* update48 · montée en gamme directe sur l'abonnement en cours (même pendant l'essai) */}
    {rights(a).canUpgrade && (!e?.reception || e?.plan === "bureau") && <div className="mt-4 flex flex-col gap-2">
      {!e?.reception && <Btn primary className="w-full" onClick={() => openUpgrade("reception")}>Ajouter la Réceptionniste IA</Btn>}
      {e?.plan === "bureau" && <Btn className="w-full" onClick={() => openUpgrade("clients")}>Passer à l'offre Clients</Btn>}
    </div>}
    {showPicker && <div className="mt-5"><div className={`mb-3 px-1 ${tx.cap}`}>{e?.trialEligible !== false ? `${a?.billing.trial_days || 30} jours d'essai gratuit · 0 € aujourd'hui` : "Choisir une offre"}{a?.billing.annual ? " · -20 % en annuel" : ""}</div><Btn primary className="w-full" onClick={() => setOffers(true)}>Voir les offres</Btn></div>}
    {offers && createPortal(<Offres mode="sheet" onClose={() => setOffers(false)} onDone={() => { setOffers(false); close() }} />, document.body)}
    {err && <p className="mt-3 px-1 text-[13px] text-[#FF9B96]">{err}</p>}
    <button className="mt-4 w-full text-center text-[13px] text-white/45" onClick={() => { void reloadAccount(); toast("Statut actualisé") }}>Actualiser</button>
  </Sheet>
}

/* Refonte iOS · passe 2 · page Abonnement mobile (maquette 08-Reglages/reglages-abonnement) :
   page poussée noire, offre actuelle sous le titre, essai, cartes d'offres (offres réelles Akno : Bureau, Clients + Bureau,
   option Réceptionniste IA — les montants restent ceux de Stripe, affichés dans le parcours Offres), consommation du mois,
   portail Stripe. Même logique que la feuille : aucun branchement modifié. */
export function AbonnementPage({ close }: { close: () => void }) {
  const { toast } = useC()
  const a = useAccount()
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false), [offers, setOffers] = useState(false)
  const e = a?.entitlements
  const portal = async () => {
    setBusy(true); setErr("")
    const r = await api("/api/account", { action: "portal" })
    if (r.ok && typeof r.url === "string") { location.href = r.url; return }
    setBusy(false); setErr(r.error || "Portail indisponible.")
  }
  const cur = !e ? "…" : e.status === "free" ? "Accès ouvert" : e.status === "trial" ? `Essai jusqu'au ${fmt(e.trialEndsAt)}` : e.status === "active" ? `${e.plan === "clients" ? "Clients + Bureau" : "Bureau"}${e.reception ? " + Réceptionniste" : ""}` : e.status === "past_due" ? "Paiement en échec" : e.status === "none" ? "Aucune offre" : "Essai terminé"
  const can = rights(a).canUpgrade
  const showPicker = !!e && e.billingEnabled && (e.status === "none" || e.status === "expired" || (!e.hasStripeCustomer && e.status !== "trial" && e.status !== "past_due"))
  const pick = () => showPicker ? setOffers(true) : undefined
  const plans: { k: string; t: string; d: string[]; on: boolean; cta?: [string, () => void] }[] = [
    { k: "bureau", t: "Bureau", d: ["Devis, factures et relances", "Agenda, chantiers, équipe"], on: e?.plan === "bureau", cta: showPicker ? ["Choisir", pick] : undefined },
    { k: "clients", t: "Clients + Bureau", d: ["Tout Bureau", "Fichier clients et suivi complet"], on: e?.plan === "clients", cta: showPicker ? ["Choisir", pick] : can && e?.plan === "bureau" ? ["Passer à Clients", () => openUpgrade("clients")] : undefined },
    { k: "reception", t: "Réceptionniste IA", d: ["Option · décroche, qualifie, prend RDV", e?.quotas.voice_minutes ? `${e.quotas.voice_minutes} min d’appels par mois` : "Appels illimités selon votre offre"], on: !!e?.reception, cta: !e?.reception && (can || showPicker) ? ["Ajouter", () => showPicker ? setOffers(true) : openUpgrade("reception")] : undefined },
  ]
  const fin = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x)
  const mo = new Date().toLocaleDateString("fr-FR", { month: "long" })
  const g = (l: string, u: unknown, q: unknown) => <div className="min-w-0"><div className="text-[15px] text-[#3C3C43]">{l}</div><div className="mt-0.5 text-[22px] font-semibold leading-7 text-[#000]">{fin(u) ? Math.round(u) : 0}{fin(q) && q > 0 && <span className="text-[15px] font-normal text-[#6E6E73]"> / {q}</span>}</div><div className="mt-2 h-1 overflow-hidden rounded-full bg-[rgba(120,120,128,.2)]"><div className="h-full rounded-full bg-[#000]" style={{ width: `${fin(u) && fin(q) && q > 0 ? Math.min(100, (u / q) * 100) : 0}%` }} /></div></div>
  return <PushLayer label="Abonnement" onClose={close}>
    <IosPage title="Abonnement" lead={<BackBtn dark on={close} />} hero={<div className="w-full text-left text-[15px] text-[rgba(235,235,245,.6)]">Offre actuelle · <b className="font-semibold text-[#fff]">{cur}</b></div>} heroPt={4} sheetTop={26}>
      <div className="pb-4 pt-4">
        {(e?.status === "trial" || (showPicker && e?.trialEligible !== false)) && <div className="flex items-center gap-3 px-1 pb-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#000] text-[#fff]"><Check size={16} strokeWidth={2.6} /></span><span><span className="block text-[17px] font-semibold text-[#000]">{e?.status === "trial" ? `Essai gratuit jusqu'au ${fmt(e.trialEndsAt)}` : `${a?.billing.trial_days || 30} jours d’essai sans engagement`}</span><span className="block text-[15px] text-[#6E6E73]">Résiliable à tout moment, sans frais.</span></span></div>}
        <h2 className="px-5 pb-2.5 pt-5 text-[13px] font-semibold uppercase tracking-[.03em] text-[#6E6E73]">Mon abonnement</h2>
        <div className="flex flex-col gap-2.5">{plans.map(p => <div key={p.k} data-plan={p.k} className={`flex items-end gap-3 rounded-[20px] px-4 py-3.5 ${p.on ? "bg-[#fff] ring-[1.5px] ring-[#000]" : "bg-[#F2F2F7]"}`}>
          <div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-[20px] font-semibold text-[#000]">{p.t}{p.on && <span className="flex items-center gap-1 text-[13px] font-medium text-[#007AFF]"><span className="h-1.5 w-1.5 rounded-full bg-[#007AFF]" />Actuel</span>}</div>{p.d.map(x => <div key={x} className="text-[15px] leading-5 text-[#6E6E73]">{x}</div>)}</div>
          {p.cta && <button type="button" onClick={p.cta[1]} className="h-10 shrink-0 rounded-full bg-[#fff] px-4 text-[15px] font-semibold text-[#000] shadow-[0_1px_3px_rgba(0,0,0,.08)]">{p.cta[0]}</button>}
        </div>)}</div>
        {a && <><h2 className="px-5 pb-2.5 pt-6 text-[13px] font-semibold uppercase tracking-[.03em] text-[#6E6E73]">Consommation de {mo}</h2>
          <div className="rounded-[20px] bg-[#F2F2F7] p-4"><div className="grid grid-cols-3 gap-4">{g("Devis IA", a.usage.devis_drafts, e?.quotas.devis_drafts)}{g("SMS", a.usage.sms, e?.quotas.sms)}{g("Appels (min)", a.usage.voice_minutes, e?.quotas.voice_minutes)}</div>
            {e?.periodEnd && e.status === "active" && <div className="mt-3.5 text-[15px] text-[#6E6E73]">{e.cancelAtPeriodEnd ? `Se termine le ${fmt(e.periodEnd)}` : `Renouvellement le ${fmt(e.periodEnd)}`}</div>}</div></>}
        {e?.hasStripeCustomer && <button type="button" disabled={busy} onClick={portal} className="mt-5 h-[52px] w-full rounded-full bg-[#000] text-[17px] font-semibold text-[#fff] disabled:opacity-50">{busy ? "Ouverture…" : "Gérer : carte, factures, résiliation"}</button>}
        {err && <p className="mt-3 px-1 text-[13px] text-[#E0221B]">{err}</p>}
        <button type="button" className="mt-4 w-full text-center text-[15px] text-[#6E6E73]" onClick={() => { void reloadAccount(); toast("Statut actualisé") }}>Actualiser</button>
      </div>
    </IosPage>
    {offers && createPortal(<Offres mode="sheet" onClose={() => setOffers(false)} onDone={() => { setOffers(false); close() }} />, document.body)}
  </PushLayer>
}
