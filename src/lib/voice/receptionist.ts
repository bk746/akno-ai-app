/* update57 · Configurateur « Ma réceptionniste » : voix, script, prestations, FAQ, consignes.
   Module PUR (aucune dépendance) : partagé par l'app (aperçu + appel test) et le relais téléphonique (voice-bridge).
   Stockage : colonne jsonb artisans.reception_config (migration 20261118_09_update57_receptionist.sql).
   Le message d'accueil reste dans artisans.message_accueil (update48) : une seule source pour l'app et le téléphone. */

export type VoiceGender = "female" | "male"
export type VoiceInfo = { id: string; name: string; gender: VoiceGender; tone: string; use: string; accent?: string; reco?: boolean }

/** Voix clonée xAI (custom voice) — absente de GET /v1/tts/voices, id connu côté compte xAI. */
export const CUSTOM_VOICE_KERYAN = "3ixfadarbuwy"
export const isCustomVoiceId = (id: string) => id.toLowerCase() === CUSTOM_VOICE_KERYAN

/** Les 28 voix intégrées de Grok Voice (même liste pour le temps réel et la synthèse vocale).
 *  Source : https://docs.x.ai/developers/model-capabilities/audio/voice (tableau « Voices ») + GET /v1/tts/voices (genre).
 *  Descriptions traduites de la doc xAI ; l'accent indiqué est celui que xAI décrit (en anglais). */
export const VOICES: VoiceInfo[] = [
  { id: CUSTOM_VOICE_KERYAN, name: "Ma voix (Keryan)", gender: "male", tone: "Voix personnalisée", use: "Réceptionniste", reco: true },
  { id: "celeste", name: "Celeste", gender: "female", tone: "Empathique, assurée, rassurante", use: "Accueil, assistance", reco: true },
  { id: "aurora", name: "Aurora", gender: "female", tone: "Sereine, posée, rayonnante", use: "Accueil, assistance", reco: true },
  { id: "iris", name: "Iris", gender: "female", tone: "Aimable, enjouée, d'un charme naturel", use: "Commercial, accueil", reco: true },
  { id: "ara", name: "Ara", gender: "female", tone: "Chaleureuse et aimable", use: "Polyvalente", reco: true },
  { id: "ursa", name: "Ursa", gender: "female", tone: "Aimable, chaleureuse, constante", use: "Assistante, podcast", reco: true },
  { id: "carina", name: "Carina", gender: "female", tone: "Douce, empathique, apaisante", use: "Bien-être, assistance" },
  { id: "luna", name: "Luna", gender: "female", tone: "Douce, patiente, attentionnée", use: "Pédagogie, assistante" },
  { id: "liora", name: "Liora", gender: "female", tone: "Calme, posée, lumineuse", use: "Bien-être, assistante" },
  { id: "eve", name: "Eve", gender: "female", tone: "Énergique et enjouée", use: "Polyvalente", accent: "britannique" },
  { id: "atlas", name: "Atlas", gender: "male", tone: "Assuré, posé, rassurant", use: "Commercial, assistant", reco: true },
  { id: "castor", name: "Castor", gender: "male", tone: "Charismatique, simple, détendu", use: "Commercial, accueil", reco: true },
  { id: "rex", name: "Rex", gender: "male", tone: "Assuré et clair", use: "Polyvalent", reco: true },
  { id: "sal", name: "Sal", gender: "male", tone: "Doux et équilibré", use: "Polyvalent" },
  { id: "lux", name: "Lux", gender: "male", tone: "Posé, calme, sage", use: "Bien-être, narration" },
  { id: "perseus", name: "Perseus", gender: "male", tone: "Solide, assuré, digne de confiance", use: "Publicité, narration" },
  { id: "lumen", name: "Lumen", gender: "male", tone: "Chaleureux, clair, engageant", use: "Pédagogie, publicité" },
  { id: "helios", name: "Helios", gender: "male", tone: "Enjoué, énergique, polyvalent", use: "Assistant, bien-être" },
  { id: "cosmo", name: "Cosmo", gender: "male", tone: "Vif, curieux, facile à suivre", use: "Pédagogie, podcast" },
  { id: "altair", name: "Altair", gender: "male", tone: "Élégant, raffiné, haut de gamme", use: "Publicité, narration" },
  { id: "zenith", name: "Zenith", gender: "male", tone: "Incisif, concentré, déterminé", use: "Commercial, publicité" },
  { id: "kepler", name: "Kepler", gender: "male", tone: "Inventif, charismatique", use: "Publicité, podcast" },
  { id: "orion", name: "Orion", gender: "male", tone: "Riche, cinématographique, profond", use: "Narration, livres audio" },
  { id: "helix", name: "Helix", gender: "male", tone: "Audacieux, dynamique", use: "Commentaire, podcast" },
  { id: "sirius", name: "Sirius", gender: "male", tone: "Vif d'esprit, malicieux", use: "Commentaire, personnages" },
  { id: "zagan", name: "Zagan", gender: "male", tone: "Puissant, dramatique", use: "Personnages, narration" },
  { id: "leo", name: "Leo", gender: "male", tone: "Autoritaire et puissant", use: "Polyvalent", accent: "britannique" },
  { id: "rigel", name: "Rigel", gender: "male", tone: "Précis, professionnel, calme", use: "Assistant, support", accent: "australien" },
  { id: "naksh", name: "Naksh", gender: "male", tone: "Chaleureux, réfléchi", use: "Assistant, support", accent: "indien" },
]

