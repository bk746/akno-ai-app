-- update50 · Correctif inscription
-- Depuis l'update49, le compte est créé AVANT les infos « Parlons de vous » (et via Google / Apple,
-- qui n'envoient ni prénom Akno ni entreprise). Le déclencheur handle_new_user insérait alors NULL
-- dans artisans.prenom / artisans.nom_entreprise (colonnes NOT NULL) → la création du compte échouait
-- (erreur 500 côté Supabase, affichée « Connexion au serveur impossible »).
-- On écrit une chaîne vide à la place : l'étape « Parlons de vous » complète ensuite la fiche.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.artisans (id, email, prenom, nom_entreprise, entreprise_nom, entreprise_metier, telephone, cgv_version, cgv_accepted_at)
  VALUES (
    NEW.id,
    NEW.email,
    coalesce(btrim(NEW.raw_user_meta_data->>'prenom'), ''),
    coalesce(btrim(NEW.raw_user_meta_data->>'entreprise'), ''),
    nullif(btrim(NEW.raw_user_meta_data->>'entreprise'), ''),
    nullif(NEW.raw_user_meta_data->>'metier', ''),
    nullif(NEW.raw_user_meta_data->>'telephone', ''),
    nullif(NEW.raw_user_meta_data->>'cgv_version', ''),
    CASE WHEN coalesce(NEW.raw_user_meta_data->>'cgv_version', '') <> '' THEN now() END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $function$;
