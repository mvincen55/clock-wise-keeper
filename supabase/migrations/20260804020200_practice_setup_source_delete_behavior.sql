-- A Practice Setup scan is an inventory, not a legal hold. Deleting an
-- unconverted source document should remove its setup row. Once a source has
-- been converted, knowledge_evidence independently restricts document deletion
-- so the published/draft citation cannot be silently severed.

ALTER TABLE public.practice_setup_sources
  DROP CONSTRAINT IF EXISTS practice_setup_sources_doc_fk;
ALTER TABLE public.practice_setup_sources
  ADD CONSTRAINT practice_setup_sources_doc_fk
  FOREIGN KEY (office_doc_id, org_id)
  REFERENCES public.office_docs(id, org_id)
  ON DELETE CASCADE;

COMMENT ON CONSTRAINT practice_setup_sources_doc_fk
  ON public.practice_setup_sources IS
  'Setup inventory follows source deletion unless governed knowledge evidence preserves the source.';
