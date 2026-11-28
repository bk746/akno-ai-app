# Akno · update50 : correctif inscription + parcours épuré

## 1. Bug « Connexion au serveur impossible » à la création de compte
**Cause exacte** : depuis l'update49, le compte est créé *avant* l'étape « Parlons de vous », donc sans prénom ni entreprise.
Le déclencheur SQL `handle_new_user` (sur `auth.users`) insère alors `NULL` dans `artisans.prenom` et `artisans.nom_entreprise`,
deux colonnes `NOT NULL` → Postgres refuse (`23502`) → Supabase répond **500** à `/auth/v1/signup` → aucun compte créé.
supabase-js classe toute réponse 5xx en `AuthRetryableFetchError`, que l'app traduisait à tort par « Connexion au serveur impossible ».
(Logs Supabase du 17/11 à 17:21 et 17:22, heure de Paris : 2 × `POST /signup` → 500 `null value in column "nom_entreprise"`.)

**Corrigé** :
- `src/components/auth/AuthScreen.tsx` : l'inscription e-mail envoie des métadonnées vides (`prenom`/`entreprise` = un espace, ignoré partout grâce à `trim`) → l'inscription remarche **tout de suite**, même sans toucher à la base.
- `supabase/migrations/20261117_06_update50_signup_trigger.sql` : correctif à la racine du déclencheur (chaîne vide au lieu de NULL). **À appliquer sur la base** (SQL Editor Supabase ou via l'assistant après accord) : indispensable pour Google / Apple, qui ne passent pas par le formulaire.
- `src/components/auth/authErrors.ts` : messages exacts. Hors ligne → « Vous semblez hors ligne… » ; erreur serveur (5xx) → « Nous n'avons pas pu créer votre compte : erreur de notre côté… » (+ remontée Sentry si configuré) ; vrai échec réseau → « Connexion au serveur impossible… ». Les autres cas (compte existant, e-mail invalide, mot de passe faible, trop de tentatives…) restaient déjà gérés.

## 2. Panneau animé (droite, desktop) : ne bouge plus d'un pixel
- `FlowShell.tsx` : grille à une seule ligne de 100dvh, colonne du panneau en `overflow: hidden`.
- `BrandPanel.tsx` : scène de taille fixe ; les 4 cartes ont la même hauteur et sont en position absolue, empilées (carte active devant, les précédentes en plaques derrière). Mesuré : boundingBox identique dans les 4 états à 1280×800, 1440×900, 1920×1080 et 1280×640.

## 3. Parcours épuré
- Étape 1 : onglets remplacés par un lien « Déjà un compte ? Se connecter » ; 3 coches supprimées (une seule mention : « 30 jours d'essai gratuit, sans engagement. ») ; jauge du mot de passe invisible tant qu'on n'a rien tapé ; encadré d'erreur plus discret.
- Étape 2 : métier en liste déroulante (au lieu de 13 pastilles).
- Étape 3 : sous-titre raccourci (le récapitulatif dit déjà « 0 € aujourd'hui » et « résiliable »).
- Étape 4 : sections séparées par un filet, TVA/APE regroupés sous « Identité », « Compléter plus tard » en lien discret avec une seule phrase.
- Étape 5 : même en-tête que les autres étapes (logo + « Plus tard »), bloc centré sur ordinateur, code saisissable au clavier.

Logique inchangée : offres, Stripe, SIRET, code d'accès, gating.

## Fichiers modifiés
- src/components/auth/AuthScreen.tsx, authErrors.ts, BrandPanel.tsx, FlowShell.tsx, fields.tsx
- src/components/onboarding/Flow.tsx, src/components/Lock.tsx, src/components/billing/Offres.tsx
- supabase/migrations/20261117_06_update50_signup_trigger.sql (nouveau)

Aucune nouvelle variable d'environnement.

## Tester en 3 étapes
1. Fenêtre privée → https://akno-ai-app-v2.vercel.app/inscription → nouvel e-mail + mot de passe ≥ 8 caractères → « Créer mon compte » → arrivée sur « Parlons de vous ».
2. Laisser tourner le panneau de droite : il ne change jamais de taille.
3. Aller jusqu'au code d'accès (offre, entreprise « Compléter plus tard », code).
