-- Composite references include required organization and item columns. Using
-- ON DELETE SET NULL would attempt to null every referencing column and fail.
-- Governed evidence and source-version links are history, so deletion is
-- restricted instead of silently severing the trail.

ALTER TABLE public.knowledge_versions
  DROP CONSTRAINT IF EXISTS knowledge_versions_based_on_same_item_fk;
ALTER TABLE public.knowledge_versions
  ADD CONSTRAINT knowledge_versions_based_on_same_item_fk
  FOREIGN KEY (based_on_version_id, org_id, item_id)
  REFERENCES public.knowledge_versions(id, org_id, item_id)
  ON DELETE RESTRICT;

ALTER TABLE public.knowledge_evidence
  DROP CONSTRAINT IF EXISTS knowledge_evidence_office_doc_org_fk,
  DROP CONSTRAINT IF EXISTS knowledge_evidence_office_doc_chunk_org_fk;
ALTER TABLE public.knowledge_evidence
  ADD CONSTRAINT knowledge_evidence_office_doc_org_fk
    FOREIGN KEY (office_doc_id, org_id)
    REFERENCES public.office_docs(id, org_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT knowledge_evidence_office_doc_chunk_org_fk
    FOREIGN KEY (office_doc_chunk_id, org_id)
    REFERENCES public.office_doc_chunks(id, org_id)
    ON DELETE RESTRICT;

COMMENT ON CONSTRAINT knowledge_evidence_office_doc_org_fk
  ON public.knowledge_evidence IS
  'Prevents deleting a source document while a governed version cites it.';
