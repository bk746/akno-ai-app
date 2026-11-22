-- update78 · Agenda complet + comptes employés (rôles patron / employé) + RLS.
-- Idempotente. À n'appliquer qu'après le « ok base » de Keryan. Ne pas lancer depuis le zip tout seul.

-- ---------------------------------------------------------------------
-- 1. Artisan : lien de réservation public, option SMS agenda
-- ---------------------------------------------------------------------
ALTER TABLE public.artisans ADD COLUMN IF NOT EXISTS booking_token uuid DEFAULT gen_random_uuid();
ALTER TABLE public.artisans ADD COLUMN IF NOT EXISTS booking_on boolean NOT NULL DEFAULT true;
ALTER TABLE public.artisans ADD COLUMN IF NOT EXISTS agenda_sms boolean NOT NULL DEFAULT true;
UPDATE public.artisans SET booking_token = gen_random_uuid() WHERE booking_token IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS artisans_booking_token_uidx ON public.artisans (booking_token) WHERE booking_token IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2. Employés : compte Auth, invitation e-mail (token)
-- ---------------------------------------------------------------------
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS invite_token text UNIQUE;
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS invite_expires_at timestamptz;
CREATE INDEX IF NOT EXISTS employes_user_idx ON public.employes (user_id) WHERE user_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 3. Rendez-vous : types, liens, assignation, terrain, récurrence, SMS
-- ---------------------------------------------------------------------
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS kind text,
  ADD COLUMN IF NOT EXISTS absence_kind text,
  ADD COLUMN IF NOT EXISTS client_id uuid,
  ADD COLUMN IF NOT EXISTS devis_id uuid,
  ADD COLUMN IF NOT EXISTS facture_id uuid,
  ADD COLUMN IF NOT EXISTS chantier_id uuid,
  ADD COLUMN IF NOT EXISTS employe_id uuid,
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS parent_id uuid,
  ADD COLUMN IF NOT EXISTS rrule text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS arrived_at timestamptz,
  ADD COLUMN IF NOT EXISTS departed_at timestamptz,
  ADD COLUMN IF NOT EXISTS travel_minutes integer,
  ADD COLUMN IF NOT EXISTS notes_terrain text,
  ADD COLUMN IF NOT EXISTS signature_png text,
  ADD COLUMN IF NOT EXISTS photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sms_confirm_at timestamptz,
  ADD COLUMN IF NOT EXISTS sms_on_the_way_at timestamptz,
  ADD COLUMN IF NOT EXISTS booking_source text;

