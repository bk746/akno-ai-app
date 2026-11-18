-- update57 · Configurateur « Ma réceptionniste » (voix, script, prestations, FAQ, consignes)
-- À VALIDER PAR KERYAN AVANT DE L'APPLIQUER (Supabase → SQL Editor). Idempotent : peut être relancé sans risque.
--
-- Choix : une colonne jsonb sur artisans (comme artisans.tarifs et artisans.horaires) plutôt qu'une nouvelle table :
--  - la ligne artisans est déjà protégée par RLS « own-row » (artisans_select_own / artisans_update_own, update44) ;
--  - l'app (Réglages), /api/voice-token et le relais téléphonique (select=*) la lisent sans requête de plus.
-- Le message d'accueil reste dans artisans.message_accueil (update48).
-- Format (normalisé par src/lib/voice/receptionist.ts, NULL = réglages par défaut) :
--   { "v":1, "voice":"celeste", "speed":1, "tutoiement":false, "presentation":"…",
--     "services":[{"nom":"…","prix":"…","duree":"…"}], "zone":"…", "disponibilites":"…", "urgences":"…",
--     "interdits":"…", "faq":[{"q":"…","r":"…"}], "consignes":"…", "prononciations":[{"mot":"…","dit":"…"}] }

ALTER TABLE public.artisans ADD COLUMN IF NOT EXISTS reception_config jsonb;

-- Garde-fous : un objet JSON, 32 Ko maximum, voix parmi les 28 voix intégrées de Grok Voice.
ALTER TABLE public.artisans DROP CONSTRAINT IF EXISTS artisans_reception_config_check;
ALTER TABLE public.artisans ADD CONSTRAINT artisans_reception_config_check CHECK (
  reception_config IS NULL OR (
    jsonb_typeof(reception_config) = 'object'
    AND pg_column_size(reception_config) <= 32768
    AND (
      NOT (reception_config ? 'voice')
      OR reception_config->>'voice' IN (
        'altair','ara','atlas','aurora','carina','castor','celeste','cosmo','eve','helios','helix','iris','kepler','leo',
        'liora','lumen','luna','lux','naksh','orion','perseus','rex','rigel','sal','sirius','ursa','zagan','zenith'
      )
    )
  )
);

COMMENT ON COLUMN public.artisans.reception_config IS 'update57 · Ma réceptionniste : voix Grok, débit, ton, présentation, prestations, zone, disponibilités, urgences, interdits, FAQ, consignes, prononciations';

-- RLS : rien à créer, la colonne hérite des politiques existantes de la table artisans (update44).
-- Vérification (doit renvoyer 3 lignes : artisans_select_own, artisans_insert_own, artisans_update_own) :
-- SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'artisans';
-- Par sécurité (idempotent) : RLS bien activé sur artisans.
ALTER TABLE public.artisans ENABLE ROW LEVEL SECURITY;
