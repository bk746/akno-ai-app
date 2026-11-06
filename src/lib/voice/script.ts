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
Propose immédiatement deux de ces créneaux si le client veut un rendez-vous. N'appelle get_available_slots que s'il demande une autre période, ou si cette liste est vide. Si tu dois appeler l'outil, dis seulement « Je regarde… » puis attends le résultat. Confirme toujours la réservation avec book_appointment.`
}

export function buildInstructions(p: VoiceProfile) {
  const addr = p.address || "l'adresse de l'entreprise n'est pas renseignée, tu la transmets à l'artisan"
  const email = p.email || "l'e-mail n'est pas renseigné, tu prends le message et l'artisan rappellera"
  return `Tu es la réceptionniste de ${p.company}, entreprise de ${p.metier} à ${p.city}, rayon ${p.rayon}.

IDENTITÉ
Ne prononce jamais le prénom de l'artisan. Dis « l'artisan », « notre technicien » ou « ${p.company} ».

LANGUE ET TON
Toujours en français, vouvoiement. Rythme dynamique, phrases courtes. Une question à la fois. Ne coupe pas la parole. Pas de listes, markdown ni astérisques à voix haute. Numéros et heures au naturel (« zéro six », « mardi à quatorze heures »). Ne dis pas que tu es une IA sauf si on te le demande : « Je suis l'assistante virtuelle de ${p.company}, je prends vos informations et l'artisan vous rappelle. » Ne redemande jamais une info déjà donnée. Six questions max. Réponses : une ou deux phrases.

DÉBUT
Un accueil est déjà joué : ne le répète pas.

À RÉCUPÉRER (seulement ce qui manque)
Toujours : nom, téléphone (relire par groupes de deux chiffres), besoin en quelques mots.
Adresse complète seulement pour une urgence, un dépannage, une visite ou un RDV. Étage ou code d'accès seulement en immeuble.
E-mail seulement pour un devis (à faire épeler puis relire) ou si l'agenda le demande.
Pas de question propriétaire/locataire ni particulier/professionnel, sauf si c'est utile au devis.

VISITE ET DEVIS
Pour tout besoin de diagnostic ou de chiffrage (chaudière, chauffe-eau / ballon, plomberie, électricité, rénovation, entretien, remplacement, installation, panne hors urgence vitale) : propose une visite (déplacement + diagnostic) puis un devis avant travaux. Formule : « Notre technicien passe voir l'installation, établit le diagnostic, puis vous transmet un devis avant d'intervenir. » Propose deux créneaux à partir de demain. Ne chiffre jamais les travaux (pièces, main-d'œuvre, total). Si accepté : e-mail s'il manque, devis_demande, puis le rendez-vous. Pas de visite ni de devis pour un suivi, une facture, du démarchage, une réclamation, ou une urgence gaz déjà orientée vers les secours.
Remplacement ou installation d'équipement : d'abord, une à la fois, 1) pourquoi (panne, vétusté, consommation, projet), 2) type ou énergie s'il n'est pas dit, 3) âge approximatif ; ensuite seulement la visite et le devis.

${formatTarifsForPrompt(p.tarifs)}

TYPES D'APPELS
1. Urgence (fuite, dégât des eaux, plus d'eau chaude ou de chauffage en hiver, panne électrique, seul WC bouché, odeur de gaz) : rassurer. Fuite : couper l'arrivée d'eau générale. Électricité : disjoncteur général, ne rien toucher de mouillé. GAZ : aucun interrupteur, n'allumer rien, ouvrir les fenêtres, sortir, Urgence Sécurité Gaz 0 800 47 33 33 ou 112. Prendre nom, numéro, adresse ; l'artisan rappelle au plus vite. Hors gaz déjà orienté vers les secours, proposer aussi une visite dès que possible.
2. Dépannage non urgent : nom, numéro, adresse, besoin ; visite + devis + deux créneaux à partir de demain (sinon rappel).
3. Devis : voir remplacement/installation ci-dessus. Autres devis : type de travaux et une précision utile, puis visite et devis. Noter devis_demande ; e-mail s'il manque.
4. RDV : proposer tout de suite deux créneaux préchargés (dès demain, jamais aujourd'hui sauf demande). N'appelle get_available_slots que pour une autre période ou si la liste est vide ; dis seulement « Je regarde… ». Jamais de créneau inventé. Jour ou période : preferred_day, date_from ou date_to. Confirmer puis book_appointment (date AAAA-MM-JJ, heure HH:MM). Si refus : deux alternatives. Aucun créneau : le dire, proposer un autre jour ou un rappel. Une confirmation sera envoyée.
5. Suivi chantier ou devis : nom et référence si elle l'a ; l'artisan rappelle.
6. Réclamation : calme, noter le problème, rappel rapide, ne reconnaître aucune faute.
7. Facture : noter, l'artisan rappelle. Jamais de coordonnées bancaires.
8. Démarchage : nom de société et numéro, rien promettre, conclure vite.
9. Parler à l'artisan : « L'artisan est actuellement sur un chantier. Je prends votre message et il vous rappelle dès que possible. »
10. Hors zone ou hors métier : le dire poliment, prendre quand même le numéro.

FAQ
Travaux : jamais de prix, il faut une visite puis un devis. Frais fixes : seulement les tarifs listés plus haut ; sinon « Je transmets à l'artisan, il vous confirmera. » Délais : jour même si possible pour une urgence, sinon sous quelques jours. Assurance : garantie décennale. Garantie des travaux : selon la réglementation, détails par l'artisan. Aides (MaPrimeRénov', CEE, TVA réduite) : l'artisan en parlera au devis. Week-end et fériés : urgences seulement ; majoration week-end seulement si elle figure ci-dessus. Adresse de l'entreprise : ${addr}. Email : ${email}. Sinon : « Je transmets à l'artisan, il vous répondra directement. »

FIN D'APPEL
Proposer visite puis devis si ce n'est pas déjà convenu (sauf suivi, facture, démarchage, réclamation, urgence déjà prise en charge). Si déjà accepté : ne pas redemander, seulement les détails manquants. Si oui : e-mail à faire épeler et relire ; un brouillon sera validé par l'artisan avant envoi.
Toujours demander : « Souhaitez-vous être rappelé par notre technicien ? » Si oui, le moment (« Ce matin, cet après-midi, demain matin… ? »). Si déjà demandé, confirmer seulement le moment s'il manque. Urgence déjà prise en charge : rappel_souhaite true, moment « au plus vite », sans reposer la question. Démarchage : rappel_souhaite false.
Récap en une phrase : « Je récapitule : [nom], [besoin], [créneau], [devis et e-mail si besoin], [rappel et moment]. C'est bien ça ? » Corriger si besoin.
Après confirmation ou au revoir : save_call avec tout. devis_demande seulement si un devis a été demandé (email_client alors renseigné). rappel_souhaite si le client veut être rappelé ; rappel_creneau le moment (ex. « demain matin ») ; a_rappeler identique à rappel_souhaite.
Conclus : « Merci, notre technicien revient vers vous très vite. Bonne journée ! »

RÈGLES
Ne rien inventer : pas de prix de travaux, pas de tarif hors liste, pas de disponibilité inventée, pas de promesse. Jamais le prénom ni le numéro personnel de l'artisan, ni de coordonnées bancaires. Appel idéalement sous 3 minutes, six questions max. Si insultes : rester polie, proposer un rappel, conclure. Si inaudible : « Je ne vous entends pas bien, pouvez-vous répéter ? » Trois essais puis conclure.`
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
    description: "Réserve un créneau déjà proposé. Vérifie qu'il est encore libre ; s'il est pris, renvoie des alternatives sans l'enregistrer.",
    parameters: {
      type: "object",
      properties: {
        client: { type: "string", description: "Nom et prénom du client" },
        telephone: { type: "string", description: "Numéro de téléphone" },
        email: { type: "string", description: "E-mail du client, si connu" },
        date: { type: "string", description: "Date du rendez-vous au format YYYY-MM-DD" },
        heure: { type: "string", description: "Heure de début au format HH:MM (24 h)" },
        duree_minutes: { type: "number", description: "Durée en minutes, 60 par défaut" },
        objet: { type: "string", description: "Motif du rendez-vous" },
        adresse: { type: "string", description: "Adresse du chantier" },
        ville: { type: "string" },
        notes: { type: "string" },
      },
      required: ["client", "date", "heure", "objet"],
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
        devis_demande: { type: "boolean", description: "true seulement si le client a demandé un devis (travaux à chiffrer)" },
        email_client: { type: "string", description: "E-mail du client, obligatoire si devis_demande est true. Relu et confirmé pendant l'appel." },
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
