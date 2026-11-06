ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS rappel_souhaite boolean;
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS rappel_creneau text;
