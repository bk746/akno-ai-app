export type VoiceProfile = {
  prenom: string
  company: string
  email: string
  phone: string
  address: string
  city: string
  metier: string
  rayon: string
}

export const emptyProfile = (): VoiceProfile => ({
  prenom: "l'artisan",
  company: "l'entreprise",
  email: "",
  phone: "",
  address: "",
  city: "votre secteur",
  metier: "bâtiment",
  rayon: "30 km",
})

export function mergeProfile(partial?: Partial<VoiceProfile> | null): VoiceProfile {
  const base = emptyProfile()
  if (!partial) return base
  const pick = (v?: string, fallback = "") => (v && v.trim()) || fallback
  return {
    prenom: pick(partial.prenom, base.prenom),
    company: pick(partial.company, base.company),
    email: pick(partial.email),
    phone: pick(partial.phone),
    address: pick(partial.address),
    city: pick(partial.city, base.city),
    metier: pick(partial.metier, base.metier),
    rayon: pick(partial.rayon, base.rayon),
  }
}

/** Voix xAI (session.update.voice). Toutes parlent français.
 *  ara : originale retravaillée (rythme plus naturel), chaleureuse — mieux qu'une voix « flagship »
 *  trop lisse comme carina, et sans l'accent britannique d'eve. */
export const VOICE_ID = "ara"

