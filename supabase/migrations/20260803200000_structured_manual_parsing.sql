-- Structured manual parsing: the Insurance Desk rebuild.
--
-- The old pipeline stored a PDF as flat text chunks with no idea what page
-- or section anything came from — so a 100-page carrier manual rendered as
-- one "section" of raw extraction. This migration adds the structure the
-- new layout-aware parser produces, without touching any existing rows:
--
--   office_doc_chunks — page/section provenance + a chunk type, plus a
--     parse_version so a re-parse can land safely NEXT TO the old
--     extraction and only then be promoted (old versions stay for
--     rollback until the version after next).
--   office_docs — insurance manual metadata (carrier, manual type,
--     effective date, current/archived status, version chain) and parse
--     bookkeeping (status, confidence, counts, parser output summary).
--
-- Everything is additive with defaults, so existing documents keep working
-- exactly as before until a manager re-parses them.

ALTER TABLE public.office_doc_chunks
  ADD COLUMN page_number int,
  ADD COLUMN page_end int,
  ADD COLUMN section_id text,
  ADD COLUMN section_title text,
  ADD COLUMN parent_section_title text,
  ADD COLUMN heading_level int,
  ADD COLUMN chunk_type text NOT NULL DEFAULT 'paragraph'
    CHECK (chunk_type IN (
      'heading', 'paragraph', 'bullet_list', 'numbered_list', 'table',
      'table_of_contents', 'notice', 'header', 'footer'
    )),
  ADD COLUMN parse_version int NOT NULL DEFAULT 1,
  ADD COLUMN meta jsonb;

CREATE INDEX idx_office_doc_chunks_version
  ON public.office_doc_chunks(doc_id, parse_version, chunk_index);

ALTER TABLE public.office_docs
  ADD COLUMN carrier text,
  ADD COLUMN manual_type text,
  ADD COLUMN effective_date date,
  ADD COLUMN doc_status text NOT NULL DEFAULT 'current'
    CHECK (doc_status IN ('current', 'archived')),
  ADD COLUMN replaces_doc_id uuid REFERENCES public.office_docs(id) ON DELETE SET NULL,
  ADD COLUMN parse_status text NOT NULL DEFAULT 'legacy'
    CHECK (parse_status IN ('legacy', 'parsed', 'fallback')),
  ADD COLUMN parse_confidence text
    CHECK (parse_confidence IN ('high', 'medium', 'low')),
  ADD COLUMN page_count int,
  ADD COLUMN section_count int,
  ADD COLUMN current_parse_version int NOT NULL DEFAULT 1,
  ADD COLUMN parse_meta jsonb,
  ADD COLUMN section_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Full-text search, now structure-aware:
--   * only the CURRENT parse version of each document is searchable
--   * furniture never matches (headers, footers, TOC rows are stored for
--     provenance but are not content)
--   * archived manuals only match when explicitly targeted by id
--   * results carry section + page so the UI and the AI can cite them
DROP FUNCTION IF EXISTS public.search_office_doc_chunks(text, int, text[], text[], uuid[]);

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
  rank real,
  page_number int,
  section_id text,
  section_title text,
  chunk_type text,
  parse_version int
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT c.doc_id, d.title, d.category, d.library_area, d.collection,
         c.chunk_index, c.content,
         ts_rank(c.tsv, websearch_to_tsquery('english', p_query)) AS rank,
         c.page_number, c.section_id, c.section_title, c.chunk_type,
         c.parse_version
  FROM public.office_doc_chunks c
  JOIN public.office_docs d ON d.id = c.doc_id
  WHERE c.tsv @@ websearch_to_tsquery('english', p_query)
    AND c.parse_version = d.current_parse_version
    AND c.chunk_type NOT IN ('header', 'footer', 'table_of_contents')
    AND (d.doc_status = 'current' OR (p_doc_ids IS NOT NULL AND d.id = ANY(p_doc_ids)))
    AND (p_library_areas IS NULL OR d.library_area = ANY(p_library_areas))
    AND (p_collections IS NULL OR d.collection = ANY(p_collections))
    AND (p_doc_ids IS NULL OR d.id = ANY(p_doc_ids))
  ORDER BY rank DESC
  LIMIT p_limit;
$$;
