-- Office knowledge base: staff documents (policies, HR info, insurance
-- handbooks) with full-text search chunks powering the AI assistant.
-- These are internal business documents, NOT patient records.

CREATE TABLE public.office_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('policy', 'hr', 'insurance', 'other')),
  file_path text,
  mime_type text,
  char_count int NOT NULL DEFAULT 0,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.office_doc_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id uuid NOT NULL REFERENCES public.office_docs(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  chunk_index int NOT NULL,
  content text NOT NULL,
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
);

CREATE INDEX idx_office_docs_org ON public.office_docs(org_id, created_at DESC);
CREATE INDEX idx_office_doc_chunks_doc ON public.office_doc_chunks(doc_id, chunk_index);
CREATE INDEX idx_office_doc_chunks_tsv ON public.office_doc_chunks USING GIN(tsv);

ALTER TABLE public.office_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_doc_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read office_docs"
  ON public.office_docs FOR SELECT
  TO authenticated
  USING (is_org_member(org_id));

CREATE POLICY "Members manage office_docs"
  ON public.office_docs FOR ALL
  TO authenticated
  USING (is_org_member(org_id))
  WITH CHECK (is_org_member(org_id));

CREATE POLICY "Members read office_doc_chunks"
  ON public.office_doc_chunks FOR SELECT
  TO authenticated
  USING (is_org_member(org_id));

CREATE POLICY "Members manage office_doc_chunks"
  ON public.office_doc_chunks FOR ALL
  TO authenticated
  USING (is_org_member(org_id))
  WITH CHECK (is_org_member(org_id));

-- Ranked full-text search over the caller's visible chunks (RLS applies:
-- SECURITY INVOKER). websearch syntax: quoted phrases, OR, minus-exclusions.
CREATE OR REPLACE FUNCTION public.search_office_doc_chunks(p_query text, p_limit int DEFAULT 12)
RETURNS TABLE(doc_id uuid, title text, category text, chunk_index int, content text, rank real)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT c.doc_id, d.title, d.category, c.chunk_index, c.content,
         ts_rank(c.tsv, websearch_to_tsquery('english', p_query)) AS rank
  FROM public.office_doc_chunks c
  JOIN public.office_docs d ON d.id = c.doc_id
  WHERE c.tsv @@ websearch_to_tsquery('english', p_query)
  ORDER BY rank DESC
  LIMIT p_limit;
$$;

-- Private bucket for the original uploaded files, foldered by org id.
INSERT INTO storage.buckets (id, name, public) VALUES ('office-docs', 'office-docs', false);

CREATE POLICY "Org members upload office docs" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'office-docs'
  AND is_org_member(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Org members read office docs" ON storage.objects
FOR SELECT USING (
  bucket_id = 'office-docs'
  AND is_org_member(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Org members delete office docs" ON storage.objects
FOR DELETE USING (
  bucket_id = 'office-docs'
  AND is_org_member(((storage.foldername(name))[1])::uuid)
);
