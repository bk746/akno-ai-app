-- update37 : numéro d'urgence dicté par la réceptionniste (catégorie C uniquement)
ALTER TABLE public.artisans
  ADD COLUMN IF NOT EXISTS telephone_urgence text;
