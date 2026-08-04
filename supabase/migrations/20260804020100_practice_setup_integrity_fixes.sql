-- Integrity hardening found during pre-merge review.

-- A resolved finding is history, not a uniqueness blocker. Allow the same
-- underlying condition to be surfaced by a later rescan only when it still
-- exists, while preventing duplicate open findings in one scan.
DO $migration$
DECLARE
  v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.practice_setup_findings'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) = 'UNIQUE (session_id, finding_type, group_key)';

  IF v_constraint IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.practice_setup_findings DROP CONSTRAINT %I',
      v_constraint
    );
  END IF;
END
$migration$;

CREATE UNIQUE INDEX practice_setup_one_open_finding_per_group_idx
  ON public.practice_setup_findings(session_id, finding_type, group_key)
  WHERE status = 'open';

-- The converted version must belong to the converted item, not merely to the
-- same organization.
ALTER TABLE public.practice_setup_sources
  DROP CONSTRAINT IF EXISTS practice_setup_sources_version_fk;
ALTER TABLE public.practice_setup_sources
  ADD CONSTRAINT practice_setup_sources_version_item_fk
  FOREIGN KEY (converted_version_id, org_id, converted_item_id)
  REFERENCES public.knowledge_versions(id, org_id, item_id)
  ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.convert_practice_setup_source(
  p_source_id uuid,
  p_title text,
  p_summary text,
  p_blocks jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source public.practice_setup_sources;
  v_doc public.office_docs;
  v_role text;
  v_item_id uuid;
  v_version_id uuid;
  v_excerpt text;
BEGIN
  SELECT * INTO v_source
  FROM public.practice_setup_sources
  WHERE id = p_source_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Practice Setup source not found';
  END IF;

  SELECT role::text INTO v_role
  FROM public.org_members
  WHERE org_id = v_source.org_id
    AND user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;

  IF v_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Only an owner or manager may create a governed draft';
  END IF;
  IF v_source.status <> 'confirmed'
     OR v_source.confirmed_action NOT IN ('policy', 'procedure') THEN
    RAISE EXCEPTION 'Confirm this source as a policy or procedure before converting it';
  END IF;
  IF v_source.confirmed_category_id IS NULL THEN
    RAISE EXCEPTION 'A governed destination category is required';
  END IF;

  SELECT * INTO v_doc
  FROM public.office_docs
  WHERE id = v_source.office_doc_id
    AND org_id = v_source.org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source document not found';
  END IF;
  IF v_doc.char_count > 120000 THEN
    RAISE EXCEPTION 'This large source must be broken into focused policies or procedures';
  END IF;
  IF jsonb_typeof(p_blocks) <> 'array'
     OR jsonb_array_length(p_blocks) = 0 THEN
    RAISE EXCEPTION 'At least one converted content block is required';
  END IF;
  IF jsonb_array_length(p_blocks) > 180 THEN
    RAISE EXCEPTION 'This source produced too many blocks for one governed item';
  END IF;

  v_item_id := public.create_knowledge_draft(
    v_source.org_id,
    v_source.confirmed_action,
    p_title,
    p_summary,
    v_source.confirmed_category_id,
    ARRAY['owner', 'manager', 'employee']::text[],
    p_blocks
  );

  SELECT id INTO v_version_id
  FROM public.knowledge_versions
  WHERE item_id = v_item_id
    AND org_id = v_source.org_id
    AND status = 'draft'
  ORDER BY version_number DESC
  LIMIT 1;

  IF v_version_id IS NULL THEN
    RAISE EXCEPTION 'The governed draft version was not created';
  END IF;

  SELECT left(content, 600) INTO v_excerpt
  FROM public.office_doc_chunks
  WHERE doc_id = v_doc.id
    AND org_id = v_source.org_id
  ORDER BY chunk_index
  LIMIT 1;

  INSERT INTO public.knowledge_evidence (
    org_id, version_id, office_doc_id, relation, excerpt,
    source_label, confidence, created_by
  ) VALUES (
    v_source.org_id,
    v_version_id,
    v_doc.id,
    'supports',
    COALESCE(v_excerpt, ''),
    v_doc.title,
    1,
    auth.uid()
  );

  UPDATE public.practice_setup_sources
  SET status = 'converted',
      converted_item_id = v_item_id,
      converted_version_id = v_version_id
  WHERE id = p_source_id;

  INSERT INTO public.audit_events (
    user_id, org_id, actor_id, event_type, action_type,
    target_table, target_id, after_json
  ) VALUES (
    auth.uid(), v_source.org_id, auth.uid(), 'practice_setup_source_converted', 'insert',
    'knowledge_items', v_item_id,
    jsonb_build_object(
      'source_id', p_source_id,
      'office_doc_id', v_doc.id,
      'version_id', v_version_id,
      'remains_draft', true
    )
  );

  RETURN v_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_practice_setup_finding(
  p_finding_id uuid,
  p_status text
)
RETURNS public.practice_setup_findings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_finding public.practice_setup_findings;
  v_role text;
BEGIN
  IF p_status NOT IN ('resolved', 'dismissed') THEN
    RAISE EXCEPTION 'Finding status must be resolved or dismissed';
  END IF;

  SELECT * INTO v_finding
  FROM public.practice_setup_findings
  WHERE id = p_finding_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Practice Setup finding not found';
  END IF;

  SELECT role::text INTO v_role
  FROM public.org_members
  WHERE org_id = v_finding.org_id
    AND user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;

  IF v_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Only an owner or manager may resolve setup findings';
  END IF;
  IF v_finding.status <> 'open' THEN
    RAISE EXCEPTION 'Only an open setup finding can be resolved or dismissed';
  END IF;

  UPDATE public.practice_setup_findings
  SET status = p_status,
      resolved_by = auth.uid(),
      resolved_at = now()
  WHERE id = p_finding_id
  RETURNING * INTO v_finding;

  INSERT INTO public.audit_events (
    user_id, org_id, actor_id, event_type, action_type,
    target_table, target_id, after_json
  ) VALUES (
    auth.uid(), v_finding.org_id, auth.uid(), 'practice_setup_finding_closed', 'update',
    'practice_setup_findings', v_finding.id,
    jsonb_build_object('status', p_status, 'finding_type', v_finding.finding_type)
  );

  RETURN v_finding;
END;
$$;