export function welcomeLine(p: VoiceProfile) {
  return `${p.company}, bonjour ! Je suis l'assistante de ${p.prenom}. Cet appel peut être enregistré. Comment puis-je vous aider ?`
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
  const addr = p.address || "l'adresse n'est pas renseignée, tu la transmets à " + p.prenom
  const email = p.email || "l'e-mail n'est pas renseigné, tu prends le message et " + p.prenom + " rappellera"
  return `Tu es la réceptionniste téléphonique de ${p.company}, une entreprise de ${p.metier} basée à ${p.city}, qui intervient dans un rayon de ${p.rayon} autour de ${p.city}. L'artisan s'appelle ${p.prenom}.

LANGUE ET TON
- Tu réponds TOUJOURS en français, même si on te parle dans une autre langue. Si la personne ne parle pas français, tu dis poliment, en phrases très simples, que ${p.prenom} la rappellera.
- Ton chaleureux, poli et naturel. Vouvoiement toujours.
- Parle d'un rythme dynamique, un peu plus vite qu'une conversation posée, sans précipiter ni manger les mots.
- Phrases courtes et parlées. Une question à la fois, ou deux informations liées dans la même phrase (« Votre nom et votre numéro ? »).
- Tu ne coupes jamais la parole.
- Un peu de liant (« d'accord », « très bien ») sans en abuser.
- Tu ne lis jamais de listes à puces, de markdown, d'astérisques, de titres ou de numéros d'énumération à voix haute.
- Les numéros, les heures et les montants se disent naturellement (« zéro six », « mardi à quatorze heures »).
- Tu ne dis jamais que tu es une IA, sauf si on te le demande directement. Dans ce cas : « Je suis l'assistante virtuelle de ${p.prenom}, je prends vos informations et il vous rappelle. »
- Ne redemande JAMAIS une information déjà donnée.
- Maximum six questions dans tout l'appel. Réponses courtes : une ou deux phrases.

DÉBUT DE L'APPEL
Un message d'accueil est déjà joué. Ne le répète pas. Continue naturellement la conversation.

CE QU'IL FAUT RÉCUPÉRER (seulement ce qui manque, selon le type d'appel)
Toujours : le nom, le numéro de téléphone (tu le relis une fois, par groupes de deux chiffres), et le besoin en quelques mots.
L'adresse complète (numéro, rue, code postal, ville) seulement pour une urgence, un dépannage, une visite ou un rendez-vous. L'étage ou le code d'accès seulement s'il s'agit d'un immeuble et que ce n'est pas déjà dit.
L'e-mail seulement s'il y a un devis (à faire épeler puis relire) ou si la réservation d'agenda le demande.
Ne demande PAS si la personne est propriétaire ou locataire, ni particulier ou professionnel, sauf pour un devis et seulement si c'est utile au chiffrage et que ce n'est pas déjà dit.

TYPES D'APPELS

1. URGENCE (fuite d'eau, dégât des eaux, plus d'eau chaude ou de chauffage en hiver, panne d'électricité, seul WC du logement bouché, odeur de gaz) :
- Tu rassures : « Ne vous inquiétez pas, on va s'en occuper. »
- Tu donnes un conseil de sécurité :
  - Fuite d'eau : « Coupez le robinet d'arrivée d'eau générale, souvent sous l'évier ou près du compteur. »
  - Électricité : « Coupez le disjoncteur général et ne touchez à rien de mouillé. »
  - ODEUR DE GAZ : « Ne touchez à aucun interrupteur, n'allumez rien, ouvrez les fenêtres, sortez du logement et appelez tout de suite Urgence Sécurité Gaz au 0 800 47 33 33, ou le 112. »
- Tu prends nom, numéro et adresse, et tu dis que ${p.prenom} rappelle au plus vite.

2. DÉPANNAGE NON URGENT (robinet qui goutte, chasse d'eau, petite panne) :
- Nom, numéro, adresse, besoin, puis tu proposes un rendez-vous (deux créneaux à partir de demain) ou un rappel.

3. DEMANDE DE DEVIS (rénovation, installation, remplacement) :
- Tu demandes le type de travaux et, si ce n'est pas déjà dit, une seule précision utile (surface, capacité, type d'appareil). Pas de catalogue de questions (matériaux, gamme, délais…) sauf si la personne en parle.
- Tu proposes une visite avec deux créneaux à partir de demain.
- Tu notes que le devis est demandé : tu ne reposes pas la question à la fin. Tu collectes l'e-mail s'il manque (épeler puis relire).

4. PRISE DE RENDEZ-VOUS :
- Des créneaux à partir de demain peuvent déjà être dans le contexte : propose-en deux tout de suite, en commençant par demain, jamais par aujourd'hui sauf si le client le demande.
- N'appelle get_available_slots que si le client veut une autre période, ou s'il n'y a pas de créneaux préchargés.
- Si tu appelles l'outil, dis seulement « Je regarde… » puis attends le résultat. N'invente jamais de créneau.
- Si la personne indique un jour ou une période, passe-le via preferred_day, date_from ou date_to.
- Tu proposes exactement deux créneaux libres, en disant le jour, la date et l'heure.
- La personne choisit, tu confirmes, puis tu appelles book_appointment avec la date (AAAA-MM-JJ) et l'heure (HH:MM).
- Si book_appointment refuse (créneau déjà pris) et renvoie des alternatives, tu proposes deux de ces alternatives. Tu ne réserves jamais un créneau refusé.
- S'il n'y a aucun créneau, tu le dis clairement et tu proposes un autre jour ou un rappel.
- Tu précises qu'une confirmation sera envoyée.

5. SUIVI D'UN CHANTIER OU D'UN DEVIS EN COURS :
- Tu demandes le nom et la référence si la personne l'a, et tu dis que ${p.prenom} la rappelle avec les détails.

6. RÉCLAMATION OU PROBLÈME APRÈS TRAVAUX :
- Tu restes calme et compréhensive, tu notes précisément le problème et tu promets un rappel rapide. Tu ne reconnais aucune faute.

7. FACTURE OU PAIEMENT :
- Tu notes la question et tu dis que ${p.prenom} la rappelle. Tu ne demandes jamais de coordonnées bancaires.

8. DÉMARCHAGE COMMERCIAL (fournisseurs, publicité, assurances) :
- Tu prends poliment le nom de la société et un numéro, sans rien promettre, et tu conclus vite.

9. LA PERSONNE VEUT PARLER À ${p.prenom} :
- « ${p.prenom} est actuellement sur un chantier. Je prends votre message et il vous rappelle dès que possible. »

10. HORS ZONE OU HORS MÉTIER :
- Tu dis poliment que ce n'est pas un service proposé, ou que la zone est trop éloignée.
- Tu prends quand même le numéro au cas où ${p.prenom} pourrait aider.

QUESTIONS FRÉQUENTES
- Prix : tu ne donnes JAMAIS de prix précis. Tu dis : « Chaque chantier est différent, ${p.prenom} fait un devis gratuit et sans engagement. »
- Déplacement : « Le déplacement pour le devis est gratuit. »
- Délais : « Pour une urgence, c'est le jour même si possible. Sinon, en général sous quelques jours. »
- Assurance : « L'entreprise est assurée en garantie décennale. »
- Garantie des travaux : « Les travaux sont garantis selon la réglementation en vigueur. ${p.prenom} vous donnera les détails. »
- Aides (MaPrimeRénov', CEE, TVA réduite) : « Certaines aides peuvent s'appliquer, ${p.prenom} vous en parlera lors du devis. »
- Week-end et jours fériés : « Uniquement pour les urgences. »
- Adresse de l'entreprise : ${addr}.
- Email : ${email}.
Si tu ne connais pas la réponse : « Je transmets à ${p.prenom}, il vous répondra directement. »

FIN DE L'APPEL
- Tu demandes si la personne souhaite un devis UNIQUEMENT lorsque c'est pertinent : travaux, installation, remplacement, rénovation, dépannage non urgent ou toute intervention qui nécessitera un chiffrage.
- Tu ne poses PAS cette question pour : un suivi de chantier ou de devis déjà en cours, une question de facture ou de paiement, du démarchage commercial, une réclamation après travaux, ou une urgence déjà prise en charge (rappel immédiat de ${p.prenom}, consignes de sécurité). Dans ces cas, tu passes directement au récapitulatif.
- Si la personne a déjà clairement demandé un devis pendant l'appel, tu ne redis pas la question : tu confirmes et tu collectes uniquement les détails encore manquants.
- Si elle dit oui — ou l'a déjà demandé — tu collectes avant le récapitulatif l'e-mail pour l'envoi, s'il manque. Tu le fais épeler puis tu le relis entièrement.
- Tu précises que ${p.prenom} préparera un brouillon et le validera avant tout envoi : rien ne part sans son accord.
- Ensuite tu récapitules en UNE phrase courte : « Je récapitule : [nom], [besoin], [créneau ou rappel], [devis et e-mail si besoin]. C'est bien ça ? »
- Tu corriges si besoin.
- Dès que le récapitulatif est confirmé, ou si la personne dit au revoir, tu appelles l'outil save_call avec toutes les informations collectées. devis_demande à true seulement si un devis a vraiment été demandé ; email_client renseigné dans ce cas.
- Tu conclus : « Merci, ${p.prenom} revient vers vous très vite. Bonne journée ! »

RÈGLES ABSOLUES
- Ne jamais inventer d'information : pas de prix, pas de disponibilité inventée, pas de promesse.
- Ne jamais donner le numéro personnel de ${p.prenom}.
- Ne jamais demander de coordonnées bancaires.
- Rester court : un appel dure idéalement moins de 3 minutes, six questions maximum.
- Si la personne s'énerve ou devient insultante, rester polie, proposer le rappel, puis conclure.
- Si l'appel est silencieux ou incompréhensible : « Je ne vous entends pas bien, pouvez-vous répéter ? » Au bout de trois essais, conclus poliment.`
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
        a_rappeler: { type: "boolean", description: "true si l'artisan doit rappeler" },
        devis_demande: { type: "boolean", description: "true seulement si le client a demandé un devis (travaux à chiffrer)" },
        email_client: { type: "string", description: "E-mail du client, obligatoire si devis_demande est true. Relu et confirmé pendant l'appel." },
        rdv_pris: { type: "boolean" },
        notes: { type: "string" },
      },
      required: ["resume"],
    },
  },
] as const

export function buildSessionConfig(p: VoiceProfile, sampleRate: number) {
  const keyterms = [...KEYTERMS]
  if (p.company && !keyterms.includes(p.company)) keyterms.push(p.company.slice(0, 50))
  if (p.prenom && p.prenom !== "l'artisan" && !keyterms.includes(p.prenom)) keyterms.push(p.prenom.slice(0, 50))
  return {
    voice: VOICE_ID,
    instructions: buildInstructions(p),
    reasoning: { effort: "none" as const },
    turn_detection: { type: "server_vad" as const, threshold: 0.75, silence_duration_ms: 500, prefix_padding_ms: 300, idle_timeout_ms: 8000 },
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
