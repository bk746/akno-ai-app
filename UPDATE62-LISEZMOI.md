# Akno · update62 — Nouvelle barre de navigation (maquettes navbar.jpg + bouton-plus.jpg)

Aucune migration. Aucune nouvelle variable. Toujours 12 fonctions dans `api/`. Relais Fly.io non modifié.

## Barre du bas (mobile)
- Pilule sombre flottante : **Réception · Agenda · [ + ] · Chantiers · Factures**. Onglet actif : fond clair arrondi qui glisse d'un onglet à l'autre.
- **Factures** : pastille blanche = factures émises non payées (dont en retard), masquée à 0.
- **+** : feuille « Créer » sur fond flouté, grille 3 × 2. Le + pivote en × pendant l'ouverture.
  Fermeture : ×, tap sur le fond, glisser vers le bas, Échap, bouton/geste retour Android (sans quitter la page).
  Animations en ressort (transform/opacity uniquement), tuiles en cascade, prefers-reduced-motion respecté,
  défilement bloqué sous la feuille, zones sûres iPhone (PWA), pas de double déclenchement en tapant vite.
- Raccourcis branchés sur l'existant : Nouveau RDV (formulaire RDV), Nouveau devis (éditeur), Nouvelle facture (brouillon, comme le bouton « Nouvelle facture »),
  Contact (liste Clients : pas encore d'écran de création de contact). Nouveau chantier et Note : « Bientôt disponible ».

## Pages
- Chantiers (`/chantiers`) : page d'attente « Bientôt : la carte de vos chantiers ».
- Factures (`/factures`) : sélecteur Devis / Factures. Devis = page Devis existante (`/devis`, inchangée) ; Factures = à encaisser + récentes (ouvrent la fiche facture existante).
- Relances (`/relance`, page inchangée) : hors onglets (elles gèrent aussi les demandes d'avis). Accès : carte « Relances » (nombre à venir) sur la Réception et ligne « Relances » dans Réglages → Gestion. Bouton retour.
- Réglages (`/parametres`) : bouton initiales en haut à droite de chaque page. Bouton retour.
- Ordinateur : barre latérale inchangée + entrées Factures et Chantiers.

## Liens
Liens directs et notifications `/reception`, `/agenda`, `/devis`, `/factures`, `/relance`, `/parametres`, `/chantiers` → bonne page et bon onglet
(`/factures`, envoyé par les rappels d'impayés, ouvrait auparavant la Réception).

## Fichiers
`src/components/nav/MobileNav.tsx` (nouveau), `src/lib/facturesLite.ts` (nouveau), `src/components/AknoApp.tsx`, `src/components/ui.tsx`,
`src/components/setup/SetupGate.tsx`, `src/components/sheets/FacturesSheet.tsx`, `src/main.tsx`.

## Tests
build OK · receptionist 33/33 · twilio 22/22 · assistant 60/61 (échec connu Lucas Girard) · factures 41/41 · relais 25/25 · base locale OK ·
Playwright : 60 vérifications, 0 échec, 0 erreur JS.
