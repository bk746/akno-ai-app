# Akno · update65 — Page Équipe (liste, fiche membre, ajout, accès à l'app)

**Une migration à appliquer vous-même** (non appliquée par l'agent) : `supabase/migrations/20261121_12_update65_equipe_acces.sql`.
Tant qu'elle n'est pas appliquée, la page Équipe fonctionne : e-mail, date d'entrée et accès à l'app sont simplement masqués
(un petit texte le signale dans le formulaire), et les enregistrements n'envoient pas ces colonnes.
Aucune nouvelle variable d'environnement, aucune nouvelle dépendance. Toujours **12 fonctions** dans `api/` (logique ajoutée dans `api/_lib/equipe.ts`).

## Migration 20261121_12 (idempotente, rejouable)
Ajoute à `employes` (ADD COLUMN IF NOT EXISTS) :
- `email` (format vérifié, 254 car. max), `hired_on` (date d'entrée),
- `access_role` `ouvrier | chef | admin` (NULL = pas d'accès), `invite_status` `pending | accepted`, `invited_at`, `invite_count` (≥ 0),
- contrainte : une invitation exige un rôle ; index partiel sur les invitations en attente.
RLS inchangée : les règles `employes_*_own` (update64) couvrent déjà ces colonnes. Tests RLS u65_* ajoutés (`supabase/tests/rls_test.sql`).

## Accès
- Bouton **+** → « Créer » : la tuile **Équipe** remplace « Note ». Route **/equipe** (onglet Chantiers allumé, comme la maquette).
- **Réglages → Équipe** ouvre la même page (retour « < Compte »). L'ancienne feuille Équipe des Réglages est remplacée.
- Ordinateur : entrée « Équipe » dans la barre latérale.

## Liste
Titre, bouton +, résumé Membres / Sur chantier (aujourd'hui) / Disponible(s), recherche (sans accents, nom ou métier),
groupes « Sur chantier aujourd'hui », « Disponibles », « Invitation en attente » avec compteurs, tri par ancienneté.
Ligne : photo ou initiales, « Julien D. », métier ; à droite point orange + chantier en cours, ou point bleu + prochain chantier et sa date (« Cuisine · 2 déc. »).
Invitation en attente : « Peintre · invité il y a 2 j » + bouton **Relancer** (renvoi du SMS). État vide avec bouton « Ajouter un membre ».

## Fiche membre
« < Équipe », « Modifier » ; photo, nom, « Poste · depuis AAAA », badge Sur chantier / Disponible / Invitation en attente.
**Appeler** (tel:), **Message** (sms:), **Email** (mailto:, grisé sans e-mail).
**Chantier en cours** (ou prochain) : vignette satellite Esri + repère orange, titre, « Ville · dates », barre + % ; toucher → la carte Chantiers s'ouvre sur ce chantier.
**Semaine prochaine** : Lun → Ven, date et client du jour (orange si en cours, bleu sinon ; un chantier d'un jour passe devant un long chantier).
**Infos** : téléphone, e-mail, date d'entrée, **Accès à l'app** (Ouvrier / Chef d'équipe / Admin / Aucun accès — donner un accès envoie l'invitation SMS).
**Modifier** : même formulaire prérempli + « Retirer de l'équipe » confirmé en rouge (le membre est aussi retiré de ses chantiers).

## Ajout
Feuille « Nouveau membre » : photo (bucket `equipe`), Prénom / Nom, métier en pastilles (Plombier, Électricien, Maçon, Carreleur, Peintre, Menuisier, Autre → champ libre),
Téléphone (vérifié et formaté « 06 41 22 87 15 ») / Email (optionnel), carte **Accès à l'app** (interrupteur vert, « Envoyer une invitation par SMS », Ouvrier / Chef d'équipe / Admin),
bouton « Ajouter à l'équipe ». Avec l'accès activé, le membre passe « Invitation en attente » et le SMS part.

## Invitation SMS — ce qu'il faut savoir
- Envoi réel par l'infrastructure SMS existante (`/api/account`, action `equipe_invite`, Twilio, quota SMS du forfait, journal `sms_log`, type `invite_equipe`).
  Expéditeur = nom de l'entreprise. Mobile 06/07 obligatoire. 3 envois max par membre et par jour.
- Si Twilio n'est pas configuré sur Vercel, le serveur répond « SMS non configurés » et l'app l'affiche (le membre reste « invitation en attente », on peut relancer plus tard).
- Le SMS contient le lien de l'app. **Il n'existe pas encore de compte « membre »** : le membre ne peut pas encore se connecter avec un rôle Ouvrier / Chef d'équipe ;
  le statut reste donc « en attente » jusqu'à une prochaine mise à jour (connexion des membres + acceptation).

## Liens avec le reste de l'app
- Carte Chantiers : photos/initiales de l'équipe sur la carte du bas et dans la fiche (inchangé, vérifié).
- Fiche client (Réglages → Clients) : nouvelle section **Chantiers et équipe** (statut, dates, photos de l'équipe) ; toucher → la carte s'ouvre sur le chantier.
- « Gérer l'équipe » du formulaire chantier utilise le même formulaire membre.

## Tests
`npm run test:equipe` (47), plus les suites existantes ; `node supabase/tests/run-local.mjs --twice` (RLS, dont u65_*).
