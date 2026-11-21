# Akno · update64 — Page Chantiers : carte satellite, carrousel, fiche complète, équipe

**Une migration à appliquer vous-même** (non appliquée par l'agent) : `supabase/migrations/20261121_11_update64_chantiers_equipe.sql`.
Tant qu'elle n'est pas appliquée, l'app ne plante pas : la page Chantiers et Réglages → Équipe affichent « appliquez la migration ».
Aucune nouvelle variable d'environnement. Toujours 12 fonctions dans `api/`. Relais Fly.io non modifié. Nouvelle dépendance : `leaflet` (+ `@types/leaflet`).

## Appliquer la migration (quand vous êtes prêt)
Supabase → SQL Editor → coller le contenu du fichier → Run. Elle est rejouable sans risque (idempotente). Elle crée :
- `employes` (prénom, nom, rôle, téléphone, photo) ;
- `chantiers` (titre, client — clé de fiche client + nom + téléphone —, adresse, lat/lng, début/fin, statut `upcoming | in_progress | done`,
  avancement manuel 0–100 facultatif, notes, devis lié facultatif) ; contrainte « fin ≥ début » ;
- `chantier_employes` (affectations) ;
- index, déclencheurs `updated_at`, RLS : chaque artisan ne voit et ne modifie que ses lignes (devis lié et affectations vérifiés) ; aucun accès anonyme ;
- un bucket privé `equipe` pour les photos (dossier `{id artisan}/`).

## Page Chantiers (mobile)
- **Carte satellite plein écran** (Esri World Imagery, sans clé ; mention « Esri, Maxar, Earthstar Geographics »). Leaflet est chargé seulement à l'ouverture
  de la page (bundle principal inchangé). Bouton **calques** : satellite ↔ plan sombre (Esri Dark Gray, sans clé — les fonds CARTO demandent désormais une clé).
- **Repères** : orange en cours, bleu à venir, gris terminé. Le chantier choisi devient un gros repère rond avec casque + nom. **Votre position** en point bleu
  (refus de localisation géré par un message). Bouton **recentrer** sur votre position.
- **En haut** : logo Akno, assistant (étincelles), initiales → Réglages. Pastille « 3 en cours · 2 à venir ⌄ » qui sert aussi de **filtre**
  (Tous / En cours / À venir / Terminés, mémorisé).
- **Cartes en bas** (carrousel avec points) : glisser vers la droite/gauche fait voler la carte vers le chantier et le sélectionne ; toucher un repère fait défiler
  le carrousel. Carte : statut + dates, titre, barre d'avancement + % (calculé d'après les dates ou manuel) ou « Dans X jours », photos/initiales de l'équipe (+N),
  bouton **Itinéraire** (Plans sur iPhone, Google Maps sinon).
- **Fiche complète** : tirer la carte vers le haut (ou la toucher). Client, téléphone, adresse ; **Appeler**, **Itinéraire**, **Ouvrir le chantier** ;
  avancement « Jour X sur Y », « Fin prévue le … » ; équipe (nom, rôle, appeler) ; **notes** modifiables (enregistrées automatiquement).
  Se ferme en la tirant vers le bas ou avec ×.
- **Créer un chantier** : « + » → « Nouveau chantier » (remplace « Bientôt disponible »), ou **appui long sur la carte** (repère provisoire + adresse retrouvée →
  « Créer le chantier »). Formulaire style iOS : titre, statut, client (même sélecteur de contacts que les devis), adresse avec suggestions + mini-carte
  (repère déplaçable), début/fin, avancement manuel, équipe, devis lié (reprend titre/client/adresse), notes. Modifier et supprimer depuis « Ouvrir le chantier ».
- **Sans chantier** : carte centrée sur l'adresse de l'entreprise (sinon la France) + « Créer votre premier chantier ».
- Animations en ressort (vol de carte, aimantation du carrousel, fiche), mouvements réduits respectés, zones sûres iPhone, la page ne défile pas sous la carte.

## Ordinateur
Liste des chantiers à gauche (filtres, « Nouveau », fiche complète dans le panneau) + grande carte à droite.

## Équipe (Réglages → Gestion → Équipe)
Ajouter / modifier / supprimer : prénom, nom, rôle (suggestions), téléphone, photo (réduite sur l'appareil, bucket privé) sinon initiales.
Les employés s'affectent aux chantiers dans le formulaire. Le planning d'équipe complet viendra plus tard.

## Fichiers
Nouveaux : `src/components/chantiers/ChantiersPage.tsx`, `ChMap.tsx`, `parts.tsx`, `ChantierForm.tsx`, `EquipeSheet.tsx`, `src/lib/chantiers.ts`,
`src/lib/chantierCalc.ts`, `src/lib/geo.ts`, `scripts/test-chantiers.ts`, la migration. Modifiés : `src/components/AknoApp.tsx` (page Chantiers, « + » Nouveau chantier,
ligne Équipe), `src/components/ui.tsx` (fenêtre « equipe »), `src/index.css` (repères, carte), `supabase/tests/rls_test.sql` (tests update64), `package.json`.

## Tests
Build OK · réceptionniste 33/33 · Twilio 22/22 · assistant 60/61 (même échec connu : move_rdv Lucas Girard) · factures 41/41 · **chantiers 38/38 (nouveau :
avancement, jours, statuts, libellés)** · relais voix 25/25 · RLS base OK (2 passages, + 8 tests update64) · 12 fonctions `api/`.
Playwright 390×844 : page Chantiers (tuiles satellite et plan chargées, repères, carrousel, fiche, filtre, appui long, création, équipe, état vide,
migration absente, ordinateur) + navigation complète update63 sans régression. Captures : `update64-screens/`.
