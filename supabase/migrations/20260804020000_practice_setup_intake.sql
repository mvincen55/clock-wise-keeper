-- Guided Practice Setup: inventory existing office documents, suggest where
-- they belong, surface possible duplicates or placement problems, and convert
-- only human-confirmed sources into governed drafts.

-- ================================================================
-- 1. Setup state
-- ================================================================

CREATE TABLE public.practice_setup_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'reviewing'
    CHECK (status IN ('reviewing', 'ready', 'completed')),
  created_by uuid NOT NULL,
  last_scanned_at timestamptz,
  completed_by uuid,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id),
  UNIQUE (id, org_id)
);

CREATE TABLE public.practice_setup_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  office_doc_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'source_only', 'excluded', 'converted')),
  suggested_action text NOT NULL
    CHECK (suggested_action IN ('policy', 'procedure', 'source_only', 'exclude', 'review')),
  confirmed_action text
    CHECK (confirmed_action IS NULL OR confirmed_action IN ('policy', 'procedure', 'source_only', 'exclude')),
  suggestion_reason text NOT NULL DEFAULT '',
  confidence numeric NOT NULL DEFAULT 0.5
    CHECK (confidence >= 0 AND confidence <= 1),
  duplicate_key text NOT NULL DEFAULT '',
  confirmed_category_id uuid,
  converted_item_id uuid,
  converted_version_id uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practice_setup_sources_session_fk
    FOREIGN KEY (session_id, org_id)
    REFERENCES public.practice_setup_sessions(id, org_id)
    ON DELETE CASCADE,
  CONSTRAINT practice_setup_sources_doc_fk
    FOREIGN KEY (office_doc_id, org_id)
    REFERENCES public.office_docs(id, org_id)
    ON DELETE RESTRICT,
  CONSTRAINT practice_setup_sources_category_fk
    FOREIGN KEY (confirmed_category_id, org_id)
    REFERENCES public.knowledge_categories(id, org_id)
    ON DELETE RESTRICT,
  CONSTRAINT practice_setup_sources_item_fk
    FOREIGN KEY (converted_item_id, org_id)
    REFERENCES public.knowledge_items(id, org_id)
    ON DELETE RESTRICT,
  CONSTRAINT practice_setup_sources_version_fk
    FOREIGN KEY (converted_version_id, org_id)
    REFERENCES public.knowledge_versions(id, org_id)
    ON DELETE RESTRICT,
  UNIQUE (session_id, office_doc_id),
  UNIQUE (id, org_id)
);

CREATE TABLE public.practice_setup_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  finding_type text NOT NULL
    CHECK (finding_type IN ('possible_duplicate', 'placement_mismatch', 'empty_document', 'large_mixed_document')),
  severity text NOT NULL DEFAULT 'review'
    CHECK (severity IN ('info', 'review', 'attention')),
  group_key text NOT NULL,
  title text NOT NULL,
  detail text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practice_setup_findings_session_fk
    FOREIGN KEY (session_id, org_id)
    REFERENCES public.practice_setup_sessions(id, org_id)
    ON DELETE CASCADE,
  UNIQUE (session_id, finding_type, group_key),
  UNIQUE (id, org_id)
);

CREATE TABLE public.practice_setup_finding_sources (
  finding_id uuid NOT NULL,
  source_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (finding_id, source_id),
  CONSTRAINT practice_setup_finding_sources_finding_fk
    FOREIGN KEY (finding_id, org_id)
    REFERENCES public.practice_setup_findings(id, org_id)
    ON DELETE CASCADE,
  CONSTRAINT practice_setup_finding_sources_source_fk
    FOREIGN KEY (source_id, org_id)
    REFERENCES public.practice_setup_sources(id, org_id)
    ON DELETE CASCADE
);

CREATE INDEX practice_setup_sources_org_status_idx
  ON public.practice_setup_sources(org_id, status, created_at);
CREATE INDEX practice_setup_sources_duplicate_idx
  ON public.practice_setup_sources(session_id, duplicate_key)
  WHERE duplicate_key <> '';
