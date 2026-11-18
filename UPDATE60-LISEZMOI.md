# Akno · update60 — Correction de la prise de RDV au téléphone

## Le bug (appel réel du 18/11, 14 h 23)
Le client demande jeudi 19/11 à 8 h. La réceptionniste répond « le créneau vient d'être pris » alors que l'agenda était vide,
puis la fiche est enregistrée « RDV pris » sans aucun rendez-vous créé (rdv_date vide, rien dans l'Agenda).

## Cause
1. Le relais Fly.io n'attendait que **2,5 s** la réponse de `/api/booking` (1,5 s pour les créneaux au décroché).
   Au démarrage à froid de Vercel + Cal.com (vérification du créneau puis réservation = plusieurs requêtes), c'est trop court.
2. Toute erreur (délai dépassé, panne) revenait à l'IA sous la forme « Créneau indisponible » → elle annonçait « créneau pris ».
3. Le statut `rdv_pris` venait uniquement de ce que l'IA déclarait dans `save_call`, sans vérifier qu'un rendez-vous existait.
4. Côté `/api/booking`, une panne de lecture Cal.com pendant la réservation était aussi renvoyée comme « créneau plus disponible ».

## Ce qui change
- Relais : délai **8 s** (variable `APP_TIMEOUT_MS` possible), `/api/booking` réveillé dès le décroché (la requête continue en arrière-plan), journaux `[book]` / `[app]` avec durée et type d'échec.
- `/api/booking` renvoie maintenant `reason` : `taken` (vraiment pris), `invalid` (hors horaires, date passée…), `error` (panne → HTTP 502).
- Souci technique → l'IA reçoit une consigne explicite : « Je n'arrive pas à confirmer le rendez-vous pour un souci technique… l'artisan vous rappelle pour le confirmer. » Elle ne dit plus jamais « créneau pris » à tort.
- Fiche d'appel : `rdv_pris` + `rdv_date` **uniquement** si le rendez-vous a vraiment été créé ; sinon « à rappeler » avec la note « RDV demandé mais NON confirmé (date à heure) ». Le rendez-vous créé est relié à la fiche (`appointments.call_id`).
- Appel test de l'app : mêmes règles (délai créneaux 8 s, réservation 15 s, mêmes statuts).
- Prompt partagé (`script.ts`) : 2 phrases sur `taken` / `technical`.

## Fichiers
`voice-bridge/src/server.ts`, `voice-bridge/test/fake-call.mjs`, `api/booking.ts`, `src/lib/voice/script.ts`,
`src/lib/voice/tools.ts`, `src/lib/voice/client.ts`. Aucune migration, aucune nouvelle variable obligatoire.

## Déploiement
1. Commit + push (Vercel redéploie l'app et `/api/booking`).
2. **Redéployer le relais** (obligatoire : `voice-bridge/` et `script.ts` ont changé) :
   `~/.fly/bin/flyctl deploy . --config voice-bridge/fly.toml --dockerfile voice-bridge/Dockerfile`
   puis vérifier `https://akno-voice-bridge.fly.dev/health` → `ok`.

## Tests
build OK · test:receptionist 33/33 · test:twilio 22/22 · relais 25/25 (dont 10 nouveaux : RDV réussi, créneau vraiment pris,
agenda trop lent, panne 502, réveil au décroché) · test:assistant 60/61 (échec connu « Déplace le RDV de Lucas Girard… »).

## À vérifier en vrai
Appeler le numéro Akno, demander un RDV : il apparaît dans l'Agenda, la fiche est « RDV pris » avec la date.
En cas de souci : `~/.fly/bin/flyctl logs -a akno-voice-bridge` → lignes `[book]` et `[app]`.
