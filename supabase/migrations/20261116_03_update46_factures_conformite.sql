-- =====================================================================
-- update46 · 3/5 : factures (numérotation légale continue), relances d'impayés
-- validées par l'artisan, dossier de conformité.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Factures
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.factures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artisan_id uuid NOT NULL REFERENCES public.artisans(id) ON DELETE CASCADE,
  devis_id uuid REFERENCES public.devis(id) ON DELETE SET NULL,
  numero text,                                  -- attribué à l'émission uniquement (F-AAAA-0001)
  type text NOT NULL DEFAULT 'facture',         -- facture | acompte | avoir
  statut text NOT NULL DEFAULT 'brouillon',     -- brouillon | emise | envoyee | payee | annulee
  client_nom text,
  client_email text,
  client_telephone text,
  client_adresse text,
  client_pro boolean NOT NULL DEFAULT false,
  client_siren text,
  client_tva text,
  adresse_chantier text,                        -- adresse de livraison / d'exécution
  objet text,
  nature text NOT NULL DEFAULT 'services',      -- services | biens | mixte
  lignes jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_ht numeric NOT NULL DEFAULT 0,
  total_tva numeric NOT NULL DEFAULT 0,
  total_ttc numeric NOT NULL DEFAULT 0,
  acompte_deduit numeric NOT NULL DEFAULT 0,
  tva_sur_debits boolean NOT NULL DEFAULT false,
  autoliquidation boolean NOT NULL DEFAULT false,
  delai_paiement_jours int NOT NULL DEFAULT 30,
  date_emission date,
  date_execution date,
  date_echeance date,
  facture_origine_id uuid REFERENCES public.factures(id) ON DELETE SET NULL,  -- pour un avoir
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  envoyee_le timestamptz,
  payee_le timestamptz,
  mode_paiement text,
  relances_off boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS factures_numero_uidx ON public.factures (artisan_id, numero) WHERE numero IS NOT NULL;