/** Voix par défaut si l'artisan n'en a pas choisi : « ara » (chaleureuse, polyvalente — moins « robot » que les voix trop placées). */
export const DEFAULT_VOICE = "ara"
export const ALLOWED_VOICE_IDS = new Set(VOICES.map(v => v.id))
const VOICE_IDS = ALLOWED_VOICE_IDS
export const isVoiceId = (v: unknown): v is string => typeof v === "string" && VOICE_IDS.has(v.toLowerCase())
export const voiceInfo = (id?: string) => VOICES.find(v => v.id === (id || "").toLowerCase()) || VOICES.find(v => v.id === DEFAULT_VOICE)!

export type Service = { nom: string; prix?: string; duree?: string }
export type Faq = { q: string; r: string }
export type Pron = { mot: string; dit: string }
export type PickupMode = "direct" | "fallback"
export const DEFAULT_PICKUP: PickupMode = "fallback"

export type ReceptionConfig = {
  voice: string
  /** débit de parole (audio.output.speed, plage doc xAI 0,7–1,5 ; Akno limite à 0,85–1,2) */
  speed: number
  /** false = l'IA ne décroche pas sur la ligne Akno (message d'indisponibilité). Absent = true. */
  enabled: boolean
  /** direct = à la place de l'artisan ; fallback = seulement si personne ne décroche. Absent = fallback. */
  pickup: PickupMode
  /** Opérateur du portable (codes de renvoi). Absent = orange. */
  operator: "orange" | "sfr" | "bouygues" | "free"
  /** Dernier renvoi confirmé par l'artisan sur son portable. Vide = pas encore confirmé. */
  forwardApplied: "off" | "direct" | "fallback" | ""
  tutoiement: boolean
  presentation: string
  services: Service[]
  zone: string
  disponibilites: string
  urgences: string
  interdits: string
  faq: Faq[]
  consignes: string
  /** remplacements de prononciation (session.replace, doc xAI « Pronunciation Replacements ») */
  prononciations: Pron[]
}

export const LIMITS = { presentation: 600, services: 20, nom: 80, prix: 40, duree: 40, zone: 200, disponibilites: 300, urgences: 500, interdits: 500, faq: 12, q: 160, r: 400, consignes: 1200, prononciations: 10, mot: 60, dit: 80 }
export const SPEED_MIN = 0.85, SPEED_MAX = 1.2

export const emptyConfig = (): ReceptionConfig => ({
  voice: DEFAULT_VOICE, speed: 1, enabled: true, pickup: DEFAULT_PICKUP, operator: "orange", forwardApplied: "", tutoiement: false, presentation: "", services: [], zone: "", disponibilites: "",
  urgences: "", interdits: "", faq: [], consignes: "", prononciations: [],
})

// Texte libre : sans caractères de contrôle, espaces normalisés (sauts de ligne gardés), tronqué.
const clean = (v: unknown, max: number) => typeof v !== "string" ? "" : v.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max)
const line = (v: unknown, max: number) => clean(v, max).replace(/\s*\n\s*/g, " ")
const arr = (v: unknown) => Array.isArray(v) ? v : []

