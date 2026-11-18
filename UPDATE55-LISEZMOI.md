# Update 55 · Apple Pay, Google Pay et PayPal

## Ce qui change
- Paiement intégré (Checkout Sessions + Payment Element) : moyens proposés = `card` + `paypal`
  (`allowed_payment_method_types`). Apple Pay et Google Pay passent par `card` (portefeuilles) dès que le domaine est enregistré chez Stripe.
  Liste explicite plutôt que la config du Dashboard, qui ajoutait Klarna, Amazon Pay, Satispay…
- Ordre d'affichage : Apple Pay / Google Pay, puis PayPal, puis carte (`paymentMethodOrder`). Link reste masqué.
- Si PayPal n'est pas activé sur le compte Stripe (ex. passage en live), la session repart automatiquement en carte + portefeuilles (erreur remontée au monitoring).
- Page hébergée (repli sans clé publique) : même liste `card` + `paypal`.
- PayPal redirige vers PayPal puis revient sur `return_url` (`/reception?billing=ok&session_id=…`) : l'onboarding / l'écran d'offre reprend sur « Activation » (déjà géré par Flow / Gate).
  Nouveau : si l'utilisateur annule chez PayPal, retour au choix d'offre avec un message clair (rien n'est débité).
- Moyen de paiement par défaut : Checkout le pose sur l'abonnement ; en plus, `ensureDefaultPaymentMethod` (webhook `checkout.session.completed` + `checkout_sync`) le reporte
  sur le client Stripe (`invoice_settings.default_payment_method`) et sur l'abonnement s'il manquait. Les montées en gamme (api/_lib/upgrade.ts) débitent donc la carte, Apple Pay ou PayPal choisi.
- Style : titre « Moyen de paiement », onglets sombres Akno, textes « carte » remplacés par « moyen de paiement ».

## Fichiers modifiés
api/account.ts, api/stripe-webhook.ts, api/_lib/stripeSync.ts, api/_lib/upgrade.ts,
src/components/billing/StripePane.tsx, Offres.tsx, Upgrade.tsx

Aucune variable d'environnement nouvelle, aucune migration SQL.

## Stripe (mode test, déjà fait)
- Domaine `akno-ai-app-v2.vercel.app` enregistré (payment_method_domains) : Apple Pay, Google Pay, PayPal, Link = actifs.
- Config de moyens de paiement par défaut : PayPal et Google Pay activés.

## En live (à refaire)
1. Stripe Dashboard (live) → Réglages → Moyens de paiement → PayPal → Activer (vérifier que les paiements récurrents PayPal sont accordés ; PayPal peut demander des infos).
2. Activer Apple Pay et Google Pay au même endroit.
3. Réglages → Moyens de paiement → Domaines : ajouter `akno-ai-app-v2.vercel.app` (et tout domaine perso).

## Tester en 3 étapes
1. Créer un compte → choisir une offre → étape Paiement : onglets PayPal et Carte (Apple Pay sur Safari/iPhone, Google Pay sur Chrome avec carte enregistrée).
2. Choisir PayPal → « Démarrer mon essai gratuit » → page PayPal de test → Autoriser → retour sur Akno, écran « Votre essai a commencé ».
3. Dans Stripe (test) : l'abonnement a bien `default_payment_method` = le PayPal choisi.
