-- update76 · Attribution autonome du numéro Twilio + libération après grâce de 7 jours.
-- À APPLIQUER SEULEMENT après l'« ok base » de Keryan. Ne pas exécuter automatiquement.

-- 1) Suivi d'état sur les numéros déjà attribués
ALTER TABLE public.artisan_phone_numbers
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS release_after timestamptz,
  ADD COLUMN IF NOT EXISTS released_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

DO $$ BEGIN
  ALTER TABLE public.artisan_phone_numbers
    ADD CONSTRAINT artisan_phone_numbers_status_chk
    CHECK (status IN ('active', 'grace', 'released'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Un seul numéro « vivant » (actif ou en grâce) par artisan
CREATE UNIQUE INDEX IF NOT EXISTS artisan_phone_numbers_one_live
  ON public.artisan_phone_numbers (artisan_id)
  WHERE status IN ('active', 'grace');

-- 2) Verrou d'achat (anti double-appui) — service_role uniquement
CREATE TABLE IF NOT EXISTS public.phone_provision_locks (
  artisan_id uuid PRIMARY KEY REFERENCES public.artisans(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  error text
);

ALTER TABLE public.phone_provision_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.phone_provision_locks FROM anon, authenticated;
GRANT ALL ON public.phone_provision_locks TO service_role;

-- 3) Bundle réglementaire par artisan (inactif tant que TWILIO_BUNDLE_PER_ARTISAN ≠ 1)
ALTER TABLE public.artisans
  ADD COLUMN IF NOT EXISTS twilio_bundle_sid text,
  ADD COLUMN IF NOT EXISTS twilio_address_sid text,
  ADD COLUMN IF NOT EXISTS twilio_bundle_status text,
  ADD COLUMN IF NOT EXISTS twilio_regulatory jsonb;

COMMENT ON COLUMN public.artisans.twilio_bundle_status IS 'pending | in-review | twilio-approved | twilio-rejected | failed — utilisé seulement si TWILIO_BUNDLE_PER_ARTISAN=1';
