-- Native iOS push (APNs) alongside existing web push
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS device_token text;

UPDATE public.push_subscriptions SET platform = 'web' WHERE platform IS DISTINCT FROM 'web' AND (device_token IS NULL OR device_token = '');

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_ios_device_token_uidx
  ON public.push_subscriptions (device_token)
  WHERE platform = 'ios' AND device_token IS NOT NULL AND device_token <> '';