UPDATE public.appointments SET kind = 'rdv' WHERE kind IS NULL;
UPDATE public.appointments SET status = 'prevu' WHERE status IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_kind_chk') THEN
    ALTER TABLE public.appointments ADD CONSTRAINT appointments_kind_chk
      CHECK (kind IS NULL OR kind IN ('chantier', 'rdv', 'visite', 'sav', 'urgence', 'absence'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_absence_chk') THEN
    ALTER TABLE public.appointments ADD CONSTRAINT appointments_absence_chk
      CHECK (absence_kind IS NULL OR absence_kind IN ('conges', 'maladie', 'formation'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_status_chk') THEN
    ALTER TABLE public.appointments ADD CONSTRAINT appointments_status_chk
      CHECK (status IS NULL OR status IN ('prevu', 'en_route', 'arrive', 'termine', 'annule'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_employe_fk') THEN
    ALTER TABLE public.appointments ADD CONSTRAINT appointments_employe_fk FOREIGN KEY (employe_id) REFERENCES public.employes(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_chantier_fk') THEN
    ALTER TABLE public.appointments ADD CONSTRAINT appointments_chantier_fk FOREIGN KEY (chantier_id) REFERENCES public.chantiers(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_devis_fk') THEN
    ALTER TABLE public.appointments ADD CONSTRAINT appointments_devis_fk FOREIGN KEY (devis_id) REFERENCES public.devis(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_facture_fk') THEN
    ALTER TABLE public.appointments ADD CONSTRAINT appointments_facture_fk FOREIGN KEY (facture_id) REFERENCES public.factures(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_parent_fk') THEN
    ALTER TABLE public.appointments ADD CONSTRAINT appointments_parent_fk FOREIGN KEY (parent_id) REFERENCES public.appointments(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS appointments_employe_start_idx ON public.appointments (employe_id, start) WHERE employe_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS appointments_chantier_idx ON public.appointments (chantier_id) WHERE chantier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS appointments_kind_idx ON public.appointments (artisan_id, kind, start);

-- ---------------------------------------------------------------------
-- 4. Helpers RLS : patron (fiche artisans) vs employé (employes.user_id)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.akno_is_patron()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.artisans a WHERE a.id = auth.uid());
$$;
CREATE OR REPLACE FUNCTION public.akno_my_employe_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id FROM public.employes e WHERE e.user_id = auth.uid() LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION public.akno_my_artisan_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT a.id FROM public.artisans a WHERE a.id = auth.uid()),
    (SELECT e.artisan_id FROM public.employes e WHERE e.user_id = auth.uid() LIMIT 1)
  );
$$;
REVOKE ALL ON FUNCTION public.akno_is_patron() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.akno_my_employe_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.akno_my_artisan_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.akno_is_patron() TO authenticated;
GRANT EXECUTE ON FUNCTION public.akno_my_employe_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.akno_my_artisan_id() TO authenticated;

-- Un employé ne peut modifier que le pointage, les notes, photos et la signature (pas les horaires ni l'affectation).
CREATE OR REPLACE FUNCTION public.appointments_employe_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF public.akno_is_patron() THEN RETURN NEW; END IF;
  IF public.akno_my_employe_id() IS NULL THEN RETURN NEW; END IF;
  IF NEW.artisan_id IS DISTINCT FROM OLD.artisan_id
     OR NEW.start IS DISTINCT FROM OLD.start
     OR NEW."end" IS DISTINCT FROM OLD."end"
     OR NEW.employe_id IS DISTINCT FROM OLD.employe_id
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.devis_id IS DISTINCT FROM OLD.devis_id
     OR NEW.facture_id IS DISTINCT FROM OLD.facture_id
     OR NEW.chantier_id IS DISTINCT FROM OLD.chantier_id
     OR NEW.rrule IS DISTINCT FROM OLD.rrule
     OR NEW.client IS DISTINCT FROM OLD.client
     OR NEW.title IS DISTINCT FROM OLD.title
  THEN
    RAISE EXCEPTION 'Un employé ne peut modifier que le suivi de son intervention.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS appointments_employe_guard ON public.appointments;
CREATE TRIGGER appointments_employe_guard BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.appointments_employe_guard();

-- ---------------------------------------------------------------------
-- 5. Policies : l'employé ne voit que ses interventions / son équipe
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS appointments_select_own ON public.appointments;
DROP POLICY IF EXISTS appointments_insert_own ON public.appointments;
DROP POLICY IF EXISTS appointments_update_own ON public.appointments;
DROP POLICY IF EXISTS appointments_delete_own ON public.appointments;
CREATE POLICY appointments_select_own ON public.appointments FOR SELECT TO authenticated
  USING (artisan_id = auth.uid() OR employe_id = public.akno_my_employe_id());
CREATE POLICY appointments_insert_own ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (artisan_id = auth.uid());
CREATE POLICY appointments_update_own ON public.appointments FOR UPDATE TO authenticated
  USING (artisan_id = auth.uid() OR employe_id = public.akno_my_employe_id())
  WITH CHECK (artisan_id = auth.uid() OR employe_id = public.akno_my_employe_id());
CREATE POLICY appointments_delete_own ON public.appointments FOR DELETE TO authenticated
  USING (artisan_id = auth.uid());

DROP POLICY IF EXISTS employes_select_own ON public.employes;
CREATE POLICY employes_select_own ON public.employes FOR SELECT TO authenticated
  USING (artisan_id = auth.uid() OR user_id = auth.uid());
-- insert/update/delete restent artisan_id = auth.uid() (déjà créées en update64)

DROP POLICY IF EXISTS chantiers_select_own ON public.chantiers;
CREATE POLICY chantiers_select_own ON public.chantiers FOR SELECT TO authenticated
  USING (
    artisan_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.chantier_employes ce WHERE ce.chantier_id = chantiers.id AND ce.employe_id = public.akno_my_employe_id())
    OR EXISTS (SELECT 1 FROM public.appointments ap WHERE ap.chantier_id = chantiers.id AND ap.employe_id = public.akno_my_employe_id())
  );

DROP POLICY IF EXISTS chantier_employes_select_own ON public.chantier_employes;
CREATE POLICY chantier_employes_select_own ON public.chantier_employes FOR SELECT TO authenticated
  USING (artisan_id = auth.uid() OR employe_id = public.akno_my_employe_id() OR artisan_id = public.akno_my_artisan_id());

-- Photos d'intervention (bucket privé)
INSERT INTO storage.buckets (id, name, public) VALUES ('agenda', 'agenda', false) ON CONFLICT (id) DO UPDATE SET public = false;
DROP POLICY IF EXISTS agenda_own_select ON storage.objects;
DROP POLICY IF EXISTS agenda_own_insert ON storage.objects;
DROP POLICY IF EXISTS agenda_own_update ON storage.objects;
DROP POLICY IF EXISTS agenda_own_delete ON storage.objects;
CREATE POLICY agenda_own_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'agenda' AND ((storage.foldername(name))[1] = auth.uid()::text OR (storage.foldername(name))[1] = public.akno_my_artisan_id()::text));
CREATE POLICY agenda_own_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'agenda' AND ((storage.foldername(name))[1] = auth.uid()::text OR (storage.foldername(name))[1] = public.akno_my_artisan_id()::text));
CREATE POLICY agenda_own_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'agenda' AND ((storage.foldername(name))[1] = auth.uid()::text OR (storage.foldername(name))[1] = public.akno_my_artisan_id()::text));
CREATE POLICY agenda_own_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'agenda' AND (storage.foldername(name))[1] = auth.uid()::text);

COMMENT ON COLUMN public.appointments.kind IS 'update78 · chantier | rdv | visite | sav | urgence | absence';
COMMENT ON COLUMN public.employes.user_id IS 'update78 · compte Auth de l''employé (rôle employé) ; NULL tant que l''invitation n''est pas acceptée';
COMMENT ON COLUMN public.artisans.booking_token IS 'update78 · jeton du lien de réservation public /reserver/:token';
