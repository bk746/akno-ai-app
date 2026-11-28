# Refonte iOS · nouvelle DA (base : main 203331b)

## Navigation
- Barre d'onglets en verre clair, 4 onglets : Réception · Agenda · Chantiers · Factures. Badge rouge = factures en retard (à relancer). Plus de « + » central.
- Chaque page : titre à gauche + capsule en verre (+ · action · …). « … » ouvre Réglages en feuille (monte du bas, « Terminé » pour fermer).
- Réception : capsule + (note d'appel) · Clients · … ; listes « À rappeler » (noms en rouge) et « Appels récents » ; toucher une ligne = appeler, « i » = fiche.
- Agenda : capsule + (RDV) · Équipe · … ; Équipe et Clients s'ouvrent en push iOS avec bouton retour.
- Chantiers : titre + capsule (+ nouveau chantier · liste/historique · …) ; nouvelle feuille « Chantiers » (En cours / À venir / Terminés, recherche, par mois) ; cartes et fiche en clair.
- Factures (« Facturation ») : segmenté Devis | Factures | Relances.

## Relances (nouveau)
- Onglet Relances : réglage « Relances auto » (J+3, J+7, J+15), factures impayées (Relancer), devis sans réponse, clients à rappeler, accès à l'ancienne page Relances (devis + avis).
- Feuille « Relance » : SMS (Twilio) · E-mail (Resend) · Appel IA, objet / message modifiables, lien de paiement. Envoi : `POST /api/devis` action `facture_relance_now` (trace dans `facture_relances`, écrite côté serveur avec la clé service, aucune migration).
- Appel IA : pas encore de route d'appel sortant → bouton « Bientôt disponible » + appel direct par l'artisan (le serveur répond 501 `soon`).
- Cron existant `/api/relances` : 1er palier passé de J+1 à J+3 (J+3 / J+7 / J+15, mise en demeure J+30 toujours à valider).
- Historique d'une facture : émise, échue, relances (canal, date), paiement reçu.

## Style
- Haut de page noir (bot blanc, chiffre 64 pt), contenu en feuille blanche (rayon 40), feuilles modales en gris groupé iOS.
- Couleurs porteuses de sens : rouge #E0221B (retard/dû), orange #B25E00 (bientôt/pause), bleu #0071E3 / #007AFF (signé/succès).
- Thème clair par portée `.akno-light` (index.css) : les écrans existants passent en clair sans toucher à leur logique.
- Animations : ressorts (motion), titre qui se replie au défilement, push / sheet natifs, haptique (Capacitor Haptics, repli navigator.vibrate), prefers-reduced-motion respecté.

## Tests
- `npm run build` OK · `npm run test:relances-ui` · `npm run shots:refonte` (captures 390×844, données simulées).
- Les anciens tests visuels de la barre (`test:navbar`, `test:bottom`…) décrivent l'ancienne barre à « + » central : ils sont obsolètes.
