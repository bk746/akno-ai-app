# Akno · update59 — Bouton « Redémarrer pour mettre à jour »

## Ce qui change
Quand une nouvelle version est déployée sur Vercel, l'app (navigateur et PWA installée sur iPhone) le détecte et affiche
un **bouton rond bleu avec un nuage de téléchargement**, à côté du bouton assistant (en haut à droite) :
- ordinateur : barre du haut, à gauche du bouton assistant ; infobulle « Redémarrer pour mettre à jour » au survol ;
- mobile : en-tête des pages Réception / Agenda / Relance / Devis ; petite bulle « Redémarrer pour mettre à jour » 6 s à la première apparition.
Apparition en ressort + léger halo qui pulse. Un appui met à jour tout de suite (rechargement sur la nouvelle version).

Sécurités : pendant un appel test vocal, aucun rechargement (message « Terminez l'appel en cours… ») ; si une fenêtre
est ouverte (formulaire, devis…), confirmation avant de recharger. Jamais de rechargement automatique sans appui, sauf
le cas « morceau introuvable » ci-dessous (une seule fois, jamais pendant un appel).

## Comment ça marche
- Au build, un identifiant de version est figé dans le code (`VERCEL_GIT_COMMIT_SHA`, 12 caractères ; sinon horodatage) et publié dans **`/version.json`** (`Cache-Control: no-store` dans `vercel.json`).
- L'app relit `/version.json` sans cache : 5 s après l'ouverture, au retour au premier plan, au focus, au réveil (pageshow), au retour du réseau, et toutes les 60 s quand l'app est visible. Version différente → bouton.
- Service worker (notifications push, `/sw.js`, sans cache) : `registration.update()` à la détection et à l'appui ; il fait déjà `skipWaiting` + `clients.claim`, et accepte maintenant le message `SKIP_WAITING`. L'abonnement push n'est pas touché.
- Appui : mise à jour du SW, `fetch("/", { cache: "reload" })` pour rafraîchir l'index, puis rechargement.
- Ancienne version encore ouverte qui ne trouve plus un fichier (après un déploiement) : rechargement automatique une fois ; si ça recommence dans la minute, écran « Une nouvelle version d'Akno est disponible » avec le même bouton bleu (au lieu de « Un problème est survenu »).

## Fichiers
- `src/lib/appUpdate.ts` (nouveau) · `src/components/UpdateButton.tsx` (nouveau)
- `src/components/AknoApp.tsx` (bouton dans les 2 en-têtes, écran d'erreur « nouvelle version », démarrage de la détection)
- `vite.config.ts` (identifiant de build + `version.json`) · `vercel.json` (en-tête no-store) · `public/sw.js` (message SKIP_WAITING)

Aucune migration, aucune variable d'environnement, aucune nouvelle fonction Vercel. Pas de redéploiement du relais Fly.io.

**Important** : les versions déjà ouvertes (update58 et avant) n'ont pas ce bouton. Après le déploiement d'update59,
fermez et rouvrez l'app une fois (PWA : la fermer depuis le sélecteur d'apps). Ensuite, chaque nouveau déploiement affichera le bouton.

## Tests
build OK · test:receptionist 33/33 · test:twilio 22/22 · relais 16/16 · test:assistant 60/61 (échec connu « Déplace le RDV de Lucas Girard à demain 11h »).
Simulation locale (build + `vite preview`, version.json modifié pendant que l'app est ouverte) : bouton absent avant, présent après, l'appui recharge ; fichier JS supprimé : rechargement auto une fois puis écran « nouvelle version ».

## À vérifier en vrai
1. Déployer update59, rouvrir l'app une fois.
2. Pousser n'importe quel petit changement : en moins d'une minute (ou en revenant sur l'app), le nuage bleu apparaît.
3. Appuyer : l'app redémarre sur la nouvelle version, les notifications push fonctionnent toujours.
