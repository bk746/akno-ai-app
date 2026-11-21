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


-- ===== update61 : numérotation sans trou, empreinte, modèles, fiches clients, journal de signature =====
INSERT INTO public.factures (artisan_id, client_nom, lignes) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Vide', '[]');
DO $$ BEGIN
  BEGIN
    PERFORM public.emettre_facture(id) FROM public.factures WHERE client_nom = 'Vide';
    INSERT INTO results VALUES ('u61_emission_vide_refusee', false);
  EXCEPTION WHEN others THEN INSERT INTO results VALUES ('u61_emission_vide_refusee', true);
  END;
END $$;
INSERT INTO public.factures (artisan_id, client_nom, type, lignes, total_ht, total_ttc) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Client S', 'situation', '[{"l":"Situation","q":1,"u":"forfait","pu":500,"tv":10}]', 500, 550);
INSERT INTO results SELECT 'u61_pas_de_trou_F0002', public.emettre_facture(id) = 'F-' || extract(year FROM now() AT TIME ZONE 'Europe/Paris') || '-0002' FROM public.factures WHERE client_nom = 'Client S';
INSERT INTO results SELECT 'u61_situation_n1', situation_numero = 1 AND reference_paiement = numero FROM public.factures WHERE client_nom = 'Client S';
INSERT INTO public.factures (artisan_id, client_nom, type, lignes, total_ht, total_ttc, facture_origine_id) SELECT 'aaaaaaaa-0000-0000-0000-000000000001', 'Client S', 'avoir', lignes, total_ht, total_ttc, id FROM public.factures WHERE client_nom = 'Client S' AND type = 'situation';
INSERT INTO results SELECT 'u61_avoir_A0003', public.emettre_facture(id) = 'A-' || extract(year FROM now() AT TIME ZONE 'Europe/Paris') || '-0003' FROM public.factures WHERE type = 'avoir';
INSERT INTO results SELECT 'u61_empreintes', count(*) = 2 AND count(DISTINCT chaine_hash) = 2 AND bool_and(length(document_hash) = 64) FROM public.factures WHERE client_nom = 'Client S';
INSERT INTO public.factures (artisan_id, client_nom, client_pro, lignes) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Pro sans SIREN', true, '[{"l":"x","q":1,"u":"u","pu":10,"tv":20}]');
DO $$ BEGIN
  BEGIN
    PERFORM public.emettre_facture(id) FROM public.factures WHERE client_nom = 'Pro sans SIREN';
    INSERT INTO results VALUES ('u61_siren_client_pro_obligatoire', false);
  EXCEPTION WHEN others THEN INSERT INTO results VALUES ('u61_siren_client_pro_obligatoire', true);
  END;
  BEGIN
    UPDATE public.factures SET retenue_garantie_pct = 1 WHERE client_nom = 'Client S' AND type = 'situation';
    INSERT INTO results VALUES ('u61_situation_figee', false);
  EXCEPTION WHEN others THEN INSERT INTO results VALUES ('u61_situation_figee', true);
  END;
  BEGIN
    INSERT INTO public.signature_events (artisan_id, devis_id, event, event_hash) SELECT artisan_id, id, 'signature', 'x' FROM public.devis LIMIT 1;
    INSERT INTO results VALUES ('u61_journal_signature_serveur_seul', false);
  EXCEPTION WHEN others THEN INSERT INTO results VALUES ('u61_journal_signature_serveur_seul', true);
  END;
END $$;
INSERT INTO public.devis_modeles (artisan_id, nom, lignes) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Remplacement ballon', '[{"l":"Ballon 200 L","q":1,"pu":900,"tv":10}]');
INSERT INTO public.client_fiches (artisan_id, cle, nom, notes) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'client a', 'Client A', 'Code portail 1234');
INSERT INTO results SELECT 'u61_modele_et_fiche_crees', (SELECT count(*) FROM public.devis_modeles) = 1 AND (SELECT count(*) FROM public.client_fiches) = 1;

-- ===== update64 : chantiers, équipe, affectations =====
INSERT INTO public.employes (artisan_id, first_name, role) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Julien', 'Chef de chantier');
INSERT INTO public.chantiers (artisan_id, title, status, start_date, end_date, lat, lng) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Salle de bain A', 'in_progress', '2026-11-18', '2026-11-29', 45.91, 6.12);
INSERT INTO public.chantier_employes (chantier_id, employe_id, artisan_id) SELECT c.id, e.id, c.artisan_id FROM public.chantiers c, public.employes e;
INSERT INTO results SELECT 'u64_chantier_equipe_crees', (SELECT count(*) FROM public.chantier_employes) = 1;
UPDATE public.chantiers SET notes = 'x', updated_at = '2000-01-01' WHERE title = 'Salle de bain A';
INSERT INTO results SELECT 'u64_updated_at_auto', updated_at > '2001-01-01' FROM public.chantiers WHERE title = 'Salle de bain A';
DO $$ BEGIN
  BEGIN
    INSERT INTO public.chantiers (artisan_id, title, start_date, end_date) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Dates', '2026-12-10', '2026-12-01');
    INSERT INTO results VALUES ('u64_dates_coherentes', false);
  EXCEPTION WHEN others THEN INSERT INTO results VALUES ('u64_dates_coherentes', true);
  END;
