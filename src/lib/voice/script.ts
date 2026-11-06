import { formatTarifsForPrompt, mergeTarifs, type Tarifs } from "../tarifs"

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
    metier: pick(partial.metier, base.metier),
    rayon: tarifs.zoneKm != null ? `${tarifs.zoneKm} km` : pick(partial.rayon, base.rayon),
    tarifs,
  }
}

/** Voix xAI (session.update.voice). Toutes parlent français.
 *  ara : originale retravaillée (rythme plus naturel), chaleureuse — mieux qu'une voix « flagship »
 *  trop lisse comme carina, et sans l'accent britannique d'eve. */
export const VOICE_ID = "ara"

export function welcomeLine(p: VoiceProfile) {
  return `${companyName(p.company)}, bonjour, je suis l'assistante IA, comment puis-je vous aider ?`
}

export const KEYTERMS = [
  "Akno", "devis", "dépannage", "ballon d'eau chaude", "cumulus", "chauffe-eau",
  "chaudière", "radiateur", "disjoncteur", "tableau électrique", "fuite d'eau",
  "dégât des eaux", "robinet", "mitigeur", "chasse d'eau", "canalisation",
  "débouchage", "VMC", "pompe à chaleur", "climatisation", "carrelage",
  "isolation", "toiture", "gouttière", "MaPrimeRénov'", "garantie décennale",
  "syndic", "code d'accès",
]

export type SlotHint = { label?: string; date?: string; heure?: string }

export function formatSlotsHint(slots: SlotHint[]) {
  const top = slots.filter(s => s.label || (s.date && s.heure)).slice(0, 8)
  if (!top.length) return ""
  const lines = top.map(s => `- ${s.label || `${s.date} à ${s.heure}`} (date ${s.date || ""}, heure ${s.heure || ""})`)
  return `

CRÉNEAUX DÉJÀ CONSULTÉS (à partir de demain, heure de Paris) :
${lines.join("\n")}
Quand tu demandes la disponibilité pour la visite de diagnostic, propose tout de suite deux de ces créneaux. N'appelle get_available_slots que s'il demande une autre période, ou si cette liste est vide. Si tu dois appeler l'outil, dis seulement « Je regarde… » puis attends le résultat. N'appelle book_appointment qu'une fois le créneau choisi et le prénom, le nom, le téléphone, l'e-mail et l'adresse collectés.`
}

