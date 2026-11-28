# update68 — menu « + » : les tuiles ne « rechargent » plus

**Cause :** la règle globale `button { transition: … opacity .2s, transform .15s }` (src/index.css, hors `@layer`, donc plus forte que la classe `transition-colors`) s'appliquait aussi aux 3 tuiles animées par motion ; sur WebKit (Safari / PWA iPhone), à la fin de l'animation WAAPI de motion la valeur finale est écrite en style inline et WebKit déclenche alors une transition CSS depuis l'état de départ (opacité 0, y 14 px) : les tuiles disparaissaient puis réapparaissaient à chaque ouverture. Chrome n'est pas concerné.

**Correctif (1 seul fichier : src/components/nav/MobileNav.tsx) :** les tuiles limitent leurs transitions CSS aux couleurs (`transitionProperty: color, background-color, border-color`) ; l'opacité et le transform sont pilotés par motion seul. La cascade d'entrée (une seule, démarrée avec la feuille) et tout le reste sont inchangés.

Aucune migration.

**Vérifié (WebKit en émulation iPhone + Chromium, build de prod) :** 5 ouvertures successives → 0 retour à l'invisible (avant : 121 images « retombées ») ; fermeture Échap / tap sur le fond / bouton × propre (tuiles jamais invisibles pendant la descente) ; taps rapides 5/6/7 fois → jamais 2 feuilles, état final cohérent ; la feuille n'est montée qu'une fois.
Captures : akno-docs/update68-screens/ — vidéos : akno-docs/update68-videos/.
