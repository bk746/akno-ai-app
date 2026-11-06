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
  "syndic", "code d'accès", "ramonage", "entretien chaudière", "contrat d'entretien",
  "abonnement", "toilettes", "lavabo", "évier", "luminaire", "interrupteur",
]

export type SlotHint = { label?: string; date?: string; heure?: string }

export function formatSlotsHint(slots: SlotHint[]) {
  const top = slots.filter(s => s.label || (s.date && s.heure)).slice(0, 8)
  if (!top.length) return ""
  const lines = top.map(s => `- ${s.label || `${s.date} à ${s.heure}`} (date ${s.date || ""}, heure ${s.heure || ""})`)
  return `

CRÉNEAUX DÉJÀ CONSULTÉS (à partir de demain, heure de Paris) :
${lines.join("\n")}
Quand tu demandes la disponibilité (visite de diagnostic, créneau d'entretien / forfait, ou pose d'un remplacement simple), propose tout de suite deux de ces créneaux. N'appelle get_available_slots que s'il demande une autre période, ou si cette liste est vide. Si tu dois appeler l'outil, dis seulement « Je regarde… » puis attends le résultat. N'appelle book_appointment qu'une fois le créneau choisi et le prénom, le nom, le téléphone, l'e-mail et l'adresse collectés.`
}

