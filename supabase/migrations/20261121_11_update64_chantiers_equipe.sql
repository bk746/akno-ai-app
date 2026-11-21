-- update64 · Chantiers (carte) + Équipe (employés) + affectations.
-- À appliquer par Keryan (SQL Editor Supabase) — idempotent : peut être relancé sans risque.
-- Tables : employes, chantiers, chantier_employes · RLS par artisan · index · updated_at automatique · bucket privé « equipe » (photos).

-- ---------------------------------------------------------------------
-- 0. updated_at automatique
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.akno_touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- ---------------------------------------------------------------------
-- 1. Employés (équipe de l'artisan)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artisan_id uuid NOT NULL REFERENCES public.artisans(id) ON DELETE CASCADE,
  first_name text NOT NULL CHECK (length(trim(first_name)) BETWEEN 1 AND 80),
  last_name text CHECK (last_name IS NULL OR length(last_name) <= 80),
  role text CHECK (role IS NULL OR length(role) <= 80),
  phone text CHECK (phone IS NULL OR length(phone) <= 30),
  photo_path text,                                   -- bucket « equipe », dossier {artisan_id}/…
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employes_artisan_idx ON public.employes (artisan_id, first_name);

-- ---------------------------------------------------------------------
-- 2. Chantiers
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chantiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artisan_id uuid NOT NULL REFERENCES public.artisans(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  client_id text,                                    -- clé de la fiche client (client_fiches.cle), facultative
  client_nom text,                                   -- copie lisible (client venant d'un appel, d'un devis…)
  client_telephone text,
  address text,
  lat double precision CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
  lng double precision CHECK (lng IS NULL OR lng BETWEEN -180 AND 180),
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'in_progress', 'done')),
  progress_override smallint CHECK (progress_override IS NULL OR progress_override BETWEEN 0 AND 100),
  notes text CHECK (notes IS NULL OR length(notes) <= 5000),
  devis_id uuid REFERENCES public.devis(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chantiers_dates_ok CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS chantiers_artisan_status_idx ON public.chantiers (artisan_id, status);
CREATE INDEX IF NOT EXISTS chantiers_artisan_start_idx ON public.chantiers (artisan_id, start_date);
CREATE INDEX IF NOT EXISTS chantiers_devis_idx ON public.chantiers (devis_id) WHERE devis_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 3. Affectations chantier ↔ employé
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chantier_employes (
  chantier_id uuid NOT NULL REFERENCES public.chantiers(id) ON DELETE CASCADE,
  employe_id uuid NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  artisan_id uuid NOT NULL REFERENCES public.artisans(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chantier_id, employe_id)
);
CREATE INDEX IF NOT EXISTS chantier_employes_employe_idx ON public.chantier_employes (employe_id);
CREATE INDEX IF NOT EXISTS chantier_employes_artisan_idx ON public.chantier_employes (artisan_id);

DROP TRIGGER IF EXISTS employes_touch ON public.employes;
CREATE TRIGGER employes_touch BEFORE UPDATE ON public.employes FOR EACH ROW EXECUTE FUNCTION public.akno_touch_updated_at();
DROP TRIGGER IF EXISTS chantiers_touch ON public.chantiers;
CREATE TRIGGER chantiers_touch BEFORE UPDATE ON public.chantiers FOR EACH ROW EXECUTE FUNCTION public.akno_touch_updated_at();

-- ---------------------------------------------------------------------
-- 4. RLS : chaque artisan ne voit et ne modifie que ses lignes
-- ---------------------------------------------------------------------
ALTER TABLE public.employes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chantiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chantier_employes ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['employes','chantiers'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_own', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert_own', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update_own', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete_own', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (artisan_id = auth.uid())', t || '_select_own', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (artisan_id = auth.uid())', t || '_insert_own', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (artisan_id = auth.uid()) WITH CHECK (artisan_id = auth.uid())', t || '_update_own', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (artisan_id = auth.uid())', t || '_delete_own', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;
-- un devis lié doit appartenir au même artisan
DROP POLICY IF EXISTS chantiers_insert_own ON public.chantiers;
DROP POLICY IF EXISTS chantiers_update_own ON public.chantiers;
CREATE POLICY chantiers_insert_own ON public.chantiers FOR INSERT TO authenticated WITH CHECK (artisan_id = auth.uid() AND (devis_id IS NULL OR EXISTS (SELECT 1 FROM public.devis d WHERE d.id = devis_id AND d.artisan_id = auth.uid())));
CREATE POLICY chantiers_update_own ON public.chantiers FOR UPDATE TO authenticated USING (artisan_id = auth.uid()) WITH CHECK (artisan_id = auth.uid() AND (devis_id IS NULL OR EXISTS (SELECT 1 FROM public.devis d WHERE d.id = devis_id AND d.artisan_id = auth.uid())));

-- affectations : le chantier ET l'employé doivent appartenir à l'artisan
DROP POLICY IF EXISTS chantier_employes_select_own ON public.chantier_employes;
DROP POLICY IF EXISTS chantier_employes_insert_own ON public.chantier_employes;
DROP POLICY IF EXISTS chantier_employes_delete_own ON public.chantier_employes;
CREATE POLICY chantier_employes_select_own ON public.chantier_employes FOR SELECT TO authenticated USING (artisan_id = auth.uid());
CREATE POLICY chantier_employes_insert_own ON public.chantier_employes FOR INSERT TO authenticated WITH CHECK (
  artisan_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.chantiers c WHERE c.id = chantier_id AND c.artisan_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.employes e WHERE e.id = employe_id AND e.artisan_id = auth.uid()));
CREATE POLICY chantier_employes_delete_own ON public.chantier_employes FOR DELETE TO authenticated USING (artisan_id = auth.uid());
REVOKE ALL ON public.chantier_employes FROM anon;
GRANT SELECT, INSERT, DELETE ON public.chantier_employes TO authenticated;

-- ---------------------------------------------------------------------
-- 5. Photos de l'équipe : bucket privé « equipe » (dossier {uid}/…)
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public) VALUES ('equipe', 'equipe', false) ON CONFLICT (id) DO UPDATE SET public = false;
DROP POLICY IF EXISTS equipe_own_select ON storage.objects;
DROP POLICY IF EXISTS equipe_own_insert ON storage.objects;
DROP POLICY IF EXISTS equipe_own_update ON storage.objects;
DROP POLICY IF EXISTS equipe_own_delete ON storage.objects;
CREATE POLICY equipe_own_select ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'equipe' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY equipe_own_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'equipe' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY equipe_own_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'equipe' AND (storage.foldername(name))[1] = auth.uid()::text) WITH CHECK (bucket_id = 'equipe' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY equipe_own_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'equipe' AND (storage.foldername(name))[1] = auth.uid()::text);
