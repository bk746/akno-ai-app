-- Test d'isolement multi-clients (à lancer UNIQUEMENT sur une base de test, jamais en production).
-- Deux artisans A et B : chacun ne doit voir / modifier que ses lignes.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.fr', '{"prenom":"Alice","entreprise":"Plomberie A","cgv_version":"2026-11"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test.fr', '{"prenom":"Bob","entreprise":"Elec B"}');

CREATE TEMP TABLE results (test text, ok boolean);
GRANT ALL ON results TO authenticated, anon;

-- fiche artisan créée automatiquement à l'inscription
INSERT INTO results SELECT 'signup_trigger', count(*) = 2 AND bool_and(nom_entreprise IS NOT NULL) FROM public.artisans;

-- ===== Artisan A =====
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', false);
INSERT INTO public.calls (artisan_id, nom_client, duration) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Client A', 120);
INSERT INTO public.devis (artisan_id, numero, client_nom, statut) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', public.next_numero('devis'), 'Client A', 'val');
INSERT INTO public.devis (artisan_id, numero, client_nom, statut) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', public.next_numero('devis'), 'Client A2', 'brouillon');
INSERT INTO results SELECT 'devis_numeros_suivis', array_agg(numero ORDER BY numero) = ARRAY['9088','9089'] FROM public.devis;
INSERT INTO public.factures (artisan_id, client_nom, lignes, total_ht, total_ttc) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Client A', '[{"l":"x","q":1,"u":"u","pu":100,"tv":20}]', 100, 120);
INSERT INTO results SELECT 'facture_emise_F0001', public.emettre_facture(id) = 'F-' || extract(year FROM now() AT TIME ZONE 'Europe/Paris') || '-0001' FROM public.factures LIMIT 1;
DO $$ BEGIN
  BEGIN
    UPDATE public.factures SET total_ttc = 1;
    INSERT INTO results VALUES ('facture_figee', false);
  EXCEPTION WHEN others THEN INSERT INTO results VALUES ('facture_figee', true);
  END;
  BEGIN
    INSERT INTO public.factures (artisan_id, client_nom, numero) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'x', 'F-1999-0001');
    INSERT INTO results VALUES ('numero_force_refuse', false);
  EXCEPTION WHEN others THEN INSERT INTO results VALUES ('numero_force_refuse', true);
  END;
  BEGIN
    DELETE FROM public.factures WHERE numero IS NOT NULL;
    INSERT INTO results SELECT 'facture_emise_non_supprimable', count(*) = 1 FROM public.factures WHERE numero IS NOT NULL;
  END;
  BEGIN
    INSERT INTO public.subscriptions (artisan_id, plan, status) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'clients', 'active');
    INSERT INTO results VALUES ('abonnement_non_falsifiable', false);
  EXCEPTION WHEN others THEN INSERT INTO results VALUES ('abonnement_non_falsifiable', true);
  END;
  BEGIN
    PERFORM public.consume_usage('aaaaaaaa-0000-0000-0000-000000000001', 'sms', '2026-11', 0, -1000);
    INSERT INTO results VALUES ('quota_non_manipulable', false);
  EXCEPTION WHEN others THEN INSERT INTO results VALUES ('quota_non_manipulable', true);
  END;
  BEGIN
    PERFORM count(*) FROM public.artisan_secrets;
    INSERT INTO results VALUES ('secrets_illisibles', false);
  EXCEPTION WHEN others THEN INSERT INTO results VALUES ('secrets_illisibles', true);
  END;
END $$;
UPDATE public.factures SET statut = 'payee' WHERE numero IS NOT NULL;
INSERT INTO results SELECT 'facture_statut_modifiable', count(*) = 1 FROM public.factures WHERE statut = 'payee';
-- A tente de modifier sa clé de formulaire (protégée)
UPDATE public.artisans SET lead_key = '00000000-0000-0000-0000-000000000000';
INSERT INTO results SELECT 'lead_key_protegee', lead_key <> '00000000-0000-0000-0000-000000000000' FROM public.artisans;
-- A tente d'écrire chez B
DO $$ BEGIN
  BEGIN
    INSERT INTO public.calls (artisan_id, nom_client) VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'intrusion');
    INSERT INTO results VALUES ('insert_chez_autrui_refuse', false);
  EXCEPTION WHEN others THEN INSERT INTO results VALUES ('insert_chez_autrui_refuse', true);
  END;
END $$;
INSERT INTO storage.objects (bucket_id, name) VALUES ('recordings', 'aaaaaaaa-0000-0000-0000-000000000001/1.webm');
DO $$ BEGIN
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('recordings', 'bbbbbbbb-0000-0000-0000-000000000002/1.webm');
    INSERT INTO results VALUES ('storage_dossier_autrui_refuse', false);
  EXCEPTION WHEN others THEN INSERT INTO results VALUES ('storage_dossier_autrui_refuse', true);
  END;
END $$;

-- ===== Artisan B =====
SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', false);
INSERT INTO results SELECT 'B_ne_voit_pas_calls_A', count(*) = 0 FROM public.calls;
INSERT INTO results SELECT 'B_ne_voit_pas_devis_A', count(*) = 0 FROM public.devis;
INSERT INTO results SELECT 'B_ne_voit_pas_factures_A', count(*) = 0 FROM public.factures;
INSERT INTO results SELECT 'B_voit_sa_seule_fiche', count(*) = 1 FROM public.artisans;
INSERT INTO results SELECT 'B_storage_isole', count(*) = 0 FROM storage.objects;
UPDATE public.calls SET nom_client = 'pirate';
DELETE FROM public.devis;
INSERT INTO results SELECT 'B_numero_independant', public.next_numero('devis') = '9088';

-- ===== anon =====
RESET ROLE;
SET ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', false);
DO $$ BEGIN
  BEGIN
    PERFORM count(*) FROM public.devis;
    INSERT INTO results VALUES ('anon_sans_acces', false);
  EXCEPTION WHEN others THEN INSERT INTO results VALUES ('anon_sans_acces', true);
  END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);
INSERT INTO results SELECT 'A_intact_apres_B', count(*) = 1 FROM public.calls WHERE nom_client = 'Client A';
INSERT INTO results SELECT 'A_devis_intacts', count(*) = 2 FROM public.devis;
INSERT INTO results SELECT 'minutes_comptees', count = 120 FROM public.usage_counters WHERE metric = 'voice_seconds';
SELECT test, ok FROM results ORDER BY ok, test;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM results WHERE ok IS NOT TRUE) THEN RAISE EXCEPTION 'Au moins un test RLS a échoué'; END IF; END $$;
