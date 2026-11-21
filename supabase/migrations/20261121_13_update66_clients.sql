-- update66 · Page Clients : type de client (particulier / professionnel / syndic), prénom + nom ou raison sociale,
-- origine du contact, position de l'adresse (vignette satellite) et date de création de la fiche.
-- Idempotente (rejouable sans risque). Aucune donnée existante modifiée : toutes les colonnes ajoutées sont facultatives
-- (created_at reste NULL pour les fiches déjà existantes ; l'app retient alors la date du premier échange connu).
-- Les notes d'accès (code portail, étage…) utilisent la colonne existante « notes ». Le SIREN existant reste utilisé.
-- RLS : inchangée et suffisante — les politiques « client_fiches_*_own » (update61) limitent chaque ligne à son artisan,
-- donc les nouvelles colonnes ne sont lisibles / modifiables que par l'artisan propriétaire. Aucun accès anonyme.

ALTER TABLE public.client_fiches ADD COLUMN IF NOT EXISTS type_client text
  CHECK (type_client IS NULL OR type_client IN ('particulier', 'pro', 'syndic'));
ALTER TABLE public.client_fiches ADD COLUMN IF NOT EXISTS prenom text CHECK (prenom IS NULL OR length(prenom) <= 80);
ALTER TABLE public.client_fiches ADD COLUMN IF NOT EXISTS nom_famille text CHECK (nom_famille IS NULL OR length(nom_famille) <= 80);
ALTER TABLE public.client_fiches ADD COLUMN IF NOT EXISTS origine text
  CHECK (origine IS NULL OR origine IN ('appel', 'bouche_a_oreille', 'site', 'google', 'autre'));
ALTER TABLE public.client_fiches ADD COLUMN IF NOT EXISTS ville text CHECK (ville IS NULL OR length(ville) <= 120);
ALTER TABLE public.client_fiches ADD COLUMN IF NOT EXISTS lat double precision CHECK (lat IS NULL OR lat BETWEEN -90 AND 90);
ALTER TABLE public.client_fiches ADD COLUMN IF NOT EXISTS lng double precision CHECK (lng IS NULL OR lng BETWEEN -180 AND 180);
ALTER TABLE public.client_fiches ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE public.client_fiches ALTER COLUMN created_at SET DEFAULT now();

-- garde-fous de taille sur les colonnes existantes (saisie libre côté app)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'client_fiches_notes_len') THEN
    ALTER TABLE public.client_fiches ADD CONSTRAINT client_fiches_notes_len CHECK (notes IS NULL OR length(notes) <= 4000) NOT VALID;
  END IF;
END $$;

-- recherche d'un doublon par téléphone
CREATE INDEX IF NOT EXISTS client_fiches_tel_idx ON public.client_fiches (artisan_id, telephone) WHERE telephone IS NOT NULL;

COMMENT ON COLUMN public.client_fiches.type_client IS 'particulier | pro | syndic (un syndic est un professionnel)';
COMMENT ON COLUMN public.client_fiches.origine IS 'origine du contact : appel | bouche_a_oreille | site | google | autre';
COMMENT ON COLUMN public.client_fiches.lat IS 'position de l''adresse (api-adresse.data.gouv.fr), pour la vignette satellite';
