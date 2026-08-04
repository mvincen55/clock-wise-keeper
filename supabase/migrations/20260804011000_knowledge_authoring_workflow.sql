-- Harden the knowledge governance workflow and add atomic authoring helpers.
-- This migration intentionally follows the foundation migration so the review
-- trail stays readable and each contract can be assessed independently.

-- ================================================================
-- 1. Shared helpers
-- ================================================================

CREATE OR REPLACE FUNCTION public.knowledge_slugify(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(
      trim(BOTH '-' FROM regexp_replace(
        regexp_replace(lower(unaccent(COALESCE(p_value, ''))), '[^a-z0-9]+', '-', 'g'),
        '-+', '-', 'g'
      )),
      ''
    ),
    'untitled'
  );
$$;

CREATE OR REPLACE FUNCTION public.knowledge_unique_slug(
  p_org_id uuid,
  p_kind text,
  p_title text,
  p_exclude_item_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base text := public.knowledge_slugify(p_title);
  v_candidate text := v_base;
  v_suffix integer := 2;
BEGIN
  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.knowledge_items i
      WHERE i.org_id = p_org_id
        AND i.kind = p_kind
        AND i.slug = v_candidate
        AND (p_exclude_item_id IS NULL OR i.id <> p_exclude_item_id)
    );
    v_candidate := v_base || '-' || v_suffix;
    v_suffix := v_suffix + 1;
  END LOOP;
  RETURN v_candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.knowledge_validate_blocks(p_blocks jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_block jsonb;
  v_type text;
  v_text text;
BEGIN
  IF jsonb_typeof(p_blocks) <> 'array' OR jsonb_array_length(p_blocks) = 0 THEN
    RAISE EXCEPTION 'At least one content block is required';
  END IF;

  FOR v_block IN SELECT value FROM jsonb_array_elements(p_blocks)
  LOOP
    IF jsonb_typeof(v_block) <> 'object' THEN
      RAISE EXCEPTION 'Each content block must be an object';
    END IF;
    v_type := COALESCE(v_block ->> 'block_type', '');
    v_text := trim(COALESCE(v_block ->> 'plain_text', ''));
    IF v_type NOT IN (
      'heading', 'paragraph', 'bullet_list', 'numbered_list', 'callout',
      'steps', 'table', 'script', 'checklist', 'image', 'divider'
    ) THEN
      RAISE EXCEPTION 'Unsupported knowledge block type: %', v_type;
    END IF;
    IF v_type <> 'divider' AND v_text = '' THEN
      RAISE EXCEPTION 'Content blocks other than dividers require text';
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.knowledge_assert_category_matches_kind(
  p_org_id uuid,
  p_category_id uuid,
  p_kind text
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_area text;
BEGIN
  IF p_category_id IS NULL THEN
    RETURN;
  END IF;

  SELECT area INTO v_area
  FROM public.knowledge_categories
  WHERE id = p_category_id
    AND org_id = p_org_id
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Knowledge category not found in this organization';
  END IF;

  IF (p_kind = 'policy' AND v_area <> 'handbook')
     OR (p_kind = 'procedure' AND v_area <> 'playbook') THEN
    RAISE EXCEPTION 'Policies belong in the Handbook and procedures belong in the Playbook';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.knowledge_slugify(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.knowledge_unique_slug(uuid, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.knowledge_validate_blocks(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.knowledge_assert_category_matches_kind(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.knowledge_slugify(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.knowledge_unique_slug(uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.knowledge_validate_blocks(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.knowledge_assert_category_matches_kind(uuid, uuid, text) TO authenticated;

-- ================================================================
-- 2. Correct and strengthen immutable workflow guards
-- ================================================================

CREATE OR REPLACE FUNCTION public.guard_knowledge_draft_content()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO v_status
    FROM public.knowledge_versions
    WHERE id = OLD.version_id;
    IF v_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'Knowledge content is immutable after review begins';
    END IF;
    RETURN OLD;
  END IF;

  SELECT status INTO v_status
  FROM public.knowledge_versions
  WHERE id = NEW.version_id;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Knowledge content is immutable after review begins';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_knowledge_version_publication_status
  ON public.knowledge_versions;
DROP FUNCTION IF EXISTS public.guard_knowledge_version_publication_status();

CREATE OR REPLACE FUNCTION public.guard_knowledge_version_workflow()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (
    NEW.status IS DISTINCT FROM OLD.status
    OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
    OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
    OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
    OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
    OR NEW.published_by IS DISTINCT FROM OLD.published_by
    OR NEW.published_at IS DISTINCT FROM OLD.published_at
  ) AND COALESCE(current_setting('app.knowledge_workflow', true), '') <> '1' THEN
    RAISE EXCEPTION 'Knowledge workflow fields may only be changed through workflow actions';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_knowledge_version_workflow
  BEFORE UPDATE ON public.knowledge_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_knowledge_version_workflow();

CREATE OR REPLACE FUNCTION public.guard_knowledge_item_category()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM public.knowledge_assert_category_matches_kind(NEW.org_id, NEW.category_id, NEW.kind);
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_knowledge_item_category
  BEFORE INSERT OR UPDATE OF category_id, kind, org_id
  ON public.knowledge_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_knowledge_item_category();

-- Reviewed decisions are written only by the guarded RPC below. Admins may
-- read them, but cannot manufacture or rewrite approval history directly.
REVOKE INSERT, UPDATE, DELETE ON public.knowledge_reviews FROM authenticated;
DROP POLICY IF EXISTS "Admins manage knowledge reviews" ON public.knowledge_reviews;
CREATE POLICY "Admins read knowledge reviews"
  ON public.knowledge_reviews FOR SELECT
  TO authenticated
  USING (public.is_org_admin(org_id));

-- ================================================================
-- 3. Default dental category structure
-- ================================================================

CREATE OR REPLACE FUNCTION public.ensure_default_knowledge_categories()
RETURNS SETOF public.knowledge_categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_role text;
BEGIN
  SELECT org_id, role::text
  INTO v_org_id, v_role
  FROM public.org_members
  WHERE user_id = auth.uid()
    AND status = 'active'
  ORDER BY created_at
  LIMIT 1;

  IF v_org_id IS NULL OR v_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Only an owner or manager may set up the knowledge library';
  END IF;

  INSERT INTO public.knowledge_categories (
    org_id, area, name, slug, description, sort_order, created_by
  ) VALUES
    (v_org_id, 'handbook', 'Welcome & Culture', 'welcome-culture', 'Who we are and how we work together.', 10, auth.uid()),
    (v_org_id, 'handbook', 'Employment & Attendance', 'employment-attendance', 'Scheduling, attendance, time off, and employment expectations.', 20, auth.uid()),
    (v_org_id, 'handbook', 'Compensation & Benefits', 'compensation-benefits', 'Pay, benefits, and employee programs.', 30, auth.uid()),
    (v_org_id, 'handbook', 'Conduct & Safety', 'conduct-safety', 'Professional conduct, workplace safety, and required protections.', 40, auth.uid()),
    (v_org_id, 'handbook', 'Communication & Accountability', 'communication-accountability', 'How decisions, feedback, and follow-through are handled.', 50, auth.uid()),
    (v_org_id, 'playbook', 'Front Desk', 'front-desk', 'Scheduling, phones, patient communication, and front-office workflows.', 10, auth.uid()),
    (v_org_id, 'playbook', 'Clinical Support', 'clinical-support', 'Dental assistant, sterilization, room, and clinical support procedures.', 20, auth.uid()),
    (v_org_id, 'playbook', 'Hygiene', 'hygiene', 'Hygiene workflows, handoffs, and patient education.', 30, auth.uid()),
    (v_org_id, 'playbook', 'Doctor Workflows', 'doctor-workflows', 'Clinical communication, exams, treatment planning, and handoffs.', 40, auth.uid()),
    (v_org_id, 'playbook', 'Insurance & Billing', 'insurance-billing', 'Claims, estimates, financial communication, and billing workflows.', 50, auth.uid()),
    (v_org_id, 'playbook', 'Daily Operations', 'daily-operations', 'Opening, huddle, checklists, deposits, and closeout.', 60, auth.uid()),
    (v_org_id, 'playbook', 'Emergency & Compliance', 'emergency-compliance', 'Emergency response, compliance, and required office controls.', 70, auth.uid())
  ON CONFLICT (org_id, area, slug) DO NOTHING;

  RETURN QUERY
  SELECT *
  FROM public.knowledge_categories
  WHERE org_id = v_org_id
  ORDER BY area, sort_order, name;
END;
$$;

-- ================================================================
-- 4. Atomic authoring actions
-- ================================================================

CREATE OR REPLACE FUNCTION public.create_knowledge_draft(
  p_kind text,
  p_title text,
  p_summary text DEFAULT '',
  p_category_id uuid DEFAULT NULL,
  p_audience_roles text[] DEFAULT ARRAY['owner', 'manager', 'employee']::text[],
  p_blocks jsonb DEFAULT '[{"block_type":"paragraph","plain_text":"Start writing here.","data":{}}]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_role text;
  v_item_id uuid;
  v_version_id uuid;
  v_slug text;
  v_block jsonb;
  v_index integer := 0;
BEGIN
  SELECT org_id, role::text
  INTO v_org_id, v_role
  FROM public.org_members
  WHERE user_id = auth.uid()
    AND status = 'active'
  ORDER BY created_at
  LIMIT 1;

  IF v_org_id IS NULL OR v_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Only an owner or manager may create knowledge';
  END IF;
  IF p_kind NOT IN ('policy', 'procedure') THEN
    RAISE EXCEPTION 'Knowledge kind must be policy or procedure';
  END IF;
  IF trim(COALESCE(p_title, '')) = '' THEN
    RAISE EXCEPTION 'A title is required';
  END IF;
  IF NOT (
    p_audience_roles <@ ARRAY['owner', 'manager', 'employee']::text[]
    AND cardinality(p_audience_roles) > 0
  ) THEN
    RAISE EXCEPTION 'Select at least one valid audience role';
  END IF;

  PERFORM public.knowledge_assert_category_matches_kind(v_org_id, p_category_id, p_kind);
  PERFORM public.knowledge_validate_blocks(p_blocks);
  v_slug := public.knowledge_unique_slug(v_org_id, p_kind, p_title, NULL);

  INSERT INTO public.knowledge_items (
    org_id, category_id, kind, title, slug, summary,
    audience_roles, created_by
  ) VALUES (
    v_org_id, p_category_id, p_kind, trim(p_title), v_slug,
    trim(COALESCE(p_summary, '')), p_audience_roles, auth.uid()
  ) RETURNING id INTO v_item_id;

  INSERT INTO public.knowledge_versions (
    org_id, item_id, version_number, status, source_kind, created_by
  ) VALUES (
    v_org_id, v_item_id, 1, 'draft', 'manual', auth.uid()
  ) RETURNING id INTO v_version_id;

  FOR v_block IN SELECT value FROM jsonb_array_elements(p_blocks)
  LOOP
    INSERT INTO public.knowledge_blocks (
      org_id, version_id, block_key, block_type, sort_order,
      plain_text, data
    ) VALUES (
      v_org_id,
      v_version_id,
      COALESCE(NULLIF(v_block ->> 'block_key', ''), gen_random_uuid()::text),
      v_block ->> 'block_type',
      v_index,
      COALESCE(v_block ->> 'plain_text', ''),
      COALESCE(v_block -> 'data', '{}'::jsonb)
    );
    v_index := v_index + 1;
  END LOOP;

  INSERT INTO public.audit_events (
    user_id, org_id, actor_id, event_type, action_type,
    target_table, target_id, after_json
  ) VALUES (
    auth.uid(), v_org_id, auth.uid(), 'knowledge_draft_created', 'insert',
    'knowledge_items', v_item_id,
    jsonb_build_object('kind', p_kind, 'title', trim(p_title), 'version_id', v_version_id)
  );

  RETURN v_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_knowledge_draft(
  p_version_id uuid,
  p_title text,
  p_summary text DEFAULT '',
  p_category_id uuid DEFAULT NULL,
  p_audience_roles text[] DEFAULT ARRAY['owner', 'manager', 'employee']::text[],
  p_change_summary text DEFAULT '',
  p_blocks jsonb DEFAULT '[]'::jsonb
)
RETURNS public.knowledge_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version public.knowledge_versions;
  v_item public.knowledge_items;
  v_role text;
  v_block jsonb;
  v_index integer := 0;
BEGIN
  SELECT * INTO v_version
  FROM public.knowledge_versions
  WHERE id = p_version_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Knowledge version not found';
  END IF;

  SELECT role::text INTO v_role
  FROM public.org_members
  WHERE org_id = v_version.org_id
    AND user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;

  IF v_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Only an owner or manager may edit knowledge';
  END IF;
  IF v_version.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft versions may be edited';
  END IF;
  IF trim(COALESCE(p_title, '')) = '' THEN
    RAISE EXCEPTION 'A title is required';
  END IF;
  IF NOT (
    p_audience_roles <@ ARRAY['owner', 'manager', 'employee']::text[]
    AND cardinality(p_audience_roles) > 0
  ) THEN
    RAISE EXCEPTION 'Select at least one valid audience role';
  END IF;

  PERFORM public.knowledge_assert_category_matches_kind(
    v_version.org_id,
    p_category_id,
    (SELECT kind FROM public.knowledge_items WHERE id = v_version.item_id)
  );
  PERFORM public.knowledge_validate_blocks(p_blocks);

  UPDATE public.knowledge_items
  SET title = trim(p_title),
      summary = trim(COALESCE(p_summary, '')),
      category_id = p_category_id,
      audience_roles = p_audience_roles
  WHERE id = v_version.item_id
  RETURNING * INTO v_item;

  UPDATE public.knowledge_versions
  SET change_summary = trim(COALESCE(p_change_summary, ''))
  WHERE id = p_version_id
  RETURNING * INTO v_version;

  DELETE FROM public.knowledge_blocks WHERE version_id = p_version_id;
  FOR v_block IN SELECT value FROM jsonb_array_elements(p_blocks)
  LOOP
    INSERT INTO public.knowledge_blocks (
      org_id, version_id, block_key, block_type, sort_order,
      plain_text, data
    ) VALUES (
      v_version.org_id,
      p_version_id,
      COALESCE(NULLIF(v_block ->> 'block_key', ''), gen_random_uuid()::text),
      v_block ->> 'block_type',
      v_index,
      COALESCE(v_block ->> 'plain_text', ''),
      COALESCE(v_block -> 'data', '{}'::jsonb)
    );
    v_index := v_index + 1;
  END LOOP;

  INSERT INTO public.audit_events (
    user_id, org_id, actor_id, event_type, action_type,
    target_table, target_id, after_json
  ) VALUES (
    auth.uid(), v_version.org_id, auth.uid(), 'knowledge_draft_saved', 'update',
    'knowledge_versions', p_version_id,
    jsonb_build_object('title', v_item.title, 'block_count', v_index)
  );

  RETURN v_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_knowledge_revision(p_item_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.knowledge_items;
  v_source public.knowledge_versions;
  v_role text;
  v_new_version_id uuid;
  v_next_number integer;
BEGIN
  SELECT * INTO v_item
  FROM public.knowledge_items
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Knowledge item not found';
  END IF;

  SELECT role::text INTO v_role
  FROM public.org_members
  WHERE org_id = v_item.org_id
    AND user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;

  IF v_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Only an owner or manager may create a revision';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.knowledge_versions
    WHERE item_id = p_item_id AND status IN ('draft', 'in_review', 'approved')
  ) THEN
    RAISE EXCEPTION 'This item already has an open revision';
  END IF;

  SELECT * INTO v_source
  FROM public.knowledge_versions
  WHERE item_id = p_item_id
    AND status IN ('published', 'superseded')
  ORDER BY version_number DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A published or superseded version is required before creating a revision';
  END IF;

  SELECT COALESCE(max(version_number), 0) + 1
  INTO v_next_number
  FROM public.knowledge_versions
  WHERE item_id = p_item_id;

  INSERT INTO public.knowledge_versions (
    org_id, item_id, version_number, status, source_kind,
    based_on_version_id, created_by
  ) VALUES (
    v_item.org_id, p_item_id, v_next_number, 'draft', 'manual',
    v_source.id, auth.uid()
  ) RETURNING id INTO v_new_version_id;

  INSERT INTO public.knowledge_blocks (
    org_id, version_id, block_key, block_type, sort_order,
    plain_text, data
  )
  SELECT
    org_id, v_new_version_id, gen_random_uuid()::text, block_type,
    sort_order, plain_text, data
  FROM public.knowledge_blocks
  WHERE version_id = v_source.id
  ORDER BY sort_order, id;

  INSERT INTO public.knowledge_evidence (
    org_id, version_id, office_doc_id, office_doc_chunk_id,
    relation, excerpt, source_label, source_page, confidence, created_by
  )
  SELECT
    org_id, v_new_version_id, office_doc_id, office_doc_chunk_id,
    relation, excerpt, source_label, source_page, confidence, auth.uid()
  FROM public.knowledge_evidence
  WHERE version_id = v_source.id;

  INSERT INTO public.audit_events (
    user_id, org_id, actor_id, event_type, action_type,
    target_table, target_id, before_json, after_json
  ) VALUES (
    auth.uid(), v_item.org_id, auth.uid(), 'knowledge_revision_created', 'insert',
    'knowledge_versions', v_new_version_id,
    jsonb_build_object('based_on_version_id', v_source.id),
    jsonb_build_object('version_number', v_next_number)
  );

  RETURN v_new_version_id;
END;
$$;

-- ================================================================
-- 5. Replace workflow RPCs with guarded security-definer versions
-- ================================================================

CREATE OR REPLACE FUNCTION public.submit_knowledge_version_for_review(p_version_id uuid)
RETURNS public.knowledge_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version public.knowledge_versions;
  v_role text;
  v_block_count integer;
BEGIN
  SELECT * INTO v_version
  FROM public.knowledge_versions
  WHERE id = p_version_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Knowledge version not found';
  END IF;

  SELECT role::text INTO v_role
  FROM public.org_members
  WHERE org_id = v_version.org_id
    AND user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;

  IF v_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Only an owner or manager may submit knowledge for review';
  END IF;
  IF v_version.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft versions may be submitted for review';
  END IF;

  SELECT count(*) INTO v_block_count
  FROM public.knowledge_blocks
  WHERE version_id = p_version_id;
  IF v_block_count = 0 THEN
    RAISE EXCEPTION 'A knowledge version must contain at least one block';
  END IF;

  PERFORM set_config('app.knowledge_workflow', '1', true);
  UPDATE public.knowledge_versions
  SET status = 'in_review',
      submitted_by = auth.uid(),
      submitted_at = now(),
      approved_by = NULL,
      approved_at = NULL
  WHERE id = p_version_id
  RETURNING * INTO v_version;

  INSERT INTO public.audit_events (
    user_id, org_id, actor_id, event_type, action_type,
    target_table, target_id, after_json
  ) VALUES (
    auth.uid(), v_version.org_id, auth.uid(), 'knowledge_review_submitted', 'update',
    'knowledge_versions', v_version.id,
    jsonb_build_object('status', v_version.status, 'version_number', v_version.version_number)
  );

  RETURN v_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_knowledge_version(
  p_version_id uuid,
  p_decision text,
  p_note text DEFAULT ''
)
RETURNS public.knowledge_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version public.knowledge_versions;
  v_role text;
  v_new_status text;
BEGIN
  IF p_decision NOT IN ('approved', 'changes_requested') THEN
    RAISE EXCEPTION 'Decision must be approved or changes_requested';
  END IF;

  SELECT * INTO v_version
  FROM public.knowledge_versions
  WHERE id = p_version_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Knowledge version not found';
  END IF;

  SELECT role::text INTO v_role
  FROM public.org_members
  WHERE org_id = v_version.org_id
    AND user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;

  IF v_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Only an owner or manager may review knowledge';
  END IF;
  IF v_version.status <> 'in_review' THEN
    RAISE EXCEPTION 'Only versions in review may be decided';
  END IF;
  IF v_version.created_by = auth.uid() THEN
    RAISE EXCEPTION 'The author cannot review their own knowledge version';
  END IF;

  INSERT INTO public.knowledge_reviews (
    org_id, version_id, reviewer_user_id, decision, note
  ) VALUES (
    v_version.org_id, v_version.id, auth.uid(), p_decision, trim(COALESCE(p_note, ''))
  )
  ON CONFLICT (version_id, reviewer_user_id)
  DO UPDATE SET
    decision = EXCLUDED.decision,
    note = EXCLUDED.note,
    decided_at = now();

  v_new_status := CASE WHEN p_decision = 'approved' THEN 'approved' ELSE 'draft' END;
  PERFORM set_config('app.knowledge_workflow', '1', true);

  UPDATE public.knowledge_versions
  SET status = v_new_status,
      approved_by = CASE WHEN p_decision = 'approved' THEN auth.uid() ELSE NULL END,
      approved_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END
  WHERE id = p_version_id
  RETURNING * INTO v_version;

  INSERT INTO public.audit_events (
    user_id, org_id, actor_id, event_type, action_type,
    target_table, target_id, after_json, reason
  ) VALUES (
    auth.uid(), v_version.org_id, auth.uid(), 'knowledge_review_decided', 'update',
    'knowledge_versions', v_version.id,
    jsonb_build_object('decision', p_decision, 'status', v_new_status),
    NULLIF(trim(COALESCE(p_note, '')), '')
  );

  RETURN v_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_knowledge_version(p_version_id uuid)
RETURNS public.knowledge_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version public.knowledge_versions;
  v_role text;
  v_previous_id uuid;
BEGIN
  SELECT * INTO v_version
  FROM public.knowledge_versions
  WHERE id = p_version_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Knowledge version not found';
  END IF;

  SELECT role::text INTO v_role
  FROM public.org_members
  WHERE org_id = v_version.org_id
    AND user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;

  IF v_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Only an owner or manager may publish knowledge';
  END IF;
  IF v_version.status <> 'approved' THEN
    RAISE EXCEPTION 'Only an approved version may be published';
  END IF;
  IF v_version.approved_by IS NULL OR v_version.approved_by = v_version.created_by THEN
    RAISE EXCEPTION 'Publication requires approval by someone other than the author';
  END IF;

  PERFORM 1 FROM public.knowledge_items
  WHERE id = v_version.item_id
  FOR UPDATE;

  SELECT id INTO v_previous_id
  FROM public.knowledge_versions
  WHERE item_id = v_version.item_id
    AND status = 'published'
  FOR UPDATE;

  PERFORM set_config('app.knowledge_workflow', '1', true);
  PERFORM set_config('app.knowledge_publish', '1', true);

  IF v_previous_id IS NOT NULL THEN
    UPDATE public.knowledge_versions
    SET status = 'superseded'
    WHERE id = v_previous_id;
  END IF;

  UPDATE public.knowledge_versions
  SET status = 'published',
      published_by = auth.uid(),
      published_at = now()
  WHERE id = p_version_id
  RETURNING * INTO v_version;

  UPDATE public.knowledge_items
  SET current_published_version_id = v_version.id
  WHERE id = v_version.item_id;

  INSERT INTO public.audit_events (
    user_id, org_id, actor_id, event_type, action_type,
    target_table, target_id, before_json, after_json
  ) VALUES (
    auth.uid(), v_version.org_id, auth.uid(), 'knowledge_version_published', 'update',
    'knowledge_versions', v_version.id,
    jsonb_build_object('previous_version_id', v_previous_id),
    jsonb_build_object('published_version_id', v_version.id, 'version_number', v_version.version_number)
  );

  RETURN v_version;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_default_knowledge_categories() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_knowledge_draft(text, text, text, uuid, text[], jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_knowledge_draft(uuid, text, text, uuid, text[], text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_knowledge_revision(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_knowledge_version_for_review(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_knowledge_version(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_knowledge_version(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.ensure_default_knowledge_categories() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_knowledge_draft(text, text, text, uuid, text[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_knowledge_draft(uuid, text, text, uuid, text[], text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_knowledge_revision(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_knowledge_version_for_review(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_knowledge_version(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_knowledge_version(uuid) TO authenticated;

COMMENT ON FUNCTION public.create_knowledge_draft(text, text, text, uuid, text[], jsonb) IS
  'Creates a canonical item, version 1 draft, structured blocks, and audit event atomically.';
COMMENT ON FUNCTION public.save_knowledge_draft(uuid, text, text, uuid, text[], text, jsonb) IS
  'Replaces a draft version content atomically. Reviewed and published versions remain immutable.';
COMMENT ON FUNCTION public.create_knowledge_revision(uuid) IS
  'Clones the latest published knowledge version into the next editable draft.';