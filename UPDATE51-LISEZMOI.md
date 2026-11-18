# Update 51 · Configuration obligatoire des pages

## Ce qui change
À la première visite de Réception, Agenda, Relance ou Devis, la page s'affiche floutée et non cliquable.
Une carte « Configurez vos devis » (ou « votre réceptionniste », « votre agenda », « vos relances »)
propose le bouton « Configurer », qui ouvre un mini-assistant en 2 ou 3 étapes. Tant qu'il n'est pas terminé,
la page reste bloquée. Le « + » de la barre du haut et la touche N ouvrent aussi l'assistant.
Une fois terminé, les réglages sont enregistrés, le flou s'efface et la page reste débloquée.

| Page | Étapes | Champs enregistrés (fiche `artisans`, champs existants) |
|---|---|---|
| Devis | Mentions légales · TVA et conditions · Tarifs | entreprise_siret (recherche annuaire), entreprise_nom, entreprise_adresse, entreprise_cp_ville, entreprise_tva / tva_non_applicable, assurance_nom, assurance_numero, devis_validite_jours, devis_conditions, tarifs.tauxHoraire, tarifs.deplacement, tarifs.devisGratuit + TVA par défaut (réglage local existant) |
| Réceptionniste | Accueil · Horaires · Urgences et zone | nom annoncé (entreprise_nom ou nom_entreprise), message_accueil, horaires, telephone_urgence, tarifs.zoneKm |
| Agenda | Horaires · Interventions | horaires, tarifs.zoneKm + durée par défaut (réglage local existant) |
| Relances | Rythme · Expéditeur | relance_delais, nom de l'entreprise, entreprise_email (adresse de réponse), sms_enabled / sms_sender (si l'offre inclut les SMS) |

Tout est pré-rempli avec ce qu'on sait déjà (inscription, SIRET, fiche) et des valeurs par défaut.

## Où est stocké l'état « page configurée »
Côté serveur, par compte, dans les métadonnées Supabase Auth de l'utilisateur
(`auth.users.raw_user_meta_data → akno_setup`, ex. `{"dev": "2026-11-18T07:51:13Z", …}`).
Aucune migration SQL n'est nécessaire. Une copie locale permet seulement d'ouvrir la page sans attente.

## Comptes existants
Une page n'est pas bloquée si le compte l'utilise déjà : appels (Réception), rendez-vous ou Cal.com (Agenda),
relances (Relance), devis ou SIRET + taux horaire (Devis). La Réception sans l'option garde son écran d'offre.

## Fichiers
- nouveau : `src/lib/setup.ts`, `src/components/setup/SetupGate.tsx`
- modifié : `src/components/AknoApp.tsx` (page enveloppée par SetupGate, « + » / touche N), `src/components/sheets/ReglagesSheets.tsx` (export des horaires par défaut)

## Variables d'environnement / migrations
Aucune.

## Tester en 3 étapes
1. Créer un compte neuf en fenêtre privée, aller sur Devis : page floutée + carte « Configurez vos devis ».
2. Configurer → remplir les 3 étapes → Terminer : le flou disparaît, recharger la page : elle reste ouverte.
3. Faire de même sur Réception, Agenda et Relance (sur mobile aussi).
