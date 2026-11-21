-- =====================================================================
-- update61 · Factures électroniques, signature électronique des devis,
-- modèles de devis, personnalisation, fiches clients (notes).
-- Idempotent (IF NOT EXISTS / CREATE OR REPLACE). RLS sur toutes les nouvelles tables.
-- À appliquer en production UNIQUEMENT après validation (« ok base »).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Réglages artisan : virement, option TVA sur les débits, personnalisation des documents
-- ---------------------------------------------------------------------
ALTER TABLE public.artisans
  ADD COLUMN IF NOT EXISTS bic text,
  ADD COLUMN IF NOT EXISTS tva_sur_debits boolean NOT NULL DEFAULT false,   -- mention 11° bis art. 242 nonies A
  ADD COLUMN IF NOT EXISTS devis_couleur text,                              -- couleur d'accent des PDF (#RRGGBB)
  ADD COLUMN IF NOT EXISTS devis_pied text;                                 -- pied de page personnalisé

-- ---------------------------------------------------------------------
-- 2. Devis : signature électronique (preuve) et verrouillage après signature
-- ---------------------------------------------------------------------
ALTER TABLE public.devis
  ADD COLUMN IF NOT EXISTS signature_png text,          -- signature tracée (data URL PNG, 200 Ko max)
  ADD COLUMN IF NOT EXISTS signe_le timestamptz,
  ADD COLUMN IF NOT EXISTS document_hash text,          -- SHA-256 du contenu exact accepté
  ADD COLUMN IF NOT EXISTS certifie_tva_reduite boolean; -- le client a certifié les conditions du taux réduit (10 % / 5,5 %)

