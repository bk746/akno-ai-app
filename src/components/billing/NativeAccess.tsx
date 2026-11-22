/* update70 · App native (iOS / Android) : aucun achat, prix ni lien de paiement (App Store 3.1.1 / 3.1.3, Google Play Payments).
   Ces écrans neutres remplacent le choix d'offre, l'ajout d'option et la page « Réceptionniste non incluse ».
   L'accès des testeurs est ouvert côté serveur (variable AKNO_BETA_ACCESS ou plan_override). */
import type { ReactNode } from "react"
import { LogOut, ShieldCheck } from "lucide-react"
import { supabase } from "../../lib/supabase"
import ModalSheet from "../sheet/ModalSheet"
import { A, Blob, Btn } from "../ui"
import { reloadAccount } from "../../lib/accountApi"

const supportEmail = () => String(import.meta.env.VITE_SUPPORT_EMAIL || import.meta.env.VITE_LEGAL_EMAIL || "")

/** Plein écran : compte sans accès actif dans l'app native. */
export function NativeNoAccess() {
  const mail = supportEmail()
  return <div data-testid="native-no-access" className="fixed inset-0 z-[80] overflow-y-auto bg-black">
    <div className="mx-auto flex min-h-full w-full max-w-[440px] flex-col justify-center px-6 py-[max(32px,env(safe-area-inset-top))] text-center">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/[.07]"><ShieldCheck size={28} strokeWidth={1.6} /></span>
      <h1 className="mt-6 text-[26px] font-semibold tracking-[-0.03em]">Accès non activé</h1>
      <p className="mt-3 text-[15px] leading-[1.55] text-white/55">Votre compte est bien créé, mais l'accès à Akno n'est pas encore activé pour cette adresse e-mail.</p>
      {mail && <p className="mt-2 text-[14px] leading-[1.5] text-white/45">Une question ? Écrivez-nous à {mail}.</p>}
      <Btn primary className="mt-8 w-full" onClick={() => void reloadAccount()}>Vérifier à nouveau</Btn>
      <button type="button" className="mt-5 flex items-center justify-center gap-2 text-[14px] text-white/50" onClick={() => { if (confirm("Se déconnecter ?")) void supabase.auth.signOut() }}><LogOut size={15} />Se déconnecter</button>
    </div>
  </div>
}

/** Feuille : fonction non incluse dans l'accès actuel (remplace « Ajouter l'option » / « Passer en Clients »). À placer dans <AnimatePresence>. */
export function NativeNotIncluded({ what, close }: { what: string; close: () => void }) {
  return <ModalSheet label={what} onClose={close} z={85} className="bg-[#121214] border-t border-white/[.08]" deskClass="max-w-[440px]">
    <div data-testid="native-not-included" className="px-5 pb-[max(calc(var(--sab)+12px),24px)] pt-5 text-center">
      <div className="text-[19px] font-semibold tracking-[-0.02em]">{what}</div>
      <p className="mt-2 text-[15px] leading-[1.55] text-white/60">Cette fonction n'est pas activée sur votre compte.</p>
      <Btn className="mt-6 w-full" onClick={close}>Fermer</Btn>
    </div>
  </ModalSheet>
}

/** Page Réception quand l'option n'est pas activée (sans prix ni bouton d'achat). */
export function NativeReceptionOff({ desk, calls, onCalls, children }: { desk: boolean; calls: number; onCalls: () => void; children?: ReactNode }) {
  return <div data-testid="native-reception-off" className={`flex h-full flex-col items-center justify-center overflow-y-auto text-center ${desk ? "px-8" : "px-6"}`}>
    <Blob c={A.rec.c} s={56} />
    <h2 className="mt-6 text-[24px] font-semibold tracking-[-0.03em]">Réceptionniste IA</h2>
    <p className="mt-2 max-w-[340px] text-[15px] leading-[1.55] text-white/55">La réceptionniste n'est pas activée sur votre compte.</p>
    {calls > 0 && <button type="button" onClick={onCalls} className="mt-5 text-[13.5px] text-white/50 underline underline-offset-2">Voir vos {calls} appel{calls > 1 ? "s" : ""} enregistré{calls > 1 ? "s" : ""}</button>}
    {children}
  </div>
}
