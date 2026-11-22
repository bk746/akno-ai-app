/* update74 · Réglages rapides de la réceptionniste (voix, IA on/off, mode de décrochage).
   Même source que « Ma réceptionniste » : artisans.reception_config, via useProfile().save. */
import { useState } from "react"
import { AudioLines, Check, Clock, Phone } from "lucide-react"
import { A, Card, Chev, Chip, GREY, Row, Sheet, Tg, tx, useC } from "../ui"
import { useProfile } from "../../lib/profile"
import { useAccount } from "../../lib/accountApi"
import { DEFAULT_VOICE, VOICES, normalizeConfig, serializeConfig, voiceInfo, type PickupMode, type ReceptionConfig } from "../../lib/voice/receptionist"
import { RenvoiGuide } from "../sheets/ReglagesSheets"

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
    const e = await save({ reception_config: serializeConfig({ ...c, ...part }) })
    setBusy(false)
    if (e) toast(e)
    else toast(ok)
  }

  return <div data-rec-reglages className={className}>
    <Card className="flex items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-medium">L'IA répond aux appels</div>
        <div className={tx.cap}>{c.enabled ? "Elle décroche sur votre numéro Akno." : "Elle ne décroche plus. Les appelants entendront un message d'indisponibilité."}</div>
      </div>
      <Tg on={c.enabled} onClick={() => patch({ enabled: !c.enabled }, c.enabled ? "L'IA ne répond plus" : "L'IA répond aux appels")} label="L'IA répond aux appels" />
    </Card>

    <div className={`mt-5 mb-2 px-1 ${tx.cap}`}>Quand elle décroche</div>
    <div className={`grid gap-2 ${c.enabled ? "" : "pointer-events-none opacity-40"}`}>
      {([["direct", "À ma place", "L'IA décroche dès qu'on appelle le numéro Akno."], ["fallback", "Si je ne décroche pas", "Votre téléphone sonne d'abord, l'IA prend le relais."]] as const).map(([id, l, s]) => {
        const on = c.pickup === id
        return <button key={id} type="button" data-pickup={id} aria-pressed={on} disabled={busy} onClick={() => on || patch({ pickup: id as PickupMode }, id === "direct" ? "L'IA décroche à votre place" : "L'IA répond si vous ne décrochez pas")} className={`rounded-[20px] p-4 text-left transition ${on ? "bg-white/[.09] shadow-[inset_0_0_0_1.5px_rgba(255,255,255,.85)]" : "bg-white/[.035] shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]"}`}>
          <div className="flex items-center gap-2"><span className="text-[15px] font-medium">{l}</span>{on && <Check size={14} strokeWidth={2.4} className="ml-auto text-white" />}</div>
          <div className={`mt-1 ${tx.cap}`}>{s}</div>
        </button>
      })}
    </div>
    {c.enabled && c.pickup === "direct" && <p className={`mt-3 px-1 ${tx.cap}`}>{num ? `Donnez ce numéro à vos clients : ${num}. L'IA décroche à chaque appel.` : "Dès que votre numéro Akno sera attribué, donnez-le à vos clients : l'IA décrochera à chaque appel."}</p>}
    {c.enabled && c.pickup === "fallback" && (num ? <div className="mt-3"><RenvoiGuide num={num} /></div> : <p className={`mt-3 px-1 ${tx.cap}`}>Votre numéro Akno sera indiqué ici dès qu'il sera attribué, avec les codes à composer pour le renvoi d'appel.</p>)}

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
