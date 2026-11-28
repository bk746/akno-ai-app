# Update 56 — Vrais appels téléphoniques (Twilio + Grok Voice)

Un client appelle l'artisan. **Le portable de l'artisan sonne normalement.** S'il ne décroche pas (ou est occupé, ou sans réseau),
l'appel bascule sur son numéro Akno et **la réceptionniste IA Grok Voice décroche** : même voix, même prompt et mêmes outils
que l'appel test de l'app (prise de RDV, fiche dans Réception, transcription, enregistrement, notification push).

## Ce qui change

- `api/twilio-voice.ts` (nouveau) : appel entrant → vérification signature Twilio + forfait Réceptionniste → branche l'appel sur l'IA.
  Fin d'appel (`?event=status`) → durée + numéro dans la fiche d'appel. Hors forfait / limite de minutes → message poli puis raccroche.
- `api/_lib/twilioVoice.ts` (nouveau) : TwiML, jeton du relais, auth serveur du relais.
- `api/booking.ts`, `api/notify.ts` : acceptent aussi le relais (en-tête secret `BRIDGE_SECRET`).
- `api/account.ts` : affiche le numéro de la nouvelle table `artisan_phone_numbers`.
- `src/components/sheets/ReglagesSheets.tsx` : Réglages › Réceptionniste → guide de renvoi d'appel conditionnel.
- `voice-bridge/` (nouveau) : le relais audio à héberger (voir `voice-bridge/README.md`).
- `supabase/migrations/20261118_08_update56_twilio.sql` (nouveau, **à valider**).
- `scripts/test-twilio.ts` + `npm run test:twilio`, `vite.config.ts` (route de dev), `.dockerignore`.

## Étapes pour Keryan

1. **Copier l'update** dans « akno-vite 4 » (remplacer les fichiers), puis dans Cursor : commit « update56 : vrais appels Twilio + Grok Voice » et push.
2. **Migration SQL** : relire `supabase/migrations/20261118_08_update56_twilio.sql`, puis la lancer dans Supabase › SQL Editor.
   Ensuite, lancer l'INSERT de la fin du fichier en remplaçant l'UUID par ton id d'artisan (Supabase › Table `artisans` › colonne `id`).
3. **Créer un secret** commun (terminal) : `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` → copier le résultat (= `BRIDGE_SECRET`).
4. **Déployer le relais** : suivre `voice-bridge/README.md` (Fly.io, 5 étapes). Noter l'adresse `https://….fly.dev`.
5. **Variables Vercel** (Settings › Environment Variables, Production), puis *Redeploy* :
   - `VOICE_BRIDGE_URL` = l'adresse du relais (ex. `https://akno-voice-bridge.fly.dev`)
   - `BRIDGE_SECRET` = le secret de l'étape 3
   - `TWILIO_ACCOUNT_SID` et `TWILIO_AUTH_TOKEN` (s'ils n'y sont pas déjà)
   - `APP_URL` = `https://akno-ai-app-v2.vercel.app`
   - déjà présentes normalement : `XAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`
6. **Brancher le numéro** (une fois 4 et 5 faits) : dis-le à Grok Bot, il le règle pour toi.
   Ou à la main : Twilio › Phone Numbers › Active numbers › +33 9 73 05 78 24 › Voice Configuration :
   - *A call comes in* : Webhook `https://akno-ai-app-v2.vercel.app/api/twilio-voice` (HTTP POST)
   - *Call status changes* : `https://akno-ai-app-v2.vercel.app/api/twilio-voice?event=status` (HTTP POST) → Save.
7. **Tester** : appelle directement le 09 73 05 78 24 depuis un autre téléphone → l'IA répond. Raccroche : la fiche apparaît dans Réception (notification push).
8. **Activer sur ton portable** (Réglages › Réceptionniste dans l'app) : compose `**61*0973057824**20#` (non-réponse après 20 s),
   `**67*0973057824#` (occupé), `**62*0973057824#` (injoignable). Pour couper : `##61#`, `##67#`, `##62#` ou `##004#` pour tout.
   Ne pas utiliser le renvoi permanent `**21*` : l'IA prendrait tous les appels.

## Coûts à prévoir

Relais Fly.io ~2 €/mois ; Twilio : numéro (déjà payé) + minutes d'appel entrant ; xAI : minutes Grok Voice (comme l'appel test).
Avec le renvoi conditionnel, l'opérateur de l'artisan peut aussi facturer le renvoi selon le forfait (souvent inclus).
