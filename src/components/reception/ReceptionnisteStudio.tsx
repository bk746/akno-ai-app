/* update57 · « Ma réceptionniste » : configurateur de la réceptionniste IA (voix Grok, accueil, ton, entreprise,
   prestations, urgences, FAQ, consignes, prononciation). Même config pour l'appel test de l'app et le vrai téléphone. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { motion, AnimatePresence, useReducedMotion } from "motion/react"
import { ArrowLeft, AudioLines, Building2, Check, ChevronDown, CircleHelp, Clock, Headphones, Info, LoaderCircle, MapPin, MessageSquareText, Pause, Phone, Play, Plus, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, TriangleAlert, Wrench } from "lucide-react"
import { Blob, Btn, Chip, GREEN, AMBER, GREY, inp, tx, useC } from "../ui"
import { useProfile, type Profile } from "../../lib/profile"
import { api } from "../../lib/accountApi"
import { primeCallWakeLock } from "../../lib/voice/wakeLock"
import { companyName, mergeProfile, welcomeLine, RECORDING_NOTICE, type VoiceProfile } from "../../lib/voice/script"
import { DEFAULT_VOICE, LIMITS, SPEED_MAX, SPEED_MIN, VOICES, formatConfigForPrompt, formatHoraires, metierActivite, normalizeConfig, serializeConfig, starterServices, suggestedDefaults, voiceInfo, type Faq, type Pron, type ReceptionConfig, type Service, type VoiceInfo } from "../../lib/voice/receptionist"
import VoiceCall from "../VoiceCall"

const EASE = [.22, 1, .36, 1] as const
type SecId = "voix" | "accueil" | "entreprise" | "prestations" | "urgences" | "faq" | "avance"
const SECTIONS: { id: SecId; l: string; I: typeof AudioLines }[] = [
  { id: "voix", l: "Voix", I: AudioLines }, { id: "accueil", l: "Accueil et ton", I: MessageSquareText }, { id: "entreprise", l: "Entreprise", I: Building2 },
  { id: "prestations", l: "Prestations", I: Wrench }, { id: "urgences", l: "Urgences et limites", I: ShieldCheck }, { id: "faq", l: "Questions fréquentes", I: CircleHelp },
  { id: "avance", l: "Consignes avancées", I: SlidersHorizontal },
]
const FAQ_IDEAS = ["Le devis est-il gratuit ?", "Intervenez-vous le week-end ?", "Êtes-vous assurés (décennale) ?", "Quels moyens de paiement acceptez-vous ?", "Quel est le délai pour un rendez-vous ?"]
const GREET_IDEAS = (co: string) => [
  `${co}, bonjour ! Je suis l'assistante de l'entreprise, je prends votre demande.`,
  `Bonjour et bienvenue chez ${co}. L'équipe est sur un chantier, je m'occupe de vous.`,
  `${co}, bonjour. Je suis l'assistante IA, comment puis-je vous aider ?`,
]

/** Profil vocal déduit de la fiche artisan (mêmes règles que /api/voice-token et le relais). */
export function profileFromArtisan(p: Profile | null, cfg: ReceptionConfig, greeting: string): VoiceProfile {
  const t = p?.tarifs && typeof p.tarifs === "object" ? p.tarifs : undefined
  return mergeProfile({
    prenom: String(p?.prenom || ""), company: companyName(p?.nom_entreprise, p?.entreprise_nom),
    email: String(p?.entreprise_email || p?.email || ""), phone: String(p?.entreprise_telephone || p?.telephone || ""),
    address: String(p?.entreprise_adresse || ""), city: String(p?.entreprise_cp_ville || ""), metier: String(p?.entreprise_metier || ""),
    tarifs: t, telephoneUrgence: String(p?.telephone_urgence || ""), accueil: greeting.slice(0, 300), horaires: p?.horaires, reception: cfg,
  })
}

// ---------- Aperçu audio (API Text to Speech xAI via /api/account) ----------
const audioCache = new Map<string, string>()
function usePreview() {
  const [state, setState] = useState<{ id: string; phase: "load" | "play" } | null>(null)
  const [err, setErr] = useState("")
  const el = useRef<HTMLAudioElement | null>(null)
  useEffect(() => () => { el.current?.pause() }, [])
  const stop = () => { el.current?.pause(); setState(null) }
  const play = async (voice: string, text: string, speed: number, phone: boolean) => {
    if (state?.id === voice) { stop(); return }
    el.current?.pause(); setErr("")
    const key = `${voice}|${speed}|${phone ? 1 : 0}|${text}`
    let url = audioCache.get(key)
    if (!url) {
      setState({ id: voice, phase: "load" })
      const r = await api("/api/account", { action: "voice_preview", voice, text, speed, quality: phone ? "phone" : "hd" })
      if (!r.ok || typeof r.audio !== "string") { setState(null); setErr(r.error || "Aperçu indisponible."); return }
      url = `data:${String(r.mime || "audio/mpeg")};base64,${r.audio}`
      audioCache.set(key, url)
    }
    const a = new Audio(url); el.current = a
    a.onended = () => setState(s => s?.id === voice ? null : s)
    a.onerror = () => { setState(null); setErr("Lecture impossible sur cet appareil.") }
    setState({ id: voice, phase: "play" })
    try { await a.play() } catch { setState(null); setErr("Touchez à nouveau pour écouter.") }
  }
  return { state, err, play, stop }
}

