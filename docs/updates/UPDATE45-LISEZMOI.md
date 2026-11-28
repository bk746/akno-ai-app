# Akno · update45 : nouvel écran d'inscription (à lire en premier)

Ce zip contient **tout le projet** (sans `node_modules`, `dist`, `.git` ni `.env.local`).
Rien n'a été déployé. **Aucune migration SQL, aucune nouvelle variable d'environnement.**

## Ce qui change
Seul l'écran d'**inscription** (`/inscription`) est refait. La connexion, le mot de passe oublié, le nouveau mot de passe et l'onboarding sont **identiques à l'update44**.

- **Ordinateur** : formulaire à gauche ; à droite, un panneau animé qui montre ce que fait Akno (appel pris par la réceptionniste, devis généré, relance, RDV calé), en boucle.
- **Téléphone** : une seule colonne, sans le panneau.
- **Inscription en 2 étapes**, avec une barre de progression et des transitions animées :
  1. E-mail et mot de passe, avec un indicateur de force et un bouton pour afficher le mot de passe.
  2. Prénom, entreprise, métier (pastilles à cocher, avec « Autre » en texte libre), téléphone formaté automatiquement (06 12 34 56 78), et acceptation des CGV, du DPA et de la confidentialité.
- **Écran « Vérifiez votre boîte mail »** animé quand Supabase demande une confirmation, avec « Renvoyer l'e-mail » (attente de 45 s entre deux envois).
- **Erreurs claires en français** : inscriptions fermées (`signup_disabled`), compte déjà existant, mot de passe trop faible, e-mail invalide, trop d'e-mails (`over_email_send_rate_limit`), trop de tentatives, adresse non autorisée par le SMTP, échec d'envoi de l'e-mail, erreur de base de données, problème de réseau. L'erreur brute s'affiche toujours dans la console (`[Akno auth · signup]`).
- Le formulaire tremble légèrement en cas d'erreur, les focus sont visibles et les erreurs sont lues par les lecteurs d'écran. Les animations sont coupées si l'appareil demande moins d'animations.
- L'appel `supabase.auth.signUp` et ses métadonnées sont **inchangés** (prenom, entreprise, metier, telephone, cgv_version). Le trigger `handle_new_user` fonctionne comme avant.

## Fichiers touchés
- `src/components/auth/Signup.tsx` (nouveau) : l'écran d'inscription.
- `src/components/auth/BrandPanel.tsx` (nouveau) : le panneau animé.
- `src/components/auth/fields.tsx` (nouveau) : les champs, l'indicateur de force, le bouton et la progression.
- `src/components/auth/authErrors.ts` (nouveau) : la traduction des erreurs Supabase.
- `src/components/Login.tsx` : l'ancien formulaire d'inscription est retiré et remplacé par le nouvel écran. La connexion n'a pas changé.
- `src/lib/phone.ts` : ajout de `fmtTel` (formatage pendant la saisie).
- `src/components/AknoApp.tsx` : une ligne déplacée (`const FacturesSheet = lazy(...)`) pour corriger un plantage en mode `npm run dev`. Ça ne change rien en production.

## Appliquer dans Cursor puis déployer
1. Dézippez par-dessus votre dossier projet (gardez votre `.env.local`), puis lancez `npm install` et `npm run build`.
2. Dans Cursor : « Commit tous les changements avec le message "update45 : nouvel écran d'inscription" puis push sur main. Vérifie que .env.local n'est pas inclus. »
3. Vercel redéploie tout seul. Testez `/inscription` en navigation privée.

⚠️ Si l'inscription affiche « Les inscriptions sont momentanément fermées », activez-les dans Supabase › Authentication › Sign In / Providers › « Allow new users to sign up ». Si elle affiche « Nous ne pouvons pas envoyer d'e-mail à cette adresse », configurez un SMTP personnalisé (Resend) dans Supabase › Authentication › Emails : le SMTP par défaut de Supabase n'envoie qu'aux membres de l'équipe.
