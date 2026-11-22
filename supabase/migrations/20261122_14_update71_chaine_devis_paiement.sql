-- =====================================================================
-- update71 · Chaîne devis → acompte → chantier → facture → encaissement
-- À appliquer APRÈS 20261121_13. Idempotent (ré-exécutable). NON exécuté en production par Akno :
-- à lancer par Keryan dans Supabase → SQL Editor après relecture (« ok base »).
-- Tant qu'il n'est pas appliqué, l'app fonctionne comme en update70 :
--   acompte 30 % fixe, relances d'impayés toutes « à valider », pas de statut « Ouvert » ni « Perdu »,
--   pas d'avenant lié, paiement en ligne masqué (le virement reste proposé).
-- =====================================================================

-- 1. Réglages de l'artisan --------------------------------------------
ALTER TABLE public.artisans
  ADD COLUMN IF NOT EXISTS acompte_pct numeric NOT NULL DEFAULT 30,      -- acompte demandé à la signature (0 = aucun)
  ADD COLUMN IF NOT EXISTS relances_auto boolean NOT NULL DEFAULT true;  -- relances d'impayés J+1/J+7/J+15 envoyées seules
DO $$ BEGIN
  ALTER TABLE public.artisans ADD CONSTRAINT artisans_acompte_pct_check CHECK (acompte_pct >= 0 AND acompte_pct <= 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Devis : ouverture par le client, avenant, statut « perdu » ------------
ALTER TABLE public.devis
  ADD COLUMN IF NOT EXISTS ouvert_le timestamptz,                                          -- 1re ouverture du lien par le client
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.devis(id) ON DELETE SET NULL;  -- avenant / devis complémentaire
CREATE INDEX IF NOT EXISTS devis_parent_idx ON public.devis (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS devis_envoye_sweep_idx ON public.devis (statut, envoye_le) WHERE statut IN ('env', 'envoye', 'sans_reponse');

ALTER TABLE public.devis DROP CONSTRAINT IF EXISTS devis_statut_check;
ALTER TABLE public.devis ADD CONSTRAINT devis_statut_check CHECK (statut = ANY (ARRAY[
  'brouillon', 'aval', 'att', 'env', 'val', 'ref', 'sans_reponse', 'perdu',
  'envoye', 'accepte', 'refuse'   -- anciennes valeurs, conservées pour compatibilité
])) NOT VALID; -- NOT VALID : les lignes existantes ne sont pas re-contrôlées (aucun risque d'échec sur une valeur historique)

-- 3. Factures : lien public de paiement (/payer/<token>) -----------------
CREATE UNIQUE INDEX IF NOT EXISTS factures_token_uidx ON public.factures (token);

-- 4. Stripe Connect : compte d'encaissement de chaque artisan ---------------
--    Lecture seule pour l'artisan ; écritures uniquement par le serveur (clé service_role).
CREATE TABLE IF NOT EXISTS public.payment_accounts (
  artisan_id uuid PRIMARY KEY REFERENCES public.artisans(id) ON DELETE CASCADE,
  stripe_account_id text NOT NULL UNIQUE CHECK (stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
  charges_enabled boolean NOT NULL DEFAULT false,
  details_submitted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_accounts_select_own ON public.payment_accounts;
CREATE POLICY payment_accounts_select_own ON public.payment_accounts FOR SELECT TO authenticated USING (artisan_id = auth.uid());
REVOKE ALL ON public.payment_accounts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.payment_accounts FROM authenticated;
GRANT SELECT ON public.payment_accounts TO authenticated;
