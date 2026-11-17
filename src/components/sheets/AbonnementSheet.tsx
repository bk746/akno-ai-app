import { useState } from "react"
import { Check } from "lucide-react"
import { Btn, Card, Chip, GREEN, AMBER, RED, GREY, Sheet, Tg, tx, useC } from "../ui"
import { api, reloadAccount, useAccount, type Plan } from "../../lib/accountApi"

/* update45 · Abonnement : offres Stripe, essai 30 jours, portail client, usage du mois. */
export const PLANS: { id: Plan; name: string; price: number; items: string[] }[] = [
  { id: "bureau", name: "Akno Bureau", price: 89, items: ["Devis IA conformes + envoi et signature en ligne", "Relances de devis automatiques", "Factures, acomptes, avoirs + relances d'impayés", "Dossier de conformité (Urssaf, Kbis, décennale)", "Agenda + rappels SMS"] },
  { id: "clients", name: "Akno Clients + Bureau", price: 199, items: ["Tout Akno Bureau", "Demandes d'avis Google automatiques", "Formulaire du site → demandes dans Akno", "Rapport mensuel par e-mail", "Quotas SMS et devis plus élevés"] },
]
const fmt = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : ""

export function PlanPicker({ onError }: { onError: (e: string) => void }) {
  const a = useAccount()
  const [reception, setReception] = useState(true), [busy, setBusy] = useState<Plan | null>(null)
  const go = async (plan: Plan) => {
    setBusy(plan); onError("")
    const r = await api("/api/account", { action: "checkout", plan, reception })
    if (r.ok && typeof r.url === "string") { location.href = r.url; return }
    setBusy(null); onError(r.error || "Paiement indisponible.")
  }
  const enabled = !!a?.billing.enabled
  return <div className="space-y-3">
    {PLANS.map(pl => <Card key={pl.id} className="p-4">
      <div className="flex items-baseline justify-between"><div className={tx.title}>{pl.name}</div><div className="text-[17px] font-semibold">{pl.price} € <span className="text-[13px] font-normal text-white/50">HT / mois</span></div></div>
      <ul className="mt-3 space-y-1.5 text-[13.5px] text-white/70">{pl.items.map(x => <li key={x} className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-[#30D158]" />{x}</li>)}</ul>
      <Btn primary className="mt-4 w-full" disabled={!enabled || !!busy} onClick={() => go(pl.id)}>{busy === pl.id ? "Ouverture du paiement…" : `Choisir ${pl.name.replace("Akno ", "")}`}</Btn>
    </Card>)}
    <Card className="flex items-center gap-3 p-4"><div className="min-w-0 flex-1"><div className="text-[15px] font-medium">Option Réceptionniste IA · +50 € HT / mois</div><div className={tx.cap}>Décroche, qualifie, prend RDV et prépare le devis (100 min / mois incluses)</div></div><Tg on={reception} onClick={() => setReception(!reception)} label="Option Réceptionniste" /></Card>
    {!enabled && <p className="px-1 text-[13px] text-white/50">Le paiement en ligne n'est pas encore activé sur ce serveur. L'accès reste ouvert en attendant.</p>}
  </div>
}

export default function AbonnementSheet({ close }: { close: () => void }) {
  const { toast } = useC()
  const a = useAccount()
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false)
  const e = a?.entitlements
  const portal = async () => {
    setBusy(true); setErr("")
    const r = await api("/api/account", { action: "portal" })
    if (r.ok && typeof r.url === "string") { location.href = r.url; return }
    setBusy(false); setErr(r.error || "Portail indisponible.")
  }
  const label = !e ? "…" : e.status === "free" ? "Accès ouvert (paiement non activé)" : e.status === "trial" ? `Essai gratuit jusqu'au ${fmt(e.trialEndsAt)}` : e.status === "active" ? `${e.plan === "clients" ? "Clients + Bureau" : "Bureau"}${e.reception ? " + Réceptionniste" : ""}` : e.status === "past_due" ? "Paiement en échec" : "Essai terminé"
  const color = !e ? GREY : e.status === "active" || e.status === "free" ? GREEN : e.status === "trial" ? AMBER : RED
  const showPicker = !!e && e.billingEnabled && (e.status === "trial" || e.status === "expired" || !e.hasStripeCustomer)
  return <Sheet title="Abonnement" sub="Offres, essai et facturation" c="#FFFFFF" onClose={close}>
    <Card className="p-4">
      <div className="flex items-center justify-between"><div className={tx.cap}>Offre actuelle</div><Chip c={color}>{label}</Chip></div>
      {e?.periodEnd && e.status === "active" && <div className={`mt-2 ${tx.cap}`}>{e.cancelAtPeriodEnd ? `Se termine le ${fmt(e.periodEnd)}` : `Prochain renouvellement le ${fmt(e.periodEnd)}`}</div>}
      {a && <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[["Brouillons IA", a.usage.devis_drafts, e?.quotas.devis_drafts], ["Minutes récept.", a.usage.voice_minutes, e?.quotas.voice_minutes], ["SMS", a.usage.sms, e?.quotas.sms]].map(([l, u, q]) => <div key={String(l)} className="rounded-[14px] bg-white/[.04] px-2 py-3"><div className="text-[17px] font-semibold">{String(u)}{q ? <span className="text-[12px] font-normal text-white/45"> / {String(q)}</span> : null}</div><div className="mt-0.5 text-[11.5px] text-white/50">{String(l)} ce mois</div></div>)}
      </div>}
    </Card>
    {e?.hasStripeCustomer && <Btn className="mt-4 w-full" disabled={busy} onClick={portal}>{busy ? "Ouverture…" : "Gérer mon abonnement (carte, factures, résiliation)"}</Btn>}
    {showPicker && <div className="mt-5"><div className={`mb-3 px-1 ${tx.cap}`}>Choisir une offre · {a?.billing.trial_days || 30} jours d'essai sans engagement</div><PlanPicker onError={setErr} /></div>}
    {err && <p className="mt-3 px-1 text-[13px] text-[#FF9B96]">{err}</p>}
    <button className="mt-4 w-full text-center text-[13px] text-white/45" onClick={() => { void reloadAccount(); toast("Statut actualisé") }}>Actualiser</button>
  </Sheet>
}