CREATE INDEX IF NOT EXISTS factures_artisan_idx ON public.factures (artisan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS factures_echeance_idx ON public.factures (statut, date_echeance);

ALTER TABLE public.factures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS factures_select_own ON public.factures;
DROP POLICY IF EXISTS factures_insert_own ON public.factures;
DROP POLICY IF EXISTS factures_update_own ON public.factures;
DROP POLICY IF EXISTS factures_delete_own ON public.factures;
CREATE POLICY factures_select_own ON public.factures FOR SELECT TO authenticated USING (artisan_id = auth.uid());
-- création : uniquement en brouillon, sans numéro
CREATE POLICY factures_insert_own ON public.factures FOR INSERT TO authenticated WITH CHECK (artisan_id = auth.uid() AND numero IS NULL AND statut = 'brouillon');
CREATE POLICY factures_update_own ON public.factures FOR UPDATE TO authenticated USING (artisan_id = auth.uid()) WITH CHECK (artisan_id = auth.uid());
-- suppression : seulement un brouillon (une facture émise ne se supprime pas, on fait un avoir)
CREATE POLICY factures_delete_own ON public.factures FOR DELETE TO authenticated USING (artisan_id = auth.uid() AND numero IS NULL);
REVOKE ALL ON public.factures FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.factures TO authenticated;

-- Une facture émise est figée : seuls statut / envoi / paiement / relances peuvent encore bouger.
CREATE OR REPLACE FUNCTION public.factures_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  IF OLD.numero IS NOT NULL THEN
    IF NEW.numero IS DISTINCT FROM OLD.numero
      OR NEW.lignes IS DISTINCT FROM OLD.lignes
      OR NEW.total_ht IS DISTINCT FROM OLD.total_ht
      OR NEW.total_tva IS DISTINCT FROM OLD.total_tva
      OR NEW.total_ttc IS DISTINCT FROM OLD.total_ttc
      OR NEW.client_nom IS DISTINCT FROM OLD.client_nom
      OR NEW.client_adresse IS DISTINCT FROM OLD.client_adresse
      OR NEW.client_siren IS DISTINCT FROM OLD.client_siren
      OR NEW.date_emission IS DISTINCT FROM OLD.date_emission
      OR NEW.type IS DISTINCT FROM OLD.type
      OR NEW.artisan_id IS DISTINCT FROM OLD.artisan_id THEN
      RAISE EXCEPTION 'Facture % émise : elle ne peut plus être modifiée (faites un avoir).', OLD.numero;
    END IF;
    IF NEW.statut = 'brouillon' THEN
      RAISE EXCEPTION 'Une facture émise ne peut pas redevenir un brouillon.';
    END IF;
  ELSIF NEW.numero IS NOT NULL AND coalesce(auth.role(), '') = 'authenticated' AND current_setting('akno.emission', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Le numéro de facture est attribué par emettre_facture().';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS factures_guard ON public.factures;
CREATE TRIGGER factures_guard BEFORE UPDATE ON public.factures FOR EACH ROW EXECUTE FUNCTION public.factures_guard();

-- Émission : attribue le numéro suivant, sans trou, dans la même transaction.
CREATE OR REPLACE FUNCTION public.emettre_facture(p_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); f factures%ROWTYPE; y int; v int; num text; today date := (now() AT TIME ZONE 'Europe/Paris')::date;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO f FROM factures WHERE id = p_id AND artisan_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Facture introuvable.'; END IF;
  IF f.numero IS NOT NULL THEN RETURN f.numero; END IF;
  IF jsonb_array_length(coalesce(f.lignes, '[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'La facture ne contient aucune ligne.'; END IF;
  IF coalesce(trim(f.client_nom), '') = '' THEN RAISE EXCEPTION 'Le nom du client est obligatoire.'; END IF;
  y := extract(year FROM today)::int;
  INSERT INTO artisan_counters (artisan_id, kind, year, value) VALUES (uid, 'facture', y, 0) ON CONFLICT DO NOTHING;
  UPDATE artisan_counters SET value = value + 1 WHERE artisan_id = uid AND kind = 'facture' AND year = y RETURNING value INTO v;
  num := CASE WHEN f.type = 'avoir' THEN 'A-' ELSE 'F-' END || y || '-' || lpad(v::text, 4, '0');
  PERFORM set_config('akno.emission', 'on', true);
  UPDATE factures SET numero = num, statut = 'emise', date_emission = today,
    date_execution = coalesce(date_execution, today),
    date_echeance = today + coalesce(delai_paiement_jours, 30)
  WHERE id = p_id;
  PERFORM set_config('akno.emission', 'off', true);
  RETURN num;
END $$;
REVOKE ALL ON FUNCTION public.emettre_facture(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.emettre_facture(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 2. Relances d'impayés : préparées par le cron, VALIDÉES par l'artisan avant envoi
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.facture_relances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artisan_id uuid NOT NULL REFERENCES public.artisans(id) ON DELETE CASCADE,
  facture_id uuid NOT NULL REFERENCES public.factures(id) ON DELETE CASCADE,
  niveau int NOT NULL,                          -- 1 rappel · 2 relance · 3 relance ferme · 4 mise en demeure
  statut text NOT NULL DEFAULT 'a_valider',     -- a_valider | envoyee | ignoree
  canal text NOT NULL DEFAULT 'E-mail',
  sujet text,
  corps text,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (facture_id, niveau)
);
ALTER TABLE public.facture_relances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS facture_relances_select_own ON public.facture_relances;
DROP POLICY IF EXISTS facture_relances_update_own ON public.facture_relances;
CREATE POLICY facture_relances_select_own ON public.facture_relances FOR SELECT TO authenticated USING (artisan_id = auth.uid());
-- l'artisan peut ajuster le texte ou ignorer ; l'envoi passe par /api/devis (action facture_relance_send)
CREATE POLICY facture_relances_update_own ON public.facture_relances FOR UPDATE TO authenticated USING (artisan_id = auth.uid()) WITH CHECK (artisan_id = auth.uid());
REVOKE ALL ON public.facture_relances FROM anon;
GRANT SELECT, UPDATE ON public.facture_relances TO authenticated;

-- ---------------------------------------------------------------------
-- 3. Dossier de conformité
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.documents_conformite (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artisan_id uuid NOT NULL REFERENCES public.artisans(id) ON DELETE CASCADE,
  type text NOT NULL,                           -- urssaf | kbis | decennale | rc_pro | rge | qualibat | fiscale | autre
  libelle text,
  file_path text,                               -- bucket « conformite », dossier {uid}/
  date_emission date,
  date_expiration date,
  alerte_j30_le timestamptz,
  alerte_j7_le timestamptz,
  alerte_expire_le timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_conformite_artisan_idx ON public.documents_conformite (artisan_id, type);
CREATE INDEX IF NOT EXISTS documents_conformite_exp_idx ON public.documents_conformite (date_expiration);
ALTER TABLE public.documents_conformite ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'documents_conformite' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.documents_conformite', p.policyname);
  END LOOP;
END $$;
CREATE POLICY documents_conformite_select_own ON public.documents_conformite FOR SELECT TO authenticated USING (artisan_id = auth.uid());
CREATE POLICY documents_conformite_insert_own ON public.documents_conformite FOR INSERT TO authenticated WITH CHECK (artisan_id = auth.uid());
CREATE POLICY documents_conformite_update_own ON public.documents_conformite FOR UPDATE TO authenticated USING (artisan_id = auth.uid()) WITH CHECK (artisan_id = auth.uid());
CREATE POLICY documents_conformite_delete_own ON public.documents_conformite FOR DELETE TO authenticated USING (artisan_id = auth.uid());
REVOKE ALL ON public.documents_conformite FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents_conformite TO authenticated;

-- délai de paiement par défaut des factures (jours)
ALTER TABLE public.artisans ADD COLUMN IF NOT EXISTS delai_paiement_jours int NOT NULL DEFAULT 30;

-- lien de partage du dossier pour les donneurs d'ordre (null = pas de partage)
ALTER TABLE public.artisans ADD COLUMN IF NOT EXISTS dossier_token uuid;
CREATE UNIQUE INDEX IF NOT EXISTS artisans_dossier_token_uidx ON public.artisans (dossier_token) WHERE dossier_token IS NOT NULL;

DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['factures','facture_relances','documents_conformite'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;
