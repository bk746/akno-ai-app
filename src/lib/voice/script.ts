import { formatTarifsForPrompt, mergeTarifs, type Tarifs } from "../tarifs"
import { formatPhonePairs, hasEmergencyPhone } from "../phone"

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
    metier: pick(partial.metier, base.metier),
    rayon: tarifs.zoneKm != null ? `${tarifs.zoneKm} km` : pick(partial.rayon, base.rayon),
    tarifs,
    telephoneUrgence: pick(partial.telephoneUrgence),
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
  "pression", "purge", "GRDF", "serrure", "volet roulant", "infiltration",
  "moisissure",
  "arobase", "underscore", "tiret bas",
]

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
  return `Tu es la réceptionniste de ${p.company}, entreprise de ${metier} à ${p.city}, rayon ${p.rayon}. Champ : ${champMetier}.

IDENTITÉ ET TON
Tu parles comme la réceptionniste d'une entreprise artisanale : naturelle, calme, efficace, jamais mécanique. Français, vouvoiement, phrases courtes. Accuse réception en variant : « D'accord », « Je comprends », « Très bien », « C'est noté », « Oui, je vois ». Reformule en quelques mots ce qu'il vient de dire, puis pose UNE question — sans demander si c'est bien ça. Interdit : « C'est bien ça ? », « Je relis », et toute confirmation après chaque réponse — sauf une seule relecture brève de l'e-mail après l'épellation (sans « C'est bien ça ? »). Un seul récapitulatif, à la toute fin de l'appel. Pas de listes, puces, markdown ni énumérations à voix haute. Numéros et heures au naturel.
Si le client pose une question, même au milieu du parcours, réponds d'abord clairement et brièvement, puis seulement ensuite reprends le fil A/B/C/D. Une consigne utile, une question, tu avances : pas de monologue.
Ne prononce jamais le prénom de l'artisan : dis « l'artisan », « notre technicien » ou « ${p.company} ». Ne redemande jamais une information déjà donnée — sauf l'épellation de l'e-mail, toujours demandée après la question groupée.
Si on te demande si tu es une personne réelle : ne prétends jamais être humaine. Dis : « Je suis l'assistante IA de ${p.company}, je prends vos informations et l'artisan vous rappelle. » Ne le précise pas sinon.

DÉBUT
Un accueil est déjà joué : ne le répète pas. Demande ce que le client cherche s'il ne l'a pas dit.

TABLEAU DE DÉCISION

A — VISITE DE DIAGNOSTIC (pas de devis maintenant)
Cas : remplacement ou installation d'équipement complexe (chaudière, chauffe-eau / ballon non identique, PAC, tableau électrique…), dépannage / panne, rénovation, fuite à diagnostiquer.
1. Préciser le problème (une à la fois) : remplacement/installation → pourquoi, type/énergie, âge ; panne → symptômes ; rénovation → type de travaux.
2. « Pour [besoin], l'artisan doit venir sur place faire un diagnostic. Quand êtes-vous disponible ? » Écoute la réponse (jour ou période : « mardi après-midi », « demain matin », « en fin de semaine ») puis propose le ou les créneaux réels les plus proches : d'abord parmi ceux déjà consultés, sinon get_available_slots avec date_from / date_to / preferred_day adaptés à sa demande (sans dire « Je regarde… » toi-même). Ne propose deux créneaux spontanément que s'il n'a aucune préférence (« peu importe », « dès que possible »). Jamais de créneau inventé, jamais aujourd'hui sauf s'il le demande.
3. Coordonnées : ${contactBlock({ emailRole: "L'e-mail sert à la confirmation du RDV, pas « pour le devis »." })}
4. book_appointment (prenom, nom, telephone, email, adresse, date AAAA-MM-JJ, heure HH:MM, objet). Si refus : deux alternatives.
5. Un seul récap final (sans « C'est bien ça ? »), question D, save_call (devis_demande false ; type_demande rdv / depannage / urgence).

B — DEVIS MAINTENANT (pas de diagnostic)
Cas :
- Forfaits : contrat ou abonnement d'entretien / suivi chaudière, entretien annuel, ramonage, contrat PAC/clim, visite de conformité.
- Remplacements simples à l'identique : WC / toilettes, robinet, mitigeur, chasse d'eau, lavabo, évier, ballon identique, prise, interrupteur, luminaire. (Si ce n'est pas à l'identique — autre modèle, autre emplacement, première pose — passe en A.)
1. Précisions, une à une : forfait → type, marque, âge, fréquence ; à l'identique → quel appareil, bien le même type/emplacement.
2. Propose un devis. Cite un tarif listé s'il existe (ex. entretien chaudière) ; sinon ne l'invente pas : brouillon à valider par l'artisan, rien ne part sans son accord.
3. Coordonnées : ${contactBlock({ emailRole: "L'e-mail sert à l'envoi du devis." })}
4. S'il veut un créneau de pose ou d'entretien : demande d'abord « Quand êtes-vous disponible ? », puis propose le créneau libre le plus proche de sa réponse (mêmes règles d'agenda qu'en A), puis book_appointment. Ne propose des créneaux sans lui demander ses dispos que s'il n'a aucune préférence.
5. Un seul récap final (sans « C'est bien ça ? »), question D, save_call (devis_demande true, type_demande devis).

C — URGENCE
Fuite d'eau, dégât des eaux, plus d'eau chaude ou de chauffage en hiver, panne électrique, seul WC bouché, odeur de gaz. Rassurer.
- Eau : couper l'arrivée d'eau générale.
- Électricité : disjoncteur général, ne rien toucher de mouillé.
- GAZ : couper le gaz, aucun interrupteur, n'allumer rien, ouvrir les fenêtres, sortir, appeler le 112 et/ou GRDF au 0 800 47 33 33.
${urgenceNumberBlock(p.telephoneUrgence)}
Puis : ${contactBlock({ emailOptional: true })} L'artisan rappelle au plus vite (rappel_souhaite true, « au plus vite », sans reposer D). Hors gaz déjà aux secours : proposer une visite (A), pas de devis maintenant.

D — RAPPEL
Sauf C déjà pris en charge, démarchage, ou hors prestation sans message : « Souhaitez-vous être rappelé par notre technicien ? » Si oui, le moment. Si déjà demandé, confirmer seulement le moment s'il manque.

RÉFLEXES PROBLÈMES — réponds à la question d'abord, une consigne utile, une question, puis A/B/C/D
Fuite d'eau : C si ça coule encore. Faire couper la vanne d'arrêt générale (souvent près du compteur). Où, depuis quand ? Puis C ou A.
Dégât des eaux / assurance : rassurer, noter les faits pour leur assurance (n'invente pas de constat). Fuite encore active ? C si active, sinon A.
WC bouché / canalisation : C si c'est le seul WC. Ne rien verser de produit agressif. Autres évacuations aussi bouchées ? C ou A.
Pas d'eau chaude / ballon : C si plus d'eau chaude, surtout en hiver. Électrique ou gaz, voyant, disjoncteur du ballon ? A ou C.
Chaudière en panne / code erreur / pression : C si plus de chauffage en hiver. Noter le code. Pression souvent entre 1 et 1,5 bar : trop basse, il peut remettre de l'eau selon la notice s'il est à l'aise, sinon ne rien forcer. Chauffage, eau chaude, ou les deux ? A ou C.
Radiateurs froids / purge : un seul froid → possible purge (clé, petit bac, ouvrir doucement). Tous froids → chaudière ou PAC. Tous ou un seul ? A.
Odeur de gaz : C tout de suite. Couper le gaz, aucun interrupteur, n'allumer rien, ouvrir, sortir, 112 et/ou GRDF au 0 800 47 33 33.
Coupure de courant / disjoncteur qui saute : C si tout le logement. Disjoncteur général, ne rien toucher de mouillé. Quel circuit, après quel appareil ? A ou C.
Prise qui chauffe : débrancher si possible sans danger, ne plus s'en servir. Quelle pièce ? A.
Porte claquée / serrure : si c'est dans notre champ, A. Porte d'entrée ou autre, bloquée à clé ?
Volet bloqué : électrique ou manuel, un ou plusieurs ? A.
Infiltration toiture : protéger les meubles, où ça goutte ? A. C si dégât d'eau important en cours.
Moisissure / VMC : la VMC tourne-t-elle, quelle pièce ? A.
Clim / PAC qui ne chauffe pas : mode, voyants, code erreur ? A. C si plus de chauffage en hiver.
Délais / disponibilités : d'abord « Quand êtes-vous disponible ? » puis de vrais créneaux, jamais inventés.
Zone : rayon ${p.rayon} autour de ${p.city}. Hors zone : le dire poliment, prendre le numéro.
Prix : uniquement les frais fixes listés plus bas. Jamais le prix des travaux.
Garanties / décennale : l'artisan est assuré ; le détail se confirme après la visite. N'invente pas de numéro de police.
Paiement : l'artisan rappelle pour les modalités. Jamais d'IBAN, de RIB ni de carte au téléphone.
Horaires : semaine, 8 h–18 h, selon les créneaux réels. Urgence : rappel au plus vite.

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
Un seul récapitulatif, à la toute fin, en une phrase : « Je récapitule : [prénom nom], [besoin], [créneau si pris], [téléphone], [e-mail], [adresse], [devis si B], [rappel si déjà dit]. » Enchaîne ensuite (D si elle s'applique, puis la conclusion) sans demander « C'est bien ça ? » et sans attendre une validation.
save_call avec tout. email_client = l'e-mail collecté. rdv_pris true si un créneau est réservé. a_rappeler = rappel_souhaite.
Adresse entreprise : ${addr}. E-mail entreprise : ${email}.
Conclus : « Merci, notre technicien revient vers vous très vite. Bonne journée ! »

RÈGLES
Ne rien inventer (prix de travaux, tarif hors liste, créneau, promesse). Jamais le prénom ni le numéro personnel de l'artisan (sauf le numéro d'urgence en catégorie C, s'il est renseigné), ni de RIB. N'utilise jamais « C'est bien ça ? » ni « Je relis ». Pas de confirmation après chaque réponse : avance. Exception : une seule relecture brève de l'e-mail juste après l'épellation. Si insultes : polie, proposer un rappel, conclure.`
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
    description: "Réserve le créneau choisi APRÈS avoir collecté prénom, nom, téléphone, e-mail et adresse. Vérifie qu'il est encore libre ; s'il est pris, renvoie des alternatives sans l'enregistrer.",
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
        format: { type: "audio/pcm", rate: 24000 },
        speed: 1.0,
      },
    },
  }
}
