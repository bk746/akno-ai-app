# Akno · update58 — Premier lancement avec le configurateur « Ma réceptionniste »

## Ce qui change
À la première ouverture de la page **Réception** (comptes avec l'offre Réception uniquement, même verrouillage qu'avant),
le bouton **« Configurer »** ouvre désormais le **configurateur complet de l'update57** en mode guidé, au lieu de
l'ancien parcours en 3 étapes (Accueil / Horaires / Urgences et zone).

6 étapes, barre de progression, boutons **Continuer** / **Passer** / retour :
1. **Sa voix** — les 28 voix Grok, écoute de l'aperçu (Celeste par défaut), débit.
2. **L'accueil** — nom annoncé au téléphone (obligatoire), message d'accueil pré-rempli (mention IA + enregistrement déjà incluses), vouvoiement / tutoiement.
3. **Entreprise et prestations** — présentation pré-remplie, rayon d'intervention (10 à 80 km), zone en clair (facultatif), horaires (préréglages + jour par jour), disponibilités, prestations et prix.
4. **Urgences et consignes** — numéro d'urgence (pré-rempli avec votre numéro), consignes d'urgence, ce qu'elle ne doit jamais promettre, questions fréquentes, consignes avancées et prononciation.
5. **Appel test** — appel depuis l'app avec les réglages en cours (même non enregistrés), écoute de l'accueil.
6. **Terminer** — récapitulatif avec « Modifier » sur chaque ligne, puis **« Terminer et activer »**.

À la fin : enregistrement en une fois de `reception_config`, `message_accueil`, du nom d'entreprise, des horaires,
du numéro d'urgence et du rayon (`tarifs.zoneKm`) — tout ce que l'ancien parcours enregistrait est conservé — puis
la page est débloquée avec le **même indicateur qu'avant** (`akno_setup.rec` dans les métadonnées du compte).
Quitter en cours de route demande confirmation ; rien n'est enregistré et la page reste à configurer.

Inchangé : le configurateur depuis Paramètres → « Ma réceptionniste », la fiche rapide (Numéro Akno, Horaires, Message
d'accueil), les parcours de premier lancement Devis / Agenda / Relance.

## Points d'entrée redirigés
- Bouton « Configurer » de l'écran de premier lancement de la page Réception.
- Événement `akno-setup-open` (`openSetup()`) : bouton « + » de la barre du haut et raccourci clavier **N** quand la page Réception est verrouillée.
Les deux passent par `SetupGate` : pour `rec` il ouvre maintenant le configurateur en mode premier lancement.

## Fichiers modifiés
- `src/components/reception/ReceptionnisteStudio.tsx` (props `setup` / `onDone`, étapes, récapitulatif, appel test)
- `src/components/setup/SetupGate.tsx` (redirection `rec`, textes de l'écran d'intro, export des helpers horaires/zone)

Aucune migration, aucune variable d'environnement, aucune nouvelle fonction Vercel.
**Pas de redéploiement du relais Fly.io** : `voice-bridge/`, `src/lib/voice/script.ts` et `receptionist.ts` sont inchangés.

## Tests
- `npm run build` OK · `npm run test:receptionist` 33/33 · `npm run test:twilio` 22/22 · `cd voice-bridge && npm test` 16/16
- `npm run test:assistant` 60/61 (échec connu et antérieur : « Déplace le RDV de Lucas Girard à demain 11h »)
- Parcours cliqué en navigateur (maquette locale) : erreur si nom vide, erreur si numéro d'urgence incomplet, « Passer », contenu enregistré vérifié.

## À tester en vrai (3 étapes)
1. Avec un compte neuf ayant l'offre Réception : ouvrir Réception → « Configurer » → les 6 étapes s'enchaînent.
2. Faire l'appel test à l'étape 5, puis « Terminer et activer » : la page se débloque, Paramètres → Ma réceptionniste montre les mêmes réglages.
3. Appeler le numéro Akno : la voix et l'accueil choisis sont utilisés.
