/* update57 · Tests du configurateur « Ma réceptionniste » → prompt et session Grok Voice : npm run test:receptionist
   (aucun appel réseau). */
import { buildInstructions, buildSessionConfig, mergeProfile, welcomeLine, VOICE_ID } from "../src/lib/voice/script"
import { DEFAULT_VOICE, VOICES, formatConfigForPrompt, formatHoraires, metierActivite, normalizeConfig, replaceMap, serializeConfig } from "../src/lib/voice/receptionist"

let ok = 0, ko = 0
const T = (name: string, pass: boolean) => { pass ? ok++ : ko++; console.log(`${pass ? "✔" : "✘"} ${name}`) }

const base = { company: "Plomberie Bouzerda", city: "Lyon", email: "contact@bouzerda.fr", metier: "Plombier" }

// 1) Catalogue des voix (doc xAI : 28 voix intégrées)
T("28 voix, identifiants uniques", VOICES.length === 28 && new Set(VOICES.map(v => v.id)).size === 28)
T("voix par défaut = celeste (féminine)", DEFAULT_VOICE === "celeste" && VOICE_ID === "celeste" && VOICES.find(v => v.id === "celeste")?.gender === "female")
T("9 voix féminines / 19 masculines (GET /v1/tts/voices)", VOICES.filter(v => v.gender === "female").length === 9 && VOICES.filter(v => v.gender === "male").length === 19)

