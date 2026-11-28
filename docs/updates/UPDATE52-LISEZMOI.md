# Akno — update52 : devis pro + bibliothèque de prestations

## 1. Le bug « je crée le devis, il se supprime »
Cause : l'insertion du devis était refusée par Supabase (POST /rest/v1/devis → 400), mais l'erreur restait dans la console.
L'écran affichait le devis tout de suite (mise à jour optimiste), puis le rechargement automatique (toutes les 15 s ou en temps réel) remplaçait la liste par celle de la base, où le devis n'existait pas. Il « disparaissait ».
Deux refus possibles :
- `client_email` est NOT NULL en base, alors que l'app envoyait `null` quand l'e-mail n'était pas saisi (code 23502). C'est le cas vu dans les logs.
- La contrainte `devis_statut_check` n'accepte que les anciens statuts (brouillon/envoye/accepte/refuse…), alors que l'app écrit les nouveaux codes (env, val, ref, att…), code 23514.

Correctifs :
- `client_email` est toujours envoyé (chaîne vide si absent).
- En cas de 23514, l'écriture est rejouée avec le statut historique équivalent (front + api/).
- Toute écriture refusée affiche un message en français (toast rouge, et bandeau « Non enregistré · Réessayer » dans l'éditeur). Les saisies sont gardées sur l'appareil (localStorage, 14 jours) et proposées à la restauration.

## 2. Nouveautés
- **Bibliothèque « Mes prestations »**, accessible depuis la page Devis, Paramètres → Devis, et l'éditeur (Ctrl/⌘ K).
  - Types : main-d'œuvre à l'heure, fourniture (u, m², ml…) ou forfait.
  - Champs : durée par défaut, taux horaire (sinon celui des Paramètres), prix, TVA 5,5/10/20 et coût d'achat facultatif.
  - Création, modification, suppression et recherche. Un pack de prestations types par métier sert de point de départ.
- **Éditeur de devis plein écran**, desktop et mobile :
  - Client : contact existant ou saisie rapide. Saisie du chantier et de l'objet.
  - Lignes depuis la bibliothèque en un clic, ou lignes libres.
  - Heures × taux recalculés instantanément ; quantité × PU pour les fournitures.
  - Sections avec sous-total, glisser-déposer ou Alt+↑/↓.
  - Remise en % ou en €, TVA par taux, TTC et acompte en temps réel. Marge estimée.
  - Validité et conditions de paiement (tirées des Paramètres). Remarques. Contrôle des mentions légales.
  - Enregistrement automatique avec indicateur « Enregistré · hh:mm ».
  - Aperçu client et PDF.
  - « Enregistrer comme prestation » depuis une ligne. Raccourcis clavier.
- **Compatibilité :** le format des lignes est inchangé (`l,q,pu,u,tv` + champs optionnels). Les sections ont q = pu = 0 et la remise est une ligne négative par taux de TVA, donc Σ q×pu reste juste partout : envoi Resend, page d'acceptation publique, relances J+3/J+7, brouillons IA Grok, numérotation, création de facture.

## 3. Migrations à appliquer (dans l'ordre, non appliquées)
1. `supabase/migrations/20261117_06_update50_signup_trigger.sql` (déjà en attente depuis l'update50).
2. `supabase/migrations/20261118_07_update52_devis_prestations.sql` :
   - Valeur par défaut `''` pour `devis.client_email`.
   - Contrainte de statut élargie (anciens et nouveaux codes).
   - Table `prestations` avec RLS : chaque artisan ne voit et ne modifie que ses lignes.

Sans la 07 :
- La création des devis fonctionne quand même (correctif côté app).
- Les statuts passent par le repli historique.
- Les prestations sont stockées sur l'appareil, puis transférées automatiquement sur le compte dès que la table existe.

## 4. Vérifications
- `npm run build` OK ; `npm run test:assistant` 60/61 (comme avant).
- Cycle complet testé en prod, desktop et mobile :
  - Création d'une prestation, puis d'un devis avec cette prestation.
  - Modification des heures : 165 € → 220 €.
  - Enregistrement, rechargement : devis présent, 5 lignes restaurées.
  - Erreur simulée : message clair, rien ne disparaît.
- Captures : `akno-docs/update52-screens/`.
