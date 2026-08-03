-- Keep the knowledge slug helper deterministic without depending on the
-- database's ambient search_path. Supabase commonly installs extensions in
-- the extensions schema, while application functions intentionally use a
-- locked public-only search_path.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = extensions, pg_catalog
AS $$
  SELECT extensions.unaccent($1);
$$;

REVOKE ALL ON FUNCTION public.unaccent(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unaccent(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unaccent(text) TO service_role;

COMMENT ON FUNCTION public.unaccent(text) IS
  'Stable public wrapper used by knowledge_slugify while its search_path remains locked.';