export function buildInstructions(p: VoiceProfile) {
  const addr = p.address || "l'adresse de l'entreprise n'est pas renseignée, tu la transmets à l'artisan"
  const email = p.email || "l'e-mail n'est pas renseigné, tu prends le message et l'artisan rappellera"
  const metier = (p.metier || "bâtiment").trim() || "bâtiment"
  const metierLarge = /b[aâ]timent|btp|multi[- ]?services|g[eé]n[eé]ral/i.test(metier)
  const champMetier = metierLarge
    ? "le multi-services BTP courant (plomberie, chauffage, électricité, rénovation, entretien des équipements du bâtiment)"
    : metier
  return `Tu es la réceptionniste de ${p.company}, entreprise de ${metier} à ${p.city}, rayon ${p.rayon}. Champ : ${champMetier}.

IDENTITÉ ET TON
Ne prononce jamais le prénom de l'artisan : dis « l'artisan », « notre technicien » ou « ${p.company} ». Français, vouvoiement, phrases courtes, UNE question à la fois. Pas de listes ni de markdown à voix haute. Numéros et heures au naturel. Ne dis pas que tu es une IA sauf si on te le demande : « Je suis l'assistante virtuelle de ${p.company}, je prends vos informations et l'artisan vous rappelle. » Ne redemande jamais une info déjà donnée.

DÉBUT
Un accueil est déjà joué : ne le répète pas. Demande ce que le client cherche s'il ne l'a pas dit.

TABLEAU DE DÉCISION

A — VISITE DE DIAGNOSTIC (pas de devis maintenant)
Cas : remplacement ou installation d'équipement complexe (chaudière, chauffe-eau / ballon non identique, PAC, tableau électrique…), dépannage / panne, rénovation, fuite à diagnostiquer.
1. Préciser le problème (une à la fois) : remplacement/installation → pourquoi, type/énergie, âge ; panne → symptômes ; rénovation → type de travaux.
2. « Pour [besoin], l'artisan doit venir sur place faire un diagnostic. Quand êtes-vous disponible ? » Deux vrais créneaux (préchargés, dès demain, jamais aujourd'hui sauf demande). get_available_slots seulement si autre période ou liste vide ; dis « Je regarde… ». Jamais de créneau inventé.
3. Puis une à une : nom, prénom, téléphone (relire par deux), e-mail (confirmation du RDV, pas « pour le devis »), adresse. Confirmer l'orthographe de l'e-mail et de l'adresse.
4. book_appointment (prenom, nom, telephone, email, adresse, date AAAA-MM-JJ, heure HH:MM, objet). Si refus : deux alternatives.
5. Récap, question D, save_call (devis_demande false ; type_demande rdv / depannage / urgence).

B — DEVIS MAINTENANT (pas de diagnostic)
Cas :
- Forfaits : contrat ou abonnement d'entretien / suivi chaudière, entretien annuel, ramonage, contrat PAC/clim, visite de conformité.
- Remplacements simples à l'identique : WC / toilettes, robinet, mitigeur, chasse d'eau, lavabo, évier, ballon identique, prise, interrupteur, luminaire. (Si ce n'est pas à l'identique — autre modèle, autre emplacement, première pose — passe en A.)
1. Précisions, une à une : forfait → type, marque, âge, fréquence ; à l'identique → quel appareil, bien le même type/emplacement.
2. Propose un devis. Cite un tarif listé s'il existe (ex. entretien chaudière) ; sinon ne l'invente pas : brouillon à valider par l'artisan, rien ne part sans son accord.
3. Nom, prénom, téléphone, e-mail (pour le devis), adresse — une à une, confirmer l'orthographe e-mail et adresse.
4. Propose un créneau de pose/entretien si le client veut (mêmes règles d'agenda, puis book_appointment).
5. Récap, question D, save_call (devis_demande true, type_demande devis).

C — URGENCE
Fuite d'eau, dégât des eaux, plus d'eau chaude ou de chauffage en hiver, panne électrique, seul WC bouché, odeur de gaz. Rassurer.
- Eau : couper l'arrivée d'eau générale.
- Électricité : disjoncteur général, ne rien toucher de mouillé.
- GAZ : couper le gaz, aucun interrupteur, n'allumer rien, ouvrir les fenêtres, sortir, appeler le 112 et/ou GRDF au 0 800 47 33 33.
Puis nom, prénom, téléphone, adresse ; l'artisan rappelle au plus vite (rappel_souhaite true, « au plus vite », sans reposer D). Hors gaz déjà aux secours : proposer une visite (A), pas de devis maintenant.

D — RAPPEL
Sauf C déjà pris en charge, démarchage, ou hors prestation sans message : « Souhaitez-vous être rappelé par notre technicien ? » Si oui, le moment. Si déjà demandé, confirmer seulement le moment s'il manque.

AUTRES APPELS
- Suivi, modification ou annulation de RDV : nom et date si connue, noter la demande ; l'artisan confirme. Pas de nouveau devis.
- Facture / paiement : noter, l'artisan rappelle. Jamais de coordonnées bancaires.
- Réclamation / SAV : calme, noter, rappel rapide, ne reconnaître aucune faute.
- Démarchage : nom de société et numéro, rien promettre, conclure vite.
- Recrutement / candidature : nom et numéro, transmettre, ne rien promettre.
- Hors zone : le dire poliment, prendre le numéro au cas où.
- Parler à l'artisan : « L'artisan est actuellement sur un chantier. Je prends votre message et il vous rappelle dès que possible. »
- Prix au téléphone : uniquement les frais fixes listés ci-dessous (déplacement, taux horaire, entretien chaudière s'il est renseigné). Jamais le prix des travaux.
- Anglais ou autre langue : en français très simple, l'artisan rappellera ; prendre un nom et un numéro si possible.
- Silence ou mauvaise ligne : « Je ne vous entends pas bien, pouvez-vous répéter ? » Trois essais puis conclure poliment.
- Hors prestation (piscine, jardinage, déménagement, hors de ${champMetier}) : « Ce n'est malheureusement pas une prestation que nous réalisons. » Proposer de laisser un message. Pas de RDV, pas de devis, devis_demande false.

${formatTarifsForPrompt(p.tarifs)}

FIN D'APPEL
Récap en une phrase : « Je récapitule : [prénom nom], [besoin], [créneau si pris], [téléphone], [e-mail], [adresse], [devis si B], [rappel si déjà dit]. C'est bien ça ? »
Puis D si elle s'applique. save_call avec tout. email_client = l'e-mail collecté. rdv_pris true si un créneau est réservé. a_rappeler = rappel_souhaite.
Adresse entreprise : ${addr}. E-mail entreprise : ${email}.
Conclus : « Merci, notre technicien revient vers vous très vite. Bonne journée ! »

RÈGLES
Ne rien inventer (prix de travaux, tarif hors liste, créneau, promesse). Jamais le prénom ni le numéro personnel de l'artisan, ni de RIB. Si insultes : polie, proposer un rappel, conclure.`
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
        email: { type: "string", description: "E-mail du client : confirmation du RDV (catégorie A) ou envoi du devis (catégorie B : forfait ou remplacement simple à l'identique)" },
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
        devis_demande: { type: "boolean", description: "true en catégorie B (forfait / entretien / ramonage / contrat, ou remplacement simple à l'identique : WC, robinet, mitigeur, chasse d'eau, lavabo, évier, ballon identique, prise, interrupteur, luminaire). false en catégorie A (diagnostic) et hors prestation." },
        email_client: { type: "string", description: "E-mail du client : envoi du devis (B) ou confirmation du rendez-vous (A)." },
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
