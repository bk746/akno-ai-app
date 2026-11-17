import { useEffect } from "react"
import { Link, useParams } from "react-router-dom"
import { CGV_VERSION, EDITOR as E } from "../lib/legal"

/* update45 · Pages légales publiques. MODÈLES À FAIRE RELIRE PAR UN JURISTE avant mise en production. */
type Doc = { title: string; body: [string, string[]][] }
const SUBS = "Supabase (base de données et authentification, région UE), Vercel (hébergement de l'application et des fonctions, région Paris cdg1), xAI (réceptionniste vocale et génération des brouillons de devis), Resend (envoi des e-mails), Stripe (paiement de l'abonnement), Twilio (SMS et téléphonie, si activés), Cal.com (agenda en ligne, si connecté par l'artisan), Sentry (suivi des erreurs, si activé)"
const DOCS: Record<string, Doc> = {
  cgv: { title: "Conditions générales de vente", body: [
    ["1. Objet", [`Les présentes conditions régissent l'abonnement au logiciel en ligne « Akno » édité par ${E.name} (« l'Éditeur ») et souscrit par un professionnel (« le Client ») pour les besoins de son activité. Akno n'est pas destiné aux consommateurs.`]],
    ["2. Offres et prix", ["Akno Bureau : 89 € HT par mois. Akno Clients + Bureau : 199 € HT par mois. Option Réceptionniste IA : 50 € HT par mois (100 minutes d'appel incluses par mois). La TVA au taux en vigueur s'ajoute. Les quotas d'usage (brouillons de devis IA, SMS, minutes) sont indiqués dans l'application, rubrique Abonnement.", "Les prix peuvent évoluer ; le Client est prévenu au moins 30 jours avant l'application d'un nouveau prix et peut résilier avant cette date."]],
    ["3. Essai gratuit", ["Tout nouveau compte bénéficie de 30 jours d'essai gratuit, sans engagement. Sans souscription à la fin de l'essai, l'accès aux fonctions est suspendu ; les données sont conservées 90 jours puis supprimées."]],
    ["4. Durée, paiement et résiliation", ["L'abonnement est mensuel, sans engagement, renouvelé tacitement chaque mois. Il est payable d'avance par carte ou prélèvement via notre prestataire Stripe. Le Client peut résilier à tout moment depuis « Gérer mon abonnement » ; la résiliation prend effet à la fin de la période en cours, sans remboursement prorata.", "En cas d'échec de paiement, l'accès peut être suspendu après relance. Toute somme impayée à l'échéance entraîne des pénalités au taux de trois fois le taux d'intérêt légal et une indemnité forfaitaire de 40 € pour frais de recouvrement (art. L441-10 du Code de commerce)."]],
    ["5. Intelligence artificielle", ["Les brouillons de devis, les résumés d'appels et les réponses de la réceptionniste sont générés automatiquement et peuvent contenir des erreurs. Le Client reste seul responsable des devis, factures et engagements envoyés à ses propres clients : aucun devis n'est envoyé sans sa validation. La réceptionniste informe les appelants qu'ils parlent à une assistante IA et que l'appel peut être enregistré."]],
    ["6. Obligations du Client", ["Le Client s'engage à fournir des informations exactes (SIRET, assurance, mentions légales), à respecter la réglementation applicable à ses documents commerciaux et à ses échanges avec ses clients (notamment information et opposition au démarchage, réglementation SMS), et à garder ses identifiants confidentiels."]],
    ["7. Disponibilité et support", ["L'Éditeur fait ses meilleurs efforts pour assurer la disponibilité du service 24 h/24, hors maintenance et incidents des prestataires techniques. Le support est assuré par e-mail à " + E.email + "."]],
    ["8. Responsabilité", ["La responsabilité de l'Éditeur est limitée aux dommages directs et plafonnée aux sommes payées par le Client au cours des 12 derniers mois. L'Éditeur n'est pas responsable des pertes de chiffre d'affaires, de chantiers ou de données imputables au Client ou à un tiers."]],
    ["9. Données personnelles", ["Pour les données de ses propres clients, le Client est responsable de traitement et l'Éditeur agit en sous-traitant selon l'accord de sous-traitance (DPA) qui fait partie des présentes. Voir aussi la politique de confidentialité."]],
    ["10. Droit applicable", ["Les présentes sont soumises au droit français. À défaut d'accord amiable, tout litige relève des tribunaux compétents du ressort du siège de l'Éditeur."]],
  ] },
  "mentions-legales": { title: "Mentions légales", body: [
    ["Éditeur", [`${E.name} — ${E.form}`, `Siège : ${E.address}`, `SIRET : ${E.siret} · TVA : ${E.tva}`, `Directeur de la publication : ${E.director}`, `Contact : ${E.email}`]],
    ["Hébergement", ["Application : Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis — fonctions exécutées dans la région Paris (cdg1).", "Données : Supabase Inc., 970 Toa Payoh North #07-04, Singapour 318992 — base hébergée dans l'Union européenne (à vérifier selon la région du projet)."]],
    ["Propriété intellectuelle", ["Le logiciel Akno, sa marque et ses contenus sont la propriété de l'Éditeur. Toute reproduction non autorisée est interdite."]],
  ] },
  confidentialite: { title: "Politique de confidentialité", body: [
    ["Qui traite vos données ?", [`${E.name} (${E.address}) pour la gestion des comptes artisans et de l'abonnement. Pour les données des clients des artisans (appels, devis, factures, rendez-vous), l'artisan est responsable de traitement et Akno agit pour son compte (voir le DPA). Contact RGPD : ${E.dpo}.`]],
    ["Données traitées", ["Compte artisan : identité, coordonnées, informations d'entreprise, données de facturation (la carte bancaire est gérée par Stripe, Akno n'y a pas accès). Clients des artisans : nom, téléphone, e-mail, adresse du chantier, contenu des appels (transcription, résumé, enregistrement audio), devis, factures, rendez-vous, demandes reçues via le site de l'artisan."]],
    ["Finalités et bases légales", ["Fourniture du service (exécution du contrat), facturation (obligation légale), sécurité et prévention des abus (intérêt légitime), amélioration du service à partir de statistiques agrégées (intérêt légitime). Aucune donnée n'est vendue ni utilisée pour de la publicité."]],
    ["Enregistrement des appels", ["La réceptionniste annonce en début d'appel qu'il peut être enregistré pour le suivi de la demande. Les enregistrements sont stockés dans un espace privé propre à chaque artisan et supprimés automatiquement après la durée choisie par l'artisan (180 jours par défaut, 1 an maximum)."]],
    ["Durées de conservation", ["Compte : durée de l'abonnement puis 90 jours. Factures et pièces comptables : 10 ans (Code de commerce). Devis non signés et prospects : 3 ans après le dernier contact. Journaux techniques : 12 mois maximum."]],
    ["Sous-traitants", [SUBS + ". Certains sont établis hors de l'Union européenne ; les transferts sont encadrés par les clauses contractuelles types de la Commission européenne ou le Data Privacy Framework."]],
    ["Vos droits", ["Accès, rectification, effacement, limitation, opposition, portabilité : écrivez à " + E.dpo + ". Vous pouvez introduire une réclamation auprès de la CNIL (www.cnil.fr). Les clients d'un artisan s'adressent en priorité à cet artisan ; Akno l'aidera à répondre.", "Pour ne plus recevoir de SMS d'un artisan, répondez STOP."]],
  ] },
  dpa: { title: "Accord de sous-traitance des données (DPA)", body: [
    ["Objet", ["Le présent accord, conclu en application de l'article 28 du RGPD, encadre les traitements réalisés par Akno (« le Sous-traitant ») pour le compte de l'artisan abonné (« le Responsable de traitement ») et fait partie intégrante des CGV."]],
    ["Description des traitements", ["Nature : hébergement, réception et transcription d'appels, génération de brouillons de devis, envoi d'e-mails et de SMS, prise de rendez-vous, facturation. Personnes concernées : clients et prospects de l'artisan. Données : identité, coordonnées, adresse de chantier, contenu des échanges et enregistrements, montants. Durée : celle de l'abonnement."]],
    ["Obligations du Sous-traitant", ["Ne traiter les données que sur instruction documentée du Responsable (l'usage du logiciel vaut instruction) ; garantir la confidentialité des personnes autorisées ; mettre en œuvre des mesures de sécurité appropriées (chiffrement en transit, cloisonnement des données par compte au niveau de la base, stockage privé des enregistrements, accès restreints) ; aider le Responsable à répondre aux demandes d'exercice des droits ; notifier toute violation de données dans les meilleurs délais et au plus tard 48 h après en avoir pris connaissance ; supprimer ou restituer les données à la fin du contrat (export sur demande, suppression sous 90 jours)."]],
    ["Sous-traitants ultérieurs", ["Le Responsable autorise le recours aux sous-traitants suivants : " + SUBS + ". Tout changement est notifié au moins 30 jours à l'avance ; le Responsable peut s'y opposer en résiliant."]],
    ["Audit", ["Le Sous-traitant met à disposition les informations nécessaires pour démontrer le respect du présent accord, sur demande écrite raisonnable, au plus une fois par an."]],
  ] },
}

