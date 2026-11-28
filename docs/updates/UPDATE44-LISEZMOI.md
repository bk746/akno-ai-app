# Akno · mise à jour 44 → 48 (à lire en premier)

Ce zip contient **tout le projet** (pas seulement les fichiers modifiés).
Il ne contient pas : `node_modules`, `dist`, `.git`, ni vos fichiers `.env*` secrets. Votre `.env.local` reste chez vous.

> Rien n'a été déployé et aucun service en production n'a été touché. C'est à vous de lancer les étapes ci-dessous.

---

## 1. Ce qui change, en clair

### Sécurité et multi-comptes (update44)
- **Chaque artisan ne voit que ses données.** Toutes les tables (appels, RDV, devis, relances, factures, documents…) et les fichiers (enregistrements, logos, documents) sont cloisonnés **dans la base** (RLS Supabase). L'application filtre aussi par artisan. 23 tests automatiques avec 2 comptes passent.
- Région des fonctions Vercel : **Paris (cdg1)**. En-têtes de sécurité ajoutés (HSTS, anti-iframe…).
- Webhook Resend : signature vérifiée sur le corps brut (plus fiable).
- **Plus de fausses promesses** : plus de « SMS envoyé » ni de « relance envoyée (simulé) », plus de numéro ou de lien d'avis par défaut, plus de « Données de démonstration » sur les PDF. Un bouton qui ne peut rien envoyer le dit.
- Petits bugs corrigés : dates des jours (« Hier » / date courte), dernière date des contacts, appels saisis à la main enregistrés pour de vrai, notes et suites d'appel sauvegardées, relance manuelle qui ne passe plus le devis en « sans réponse », compteurs de minutes corrects, numérotation des devis par artisan, etc.

