# Update 67 · Fluidité « native iOS » (transitions, feuilles, + , recadrage photo)

Inclut tout l'update66. **Aucune nouvelle migration**, aucune nouvelle fonction `api/` (toujours 12), relais vocal inchangé.

## 1. Transitions entre pages (priorité n°1)
- `src/lib/motion.ts` : ressorts communs (PUSH, TAB, SHEET, SNAP) + `lazyPage()` (pages paresseuses préchargeables) + `idle()`.
- `AknoApp.tsx › Pages` : pile de pages animée (AnimatePresence, couches absolues).
  - Onglets et pages du + : fondu enchaîné léger avec petit glissement dans le sens de la barre ; la nouvelle page (fond plein) se pose sur l'ancienne qui reste opaque → aucun trou noir, aucun flash.
  - Réglages (et Réglages → Équipe / Clients) : push iOS depuis la droite (l'ancienne page recule de 28 % et s'assombrit), retour inversé (bouton, historique, geste retour).
  - Pages paresseuses : préchargées au repos (requestIdleCallback), à l'intention (pointerdown / survol d'un onglet, ouverture du +) ; `go()` attend le préchargement : l'ancienne page reste affichée jusqu'à ce que la suivante soit prête (plus de squelette ni d'écran noir). Les données Chantiers / Équipe sont aussi chargées au repos.
  - Ordinateur : fondu simple. `prefers-reduced-motion` respecté (MotionConfig `reducedMotion="user"` + contrôles dans les composants).
  - View Transitions API non utilisée : non prise en charge sur les iOS plus anciens et moins de contrôle sur les ressorts ; motion suffit (pas de nouvelle dépendance).
- `nav/PushStack.tsx` : fiches client / membre en push iOS au-dessus de la liste, qui reste montée et garde son défilement (plus de saut en haut de liste au retour).

## 2. Bouton + et feuille « Créer »
- Montée une seule fois (plus d'effet « apparaît puis recharge ») : fond en fondu (sans flou animé), feuille en ressort, tuiles en cascade légère, + qui tourne en ×. Fermeture douce : ×, tap sur le fond, Échap, retour, glisser vers le bas.
- **Retirés** : Nouveau RDV, Nouveau devis, Nouvelle facture (restent dans Agenda et Devis | Factures). Restent : Nouveau chantier, Clients, Équipe (grille 3 colonnes).

## 3. Pages hors onglets (Équipe, Clients)
- Aucun onglet allumé. Plus de « < Compte » : logo Akno en haut à gauche, assistant + initiales à droite (même en-tête que les pages principales). Retour = historique / geste retour.
- Les fiches gardent « < Clients » / « < Équipe ». Les liens de Réglages ouvrent les mêmes pages.

## 4. Switch Devis / Factures
- Pilule unique qui glisse en ressort ; contenu qui glisse dans le sens du changement avec fondu ; hauteur animée sans saut ; le bot bleu ne bouge pas ; pas de clignotement de liste.

## 5. Une seule feuille modale : `components/sheet/ModalSheet.tsx`
Fond en fondu, montée en ressort, poignée, glisser vers le bas pour fermer (si le contenu est en haut), clavier géré sans saut (`--kb`), pile Échap, verrouillage du défilement, focus restauré ; ordinateur : boîte centrée.
Utilisée partout : feuilles génériques `ui.tsx › Sheet` (factures, réglages, appels…), nouveau client, nouveau membre, liste Équipe, nouveau chantier, choix du client, prestations, modèles de devis, accès à l'app, mise à niveau d'offre, configuration (SetupGate), assistant, et l'éditeur de devis sur mobile (grande feuille ; glisser vers le bas = même garde « devis non enregistré », la feuille revient si on annule).

## 6. Recadrage de la photo de profil : `components/photo/PhotoCropper.tsx`
Masque circulaire, déplacer au doigt / à la souris, zoom au pincement, à la molette et au curseur, double-clic = recentrer, Annuler / Valider. Export carré 512 px JPEG → bucket `equipe` (même chemin qu'avant). Branché sur le formulaire membre (seul endroit avec une photo de profil).

## Tests
- Unitaires : receptionist 33, twilio 22, assistant 60/61 (cas connu), factures 41, chantiers 38, equipe 47, clients 57, relais 25, RLS `node supabase/tests/run-local.mjs --twice` OK.
- Playwright (390 px) : pas d'onglet allumé sur /equipe et /clients, logo présent, pas de « Compte » ; + monté une seule fois (MutationObserver) ; 3 raccourcis retirés ; recadrage (molette, curseur, envoi JPEG 512 px au bucket, Annuler) ; feuille fermée en glissant ; régressions update64/65/66 adaptées (3 tuiles, plus d'onglet allumé, retour par l'historique).
- Vidéos 60 i/s des transitions : `akno-docs/update67-videos/`.

## Migrations (inchangé)
À appliquer dans l'ordre si ce n'est pas déjà fait : `20261121_12_update65_equipe_acces.sql` puis `20261121_13_update66_clients.sql`. Aucune nouvelle migration dans l'update67.
