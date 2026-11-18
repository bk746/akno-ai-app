/* update46 · Paiement intégré dans l'écran Akno : Stripe Checkout Sessions + Elements (ui_mode "elements").
   Les champs de paiement (Apple Pay, Google Pay, PayPal, carte) / adresse / TVA sont des iframes Stripe (Akno ne voit jamais le numéro de carte),
   stylés dans la DA Akno via l'API Appearance (fond carbone, Geist, rayons 12 px, focus blanc).
   Chargé à la demande (lazy) pour ne pas alourdir l'app. */
import { useState, type FormEvent, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import { loadStripe, type Appearance } from "@stripe/stripe-js"
import { BillingAddressElement, CheckoutElementsProvider, PaymentElement, TaxIdElement, useCheckoutElements } from "@stripe/react-stripe-js/checkout"
import { AlertCircle, ArrowRight, Check, Lock, Tag } from "lucide-react"
import { EASE, Spinner } from "../auth/fields"

let stripePromise: ReturnType<typeof loadStripe> | null = null
const getStripe = (pk: string) => (stripePromise ??= loadStripe(pk, { locale: "fr" }))

const appearance: Appearance = {
  theme: "night",
  labels: "above",
  variables: {
    colorPrimary: "#FFFFFF",
    colorBackground: "#0E0E10",
    colorText: "#FFFFFF",
    colorTextSecondary: "#8E8E93",
    colorTextPlaceholder: "#5C5C61",
    colorDanger: "#FF6B61",
    colorSuccess: "#30D158",
    colorIcon: "#8E8E93",
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif",
    // update53 : 16 px sur écran tactile, sinon iOS zoome dans le champ carte
    fontSizeBase: typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches ? "16px" : "15px",
    fontWeightMedium: "500",
    borderRadius: "12px",
    spacingUnit: "4px",
    gridRowSpacing: "18px",
    gridColumnSpacing: "12px",
  },
  rules: {
    ".Label": { color: "rgba(255,255,255,.7)", fontSize: "13px", fontWeight: "500", marginBottom: "8px" },
    ".Input": { backgroundColor: "#0E0E10", border: "1px solid rgba(255,255,255,.09)", boxShadow: "none", padding: "13px 16px", transition: "border-color .2s, box-shadow .2s, background-color .2s" },
    ".Input:hover": { border: "1px solid rgba(255,255,255,.16)" },
    ".Input:focus": { backgroundColor: "#121214", border: "1px solid rgba(255,255,255,.45)", boxShadow: "0 0 0 4px rgba(255,255,255,.07)" },
    ".Input--invalid": { border: "1px solid rgba(255,69,58,.7)", boxShadow: "none" },
    ".Error": { fontSize: "12.5px", color: "#FF6B61" },
    ".Tab": { backgroundColor: "#0E0E10", border: "1px solid rgba(255,255,255,.09)", boxShadow: "none" },
    ".Tab--selected": { backgroundColor: "#151517", border: "1px solid rgba(255,255,255,.6)", boxShadow: "0 0 0 4px rgba(255,255,255,.05)" },
    // update55 · onglets Apple Pay / Google Pay / PayPal / Carte : sélection sombre façon Akno (pas de fond blanc)
    ".Tab:hover": { border: "1px solid rgba(255,255,255,.16)" },
    ".TabLabel": { color: "rgba(255,255,255,.6)" },
    ".TabLabel--selected": { color: "#FFFFFF" },
    ".TabIcon": { fill: "rgba(255,255,255,.6)" },
    ".TabIcon--selected": { fill: "#FFFFFF" },
    ".CheckboxInput": { backgroundColor: "#0E0E10", border: "1px solid rgba(255,255,255,.25)" },
    ".CheckboxLabel": { color: "rgba(255,255,255,.7)", fontSize: "13.5px" },
    ".TermsText": { color: "rgba(255,255,255,.4)", fontSize: "12px" },
  },
}
const fonts = [{ cssSrc: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap" }]

export default function StripePane({ pk, clientSecret, onComplete, cta }: { pk: string; clientSecret: string; onComplete: () => void; cta: string }) {
  return <CheckoutElementsProvider key={clientSecret} stripe={getStripe(pk)} options={{ clientSecret, elementsOptions: { appearance, fonts, loader: "never" } }}>
    <PayForm onComplete={onComplete} cta={cta} />
  </CheckoutElementsProvider>
}

const Block = ({ t, children, aside }: { t: string; children: ReactNode; aside?: ReactNode }) => <section className="border-t border-white/[.06] px-5 py-6 first:border-t-0 sm:px-7">
  <div className="mb-4 flex items-baseline justify-between gap-3"><h2 className="text-[15px] font-semibold tracking-[-0.01em]">{t}</h2>{aside}</div>
  {children}
</section>

function PayForm({ onComplete, cta }: { onComplete: () => void; cta: string }) {
  const r = useCheckoutElements()
  const [busy, setBusy] = useState(false), [err, setErr] = useState("")
  const [ready, setReady] = useState(false)
  const [promoOpen, setPromoOpen] = useState(false), [code, setCode] = useState(""), [promoBusy, setPromoBusy] = useState(false), [promoMsg, setPromoMsg] = useState<{ ok: boolean; t: string } | null>(null)

  if (r.type === "error") return <div className="flex items-start gap-3 p-6 text-[14px] text-[#FFB4AE]"><AlertCircle size={18} className="mt-0.5 shrink-0 text-[#FF6B61]" />Le paiement n'a pas pu se charger ({r.error.message}). Rechargez la page ou réessayez dans un instant.</div>
  const checkout = r.type === "success" ? r.checkout : null
  const applied = checkout?.discountAmounts?.[0]

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!checkout || busy) return
    setBusy(true); setErr("")
    const res = await checkout.confirm({ redirect: "if_required" })
    // PayPal : Stripe redirige vers PayPal puis revient sur return_url (?billing=ok&session_id=…), repris par Flow / Gate.
    if (res.type === "error") { setErr(res.error.message || "Paiement refusé. Vérifiez votre moyen de paiement."); setBusy(false); return }
    onComplete()
  }
  const applyPromo = async () => {
    if (!checkout || !code.trim()) return
    setPromoBusy(true); setPromoMsg(null)
    const res = await checkout.applyPromotionCode(code.trim())
    setPromoBusy(false)
    if (res.type === "error") setPromoMsg({ ok: false, t: res.error.message || "Code invalide." })
    else { setPromoMsg({ ok: true, t: "Code appliqué." }); setCode("") }
  }

  return <form onSubmit={submit} noValidate className={`relative min-h-[520px] bg-[#0B0B0D] transition-opacity duration-500 ${ready ? "opacity-100" : "opacity-0"}`}>
    <Block t="Moyen de paiement" aside={<span className="flex items-center gap-1.5 text-[12px] text-white/40"><Lock size={12} strokeWidth={2.2} />Chiffré par Stripe</span>}>
      <PaymentElement onReady={() => setReady(true)} onLoadError={e => { console.error("[Akno paiement]", e.error); setReady(true); setErr(e.error?.message || "Le formulaire de paiement n'a pas pu se charger. Rechargez la page.") }} options={{ layout: "tabs", paymentMethodOrder: ["apple_pay", "google_pay", "paypal", "card"], wallets: { applePay: "auto", googlePay: "auto", link: "never" }, fields: { billingDetails: { address: "never" } }, terms: { card: "auto", paypal: "auto", applePay: "auto", googlePay: "auto" } }} />
    </Block>
    <Block t="Adresse de facturation"><BillingAddressElement /></Block>
    <Block t="Entreprise" aside={<span className="text-[12px] text-white/40">facultatif</span>}><TaxIdElement options={{ visibility: "always" }} /></Block>
    <Block t="Code promo" aside={!promoOpen && !applied ? <button type="button" onClick={() => setPromoOpen(true)} className="flex items-center gap-1.5 text-[13px] font-medium text-white/60 transition-colors hover:text-white"><Tag size={13} />Ajouter</button> : undefined}>
      {applied ? <div className="flex items-center justify-between gap-3 text-[13.5px]"><span className="flex items-center gap-2 text-[#30D158]"><Check size={15} strokeWidth={2.4} />{applied.promotionCode || applied.displayName}</span><button type="button" onClick={() => void checkout?.removePromotionCode()} className="text-white/50 hover:text-white">Retirer</button></div>
        : <AnimatePresence initial={false}>{promoOpen ? <motion.div key="p" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: .25, ease: EASE }} className="overflow-hidden">
          <div className="flex gap-2"><input value={code} onChange={e => { setCode(e.target.value.toUpperCase()); setPromoMsg(null) }} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void applyPromo() } }} placeholder="AKNO2027" aria-label="Code promo" autoCapitalize="characters" spellCheck={false}
            className="h-12 min-w-0 flex-1 rounded-[12px] border border-white/[.09] bg-[#0E0E10] px-4 font-mono text-[14.5px] tracking-[.04em] text-white outline-none transition-[border-color,box-shadow] placeholder:text-white/25 hover:border-white/[.16] focus:border-white/45 focus:shadow-[0_0_0_4px_rgba(255,255,255,.07)]" />
            <button type="button" onClick={applyPromo} disabled={promoBusy || !code.trim()} className="h-12 shrink-0 rounded-full border border-white/[.12] px-5 text-[14px] font-medium text-white/90 transition-colors hover:border-white/25 disabled:opacity-40">{promoBusy ? <Spinner /> : "Appliquer"}</button></div>
          {promoMsg && <p className={`mt-2 text-[12.5px] ${promoMsg.ok ? "text-[#30D158]" : "text-[#FF6B61]"}`}>{promoMsg.t}</p>}
        </motion.div> : <p className="text-[13px] text-white/40">Vous avez un code ? Ajoutez-le ici.</p>}</AnimatePresence>}
    </Block>
    <div className="border-t border-white/[.06] px-5 pb-6 pt-5 sm:px-7">
      <div role="alert" aria-live="assertive"><AnimatePresence initial={false}>{err && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
        <div className="mb-4 flex items-start gap-3 rounded-[12px] border border-[#FF453A]/25 bg-[#FF453A]/[.08] px-3.5 py-3 text-[13.5px] leading-[1.5] text-[#FFB4AE]"><AlertCircle size={17} className="mt-[1px] shrink-0 text-[#FF6B61]" />{err}</div>
      </motion.div>}</AnimatePresence></div>
      <motion.button type="submit" disabled={!checkout || busy} aria-busy={busy || undefined} whileTap={{ scale: .985 }}
        className="group/b flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-[15.5px] font-semibold tracking-[-0.01em] text-black shadow-[0_1px_0_rgba(255,255,255,.4)_inset,0_10px_30px_-12px_rgba(255,255,255,.35)] transition-[background-color,opacity] duration-200 hover:bg-[#F2F2F2] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-white disabled:cursor-progress disabled:opacity-70">
        {busy ? <><Spinner />Vérification…</> : <>{cta}<ArrowRight size={17} strokeWidth={2} className="transition-transform duration-200 group-hover/b:translate-x-0.5" /></>}
      </motion.button>
    </div>
  </form>
}
