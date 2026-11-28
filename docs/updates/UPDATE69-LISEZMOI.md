# update69 — feuilles plein écran, menu « + » qui sort du bouton, transitions fluides

## Causes
- **Feuilles coupées à mi-écran (Nouveau chantier, client, équipe, devis, facture, RDV)** : sur iPhone (PWA), `visualViewport` restait parfois « rétréci » après la fermeture du clavier ; `--kb` gardait ~300 px sans clavier et les feuilles restaient remontées et raccourcies. En PWA, `100dvh` pouvait aussi être trop court.
- **Onglets sans animation (coupe sèche)** : la page entrante était créée au moment du tap (rendu lourd) et l'animation « partait » pendant ce rendu bloquant, donc invisible sur iPhone ; avec « Réduire les animations » / mode économie, `MotionConfig reducedMotion="user"` supprimait en plus les déplacements.
- **Devis ↔ Factures en retard (~1 s)** : la pilule glissait, mais le contenu attendait le changement d'URL, qui re-rendait toute l'app puis recréait la liste.
- **Carte des chantiers** : recréée à chaque visite, apparition sèche.

## Changements (7 fichiers)
- `src/lib/mobile.ts` : `--kb` vaut 0 sans champ actif, re-mesure au focus / blur / retour dans l'app.
- `src/components/sheet/ModalSheet.tsx` + `src/index.css` : hauteur des feuilles `--sheet-vh` (100dvh, 100lvh en PWA installée), plein écran au-dessus de la carte et de la barre, défilement interne.
- `src/components/nav/MobileNav.tsx` : le « + » déploie un menu flottant juste au-dessus de la barre, qui naît du bouton (ressort, origine = centre du +), le + tourne en ×, la fermeture repart vers le +. Les tuiles n'ont toujours que des transitions de couleur (correctif update68 conservé). Taps rapides protégés.
- `src/components/AknoApp.tsx` : Réception, Agenda, Chantiers et Devis | Factures restent montés (masqués) une fois ouverts ou préparés au repos ; transitions d'onglets lancées une image après que la page est prête (transform + opacity uniquement) ; avec mouvements réduits : fondu enchaîné court, jamais de coupe. Défilement conservé par onglet. Devis | Factures : les deux volets restent montés et glissent avec la pilule (même ressort) ; l'URL suit après le glissement.
- `src/components/chantiers/ChMap.tsx` : la carte apparaît en fondu au premier chargement, puis n'est plus recréée.
- `src/components/setup/SetupGate.tsx` : seule la page affichée agit sur l'état global (pages gardées montées).
- `src/index.css` : plus de transition CSS sur transform/opacity des boutons animés par motion (évite les doubles animations WebKit).

Aucune migration Supabase.

## Vérifié
tsc -b, npm run build ; tests : réception 33, twilio 22, assistant 60/61 (échec connu), factures 41, chantiers 38, équipe 47, clients 57, relais 25, RLS --twice OK.
Playwright WebKit iPhone (build de prod) : 42/42 (feuilles plein écran y compris viewport figé, menu + depuis le bouton, taps rapides, transitions jouées sans éclair y compris en mouvements réduits, Devis/Factures deux volets montés, carte gardée, défilement conservé).
Captures : akno-docs/update69-screens/ — vidéos : akno-docs/update69-videos/.