-- Une fois signé, le contenu du devis et la preuve sont figés : toute tentative de modification est
-- ignorée (valeurs d'origine conservées) afin que l'app puisse toujours changer le statut, les relances…
CREATE OR REPLACE FUNCTION public.devis_signed_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.signe_le IS NOT NULL THEN
    NEW.lignes := OLD.lignes;
    NEW.total_ht := OLD.total_ht;
    NEW.total_ttc := OLD.total_ttc;
    NEW.tva_taux := OLD.tva_taux;
    NEW.client_nom := OLD.client_nom;
    NEW.objet := OLD.objet;
    NEW.numero := OLD.numero;
    NEW.signature_png := OLD.signature_png;
    NEW.signe_le := OLD.signe_le;
    NEW.document_hash := OLD.document_hash;
    NEW.certifie_tva_reduite := OLD.certifie_tva_reduite;
    NEW.accepte_nom := OLD.accepte_nom;
    NEW.accepte_ip := OLD.accepte_ip;
    NEW.accepte_ua := OLD.accepte_ua;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS devis_signed_guard ON public.devis;
CREATE TRIGGER devis_signed_guard BEFORE UPDATE ON public.devis FOR EACH ROW EXECUTE FUNCTION public.devis_signed_guard();

-- Journal de preuve (piste d'audit) : append-only, chaîné par empreinte. Écrit uniquement par le serveur.
CREATE TABLE IF NOT EXISTS public.signature_events (
  id bigserial PRIMARY KEY,
  artisan_id uuid NOT NULL REFERENCES public.artisans(id) ON DELETE CASCADE,
  devis_id uuid NOT NULL REFERENCES public.devis(id) ON DELETE CASCADE,
  event text NOT NULL,                 -- envoi | ouverture | consentement | signature | refus
  at timestamptz NOT NULL DEFAULT now(),
  ip text,
  ua text,
  signataire text,
  document_hash text,                  -- SHA-256 du devis au moment de l'événement
  prev_hash text,                      -- empreinte de l'événement précédent (chaînage)
  event_hash text NOT NULL,            -- SHA-256 du JSON canonique de l'entrée (event, at, ip, ua, signataire, document_hash, data, prev_hash)
  data jsonb
);
CREATE INDEX IF NOT EXISTS signature_events_devis_idx ON public.signature_events (devis_id, id);
ALTER TABLE public.signature_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS signature_events_select_own ON public.signature_events;
CREATE POLICY signature_events_select_own ON public.signature_events FOR SELECT TO authenticated USING (artisan_id = auth.uid());
REVOKE ALL ON public.signature_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.signature_events FROM authenticated;
GRANT SELECT ON public.signature_events TO authenticated;

-- Seule exception : la suppression en cascade d'un devis NON signé (ex. brouillon envoyé puis supprimé par l'artisan).
-- Un devis signé, lui, ne peut pas être supprimé (trigger devis_no_delete_signed ci-dessous).
CREATE OR REPLACE FUNCTION public.signature_events_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.devis d WHERE d.id = OLD.devis_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Le journal de signature est en ajout seul.';
END $$;
DROP TRIGGER IF EXISTS signature_events_no_update ON public.signature_events;
CREATE TRIGGER signature_events_no_update BEFORE UPDATE OR DELETE ON public.signature_events FOR EACH ROW
  WHEN (current_setting('akno.purge', true) IS DISTINCT FROM 'on') EXECUTE FUNCTION public.signature_events_append_only();

-- Un devis signé électroniquement est une preuve : il ne se supprime pas.
CREATE OR REPLACE FUNCTION public.devis_no_delete_signed()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.signe_le IS NOT NULL AND current_setting('akno.purge', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Devis % signé électroniquement : suppression impossible (preuve à conserver).', OLD.numero;
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS devis_no_delete_signed ON public.devis;
CREATE TRIGGER devis_no_delete_signed BEFORE DELETE ON public.devis FOR EACH ROW EXECUTE FUNCTION public.devis_no_delete_signed();

-- ---------------------------------------------------------------------
-- 3. Modèles de devis (par artisan)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.devis_modeles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artisan_id uuid NOT NULL REFERENCES public.artisans(id) ON DELETE CASCADE,
  nom text NOT NULL,
  objet text,
  lignes jsonb NOT NULL DEFAULT '[]'::jsonb,   -- même format que devis.lignes (sections, descriptions, réglages)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS devis_modeles_artisan_idx ON public.devis_modeles (artisan_id, nom);
ALTER TABLE public.devis_modeles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS devis_modeles_select_own ON public.devis_modeles;
DROP POLICY IF EXISTS devis_modeles_insert_own ON public.devis_modeles;
DROP POLICY IF EXISTS devis_modeles_update_own ON public.devis_modeles;
DROP POLICY IF EXISTS devis_modeles_delete_own ON public.devis_modeles;
CREATE POLICY devis_modeles_select_own ON public.devis_modeles FOR SELECT TO authenticated USING (artisan_id = auth.uid());
CREATE POLICY devis_modeles_insert_own ON public.devis_modeles FOR INSERT TO authenticated WITH CHECK (artisan_id = auth.uid());
CREATE POLICY devis_modeles_update_own ON public.devis_modeles FOR UPDATE TO authenticated USING (artisan_id = auth.uid()) WITH CHECK (artisan_id = auth.uid());
CREATE POLICY devis_modeles_delete_own ON public.devis_modeles FOR DELETE TO authenticated USING (artisan_id = auth.uid());
REVOKE ALL ON public.devis_modeles FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.devis_modeles TO authenticated;

-- ---------------------------------------------------------------------
-- 4. Fiches clients : notes et coordonnées complémentaires (les appels, devis, RDV et factures restent dans leurs tables)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_fiches (
  artisan_id uuid NOT NULL REFERENCES public.artisans(id) ON DELETE CASCADE,
  cle text NOT NULL,                    -- nom normalisé du client
  nom text NOT NULL,
  telephone text,
  email text,
  adresse text,
  siren text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (artisan_id, cle)
);
ALTER TABLE public.client_fiches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_fiches_select_own ON public.client_fiches;
DROP POLICY IF EXISTS client_fiches_insert_own ON public.client_fiches;
DROP POLICY IF EXISTS client_fiches_update_own ON public.client_fiches;
DROP POLICY IF EXISTS client_fiches_delete_own ON public.client_fiches;
CREATE POLICY client_fiches_select_own ON public.client_fiches FOR SELECT TO authenticated USING (artisan_id = auth.uid());
CREATE POLICY client_fiches_insert_own ON public.client_fiches FOR INSERT TO authenticated WITH CHECK (artisan_id = auth.uid());
CREATE POLICY client_fiches_update_own ON public.client_fiches FOR UPDATE TO authenticated USING (artisan_id = auth.uid()) WITH CHECK (artisan_id = auth.uid());
CREATE POLICY client_fiches_delete_own ON public.client_fiches FOR DELETE TO authenticated USING (artisan_id = auth.uid());
REVOKE ALL ON public.client_fiches FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_fiches TO authenticated;

-- ---------------------------------------------------------------------
-- 5. Factures : situations, solde, retenue de garantie, empreinte et chaînage
-- ---------------------------------------------------------------------
ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS situation_numero int,                         -- situation n° 1, 2, 3…
  ADD COLUMN IF NOT EXISTS avancement_pct numeric,                       -- avancement cumulé (%)
  ADD COLUMN IF NOT EXISTS retenue_garantie_pct numeric NOT NULL DEFAULT 0, -- 0 à 5 % (loi n° 71-584)
  ADD COLUMN IF NOT EXISTS reference_paiement text,                      -- référence à indiquer sur le virement
  ADD COLUMN IF NOT EXISTS emise_le timestamptz,
  ADD COLUMN IF NOT EXISTS document_hash text,                           -- SHA-256 du contenu émis
  ADD COLUMN IF NOT EXISTS chaine_hash text;                             -- SHA-256(chaîne précédente | document_hash)

DO $$ BEGIN
  ALTER TABLE public.factures DROP CONSTRAINT IF EXISTS factures_type_check;
  ALTER TABLE public.factures ADD CONSTRAINT factures_type_check CHECK (type IN ('facture','acompte','situation','solde','avoir'));
  ALTER TABLE public.factures DROP CONSTRAINT IF EXISTS factures_retenue_check;
  ALTER TABLE public.factures ADD CONSTRAINT factures_retenue_check CHECK (retenue_garantie_pct >= 0 AND retenue_garantie_pct <= 5);
END $$;

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
      OR NEW.acompte_deduit IS DISTINCT FROM OLD.acompte_deduit
      OR NEW.client_nom IS DISTINCT FROM OLD.client_nom
      OR NEW.client_adresse IS DISTINCT FROM OLD.client_adresse
      OR NEW.client_siren IS DISTINCT FROM OLD.client_siren
      OR NEW.client_tva IS DISTINCT FROM OLD.client_tva
      OR NEW.client_pro IS DISTINCT FROM OLD.client_pro
      OR NEW.adresse_chantier IS DISTINCT FROM OLD.adresse_chantier
      OR NEW.objet IS DISTINCT FROM OLD.objet
      OR NEW.nature IS DISTINCT FROM OLD.nature
      OR NEW.tva_sur_debits IS DISTINCT FROM OLD.tva_sur_debits
      OR NEW.autoliquidation IS DISTINCT FROM OLD.autoliquidation
      OR NEW.retenue_garantie_pct IS DISTINCT FROM OLD.retenue_garantie_pct
      OR NEW.situation_numero IS DISTINCT FROM OLD.situation_numero
      OR NEW.avancement_pct IS DISTINCT FROM OLD.avancement_pct
      OR NEW.date_emission IS DISTINCT FROM OLD.date_emission
      OR NEW.date_execution IS DISTINCT FROM OLD.date_execution
      OR NEW.date_echeance IS DISTINCT FROM OLD.date_echeance
      OR NEW.emise_le IS DISTINCT FROM OLD.emise_le
      OR NEW.document_hash IS DISTINCT FROM OLD.document_hash
      OR NEW.chaine_hash IS DISTINCT FROM OLD.chaine_hash
      OR NEW.reference_paiement IS DISTINCT FROM OLD.reference_paiement
      OR NEW.facture_origine_id IS DISTINCT FROM OLD.facture_origine_id
      OR NEW.devis_id IS DISTINCT FROM OLD.devis_id
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

-- Une facture émise ne se supprime jamais (même avec la clé serveur) : on fait un avoir.
CREATE OR REPLACE FUNCTION public.factures_no_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.numero IS NOT NULL AND current_setting('akno.purge', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Facture % émise : suppression interdite (conservation 10 ans). Faites un avoir.', OLD.numero;
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS factures_no_delete ON public.factures;
CREATE TRIGGER factures_no_delete BEFORE DELETE ON public.factures FOR EACH ROW EXECUTE FUNCTION public.factures_no_delete();

-- Émission : numéro suivant sans trou (même transaction), date, empreinte SHA-256 et chaînage.
CREATE OR REPLACE FUNCTION public.emettre_facture(p_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); f factures%ROWTYPE; y int; v int; num text; today date := (now() AT TIME ZONE 'Europe/Paris')::date;
  prev text; doc text; sit int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO f FROM factures WHERE id = p_id AND artisan_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Facture introuvable.'; END IF;
  IF f.numero IS NOT NULL THEN RETURN f.numero; END IF;
  IF jsonb_array_length(coalesce(f.lignes, '[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'La facture ne contient aucune ligne.'; END IF;
  IF coalesce(trim(f.client_nom), '') = '' THEN RAISE EXCEPTION 'Le nom du client est obligatoire.'; END IF;
  IF f.client_pro AND coalesce(trim(f.client_siren), '') = '' THEN RAISE EXCEPTION 'Client professionnel : le SIREN du client est obligatoire.'; END IF;
  y := extract(year FROM today)::int;
  -- verrou de l'artisan : deux émissions simultanées sont sérialisées (pas de trou, pas de doublon)
  INSERT INTO artisan_counters (artisan_id, kind, year, value) VALUES (uid, 'facture', y, 0) ON CONFLICT DO NOTHING;
  UPDATE artisan_counters SET value = value + 1 WHERE artisan_id = uid AND kind = 'facture' AND year = y RETURNING value INTO v;
  num := CASE WHEN f.type = 'avoir' THEN 'A-' ELSE 'F-' END || y || '-' || lpad(v::text, 4, '0');
  sit := f.situation_numero;
  IF f.type = 'situation' AND sit IS NULL THEN
    SELECT coalesce(max(situation_numero), 0) + 1 INTO sit FROM factures WHERE artisan_id = uid AND devis_id IS NOT DISTINCT FROM f.devis_id AND type = 'situation' AND numero IS NOT NULL;
  END IF;
  SELECT chaine_hash INTO prev FROM factures WHERE artisan_id = uid AND numero IS NOT NULL AND chaine_hash IS NOT NULL ORDER BY emise_le DESC NULLS LAST, numero DESC LIMIT 1;
  doc := encode(sha256(convert_to(jsonb_build_object(
    'numero', num, 'type', f.type, 'date_emission', today, 'client_nom', f.client_nom, 'client_adresse', f.client_adresse,
    'client_siren', f.client_siren, 'client_tva', f.client_tva, 'adresse_chantier', f.adresse_chantier, 'objet', f.objet, 'nature', f.nature,
    'lignes', f.lignes, 'total_ht', f.total_ht, 'total_tva', f.total_tva, 'total_ttc', f.total_ttc, 'acompte_deduit', f.acompte_deduit,
    'retenue_garantie_pct', f.retenue_garantie_pct, 'autoliquidation', f.autoliquidation, 'tva_sur_debits', f.tva_sur_debits,
    'facture_origine_id', f.facture_origine_id, 'devis_id', f.devis_id)::text, 'UTF8')), 'hex');
  PERFORM set_config('akno.emission', 'on', true);
  UPDATE factures SET numero = num, statut = 'emise', date_emission = today, emise_le = now(),
    date_execution = coalesce(date_execution, today),
    date_echeance = today + coalesce(delai_paiement_jours, 30),
    situation_numero = sit,
    reference_paiement = num,
    document_hash = doc,
    chaine_hash = encode(sha256(convert_to(coalesce(prev, 'GENESIS') || '|' || doc, 'UTF8')), 'hex')
  WHERE id = p_id;
  PERFORM set_config('akno.emission', 'off', true);
  RETURN num;
END $$;
REVOKE ALL ON FUNCTION public.emettre_facture(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.emettre_facture(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 6. Realtime
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['devis_modeles','client_fiches'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;
