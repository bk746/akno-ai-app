-- update27: evolve push_subscriptions for artisan web push + RLS
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS artisan_id uuid REFERENCES public.artisans(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS ua text,
  ADD COLUMN IF NOT EXISTS keys jsonb;

UPDATE public.push_subscriptions p
SET artisan_id = p.user_id
WHERE p.artisan_id IS NULL
  AND EXISTS (SELECT 1 FROM public.artisans a WHERE a.id = p.user_id);

UPDATE public.push_subscriptions
SET keys = jsonb_build_object('p256dh', p256dh, 'auth', auth)
WHERE keys IS NULL AND p256dh IS NOT NULL AND auth IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_uidx ON public.push_subscriptions (endpoint);
CREATE INDEX IF NOT EXISTS push_subscriptions_artisan_idx ON public.push_subscriptions (artisan_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_select ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_insert ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_update ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_delete ON public.push_subscriptions;

CREATE POLICY push_subscriptions_select ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (artisan_id = auth.uid() OR user_id = auth.uid());

CREATE POLICY push_subscriptions_insert ON public.push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (COALESCE(artisan_id, user_id) = auth.uid());

CREATE POLICY push_subscriptions_update ON public.push_subscriptions
  FOR UPDATE TO authenticated
  USING (artisan_id = auth.uid() OR user_id = auth.uid())
  WITH CHECK (artisan_id = auth.uid() OR user_id = auth.uid());

CREATE POLICY push_subscriptions_delete ON public.push_subscriptions
  FOR DELETE TO authenticated
  USING (artisan_id = auth.uid() OR user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