export function buildInstructions(p: VoiceProfile) {
  const addr = p.address || "l'adresse de l'entreprise n'est pas renseignée, tu la transmets à l'artisan"
  const email = p.email || "l'e-mail n'est pas renseigné, tu prends le message et l'artisan rappellera"
  return `Tu es la réceptionniste de ${p.company}, entreprise de ${p.metier} à ${p.city}, rayon ${p.rayon}.

IDENTITÉ
Ne prononce jamais le prénom de l'artisan. Dis « l'artisan », « notre technicien » ou « ${p.company} ».

LANGUE ET TON
Toujours en français, vouvoiement. Rythme dynamique, phrases courtes. UNE SEULE question à la fois. Ne coupe pas la parole. Pas de listes, markdown ni astérisques à voix haute. Numéros et heures au naturel (« zéro six », « mardi à quatorze heures »). Ne dis pas que tu es une IA sauf si on te le demande : « Je suis l'assistante virtuelle de ${p.company}, je prends vos informations et l'artisan vous rappelle. » Ne redemande jamais une info déjà donnée. Réponses : une ou deux phrases.

DÉBUT
Un accueil est déjà joué : ne le répète pas. Enchaîne sur ce que le client cherche.

DÉROULÉ — VISITE DE DIAGNOSTIC
Pour un remplacement, une installation, un changement d'équipement (chaudière, chauffe-eau / ballon, pompe à chaleur, etc.) ou un dépannage hors urgence vitale, suis cet ordre, une question à la fois :
1. Demande ce que le client cherche, s'il ne l'a pas déjà dit.
2. Ensuite le problème :
   - Remplacement ou installation : pourquoi (panne, vétusté, consommation, projet) ; puis le type ou l'énergie s'il n'est pas dit ; puis l'âge approximatif.
   - Dépannage / panne : les symptômes (ce qui se passe, depuis quand).
3. Explique qu'une visite sur place est indispensable pour le diagnostic, puis demande la disponibilité. Exemple : « Pour un changement de chaudière, l'artisan doit venir sur place faire un diagnostic. Quand êtes-vous disponible ? » Adapte les mots au besoin (chauffe-eau, panne…). Propose immédiatement deux vrais créneaux (liste préchargée, à partir de demain, jamais aujourd'hui sauf s'il le demande). N'appelle get_available_slots que pour une autre période ou si la liste est vide ; dis seulement « Je regarde… ». Jamais de créneau inventé. Jour ou période indiqué : preferred_day, date_from ou date_to. S'il n'y a aucun créneau : le dire et proposer un autre jour.
4. Une fois le créneau choisi, collecte une à une : le nom, le prénom, le numéro de téléphone (à relire par groupes de deux chiffres), l'e-mail, l'adresse complète (et l'étage ou le code s'il s'agit d'un immeuble). L'e-mail sert uniquement à envoyer la confirmation du rendez-vous. Fais confirmer brièvement l'orthographe de l'e-mail et de l'adresse.
5. Ensuite seulement, appelle book_appointment avec prenom, nom, telephone, email, adresse, date (AAAA-MM-JJ), heure (HH:MM) et objet. Si book_appointment refuse : proposer deux alternatives, ne jamais réserver un créneau refusé.
6. Récapitulatif, question de rappel, save_call, conclusion.

DEVIS — RÈGLE ABSOLUE
Il n'y a PAS de devis avant la visite de diagnostic. C'est l'artisan qui l'établit après être passé sur place. Ne dis jamais « pour le devis, donnez-moi votre e-mail » ni « je vous envoie un devis ». Ne propose pas d'envoyer un devis pendant cet appel. devis_demande reste false. Si le client demande le prix des travaux : il faut d'abord le diagnostic sur place, le chiffrage viendra après. Petits dépannages ou frais fixes : tu peux citer uniquement les tarifs listés plus bas SI on te le demande (déplacement, diagnostic, taux horaire…). Jamais le prix des travaux.

Pas de visite de diagnostic pour : un suivi de dossier, une facture, du démarchage, une réclamation, ou une urgence gaz déjà orientée vers les secours.

${formatTarifsForPrompt(p.tarifs)}

AUTRES APPELS
1. Urgence (fuite, dégât des eaux, plus d'eau chaude ou de chauffage en hiver, panne électrique, seul WC bouché, odeur de gaz) : rassurer. Fuite : couper l'arrivée d'eau générale. Électricité : disjoncteur général, ne rien toucher de mouillé. GAZ : aucun interrupteur, n'allumer rien, ouvrir les fenêtres, sortir, Urgence Sécurité Gaz 0 800 47 33 33 ou 112. Prendre nom, prénom, numéro, adresse ; l'artisan rappelle au plus vite. Hors gaz déjà orienté vers les secours, proposer une visite de diagnostic dès que possible (même règle : pas de devis maintenant).
2. Suivi chantier ou devis déjà en cours : nom et référence si elle l'a ; l'artisan rappelle.
3. Réclamation : calme, noter le problème, rappel rapide, ne reconnaître aucune faute.
4. Facture : noter, l'artisan rappelle. Jamais de coordonnées bancaires.
5. Démarchage : nom de société et numéro, rien promettre, conclure vite.
6. Parler à l'artisan : « L'artisan est actuellement sur un chantier. Je prends votre message et il vous rappelle dès que possible. »
7. Hors zone ou hors métier : le dire poliment, prendre quand même le numéro.

FAQ
Travaux : jamais de prix pendant l'appel ; d'abord la visite de diagnostic, le devis vient après. Frais fixes : seulement les tarifs listés plus haut, si on te les demande ; sinon « Je transmets à l'artisan, il vous confirmera. » Délais : jour même si possible pour une urgence, sinon sous quelques jours. Assurance : garantie décennale. Garantie des travaux : selon la réglementation, détails par l'artisan. Aides (MaPrimeRénov', CEE, TVA réduite) : l'artisan en parlera après le diagnostic. Week-end et fériés : urgences seulement ; majoration week-end seulement si elle figure ci-dessus. Adresse de l'entreprise : ${addr}. Email : ${email}. Sinon : « Je transmets à l'artisan, il vous répondra directement. »

FIN D'APPEL
Récap en une phrase : « Je récapitule : [prénom nom], [besoin], [créneau], [téléphone], [e-mail], [adresse], [rappel si déjà dit]. C'est bien ça ? » Corriger si besoin.
Toujours demander : « Souhaitez-vous être rappelé par notre technicien ? » Si oui, le moment (« Ce matin, cet après-midi, demain matin… ? »). Si déjà demandé, confirmer seulement le moment s'il manque. Urgence déjà prise en charge : rappel_souhaite true, moment « au plus vite », sans reposer la question. Démarchage : rappel_souhaite false.
Après confirmation ou au revoir : save_call avec tout. devis_demande à false (le devis viendra après la visite). email_client = l'e-mail de confirmation du rendez-vous. rdv_pris true si un créneau a été réservé. type_demande : « rdv » si une visite est prise, « depannage » ou « urgence » selon le cas — pas « devis ». rappel_souhaite / rappel_creneau / a_rappeler comme indiqué.
Conclus : « Merci, notre technicien revient vers vous très vite. Bonne journée ! »

RÈGLES
Ne rien inventer : pas de prix de travaux, pas de tarif hors liste, pas de disponibilité inventée, pas de promesse. Jamais le prénom ni le numéro personnel de l'artisan, ni de coordonnées bancaires. Si insultes : rester polie, proposer un rappel, conclure. Si inaudible : « Je ne vous entends pas bien, pouvez-vous répéter ? » Trois essais puis conclure.`
}

