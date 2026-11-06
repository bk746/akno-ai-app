ALTER TABLE public.relances
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES public.appointments(id);

ALTER TABLE public.devis
  ADD COLUMN IF NOT EXISTS relances_off boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reponse_client text;

ALTER TABLE public.artisans
  ADD COLUMN IF NOT EXISTS avis_url text;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS email_client text,
  ADD COLUMN IF NOT EXISTS avis_envoye_le timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS devis_token_uidx ON public.devis (token);
CREATE INDEX IF NOT EXISTS relances_scheduled_idx ON public.relances (statut, scheduled_for);
CREATE INDEX IF NOT EXISTS relances_devis_id_idx ON public.relances (devis_id);
