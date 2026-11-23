import { formatTarifsForPrompt, mergeTarifs, type Tarifs } from "../tarifs"
import { formatPhonePairs, hasEmergencyPhone } from "../phone"
import { DEFAULT_VOICE, formatConfigForPrompt, formatHoraires, hasPricedService, metierActivite, normalizeConfig, replaceMap, type ReceptionConfig } from "./receptionist"

export type VoiceProfile = {
  prenom: string
  company: string
  email: string
  phone: string
  address: string
  city: string
  metier: string
  rayon: string
  tarifs?: Tarifs
  telephoneUrgence?: string
  /** update48 : message d'accueil personnalisé (Paramètres › Réceptionniste) */
  accueil?: string
  /** update57 : configuration « Ma réceptionniste » (artisans.reception_config) */
  reception?: ReceptionConfig
  /** update57 : horaires d'ouverture (artisans.horaires, update48) */
  horaires?: unknown
}

const PLACEHOLDER_COMPANY = /^l['\u2019]entreprise$/i

/** Nom d'enseigne prononcé : jamais « l'entreprise ». Vide → Akno. */
export function companyName(...vals: Array<string | null | undefined>) {
  for (const v of vals) {
    const t = (v ?? "").trim()
    if (t && !PLACEHOLDER_COMPANY.test(t)) return t
  }
  return "Akno"
}

export const emptyProfile = (): VoiceProfile => ({
  prenom: "l'artisan",
  company: "Akno",
  email: "",
  phone: "",
  address: "",
  city: "votre secteur",
  metier: "bâtiment",
  rayon: "30 km",
  tarifs: mergeTarifs(),
  telephoneUrgence: "",
})

export function mergeProfile(partial?: Partial<VoiceProfile> | null): VoiceProfile {
  const base = emptyProfile()
  if (!partial) return base
  const pick = (v?: string, fallback = "") => (v && v.trim()) || fallback
  const tarifs = mergeTarifs(partial.tarifs)
  return {
    prenom: pick(partial.prenom, base.prenom),
    company: companyName(partial.company, base.company),
    email: pick(partial.email),
    phone: pick(partial.phone),
    address: pick(partial.address),
    city: pick(partial.city, base.city),
    metier: pick(metierActivite(partial.metier), base.metier),
    rayon: tarifs.zoneKm != null ? `${tarifs.zoneKm} km` : pick(partial.rayon, base.rayon),
    tarifs,
    telephoneUrgence: pick(partial.telephoneUrgence),
    accueil: pick(partial.accueil),
    reception: normalizeConfig(partial.reception),
    horaires: partial.horaires && typeof partial.horaires === "object" ? partial.horaires : undefined,
  }
}

/** Voix xAI par défaut (session.update.voice) si l'artisan n'en a pas choisi — voir DEFAULT_VOICE dans ./receptionist.ts. */
export const VOICE_ID = DEFAULT_VOICE

/** Annonce d'enregistrement : courte, après l'accueil. */
export const RECORDING_NOTICE = "Appel enregistré."

export function welcomeLine(p: VoiceProfile) {
  const custom = (p.accueil || "").replace(/\s+/g, " ").trim()
  const co = companyName(p.company)
  const listen = p.reception?.tutoiement ? "je t'écoute" : "je vous écoute"
  if (custom) {
    const hasRec = /enregistr/i.test(custom)
    const end = (t: string) => (/[.!?…]$/.test(t) ? t : `${t}.`)
    return hasRec ? custom : `${end(custom)} ${RECORDING_NOTICE}`
  }
  return `${co}, bonjour, ${listen}. ${RECORDING_NOTICE}`
}

const KEYTERMS_RAW = [
  "Akno", "devis", "dépannage",
  "chaudière", "cumulus", "ballon d'eau chaude", "chauffe-eau",
  "VMC", "disjoncteur", "tableau électrique",
  "fuite", "fuite d'eau", "dégât des eaux",
  "robinetterie", "robinet", "mitigeur", "siphon", "chasse d'eau",
  "WC", "toilettes",
  "radiateur", "pompe à chaleur", "clim", "climatisation",
  "carrelage", "faïence", "placo", "enduit", "ravalement",
  "toiture", "gouttière", "tuile", "zinguerie",
  "menuiserie", "volet roulant",
  "canalisation", "débouchage", "ramonage",
  "entretien chaudière", "contrat d'entretien", "abonnement",
  "lavabo", "évier", "luminaire", "interrupteur",
  "isolation", "infiltration", "moisissure",
  "code d'accès", "GRDF", "pression", "purge",
  "MaPrimeRénov'", "garantie décennale", "syndic", "serrure",
  "arobase", "underscore", "tiret bas",
] as const

/** xAI grok-transcribe : max 100 termes, 50 caractères chacun. */
export const KEYTERMS = KEYTERMS_RAW.map(t => t.slice(0, 50)).slice(0, 100)

export type SlotHint = { label?: string; date?: string; heure?: string }

export function formatSlotsHint(slots: SlotHint[]) {
  const top = slots.filter(s => s.label || (s.date && s.heure)).slice(0, 8)
  if (!top.length) return ""
  const lines = top.map(s => `- ${s.label || `${s.date} à ${s.heure}`} (date ${s.date || ""}, heure ${s.heure || ""})`)
  return `

CRÉNEAUX DÉJÀ CONSULTÉS (à partir de demain, heure de Paris) :
${lines.join("\n")}
Demande d'abord « Quand êtes-vous disponible ? » et attends sa réponse (jour, matin / après-midi, fin de semaine…). Propose ensuite le ou les créneaux de cette liste qui correspondent le mieux, les plus proches de sa demande. N'appelle get_available_slots que si la période demandée n'est pas couverte ici, ou si cette liste est vide. N'annonce pas « Je regarde… » : le système le dit si l'agenda est lent. Ne propose des créneaux sans avoir demandé sa préférence que s'il dit qu'il n'en a pas (« peu importe », « dès que possible »). N'appelle book_appointment qu'une fois le créneau choisi et le prénom, le nom, le téléphone, l'e-mail et l'adresse collectés.`
}

function urgenceNumberBlock(raw?: string) {
  const spoken = formatPhonePairs(raw)
  if (!hasEmergencyPhone(raw) || !spoken) {
    return `NUMÉRO D'URGENCE : aucun n'est renseigné. En catégorie C, ne donne aucun numéro personnel. Après les consignes de sécurité, prends nom, prénom, téléphone et adresse ; l'artisan rappelle au plus vite.`
  }
  return `NUMÉRO D'URGENCE (uniquement en catégorie C, jamais pour un appel non urgent) : ${spoken}.
Après les consignes de sécurité, dis exactement : « Un numéro d'urgence est disponible, vous pouvez le noter ? »
ATTENDS la réponse du client avant de le dicter.
S'il accepte, dicte-le lentement par paires : ${spoken}. Propose ensuite de le répéter.
S'il refuse, ne le donne pas : prends ses coordonnées et l'artisan rappelle au plus vite.`
}

function contactBlock(opts: { emailRole?: string; emailOptional?: boolean }) {
  const ifMissing = opts.emailOptional
    ? "N'insiste pas sur l'e-mail s'il saute : dans ce cas, ne demande pas de l'épeler."
    : "S'il n'a pas donné d'e-mail, redemande-le, puis fais-le épeler."
  const role = opts.emailRole ? ` ${opts.emailRole}` : ""
  return `« Pouvez-vous me donner votre nom, prénom, email et numéro de téléphone ? » Puis uniquement ce qui manque. ${ifMissing}
Dès qu'un e-mail est donné — même s'il te paraît clair, même s'il l'a déjà dit en toutes lettres — demande TOUJOURS exactement : « Pouvez-vous m'épeler votre adresse email, s'il vous plaît ? » S'il a déjà épelé lettre par lettre dans la même réponse, ne redemande pas : transcris et fais seulement la relecture brève.
Écoute lettre par lettre. Écris l'e-mail exactement comme épelé, sans espaces : « arobase », « arobasse » ou « at » → @ ; « point » → . ; « tiret » ou « trait d'union » → - ; « underscore », « tiret bas » ou « tiret du 8 » → _. « point com » → .com, « point fr » → .fr. L'épellation prime sur ce qu'il a dicté avant : ne « corrige » pas l'orthographe. Si une partie est peu claire, redemande seulement cette partie, sans inventer.
Ensuite, une seule relecture brève de cet e-mail (ex. « Donc c'est [e-mail]. »), sans « C'est bien ça ? » ni « Je relis ». S'il corrige, reprends ; sinon enchaîne. Pas d'autre confirmation champ par champ.
Si le téléphone est peu clair, reformule-le naturellement, sans dire « Je relis » ni demander si c'est juste.
Ensuite, séparément : « Et l'adresse de votre domicile ? »${role}`
}

export function buildInstructions(p: VoiceProfile) {
  const addr = p.address || "l'adresse de l'entreprise n'est pas renseignée, tu la transmets à l'artisan"
  const email = p.email || "l'e-mail n'est pas renseigné, tu prends le message et l'artisan rappellera"
  const metier = (p.metier || "bâtiment").trim() || "bâtiment"
  const metierLarge = /b[aâ]timent|btp|multi[- ]?services|g[eé]n[eé]ral/i.test(metier)
  const champMetier = metierLarge
    ? "le multi-services BTP courant (plomberie, chauffage, électricité, rénovation, entretien des équipements du bâtiment)"
    : metier
  const cfg = p.reception
  const services = cfg?.services.map(x => x.nom).join(", ") || ""
  const champ = services ? `${champMetier} — prestations listées par l'artisan : ${services}` : champMetier
  const zone = cfg?.zone || `rayon ${p.rayon} autour de ${p.city}`
  const horaires = formatHoraires(p.horaires)
  const priced = hasPricedService(cfg)
  const extra = formatConfigForPrompt(cfg)
  return `Tu es la secrétaire de ${p.company}, entreprise de ${metier} à ${p.city} (rayon ${p.rayon}). Champ : ${champ}.

TON — Secrétaire de PME du BTP, pas un robot. Français, ${cfg?.tutoiement ? "tutoiement" : "vouvoiement"}. Phrases courtes. « D'accord », « Très bien », « C'est noté », puis UNE question. Interdit : « C'est bien ça ? », « Je relis », répéter un numéro ou une adresse déjà confirmés, listes à voix haute, markdown, monologues. Un numéro se confirme UNE seule fois. Un seul récap, juste avant de conclure. Tu ne te présentes pas à nouveau : l'accueil est déjà joué. Si on te demande si tu es une personne : « Je suis l'assistante de ${p.company}, je prends votre demande et l'artisan vous rappelle. » Ne le dis pas sinon. Ne prononce pas le prénom de l'artisan : « l'artisan », « notre technicien », « ${p.company} ». Ne redemande jamais une info déjà donnée (sauf épellation de l'e-mail, une fois).

LEXIQUE (tu comprends et emploies ces mots, tu ne les corriges pas) : chaudière, cumulus / ballon d'eau chaude, chauffe-eau, VMC, disjoncteur, tableau électrique, fuite, dégât des eaux, robinetterie, mitigeur, siphon, WC, radiateur, pompe à chaleur, clim, carrelage, faïence, placo, enduit, ravalement, toiture, gouttière, tuile, zinguerie, menuiserie, volet roulant, canalisation, débouchage, ramonage.

DÉROULÉ (dans cet ordre, une question à la fois)
1. Motif. 2. Urgence (ça coule encore, plus de chauffage, plus d'électricité, seul WC, gaz ?) → si oui C. 3. Nom et prénom. 4. Téléphone, confirmé une fois. 5. Adresse (+ code d'accès si besoin). 6. Créneau (A/B). 7. Récap court (nom, motif, lieu, date/heure). 8. Appelle save_call AVANT de dire au revoir. Puis seulement : « Merci, au revoir. »

A — Diagnostic (chaudière, ballon non identique, PAC, tableau, panne, rénovation, fuite à voir) : une question de précision, « l'artisan doit passer pour un diagnostic, quand êtes-vous disponible ? », puis vrais créneaux (get_available_slots, jamais inventés, pas aujourd'hui sauf demande). Coordonnées : ${contactBlock({ emailRole: "L'e-mail sert à la confirmation du RDV." })} book_appointment. Si reason taken : deux alternatives. Si technical : suis l'instruction, ne dis jamais que le créneau est pris. Récap, save_call (devis_demande false).

B — Devis maintenant (forfait entretien/ramonage/contrat, ou remplacement à l'identique : WC, robinet, mitigeur, lavabo, évier, ballon identique, prise, luminaire) : précisions, propose un devis (tarif listé seulement s'il existe, rien ne part sans l'artisan). Coordonnées : ${contactBlock({ emailRole: "L'e-mail sert à l'envoi du devis." })} Créneau seulement s'il en veut, mêmes règles qu'en A. Récap, save_call (devis_demande true, type_demande devis).

C — Urgence (fuite active, dégât des eaux, plus de chauffage/eau chaude en hiver, panne électrique, seul WC bouché, odeur de gaz) : rassurer, consigne utile (eau : vanne générale ; électricité : disjoncteur, rien de mouillé ; gaz : couper le gaz, aucun interrupteur, ouvrir, sortir, 112 et/ou GRDF 0 800 47 33 33).
${urgenceNumberBlock(p.telephoneUrgence)}
Coordonnées : ${contactBlock({ emailOptional: true })} rappel au plus vite, save_call (rappel_souhaite true, urgence urgent, type_demande urgence) AVANT au revoir. Hors gaz déjà aux secours : proposer une visite (A), pas de devis.

D — Rappel : seulement s'il n'est pas déjà prévu. « Souhaitez-vous être rappelé ? » + le moment.

${formatTarifsForPrompt(p.tarifs)}
Prix : uniquement les tarifs listés plus bas${priced ? " et les prix indicatifs des prestations de l'artisan" : ""}. Jamais le prix des travaux, jamais d'IBAN/carte. Zone : ${zone} (hors zone : le dire, prendre le numéro). Horaires : ${horaires || "semaine, 8 h–18 h"}. Suivi RDV / facture / réclamation : noter, l'artisan rappelle.

Entreprise : ${p.company}, ${addr}, ${email}.${extra ? `\n${extra}` : ""}`
}

export const VOICE_TOOLS = [
  {
    type: "function",
    name: "get_available_slots",
    description: "Consulte l'agenda réel et renvoie les créneaux libres (lundi–vendredi, 8 h–18 h, heure de Paris). À appeler après que le client a indiqué une période, si aucun créneau préchargé ne correspond, ou si la liste préchargée est vide. Passe date_from, date_to ou preferred_day d'après sa réponse. N'annonce pas « Je regarde… » : le système le dit si l'appel réseau est lent.",
    parameters: {
      type: "object",
      properties: {
        date_from: { type: "string", description: "Début de période YYYY-MM-DD" },
        date_to: { type: "string", description: "Fin de période YYYY-MM-DD" },
        preferred_day: { type: "string", description: "Jour souhaité : lundi…vendredi, aujourd'hui, demain, ou YYYY-MM-DD" },
        duree_minutes: { type: "number", description: "Durée en minutes, 60 par défaut" },
      },
    },
  },
  {
    type: "function",
    name: "book_appointment",
    description: "Réserve le créneau choisi APRÈS avoir collecté prénom, nom, téléphone, e-mail et adresse. Vérifie qu'il est encore libre ; s'il est pris (reason taken), renvoie des alternatives sans l'enregistrer. reason technical = souci technique : le créneau N'EST PAS pris, suis le champ instruction.",
    parameters: {
      type: "object",
      properties: {
        prenom: { type: "string", description: "Prénom du client" },
        nom: { type: "string", description: "Nom de famille du client" },
        client: { type: "string", description: "Nom complet (prénom + nom) si prenom et nom ne sont pas envoyés séparément" },
        telephone: { type: "string", description: "Numéro de téléphone" },
        email: { type: "string", description: "E-mail du client tel qu'épelé (arobase → @, point → ., tiret → -, underscore → _) : confirmation du RDV (A) ou envoi du devis (B : forfait ou remplacement simple à l'identique)" },
        date: { type: "string", description: "Date du rendez-vous au format YYYY-MM-DD" },
        heure: { type: "string", description: "Heure de début au format HH:MM (24 h)" },
        duree_minutes: { type: "number", description: "Durée en minutes, 60 par défaut" },
        objet: { type: "string", description: "Motif du rendez-vous, ex. Diagnostic chaudière" },
        adresse: { type: "string", description: "Adresse complète du chantier" },
        ville: { type: "string" },
        notes: { type: "string" },
      },
      required: ["prenom", "nom", "telephone", "email", "adresse", "date", "heure", "objet"],
    },
  },
  {
    type: "function",
    name: "save_call",
    description: "Enregistre le bilan de l'appel dans Réception. À appeler après le récapitulatif, ou juste avant de conclure. Inclure toutes les informations collectées. N'entraîne pas la génération automatique d'un devis.",
    parameters: {
      type: "object",
      properties: {
        nom_client: { type: "string" },
        telephone_client: { type: "string" },
        adresse: { type: "string" },
        ville: { type: "string" },
        code_postal: { type: "string" },
        motif: { type: "string", description: "Sujet court, ex. Fuite sous évier" },
        besoin_detail: { type: "string" },
        resume: { type: "string", description: "Résumé complet de l'appel en 2 à 4 phrases" },
        type_demande: {
          type: "string",
          enum: ["urgence", "depannage", "devis", "rdv", "suivi", "reclamation", "facture", "commercial", "autre"],
        },
        urgence: { type: "string", enum: ["normal", "urgent"] },
        a_rappeler: { type: "boolean", description: "Identique à rappel_souhaite : true si le client souhaite être rappelé par l'artisan" },
        rappel_souhaite: { type: "boolean", description: "true si le client souhaite être rappelé par l'artisan / l'ouvrier" },
        rappel_creneau: { type: "string", description: "Moment préféré pour le rappel, texte libre (ex. demain matin, cet après-midi). Uniquement si rappel_souhaite est true." },
        devis_demande: { type: "boolean", description: "true en catégorie B (forfait / entretien / ramonage / contrat, ou remplacement simple à l'identique : WC, robinet, mitigeur, chasse d'eau, lavabo, évier, ballon identique, prise, interrupteur, luminaire). false en catégorie A (diagnostic) et hors prestation. Note seulement la demande : l'artisan générera le brouillon depuis la fiche client." },
        email_client: { type: "string", description: "E-mail du client tel qu'épelé (arobase → @, point → ., tiret → -, underscore → _) : envoi du devis (B) ou confirmation du rendez-vous (A)." },
        rdv_pris: { type: "boolean" },
        notes: { type: "string" },
      },
      required: ["resume"],
    },
  },
] as const

export const TURN_DETECTION = {
  type: "server_vad" as const,
  // xAI documente server_vad + idle_timeout_ms (pas semantic_vad / eagerness).
  // silence_duration plus court = elle répond plus vite ; 330 ms reste assez long pour ne pas couper le client.
  threshold: 0.72,
  silence_duration_ms: 330,
  prefix_padding_ms: 200,
  idle_timeout_ms: 8000,
}

export function buildSessionConfig(p: VoiceProfile, sampleRate: number, slotsNote?: string) {
  const keyterms = [...KEYTERMS]
  if (p.company && !keyterms.includes(p.company)) keyterms.push(p.company.slice(0, 50))
  const cfg = p.reception || normalizeConfig(null)
  const replace = replaceMap(cfg)
  return {
    voice: cfg.voice || VOICE_ID,
    instructions: buildInstructions(p) + (slotsNote || ""),
    ...(replace ? { replace } : {}),
    reasoning: { effort: "none" as const },
    turn_detection: TURN_DETECTION,
    tools: VOICE_TOOLS,
    audio: {
      input: {
        format: { type: "audio/pcm", rate: sampleRate },
        transcription: { language_hint: "fr", model: "grok-transcribe", keyterms },
      },
      output: {
        format: { type: "audio/pcm", rate: 24000 },
        speed: cfg.speed || 1.0,
      },
    },
  }
}
