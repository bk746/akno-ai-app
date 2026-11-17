# Update 49 · Parcours d'accueil unique + correctif « pas de page des prix »

## Le bug corrigé
**Symptôme** : un nouveau compte (keryanbed@gmail.com, créé le 17/11 à 15:02, heure de Paris) est entré dans l'app sans passer par le choix de l'offre.

**Cause exacte** : le cache module de `src/lib/accountApi.ts` (`useAccount`) survivait à la déconnexion.
- À 14:17, le compte keryanbouzerda@gmail.com (offre Bureau, en essai, donc accès ouvert) était connecté dans le même onglet.
- Après « Se déconnecter », puis la création du nouveau compte, l'app a réutilisé les droits du compte précédent.
- Comme la confirmation d'e-mail est désactivée dans Supabase, la session s'ouvre sans rechargement de page, et le cache n'a donc pas été rechargé.
- Gate a vu `access: true` et n'a pas affiché les offres. Il a seulement affiché l'onboarding : la fiche, elle, était bien rechargée, et c'est sa validation (ou « Passer pour l'instant ») qui a mis `onboarding_done = true`. Aucun trigger SQL ne touche à cette colonne (vérifié en lecture seule).

Second défaut du même type : quand `/api/account` échouait, le compte valait `null`. `canUse` ouvrait alors tout et Gate ne bloquait rien.

**Correction** :
- Le cache du compte est lié à l'utilisateur : il est vidé et rechargé à chaque changement de session, et une réponse arrivée pour l'ancien utilisateur est ignorée.
- Le cache de la fiche artisan suit la même règle.
- `useAccountState()` et `useProfileState()` exposent les états chargement / ok / erreur.
- Le nouveau parcours (`src/components/onboarding/Flow.tsx`) s'affiche AVANT l'app. Tant que le compte et la fiche ne sont pas chargés, on voit « Préparation de votre espace… ». En cas d'échec, l'écran « Impossible de charger votre compte » propose **Réessayer** et **Se déconnecter**. Un compte sans offre n'entre donc jamais dans l'app sur un appel échoué.
- Les comptes `plan_override` ont `access: true` et passent directement.

## Le parcours
L'étape est déduite des données serveur (fiche `artisans` + `/api/account`). Si l'utilisateur recharge la page ou revient plus tard, il reprend au bon endroit.

1. **Compte** (`auth/AuthScreen.tsx`)
   - Un seul écran avec deux onglets, « Créer un compte » et « Se connecter ».
   - « Continuer avec Google » et « Continuer avec Apple », puis e-mail et mot de passe.
   - « Mot de passe oublié » et le nouveau mot de passe restent dans `Login.tsx`.
2. **Parlons de vous** : prénom, entreprise, métier, téléphone et CGV.
   - Cette étape s'affiche tant que le prénom, l'entreprise ou l'acceptation des CGV manquent. C'est notamment le cas après Google ou Apple.
   - Les infos sont enregistrées dans `artisans` et les CGV via `accept_cgv`.
3. **Offre puis paiement** : les écrans Offres et Stripe existants, avec le même indicateur d'étapes. Le retour de Stripe (`?billing=ok&session_id=…`) reprend l'écran d'activation.
4. **Votre entreprise** : SIRET avec recherche automatique dès les 14 chiffres, raison sociale, adresse, TVA et APE, assurance décennale, lien d'avis Google.
   - « Enregistrer et continuer », ou « Compléter plus tard ». Les deux mettent `onboarding_done = true`.
   - Tout reste modifiable dans Paramètres › Entreprise.
5. **Code d'accès** (écran existant), avec « Plus tard ». Ensuite, entrée dans l'app.

Les animations respectent « réduire les animations ».

## Activer « Continuer avec Google »
Doc vérifiée le 17/11/2026 : https://supabase.com/docs/guides/auth/social-login/auth-google

1. https://console.cloud.google.com : créez ou choisissez un projet, puis ouvrez **Google Auth Platform**.
2. **Branding** :
   - Nom de l'app : Akno.
   - E-mail d'assistance et logo.
   - Domaine autorisé : votre domaine Akno.
   - Liens : `https://VOTRE-DOMAINE/confidentialite` et `https://VOTRE-DOMAINE/cgv`.
3. **Audience** : choisissez « Externe », puis **publiez l'application** (« En production »). Sinon, seuls les utilisateurs de test peuvent se connecter.
4. **Data Access** : les scopes `openid` (à ajouter à la main), `.../auth/userinfo.email` et `.../auth/userinfo.profile`.
5. **Clients** → Créer un client → type **Application Web** :
   - Origines JavaScript autorisées : `https://VOTRE-DOMAINE`, plus `http://localhost:5173` pour le développement (à retirer ensuite).
   - URI de redirection autorisés : `https://mmakyjgjhtxkklewrpeu.supabase.co/auth/v1/callback`.
   - Créez le client, puis copiez le **Client ID** et le **Client secret**.