END $$;
-- ===== Artisan B =====
SELECT set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', false);
INSERT INTO results SELECT 'u64_B_ne_voit_pas_chantiers_A', count(*) = 0 FROM public.chantiers;
INSERT INTO results SELECT 'u64_B_ne_voit_pas_equipe_A', (SELECT count(*) FROM public.employes) = 0 AND (SELECT count(*) FROM public.chantier_employes) = 0;
INSERT INTO public.employes (artisan_id, first_name) VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'Bob');
DO $$ BEGIN
  BEGIN
    INSERT INTO public.chantiers (artisan_id, title) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Intrus');
    INSERT INTO results VALUES ('u64_chantier_chez_autrui_refuse', false);
  EXCEPTION WHEN others THEN INSERT INTO results VALUES ('u64_chantier_chez_autrui_refuse', true);
  END;
  BEGIN
    INSERT INTO public.chantier_employes (chantier_id, employe_id, artisan_id) SELECT (SELECT id FROM public.chantiers LIMIT 1), id, 'bbbbbbbb-0000-0000-0000-000000000002' FROM public.employes;
    INSERT INTO results SELECT 'u64_affectation_autrui_refusee', false;
  EXCEPTION WHEN others THEN INSERT INTO results VALUES ('u64_affectation_autrui_refusee', true);
  END;
END $$;
UPDATE public.chantiers SET title = 'pirate';
INSERT INTO results SELECT 'B_ne_voit_pas_calls_A', count(*) = 0 FROM public.calls;
INSERT INTO results SELECT 'B_ne_voit_pas_devis_A', count(*) = 0 FROM public.devis;
INSERT INTO results SELECT 'B_ne_voit_pas_factures_A', count(*) = 0 FROM public.factures;
INSERT INTO results SELECT 'u61_B_ne_voit_pas_modeles_A', count(*) = 0 FROM public.devis_modeles;
INSERT INTO results SELECT 'u61_B_ne_voit_pas_fiches_A', count(*) = 0 FROM public.client_fiches;
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
-- update61 : facture émise non supprimable même avec la clé serveur ; devis signé figé
DO $$ BEGIN
  BEGIN
    DELETE FROM public.factures WHERE numero IS NOT NULL;
    INSERT INTO results VALUES ('u61_facture_emise_jamais_supprimee', false);
  EXCEPTION WHEN others THEN INSERT INTO results VALUES ('u61_facture_emise_jamais_supprimee', true);
  END;
END $$;
UPDATE public.devis SET signe_le = now(), document_hash = repeat('a', 64), accepte_nom = 'Client A' WHERE client_nom = 'Client A';
INSERT INTO public.signature_events (artisan_id, devis_id, event, event_hash) SELECT artisan_id, id, 'signature', repeat('b', 64) FROM public.devis WHERE client_nom = 'Client A';
DO $$ BEGIN
  BEGIN
    DELETE FROM public.signature_events;
    INSERT INTO results VALUES ('u61_journal_ajout_seul', false);
  EXCEPTION WHEN others THEN INSERT INTO results VALUES ('u61_journal_ajout_seul', true);
  END;
END $$;
UPDATE public.devis SET statut = 'val', total_ttc = 1, lignes = '[{"l":"modifié"}]'::jsonb, accepte_nom = 'Autre', signe_le = NULL WHERE client_nom = 'Client A';
INSERT INTO results SELECT 'u61_devis_signe_fige', count(*) = 1 FROM public.devis WHERE client_nom = 'Client A' AND total_ttc IS DISTINCT FROM 1 AND NOT coalesce(lignes @> '[{"l":"modifié"}]'::jsonb, false) AND accepte_nom = 'Client A' AND signe_le IS NOT NULL;
INSERT INTO results SELECT 'u61_devis_signe_statut_modifiable', count(*) = 1 FROM public.devis WHERE client_nom = 'Client A' AND statut = 'val';
-- update61 : un devis signé ne se supprime pas ; un devis non signé (avec journal d'envoi) se supprime normalement
DO $$ BEGIN
  BEGIN
    DELETE FROM public.devis WHERE client_nom = 'Client A';
    INSERT INTO results VALUES ('u61_devis_signe_non_supprimable', false);
  EXCEPTION WHEN others THEN INSERT INTO results VALUES ('u61_devis_signe_non_supprimable', true);
  END;
END $$;
INSERT INTO public.devis (artisan_id, numero, client_nom, statut) VALUES ('aaaaaaaa-0000-0000-0000-000000000001', '99999', 'Client Z', 'env');
INSERT INTO public.signature_events (artisan_id, devis_id, event, event_hash) SELECT artisan_id, id, 'envoi', repeat('c', 64) FROM public.devis WHERE client_nom = 'Client Z';
DELETE FROM public.devis WHERE client_nom = 'Client Z';
INSERT INTO results SELECT 'u61_devis_non_signe_supprimable', NOT EXISTS (SELECT 1 FROM public.devis WHERE client_nom = 'Client Z') AND NOT EXISTS (SELECT 1 FROM public.signature_events WHERE event = 'envoi');
INSERT INTO results SELECT 'A_intact_apres_B', count(*) = 1 FROM public.calls WHERE nom_client = 'Client A';
INSERT INTO results SELECT 'u64_A_chantier_intact', count(*) = 1 FROM public.chantiers WHERE title = 'Salle de bain A';
INSERT INTO results SELECT 'A_devis_intacts', count(*) = 2 FROM public.devis;
INSERT INTO results SELECT 'minutes_comptees', count = 120 FROM public.usage_counters WHERE metric = 'voice_seconds';
SELECT test, ok FROM results ORDER BY ok, test;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM results WHERE ok IS NOT TRUE) THEN RAISE EXCEPTION 'Au moins un test RLS a échoué'; END IF; END $$;
