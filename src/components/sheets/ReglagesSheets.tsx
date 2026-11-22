import { useEffect, useState } from "react"
import { CalendarCheck, MessageSquareText, PhoneForwarded } from "lucide-react"
import { Btn, Card, Chip, F, GREEN, GREY, Sheet, Tg, inp, tx, useC } from "../ui"
import { useProfile } from "../../lib/profile"
import { api, reloadAccount, useAccount } from "../../lib/accountApi"

/* update48 · Réglages Réceptionniste (horaires, accueil, conservation), Agenda (Cal.com par artisan), SMS. */
export const DAYS: [string, string][] = [["lun", "Lundi"], ["mar", "Mardi"], ["mer", "Mercredi"], ["jeu", "Jeudi"], ["ven", "Vendredi"], ["sam", "Samedi"], ["dim", "Dimanche"]]
export type H = Record<string, [string, string] | null>
export const DEF_H: H = { lun: ["08:00", "18:00"], mar: ["08:00", "18:00"], mer: ["08:00", "18:00"], jeu: ["08:00", "18:00"], ven: ["08:00", "18:00"], sam: null, dim: null }
const Err = ({ e }: { e: string }) => e ? <p className="mt-3 px-1 text-[13px] text-[#FF9B96]">{e}</p> : null

export function ReceptionSheet({ close }: { close: () => void }) {
  const { toast } = useC()
  const { p, save } = useProfile()
  const a = useAccount()
  const [h, setH] = useState<H | null>(null), [msg, setMsg] = useState(""), [keep, setKeep] = useState(180), [err, setErr] = useState(""), [busy, setBusy] = useState(false)
  useEffect(() => { if (p && !h) { setH(p.horaires && typeof p.horaires === "object" ? { ...DEF_H, ...(p.horaires as H) } : DEF_H); setMsg(String(p.message_accueil || "")); setKeep(Number(p.conservation_enregistrements_jours) || 180) } }, [p, h])
  if (!h) return <Sheet title="Réceptionniste" c="#FFFFFF" onClose={close}><div className={tx.cap}>Chargement…</div></Sheet>
  const submit = async () => {
    for (const [, v] of Object.entries(h)) if (v && v[0] >= v[1]) { setErr("Une plage horaire se termine avant de commencer."); return }
    setBusy(true)
    const e = await save({ horaires: h, message_accueil: msg.trim().slice(0, 400) || null, conservation_enregistrements_jours: keep })
    setBusy(false)
    if (e) setErr(e); else { toast("Réceptionniste mise à jour"); close() }
  }
  const num = a?.integrations.twilio_number
  return <Sheet title="Réceptionniste" sub="Horaires, accueil et enregistrements" c="#FFFFFF" onClose={close} footer={<Btn primary className="w-full" disabled={busy} onClick={submit}>{busy ? "Enregistrement…" : "Enregistrer"}</Btn>}>
    <Card className="flex items-center gap-3 p-4"><PhoneForwarded size={20} className="text-white/60" /><div className="min-w-0 flex-1"><div className="text-[15px] font-medium">Numéro Akno</div><div className={tx.cap}>{num ? `${num}${a?.integrations.forward_to ? ` · renvoi vers ${a.integrations.forward_to}` : ""}` : "Pas encore attribué : votre numéro sera activé avec l'option téléphonie."}</div></div><Chip c={num ? GREEN : GREY}>{num ? "Actif" : "À venir"}</Chip></Card>
    {num && <p className={`mt-3 px-1 ${tx.cap}`}>Le renvoi depuis votre portable se règle dans Réglages, à côté d'Appels, sur l'accueil Réception.</p>}
    <div className={`mt-5 mb-2 px-1 ${tx.cap}`}>Horaires d'ouverture (prise de RDV et message hors horaires)</div>
    <Card className="divide-y divide-white/[.06] px-4">{DAYS.map(([k, l]) => { const v = h[k]; return <div key={k} className="flex h-14 items-center gap-3"><Tg on={!!v} onClick={() => setH({ ...h, [k]: v ? null : ["08:00", "18:00"] })} label={`${l} ouvert`} /><span className="w-24 text-[14.5px]">{l}</span>{v ? <div className="ml-auto flex items-center gap-1.5"><input type="time" className={`${inp} h-10 w-[104px] px-2`} value={v[0]} onChange={e => setH({ ...h, [k]: [e.target.value, v[1]] })} aria-label={`${l} ouverture`} /><span className="text-white/40">–</span><input type="time" className={`${inp} h-10 w-[104px] px-2`} value={v[1]} onChange={e => setH({ ...h, [k]: [v[0], e.target.value] })} aria-label={`${l} fermeture`} /></div> : <span className="ml-auto text-[14px] text-white/40">Fermé</span>}</div> })}</Card>
    <div className="mt-5"><F l="Message d'accueil (facultatif)"><textarea className={`${inp} h-24 py-3`} maxLength={400} placeholder={`${p?.entreprise_nom || p?.nom_entreprise || "Votre entreprise"}, bonjour, je suis l'assistante IA. Cet appel peut être enregistré pour le suivi de votre demande. Comment puis-je vous aider ?`} value={msg} onChange={e => setMsg(e.target.value)} /></F><p className={`mt-1.5 px-1 ${tx.cap}`}>L'annonce d'enregistrement est toujours ajoutée (obligation d'information RGPD).</p></div>
    <div className="mt-4"><F l="Conservation des enregistrements"><select className={inp} value={keep} onChange={e => setKeep(Number(e.target.value))}>{[30, 90, 180, 365].map(d => <option key={d} value={d}>{d === 365 ? "1 an" : `${d} jours`}</option>)}</select></F></div>
    <Err e={err} />
  </Sheet>
}

export function AgendaCalSheet({ close }: { close: () => void }) {
  const { toast } = useC()
  const a = useAccount()
  const [key, setKey] = useState(""), [ev, setEv] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState("")
  const connected = !!a?.integrations.calcom
  const go = async (remove = false) => {
    setBusy(true); setErr("")
    const r = await api("/api/account", { action: "save_calcom", key: remove ? "" : key.trim(), event_type_id: ev ? Number(ev) : undefined })
    setBusy(false)
    if (!r.ok) { setErr(r.error || "Enregistrement impossible."); return }
    toast(remove ? "Cal.com déconnecté" : "Cal.com connecté"); setKey(""); void reloadAccount()
  }
  return <Sheet title="Agenda en ligne" sub="Prise de RDV par la réceptionniste" c="#FFFFFF" onClose={close}>
    <Card className="flex items-center gap-3 p-4"><CalendarCheck size={20} className="text-white/60" /><div className="min-w-0 flex-1"><div className="text-[15px] font-medium">{connected ? "Cal.com connecté" : "Agenda Akno"}</div><div className={tx.cap}>{connected ? "Les créneaux et réservations passent par votre compte Cal.com." : "Sans Cal.com, Akno propose des créneaux du lundi au vendredi (8 h–18 h) d'après votre agenda Akno."}</div></div><Chip c={connected ? GREEN : GREY}>{connected ? "Connecté" : "Interne"}</Chip></Card>
    <div className="mt-5 space-y-3">
      <F l="Clé API Cal.com"><input className={inp} type="password" autoComplete="off" placeholder="cal_live_…" value={key} onChange={e => setKey(e.target.value)} /></F>
      <F l="ID du type de RDV (facultatif)"><input className={inp} inputMode="numeric" placeholder="Ex. 123456" value={ev} onChange={e => setEv(e.target.value.replace(/\D/g, ""))} /></F>
      <p className={`px-1 ${tx.cap}`}>Dans Cal.com : Réglages → Développeur → Clés API. La clé est stockée côté serveur, jamais dans l'application.</p>
      <Btn primary className="w-full" disabled={busy || !key.trim()} onClick={() => go()}>{busy ? "Vérification…" : "Connecter Cal.com"}</Btn>
      {connected && <button className="w-full text-[13.5px] text-white/55" onClick={() => go(true)}>Déconnecter Cal.com</button>}
    </div>
    <Err e={err} />
  </Sheet>
}

export function SmsSheet({ close }: { close: () => void }) {
  const { toast } = useC()
  const { p, save } = useProfile()
  const a = useAccount()
  const [on, setOn] = useState<boolean | null>(null), [sender, setSender] = useState(""), [busy, setBusy] = useState(""), [err, setErr] = useState("")
  useEffect(() => { if (p && on === null) { setOn(!!p.sms_enabled); setSender(String(p.sms_sender || "")) } }, [p, on])
  const ready = !!a?.integrations.sms
  const submit = async () => {
    const s = sender.trim()
    if (s && !/^[A-Za-z][A-Za-z0-9 ]{2,10}$/.test(s)) { setErr("Nom d'expéditeur : 3 à 11 caractères, lettres et chiffres, commence par une lettre."); return }
    setBusy("save")
    const e = await save({ sms_enabled: !!on, sms_sender: s || null })
    setBusy("")
    if (e) setErr(e); else { toast("Réglages SMS enregistrés"); close() }
  }
  const test = async () => {
    setBusy("test"); setErr("")
    const r = await api("/api/account", { action: "sms_test" })
    setBusy("")
    if (!r.ok) { setErr(r.error || "SMS non envoyé."); return }
    toast("SMS de test envoyé sur votre portable")
  }
  return <Sheet title="SMS clients" sub="Rappels de RDV, relances et avis" c="#FFFFFF" onClose={close} footer={<Btn primary className="w-full" disabled={!!busy} onClick={submit}>{busy === "save" ? "Enregistrement…" : "Enregistrer"}</Btn>}>
    <Card className="flex items-center gap-3 p-4"><MessageSquareText size={20} className="text-white/60" /><div className="min-w-0 flex-1"><div className="text-[15px] font-medium">Envoyer des SMS à mes clients</div><div className={tx.cap}>{ready ? `Rappel la veille du RDV, complément des relances, demande d'avis.${a ? ` ${a.usage.sms}/${a.entitlements.quotas.sms} ce mois.` : ""}` : "Le service SMS n'est pas encore configuré sur le serveur : aucun SMS ne partira."}</div></div><Tg on={!!on} onClick={() => setOn(!on)} label="SMS clients" /></Card>
    <div className="mt-4"><F l="Nom d'expéditeur (11 caractères max.)"><input className={inp} maxLength={11} placeholder="DupontElec" value={sender} onChange={e => setSender(e.target.value)} /></F><p className={`mt-1.5 px-1 ${tx.cap}`}>Les clients peuvent répondre STOP pour ne plus recevoir de SMS.</p></div>
    {ready && <Btn className="mt-4 w-full" disabled={!!busy} onClick={test}>{busy === "test" ? "Envoi…" : "M'envoyer un SMS de test"}</Btn>}
    <Err e={err} />
  </Sheet>
}