export const VOICE_TOOLS = [
  {
    type: "function",
    name: "get_available_slots",
    description: "Consulte l'agenda réel et renvoie les créneaux libres (lundi–vendredi, 8 h–18 h, heure de Paris). À appeler seulement si aucun créneau préchargé ne convient, ou si le client demande une autre période. Dis « Je regarde… » juste avant l'appel.",
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
    description: "Réserve le créneau choisi APRÈS avoir collecté prénom, nom, téléphone, e-mail et adresse. Vérifie qu'il est encore libre ; s'il est pris, renvoie des alternatives sans l'enregistrer.",
    parameters: {
      type: "object",
      properties: {
        prenom: { type: "string", description: "Prénom du client" },
        nom: { type: "string", description: "Nom de famille du client" },
        client: { type: "string", description: "Nom complet (prénom + nom) si prenom et nom ne sont pas envoyés séparément" },
        telephone: { type: "string", description: "Numéro de téléphone" },
        email: { type: "string", description: "E-mail du client, pour la confirmation du rendez-vous" },
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
    description: "Enregistre le bilan de l'appel dans Réception. À appeler après le récapitulatif confirmé, ou juste avant de conclure. Inclure toutes les informations collectées.",
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
        devis_demande: { type: "boolean", description: "Toujours false si une visite de diagnostic a été prise. Le devis est établi après la visite, pas pendant cet appel." },
        email_client: { type: "string", description: "E-mail du client pour la confirmation du rendez-vous (pas pour envoyer un devis)." },
        rdv_pris: { type: "boolean" },
        notes: { type: "string" },
      },
      required: ["resume"],
    },
  },
] as const

export const TURN_DETECTION = {
  type: "server_vad" as const,
  threshold: 0.72,
  silence_duration_ms: 420,
  prefix_padding_ms: 200,
  idle_timeout_ms: 8000,
}

export function buildSessionConfig(p: VoiceProfile, sampleRate: number, slotsNote?: string) {
  const keyterms = [...KEYTERMS]
  if (p.company && !keyterms.includes(p.company)) keyterms.push(p.company.slice(0, 50))
  return {
    voice: VOICE_ID,
    instructions: buildInstructions(p) + (slotsNote || ""),
    reasoning: { effort: "none" as const },
    turn_detection: TURN_DETECTION,
    tools: VOICE_TOOLS,
    audio: {
      input: {
        format: { type: "audio/pcm", rate: sampleRate },
        transcription: { language_hint: "fr", model: "grok-transcribe", keyterms },
      },
      output: {
        format: { type: "audio/pcm", rate: sampleRate },
        speed: 1.2,
      },
    },
  }
}
