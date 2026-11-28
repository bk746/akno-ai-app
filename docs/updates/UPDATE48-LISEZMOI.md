# Update 48 · Droits de l'offre appliqués dans l'app

Contient aussi l'update 47 (proposition du code d'accès déplacée dans Gate).

## Ce qui change
Les droits `entitlements.features` sont maintenant appliqués dans toute l'interface (`useRights()` dans `src/lib/accountApi.ts`).
Rien n'est verrouillé pour les comptes `plan_override`, si le paiement est désactivé ou tant que le compte n'est pas chargé.

### Sans l'option Réceptionniste IA (`reception`)
- **Page Réception** : présentation de l'option avec son prix (50 € HT/mois ou 480 € HT/an selon l'intervalle de l'abonnement) et un bouton « Ajouter la Réceptionniste IA ». Le bouton « Appeler ma réceptionniste », le tableau des appels et la capsule assistant/+ de cette page ne s'affichent plus.
- **Menu latéral et barre mobile** : l'onglet Réception reste visible avec un petit cadenas et mène à la présentation. L'agent Réceptionniste est marqué d'un cadenas.
- **Paramètres** :
  - L'agent « Réceptionniste » de la section « Mes agents » propose « Ajouter ».
  - La section Réceptionniste (numéro, numéro d'urgence, horaires, message d'accueil) est remplacée par une ligne « Ajouter la Réceptionniste IA ».
  - L'action rapide « Horaires » ouvre l'ajout de l'option.
- **Page d'arrivée** après la connexion : Agenda au lieu de /reception.
- **Appels et messages vocaux déjà enregistrés** : ils restent dans les fiches clients. La page de présentation donne aussi un lien vers la liste des appels.

### Offre Bureau (fonctions Clients `avis`, `leads`, `rapport_mensuel`)
- Les lignes « Demandes du site » et « Avis clients » des Paramètres affichent un cadenas « Offre Clients ». Elles ouvrent « Passer à l'offre Clients ».
- Le rapport mensuel n'a pas d'écran dans l'app : il reste réservé côté serveur.

### Ajouter l'option / passer en Clients (abonnés, même pendant l'essai)
- **Nouvelle action** `upgrade` dans `/api/account` (`api/_lib/upgrade.ts`) : `{ add: "reception" | "clients", confirm?: true }`.
  - **Sans `confirm`** : aperçu (montant actuel, nouveau montant HT/TTC, prorata).
  - **Avec `confirm`** :
    - L'abonnement Stripe existant est modifié au même intervalle. Pour la Réception, un article est ajouté. Pour Clients, l'article Bureau est remplacé.
    - La proratisation Stripe standard (`create_prorations`) s'applique. L'essai continue.
    - Les droits sont ensuite resynchronisés directement depuis Stripe (`syncSubscription`), sans attendre le webhook.
- **Contrôles** :
  - L'abonnement est lu dans la table `subscriptions` du compte connecté.
  - Le client Stripe doit correspondre.
  - Une option déjà présente est refusée.
  - Un abonnement en impayé, en cours de résiliation ou non reconnu est refusé, avec un renvoi vers le portail Stripe.
- **Écrans** :
  - Une fenêtre de confirmation montre le nouveau montant, puis un écran « activée ».
  - Les mêmes boutons sont aussi dans Paramètres › Abonnement.

## Variables d'environnement
Aucune nouvelle variable. Les variables existantes sont utilisées : `STRIPE_PRICE_*` (mensuels et annuels), `STRIPE_TAX_RATE_ID` et `STRIPE_AUTOMATIC_TAX`.

## Fichiers
- Nouveaux : `api/_lib/upgrade.ts`, `src/components/billing/Upgrade.tsx`.
- Modifiés : `api/account.ts`, `api/_lib/plans.ts` (champ `override`), `src/lib/accountApi.ts`, `src/components/AknoApp.tsx`, `src/components/sheets/AbonnementSheet.tsx`.

## Tests
- `npm run build` OK.
- `npm run test:assistant` : 60/61 (même résultat qu'avant).
- **Test Stripe en mode test, de bout en bout** :
  - Bureau mensuel en essai + Réception :
    - Article à 50 € ajouté avec la TVA à 20 %.
    - Essai conservé, même date de fin.
    - Prochaine facture : 139 € HT, soit 166,80 € TTC.
  - Un double ajout est refusé, tout comme l'abonnement d'un autre client.
  - Bureau annuel actif passé en Clients annuel :
    - Prorata calculé.
    - Article remplacé.
  - Réception annuelle : 480 €.
  - Les données de test ont été supprimées.

## Ajout : prorata encaissé immédiatement
Hors essai, quand un abonné ajoute la Réceptionniste ou passe en Clients, le prorata est facturé et débité tout de suite (Stripe `always_invoice`). Si la carte est refusée, rien n'est modifié et l'app renvoie vers le portail de facturation. Pendant l'essai : rien à payer, l'essai continue.
Testé en mode test : Bureau annuel actif + Réception → facture immédiate de 480 € HT (576 € TTC) payée.
