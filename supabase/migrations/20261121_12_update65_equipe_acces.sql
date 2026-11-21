-- update65 · Page Équipe : e-mail, date d'entrée, accès à l'app (rôle) et invitation SMS des membres.
-- Idempotente (rejouable sans risque). Aucune donnée existante modifiée : toutes les colonnes ajoutées sont facultatives.
-- RLS : inchangée et suffisante — les politiques « employes_*_own » (update64) limitent déjà chaque ligne à son artisan,
-- donc les nouvelles colonnes ne sont lisibles / modifiables que par l'artisan propriétaire. Aucun accès anonyme.

ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS email text
  CHECK (email IS NULL OR (length(email) <= 254 AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'));
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS hired_on date;                       -- date d'entrée
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS access_role text
  CHECK (access_role IS NULL OR access_role IN ('ouvrier', 'chef', 'admin'));             -- accès à l'app (NULL = pas d'accès)
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS invite_status text
  CHECK (invite_status IS NULL OR invite_status IN ('pending', 'accepted'));             -- invitation SMS
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS invited_at timestamptz;              -- dernier envoi de l'invitation
ALTER TABLE public.employes ADD COLUMN IF NOT EXISTS invite_count integer NOT NULL DEFAULT 0 CHECK (invite_count >= 0);

-- une invitation suppose un rôle d'accès
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employes_invite_role') THEN
    ALTER TABLE public.employes ADD CONSTRAINT employes_invite_role CHECK (invite_status IS NULL OR access_role IS NOT NULL);
  END IF;
END $$;

-- liste « invitations en attente » de la page Équipe
CREATE INDEX IF NOT EXISTS employes_invite_idx ON public.employes (artisan_id, invite_status) WHERE invite_status IS NOT NULL;

COMMENT ON COLUMN public.employes.access_role IS 'update65 · accès à l''app : ouvrier | chef (chef d''équipe) | admin ; NULL = aucun accès';
COMMENT ON COLUMN public.employes.invite_status IS 'update65 · pending = invitation SMS envoyée, pas encore acceptée ; accepted = compte activé';
