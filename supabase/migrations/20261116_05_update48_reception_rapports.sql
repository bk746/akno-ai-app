-- =====================================================================
-- update48 · 5/5 : préparation de la ligne téléphonique (débordement Twilio),
-- rapports mensuels, purge des enregistrements.
-- =====================================================================

-- Numéro Twilio attribué à un artisan : stocké côté serveur (un artisan ne doit pas pouvoir
-- s'attribuer le numéro d'un autre). Renseigné par Keryan dans Supabase (voir le LISEZMOI).
ALTER TABLE public.artisan_secrets
  ADD COLUMN IF NOT EXISTS twilio_number text,          -- E.164, ex. +33970000000
  ADD COLUMN IF NOT EXISTS forward_to text;             -- portable de l'artisan (E.164), sonne d'abord
CREATE UNIQUE INDEX IF NOT EXISTS artisan_secrets_twilio_uidx ON public.artisan_secrets (twilio_number) WHERE twilio_number IS NOT NULL;

-- Horaires et message d'accueil réglables par l'artisan
ALTER TABLE public.artisans
  ADD COLUMN IF NOT EXISTS horaires jsonb,              -- {"lun":["08:00","18:00"], …}
  ADD COLUMN IF NOT EXISTS message_accueil text,
  ADD COLUMN IF NOT EXISTS conservation_enregistrements_jours int DEFAULT 180;

-- Rapports mensuels déjà envoyés (évite les doublons si le cron repasse)
CREATE TABLE IF NOT EXISTS public.rapports_mensuels (
  artisan_id uuid NOT NULL REFERENCES public.artisans(id) ON DELETE CASCADE,
  period text NOT NULL,            -- '2026-11'
  sent_at timestamptz NOT NULL DEFAULT now(),
  stats jsonb,
  PRIMARY KEY (artisan_id, period)
);
ALTER TABLE public.rapports_mensuels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rapports_mensuels_select_own ON public.rapports_mensuels;
CREATE POLICY rapports_mensuels_select_own ON public.rapports_mensuels FOR SELECT TO authenticated USING (artisan_id = auth.uid());
REVOKE ALL ON public.rapports_mensuels FROM anon, authenticated;
GRANT SELECT ON public.rapports_mensuels TO authenticated;
