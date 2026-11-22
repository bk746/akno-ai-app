# Update70 — bêta App Store / Google Play (version 1.0.0, build 1)

## Ce qui change
**Stores (bloquants)**
- Capacitor iOS + Android (`com.akno.app`, configurable dans `app.config.json`) : l'app embarque le build local `dist`, les `/api/*` partent vers https://akno-ai-app-v2.vercel.app (CORS natif ajouté côté API, l'auth Bearer est inchangée). Icônes + splash générés depuis le logo (`assets/`), permissions avec textes FR (micro, caméra, photos, contacts, localisation, Face ID), deep link `com.akno.app://` pour le retour OAuth.
- Suppression du compte : Réglages › Supprimer mon compte (mot SUPPRIMER + case), fonction serveur fusionnée dans `api/account` (aucune nouvelle fonction Vercel). Factures émises et devis signés : anonymisés/conservés (obligation légale). Page publique `/suppression-compte` (Google).
- Face ID / empreinte natifs (plugin biométrique) ; WebAuthn inchangé sur le web.
- App native : aucun prix, abonnement ni lien d'achat (3.1.1 / 3.1.3) ; accès des testeurs par `AKNO_BETA_ACCESS` (Vercel). Web inchangé.
- Boutons Google / Apple masqués par défaut (`VITE_AUTH_GOOGLE=1` / `VITE_AUTH_APPLE=1` pour les réafficher).
- `vercel.json` : géolocalisation autorisée pour `self`.
- Pages légales présentables même sans `VITE_LEGAL_*`.
- Notifications natives : dégradation propre (« Arrivent dans une prochaine version de l'app »). Web push inchangé.
- Version unique dans `package.json` (`version` + `buildNumber`), synchronisée iOS/Android, affichée dans Réglages : « Version 1.0.0 (build 1) ».
  `npm run version:patch|minor|major` (incrémente aussi le build), `npm run version:build` (build +1), `npm run version:sync`.
- `codemagic.yaml` + `docs/STORES-GUIDE.md` (pas à pas Apple / Google / Codemagic, sans Mac).

**Barre de navigation façon Revolut**
- Pilule flottante plus fine (64 px), translucide floutée, marges 16 px, au-dessus du home indicator ; « + » intégré au centre, son menu reste ancré à la barre (update69).
- Pastille de l'onglet actif qui glisse (ressort sans rebond ≈ 250 ms), label actif plus gras, autres en gris.
- En-tête fixe translucide : le contenu défile sous l'en-tête et sous la barre ; le dernier élément reste atteignable.
- Changement d'onglet : fondu sur place de 180 ms, sans glissement horizontal ; pages toujours plein écran (aucune coupure).
- Squelettes pendant le chargement d'une page (au lieu d'un écran noir).
- Inchangé : feuilles pleine hauteur, onglets gardés montés (position de défilement conservée), Devis | Factures, carte des chantiers.

**Compte de démo (revue Apple / Google, captures)** — créé en base prod avec l'accord de Keryan
- `supabase/seed/demo.sql` : idempotent, rejouable, limité au compte démo (ids `de000000-…`). Mot de passe absent du fichier (placeholder `__DEMO_PASSWORD_HASH__`).
- Entreprise fictive Alpes Rénovation Annecy (SIRET fictif 999 999 006 00003, Luhn valide), 6 employés, 11 clients, 5 chantiers géolocalisés, 10 devis, 5 factures (F-2026-0001 à 0004 émises via `emettre_facture()` + 1 brouillon), 11 RDV, 7 relances, 15 appels avec résumé et bilan. Téléphones 06 39 98 xx xx (fictifs ARCEP), e-mails @example.com ; SMS, relances et rappels automatiques coupés.
- Identifiants : `akno-docs/update70-store/compte-demo.txt` (hors zip).

## À faire par Keryan
1. Créer les comptes Apple Developer et Google Play, puis suivre `docs/STORES-GUIDE.md` (clé API App Store Connect, keystore Android, compte de service Play, Codemagic).
2. Vercel : `AKNO_BETA_ACCESS` (e-mails testeurs) et `VITE_LEGAL_NAME`, `VITE_LEGAL_FORM`, `VITE_LEGAL_ADDRESS`, `VITE_LEGAL_SIRET`, `VITE_LEGAL_TVA`, `VITE_LEGAL_DIRECTOR`, `VITE_LEGAL_EMAIL`, `VITE_LEGAL_DPO_EMAIL` ; les mêmes `VITE_*` dans le groupe Codemagic `akno_env`.
3. Supabase › Auth › URL Configuration : ajouter `com.akno.app://auth/callback` aux Redirect URLs (seulement si Google/Apple sont réactivés).
4. Saisir la fiche store (`update70-store/fiche-store.md`), les captures (`update70-store/captures/`) et le compte démo dans les deux consoles.

## Tests
`tsc -b` OK · `npm run build` OK · factures 41/41 · twilio 22/22 · réceptionniste 33/33 · chantiers 38/38 · équipe 47/47 · clients 57/57 · assistant 60/61 (échec connu antérieur « Déplace le RDV de Lucas Girard ») · `npm run test:native` 30/30 · `npm run test:navbar` 25/25 (WebKit iPhone) · vérification du compte démo connecté (Playwright, `scripts/demo-check.mjs`) 10/10 · `npx cap sync` OK · APK/AAB debug Android construits.

## Non vérifié
Build iOS réel (pas de Mac : se fait sur Codemagic) ; Face ID natif et retour OAuth sur appareil ; rendu sur un vrai iPhone (tests en WebKit simulé) ; aucune revue Apple/Google encore passée.
