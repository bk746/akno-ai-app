# Akno voice-bridge (update56)

Petit serveur qui relie un **vrai appel téléphonique** (Twilio) à la **réceptionniste IA xAI Grok Voice**, en temps réel.

```
Client ──appelle── portable de l'artisan ──(pas de réponse : renvoi conditionnel)──▶ numéro Akno (Twilio)
Twilio ──POST──▶ https://akno-ai-app-v2.vercel.app/api/twilio-voice   (signature vérifiée, forfait vérifié)
       ◀─TwiML <Connect><Stream>──
Twilio ══WebSocket audio μ-law 8 kHz══▶ voice-bridge (ce dossier) ══WebSocket══▶ xAI Grok Voice (audio/pcmu)
voice-bridge ──▶ /api/booking (RDV), /api/notify (push), Supabase (fiche d'appel, transcription, enregistrement)
```

Pourquoi un serveur à part : Vercel ne garde pas de WebSocket ouvert pendant tout un appel.
xAI accepte directement le μ-law 8 kHz de Twilio : **aucune conversion audio**, latence minimale.
(xAI propose aussi une entrée SIP, mais il faut quand même un WebSocket ouvert pendant l'appel pour
exécuter les outils — RDV, fiche d'appel — donc un serveur reste nécessaire ; on garde Twilio Media Streams,
plus simple à brancher sur le numéro déjà acheté.)

## Variables d'environnement (chez l'hébergeur du relais)

| Variable | Valeur |
|---|---|
| `XAI_API_KEY` | la même clé xAI que sur Vercel |
| `BRIDGE_SECRET` | un long secret aléatoire, **identique** sur Vercel |
| `SUPABASE_URL` | URL du projet Supabase (= `VITE_SUPABASE_URL`) |
| `SUPABASE_SERVICE_ROLE_KEY` | clé service_role Supabase (la même que sur Vercel) |
| `APP_URL` | `https://akno-ai-app-v2.vercel.app` |

## Déployer sur Fly.io (recommandé : ~2 €/mois, serveur à Paris, toujours allumé)

1. Installer l'outil : https://fly.io/docs/flyctl/install/ puis `fly auth signup` (ou `fly auth login`).
2. Créer l'application (une seule fois) :
   ```
   fly apps create akno-voice-bridge
   ```
   Si le nom est déjà pris, choisis-en un autre (ex. `akno-voice-keryan`) et remplace-le à la ligne `app = …` de `voice-bridge/fly.toml`.
3. Coller les secrets (remplacer les `...`) :
   ```
   fly secrets set --config voice-bridge/fly.toml XAI_API_KEY=... BRIDGE_SECRET=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... APP_URL=https://akno-ai-app-v2.vercel.app
   ```
4. Déployer :
   ```
   fly deploy . --config voice-bridge/fly.toml --dockerfile voice-bridge/Dockerfile
   ```
5. Vérifier : ouvrir `https://<nom-de-l-app>.fly.dev/health` → doit afficher `ok`.
   C'est cette adresse (`https://<nom-de-l-app>.fly.dev`) qui va dans `VOICE_BRIDGE_URL` sur Vercel.

Autre hébergeur (Render « Starter », Railway…) : service Docker, Dockerfile `voice-bridge/Dockerfile`,
contexte de build = racine du projet, port 8080, mêmes variables. Éviter les offres gratuites qui « s'endorment » :
le premier appel attendrait 30 à 60 s.

## Tester en local (sans xAI ni Twilio)

```
cd voice-bridge && npm install && npm test
```
Simule un appel Twilio, un faux xAI et une fausse API Akno (aucun appel réel, aucune écriture en base).

## Après une modification du prompt (`src/lib/voice/script.ts`)

Le relais embarque le prompt au moment du build : relancer `fly deploy …` (étape 4).
