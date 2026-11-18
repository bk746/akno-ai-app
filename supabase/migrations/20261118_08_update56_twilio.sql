-- update56 · Vrais appels téléphoniques (Twilio → réceptionniste IA Grok Voice)
-- À VALIDER PAR KERYAN AVANT DE L'APPLIQUER (Supabase → SQL Editor). Idempotent.

-- 1) Numéro Akno attribué à chaque artisan (numéro appelé « To » → artisan)
CREATE TABLE IF NOT EXISTS public.artisan_phone_numbers (
  phone_number text PRIMARY KEY CHECK (phone_number ~ '^\+[1-9][0-9]{6,14}$'),  -- format E.164, ex. +33973057824
  artisan_id uuid NOT NULL REFERENCES public.artisans(id) ON DELETE CASCADE,
  twilio_sid text,            -- PN… (facultatif)
  label text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS artisan_phone_numbers_artisan_idx ON public.artisan_phone_numbers (artisan_id);

ALTER TABLE public.artisan_phone_numbers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS artisan_phone_numbers_select_own ON public.artisan_phone_numbers;
CREATE POLICY artisan_phone_numbers_select_own ON public.artisan_phone_numbers
  FOR SELECT TO authenticated USING (artisan_id = auth.uid());
-- L'artisan lit seulement son numéro ; l'attribution se fait côté serveur (service_role).
REVOKE ALL ON public.artisan_phone_numbers FROM anon, authenticated;
GRANT SELECT ON public.artisan_phone_numbers TO authenticated;
GRANT ALL ON public.artisan_phone_numbers TO service_role;

-- 2) Lien appel Twilio ↔ fiche d'appel (fin d'appel, durée)
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS twilio_call_sid text;
CREATE UNIQUE INDEX IF NOT EXISTS calls_twilio_call_sid_key ON public.calls (twilio_call_sid);
-- (les valeurs NULL des appels in-app ne se gênent pas : NULL ≠ NULL dans un index unique)

-- 3) Attribution du numéro de Keryan (remplacer l'UUID par l'id de l'artisan, table artisans) :
-- INSERT INTO public.artisan_phone_numbers (phone_number, artisan_id, label)
-- VALUES ('+33973057824', '00000000-0000-0000-0000-000000000000', 'Numéro Akno')
-- ON CONFLICT (phone_number) DO UPDATE SET artisan_id = EXCLUDED.artisan_id, active = true;