6. Supabase → **Authentication → Sign In / Providers → Google** : activez le provider, collez le Client ID et le Client secret, puis enregistrez.
7. Supabase → **Authentication → URL Configuration** :
   - Site URL : `https://VOTRE-DOMAINE`.
   - Redirect URLs : ajoutez `https://VOTRE-DOMAINE/**`, plus vos URL de préproduction Vercel si besoin.
8. Vercel → Environment Variables : `VITE_AUTH_GOOGLE=1`, puis redéployez.

## Activer « Continuer avec Apple »
Il faut un compte **Apple Developer payant**. Doc vérifiée le 17/11/2026 : https://supabase.com/docs/guides/auth/social-login/auth-apple

1. Notez votre **Team ID** (10 caractères), visible en haut à droite de developer.apple.com ou dans Membership.
2. **Identifiers → App IDs** : créez un App ID (par exemple `fr.akno.app`) et cochez la capacité **Sign in with Apple**.
3. **Identifiers → Services IDs** : créez un Services ID (par exemple `fr.akno.web`). Activez Sign in with Apple, puis Configure :
   - App ID principal : celui de l'étape 2.
   - Domaines : `mmakyjgjhtxkklewrpeu.supabase.co`.
   - Return URLs : `https://mmakyjgjhtxkklewrpeu.supabase.co/auth/v1/callback`.
4. **Keys** :
   - Créez une clé avec « Sign in with Apple » et l'App ID principal.
   - Téléchargez `AuthKey_XXXXXXXXXX.p8`. Il n'est téléchargeable qu'une fois : gardez-le en lieu sûr.
   - Notez le **Key ID**.
5. Générez la **clé secrète** (un JWT) avec l'outil de la page Supabase « Login with Apple ». Il fonctionne dans Chrome ou Firefox, pas dans Safari, et a besoin du Team ID, du Key ID, du Services ID et du fichier .p8.
6. Supabase → **Authentication → Sign In / Providers → Apple** : activez le provider.
   - Client IDs : le **Services ID** en premier.
   - Secret Key : la clé générée.
   - Enregistrez.
7. Pour les utilisateurs qui masquent leur e-mail : dans **Services → Sign in with Apple for Email Communication**, déclarez le domaine qui envoie les e-mails d'Akno (celui configuré dans Resend).
8. Mettez un **rappel tous les 6 mois** : Apple impose de régénérer la clé secrète (étape 5), sinon la connexion Apple cesse de fonctionner.
9. Vercel : `VITE_AUTH_APPLE=1`, puis redéployez.

Apple ne transmet pas le nom de l'utilisateur dans ce mode de connexion. C'est pour cela que l'étape « Parlons de vous » le demande.

Si un bouton est affiché alors que le provider n'est pas activé dans Supabase, l'app le détecte avant la redirection (`/auth/v1/settings`) et affiche : « La connexion avec Google n'est pas encore activée sur Akno… ». Les erreurs renvoyées au retour de Google ou d'Apple sont aussi traduites en français.

## Variables d'environnement
- `VITE_AUTH_GOOGLE` et `VITE_AUTH_APPLE` : mettre `"1"` pour afficher le bouton. Les boutons sont masqués si la variable n'est pas définie.
- Rien d'autre de nouveau.

## Fichiers
**Nouveaux** :
- `src/components/auth/AuthScreen.tsx`
- `src/components/auth/FlowShell.tsx`
- `src/components/onboarding/Flow.tsx`

**Modifiés** :
- `src/lib/accountApi.ts` (cache lié à l'utilisateur, `useAccountState`)
- `src/lib/profile.ts` (`useProfileState`)
- `src/components/AknoApp.tsx` (le parcours enveloppe l'app)
- `src/components/Login.tsx` (connexion et inscription renvoient vers AuthScreen ; mot de passe oublié et reset inchangés)
- `src/components/billing/Offres.tsx` (prop `flow`)
- `src/components/Lock.tsx` (prop `flow`)
- `src/components/sheets/Gate.tsx` (l'onboarding a été déplacé dans le parcours)
- `.env.example`

**Supprimé** : `src/components/auth/Signup.tsx`, remplacé par AuthScreen.

## Comptes de prod concernés
- keryanbed@gmail.com n'a pas d'abonnement. À sa prochaine connexion, il arrivera directement sur l'étape **Offre**.
- lejoillelouise@gmail.com (créé le 17/11 sans abonnement) aura le même comportement.
- Aucune donnée de prod n'a été modifiée.
