# Akno · update46 : choix d'offre + paiement intégré aux couleurs Akno

## Ce qui change

1. **Écran « Choisissez votre offre »** (plein écran, même DA que l'inscription de l'update45). Il s'affiche **avant l'app** pour tout compte sans abonnement actif ou en essai. Les comptes `plan_override` ne le voient jamais.
   - Bascule **Mensuel / Annuel** avec un badge **-20 %**. En annuel, l'écran montre le prix par mois équivalent, le prix mensuel barré et le total facturé par an.
   - Cartes **Bureau** (89 € HT/mois) et **Clients + Bureau** (199 € HT/mois). Les fonctionnalités et les quotas sont ceux du code.
   - **Option Réceptionniste IA** (+50 € HT/mois, ou 40 €/mois en annuel), avec 100 min incluses.
   - Récapitulatif avec frise : **« Aujourd'hui 0 € »**, puis la date du premier prélèvement avec les montants HT et TTC (TVA 20 %).
   - Animations : apparition en cascade, prix qui défilent, pastille qui glisse, frise qui se dessine. Tout est coupé si l'appareil demande moins de mouvement (`prefers-reduced-motion`).
2. **Paiement intégré dans l'app.** On ne part plus sur la page Stripe.
   - Il utilise Stripe Checkout Sessions + Elements (`ui_mode: "elements"`).
   - Les champs carte, adresse de facturation, TVA intracom (facultatif) et code promo sont stylés comme les champs Akno : fond carbone, Geist, focus blanc.
   - Le récapitulatif reste à côté (sur mobile : carte compacte au-dessus).
   - Seule la carte bancaire est proposée.
3. **30 jours d'essai gratuit sur toutes les offres**, une seule fois par compte. L'essai est refusé si un abonnement a déjà existé, en base ou chez Stripe. La carte est demandée, et rien n'est prélevé avant J+30.
4. **Activation au retour.** Le serveur relit la session chez Stripe (`checkout_sync`) et met la table `subscriptions` à jour sans attendre le webhook. Ensuite l'écran « Votre essai a commencé » s'affiche, puis le bouton « Entrer dans Akno ».
5. **Webhook.** Il reconnaît les prix mensuels ET annuels. La synchro est partagée dans `api/_lib/stripeSync.ts`.
6. **Paramètres › Abonnement.** Le bouton « Voir les offres » ouvre le même parcours, et « Gérer mon abonnement » ouvre toujours le portail Stripe.
7. **Fin de l'essai interne « sans carte ».** Un nouvel inscrit choisit maintenant son offre avant d'entrer, et l'essai démarre chez Stripe. Les textes de l'inscription « Sans carte bancaire » deviennent « 0 € aujourd'hui ».

## Variables Vercel à AJOUTER (Production + Preview), puis Redeploy

| Variable | Valeur |
|---|---|
| `STRIPE_PRICE_BUREAU_ANNUAL` | `price_1UckvVQWhQkqONW7gpaQ2bVc` (854,40 € HT/an) |
| `STRIPE_PRICE_CLIENTS_ANNUAL` | `price_1UckvWQWhQkqONW7gXjBc1T1` (1 910,40 € HT/an) |
| `STRIPE_PRICE_RECEPTION_ANNUAL` | `price_1UckvXQWhQkqONW7zQApQQo4` (480 € HT/an) |
| `VITE_STRIPE_PUBLISHABLE_KEY` | ta clé publique `pk_test_51UbHG5…` (déjà dans `.env.example`) |

Les variables existantes ne changent pas (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_BUREAU/CLIENTS/RECEPTION`, `STRIPE_TAX_RATE_ID`, `STRIPE_TRIAL_DAYS=30`).
Ces prix sont en **mode test**. Au passage en live, il faudra recréer les 6 prix en live et remplacer les IDs.

Replis prévus :
- Si un prix annuel manque, l'app ne propose que le mensuel.
- Si `VITE_STRIPE_PUBLISHABLE_KEY` manque, l'app redirige vers la page Stripe hébergée, qui reçoit aussi les couleurs Akno via `branding_settings`.

## Dans Stripe (2 minutes, conseillé)

- **Paramètres › Informations sur l'entreprise › Nom public : « Akno ».** Sans ça, la mention légale sous la carte affiche « environnement de test Keryan Bouzerda ».
- Aucun nouvel événement webhook à ajouter.

## Fichiers modifiés

- `api/_lib/stripe.ts` : prix annuels, `priceFor`, `annualAvailable`, `planFromPrices` et version d'API par appel.
- `api/_lib/stripeSync.ts` (**nouveau**) : synchro Stripe → `subscriptions`, mensuel et annuel.
- `api/stripe-webhook.ts` : utilise `stripeSync`.
- `api/account.ts` : la session de paiement accepte `plan`, `interval` (`month`/`year`), `reception` et `embedded`. S'ajoutent l'essai de 30 jours, l'action `checkout_sync` et `billing.annual` dans le statut.
- `api/_lib/plans.ts` : nouveaux statuts `none` (aucune offre choisie) et `trialEligible`, et suppression de l'essai interne sans carte.
- `src/lib/offers.ts` (**nouveau**) : offres, prix, calcul -20 % et formatage.
- `src/components/billing/Offres.tsx` (**nouveau**) : parcours Offre → Paiement → Activation.
- `src/components/billing/StripePane.tsx` (**nouveau**, chargé à la demande) : formulaire Stripe Elements dans la DA Akno.
- `src/components/sheets/Gate.tsx` : affiche le parcours avant l'app et gère le retour de paiement.
- `src/components/sheets/AbonnementSheet.tsx` : bouton « Voir les offres ».
- `src/lib/accountApi.ts` : types.
- `src/components/AknoApp.tsx` : libellé « Choisir une offre » dans Paramètres.
- `src/components/auth/Signup.tsx` : 2 textes (« 0 € aujourd'hui »).
- `.env.example`, `package.json` et `package-lock.json` : ajout de `@stripe/stripe-js` et `@stripe/react-stripe-js`.

Pas de migration SQL.

## Tester en 3 étapes

1. Dans une fenêtre privée, crée un compte sur `/inscription` et confirme l'e-mail. Tu arrives sur « Choisissez votre offre ».
2. Passe en Annuel, choisis Clients + Réception, puis « Commencer l'essai gratuit ».
   - Carte `4242 4242 4242 4242`, date future, CVC 123, avec une adresse.
   - Clique « Démarrer mon essai gratuit ».
3. « Votre essai a commencé », puis « Entrer dans Akno ». Paramètres › Abonnement affiche l'essai jusqu'à J+30.
