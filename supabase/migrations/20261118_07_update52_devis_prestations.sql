-- =====================================================================
-- update52 · Devis pro + bibliothèque de prestations
-- À appliquer APRÈS 20261117_06_update50_signup_trigger.sql.
-- Idempotent : peut être relancé sans risque.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Devis : colonnes et statuts alignés sur l'app
-- Cause du bug « je crée un devis, il se supprime » :
--   * client_email était NOT NULL sans valeur par défaut → tout devis créé
--     sans e-mail client était refusé (erreur 23502), puis disparaissait
--     au rechargement de la liste ;
--   * la contrainte devis_statut_check n'acceptait que brouillon / envoye /
--     accepte / refuse, alors que l'app et l'API écrivent aval, att, env,
--     val, ref, sans_reponse (envoi, acceptation publique, relances).
-- L'update52 contourne déjà les deux côté app (e-mail vide, statut de repli),
-- cette migration remet la base d'équerre.
-- ---------------------------------------------------------------------
ALTER TABLE public.devis ALTER COLUMN client_email SET DEFAULT '';
UPDATE public.devis SET client_email = '' WHERE client_email IS NULL;

ALTER TABLE public.devis DROP CONSTRAINT IF EXISTS devis_statut_check;
ALTER TABLE public.devis ADD CONSTRAINT devis_statut_check CHECK (statut = ANY (ARRAY[
  'brouillon', 'aval', 'att', 'env', 'val', 'ref', 'sans_reponse',
  -- anciennes valeurs, conservées pour compatibilité
  'envoye', 'accepte', 'refuse'
]));

-- ---------------------------------------------------------------------
-- 2. Bibliothèque de prestations (une par artisan)
--    type : 'mo' main-d'œuvre à l'heure · 'fo' fourniture (u, m², ml…) · 'fft' forfait
--    taux_horaire NULL = taux horaire des réglages (artisans.tarifs.tauxHoraire)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artisan_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.artisans(id) ON DELETE CASCADE,
  libelle text NOT NULL CHECK (char_length(btrim(libelle)) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  categorie text NOT NULL DEFAULT '' CHECK (char_length(categorie) <= 60),
  type text NOT NULL DEFAULT 'fo' CHECK (type IN ('mo', 'fo', 'fft')),
  unite text NOT NULL DEFAULT 'u' CHECK (char_length(unite) <= 12),
  duree_h numeric(8,2) CHECK (duree_h IS NULL OR duree_h >= 0),
  taux_horaire numeric(10,2) CHECK (taux_horaire IS NULL OR taux_horaire >= 0),
  prix_unitaire numeric(10,2) NOT NULL DEFAULT 0 CHECK (prix_unitaire >= 0),
  tva numeric(4,2) CHECK (tva IS NULL OR tva IN (0, 5.5, 10, 20)),
  cout_achat numeric(10,2) CHECK (cout_achat IS NULL OR cout_achat >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prestations_artisan_idx ON public.prestations (artisan_id, categorie, libelle);

ALTER TABLE public.prestations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prestations FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prestations TO authenticated;

DROP POLICY IF EXISTS prestations_select_own ON public.prestations;
DROP POLICY IF EXISTS prestations_insert_own ON public.prestations;
DROP POLICY IF EXISTS prestations_update_own ON public.prestations;
DROP POLICY IF EXISTS prestations_delete_own ON public.prestations;
CREATE POLICY prestations_select_own ON public.prestations FOR SELECT TO authenticated USING (artisan_id = (select auth.uid()));
CREATE POLICY prestations_insert_own ON public.prestations FOR INSERT TO authenticated WITH CHECK (artisan_id = (select auth.uid()));
CREATE POLICY prestations_update_own ON public.prestations FOR UPDATE TO authenticated USING (artisan_id = (select auth.uid())) WITH CHECK (artisan_id = (select auth.uid()));
CREATE POLICY prestations_delete_own ON public.prestations FOR DELETE TO authenticated USING (artisan_id = (select auth.uid()));

CREATE OR REPLACE FUNCTION public.prestations_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS prestations_touch ON public.prestations;
CREATE TRIGGER prestations_touch BEFORE UPDATE ON public.prestations FOR EACH ROW EXECUTE FUNCTION public.prestations_touch();

-- Rafraîchit le cache de schéma de l'API (la table est visible tout de suite)
NOTIFY pgrst, 'reload schema';