// ---------- Petits composants ----------
const hue = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)
function VoiceAvatar({ v, live }: { v: VoiceInfo; live: boolean }) {
  const h = hue(v.id), reduce = useReducedMotion()
  return <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ background: `radial-gradient(120% 120% at 30% 20%, hsl(${h} 70% 72% / .95), hsl(${(h + 40) % 360} 55% 38% / .9) 60%, #101012 100%)`, boxShadow: "inset 0 1px 0 rgba(255,255,255,.25), 0 8px 20px -10px rgba(0,0,0,.9)" }}>
    {live ? <span className="flex h-4 items-end gap-[3px]">{[0, 1, 2, 3].map(i => <motion.span key={i} className="w-[3px] rounded-full bg-white" animate={reduce ? { height: 10 } : { height: [5, 15, 7, 12, 5] }} transition={{ duration: .9, repeat: Infinity, delay: i * .12, ease: "easeInOut" }} />)}</span>
      : <span className="text-[15px] font-semibold text-white/95">{v.name[0]}</span>}
  </span>
}
function Seg<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: [T, string][]; label: string }) {
  return <div role="radiogroup" aria-label={label} className="flex rounded-full bg-white/[.06] p-1">{items.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)} className={`relative h-9 flex-1 whitespace-nowrap rounded-full px-2 text-[13px] font-medium sm:px-3 sm:text-[13.5px] transition-colors ${value === k ? "text-black" : "text-white/60 hover:text-white"}`}>{value === k && <motion.span layoutId={`seg-${label}`} className="absolute inset-0 rounded-full bg-white" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}<span className="relative">{l}</span></button>)}</div>
}
function Panel({ id, I, title, sub, done, children, aside }: { id: SecId; I: typeof AudioLines; title: string; sub: string; done?: boolean; children: ReactNode; aside?: ReactNode }) {
  return <section id={`rs-${id}`} data-sec={id} className="scroll-mt-4 rounded-[28px] bg-gradient-to-b from-[#161618] to-[#111113] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.06),0_24px_60px_-36px_rgba(0,0,0,.95)] md:p-6">
    <div className="mb-5 flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-white/[.07] text-white"><I size={19} strokeWidth={1.75} /></span>
      <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className={tx.title}>{title}</h2>{done && <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#30D158]/20 text-[#30D158]"><Check size={11} strokeWidth={3} /></span>}</div><p className={`mt-0.5 leading-5 ${tx.cap}`}>{sub}</p></div>{aside}</div>
    {children}
  </section>
}
const Lbl = ({ l, hint, n, max, children }: { l: string; hint?: string; n?: number; max?: number; children: ReactNode }) => <label className="block"><span className="mb-2 flex items-baseline justify-between gap-2 px-1"><span className="text-[13px] text-white/60">{l}</span>{max ? <span className={`text-[11.5px] tabular-nums ${n && n > max * .9 ? "text-[#FFB340]" : "text-white/30"}`}>{n || 0}/{max}</span> : null}</span>{children}{hint && <span className={`mt-1.5 block px-1 leading-[18px] ${tx.cap}`}>{hint}</span>}</label>
const area = `${inp} h-auto min-h-[96px] resize-y py-3 leading-[22px]`
const Suggest = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => <button type="button" onClick={onClick} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/[.06] px-3 text-[12.5px] font-medium text-white/75 transition hover:bg-white/[.11] hover:text-white"><Sparkles size={13} strokeWidth={1.9} />{children}</button>
const IconBtn = ({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) => <button type="button" aria-label={label} title={label} onClick={onClick} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/40 transition hover:bg-white/[.07] hover:text-[#FF9B96]">{children}</button>

// ---------- Écran ----------
export default function ReceptionnisteStudio({ close, onHoraires }: { close: () => void; onHoraires?: () => void }) {
  const { p, save } = useProfile()
  return <StudioView p={p} save={save} close={close} onHoraires={onHoraires} />
}

export function StudioView({ p, save, close, onHoraires, initialSection }: { p: Profile | null; save: (patch: Record<string, unknown>) => Promise<string>; close: () => void; onHoraires?: () => void; initialSection?: SecId }) {
  const { toast, desk } = useC()
  const [cfg, setCfg] = useState<ReceptionConfig | null>(null)
  const [greet, setGreet] = useState("")
  const [base, setBase] = useState("")
  const [busy, setBusy] = useState(false), [err, setErr] = useState(""), [savedAt, setSavedAt] = useState(0)
  const [filter, setFilter] = useState<"reco" | "female" | "male" | "all">("reco")
  const [phoneSound, setPhoneSound] = useState(true)
  const [testOn, setTestOn] = useState(false)
  const [active, setActive] = useState<SecId>(initialSection || "voix")
  const [showPrompt, setShowPrompt] = useState(false), [askClose, setAskClose] = useState(false)
  const pv = usePreview()
  const scroller = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!p || cfg) return
    const c = normalizeConfig(p.reception_config), g = String(p.message_accueil || "")
    setCfg(c); setGreet(g); setBase(JSON.stringify([serializeConfig(c), g.trim()]))
  }, [p, cfg])
  useEffect(() => { if (initialSection) document.getElementById(`rs-${initialSection}`)?.scrollIntoView({ block: "start" }) }, [initialSection, cfg])

  // Section active (sommaire) selon le défilement
  useEffect(() => {
    const root = scroller.current
    if (!root || !cfg) return
    const io = new IntersectionObserver(es => { const v = es.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) setActive((v.target as HTMLElement).dataset.sec as SecId) }, { root, rootMargin: "-20% 0px -65% 0px" })
    root.querySelectorAll("[data-sec]").forEach(n => io.observe(n))
    return () => io.disconnect()
  }, [cfg])

  const ready = !!(p && cfg)
  const migrated = !p || "reception_config" in p
  const c = cfg || normalizeConfig(null)
  const dirty = ready && JSON.stringify([serializeConfig(c), greet.trim()]) !== base
  const prof = useMemo(() => profileFromArtisan(p, c, greet), [p, c, greet])
  const co = prof.company
  const sug = suggestedDefaults({ company: co, metier: String(p?.entreprise_metier || ""), city: String(p?.entreprise_cp_ville || ""), rayon: prof.rayon })
  const greeting = welcomeLine(prof)
  const voice = voiceInfo(c.voice)
  const horaires = formatHoraires(p?.horaires) || "du lundi au vendredi de 8 h à 18 h"
  const up = (patch: Partial<ReceptionConfig>) => setCfg({ ...c, ...patch })
  const list = VOICES.filter(v => filter === "all" ? true : filter === "reco" ? v.reco : v.gender === filter)
  const nc = useMemo(() => normalizeConfig(c), [c])
  const doneMap: Record<SecId, boolean> = { voix: true, accueil: !!greet.trim() || nc.tutoiement, entreprise: !!(nc.presentation || nc.zone || nc.disponibilites), prestations: nc.services.length > 0, urgences: !!(nc.urgences || nc.interdits), faq: nc.faq.length > 0, avance: !!(nc.consignes || nc.prononciations.length) }
  const score = Object.values(doneMap).filter(Boolean).length

  const submit = async () => {
    if (!migrated) { setErr("La base n'est pas encore à jour (migration update57) : l'enregistrement sera possible juste après."); return }
    setBusy(true); setErr("")
    const e = await save({ message_accueil: greet.trim().slice(0, 300) || null, reception_config: serializeConfig(c) })
    setBusy(false)
    if (e) { setErr(e); return }
    setBase(JSON.stringify([serializeConfig(c), greet.trim()])); setSavedAt(Date.now()); toast("Réceptionniste enregistrée · active au prochain appel")
  }
  const tryClose = () => { pv.stop(); if (dirty) setAskClose(true); else close() }
  const go = (id: SecId) => { setActive(id); document.getElementById(`rs-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }) }
  const listen = (id = c.voice) => void pv.play(id, greeting, c.speed, phoneSound)
  const startTest = () => { pv.stop(); primeCallWakeLock(); setTestOn(true) }

  const setSvc = (i: number, patch: Partial<Service>) => up({ services: c.services.map((s, j) => j === i ? { ...s, ...patch } : s) })
  const setFaq = (i: number, patch: Partial<Faq>) => up({ faq: c.faq.map((f, j) => j === i ? { ...f, ...patch } : f) })
  const setPron = (i: number, patch: Partial<Pron>) => up({ prononciations: c.prononciations.map((f, j) => j === i ? { ...f, ...patch } : f) })
  // Les champs vides des listes sont gardés pendant l'édition ; normalizeConfig les retire à l'enregistrement.
  const raw = cfg as ReceptionConfig

  const preview = <PreviewCard voice={voice} greeting={greeting} custom={!!greet.trim()} speed={c.speed} tutoiement={c.tutoiement} pv={pv} onListen={() => listen()} onTest={startTest} score={score} phoneSound={phoneSound} setPhoneSound={setPhoneSound} compact={!desk} />

  return <motion.div role="dialog" aria-modal="true" aria-label="Ma réceptionniste" className="fixed inset-0 z-[55] flex flex-col bg-[#0A0A0B] text-white" initial={{ opacity: 0, y: desk ? 0 : 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: desk ? 0 : 24 }} transition={{ duration: .32, ease: EASE }}>
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[420px]" style={{ background: "radial-gradient(60% 100% at 50% 0%, rgba(230,230,230,.08), transparent 70%)" }} />
    {/* En-tête */}
    <header className="relative z-10 shrink-0 border-b border-white/[.06] bg-[#0A0A0B]/80 backdrop-blur-xl" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className={`mx-auto flex h-16 items-center gap-3 ${desk ? "max-w-[1240px] px-8" : "px-4"}`}>
        <button type="button" aria-label="Retour" onClick={tryClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[.07] text-white/80 hover:text-white"><ArrowLeft size={19} strokeWidth={1.8} /></button>
        <div className="min-w-0 flex-1"><div className="truncate text-[17px] font-semibold tracking-[-0.02em]">Ma réceptionniste</div><div className={`truncate ${tx.cap}`}>{dirty ? "Modifications non enregistrées" : savedAt ? "Enregistré · actif sur votre ligne" : `${co} · voix ${voice.name}`}</div></div>
        {desk && <><Btn className="h-11" onClick={startTest}><Phone size={16} strokeWidth={1.9} />Tester</Btn><Btn primary className="h-11 min-w-[148px]" disabled={busy || !dirty || !migrated} onClick={submit}>{busy ? <LoaderCircle size={17} className="animate-spin" /> : savedAt && !dirty ? <Check size={17} strokeWidth={2.4} /> : null}{busy ? "Enregistrement" : savedAt && !dirty ? "Enregistré" : "Enregistrer"}</Btn></>}
      </div>
      {!desk && <nav aria-label="Sections" className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3">{SECTIONS.map(s => <button key={s.id} type="button" onClick={() => go(s.id)} className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition ${active === s.id ? "bg-white text-black" : "bg-white/[.06] text-white/65"}`}>{doneMap[s.id] && active !== s.id && <span className="h-1.5 w-1.5 rounded-full bg-[#30D158]" />}{s.l}</button>)}</nav>}
    </header>

    <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ paddingBottom: desk ? 48 : "calc(108px + env(safe-area-inset-bottom))" }}>
      {!ready ? <div className="flex h-60 items-center justify-center gap-2 text-white/50"><LoaderCircle size={18} className="animate-spin" />Chargement…</div> :
        <div className={`mx-auto ${desk ? "grid max-w-[1240px] grid-cols-[200px_minmax(0,1fr)_340px] gap-8 px-8 pt-8" : "px-4 pt-4"}`}>
          {desk && <nav aria-label="Sections" className="sticky top-8 self-start"><div className={`mb-3 px-3 ${tx.cap}`}>Configuration</div>{SECTIONS.map(s => <button key={s.id} type="button" onClick={() => go(s.id)} className={`flex h-10 w-full items-center gap-2.5 rounded-[12px] px-3 text-left text-[14px] transition ${active === s.id ? "bg-white/[.08] text-white" : "text-white/55 hover:text-white"}`}><s.I size={16} strokeWidth={1.8} /><span className="flex-1 truncate">{s.l}</span>{doneMap[s.id] && <Check size={14} strokeWidth={2.4} className="text-[#30D158]" />}</button>)}
            <div className="mt-6 px-3"><div className="flex items-center justify-between text-[12.5px] text-white/50"><span>Profil complété</span><span className="tabular-nums">{score}/7</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[.07]"><motion.div className="h-full rounded-full bg-white" animate={{ width: `${score / 7 * 100}%` }} transition={{ duration: .5, ease: EASE }} /></div></div></nav>}

          <div className="min-w-0 space-y-4 md:space-y-5">
            {!desk && preview}
            {!migrated && <div className="flex gap-3 rounded-[20px] border border-[#FFB340]/25 bg-[#FFB340]/[.08] p-4 text-[13.5px] leading-5 text-[#FFD08A]"><TriangleAlert size={18} className="mt-0.5 shrink-0" />La base de données n'est pas encore à jour (migration update57). Vous pouvez tout préparer et tester ; l'enregistrement sera possible dès qu'elle sera appliquée.</div>}

            <Panel id="voix" I={AudioLines} title="Voix" sub="Écoutez et choisissez la voix qui décroche. Les 28 voix de Grok Voice parlent français." done>
              <Seg label="Filtre des voix" value={filter} onChange={setFilter} items={[["reco", "Conseillées"], ["female", "Femmes"], ["male", "Hommes"], ["all", `Toutes (${VOICES.length})`]]} />
              <motion.div layout className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <AnimatePresence initial={false}>{list.map(v => { const sel = c.voice === v.id, st = pv.state?.id === v.id ? pv.state.phase : null
                  return <motion.div layout key={v.id} initial={{ opacity: 0, scale: .98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .98 }} transition={{ duration: .2 }}
                    role="radio" aria-checked={sel} tabIndex={0} aria-label={`Voix ${v.name}`} onClick={() => up({ voice: v.id })} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); up({ voice: v.id }) } }}
                    className={`group relative flex cursor-pointer items-center gap-3 rounded-[20px] p-3 pr-2 transition-[background,box-shadow] ${sel ? "bg-white/[.09] shadow-[inset_0_0_0_1.5px_rgba(255,255,255,.85)]" : "bg-white/[.035] shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)] hover:bg-white/[.06]"}`}>
                    <VoiceAvatar v={v} live={st === "play"} />
                    <div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><span className="text-[15px] font-semibold tracking-[-0.01em]">{v.name}</span>{v.id === DEFAULT_VOICE && <span className="rounded-full bg-white/10 px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-[.04em] text-white/70">Conseillée</span>}{v.accent && <span className="rounded-full bg-[#FFB340]/12 px-1.5 py-px text-[10.5px] font-medium text-[#FFC266]">accent {v.accent}</span>}</div>
                      <div className="mt-0.5 text-[12.5px] leading-[17px] text-white/55">{v.tone}</div><div className="truncate text-[11.5px] text-white/35">{v.gender === "female" ? "Féminine" : "Masculine"} · {v.use}</div></div>
                    <button type="button" aria-label={st === "play" ? `Arrêter ${v.name}` : `Écouter ${v.name}`} onClick={e => { e.stopPropagation(); listen(v.id) }} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${st ? "bg-white text-black" : "bg-white/[.08] text-white hover:bg-white/[.14]"}`}>{st === "load" ? <LoaderCircle size={16} className="animate-spin" /> : st === "play" ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}</button>
                    {sel && <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-black shadow"><Check size={12} strokeWidth={3} /></span>}
                  </motion.div> })}</AnimatePresence>
              </motion.div>
              {pv.err && <p className="mt-3 px-1 text-[13px] text-[#FF9B96]">{pv.err}</p>}
              <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <div><div className="mb-2 flex items-baseline justify-between px-1"><span className="text-[13px] text-white/60">Débit de parole</span><span className="text-[12.5px] tabular-nums text-white/45">{c.speed === 1 ? "Normal" : `× ${c.speed.toFixed(2).replace(".", ",")}`}</span></div>
                  <input type="range" aria-label="Débit de parole" min={SPEED_MIN} max={SPEED_MAX} step={0.05} value={c.speed} onChange={e => up({ speed: Number(e.target.value) })} className="akno-range w-full" />
                  <div className="mt-1 flex justify-between px-1 text-[11.5px] text-white/35"><span>Plus posé</span><span>Plus rapide</span></div></div>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-full bg-white/[.05] py-2 pl-3 pr-2 text-[13px] text-white/70"><Headphones size={15} />Écouter en qualité téléphone<button type="button" role="switch" aria-checked={phoneSound} onClick={() => setPhoneSound(!phoneSound)} className="relative h-[24px] w-[40px] rounded-full transition-colors" style={{ background: phoneSound ? "#2F7BFF" : "rgba(255,255,255,.14)" }}><span className="absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white transition-all" style={{ left: phoneSound ? 19 : 3 }} /></button></label>
              </div>
              <p className={`mt-3 px-1 leading-[18px] ${tx.cap}`}>L'aperçu lit votre accueil avec la synthèse vocale xAI (même voix). En appel, la voix réagit en direct : testez-la avec « Tester ma réceptionniste ».</p>
            </Panel>

            <Panel id="accueil" I={MessageSquareText} title="Accueil et ton" sub="La première phrase entendue par vos clients, et la façon de leur parler." done={doneMap.accueil}>
              <Lbl l="Message d'accueil" n={greet.length} max={300} hint={`Laissez vide pour l'accueil standard. « ${RECORDING_NOTICE} » est ajouté automatiquement s'il manque (RGPD), ainsi que la mention d'assistante IA.`}>
                <textarea className={area} rows={3} maxLength={300} placeholder={welcomeLine({ ...prof, accueil: "" })} value={greet} onChange={e => setGreet(e.target.value)} /></Lbl>
              <div className="mt-3 flex flex-wrap gap-2">{GREET_IDEAS(co).map((g, i) => <Suggest key={i} onClick={() => setGreet(g)}>{["Chaleureux", "Chantier", "Sobre"][i]}</Suggest>)}</div>
              <div className="mt-5"><div className="mb-2 px-1 text-[13px] text-white/60">Ton avec les clients</div>
                <Seg label="Ton" value={c.tutoiement ? "tu" : "vous"} onChange={v => up({ tutoiement: v === "tu" })} items={[["vous", "Vouvoiement · conseillé"], ["tu", "Tutoiement"]]} /></div>
            </Panel>

            <Panel id="entreprise" I={Building2} title="Votre entreprise" sub="Ce que la réceptionniste répond quand on lui demande qui vous êtes et où vous intervenez." done={doneMap.entreprise}>
              <div className="space-y-4">
                <Lbl l="Présentation" n={c.presentation.length} max={LIMITS.presentation}><textarea className={area} rows={3} maxLength={LIMITS.presentation} placeholder={sug.presentation} value={c.presentation} onChange={e => up({ presentation: e.target.value })} /></Lbl>
                {!c.presentation && <Suggest onClick={() => up({ presentation: sug.presentation })}>Utiliser la suggestion</Suggest>}
                <Lbl l="Zone d'intervention" hint="Hors zone, la réceptionniste le dit poliment et prend le numéro."><div className="relative"><MapPin size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35" /><input className={`${inp} pl-10`} maxLength={LIMITS.zone} placeholder={sug.zone} value={c.zone} onChange={e => up({ zone: e.target.value })} /></div></Lbl>
                <div className="flex items-center gap-3 rounded-[16px] bg-white/[.04] px-4 py-3"><Clock size={16} className="shrink-0 text-white/45" /><div className="min-w-0 flex-1 text-[13.5px] leading-5 text-white/70">Horaires : {horaires}</div>{onHoraires && <button type="button" onClick={() => dirty ? toast("Enregistrez d'abord vos modifications") : onHoraires()} className="shrink-0 text-[13px] font-medium text-white/60 hover:text-white">Modifier</button>}</div>
                <Lbl l="Disponibilités et délais (facultatif)" n={c.disponibilites.length} max={LIMITS.disponibilites} hint="Ex. « Délai moyen d'une semaine, urgences traitées dans la journée. » Les créneaux proposés restent ceux de votre agenda."><textarea className={area} rows={2} maxLength={LIMITS.disponibilites} placeholder="Délai habituel, périodes de congés, intervention le samedi matin…" value={c.disponibilites} onChange={e => up({ disponibilites: e.target.value })} /></Lbl>
              </div>
            </Panel>

            <Panel id="prestations" I={Wrench} title="Prestations" sub="Ce que vous faites (et donc ce que vous ne faites pas). Un prix indicatif peut être annoncé, jamais un autre." done={doneMap.prestations} aside={<span className={`shrink-0 text-[12.5px] tabular-nums ${tx.cap}`}>{nc.services.length}/{LIMITS.services}</span>}>
              <div className="space-y-2.5"><AnimatePresence initial={false}>{raw.services.map((s, i) => <motion.div key={i} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="rounded-[18px] bg-white/[.04] p-2.5">
                <div className="flex items-center gap-2"><input aria-label="Prestation" className={`${inp} h-11 flex-1 bg-white/[.06]`} maxLength={LIMITS.nom} placeholder="Ex. Recherche de fuite" value={s.nom} onChange={e => setSvc(i, { nom: e.target.value })} /><IconBtn label="Supprimer la prestation" onClick={() => up({ services: c.services.filter((_, j) => j !== i) })}><Trash2 size={16} /></IconBtn></div>
                <div className="mt-2 grid grid-cols-2 gap-2"><input aria-label="Prix indicatif" className={`${inp} h-10 bg-white/[.06] text-[14px]`} maxLength={LIMITS.prix} placeholder="Prix (ex. dès 89 €)" value={s.prix || ""} onChange={e => setSvc(i, { prix: e.target.value })} /><input aria-label="Durée" className={`${inp} h-10 bg-white/[.06] text-[14px]`} maxLength={LIMITS.duree} placeholder="Durée (ex. 1 h)" value={s.duree || ""} onChange={e => setSvc(i, { duree: e.target.value })} /></div>
              </motion.div>)}</AnimatePresence></div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Btn className="h-10 text-[14px]" disabled={raw.services.length >= LIMITS.services} onClick={() => up({ services: [...raw.services, { nom: "" }] })}><Plus size={16} />Ajouter une prestation</Btn>
                {!raw.services.length && <Suggest onClick={() => up({ services: starterServices(String(p?.entreprise_metier || "")) })}>Exemples {metierActivite(String(p?.entreprise_metier || "")) ? `en ${metierActivite(String(p?.entreprise_metier || ""))}` : "pour démarrer"}</Suggest>}
              </div>
              <p className={`mt-3 px-1 leading-[18px] ${tx.cap}`}>Vos frais fixes (déplacement, taux horaire) restent gérés dans Devis › Tarifs.</p>
            </Panel>

            <Panel id="urgences" I={ShieldCheck} title="Urgences et limites" sub="Vos consignes en cas d'urgence, et ce que la réceptionniste ne doit jamais promettre." done={doneMap.urgences}>
              <div className="space-y-4">
                <Lbl l="En cas d'urgence" n={c.urgences.length} max={LIMITS.urgences}><textarea className={area} rows={3} maxLength={LIMITS.urgences} placeholder={sug.urgences} value={c.urgences} onChange={e => up({ urgences: e.target.value })} /></Lbl>
                <Lbl l="À ne jamais promettre ni dire" n={c.interdits.length} max={LIMITS.interdits}><textarea className={area} rows={3} maxLength={LIMITS.interdits} placeholder={sug.interdits} value={c.interdits} onChange={e => up({ interdits: e.target.value })} /></Lbl>
                <div className="rounded-[18px] bg-white/[.035] p-4"><div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-white/75"><ShieldCheck size={15} className="text-[#30D158]" />Toujours actif, même sans réglage</div>
                  <ul className="space-y-1.5 text-[13px] leading-5 text-white/55">{["Gaz : couper, aérer, sortir, 112 et GRDF", "Annonce d'enregistrement (RGPD) et mention d'assistante IA", "Aucun prix de travaux ni créneau inventé, jamais de RIB", "Votre numéro d'urgence seulement en vraie urgence"].map(x => <li key={x} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-white/40" />{x}</li>)}</ul></div>
              </div>
            </Panel>

            <Panel id="faq" I={CircleHelp} title="Questions fréquentes" sub="Les réponses que vous donneriez vous-même. Elle les reformule naturellement." done={doneMap.faq} aside={<span className={`shrink-0 text-[12.5px] tabular-nums ${tx.cap}`}>{nc.faq.length}/{LIMITS.faq}</span>}>
              <div className="space-y-2.5"><AnimatePresence initial={false}>{raw.faq.map((f, i) => <motion.div key={i} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="rounded-[18px] bg-white/[.04] p-2.5">
                <div className="flex items-center gap-2"><input aria-label="Question" className={`${inp} h-11 flex-1 bg-white/[.06] font-medium`} maxLength={LIMITS.q} placeholder="Question du client" value={f.q} onChange={e => setFaq(i, { q: e.target.value })} /><IconBtn label="Supprimer la question" onClick={() => up({ faq: raw.faq.filter((_, j) => j !== i) })}><Trash2 size={16} /></IconBtn></div>
                <textarea aria-label="Réponse" className={`${area} mt-2 min-h-[72px] bg-white/[.06] text-[14px]`} rows={2} maxLength={LIMITS.r} placeholder="Votre réponse" value={f.r} onChange={e => setFaq(i, { r: e.target.value })} />
              </motion.div>)}</AnimatePresence></div>
              <div className="mt-3 flex flex-wrap gap-2"><Btn className="h-10 text-[14px]" disabled={raw.faq.length >= LIMITS.faq} onClick={() => up({ faq: [...raw.faq, { q: "", r: "" }] })}><Plus size={16} />Ajouter une question</Btn>
                {FAQ_IDEAS.filter(q => !raw.faq.some(f => f.q === q)).slice(0, raw.faq.length ? 2 : 3).map(q => <Suggest key={q} onClick={() => up({ faq: [...raw.faq, { q, r: "" }] })}>{q}</Suggest>)}</div>
            </Panel>

            <Panel id="avance" I={SlidersHorizontal} title="Consignes avancées" sub="Pour aller plus loin : consignes libres et prononciation des noms propres." done={doneMap.avance}>
              <Lbl l="Consignes particulières" n={c.consignes.length} max={LIMITS.consignes} hint="Elles complètent le script Akno sans pouvoir désactiver les règles de sécurité."><textarea className={area} rows={4} maxLength={LIMITS.consignes} placeholder="Ex. Proposez toujours le contrat d'entretien aux clients qui appellent pour une chaudière. Les clients professionnels sont rappelés par Julie." value={c.consignes} onChange={e => up({ consignes: e.target.value })} /></Lbl>
              <div className="mt-5"><div className="mb-2 px-1 text-[13px] text-white/60">Prononciation</div>
                <div className="space-y-2">{raw.prononciations.map((x, i) => <div key={i} className="flex items-center gap-2"><input aria-label="Mot écrit" className={`${inp} h-11 flex-1`} maxLength={LIMITS.mot} placeholder="Écrit (ex. Akno)" value={x.mot} onChange={e => setPron(i, { mot: e.target.value })} /><span className="text-white/35">→</span><input aria-label="Prononcé" className={`${inp} h-11 flex-1`} maxLength={LIMITS.dit} placeholder="Dit (ex. Ak-no)" value={x.dit} onChange={e => setPron(i, { dit: e.target.value })} /><IconBtn label="Supprimer" onClick={() => up({ prononciations: raw.prononciations.filter((_, j) => j !== i) })}><Trash2 size={16} /></IconBtn></div>)}</div>
                <Btn className="mt-2 h-10 text-[14px]" disabled={raw.prononciations.length >= LIMITS.prononciations} onClick={() => up({ prononciations: [...raw.prononciations, { mot: "", dit: "" }] })}><Plus size={16} />Ajouter un mot</Btn>
                <p className={`mt-2 px-1 leading-[18px] ${tx.cap}`}>Pour un nom d'entreprise ou de rue mal prononcé. Seule la voix change, pas la transcription.</p></div>
              <button type="button" onClick={() => setShowPrompt(!showPrompt)} className="mt-5 flex w-full items-center gap-2 rounded-[16px] bg-white/[.04] px-4 py-3 text-left text-[13.5px] text-white/70 hover:bg-white/[.06]"><Info size={15} /><span className="flex-1">Ce que la réceptionniste sait de vous</span><ChevronDown size={16} className={`transition-transform ${showPrompt ? "rotate-180" : ""}`} /></button>
              <AnimatePresence initial={false}>{showPrompt && <motion.pre initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-2 max-h-[320px] overflow-auto whitespace-pre-wrap rounded-[16px] bg-black/40 p-4 font-mono text-[11.5px] leading-[18px] text-white/60">{formatConfigForPrompt(nc) || "Rien de personnalisé pour l'instant : le script Akno standard s'applique."}</motion.pre>}</AnimatePresence>
            </Panel>
            {err && <p role="alert" className="px-1 text-[13.5px] text-[#FF9B96]">{err}</p>}
          </div>

          {desk && <aside className="sticky top-8 self-start">{preview}</aside>}
        </div>}
    </div>

    {!desk && ready && <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))", paddingTop: 28, background: "linear-gradient(to bottom, rgba(10,10,11,0), rgba(10,10,11,.9) 26px, #0A0A0B 52px)" }}>
      <div className="pointer-events-auto flex gap-2"><Btn className="h-[52px] w-[52px] shrink-0 px-0" aria-label="Tester ma réceptionniste" onClick={startTest}><Phone size={18} /></Btn><Btn primary className="h-[52px] flex-1" disabled={busy || !dirty || !migrated} onClick={submit}>{busy ? <LoaderCircle size={17} className="animate-spin" /> : savedAt && !dirty ? <Check size={17} strokeWidth={2.4} /> : null}{busy ? "Enregistrement…" : savedAt && !dirty ? "Enregistré" : dirty ? "Enregistrer" : "Aucune modification"}</Btn></div></div>}

    <AnimatePresence>{askClose && <motion.div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/60 p-6 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAskClose(false)}>
      <motion.div role="alertdialog" aria-label="Quitter sans enregistrer ?" onClick={e => e.stopPropagation()} initial={{ scale: .96 }} animate={{ scale: 1 }} className="w-full max-w-[360px] rounded-[24px] border border-white/[.08] bg-[#151517] p-6"><div className={tx.title}>Quitter sans enregistrer ?</div><p className={`mt-1.5 leading-5 ${tx.cap}`}>Vos modifications de la réceptionniste seront perdues.</p>
        <div className="mt-5 flex gap-2"><Btn className="flex-1" onClick={() => { setAskClose(false); close() }}>Quitter</Btn><Btn primary className="flex-1" disabled={!migrated} onClick={async () => { setAskClose(false); await submit(); close() }}>Enregistrer</Btn></div></motion.div></motion.div>}</AnimatePresence>
    {testOn && <VoiceCall fallback={{ company: co }} override={{ reception: nc, accueil: greet.trim().slice(0, 300) }} onDone={msg => { setTestOn(false); if (msg) toast(msg) }} />}
  </motion.div>
}

function PreviewCard({ voice, greeting, custom, speed, tutoiement, pv, onListen, onTest, score, phoneSound, setPhoneSound, compact }: { voice: VoiceInfo; greeting: string; custom: boolean; speed: number; tutoiement: boolean; pv: ReturnType<typeof usePreview>; onListen: () => void; onTest: () => void; score: number; phoneSound: boolean; setPhoneSound: (b: boolean) => void; compact: boolean }) {
  const st = pv.state?.id === voice.id ? pv.state.phase : null
  return <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-b from-[#1A1A1D] to-[#111113] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_30px_70px_-40px_rgba(0,0,0,1)]">
    <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full" style={{ background: `radial-gradient(circle, hsl(${hue(voice.id)} 70% 70% / .16), transparent 65%)` }} />
    <div className="relative flex items-center gap-3"><Blob c="#E6E6E6" s={compact ? 44 : 52} /><div className="min-w-0 flex-1"><div className="text-[11.5px] font-medium uppercase tracking-[.06em] text-white/40">Aperçu en direct</div><div className="truncate text-[17px] font-semibold tracking-[-0.02em]">{voice.name}</div><div className="truncate text-[12px] text-white/45">{voice.tone}</div></div><Chip c={st === "play" ? GREEN : GREY}>{st === "play" ? "Lecture" : st === "load" ? "Synthèse…" : tutoiement ? "Tutoiement" : "Vouvoiement"}</Chip></div>
    <div className="relative mt-4 rounded-[20px] rounded-tl-[6px] bg-white/[.06] px-4 py-3.5 text-[14.5px] leading-[22px] text-white/90">« {greeting} »<div className="mt-2 flex items-center gap-1.5 text-[11.5px] text-white/40">{custom ? "Accueil personnalisé" : "Accueil standard"} · débit {speed === 1 ? "normal" : `× ${speed.toFixed(2).replace(".", ",")}`}</div></div>
    <div className="relative mt-4 grid grid-cols-2 gap-2">
      <Btn className="h-11 text-[14px]" onClick={onListen}>{st === "load" ? <LoaderCircle size={16} className="animate-spin" /> : st === "play" ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}{st === "play" ? "Arrêter" : "Écouter"}</Btn>
      <Btn primary className="h-11 text-[14px]" onClick={onTest}><Phone size={16} />Tester l'appel</Btn>
    </div>
    {!compact && <label className="relative mt-3 flex cursor-pointer items-center justify-between gap-2 px-1 text-[12.5px] text-white/50"><span className="flex items-center gap-1.5"><Headphones size={14} />Qualité téléphone (8 kHz)</span><button type="button" role="switch" aria-checked={phoneSound} aria-label="Qualité téléphone" onClick={() => setPhoneSound(!phoneSound)} className="relative h-[22px] w-[38px] rounded-full transition-colors" style={{ background: phoneSound ? "#2F7BFF" : "rgba(255,255,255,.14)" }}><span className="absolute top-[3px] h-[16px] w-[16px] rounded-full bg-white transition-all" style={{ left: phoneSound ? 19 : 3 }} /></button></label>}
    {pv.err && compact && <p className="relative mt-2 px-1 text-[12.5px] text-[#FF9B96]">{pv.err}</p>}
    {!compact && <div className="relative mt-5 border-t border-white/[.06] pt-4"><div className="flex items-center justify-between text-[12.5px] text-white/50"><span>Personnalisation</span><span className="tabular-nums">{score}/7</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[.07]"><motion.div className="h-full rounded-full" style={{ background: score >= 5 ? GREEN : score >= 3 ? AMBER : "#fff" }} animate={{ width: `${score / 7 * 100}%` }} /></div>
      <p className={`mt-3 leading-[18px] ${tx.cap}`}>« Tester l'appel » utilise les réglages affichés, même non enregistrés. Votre ligne téléphonique utilise la version enregistrée.</p></div>}
  </div>
}
