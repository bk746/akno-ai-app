/* update74 · Réglages rapides de la réceptionniste (voix, IA on/off, mode de décrochage).
   update75 · Renvoi depuis le portable de l'artisan (codes GSM, confirmation, copie si iOS bloque tel:).
   Même source : artisans.reception_config, via useProfile().save. */
import { useState } from "react"
import { AudioLines, Check, Clock, Copy, Phone } from "lucide-react"
import { A, Btn, Card, Chev, Chip, GREY, Row, Sheet, Tg, tx, useC } from "../ui"
import { useProfile } from "../../lib/profile"
import { useAccount } from "../../lib/accountApi"
import { DEFAULT_VOICE, VOICES, normalizeConfig, serializeConfig, voiceInfo, type PickupMode, type ReceptionConfig } from "../../lib/voice/receptionist"
import { OPERATORS, forwardSteps, intendedForward, nationalFr, type ForwardOperator } from "../../lib/voice/forward"

export function ReceptionnisteControls({ className = "" }: { className?: string }) {
  const { toast } = useC()
  const { p, save } = useProfile()
  const a = useAccount()
  const [busy, setBusy] = useState(false)
  const [voices, setVoices] = useState(false)
  const c = normalizeConfig(p?.reception_config)
  const voice = voiceInfo(c.voice)
  const num = a?.integrations.twilio_number || ""

  const patch = async (part: Partial<ReceptionConfig>, ok: string) => {
    if (busy || !p) return
    setBusy(true)
    const next = { ...c, ...part }
    if (part.forwardApplied === undefined) {
      const want = intendedForward(next.enabled, next.pickup)
      if (part.operator && part.operator !== c.operator) next.forwardApplied = ""
      else if (want !== c.forwardApplied) next.forwardApplied = ""
    }
    const e = await save({ reception_config: serializeConfig(next) })
    setBusy(false)
    if (e) toast(e)
    else toast(ok)
  }

  return <div data-rec-reglages className={className}>
    <Card className="flex items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-medium">L'IA répond aux appels</div>
        <div className={tx.cap}>{c.enabled ? "Les clients appellent votre portable. L'IA répond selon le mode choisi." : "Aucun renvoi. Votre portable sonne normalement, personne d'autre ne répond."}</div>
      </div>
      <Tg on={c.enabled} onClick={() => patch({ enabled: !c.enabled }, c.enabled ? "L'IA ne répond plus" : "L'IA répond aux appels")} label="L'IA répond aux appels" />
    </Card>

    <div className={`mt-5 mb-2 px-1 ${tx.cap}`}>Quand elle décroche</div>
    <div className={`grid gap-2 ${c.enabled ? "" : "pointer-events-none opacity-40"}`}>
      {([["direct", "À ma place", "L'appel est renvoyé tout de suite vers l'IA, qui répond à votre place."], ["fallback", "Si je ne décroche pas", "Votre portable sonne environ 20 secondes, puis l'IA prend la demande."]] as const).map(([id, l, s]) => {
        const on = c.pickup === id
        return <button key={id} type="button" data-pickup={id} aria-pressed={on} disabled={busy} onClick={() => on || patch({ pickup: id as PickupMode }, id === "direct" ? "L'IA décroche à votre place" : "L'IA répond si vous ne décrochez pas")} className={`rounded-[20px] p-4 text-left transition ${on ? "bg-white/[.09] shadow-[inset_0_0_0_1.5px_rgba(255,255,255,.85)]" : "bg-white/[.035] shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]"}`}>
          <div className="flex items-center gap-2"><span className="text-[15px] font-medium">{l}</span>{on && <Check size={14} strokeWidth={2.4} className="ml-auto text-white" />}</div>
          <div className={`mt-1 ${tx.cap}`}>{s}</div>
        </button>
      })}
    </div>

    <ForwardCard c={c} num={num} busy={busy} onPatch={patch} />

    <div className={`mt-5 mb-2 px-1 ${tx.cap}`}>Voix</div>
    <Card>
      <Row first label={`Voix ${voice.name}`} onClick={() => setVoices(!voices)} lead={<span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[.08] text-white/70"><AudioLines size={18} strokeWidth={1.8} /></span>} t={voice.name} s={voice.tone} r={<span className="flex items-center gap-1">{voice.id === DEFAULT_VOICE && <Chip c={GREY}>Conseillée</Chip>}<Chev /></span>} />
    </Card>
    {voices && <div role="radiogroup" aria-label="Voix de la réceptionniste" className="mt-2 grid grid-cols-2 gap-2">
      {VOICES.map(v => {
        const on = c.voice === v.id
        return <button key={v.id} type="button" role="radio" aria-checked={on} aria-label={`Voix ${v.name}`} disabled={busy} onClick={() => { void patch({ voice: v.id }, `Voix : ${v.name}`); setVoices(false) }} className={`rounded-[16px] px-3 py-2.5 text-left ${on ? "bg-white/[.09] shadow-[inset_0_0_0_1.5px_rgba(255,255,255,.85)]" : "bg-white/[.035] shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]"}`}>
          <div className="truncate text-[14px] font-medium">{v.name}</div>
          <div className="truncate text-[11.5px] text-white/45">{v.gender === "female" ? "Féminine" : "Masculine"}</div>
        </button>
      })}
    </div>}
  </div>
}

function ForwardCard({ c, num, busy, onPatch }: { c: ReceptionConfig; num: string; busy: boolean; onPatch: (part: Partial<ReceptionConfig>, ok: string) => Promise<void> }) {
  const { toast } = useC()
  const want = intendedForward(c.enabled, c.pickup)
  const dest = nationalFr(num)
  const steps = forwardSteps(c.operator, dest, c.forwardApplied, want)
  const ok = c.forwardApplied === want
  const copy = async (code: string) => {
    try { await navigator.clipboard.writeText(code); toast("Code copié. Compose-le, puis appuie sur Appeler.") }
    catch { toast("Copie impossible. Compose le code à la main.") }
  }
  return <div data-forward className="mt-5">
    <div className={`mb-2 px-1 ${tx.cap}`}>Renvoi depuis votre portable</div>
    <Card className="p-4">
      <p className="text-[14px] leading-snug">Vos clients gardent votre numéro actuel. Le renvoi se fait avec un code à composer sur votre portable.</p>
      <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Opérateur">
        {OPERATORS.map(o => {
          const on = c.operator === o.id
          return <button key={o.id} type="button" role="radio" aria-checked={on} data-operator={o.id} disabled={busy} onClick={() => on || onPatch({ operator: o.id as ForwardOperator }, `Opérateur : ${o.l}`)} className={`h-8 rounded-full px-3 text-[13px] font-medium ${on ? "bg-white text-black" : "bg-white/[.08] text-white/70"}`}>{o.l}</button>
        })}
      </div>
      {!dest && want !== "off" && <p className={`mt-3 ${tx.cap}`}>Votre numéro Akno n'est pas encore attribué : le code de renvoi apparaîtra ici dès qu'il le sera.</p>}
      {ok && <p className="mt-3 text-[14px] leading-snug text-[#30D158]">{want === "off" ? "Renvoi annulé." : want === "direct" ? "Renvoi immédiat activé." : "Renvoi si vous ne décrochez pas : activé."}</p>}
      {steps.map(s => <div key={s.id} data-forward-step={s.id} className="mt-3 rounded-[16px] bg-white/[.05] p-3">
        <div className="text-[13.5px] font-medium">{s.label}</div>
        <p className={`mt-1 ${tx.cap}`}>{s.hint}</p>
        <div className="mt-2 select-all font-mono text-[15px] tracking-wide" data-forward-code={s.id}>{s.code}</div>
        <div className="mt-3 flex gap-2">
          <a href={s.tel} data-forward-tel={s.id} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-white text-[14px] font-medium text-black">Composer le code</a>
          <button type="button" aria-label={`Copier ${s.code}`} onClick={() => void copy(s.code)} className="flex h-11 items-center gap-1.5 rounded-full bg-white/[.1] px-4 text-[14px] font-medium"><Copy size={15} strokeWidth={1.8} />Copier</button>
        </div>
        <p className={`mt-2 ${tx.cap}`}>Si le bouton n'ouvre pas l'appel, copie le code, compose-le, puis appuie sur Appeler.</p>
      </div>)}
      {!ok && (dest || want === "off") && steps.length > 0 && <div data-forward-confirm className="mt-4">
        <div className="text-[14px] font-medium">Renvoi activé ?</div>
        <div className="mt-2 flex gap-2">
          <Btn primary className="h-11 flex-1" disabled={busy} onClick={() => onPatch({ forwardApplied: want }, want === "off" ? "Renvoi annulé" : "Renvoi confirmé")}>Oui</Btn>
          <Btn className="h-11 flex-1" disabled={busy} onClick={() => toast("Compose le code sur ton portable, puis reviens ici.")}>Pas encore</Btn>
        </div>
      </div>}
    </Card>
  </div>
}

export default function ReceptionnisteReglagesSheet({ close, onStudio, onReception, onUrgence }: { close: () => void; onStudio: () => void; onReception: () => void; onUrgence: () => void }) {
  const a = useAccount()
  const { p } = useProfile()
  const c = normalizeConfig(p?.reception_config)
  const num = a?.integrations.twilio_number || "Non attribué"
  return <Sheet title="Réceptionniste" sub="Voix, réponse et mode d'accueil" c={A.rec.c} onClose={close}>
    <ReceptionnisteControls />
    <div className={`mb-2 mt-6 px-1 ${tx.cap}`}>Configuration</div>
    <Card className="divide-y divide-white/[.06]">
      <Row first label="Ma réceptionniste" onClick={onStudio} lead={<span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[.08] text-white/70"><AudioLines size={18} strokeWidth={1.8} /></span>} t="Ma réceptionniste" s={`Voix ${voiceInfo(c.voice).name} · script, prestations, FAQ`} r={<Chev />} />
      <Row label="Numéro Akno" onClick={onReception} lead={<span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[.08] text-white/70"><Phone size={18} strokeWidth={1.8} /></span>} t="Numéro Akno" s={num} r={<Chev />} />
      <Row label="Numéro d'urgence" onClick={onUrgence} lead={<span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[.08] text-white/70"><Phone size={18} strokeWidth={1.8} /></span>} t="Numéro d'urgence" r={<Chev />} />
      <Row label="Horaires et accueil" onClick={onReception} lead={<span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[.08] text-white/70"><Clock size={18} strokeWidth={1.8} /></span>} t="Horaires et accueil" s="Plages d'ouverture et message d'accueil" r={<Chev />} />
    </Card>
  </Sheet>
}
