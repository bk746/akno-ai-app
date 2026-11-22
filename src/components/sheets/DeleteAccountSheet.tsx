/* update70 · Suppression du compte depuis Réglages (App Store 5.1.1(v), Google Play « Account deletion »).
   Confirmation forte : liste de ce qui est supprimé / conservé, case à cocher, saisie du mot SUPPRIMER.
   La suppression est faite côté serveur (/api/account, action delete_account, clé service). */
import { useState, type FormEvent } from "react"
import { AlertTriangle } from "lucide-react"
import { F, Sheet, inp } from "../ui"
import { api } from "../../lib/accountApi"
import { supabase } from "../../lib/supabase"
import { billingHidden } from "../../lib/native"

export const DELETE_WORD = "SUPPRIMER"

function clearLocal() {
  try { for (const k of Object.keys(localStorage)) if (k.startsWith("akno")) localStorage.removeItem(k) } catch { /* ignore */ }
  try { sessionStorage.clear() } catch { /* ignore */ }
}

export default function DeleteAccountSheet({ close }: { close: () => void }) {
  const [word, setWord] = useState(""), [ack, setAck] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState("")
  const [done, setDone] = useState<"" | "deleted" | "retained">("")
  const ok = ack && word.trim().toUpperCase() === DELETE_WORD && !busy
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (!ok) return
    setBusy(true); setErr("")
    const r = await api("/api/account", { action: "delete_account", confirm: DELETE_WORD })
    setBusy(false)
    if (!r.ok) { setErr(r.error || "La suppression a échoué. Réessayez."); return }
    setDone(r.mode === "retained" ? "retained" : "deleted")
    clearLocal()
    setTimeout(() => { void supabase.auth.signOut({ scope: "local" }).finally(() => location.replace("/reception")) }, 3500)
  }
  if (done) return <Sheet title="Compte supprimé" c="#FFFFFF" onClose={() => location.replace("/reception")}>
    <div data-testid="delete-done" className="space-y-3 text-[15px] leading-[1.55] text-white/70">
      <p>Votre compte Akno et vos données ont été supprimés.</p>
      {done === "retained" && <p className="text-white/55">Vos factures émises et devis signés sont conservés de façon sécurisée pendant la durée légale (10 ans), sans accès possible au compte.</p>}
      <p className="text-white/45">Vous allez être déconnecté.</p>
    </div>
  </Sheet>
  return <Sheet title="Supprimer mon compte" sub="Action définitive" c="#FF453A" onClose={busy ? () => {} : close}>
    <form data-testid="delete-account" onSubmit={submit} className="space-y-4">
      <div className="flex gap-3 rounded-[18px] bg-[#FF453A]/10 p-4 text-[14px] leading-[1.5] text-white/80">
        <AlertTriangle size={20} className="mt-0.5 shrink-0 text-[#FF6B6B]" />
        <div>
          <p className="font-medium text-white">Ceci supprime définitivement :</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-white/70">
            <li>votre compte et vos réglages ;</li>
            <li>vos appels, enregistrements et transcriptions ;</li>
            <li>vos clients, rendez-vous, relances, chantiers et équipe ;</li>
            <li>vos devis non signés et brouillons de factures ;</li>
            <li>votre numéro Akno et votre réceptionniste{billingHidden ? "" : ", ainsi que votre abonnement (résilié immédiatement, sans remboursement de la période en cours)"}.</li>
          </ul>
          <p className="mt-2 text-white/55">Les factures émises et les devis signés sont conservés 10 ans (obligation légale), sans accès au compte.</p>
        </div>
      </div>
      <label className="flex cursor-pointer items-start gap-3 px-1 text-[14px] leading-[1.45] text-white/75">
        <input data-testid="delete-ack" type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#FF453A]" />
        J'ai compris que cette action est définitive et que mes données ne pourront pas être récupérées.
      </label>
      <F l={`Tapez ${DELETE_WORD} pour confirmer`}><input data-testid="delete-word" className={inp} value={word} onChange={e => { setWord(e.target.value); setErr("") }} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder={DELETE_WORD} /></F>
      {err && <p role="alert" className="px-1 text-[13px] text-[#FF453A]">{err}</p>}
      <button data-testid="delete-submit" disabled={!ok} className="h-12 w-full rounded-full bg-[#FF453A] text-[15px] font-semibold text-white disabled:opacity-35">{busy ? "Suppression…" : "Supprimer définitivement"}</button>
      <button type="button" onClick={close} disabled={busy} className="h-11 w-full text-[14.5px] text-white/55">Annuler</button>
    </form>
  </Sheet>
}
