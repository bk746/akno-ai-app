import { useState } from "react"
import { createPortal } from "react-dom"
import { Btn, Card, Chip, GREEN, AMBER, RED, GREY, Sheet, tx, useC } from "../ui"
import { api, openUpgrade, reloadAccount, rights, useAccount } from "../../lib/accountApi"
import Offres from "../billing/Offres"

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
