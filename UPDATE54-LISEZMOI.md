# Update 54 : nouvelles mascottes 3D

Ce qui change : les mascottes des 4 agents sont maintenant des sphères 3D avec un dégradé animé (CSS pur, sans WebGL).
- Devis : bleu
- Agenda : violet
- Relance : vert
- Réception / Réceptionniste : blanc nacré

Les yeux gardent leurs animations (clignements, regards). L'animation s'arrête si l'appareil demande moins de mouvements (prefers-reduced-motion). Les agents ne bougent pas en même temps (animations décalées).

Les couleurs d'accent des agents suivent : Devis passe du teal au bleu (#2F6BFF), Agenda au violet (#8B7CFF) et Relance au vert (#22B07A). Réception reste gris clair (#E6E6E6).

Ce qui ne change pas : les documents envoyés aux clients (PDF du devis et de la facture, page d'acceptation, e-mails, dossier de conformité) gardent leur couleur actuelle. Rien d'autre ne bouge dans le design, et il n'y a aucune migration ni nouvelle variable d'environnement.

Fichiers modifiés :
- src/components/ui.tsx : nouveau composant Orb (sphère) ; Blob garde la même API, Eyes accepte une géométrie ; nouvelles couleurs dans A
- src/index.css : styles .orb (dégradé animé, reflet, ombrage, mouvements réduits)
- src/components/Lock.tsx, src/components/VoiceCall.tsx, src/components/Login.tsx : mascotte blanche en sphère
- src/components/devis/fields.tsx : accent Devis bleu (éditeur de devis et prestations)
- src/components/AknoApp.tsx : statut « À valider » et bandeau brouillon en bleu
- src/components/auth/BrandPanel.tsx : date de l'Agenda en violet

Pour tester :
1. Sidebar « Agents » : 4 petites sphères (blanche, violette, verte, bleue).
2. En-têtes des pages Devis, Agenda, Relance et Réception : grande sphère qui bouge doucement.
3. Inscription : la sphère blanche apparaît dans le panneau de droite et dans le logo.
