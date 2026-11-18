# Update 57 — « Ma réceptionniste » : le configurateur

L'artisan règle sa réceptionniste IA dans **Réglages › Réceptionniste › Ma réceptionniste** : il **écoute et choisit la voix**,
écrit son **accueil**, choisit **vouvoiement ou tutoiement**, présente son **entreprise**, liste ses **prestations** (prix indicatif,
durée), ses **consignes d'urgence**, ce qu'il ne faut **jamais promettre**, ses **questions fréquentes** et des **consignes libres**.
La même configuration sert à l'appel test de l'app **et** au vrai téléphone (relais Fly.io).

## Les voix

- 28 voix intégrées de Grok Voice (doc xAI : https://docs.x.ai/developers/model-capabilities/audio/voice ; genres lus via `GET /v1/tts/voices`) : 9 féminines, 19 masculines. Toutes parlent français.
- **Nouvelle voix par défaut : Celeste** (féminine, « compassionate, confident, reassuring — Support, Assistant » selon xAI), sans accent étranger annoncé. Avant : Ara (toujours au choix).
- Bouton ▶ sur chaque voix : aperçu de **votre accueil** avec la synthèse vocale xAI (même voix), en qualité téléphone (8 kHz) ou HD. ~0,004 $ l'aperçu, 40 aperçus / jour / artisan.
- Réglage du **débit** (0,85 à 1,2) et de la **prononciation** des noms propres (fonction `replace` de xAI).
- **Voix clonée / importée : pas possible pour l'instant.** xAI propose des « Custom Voices », mais seulement aux États-Unis (hors Illinois), avec création par API réservée aux comptes Enterprise et 30 voix maximum par compte (https://docs.x.ai/developers/model-capabilities/audio/custom-voices). Rien n'a été simulé.

## Ce qui change

- `src/components/reception/ReceptionnisteStudio.tsx` (nouveau) : l'écran (mobile + ordinateur), aperçu en direct de l'accueil, « Tester l'appel » avec les réglages affichés, même non enregistrés.
- `src/lib/voice/receptionist.ts` (nouveau) : liste des voix, valeurs par défaut, nettoyage des saisies, bloc de prompt.
- `src/lib/voice/script.ts` : la config entre dans le prompt (prestations, zone, horaires réels, FAQ, consignes, ton) ; voix, débit et prononciation dans la session. Sans config, le prompt reste celui de l'update 56 (sauf : voix Celeste, métier et horaires réels).
- `api/voice-token.ts` et `voice-bridge/src/server.ts` : chargent `reception_config`, le métier et les horaires de l'artisan.
- `api/account.ts` : action `voice_preview` (aperçu des voix, option Réceptionniste requise). **Aucune nouvelle fonction Vercel.**
- `src/components/AknoApp.tsx` (ligne « Ma réceptionniste »), `VoiceCall.tsx` (test avec la config en cours), `client.ts`, `ui.tsx`, `index.css`.
- `voice-bridge/Dockerfile` (copie `receptionist.ts`), `voice-bridge/README.md`, `voice-bridge/test/fake-call.mjs`.
- `scripts/test-receptionist.ts` + `npm run test:receptionist`.
- `supabase/migrations/20261118_09_update57_receptionist.sql` (nouveau, **à valider**) : colonne `artisans.reception_config` (jsonb, protégée par la RLS existante de `artisans`).

## Étapes pour Keryan

1. **Migration SQL** : relire `supabase/migrations/20261118_09_update57_receptionist.sql`, puis la lancer dans Supabase › SQL Editor. Tant qu'elle n'est pas lancée, l'écran s'affiche et le test marche, mais « Enregistrer » est bloqué (message affiché).
2. **Copier l'update** dans « akno-vite 4 », puis dans Cursor : `npm install`, `npm run build`, commit « update57 : configurateur réceptionniste », push. Vercel redéploie seul.
3. **Redéployer le relais** (terminal de Cursor, à la racine du projet) :
   `~/.fly/bin/flyctl deploy . --config voice-bridge/fly.toml --dockerfile voice-bridge/Dockerfile`
4. **Tester** : Réglages › Ma réceptionniste → écouter 2 ou 3 voix → choisir → ajouter une prestation et une question → Enregistrer → « Tester l'appel ». Puis appeler le 09 73 05 78 24 : la nouvelle voix doit décrocher.

Aucune nouvelle variable d'environnement (utilise `XAI_API_KEY`, déjà sur Vercel et Fly).