### Écran « Entreprise » (Paramètres › Gestion › Entreprise)
- Raison sociale, EI, forme juridique, capital, adresse, SIRET (avec **remplissage automatique** depuis l'annuaire officiel des entreprises), TVA ou franchise 293 B, RCS/RM, APE, assurance décennale (assureur, police, zone), médiateur, IBAN, délai de paiement, **logo**, **votre** lien d'avis Google.
- Les **devis PDF** n'impriment que ce qui est rempli, avec les mentions obligatoires (rétractation 14 jours, TVA, assurance, médiateur, « Bon pour accord »). Un bandeau prévient s'il manque une mention.
- Le client qui accepte en ligne tape son nom et coche « Bon pour accord » (nom, IP, date conservés).

### Inscription, abonnement, conformité (update45)
- **Inscription en ligne** : `https://<votre-app>/inscription` (ou `/reception?signup=1`) → prénom, entreprise, métier, téléphone, mot de passe, CGV à cocher. Puis un **onboarding en 3 étapes** (SIRET, mentions, lien d'avis).
- **Abonnements Stripe** : Bureau 89 € HT, Clients + Bureau 199 € HT, option Réceptionniste +50 € HT, **30 jours d'essai sans carte**, portail client (carte, factures, résiliation), webhooks signés, accès selon l'offre.
  - **Tant que Stripe n'est pas configuré, tout reste ouvert** (comme avant).
  - Quand l'essai est fini et sans abonnement : écran « Choisir une offre » (les données sont gardées).
- Pages **CGV, mentions légales, confidentialité, DPA** : `/cgv`, `/mentions-legales`, `/confidentialite`, `/dpa`. ⚠️ Ce sont des **modèles à faire relire** par un juriste. Les infos de votre société se mettent via les variables `VITE_LEGAL_*` (voir plus bas).
- La réceptionniste **annonce l'enregistrement** : « …je suis l'assistante IA. Cet appel peut être enregistré pour le suivi de votre demande. » (même avec un message d'accueil personnalisé).
- **Limites anti-abus** et quotas mensuels (brouillons IA, minutes, SMS, sessions vocales), visibles dans Abonnement.
- Sentry facultatif (suivi des erreurs).

### Factures, impayés, conformité (update46)
- **Factures** (Paramètres › Gestion › Factures, ou bouton « Créer la facture » sur un devis accepté) : facture, facture d'acompte (%), facture de solde avec acomptes déduits, **avoir**.
  - Numéro légal **F-2026-0001** attribué seulement à l'émission, sans trou ; une facture émise ne peut plus être modifiée (base de données verrouillée) → on corrige par un avoir (A-2026-0001).
  - PDF conforme : dates d'émission / de travaux / d'échéance, SIREN du client pro, adresse du chantier, TVA par taux, 293 B, autoliquidation BTP, pénalités + 40 € pour les pros, pas d'escompte, net à payer, IBAN.
  - Statuts : brouillon → émise → envoyée → payée / annulée.
- **Relances d'impayés validées par vous** : à J+1, J+8, J+15, J+30 après l'échéance, Akno **prépare** le texte (rappel → mise en demeure) et vous notifie ; vous relisez, modifiez, puis « Valider et envoyer » ou « Ignorer ». Rien ne part tout seul.
- **Dossier de conformité** : attestation Urssaf, Kbis, décennale, RC Pro, RGE… avec date d'expiration, **alertes à J-30, J-7 et à l'expiration** (notification + e-mail), et un **lien de partage** en lecture seule pour vos donneurs d'ordre (`/dossier/…`).

### SMS et formulaire du site (update47)
- **SMS Twilio** (rappel la veille du RDV, complément des relances de devis, demande d'avis, test), **seulement si les clés Twilio sont mises** et si l'artisan active « SMS clients ». Réponse STOP gérée.
- **Demandes du site** : un formulaire HTML à coller sur le site de l'artisan envoie les demandes dans Akno (Paramètres › Gestion › Demandes du site, code à copier dedans), avec notification. Anti-robot intégré (+ Turnstile facultatif).

### En plus (update48)
- **Rapport mensuel** par e-mail le 1er du mois (devis, CA signé, factures, appels).
- **Plafond de minutes** de réceptionniste par offre.
- **Réglages Réceptionniste** : horaires d'ouverture, message d'accueil, durée de conservation des enregistrements (purge automatique).
- **Agenda Cal.com par artisan** (chacun met sa clé dans Paramètres › Agenda en ligne ; sinon agenda Akno interne lun–ven 8 h–18 h).
- **Préparation téléphonie Twilio** (renvoi d'appel vers le portable puis messagerie avec annonce d'enregistrement, messages vocaux dans Akno). La réceptionniste vocale xAI dans l'app fonctionne comme avant.

---

## 2. Installation (dans l'ordre)

### a) Remplacer le code
1. Gardez une copie de votre dossier actuel.
2. Remplacez le contenu de votre projet par celui du zip (gardez votre `.env.local`).
3. `npm install` puis `npm run build` (doit afficher « built »).

### b) Base de données Supabase — migrations **dans cet ordre**
Supabase → **SQL Editor** → coller et exécuter chaque fichier de `supabase/migrations/`, un par un :
1. `20261116_01_update44_schema_rls.sql`
2. `20261116_02_update45_billing_usage.sql`
3. `20261116_03_update46_factures_conformite.sql`
4. `20261116_04_update47_sms_leads.sql`
5. `20261116_05_update48_reception_rapports.sql`

Chaque fichier peut être relancé sans danger. Faites d'abord une **sauvegarde** (Database → Backups) ou testez sur un projet Supabase de test.

Ensuite, **pour votre propre compte** (accès complet sans payer) — dans SQL Editor, en remplaçant l'uuid :
```sql
insert into public.subscriptions (artisan_id, plan_override, override_reception)
values ('VOTRE-UUID-ARTISAN', 'clients', true)
on conflict (artisan_id) do update set plan_override = 'clients', override_reception = true;
```
(Votre uuid : Authentication → Users.)

Dans Supabase → Authentication → URL Configuration : ajoutez `https://<votre-domaine>/reception` aux Redirect URLs (inscription + mot de passe oublié).

### c) Variables d'environnement (Vercel → Settings → Environment Variables)
Toutes sont listées et expliquées dans `.env.example`. **Aucune n'est obligatoire pour que l'app marche comme avant** ; chacune active une fonction.

| Variable | Sert à | Où la trouver |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | quotas, relances, alertes, webhooks | Supabase → Project Settings → API (secret) — **déjà nécessaire avant** |
| `APP_URL` | liens dans les e-mails/SMS | votre domaine, ex. `https://app.akno.fr` |
| `CRON_SECRET` | sécuriser la tâche quotidienne | `openssl rand -hex 32` |
| `STRIPE_SECRET_KEY` | **active** les abonnements | Stripe → Développeurs → Clés API |
| `STRIPE_WEBHOOK_SECRET` | webhooks Stripe signés | Stripe → Webhooks → endpoint `https://<app>/api/stripe-webhook` |
| `STRIPE_PRICE_BUREAU` / `_CLIENTS` / `_RECEPTION` | les 3 prix | Stripe → Catalogue (prix mensuels HT 89 / 199 / 50) |
| `STRIPE_TAX_RATE_ID` ou `STRIPE_AUTOMATIC_TAX=1` | TVA 20 % sur l'abonnement | Stripe → Taxes |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` (ou `TWILIO_FROM`) | **active** les SMS | Console Twilio |
| `TURNSTILE_SECRET_KEY` | anti-robot du formulaire (facultatif) | Cloudflare → Turnstile |
| `CALCOM_OWNER_ARTISAN_ID` | réserve la clé Cal.com globale à votre compte | votre uuid |
| `SENTRY_DSN`, `VITE_SENTRY_DSN` | suivi d'erreurs (facultatif) | sentry.io |
| `VITE_SUPPORT_EMAIL` | lien « Aide & support » | votre e-mail |
| `VITE_LEGAL_NAME`, `_FORM`, `_ADDRESS`, `_SIRET`, `_TVA`, `_DIRECTOR`, `_EMAIL`, `_DPO_EMAIL` | infos de votre société dans les pages légales | vos documents |
| `RESEND_*`, `XAI_*`, `VAPID_*` | inchangées | — |

Après avoir ajouté des variables : **Redeploy** sur Vercel.

### d) Réglages côté services
- **Stripe** : créer les 3 prix ; créer le webhook (événements : `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`) ; **activer le portail client** (Settings → Billing → Customer portal).
- **Twilio** (SMS) : compte, « Regulatory Bundle » France, Messaging Service. Webhook entrant SMS : `https://<app>/api/twilio?event=sms-in`.
- **Twilio** (téléphonie, plus tard) : acheter un numéro FR, puis dans Supabase table `artisan_secrets` remplir `twilio_number` et `forward_to` (portable, format +33…) pour l'artisan ; webhook voix du numéro : `https://<app>/api/twilio?event=voice`.
- **Resend** : vérifier votre domaine d'envoi (`RESEND_FROM`).

---

## 3. Comptes à créer / passer en payant
- **Stripe** (abonnements) — obligatoire pour encaisser.
- **Twilio** (SMS, numéro) — pour les SMS et la téléphonie.
- **Vercel Pro** (usage commercial + 11 fonctions + cron) et **Supabase Pro** (sauvegardes, pas de mise en pause).
- **Resend** avec votre domaine.
- Facultatif : Cloudflare Turnstile, Sentry, Cal.com.
- Un **juriste** pour relire CGV / confidentialité / DPA.

---

## 4. Comment tester
1. `npm run build` et `npx tsc --noEmit` → aucune erreur.
2. Isolation des comptes (sans toucher la prod) : `cd supabase/tests && npm i --no-save @electric-sql/pglite && node run-local.mjs --twice` → « RLS TEST OK ».
3. Dans l'app (après migrations) :
   - Paramètres › Entreprise : SIRET → « Remplir », ajouter le logo → ouvrir un devis : logo + mentions, plus de bandeau.
   - Devis accepté → « Créer la facture » → Émettre → PDF / Envoyer → Marquer payée. Puis « Corriger ou annuler par un avoir ».
   - Dossier de conformité : ajouter une attestation, créer le lien, l'ouvrir en navigation privée.
   - Demandes du site : copier le code, le mettre dans une page HTML, envoyer → la demande apparaît.
   - Inscription : `/inscription` en navigation privée → onboarding.
   - Stripe en **mode test** (`sk_test_…`, carte 4242 4242 4242 4242) : Abonnement → choisir une offre → retour « Paiement enregistré ».
   - Forcer la tâche quotidienne : `curl -H "Authorization: Bearer $CRON_SECRET" "https://<app>/api/relances?report=1"`.
4. Vérifier que l'existant marche : relances e-mail des devis, réceptionniste vocale, Face ID, notifications.

---

## 5. Ce qui reste (non faisable sans vous)
- Créer les comptes et mettre les clés ci-dessus ; lancer les migrations ; déployer.
- Faire relire les textes légaux et compléter les `VITE_LEGAL_*`.
- Numéro de téléphone Twilio + dossier réglementaire FR (délai de quelques jours).
- Le test `npm run test:assistant` a 1 cas sur 61 qui échoue (« Déplace le RDV… à demain 11h ») : il échouait déjà avant cette mise à jour (dépend de la date du jour), rien à voir avec ces changements.
- Factur-X / facture électronique (obligatoire pour la réception en sept. 2026, l'émission pour les TPE en sept. 2027) : à prévoir via une plateforme agréée (PA) — non inclus.
