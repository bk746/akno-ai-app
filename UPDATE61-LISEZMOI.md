# Akno · update61 — Inscription façon maquette, fiche client complète, modèles de devis, factures électroniques et signature des devis

> Contient aussi toutes les modifications d'update60 (le projet a été repris tel quel).
> **Migration à appliquer : `supabase/migrations/20261121_10_update61_factures_signature_modeles.sql` — NON appliquée en production (attendre « ok base »).**
> L'app fonctionne avant la migration (les nouveautés affichent « appliquez la migration 20261121_10 » au lieu de planter).
> Aucune nouvelle fonction Vercel : toujours **12** fichiers dans `api/` (ajouts dans `api/_lib/` seulement).

## 1. Inscription / onboarding (maquette `inscription-onboarding.png`)
- **Accueil** : mascotte Blob, « Tout votre métier, dans une seule app. », « 15 jours gratuits, sans engagement. »,
  bouton blanc **Continuer avec Apple**, bouton sombre **Continuer avec Google**, lien « Continuer avec un e-mail », mention CGV / Confidentialité, « Déjà un compte ? Se connecter ».
- **Votre e-mail** → **Choisissez un mot de passe** (jauge de solidité, afficher/masquer, trousseau iOS conservé).
- **Votre métier ?** Plombier / Électricien / Maçon / Menuisier / Peintre / Autre (coche) → `artisans.entreprise_metier`.
- **Vous êtes ?** prénom, entreprise, portable facultatif (+ acceptation CGV/DPA).
- **C'est prêt, {Prénom}.** « Vos appels, devis et chantiers, au même endroit. » → **Commencer** → suite existante (offre, entreprise, code, SetupGate).
- Google/Apple via `supabase.auth.signInWithOAuth`. Si le fournisseur n'est pas activé dans Supabase : message clair
  « La connexion avec Google n'est pas encore activée… » + raccourci « Continuer avec un e-mail ».
- Boutons visibles par défaut. Pour les masquer : `VITE_AUTH_GOOGLE=0` / `VITE_AUTH_APPLE=0` dans Vercel.
- Face ID / écran de verrouillage : inchangés.
- ⚠️ La maquette dit **15 jours** ; l'essai Stripe actuel est de **30 jours**. Texte de la maquette repris : à aligner (Stripe ou texte).