CREATE INDEX practice_setup_findings_org_status_idx
  ON public.practice_setup_findings(org_id, status, severity);

CREATE TRIGGER touch_practice_setup_sessions_updated_at
  BEFORE UPDATE ON public.practice_setup_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER touch_practice_setup_sources_updated_at
  BEFORE UPDATE ON public.practice_setup_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER touch_practice_setup_findings_updated_at
  BEFORE UPDATE ON public.practice_setup_findings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ================================================================
-- 2. Classification helpers
-- ================================================================

CREATE OR REPLACE FUNCTION public.practice_setup_duplicate_key(p_title text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_catalog
AS $$
  SELECT trim(BOTH '-' FROM regexp_replace(
    regexp_replace(
      public.knowledge_slugify(COALESCE(p_title, '')),
      '(^|-)(copy|final|new|old|updated|revised|revision|version|ver|v)(-|$)',
      '-',
      'g'
    ),
    '(^|-)(19|20)[0-9]{2}(-|$)|(^|-)v?[0-9]+(-|$)',
    '-',
    'g'
  ));
$$;

CREATE OR REPLACE FUNCTION public.practice_setup_suggest_action(
  p_title text,
  p_library_area text,
  p_collection text,
  p_char_count integer
)
RETURNS TABLE(action text, reason text, confidence numeric)
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
DECLARE
  v_title text := lower(COALESCE(p_title, ''));
BEGIN
  IF COALESCE(p_char_count, 0) = 0 THEN
    RETURN QUERY SELECT 'review', 'This source has no extracted text and needs review before it can become office knowledge.', 0.20::numeric;
    RETURN;
  END IF;

  IF v_title ~ '^\s*important\s+numbers\b' THEN
    RETURN QUERY SELECT 'source_only', 'Important Numbers already has its own office tool, so this should remain source reference material.', 0.99::numeric;
    RETURN;
  END IF;

  IF p_collection = 'insurance' THEN
    RETURN QUERY SELECT 'source_only', 'Carrier manuals belong in the Insurance Desk rather than the employee handbook or office procedure library.', 0.99::numeric;
    RETURN;
  END IF;

  IF p_collection IN ('training', 'reference') THEN
    RETURN QUERY SELECT 'source_only', 'This is useful supporting material, but not automatically an office policy or procedure.', 0.94::numeric;
    RETURN;
  END IF;

  IF p_collection IN ('handbook', 'hr') THEN
    RETURN QUERY SELECT 'policy', 'Its current document classification points to employee policy, HR, or benefits content.', 0.94::numeric;
    RETURN;
  END IF;

  IF p_collection = 'operations' THEN
    RETURN QUERY SELECT 'procedure', 'Its current document classification identifies an office procedure or SOP.', 0.94::numeric;
    RETURN;
  END IF;

  IF v_title ~ '(handbook|employee|attendance|pto|time off|vacation|benefit|dress code|conduct|harassment|payroll|policy)' THEN
    RETURN QUERY SELECT 'policy', 'The title looks like an employee expectation, benefit, or office-wide policy.', 0.72::numeric;
    RETURN;
  END IF;

  IF v_title ~ '(procedure|process|workflow|opening|closing|closeout|steril|scheduling|checklist|deposit|billing|claims|handoff|phone)' THEN
    RETURN QUERY SELECT 'procedure', 'The title looks like a repeatable dental-office workflow.', 0.72::numeric;
    RETURN;
  END IF;

  IF COALESCE(p_char_count, 0) > 120000 THEN
    RETURN QUERY SELECT 'review', 'This is a large mixed document and should be broken into focused policies or procedures instead of imported as one giant item.', 0.35::numeric;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'review', 'Purple Envelope cannot confidently place this source from its current title and classification.', 0.40::numeric;
END;
$$;

REVOKE ALL ON FUNCTION public.practice_setup_duplicate_key(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.practice_setup_suggest_action(text, text, text, integer) FROM PUBLIC;

-- ================================================================
-- 3. Setup actions
-- ================================================================

CREATE OR REPLACE FUNCTION public.initialize_practice_setup(p_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_session_id uuid;
  v_doc record;
  v_suggestion record;
  v_source_id uuid;
  v_finding_id uuid;
  v_group record;
BEGIN
  SELECT role::text INTO v_role
  FROM public.org_members
  WHERE org_id = p_org_id
    AND user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;

  IF v_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Only an owner or manager may run Practice Setup';
  END IF;

  PERFORM public.ensure_default_knowledge_categories(p_org_id);

  INSERT INTO public.practice_setup_sessions (
    org_id, status, created_by, last_scanned_at
  ) VALUES (
    p_org_id, 'reviewing', auth.uid(), now()
  )
  ON CONFLICT (org_id) DO UPDATE
  SET last_scanned_at = now(),
      status = CASE
        WHEN practice_setup_sessions.status = 'completed' THEN practice_setup_sessions.status
        ELSE 'reviewing'
      END
  RETURNING id INTO v_session_id;

  FOR v_doc IN
    SELECT id, title, library_area, collection, char_count
    FROM public.office_docs
    WHERE org_id = p_org_id
    ORDER BY created_at, id
  LOOP
    SELECT * INTO v_suggestion
    FROM public.practice_setup_suggest_action(
      v_doc.title,
      v_doc.library_area,
      v_doc.collection,
      v_doc.char_count
    );

    INSERT INTO public.practice_setup_sources (
      org_id, session_id, office_doc_id, suggested_action,
      suggestion_reason, confidence, duplicate_key
    ) VALUES (
      p_org_id,
      v_session_id,
      v_doc.id,
      v_suggestion.action,
      v_suggestion.reason,
      v_suggestion.confidence,
      public.practice_setup_duplicate_key(v_doc.title)
    )
    ON CONFLICT (session_id, office_doc_id) DO UPDATE
    SET suggested_action = CASE
          WHEN practice_setup_sources.status = 'pending' THEN EXCLUDED.suggested_action
          ELSE practice_setup_sources.suggested_action
        END,
        suggestion_reason = CASE
          WHEN practice_setup_sources.status = 'pending' THEN EXCLUDED.suggestion_reason
          ELSE practice_setup_sources.suggestion_reason
        END,
        confidence = CASE
          WHEN practice_setup_sources.status = 'pending' THEN EXCLUDED.confidence
          ELSE practice_setup_sources.confidence
        END,
        duplicate_key = EXCLUDED.duplicate_key;
  END LOOP;

  -- Findings are reproducible scan results. Preserve resolved/dismissed findings;
  -- refresh only currently open findings so rescans stay idempotent.
  DELETE FROM public.practice_setup_findings
  WHERE session_id = v_session_id
    AND status = 'open';

  FOR v_group IN
    SELECT duplicate_key, array_agg(id ORDER BY created_at) AS source_ids, count(*) AS source_count
    FROM public.practice_setup_sources
    WHERE session_id = v_session_id
      AND duplicate_key <> ''
      AND status <> 'excluded'
    GROUP BY duplicate_key
    HAVING count(*) > 1
  LOOP
    INSERT INTO public.practice_setup_findings (
      org_id, session_id, finding_type, severity, group_key, title, detail
    ) VALUES (
      p_org_id,
      v_session_id,
      'possible_duplicate',
      'review',
      v_group.duplicate_key,
      'Possible duplicate documents',
      format('%s sources have nearly the same title. Compare them before creating more than one governed draft.', v_group.source_count)
    ) RETURNING id INTO v_finding_id;

    INSERT INTO public.practice_setup_finding_sources (finding_id, source_id, org_id)
    SELECT v_finding_id, source_id, p_org_id
    FROM unnest(v_group.source_ids) AS source_id;
  END LOOP;

  FOR v_source_id IN
    SELECT s.id
    FROM public.practice_setup_sources s
    JOIN public.office_docs d ON d.id = s.office_doc_id AND d.org_id = s.org_id
    WHERE s.session_id = v_session_id
      AND d.char_count = 0
  LOOP
    INSERT INTO public.practice_setup_findings (
      org_id, session_id, finding_type, severity, group_key, title, detail
    ) VALUES (
      p_org_id, v_session_id, 'empty_document', 'attention',
      'empty-' || v_source_id::text,
      'Document has no readable text',
      'Re-upload or paste the source text before trying to create governed office knowledge.'
    ) RETURNING id INTO v_finding_id;

    INSERT INTO public.practice_setup_finding_sources (finding_id, source_id, org_id)
    VALUES (v_finding_id, v_source_id, p_org_id);
  END LOOP;

  FOR v_source_id IN
    SELECT s.id
    FROM public.practice_setup_sources s
    JOIN public.office_docs d ON d.id = s.office_doc_id AND d.org_id = s.org_id
    WHERE s.session_id = v_session_id
      AND d.char_count > 120000
      AND s.status <> 'excluded'
  LOOP
    INSERT INTO public.practice_setup_findings (
      org_id, session_id, finding_type, severity, group_key, title, detail
    ) VALUES (
      p_org_id, v_session_id, 'large_mixed_document', 'review',
      'large-' || v_source_id::text,
      'Large document needs to be broken apart',
      'A large manual should become focused policies and procedures, not one oversized office entry.'
    ) RETURNING id INTO v_finding_id;

    INSERT INTO public.practice_setup_finding_sources (finding_id, source_id, org_id)
    VALUES (v_finding_id, v_source_id, p_org_id);
  END LOOP;

  FOR v_doc IN
    SELECT s.id AS source_id, d.library_area, d.collection
    FROM public.practice_setup_sources s
    JOIN public.office_docs d ON d.id = s.office_doc_id AND d.org_id = s.org_id
    WHERE s.session_id = v_session_id
      AND (
        (d.collection = 'insurance' AND d.library_area <> 'playbook')
        OR (d.collection IN ('handbook', 'hr') AND d.library_area <> 'workplace')
        OR (d.collection = 'operations' AND d.library_area <> 'playbook')
      )
  LOOP
    INSERT INTO public.practice_setup_findings (
      org_id, session_id, finding_type, severity, group_key, title, detail
    ) VALUES (
      p_org_id, v_session_id, 'placement_mismatch', 'info',
      'placement-' || v_doc.source_id::text,
      'Source document may be filed in the wrong library',
      'Review its current Workplace or Practice Playbook placement. This does not change the source automatically.'
    ) RETURNING id INTO v_finding_id;

    INSERT INTO public.practice_setup_finding_sources (finding_id, source_id, org_id)
    VALUES (v_finding_id, v_doc.source_id, p_org_id);
  END LOOP;

  INSERT INTO public.audit_events (
    user_id, org_id, actor_id, event_type, action_type,
    target_table, target_id, after_json
  ) VALUES (
    auth.uid(), p_org_id, auth.uid(), 'practice_setup_scanned', 'update',
    'practice_setup_sessions', v_session_id,
    jsonb_build_object(
      'source_count', (SELECT count(*) FROM public.practice_setup_sources WHERE session_id = v_session_id),
      'open_findings', (SELECT count(*) FROM public.practice_setup_findings WHERE session_id = v_session_id AND status = 'open')
    )
  );

  RETURN v_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_practice_setup_source(
  p_source_id uuid,
  p_action text,
  p_category_id uuid DEFAULT NULL
)
RETURNS public.practice_setup_sources
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source public.practice_setup_sources;
  v_role text;
  v_status text;
BEGIN
  IF p_action NOT IN ('policy', 'procedure', 'source_only', 'exclude') THEN
    RAISE EXCEPTION 'Choose policy, procedure, source_only, or exclude';
  END IF;

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
    RAISE EXCEPTION 'Only an owner or manager may classify source documents';
  END IF;
  IF v_source.status = 'converted' THEN
    RAISE EXCEPTION 'This source has already been converted into a governed draft';
  END IF;

  IF p_action IN ('policy', 'procedure') THEN
    IF p_category_id IS NULL THEN
      RAISE EXCEPTION 'Choose a destination category before confirming';
    END IF;
    PERFORM public.knowledge_assert_category_matches_kind(v_source.org_id, p_category_id, p_action);
    v_status := 'confirmed';
  ELSE
    IF p_category_id IS NOT NULL THEN
      RAISE EXCEPTION 'Source-only or excluded documents do not use a governed category';
    END IF;
    v_status := CASE WHEN p_action = 'source_only' THEN 'source_only' ELSE 'excluded' END;
  END IF;

  UPDATE public.practice_setup_sources
  SET confirmed_action = p_action,
      confirmed_category_id = p_category_id,
      status = v_status,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE id = p_source_id
  RETURNING * INTO v_source;

  INSERT INTO public.audit_events (
    user_id, org_id, actor_id, event_type, action_type,
    target_table, target_id, after_json
  ) VALUES (
    auth.uid(), v_source.org_id, auth.uid(), 'practice_setup_source_classified', 'update',
    'practice_setup_sources', v_source.id,
    jsonb_build_object('action', p_action, 'category_id', p_category_id, 'status', v_status)
  );

  RETURN v_source;
END;
$$;

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
    AND status = 'draft'
  ORDER BY version_number DESC
  LIMIT 1;

  SELECT left(content, 600) INTO v_excerpt
  FROM public.office_doc_chunks
  WHERE doc_id = v_doc.id
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

  UPDATE public.practice_setup_findings
  SET status = p_status,
      resolved_by = auth.uid(),
      resolved_at = now()
  WHERE id = p_finding_id
  RETURNING * INTO v_finding;

  RETURN v_finding;
END;
$$;

-- ================================================================
-- 4. Read-only RLS; all writes use guarded RPCs
-- ================================================================

ALTER TABLE public.practice_setup_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_setup_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_setup_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_setup_finding_sources ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.practice_setup_sessions TO authenticated;
GRANT SELECT ON public.practice_setup_sources TO authenticated;
GRANT SELECT ON public.practice_setup_findings TO authenticated;
GRANT SELECT ON public.practice_setup_finding_sources TO authenticated;
GRANT ALL ON public.practice_setup_sessions TO service_role;
GRANT ALL ON public.practice_setup_sources TO service_role;
GRANT ALL ON public.practice_setup_findings TO service_role;
GRANT ALL ON public.practice_setup_finding_sources TO service_role;

CREATE POLICY "Admins read practice setup sessions"
  ON public.practice_setup_sessions FOR SELECT
  TO authenticated
  USING (public.is_org_admin(org_id));
CREATE POLICY "Admins read practice setup sources"
  ON public.practice_setup_sources FOR SELECT
  TO authenticated
  USING (public.is_org_admin(org_id));
CREATE POLICY "Admins read practice setup findings"
  ON public.practice_setup_findings FOR SELECT
  TO authenticated
  USING (public.is_org_admin(org_id));
CREATE POLICY "Admins read practice setup finding sources"
  ON public.practice_setup_finding_sources FOR SELECT
  TO authenticated
  USING (public.is_org_admin(org_id));

REVOKE ALL ON FUNCTION public.initialize_practice_setup(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_practice_setup_source(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.convert_practice_setup_source(uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_practice_setup_finding(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.initialize_practice_setup(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_practice_setup_source(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_practice_setup_source(uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_practice_setup_finding(uuid, text) TO authenticated;

COMMENT ON TABLE public.practice_setup_sources IS
  'Human-reviewed classification of uploaded office documents. Suggestions never publish content automatically.';
COMMENT ON FUNCTION public.convert_practice_setup_source(uuid, text, text, jsonb) IS
  'Creates a governed draft with source evidence. The result remains unpublished and must complete the normal review workflow.';
