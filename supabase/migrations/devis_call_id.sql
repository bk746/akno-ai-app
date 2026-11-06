ALTER TABLE public.devis ADD COLUMN IF NOT EXISTS call_id bigint REFERENCES public.calls(id);
CREATE INDEX IF NOT EXISTS devis_call_id_idx ON public.devis (call_id);
