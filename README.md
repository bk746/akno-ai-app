# Akno — App (Vite + React)

App de démo Akno : Réception, Agenda, Relance, Devis, Paramètres. Données de démonstration uniquement (stockées dans le navigateur).

## Lancer l'app

Il faut Node.js (version 20 ou plus).

```bash
npm install
npm run dev
```

Puis ouvre http://localhost:5173 (redirige vers /reception).

## Structure

- `index.html` : point d'entrée
- `src/main.tsx` : routes (/reception, /agenda, /relance, /devis, /parametres) et polices
- `src/components/AknoApp.tsx` : toute l'interface
- `src/lib/store.ts` : données de démo
- `src/index.css` : thème Tailwind
- `public/` : logo, icônes

## Mise en production

```bash
npm run build
```

Le dossier `dist/` est à déployer (Vercel, Netlify…), avec une redirection de toutes les routes vers `index.html`.

## Assistant

Par défaut, l'assistant tourne **en local et hors ligne** (`src/lib/assistant.ts`). C'est un moteur à intentions : il normalise le texte, retrouve les clients même avec une faute de frappe, comprend les dates et heures en français, et répond à partir des données de démo. Il sait aussi faire des actions (RDV, devis, relances, rappels), et chacune peut être annulée.

Test : `npm run test:assistant`

### Brancher une vraie IA (optionnel)

Le moteur local répond en premier. Votre service n'est appelé que pour les questions qu'il ne comprend pas. Créez un fichier `.env.local` :

```
VITE_AKNO_AI_URL=https://votre-api.exemple/akno-chat
VITE_AKNO_AI_KEY=xxxx        # optionnel, envoyé en "Authorization: Bearer"
```

- Requête : `POST` avec le corps JSON `{ "message": "…", "context": { today, calls, events, devis, rels } }`
- Réponse attendue : `{ "text": "…" }`

En cas d'erreur ou de délai dépassé, l'assistant affiche sa réponse locale.
⚠️ Une variable `VITE_*` est visible dans le navigateur. Passez par un proxy serveur pour ne pas exposer de clé secrète.
