# Akno · update63 — Devis et Factures sur une même page (bot bleu) + éditeurs refaits style iOS

Aucune migration. Aucune nouvelle variable. Toujours 12 fonctions dans `api/`. Relais Fly.io non modifié. Inclut update62 (barre de navigation).

## Une seule page Devis | Factures
- L'onglet **Factures** affiche une seule page : le **bot bleu Devis** reste en haut, en permanence. Juste dessous, un sélecteur **Devis | Factures**
  (pilule bleue qui glisse en ressort).
- La bascule ne change que le contenu du dessous (actions rapides + listes), avec un fondu-glissé dans le sens du geste.
  Le bot, son halo et le chiffre ne sont pas remontés : le chiffre s'anime d'une valeur à l'autre (validés ce mois ↔ à encaisser).
- Le dernier mode choisi est mémorisé sur l'appareil : l'onglet Factures rouvre Devis ou Factures selon votre dernier choix.
- Liens conservés : `/devis` ouvre le mode Devis, `/factures` le mode Factures (liens directs, notifications, barre latérale ordinateur).
  La bascule remplace l'adresse sans ajouter d'entrée d'historique. La pastille des impayés et les raccourcis du « + » sont inchangés.
- **Assistant en mode Factures** : même bot. Suggestions « Factures à encaisser », « Factures en retard », « Crée une facture », « Facturer un devis »,
  « Combien reste à encaisser ? », « Devis à valider ». Il liste les factures à encaisser ou en retard (avec le montant) et ouvre une nouvelle facture.
  Pour facturer un devis, il explique le chemin (devis → Créer la facture / Acompte / Situation).

## Éditeur de devis et éditeur de facture (refonte visuelle, logique inchangée)
- Sections à petit titre : **Client, Chantier, Prestations, Conditions** (+ Total). Listes groupées en encart, libellés en ligne, séparateurs fins, sans cadres.
- **Client** : une ligne avec le client choisi (initiales, téléphone, e-mail) qui ouvre une feuille de recherche (nom, téléphone ou e-mail).
  Un nom absent des contacts se choisit avec « Nouveau client « … » ». E-mail, téléphone et adresse se remplissent seuls et se replient (« Coordonnées »).
- **Chantier** : objet des travaux + interrupteur « Identique à l'adresse client » qui fait apparaître le champ d'adresse du chantier.
- Bons claviers et saisie automatique (e-mail, téléphone, adresse). Tous les champs font au moins 16 px : plus de zoom automatique sur iPhone.
- **Prestations (devis)** : lignes en cartes épurées, quantités au stepper, **balayer vers la gauche pour supprimer** (avec « Annuler » comme avant).
  Le menu « … » de chaque ligne, la bibliothèque, les sections, le glisser-déposer et les raccourcis clavier ordinateur sont inchangés.
- **Conditions** : remise, acompte, validité, conditions de paiement, remarques. Total HT / remise / TVA par taux / TTC / marge.
- **Barre du bas compacte** : HT · TVA, total TTC, + et Envoyer. Elle s'efface quand le clavier est ouvert (pas de saut de mise en page).
- **Brouillon à reprendre** : petite pilule discrète « Brouillon · … gardé — Reprendre — × ».
- Facture : mêmes sections ; client professionnel (SIREN, n° TVA, autoliquidation), date des travaux, nature, TVA sur les débits, retenue de garantie,
  lignes en cartes avec stepper, récapitulatif HT · TVA · TTC au-dessus de « Enregistrer / Émettre ». Contrôles (SIREN obligatoire, au moins une ligne,
  confirmation d'émission), mentions légales, Factur-X, relances, avoirs : inchangés.
- Ordinateur : même style ; Client et Chantier côte à côte, tableau des lignes conservé.

## Fichiers
`src/components/form/grouped.tsx` (nouveau : sections, lignes, interrupteur, feuille contacts, pilule), `src/components/AknoApp.tsx`,
`src/components/devis/DevisEditor.tsx`, `src/components/devis/fields.tsx` (option `soft` du stepper), `src/components/sheets/FacturesSheet.tsx`,
`src/components/nav/MobileNav.tsx`, `src/lib/facturesLite.ts`, `src/index.css`.

## Tests
Build OK · réceptionniste 33/33 · Twilio 22/22 · assistant 60/61 (même échec connu qu'avant : move_rdv Lucas Girard) · factures 41/41 · relais voix 25/25 ·
RLS base OK (2 passages) · 12 fonctions `api/`. Playwright 390×844 : navigation complète (onglets, +, liens, notifications, bureau) + page unifiée
+ éditeurs (contacts, coordonnées, chantier, modèle, stepper, balayage, 16 px, validation SIREN, enregistrement) : 0 échec, 0 erreur JS.
