-- Document library areas: "category" conflated two ideas — WHERE a document
-- lives in the product (Workplace vs Practice Playbook) and WHAT it is
-- (handbook, HR, insurance manual…). Split them into `library_area` and
-- `collection`. Additive only: `category` stays for backwards compatibility
-- and no rows are deleted.

ALTER TABLE public.office_docs
  ADD COLUMN library_area text NOT NULL DEFAULT 'unassigned'
    CHECK (library_area IN ('workplace', 'playbook', 'shared', 'unassigned')),
  ADD COLUMN collection text NOT NULL DEFAULT 'other'
    CHECK (collection IN ('handbook', 'hr', 'insurance', 'operations', 'training', 'reference', 'other')),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill from the legacy category.
UPDATE public.office_docs SET library_area = 'workplace', collection = 'handbook' WHERE category = 'policy';
UPDATE public.office_docs SET library_area = 'workplace', collection = 'hr'       WHERE category = 'hr';
UPDATE public.office_docs SET library_area = 'playbook',  collection = 'insurance' WHERE category = 'insurance';
UPDATE public.office_docs SET library_area = 'unassigned', collection = 'other'    WHERE category = 'other';

-- Carrier manuals belong to the Practice Playbook's Insurance Desk no matter
-- how they were categorized on upload (the two 2026 Delta Dental MA manuals
-- are the known cases; the pattern catches re-uploads of the same family).
UPDATE public.office_docs
SET library_area = 'playbook', collection = 'insurance'
WHERE title ILIKE '%DD MA%'
   OR title ILIKE '%delta dental%';

-- An imported "Important Numbers" document must never appear inside the
-- handbook reader — the standalone Important Numbers page is the primary
-- experience. Keep the data, park it as unassigned reference so it surfaces
-- in document management for a manager to review (not in any reader).
UPDATE public.office_docs
SET library_area = 'unassigned', collection = 'reference'
WHERE title ILIKE 'important numbers%';

CREATE INDEX idx_office_docs_library ON public.office_docs(org_id, library_area, collection);

-- Reuse the shared updated_at trigger so "last updated" stays honest when a
-- manager retitles or moves a document from here on.
CREATE TRIGGER update_office_docs_updated_at
  BEFORE UPDATE ON public.office_docs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Recreate full-text search with optional placement filters. The old
-- two-argument signature must be dropped first — CREATE OR REPLACE with new
-- defaulted parameters would create an ambiguous overload instead. Existing
-- callers that pass only (p_query, p_limit) keep working unchanged.
DROP FUNCTION IF EXISTS public.search_office_doc_chunks(text, int);

CREATE FUNCTION public.search_office_doc_chunks(
  p_query text,
  p_limit int DEFAULT 12,
  p_library_areas text[] DEFAULT NULL,
  p_collections text[] DEFAULT NULL,
  p_doc_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(
  doc_id uuid,
  title text,
  category text,
  library_area text,
  collection text,
  chunk_index int,
  content text,
  rank real
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT c.doc_id, d.title, d.category, d.library_area, d.collection,
         c.chunk_index, c.content,
         ts_rank(c.tsv, websearch_to_tsquery('english', p_query)) AS rank
  FROM public.office_doc_chunks c
  JOIN public.office_docs d ON d.id = c.doc_id
  WHERE c.tsv @@ websearch_to_tsquery('english', p_query)
    AND (p_library_areas IS NULL OR d.library_area = ANY(p_library_areas))
    AND (p_collections IS NULL OR d.collection = ANY(p_collections))
    AND (p_doc_ids IS NULL OR d.id = ANY(p_doc_ids))
  ORDER BY rank DESC
  LIMIT p_limit;
$$;
