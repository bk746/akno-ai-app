# Publier Akno en bêta (TestFlight + Play test interne) sans Mac — pas à pas

## 0. Prérequis (comptes, à faire par Keryan)
- Apple Developer Program (99 €/an) et Google Play Console (25 $ une fois), au nom de l'entreprise.
- Un compte Codemagic (gratuit pour démarrer) relié au dépôt Git du projet.

## 1. Apple
1. developer.apple.com › Identifiers › « + » › App IDs : identifiant `com.akno.app`, cocher **Sign in with Apple** seulement si vous l'activez plus tard, et **Associated Domains** (optionnel).
2. appstoreconnect.apple.com › Mes apps › « + » › Nouvelle app : iOS, nom **Akno**, langue Français, bundle `com.akno.app`, SKU `akno-ios`.
3. Utilisateurs et accès › Intégrations › **Clés API App Store Connect** › Générer : rôle **App Manager**. Téléchargez le fichier `.p8` (une seule fois !), notez **Issuer ID** et **Key ID**.
4. Codemagic › Team settings › Integrations › **App Store Connect** › Add key : nom **akno_asc**, collez Issuer ID, Key ID, fichier .p8.
5. Codemagic › Code signing identities › iOS certificates : « Generate certificate » (Apple Distribution) ; iOS provisioning profiles : « Fetch profiles » pour `com.akno.app` (type App Store). Codemagic peut les créer automatiquement avec la clé API.

## 2. Android
1. Créez la clé de signature (une seule fois, à conserver précieusement hors du projet) :
   `keytool -genkey -v -keystore akno-release.jks -alias akno -keyalg RSA -keysize 2048 -validity 10000`
2. Codemagic › Code signing identities › Android keystores › Upload : fichier `akno-release.jks`, mots de passe, alias `akno`, **Reference name : akno_keystore**.
3. Play Console › Créer une application : Akno, français, application, gratuite. Remplissez « Accès à l'app » (compte démo), Data safety, classification, public cible (voir `update70-store/fiche-store.md`).
4. Compte de service : Google Cloud console › IAM › Comptes de service › créer, clé JSON ; Play Console › Utilisateurs et autorisations › inviter l'adresse du compte de service (droits « Publier en test »).
5. Codemagic › Environment variables › groupe **google_play** : `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS` = contenu du JSON (cocher « Secret »).
6. Première publication : Google exige un **premier AAB envoyé à la main** (Play Console › Test interne › Créer une version › importer l'AAB produit par Codemagic). Les suivantes partent automatiquement.

## 3. Variables de l'app (groupe Codemagic **akno_env**)
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publiques, comme sur Vercel), `VITE_LEGAL_NAME`, `VITE_LEGAL_FORM`, `VITE_LEGAL_ADDRESS`, `VITE_LEGAL_SIRET`, `VITE_LEGAL_TVA`, `VITE_LEGAL_DIRECTOR`, `VITE_LEGAL_EMAIL`, `VITE_LEGAL_DPO_EMAIL`. Mettez les mêmes `VITE_LEGAL_*` sur Vercel.
Côté Vercel (serveur) : `AKNO_BETA_ACCESS` = e-mails des testeurs séparés par des virgules (accès complet sans paiement dans l'app).

## 4. Lancer un build
Codemagic › l'app › Start new build › workflow **iOS → TestFlight** ou **Android → Play (test interne)**.
- iOS : ~20 min, puis le build apparaît dans App Store Connect › TestFlight (« Informations de conformité » : l'app utilise uniquement le chiffrement standard HTTPS → répondre « Non » aux algorithmes propriétaires). Ajoutez les testeurs internes / un groupe externe (revue bêta Apple ~24 h).
- Android : l'AAB est envoyé en **brouillon** sur la piste interne : Play Console › Test interne › vérifier › Déployer ; ajoutez la liste d'e-mails des testeurs.

## 5. Nouvelle version
`npm run version:patch` (1.0.0 → 1.0.1, build +1) ou `npm run version:build` (build +1 seulement), puis commit et nouveau build Codemagic. Chaque envoi aux stores exige un numéro de build plus grand.