// 2) Zéro configuration : fonctionne, prompt sans bloc artisan
const p0 = mergeProfile(base)
const s0 = buildSessionConfig(p0, 24000)
T("sans config : voix par défaut, débit 1", s0.voice === "celeste" && s0.audio.output.speed === 1)
T("sans config : pas de bloc INFOS DE L'ARTISAN ni replace", !/INFOS DE L'ARTISAN/.test(s0.instructions) && !("replace" in s0))
T("sans config : vouvoiement", /Français, vouvoiement/.test(s0.instructions))
T("métier « Plombier » → « plomberie » dans le prompt", /entreprise de plomberie à Lyon/.test(s0.instructions) && metierActivite("Électricien") === "électricité")
T("sans horaires : semaine 8 h–18 h", /Horaires : semaine, 8 h–18 h/.test(s0.instructions))
T("accueil standard avec IA + RGPD", /Plomberie Bouzerda, bonjour, je suis l'assistante IA\. Cet appel peut être enregistré/.test(welcomeLine(p0)))

T("accueil personnalisé : « ! » conservé, IA + RGPD ajoutés", welcomeLine(mergeProfile({ ...base, accueil: "Plomberie Bouzerda, bonjour !" })) === "Plomberie Bouzerda, bonjour ! Je suis l'assistante IA de Plomberie Bouzerda. Cet appel peut être enregistré pour le suivi de votre demande.")

// 3) Config complète
const cfg = {
  voice: "Aurora", speed: 1.1, tutoiement: false,
  presentation: "Entreprise familiale depuis 1998, spécialiste de la rénovation de salles de bain.",
  services: [{ nom: "Recherche de fuite", prix: "dès 89 €", duree: "1 h" }, { nom: "Débouchage", prix: "" }, { nom: "   " }],
  zone: "Lyon et 20 km autour", disponibilites: "Délai moyen d'une semaine.",
  urgences: "Fuite active : rappel sous 30 minutes.", interdits: "Ne jamais promettre une intervention le jour même.",
  faq: [{ q: "Le devis est-il gratuit ?", r: "Oui, le devis est gratuit." }, { q: "Sans réponse", r: "" }],
  consignes: "Proposez le contrat d'entretien.", prononciations: [{ mot: "Bouzerda", dit: "Bou-zèr-da" }, { mot: "C++", dit: "cé plus plus" }],
}
const n = normalizeConfig(cfg)
T("normalise : voix en minuscules", n.voice === "aurora")
T("normalise : prestations vides retirées", n.services.length === 2)
T("normalise : FAQ sans réponse retirée", n.faq.length === 1)
T("normalise : mot de prononciation avec symboles ignoré", n.prononciations.length === 1 && n.prononciations[0].mot === "Bouzerda")
const p1 = mergeProfile({ ...base, reception: n, horaires: { lun: ["08:00", "18:00"], mar: ["08:00", "18:00"], mer: ["08:00", "18:00"], jeu: ["08:00", "18:00"], ven: ["08:00", "17:30"], sam: ["09:00", "12:00"], dim: null } })
const s1 = buildSessionConfig(p1, 8000, "\n\nCONTEXTE TÉLÉPHONE : test")
const ins = s1.instructions
T("session : voix choisie + débit", s1.voice === "aurora" && s1.audio.output.speed === 1.1)
T("session : replace (prononciation)", (s1 as { replace?: Record<string, string> }).replace?.Bouzerda === "Bou-zèr-da")
T("prompt : présentation", ins.includes("Entreprise familiale depuis 1998"))
T("prompt : prestation + prix indicatif + durée", /- Recherche de fuite — prix indicatif : dès 89 € — durée habituelle : 1 h/.test(ins))
T("prompt : prestations dans le champ métier", /Champ : plomberie — prestations listées par l'artisan : Recherche de fuite, Débouchage/.test(ins))
T("prompt : prix indicatifs autorisés seulement s'ils existent", /frais fixes listés plus bas et les prix indicatifs des prestations/.test(ins))
T("prompt : zone personnalisée", /Zone : Lyon et 20 km autour\./.test(ins))
T("prompt : horaires réels", /Horaires : du lundi au jeudi de 8 h à 18 h, le vendredi de 8 h à 17 h 30, le samedi de 9 h à 12 h, fermé dimanche/.test(ins))
T("prompt : urgences, interdits, FAQ, consignes", /rappel sous 30 minutes/.test(ins) && /À NE JAMAIS PROMETTRE[\s\S]*jour même/.test(ins) && /Q : Le devis est-il gratuit \?\nR : Oui/.test(ins) && /contrat d'entretien/.test(ins))
T("prompt : règles de sécurité prioritaires", /la sécurité \(gaz, 112\)[^\n]*priment toujours/.test(ins) && /GRDF au 0 800 47 33 33/.test(ins))
T("prompt : bloc artisan avant FIN D'APPEL, contexte téléphone à la fin", ins.indexOf("INFOS DE L'ARTISAN") < ins.indexOf("FIN D'APPEL") && ins.trimEnd().endsWith("CONTEXTE TÉLÉPHONE : test"))
T("même prompt app / relais (fonction partagée)", buildInstructions(p1) === ins.replace("\n\nCONTEXTE TÉLÉPHONE : test", ""))

// 4) Tutoiement
const p2 = mergeProfile({ ...base, reception: normalizeConfig({ tutoiement: true }) })
T("tutoiement : ton + consigne + accueil", /Français, tutoiement/.test(buildInstructions(p2)) && /TON CHOISI PAR L'ARTISAN : tutoiement/.test(buildInstructions(p2)) && /Comment puis-je t'aider \?/.test(welcomeLine(p2)))

// 5) Robustesse (données en base corrompues / hostiles)
const bad = normalizeConfig({ voice: "voix-inventee", speed: 9, services: "x", faq: [null, 3], presentation: "a\u0000b".repeat(1000) })
T("voix inconnue → défaut, débit borné, listes invalides ignorées", bad.voice === "celeste" && bad.speed === 1.2 && bad.services.length === 0 && bad.faq.length === 0)
T("textes tronqués et sans caractères de contrôle", bad.presentation.length <= 600 && !/\u0000/.test(bad.presentation))
T("normalizeConfig(null) / undefined", normalizeConfig(null).voice === "celeste" && formatConfigForPrompt(normalizeConfig(undefined)) === "")
T("replaceMap vide → undefined", replaceMap(normalizeConfig({})) === undefined)
T("serializeConfig : version + sans champs vides", (() => { const z = serializeConfig(n); return z.v === 1 && z.services[1] && !("prix" in z.services[1]) })())
T("formatHoraires invalide → vide", formatHoraires({ lun: ["x", "y"] }) === "" && formatHoraires(null) === "")

console.log(`\n${ok} OK, ${ko} KO`)
if (ko) process.exit(1)
