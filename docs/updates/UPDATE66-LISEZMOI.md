# Akno · update66 — Page Clients (liste, fiche, ajout)

**Deux migrations à appliquer vous-même, dans l'ordre** (non appliquées par l'agent) :
1. `supabase/migrations/20261121_12_update65_equipe_acces.sql` (update65, toujours en attente)
2. `supabase/migrations/20261121_13_update66_clients.sql` (nouvelle)

Tant qu'elles ne sont pas appliquées, la page Clients fonctionne : type « Syndic », origine du contact, ville/coordonnées et date de création
sont simplement masqués ou omis (un petit texte le signale dans le formulaire). Aucune nouvelle variable d'environnement, aucune nouvelle dépendance,
toujours **12 fonctions** dans `api/`. Aucun changement du relais vocal.

## Migration 20261121_13 (idempotente, rejouable)
Ajoute à `client_fiches` (ADD COLUMN IF NOT EXISTS) : `type_client` (`particulier | pro | syndic`), `prenom`, `nom_famille`,
`origine` (`appel | bouche_a_oreille | site | google | autre`), `ville`, `lat`/`lng` (bornes vérifiées), `created_at` (défaut now(), NULL pour les fiches existantes),
contrainte de longueur des notes (NOT VALID, n'affecte pas l'existant), index `(artisan_id, telephone)` pour la détection de doublons.
RLS inchangée : les règles `client_fiches` « own » couvrent les nouvelles colonnes. Tests RLS u66_* ajoutés.

## D'où viennent les clients
Le carnet = fiches `client_fiches` + clients déduits des appels, devis, factures, chantiers et RDV (comme avant).
Rattachement : `client_id` du chantier → téléphone (9 derniers chiffres : 06…, +33 6…, 0033 6…) → nom sans accents ni civilité.
Un client créé ici apparaît partout : éditeur de devis, factures, chantiers (sélecteurs clients), fiche client des appels.

## Accès
- **+** → « Créer » : la tuile **Clients** remplace « Contact » et ouvre **/clients** (onglet Chantiers allumé, comme la maquette).
- **Réglages → Clients** ouvre la même page (retour « < Compte »). L'ancienne feuille Contacts est remplacée.
- Ordinateur : entrée « Clients » dans la barre latérale.
- Fiche client d'un appel : « Fiche client complète › » et, si le client n'a pas de fiche, « Ajouter aux clients » (origine « Appel » préremplie).

## Liste
Titre, bouton +, résumé Clients / En cours / À encaisser (factures émises non payées), recherche « Nom, ville, téléphone » (sans accents, téléphone avec ou sans espaces),
filtres Tous / Chantier en cours / Devis en attente / À relancer (devis envoyé sans réponse depuis le délai de relance du profil, ou facture échue),
section « Récents » + compteur (tri par dernière activité). Ligne : initiales (rond = particulier, carré arrondi = pro/syndic), nom, ville ou « Syndic · ville »,
à droite : point orange « En cours », point bleu « Le 2 déc. » / « Demain » (prochain chantier ou RDV), point rouge « En retard », « Devis envoyé » gris.

## Fiche
« < Clients » / « Modifier » ; avatar, nom, « Particulier · depuis oct. », adresse sur 2 lignes, vignette satellite Esri + repère orange (géocodage api-adresse si besoin).
Appeler (tel:), SMS, Itinéraire, Email (grisé sans e-mail). Cartes **CA total**, **À encaisser**, **Chantiers** (« 1 en cours »).
**CA total** = devis acceptés + factures émises non liées à un devis accepté (acomptes déduits, avoirs retirés) : un acompte sur devis signé n'est jamais compté deux fois.
Chantier en cours : dates, barre + %, équipe empilée « +N » ; toucher → la carte Chantiers s'ouvre dessus.
**Historique** automatique (plus récent d'abord, 4 éléments + « Tout voir ») : appels de la réceptionniste (« RDV de visite calé le 14 oct. »),
devis (une ligne par devis à sa dernière étape : créé / envoyé / accepté « signé en ligne » / refusé), chantiers démarrés/terminés, factures envoyées/payées avec leur type.
**Documents** : « + Nouveau devis » (éditeur prérempli : nom, téléphone, e-mail, adresse) ; lignes devis/factures (numéro, « type · date », montant, statut) qui ouvrent le document.
Notes et SIREN.

## Ajout / modification
Feuille « Nouveau client » : Particulier / Professionnel ; « Importer depuis les contacts » (Contact Picker sur Android/Chrome, sinon fichier .vcf, ex. partage d'un contact iPhone) ;
Société + type Entreprise / Syndic (pro) ; Prénom / Nom ; Téléphone (vérifié, formaté) / Email ; Adresse avec autocomplétion api-adresse (partie tapée en gras, CP + ville dessous) ;
Notes « Code portail, étage, accès… » ; SIREN ou SIRET (pro, optionnel — stocké en SIREN) ; Origine Appel / Bouche-à-oreille / Site / Google / Autre.
**Doublon** : un numéro déjà connu affiche « Ce numéro est déjà celui de … » + « Ouvrir ».
Modifier : même formulaire prérempli. « Supprimer le client » (confirmé en rouge) seulement pour une fiche sans devis, facture, chantier, appel ni RDV.

## Limites
- La réceptionniste vocale ne reconnaît pas encore un client par son nom au téléphone (relais inchangé) ; les appels se rattachent par numéro.
- Renommer un client ne renomme pas ses anciens documents (la clé de fiche reste stable, les documents restent rattachés).
- Sans la migration 13 : pas de type « Syndic » explicite (déduit du nom), pas d'origine, « depuis » = première activité connue.

## Tests
`npm run test:clients` (57 tests), RLS `node supabase/tests/run-local.mjs --twice` (u66_*), plus toutes les suites existantes.
