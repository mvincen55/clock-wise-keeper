-- knowledge_slugify runs with a locked public-only search_path. Keep text
-- normalization self-contained so the migration does not depend on where a
-- hosted Supabase project installed optional extensions.

CREATE OR REPLACE FUNCTION public.knowledge_normalize_text(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT translate(
    lower(value),
    'áàâäãåéèêëíìîïóòôöõúùûüýÿçñ',
    'aaaaaaeeeeiiiiooooouuuuyycn'
  );
$$;

CREATE OR REPLACE FUNCTION public.unaccent(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = public, pg_catalog
AS $$
  SELECT public.knowledge_normalize_text(value);
$$;

REVOKE ALL ON FUNCTION public.knowledge_normalize_text(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.knowledge_normalize_text(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.knowledge_normalize_text(text) TO service_role;

COMMENT ON FUNCTION public.knowledge_normalize_text(text) IS
  'Deterministic text normalization for knowledge slugs without optional extension dependencies.';
