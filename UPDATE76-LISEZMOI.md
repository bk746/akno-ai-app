# Update 76 — Ligne autonome + barre d'état iPhone

## Parcours numéro

Après inscription / pendant l'essai, si l'artisan a l'option Réceptionniste et aucun numéro :

1. Il appuie sur **Activer ma réceptionniste** (accueil Réception, ou Réglages réceptionniste).
2. La route `POST /api/account` action `provision_number` (pas de 13e fonction Vercel) achète un numéro français Voice sur le compte Twilio d'Akno, SMS en plus si un numéro Voice+SMS est disponible, sinon Voice seul (les SMS sortants restent sur le Messaging Service).
3. Les webhooks voix / SMS pointent vers `/api/twilio-voice` et `/api/twilio?event=sms-in` (inchangés). Le numéro et son SID sont enregistrés sur l'artisan (`artisan_phone_numbers` + `artisan_secrets.twilio_number`).
4. L'achat est idempotent (un seul numéro vivant par artisan) et protégé contre le double-appui (`phone_provision_locks`).
5. En cas d'échec : message clair + « on t'attribue ton numéro sous 24 h », e-mail à Keryan (`SUPPORT_EMAIL` ou `VITE_SUPPORT_EMAIL`).
6. Dès que le numéro est là, l'artisan arrive sur l'étape de renvoi (update75).

Libération : le cron existant `api/relances.ts` (étape `phones`), quand l'abonnement est résilié ou que l'essai se termine sans paiement, pose une grâce de 7 jours puis rend le numéro à Twilio.

**Ne pas appliquer la migration** `supabase/migrations/20261122_15_update76_phone_provision.sql` sans l'« ok base » de Keryan. Sans cette migration, l'attribution échoue proprement (repli 24 h + mail).

Aucun achat réel dans les tests (`npm run test:phone-provision`, mocks uniquement).

## Variables à ajouter dans Vercel (Production + Preview)

Sans valeurs dans le dépôt (déjà listées dans `.env.example`) :

- `TWILIO_BUNDLE_SID` — SID du bundle réglementaire « entreprise Akno » (Trust Hub)
- `TWILIO_ADDRESS_SID` — SID de l'adresse réglementaire associée
- `SUPPORT_EMAIL` — (facultatif) alerte d'échec / libération ; sinon `VITE_SUPPORT_EMAIL` puis `VITE_LEGAL_EMAIL`
- `TWILIO_BUNDLE_PER_ARTISAN` — laisser vide. Mettre `1` seulement si un bundle par artisan devient obligatoire (formulaire justificatifs déjà préparé, caché par défaut)

Toujours nécessaires (déjà en place) : `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `APP_URL`.

## Bundle réglementaire (réponse courte)

Un même bundle Twilio approuvé (celui de l'entreprise Akno) peut servir à acheter plusieurs numéros français du même type : on passe le même `BundleSid` à chaque achat. Le bundle décrit l'utilisateur final qui répond sur le numéro. Chez Akno, c'est l'IA d'Akno qui décroche sur un numéro Akno (les clients appellent le portable de l'artisan, renvoyé vers cette ligne) : un seul bundle Akno suffit, tant que cet usage ne change pas.

Sources : [FAQ Regulatory](https://www.twilio.com/docs/phone-numbers/regulatory/faq), [Bundles API](https://www.twilio.com/docs/phone-numbers/regulatory/api/bundles), [IncomingPhoneNumbers (BundleSid / AddressSid)](https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource).

Si un régulateur exigeait que l'artisan soit l'end-user, le flux « un bundle par artisan » (KBIS, pièce d'identité, adresse, statut en vérification) est déjà dans l'app, derrière le flag `TWILIO_BUNDLE_PER_ARTISAN=1`.

## Coût d'un numéro

D'après la grille Voice France de Twilio (consultée pour cette update) : environ **1,35 $ / mois** pour un numéro local français, plus environ **0,0100 $ / min** en entrée. Les prix bougent : vérifier le devis en direct sur [Voice pricing FR](https://www.twilio.com/en-us/voice/pricing/fr).

## Barre d'état iPhone (PWA + Capacitor)

Le fond (et la carte Chantiers) va jusqu'en haut de l'écran, derrière l'heure et la batterie : `viewport-fit=cover`, `apple-mobile-web-app-status-bar-style=black-translucent`, StatusBar Capacitor en overlay (texte clair sur les pages sombres, texte sombre sur `/payer` et `/dossier`). Les boutons et titres restent sous l'heure grâce à `env(safe-area-inset-top)` / `var(--sat)`.

## Factures : ouverture directe

Toucher une facture (Récentes, À encaisser, fiche client, devis signé) n'ouvre plus la feuille liste « Toutes / À traiter / Payées » en dessous. Le X ramène directement à l'écran d'où on vient, navbar visible. Le bouton « Toutes » ouvre toujours la liste. Test : `npm run test:facture-open`.
