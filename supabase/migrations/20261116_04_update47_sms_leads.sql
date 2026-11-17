-- =====================================================================
-- update47 · 4/5 : journal des SMS (Twilio), liste STOP, demandes arrivant par le site.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Journal des SMS envoyés (écrit par le serveur uniquement)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sms_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artisan_id uuid NOT NULL REFERENCES public.artisans(id) ON DELETE CASCADE,
  kind text NOT NULL,              -- rappel_rdv | relance_devis | relance_facture | avis | lead | test
  to_number text NOT NULL,
  body text NOT NULL,
  provider_id text,
  status text NOT NULL DEFAULT 'queued',   -- queued | sent | delivered | failed | skipped
  error text,
  segments int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sms_log_artisan_idx ON public.sms_log (artisan_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sms_log_provider_idx ON public.sms_log (provider_id);
ALTER TABLE public.sms_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sms_log_select_own ON public.sms_log;
CREATE POLICY sms_log_select_own ON public.sms_log FOR SELECT TO authenticated USING (artisan_id = auth.uid());
REVOKE ALL ON public.sms_log FROM anon, authenticated;
GRANT SELECT ON public.sms_log TO authenticated;

-- Numéros ayant répondu STOP (toutes entreprises confondues : obligation légale)
CREATE TABLE IF NOT EXISTS public.sms_optout (
  phone text PRIMARY KEY,          -- E.164
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sms_optout ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sms_optout FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Demandes arrivant par le site de l'artisan (POST /api/lead)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artisan_id uuid NOT NULL REFERENCES public.artisans(id) ON DELETE CASCADE,
  nom text,
  telephone text,
  email text,
  adresse text,
  code_postal text,
  ville text,
  message text,
  source text,                     -- site | google | facebook | autre
  utm jsonb,
  page_url text,
  statut text NOT NULL DEFAULT 'nouveau',  -- nouveau | contacte | devis | gagne | perdu
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leads_artisan_idx ON public.leads (artisan_id, created_at DESC);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'leads' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.leads', p.policyname);
  END LOOP;
END $$;
CREATE POLICY leads_select_own ON public.leads FOR SELECT TO authenticated USING (artisan_id = auth.uid());
CREATE POLICY leads_insert_own ON public.leads FOR INSERT TO authenticated WITH CHECK (artisan_id = auth.uid());
CREATE POLICY leads_update_own ON public.leads FOR UPDATE TO authenticated USING (artisan_id = auth.uid()) WITH CHECK (artisan_id = auth.uid());
CREATE POLICY leads_delete_own ON public.leads FOR DELETE TO authenticated USING (artisan_id = auth.uid());
REVOKE ALL ON public.leads FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'leads') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
  END IF;
END $$;
