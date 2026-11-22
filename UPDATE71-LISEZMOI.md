# Akno · update71 : chaîne devis → paiement + bas d'écran mobile

## En deux mots
Le parcours complet est maintenant guidé, écran par écran, avec un gros bouton qui dit quoi faire :
**Devis → Signé → Acompte → Chantier → Facturé → Payé**. Une frise en haut de chaque devis montre où on en est, et la prochaine étape est mise en avant (« Envoyez le devis au client », « Envoyez l'acompte », « Facturez le chantier », « Marquer comme payée »…).
On corrige aussi le bas d'écran coupé sur iPhone et l'aperçu de devis qui ne s'ouvrait pas depuis la liste Devis.

## ⚠️ Base de données : une migration à appliquer, sur « ok base » uniquement
`supabase/migrations/20261122_14_update71_chaine_devis_paiement.sql` n'a **pas** été lancée en prod. Elle est idempotente et a été testée sur un Postgres 17 local : 2 passes, 68 tests RLS OK, dont 7 nouveaux u71.
- `artisans.acompte_pct` (0–100, 30 par défaut) et `artisans.relances_auto` (envoi automatique des relances d'impayés, désactivé par défaut)
- `devis.ouvert_le` (date d'ouverture par le client) et `devis.parent_id` (avenants), plus des index
- statut de devis « perdu » (contrainte `NOT VALID`, donc les anciennes lignes ne sont pas revérifiées)
- index unique sur `factures.token`
- table `payment_accounts` (Stripe Connect) avec RLS : l'artisan lit seulement sa ligne, aucune écriture côté client, accès anon révoqué

Sans cette migration, l'app tient debout :
- l'acompte est fixé à 30 % ;
- l'avenant s'enregistre sans lien vers le devis d'origine ;
- un devis qui devrait passer « perdu » reste « sans réponse » ;
- les réglages Paiements affichent un message ;
- Connect est considéré comme non branché.

## Ce qui existait déjà, ce qui a été ajouté
| Étape | Avant (déjà en place) | Ajouté dans l'update71 |
|---|---|---|
| Devis | bibliothèque de prix, TVA 5,5/10/20, mentions légales, PDF | frise et carte « prochaine étape », vue « carte » mobile et bouton « Voir le PDF », **ouverture depuis la liste Devis corrigée** |
| Envoi | e-mail | SMS (`send_sms`), choix e-mail ou SMS dans l'aperçu, copie du lien de signature, suivi « ouvert le » |
| Signature | signature en ligne horodatée (journal de preuve SHA-256) | à la signature : facture d'acompte (30 % réglable) et chantier géolocalisé (BAN), sans doublon |
| Relances | J+3 et J+7 | devis « perdu » après 30 jours |
| Acompte | — | réglage du pourcentage (30/40/50/20/0 %), « Facturer directement, sans acompte » |
| Chantier | carte et agenda | avenant (nouveau devis lié au devis d'origine) |
| Facture | Factur-X, numérotation sans trou, avoir | facture de solde en un clic avec l'acompte déduit, facture de situation (% saisi sans pop-up), « Valider la facture » (verrouillage), boutons Envoyer, puis Marquer comme payée, SMS et lien de paiement |
| Paiement | — | page publique `/payer/:token` (montant, IBAN, BIC et référence avec boutons Copier). Stripe Connect est prêt mais coupé par un drapeau. |
| Impayés | — | relances J+1/J+7/J+15 et mise en demeure à J+30 (toujours à valider à la main), envoi automatique optionnel |
| Suivi | — | tuiles Signé / Encaissé / Reste à encaisser / Taux de signature, export CSV (Excel FR) et FEC (18 colonnes, art. A47 A-1) |

Toujours 12 fonctions Vercel : les ajouts passent dans `api/_lib/chain.ts`, `devis.ts`, `devis-public.ts`, `account.ts` et `stripe-webhook.ts`.

## Activer le paiement en ligne (Stripe Connect), plus tard
Le drapeau est coupé par défaut. Le client voit alors le virement, et l'artisan clique « Marquer comme payée ».
1. Dans le dashboard Stripe : activer Connect (comptes Express).
2. Créer un webhook Connect vers `https://<domaine>/api/stripe-webhook` avec l'événement `checkout.session.completed`.
3. Sur Vercel, définir :
   - `STRIPE_CONNECT_ENABLED=1`
   - `STRIPE_CONNECT_WEBHOOK_SECRET=whsec_…`
   - `VITE_STRIPE_CONNECT=1`

   Garder `STRIPE_SECRET_KEY`. Puis redéployer.
4. Il faut aussi la migration 14 (table `payment_accounts`). L'artisan active ensuite son compte dans Réglages → Paiements → Paiement en ligne.

## Bas d'écran coupé (iPhone)
- `src/index.css` :
  - variables centrales `--nav-h`, `--nav-gap`, `--page-bottom`, `--sheet-bottom` ;
  - classes `.pb-page` et `.pb-sheet` ;
  - `scroll-padding-bottom` ;
  - `--sheet-vh = var(--app-h)`, qui remplace 100lvh. C'est ce qui faisait passer les feuilles sous le bas de l'écran.
- `src/lib/mobile.ts` : mesure de `--app-h`. `env(safe-area-inset-bottom)` est remplacé par `var(--sab)` partout.
- Sur mobile, Réglages s'ouvre en fondu court au lieu d'un glissement. L'en-tête est un peu plus opaque.
- `store.ts` : il n'y a plus de second canal temps réel lors d'un double montage.

## Tests (WebKit iPhone)
| Suite | Résultat |
|---|---|
| `npx tsc -b` / `npm run build` | OK / OK |
| `npm run test:chaine` (calculs, frise, CSV/FEC, afterSign, Connect coupé, webhook, relances) | 59 ok, 0 échec |
| `npm run test:chaine-ui` (chaîne complète à 375 et 430, texte coupé, débordement) | 72 ok, 0 échec |
| `npm run test:bottom` (375/393/430, dont « liste Devis → aperçu du devis ») | 116 ok, 0 échec |
| `test:native` / `test:navbar` | 30/30 · 25/25 |
| `test:factures` (structure Factur-X / PDF/A-3) | 41/41 |
| `test:clients` / `equipe` / `chantiers` / `receptionist` / `twilio` | 57 · 47 · 38 · 33 · 22, aucun échec |
| `test:assistant` | 60/61. Le cas « déplace le RDV à demain 11h » dépend de la date (dimanche) et échoue de la même façon sur l'update70 : ce n'est pas une régression. |

Nouveaux scripts : `scripts/test-chaine.ts`, `scripts/test-chaine-ui.mjs`, `scripts/fixtures-chaine.mjs` et `scripts/shots-chaine.mjs`. La suite `scripts/test-bottom.mjs` a été complétée.

## Non vérifié
- Aucun vrai iPhone (WebKit seulement), vrai clavier ou geste réel.
- Aucun envoi réel par e-mail (Resend) ou SMS (Twilio), aucun vrai paiement Stripe.
- Base de prod : la migration 14 n'est pas appliquée.
- Le validateur Mustang n'est pas disponible sur la machine. Les fichiers Factur-X (`facturx.ts`, `facturePdf.ts`) n'ont pas été modifiés et `test:factures` passe toujours.
