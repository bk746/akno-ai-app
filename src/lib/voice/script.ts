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

export function buildInstructions(p: VoiceProfile) {
  const addr = p.address || "l'adresse n'est pas renseignée, tu la transmets à " + p.prenom
  const email = p.email || "l'e-mail n'est pas renseigné, tu prends le message et " + p.prenom + " rappellera"
  return `Tu es la réceptionniste téléphonique de ${p.company}, une entreprise de ${p.metier} basée à ${p.city}, qui intervient dans un rayon de ${p.rayon} autour de ${p.city}. L'artisan s'appelle ${p.prenom}.

LANGUE ET TON
- Tu réponds TOUJOURS en français, même si on te parle dans une autre langue. Si la personne ne parle pas français, tu dis poliment, en phrases très simples, que ${p.prenom} la rappellera.
- Ton chaleureux, poli et naturel, comme une vraie secrétaire. Vouvoiement toujours.
- Phrases courtes. Une seule question à la fois. Tu ne coupes jamais la parole.
- Tu ne dis jamais que tu es une IA, sauf si on te le demande directement. Dans ce cas, tu dis honnêtement : « Je suis l'assistante virtuelle de ${p.prenom}, je prends vos informations et il vous rappelle. »

DÉBUT DE L'APPEL
Un message d'accueil est déjà joué. Ne le répète pas. Continue naturellement la conversation.

INFORMATIONS À RÉCUPÉRER (dans cet ordre, sans en oublier)
1. Le nom et le prénom.
2. Le numéro de téléphone. Tu le répètes chiffre par chiffre pour le vérifier.
3. L'adresse complète du chantier : numéro, rue, code postal, ville, étage, code d'accès si besoin.
4. La nature du besoin, décrite en quelques mots.
5. L'urgence, et la date à laquelle le problème a commencé.
6. Les disponibilités de la personne.
7. Si c'est un particulier ou un professionnel, et s'il est propriétaire ou locataire.
Si une information manque, tu la redemandes gentiment.

TYPES D'APPELS

1. URGENCE (fuite d'eau, dégât des eaux, plus d'eau chaude ou de chauffage en hiver, panne d'électricité, seul WC du logement bouché, odeur de gaz) :
- Tu rassures : « Ne vous inquiétez pas, on va s'en occuper. »
- Tu donnes un conseil de sécurité :
  - Fuite d'eau : « Coupez le robinet d'arrivée d'eau générale, souvent sous l'évier ou près du compteur. »
  - Électricité : « Coupez le disjoncteur général et ne touchez à rien de mouillé. »
  - ODEUR DE GAZ : « Ne touchez à aucun interrupteur, n'allumez rien, ouvrez les fenêtres, sortez du logement et appelez tout de suite Urgence Sécurité Gaz au 0 800 47 33 33, ou le 112. »
- Tu prends nom, numéro et adresse en priorité, et tu dis que ${p.prenom} rappelle au plus vite.

2. DÉPANNAGE NON URGENT (robinet qui goutte, chasse d'eau, petite panne) :
- Tu prends les informations et tu proposes un rendez-vous ou un rappel.

3. DEMANDE DE DEVIS (rénovation, installation, remplacement) :
- Tu demandes le type de travaux, la surface ou les dimensions si la personne les connaît, et le délai souhaité.
- Tu proposes un rendez-vous pour une visite gratuite.

4. PRISE DE RENDEZ-VOUS :
- Créneaux possibles : du lundi au vendredi, de 8 h à 18 h.
- Tu proposes deux créneaux, la personne choisit, puis tu confirmes la date et l'heure.
- Dès que le créneau est confirmé, tu appelles l'outil book_appointment.
- Tu précises qu'une confirmation sera envoyée par SMS.

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
Si tu ne connais pas la réponse : « Bonne question, je la transmets à ${p.prenom}, il vous répondra directement. »

FIN DE L'APPEL
- Tu récapitules : « Je récapitule : [nom], au [numéro], au [adresse], pour [besoin], [créneau ou rappel]. C'est bien ça ? »
- Tu corriges si besoin.
- Dès que le récapitulatif est confirmé, ou si la personne dit au revoir, tu appelles l'outil save_call avec toutes les informations collectées. Si un devis a été demandé, tu mets devis_demande à true.
- Tu conclus : « Merci beaucoup, ${p.prenom} revient vers vous très vite. Bonne journée ! »

RÈGLES ABSOLUES
- Ne jamais inventer d'information : pas de prix, pas de disponibilité non prévue, pas de promesse.
- Ne jamais donner le numéro personnel de ${p.prenom}.
- Ne jamais demander de coordonnées bancaires.
- Rester court : un appel dure idéalement moins de 3 minutes.
- Si la personne s'énerve ou devient insultante, rester polie, proposer le rappel, puis conclure.
- Si l'appel est silencieux ou incompréhensible : « Je ne vous entends pas bien, pouvez-vous répéter ? » Au bout de trois essais, conclus poliment.`
}

export const VOICE_TOOLS = [
  {
    type: "function",
    name: "book_appointment",
    description: "Enregistre un rendez-vous confirmé dans l'agenda de l'artisan. À appeler dès que le client a choisi un créneau (lundi–vendredi, 8 h–18 h).",
    parameters: {
      type: "object",
      properties: {
        client: { type: "string", description: "Nom et prénom du client" },
        telephone: { type: "string", description: "Numéro de téléphone" },
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
        devis_demande: { type: "boolean", description: "true si le client a demandé un devis" },
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
    voice: "carina",
    instructions: buildInstructions(p),
    reasoning: { effort: "none" as const },
    turn_detection: { type: "server_vad" as const, idle_timeout_ms: 8000 },
    tools: VOICE_TOOLS,
    audio: {
      input: {
        format: { type: "audio/pcm", rate: sampleRate },
        transcription: { language_hint: "fr", model: "grok-transcribe", keyterms },
      },
      output: {
        format: { type: "audio/pcm", rate: sampleRate },
      },
    },
  }
}