### Activer Google (≈10 min)
1. console.cloud.google.com → APIs et services → Écran de consentement OAuth (Externe, nom « Akno », e-mail d'assistance, domaine `akno-ai-app-v2.vercel.app`).
2. Identifiants → Créer → ID client OAuth → Application Web.
   URI de redirection autorisé : `https://mmakyjgjhtxkklewrpeu.supabase.co/auth/v1/callback`
3. Supabase → Authentication → Sign In / Providers → Google → activer, coller Client ID + Client Secret → Save.

### Activer Apple (compte Apple Developer requis, 99 €/an)
1. developer.apple.com → Identifiers → App ID (Sign in with Apple coché).
2. Identifiers → **Services ID** (ex. `fr.akno.web`) → Sign in with Apple → Configure :
   domaine `mmakyjgjhtxkklewrpeu.supabase.co`, Return URL `https://mmakyjgjhtxkklewrpeu.supabase.co/auth/v1/callback`.
3. Keys → nouvelle clé « Sign in with Apple » → télécharger le `.p8` (une seule fois), noter Key ID et Team ID.
4. Supabase → Providers → Apple → activer : Client IDs = le Services ID, et le secret généré à partir de Team ID + Key ID + `.p8`
   (Supabase propose l'outil de génération ; le secret expire tous les 6 mois → à renouveler).
5. Supabase → Authentication → URL Configuration : Site URL `https://akno-ai-app-v2.vercel.app`, Redirect URLs `https://akno-ai-app-v2.vercel.app/**`.

## 2. Fiche client complète
- Réglages → Gestion → **Clients** : liste alphabétique, recherche nom / numéro / e-mail.
- Fiche : appeler, SMS, itinéraire, nouveau devis ; téléphone, e-mail, adresse ; **notes** et coordonnées modifiables (table `client_fiches`) ;
  devis et RDV ; **factures** (reste à encaisser) ; **appels et enregistrements** avec lecteur audio ; historique.

## 3. Modèles de devis et personnalisation
- Éditeur de devis → bouton **Modèles** : enregistrer le devis en cours comme modèle, **Utiliser** (remplace) ou **Ajouter les lignes**, mettre à jour, renommer, supprimer (table `devis_modeles`).
- Réglages → Entreprise : **couleur d'accent** (devis, factures, page de signature), **pied de page** personnalisé, logo (existant), **BIC**, option **TVA sur les débits**.
- Mentions légales complètes sur le devis et son PDF (assurance + zone de couverture, médiateur, rétractation, certification client TVA réduite 10 % / 5,5 %…). Ce qui manque est signalé dans Réglages → Entreprise.

## 4. Factures électroniques (droit français)
- Types : **facture**, **acompte**, **situation** (avancement cumulé %), **solde** (déduit acomptes et situations), **avoir**.
- Numérotation **continue, sans trou, verrouillée** côté base (`emettre_facture`), préfixes F- / A- ; facture émise figée, jamais supprimée (correction = avoir), empreinte SHA-256 + chaînage.
- PDF au format **Factur-X (PDF/A-3b + XML CII EN 16931)** : validé avec Mustang 2.16 (veraPDF : conforme PDF/A-3b ; schématron EN 16931 : valide) et XSD factur-x. Rapports et exemples : `akno-docs/update61-validation/`.
- Bloc **virement** (IBAN, BIC, référence de paiement = n° de facture), bouton **Marquer payée**, téléchargement du XML seul.
- Retenue de garantie 5 % (loi 71-584), nature des opérations, option TVA sur les débits, autoliquidation sous-traitance (art. 283-2 nonies), SIREN client pro obligatoire.

## 5. Signature électronique des devis
- Lien public `/accept/<token>` : devis complet, **signature tracée**, nom, case « bon pour accord », certification TVA réduite si besoin.
- Preuve : horodatage serveur, IP, navigateur, **SHA-256 du devis**, journal chaîné (`signature_events` : envoi, ouverture, consentement, signature, refus) en ajout seul.
- Devis signé = **accepté**, contenu figé, **non supprimable** ; PDF signé avec **page certificat**. Côté artisan : « PDF signé + certificat », « Copier le lien de signature ».
- Signature électronique simple (eIDAS art. 25, Code civil 1366-1367) : suffisante pour un devis.

## Migration 20261121_10 (à appliquer après « ok base »)
- `artisans` : `bic`, `tva_sur_debits`, `devis_couleur`, `devis_pied`.
- `devis` : `signature_png`, `signe_le`, `document_hash`, `certifie_tva_reduite` ; triggers « devis signé figé » et « devis signé non supprimable ».
- Nouvelles tables avec RLS : `signature_events` (lecture seule pour l'artisan, écrite par le serveur), `devis_modeles`, `client_fiches`.
- `factures` : `situation_numero`, `avancement_pct`, `retenue_garantie_pct`, `reference_paiement`, `emise_le`, `document_hash`, `chaine_hash` ; types situation/solde ; `factures_guard`, `factures_no_delete`, `emettre_facture` mis à jour.
- Idempotente ; testée deux fois de suite sur base locale (PGlite) : `node supabase/tests/run-local.mjs --twice` → RLS TEST OK.

## Plateforme agréée (réforme 2026-2027)
Réception obligatoire des factures électroniques pour toutes les entreprises au **1er septembre 2026**, émission obligatoire
pour les PME/TPE au **1er septembre 2027**, via une **plateforme agréée (PA)**. Akno produit déjà le Factur-X ; il reste à brancher une PA par API :
Iopole, SUPER PDP ou B2Brouter (tous immatriculés, API REST). Également à prévoir : e-reporting des opérations B2C, statuts de cycle de vie, annuaire.

## Tests
`npm run build` · `npm run test:receptionist` · `npm run test:twilio` · `npm run test:assistant` (60/61, échec connu « Lucas Girard ») ·
**`npm run test:factures`** (nouveau) · `cd voice-bridge && npm test` · `node supabase/tests/run-local.mjs --twice`.

## Déploiement
1. Remplacer le contenu du projet par `akno-update61/` (garder `.env*`, `.git`, `node_modules`, `.vercel`, `bridge-secret.txt`).
2. `npm install && npm run build`, puis commit « update61 » et push (Vercel redéploie).
3. Après « ok base » : appliquer la migration 20261121_10.
4. Relais Fly.io : non modifié par update61 (le redéployer seulement si update60 ne l'a pas encore été).
