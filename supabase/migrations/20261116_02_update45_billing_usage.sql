-- =====================================================================
-- update45 · 2/5 : abonnements Stripe, quotas d'usage, limites de débit,
-- création automatique de la fiche artisan à l'inscription.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Abonnements : écrits UNIQUEMENT par le webhook Stripe (service_role).
--    L'artisan peut lire sa ligne, jamais la modifier.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
  artisan_id uuid PRIMARY KEY REFERENCES public.artisans(id) ON DELETE CASCADE,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text,                       -- 'bureau' | 'clients'
  reception_option boolean NOT NULL DEFAULT false,
  status text,                     -- trialing | active | past_due | canceled | unpaid | incomplete…
  trial_end timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  -- accès offert à la main (pilotes, compte de Keryan) : 'bureau' | 'clients' ; prioritaire sur Stripe
  plan_override text,
  override_reception boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_customer_uidx ON public.subscriptions (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscriptions_select_own ON public.subscriptions;
CREATE POLICY subscriptions_select_own ON public.subscriptions FOR SELECT TO authenticated USING (artisan_id = auth.uid());
REVOKE ALL ON public.subscriptions FROM anon, authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;

-- ---------------------------------------------------------------------
-- 2. Compteurs d'usage (quotas mensuels/journaliers + limites de débit à la minute)
--    Lecture par l'artisan, écriture par le serveur (fonction consume_usage) ou par trigger.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usage_counters (
  artisan_id uuid NOT NULL REFERENCES public.artisans(id) ON DELETE CASCADE,
  metric text NOT NULL,            -- 'voice_sessions' | 'devis_drafts' | 'voice_seconds' | 'sms' | 'rl:…'
  period text NOT NULL,            -- '2026-11' (mois) | '2026-11-16' (jour) | '2026-11-16T10:42' (minute)
  count bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (artisan_id, metric, period)
);
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS usage_counters_select_own ON public.usage_counters;
CREATE POLICY usage_counters_select_own ON public.usage_counters FOR SELECT TO authenticated USING (artisan_id = auth.uid());
REVOKE ALL ON public.usage_counters FROM anon, authenticated;
GRANT SELECT ON public.usage_counters TO authenticated;

-- Incrémente si la limite n'est pas atteinte. Renvoie true si autorisé. p_limit <= 0 = illimité.
CREATE OR REPLACE FUNCTION public.consume_usage(p_artisan uuid, p_metric text, p_period text, p_limit bigint, p_amount bigint DEFAULT 1)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cur bigint;
BEGIN
  INSERT INTO usage_counters (artisan_id, metric, period, count) VALUES (p_artisan, p_metric, p_period, 0)
    ON CONFLICT DO NOTHING;
  SELECT count INTO cur FROM usage_counters WHERE artisan_id = p_artisan AND metric = p_metric AND period = p_period FOR UPDATE;
  IF p_limit > 0 AND cur + p_amount > p_limit THEN RETURN false; END IF;
  UPDATE usage_counters SET count = count + p_amount, updated_at = now()
    WHERE artisan_id = p_artisan AND metric = p_metric AND period = p_period;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.consume_usage(uuid, text, text, bigint, bigint) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_usage(uuid, text, text, bigint, bigint) TO service_role;

-- Minutes de réceptionniste : chaque appel enregistré ajoute sa durée au mois en cours (heure de Paris).
CREATE OR REPLACE FUNCTION public.calls_count_seconds()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE per text := to_char(coalesce(NEW.created_at, now()) AT TIME ZONE 'Europe/Paris', 'YYYY-MM');
        delta bigint;
BEGIN
  -- les messages vocaux de la ligne Twilio (source 'telephone') ne sont pas des minutes de réceptionniste IA
  IF coalesce(NEW.source, '') = 'telephone' THEN RETURN NEW; END IF;
  delta := coalesce(NEW.duration, 0) - CASE WHEN TG_OP = 'UPDATE' THEN coalesce(OLD.duration, 0) ELSE 0 END;
  IF delta > 0 THEN
    INSERT INTO usage_counters (artisan_id, metric, period, count) VALUES (NEW.artisan_id, 'voice_seconds', per, delta)
      ON CONFLICT (artisan_id, metric, period) DO UPDATE SET count = usage_counters.count + EXCLUDED.count, updated_at = now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS calls_count_seconds ON public.calls;
CREATE TRIGGER calls_count_seconds AFTER INSERT OR UPDATE OF duration ON public.calls FOR EACH ROW EXECUTE FUNCTION public.calls_count_seconds();

-- Nettoyage des compteurs « minute » (limites de débit) de plus de 2 jours : appelé par le cron.
CREATE OR REPLACE FUNCTION public.purge_rate_limits()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM usage_counters WHERE metric LIKE 'rl:%' AND updated_at < now() - interval '2 days';
$$;
REVOKE ALL ON FUNCTION public.purge_rate_limits() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_rate_limits() TO service_role;

-- Limite de débit pour les formulaires publics (par IP hachée), sans compte artisan
CREATE TABLE IF NOT EXISTS public.public_rate_limits (
  key text NOT NULL,
  period text NOT NULL,
  count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, period)
);
ALTER TABLE public.public_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.public_rate_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_public_rate(p_key text, p_period text, p_limit int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cur int;
BEGIN
  INSERT INTO public_rate_limits (key, period, count) VALUES (p_key, p_period, 1)
    ON CONFLICT (key, period) DO UPDATE SET count = public_rate_limits.count + 1, updated_at = now()
    RETURNING count INTO cur;
  DELETE FROM public_rate_limits WHERE updated_at < now() - interval '2 days';
  RETURN cur <= p_limit;
END $$;
REVOKE ALL ON FUNCTION public.consume_public_rate(text, text, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_public_rate(text, text, int) TO service_role;

-- ---------------------------------------------------------------------
-- 3. Inscription self-service : la fiche artisan est créée automatiquement
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.artisans (id, email, prenom, nom_entreprise, entreprise_nom, entreprise_metier, telephone, cgv_version, cgv_accepted_at)
  VALUES (
    NEW.id,
    NEW.email,
    nullif(NEW.raw_user_meta_data->>'prenom', ''),
    nullif(NEW.raw_user_meta_data->>'entreprise', ''),
    nullif(NEW.raw_user_meta_data->>'entreprise', ''),
    nullif(NEW.raw_user_meta_data->>'metier', ''),
    nullif(NEW.raw_user_meta_data->>'telephone', ''),
    nullif(NEW.raw_user_meta_data->>'cgv_version', ''),
    CASE WHEN coalesce(NEW.raw_user_meta_data->>'cgv_version', '') <> '' THEN now() END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
