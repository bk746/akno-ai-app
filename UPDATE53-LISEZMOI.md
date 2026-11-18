# Update 53 · Responsive mobile + fluidité

Base : update52 (commit 7b36c91). Aucune modification de logique métier ni du design desktop. Aucune migration SQL, aucune nouvelle variable d'environnement.

## Cause du décalage (feuille « Devis N° 9088 » coupée à gauche sur iPhone)
Ce n'était pas un élément trop large : l'audit automatique (WebKit + Chromium) ne trouve aucun débordement horizontal, ni avant ni après.
Le champ « E-mail du client » de la feuille (et presque tous les champs de l'app) était en 15 px. Sous 16 px, Safari iOS **zoome automatiquement** quand on touche le champ, puis reste zoomé : la page paraît décalée, le texte et le total sont coupés à gauche et le bouton est à moitié hors de l'écran. Le zoom n'était pas bloqué non plus (pincement possible).

## Ce qui change
- **Zoom bloqué** sur mobile et dans la PWA :
  - `index.html` : `maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-visual`.
  - `src/lib/mobile.ts` (nouveau, appelé dans `main.tsx`) : `preventDefault` sur `gesturestart/gesturechange/gestureend` et sur `touchmove` à 2 doigts ou plus (`passive:false`). Le défilement à un doigt et les feuilles ne sont pas touchés.
  - `touch-action: manipulation` (plus de zoom par double-tap, toucher immédiat).
- **Champs à 16 px** sur écran tactile (inputs, textarea, select, et le champ carte Stripe) : plus d'auto-zoom iOS. Le desktop garde ses tailles.
- **Clavier virtuel** : les feuilles du bas (Sheet, assistant de configuration, prestations, upgrade, assistant IA) remontent au-dessus du clavier (`--kb` calculé via `visualViewport`) et le champ actif est recentré. L'éditeur de devis garde de la place sous le dernier champ.
- **Cibles tactiles ≥ 44 px** sans changer le visuel (zone de toucher invisible autour des petits boutons et liens ; listes déroulantes à 44 px minimum).
- **Grilles** `1fr` → `minmax(0,1fr)` (un texte long ne peut plus élargir une grille).
- **Fluidité** : flous plein écran derrière les feuilles supprimés sur mobile (gros coût GPU sur iPhone), flous « xl » plafonnés à 16 px ; `prefers-reduced-motion` respecté aussi pour les animations CSS ; `text-size-adjust: 100%` (pas de grossissement du texte en paysage).

## Fichiers modifiés
- `index.html`
- `src/main.tsx`
- `src/lib/mobile.ts` (nouveau)
- `src/index.css` (bloc « update53 » en fin de fichier)
- `src/components/ui.tsx` (Sheet : clavier)
- `src/components/setup/SetupGate.tsx`, `src/components/devis/Prestations.tsx`, `src/components/billing/Upgrade.tsx`, `src/components/AknoApp.tsx` (feuilles : clavier ; grilles)
- `src/components/devis/DevisEditor.tsx` (espace clavier ; grilles)
- `src/components/billing/StripePane.tsx` (16 px sur tactile)
- `src/components/sheets/FacturesSheet.tsx`, `src/components/onboarding/Flow.tsx` (grilles)

## Tester en 3 étapes (iPhone)
1. Ouvrir un devis à valider, toucher « E-mail du client » : la page ne zoome plus et ne se décale plus ; la feuille reste au-dessus du clavier.
2. Essayer de pincer ou double-taper : rien ne zoome, le défilement reste normal.
3. Refaire l'inscription en fenêtre privée : aucun zoom sur les champs, y compris la carte bancaire.