export default function Legal({ doc }: { doc?: string }) {
  const params = useParams(), key = doc || params.doc || "cgv", d = DOCS[key] || DOCS.cgv
  useEffect(() => { document.title = `Akno · ${d.title}` }, [d.title])
  return <div className="min-h-[100dvh] bg-black text-white antialiased"><div className="mx-auto max-w-[720px] px-5 py-12">
    <Link to="/reception" className="text-[14px] text-white/50">← Akno</Link>
    <h1 className="mt-6 text-[30px] font-semibold tracking-[-0.03em]">{d.title}</h1>
    <p className="mt-2 rounded-[12px] border border-[#FFB340]/30 bg-[#FFB340]/10 px-3 py-2 text-[13px] text-white/75">Modèle à faire relire par un juriste avant mise en ligne. Version {CGV_VERSION}.</p>
    {d.body.map(([h, ps]) => <section key={h} className="mt-8"><h2 className="text-[18px] font-semibold">{h}</h2>{ps.map((p, i) => <p key={i} className="mt-2 text-[15px] leading-relaxed text-white/75">{p}</p>)}</section>)}
    <nav className="mt-12 flex flex-wrap gap-4 border-t border-white/10 pt-6 text-[13.5px] text-white/50">{Object.entries(DOCS).map(([k, x]) => <Link key={k} to={`/${k}`}>{x.title}</Link>)}</nav>
  </div></div>
}