/** Lit une config (jsonb en base, saisie UI…) : toujours valide, jamais d'exception. */
function resolveVoice(raw: Record<string, unknown>, fallback: string): string {
  const cv = typeof raw.customVoice === "string" ? raw.customVoice.toLowerCase().trim() : ""
  if (cv === CUSTOM_VOICE_KERYAN) return CUSTOM_VOICE_KERYAN
  const v = typeof raw.voice === "string" ? raw.voice.toLowerCase().trim() : ""
  if (v === CUSTOM_VOICE_KERYAN || (v && isVoiceId(v) && isCustomVoiceId(v))) return CUSTOM_VOICE_KERYAN
  if (v && isVoiceId(v) && !isCustomVoiceId(v)) return v
  return fallback
}

export function normalizeConfig(raw: unknown): ReceptionConfig {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  const base = emptyConfig()
  const sp = Number(o.speed)
  return {
    voice: resolveVoice(o, base.voice),
    speed: Number.isFinite(sp) && sp > 0 ? Math.round(Math.min(SPEED_MAX, Math.max(SPEED_MIN, sp)) * 100) / 100 : 1,
    enabled: o.enabled !== false,
    pickup: o.pickup === "direct" ? "direct" : DEFAULT_PICKUP,
    operator: o.operator === "sfr" || o.operator === "bouygues" || o.operator === "free" ? o.operator : "orange",
    forwardApplied: o.forwardApplied === "off" || o.forwardApplied === "direct" || o.forwardApplied === "fallback" ? o.forwardApplied : "",
    tutoiement: o.tutoiement === true,
    presentation: clean(o.presentation, LIMITS.presentation),
    services: arr(o.services).map(s => s && typeof s === "object" ? s as Record<string, unknown> : {}).map(s => ({ nom: line(s.nom, LIMITS.nom), prix: line(s.prix, LIMITS.prix), duree: line(s.duree, LIMITS.duree) })).filter(s => s.nom).slice(0, LIMITS.services),
    zone: line(o.zone, LIMITS.zone),
    disponibilites: clean(o.disponibilites, LIMITS.disponibilites),
    urgences: clean(o.urgences, LIMITS.urgences),
    interdits: clean(o.interdits, LIMITS.interdits),
    faq: arr(o.faq).map(f => f && typeof f === "object" ? f as Record<string, unknown> : {}).map(f => ({ q: line(f.q, LIMITS.q), r: clean(f.r, LIMITS.r) })).filter(f => f.q && f.r).slice(0, LIMITS.faq),
    consignes: clean(o.consignes, LIMITS.consignes),
    // Clés acceptées par xAI : lettres, chiffres, apostrophes, espaces.
    // Mot avec ponctuation/symboles ignoré (pas de troncature : « C++ » remplacerait chaque « C »).
    prononciations: arr(o.prononciations).map(p => p && typeof p === "object" ? p as Record<string, unknown> : {}).map(p => ({ mot: line(p.mot, LIMITS.mot), dit: line(p.dit, LIMITS.dit) })).filter(p => p.mot.length >= 2 && /^[\p{L}\p{N}' ’]+$/u.test(p.mot) && p.dit && p.mot.toLowerCase() !== p.dit.toLowerCase()).slice(0, LIMITS.prononciations),
  }
}

/** Version compacte pour l'enregistrement en base (champs vides retirés des listes).
 *  La voix custom est stockée dans customVoice : reception_config.voice reste une voix intégrée (contrainte Postgres update57). */
export function serializeConfig(c: ReceptionConfig) {
  const n = normalizeConfig(c)
  const custom = isCustomVoiceId(n.voice)
  return {
    v: 1,
    ...n,
    voice: custom ? DEFAULT_VOICE : n.voice,
    ...(custom ? { customVoice: CUSTOM_VOICE_KERYAN } : {}),
    services: n.services.map(s => ({ nom: s.nom, ...(s.prix ? { prix: s.prix } : {}), ...(s.duree ? { duree: s.duree } : {}) })),
  }
}

/** L'IA décroche-t-elle sur la ligne Akno ? Absent ou invalide = oui (comportement historique). */
export const isReceptionEnabled = (raw: unknown) => normalizeConfig(raw).enabled

/** Métier saisi à l'inscription (« Plombier ») → activité prononçable (« plomberie »). */
const ACTIVITE: Record<string, string> = {
  "électricien": "électricité", "electricien": "électricité", "plombier": "plomberie", "chauffagiste": "chauffage", "serrurier": "serrurerie",
  "peintre": "peinture", "menuisier": "menuiserie", "maçon": "maçonnerie", "macon": "maçonnerie", "couvreur": "couverture", "carreleur": "carrelage",
  "plaquiste": "plâtrerie et cloisons", "climaticien": "climatisation", "multiservice": "multi-services", "multiservices": "multi-services", "autre": "",
}
export function metierActivite(m?: string | null) {
  const t = (m || "").trim()
  if (!t) return ""
  const k = t.toLowerCase()
  return k in ACTIVITE ? ACTIVITE[k] : t
}

export type Horaires = Record<string, [string, string] | null>
const DAYS: [string, string][] = [["lun", "lundi"], ["mar", "mardi"], ["mer", "mercredi"], ["jeu", "jeudi"], ["ven", "vendredi"], ["sam", "samedi"], ["dim", "dimanche"]]
const hh = (t: string) => { const [h, m] = t.split(":"); return `${Number(h)} h${m && m !== "00" ? ` ${m}` : ""}` }
/** {lun:["08:00","18:00"],…} → « du lundi au vendredi de 8 h à 18 h, fermé samedi et dimanche ». Vide si invalide. */
export function formatHoraires(raw: unknown) {
  if (!raw || typeof raw !== "object") return ""
  const h = raw as Record<string, unknown>
  const val = (k: string) => { const v = h[k]; return Array.isArray(v) && /^\d\d:\d\d$/.test(String(v[0])) && /^\d\d:\d\d$/.test(String(v[1])) ? `${v[0]}-${v[1]}` : "" }
  const groups: { from: string; to: string; v: string }[] = []
  for (const [k, l] of DAYS) { const v = val(k); const g = groups[groups.length - 1]; if (g && g.v === v) g.to = l; else groups.push({ from: l, to: l, v }) }
  const open = groups.filter(g => g.v)
  if (!open.length) return ""
  const days = (g: { from: string; to: string }) => g.from === g.to ? `le ${g.from}` : `du ${g.from} au ${g.to}`
  const parts = open.map(g => { const [a, b] = g.v.split("-"); return `${days(g)} de ${hh(a)} à ${hh(b)}` })
  const closed = groups.filter(g => !g.v).map(g => g.from === g.to ? g.from : `du ${g.from} au ${g.to}`)
  return parts.join(", ") + (closed.length ? `, fermé ${closed.join(" et ")}` : "")
}

/** Valeurs proposées quand l'artisan n'a rien saisi (affichées en grisé dans le configurateur). */
export function suggestedDefaults(p: { company?: string; metier?: string; city?: string; rayon?: string }) {
  const act = metierActivite(p.metier)
  const city = p.city && p.city !== "votre secteur" ? p.city.replace(/^\d{5}\s*/, "").trim() : ""
  return {
    presentation: `${p.company || "Notre entreprise"} est une entreprise${act ? ` de ${act}` : " artisanale"}${city ? ` basée à ${city}` : ""}. Nous intervenons chez les particuliers et les professionnels, pour le dépannage comme pour les travaux.`,
    zone: `${p.rayon || "30 km"} autour de ${city || "notre atelier"}`,
    urgences: "Fuite active, plus d'eau chaude ou de chauffage en hiver, panne électrique totale ou odeur de gaz : consignes de sécurité puis rappel au plus vite.",
    interdits: "Aucun prix de travaux, aucune date d'intervention sans créneau réel, aucun geste commercial.",
  }
}

export function hasCustom(c: ReceptionConfig) {
  return !!(c.presentation || c.services.length || c.zone || c.disponibilites || c.urgences || c.interdits || c.faq.length || c.consignes || c.prononciations.length || c.tutoiement)
}
export const hasPricedService = (c?: ReceptionConfig | null) => !!c?.services.some(s => s.prix)

/** Bloc du prompt « infos de l'artisan ». Vide si rien n'est saisi (prompt identique à l'update56). */
export function formatConfigForPrompt(c?: ReceptionConfig | null) {
  if (!c || !hasCustom(c)) return ""
  const out: string[] = []
  if (c.tutoiement) out.push(`TON CHOISI PAR L'ARTISAN : tutoiement. Tutoie le client du début à la fin, avec respect et sans familiarité ; adapte les phrases modèles ci-dessus (« Quand es-tu disponible ? », « Peux-tu m'épeler ton adresse e-mail ? »).`)
  if (c.presentation) out.push(`PRÉSENTATION DE L'ENTREPRISE (si on te demande qui vous êtes ou ce que vous faites, résume-la en une ou deux phrases) :\n${c.presentation}`)
  if (c.services.length) {
    out.push(`PRESTATIONS RÉALISÉES (liste de l'artisan, fait foi pour savoir si une demande est dans notre champ) :\n${c.services.map(s => `- ${s.nom}${s.prix ? ` — prix indicatif : ${s.prix}` : ""}${s.duree ? ` — durée habituelle : ${s.duree}` : ""}`).join("\n")}`
      + (hasPricedService(c) ? `\nUn prix indicatif de cette liste peut être donné tel quel, en précisant que c'est indicatif et que le prix définitif est confirmé par l'artisan (devis ou visite). Jamais d'autre prix.` : ""))
  }
  if (c.disponibilites) out.push(`DISPONIBILITÉS ET DÉLAIS (indications de l'artisan ; les créneaux réels restent ceux de l'agenda) :\n${c.disponibilites}`)
  if (c.urgences) out.push(`URGENCES — CONSIGNES DE L'ARTISAN (en plus de la catégorie C, jamais à la place des consignes de sécurité) :\n${c.urgences}`)
  if (c.faq.length) out.push(`QUESTIONS FRÉQUENTES (réponds avec ces réponses, reformulées naturellement et brièvement) :\n${c.faq.map(f => `Q : ${f.q}\nR : ${f.r}`).join("\n")}`)
  if (c.consignes) out.push(`CONSIGNES PARTICULIÈRES DE L'ARTISAN :\n${c.consignes}`)
  if (c.interdits) out.push(`À NE JAMAIS PROMETTRE NI DIRE (consigne absolue de l'artisan) :\n${c.interdits}`)
  return `INFOS DE L'ARTISAN (configurées dans « Ma réceptionniste » — elles complètent les règles ci-dessus ; en cas de conflit, la sécurité (gaz, 112), l'annonce d'enregistrement, ne jamais se dire humaine, ne jamais inventer un prix ou un créneau, priment toujours) :\n\n${out.join("\n\n")}`
}

/** session.replace (prononciation). Undefined si vide. */
export function replaceMap(c?: ReceptionConfig | null) {
  if (!c?.prononciations.length) return undefined
  return Object.fromEntries(c.prononciations.map(p => [p.mot, p.dit]))
}

/** Exemples rapides pour démarrer (bouton « Ajouter des exemples »), selon le métier. */
export function starterServices(metier?: string): Service[] {
  const a = metierActivite(metier).toLowerCase()
  if (/plomb/.test(a)) return [{ nom: "Recherche et réparation de fuite" }, { nom: "Débouchage canalisation / WC" }, { nom: "Remplacement chauffe-eau / ballon" }, { nom: "Pose de robinetterie et sanitaires" }]
  if (/[ée]lectri/.test(a)) return [{ nom: "Dépannage électrique" }, { nom: "Mise aux normes du tableau électrique" }, { nom: "Pose de prises, interrupteurs, luminaires" }, { nom: "Diagnostic et rénovation électrique" }]
  if (/chauff|clim/.test(a)) return [{ nom: "Entretien annuel de chaudière" }, { nom: "Dépannage chaudière / pompe à chaleur" }, { nom: "Installation de pompe à chaleur ou climatisation" }, { nom: "Désembouage des radiateurs" }]
  if (/serrur/.test(a)) return [{ nom: "Ouverture de porte claquée" }, { nom: "Changement de serrure / cylindre" }, { nom: "Pose de porte blindée" }]
  if (/peint/.test(a)) return [{ nom: "Peinture intérieure" }, { nom: "Ravalement de façade" }, { nom: "Pose de revêtements muraux" }]
  if (/couver|toit/.test(a)) return [{ nom: "Recherche de fuite toiture" }, { nom: "Réparation de couverture" }, { nom: "Nettoyage et pose de gouttières" }]
  return [{ nom: "Dépannage" }, { nom: "Petits travaux de rénovation" }, { nom: "Entretien des équipements" }]
}
