-- Required acknowledgments for exact published knowledge versions.
-- Acknowledgment means "I received and read this version," not agreement,
-- discipline, or proof that a person memorized the content.

-- ================================================================
-- 1. Version-owned acknowledgment settings
-- ================================================================

ALTER TABLE public.knowledge_versions
  ADD COLUMN acknowledgment_required boolean NOT NULL DEFAULT false,
  ADD COLUMN acknowledgment_due_days integer,
  ADD COLUMN acknowledgment_statement text NOT NULL DEFAULT
    'I acknowledge that I received and read this office policy or procedure.';

ALTER TABLE public.knowledge_versions
  ADD CONSTRAINT knowledge_versions_ack_due_check CHECK (
    (acknowledgment_required = false AND acknowledgment_due_days IS NULL)
    OR
    (acknowledgment_required = true AND acknowledgment_due_days BETWEEN 1 AND 90)
  ),
  ADD CONSTRAINT knowledge_versions_ack_statement_check CHECK (
    acknowledgment_required = false
    OR length(trim(acknowledgment_statement)) BETWEEN 10 AND 1000
  );

-- ================================================================
-- 2. Exact-version assignments and signatures
-- ================================================================

CREATE TABLE public.knowledge_acknowledgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  version_id uuid NOT NULL,
  user_id uuid NOT NULL,
  employee_id uuid,
  role_at_assignment text NOT NULL
    CHECK (role_at_assignment IN ('owner', 'manager', 'employee')),
  statement_snapshot text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL,
  first_viewed_at timestamptz,
  acknowledged_at timestamptz,
  signed_name text NOT NULL DEFAULT '',
  waived_at timestamptz,
  waived_reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_acknowledgments_version_fk
    FOREIGN KEY (version_id, org_id)
    REFERENCES public.knowledge_versions(id, org_id)
    ON DELETE RESTRICT,
  CONSTRAINT knowledge_acknowledgments_employee_fk
    FOREIGN KEY (employee_id, org_id)
    REFERENCES public.employees(id, org_id)
    ON DELETE SET NULL,
  CONSTRAINT knowledge_acknowledgments_state_check CHECK (
    NOT (acknowledged_at IS NOT NULL AND waived_at IS NOT NULL)
  ),
  CONSTRAINT knowledge_acknowledgments_signature_check CHECK (
    (acknowledged_at IS NULL AND signed_name = '')
    OR
    (acknowledged_at IS NOT NULL AND length(trim(signed_name)) >= 2)
  ),
  UNIQUE (version_id, user_id),
  UNIQUE (id, org_id)
);

CREATE INDEX knowledge_acknowledgments_user_due_idx
  ON public.knowledge_acknowledgments(user_id, acknowledged_at, waived_at, due_at);
CREATE INDEX knowledge_acknowledgments_org_due_idx
  ON public.knowledge_acknowledgments(org_id, acknowledged_at, waived_at, due_at);
CREATE INDEX knowledge_acknowledgments_version_idx
  ON public.knowledge_acknowledgments(version_id, acknowledged_at, waived_at);

CREATE TRIGGER touch_knowledge_acknowledgments_updated_at
  BEFORE UPDATE ON public.knowledge_acknowledgments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ================================================================
-- 3. Guard version settings and wrapper authoring RPCs
-- ================================================================

CREATE OR REPLACE FUNCTION public.guard_knowledge_version_metadata()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.item_id IS DISTINCT FROM OLD.item_id
     OR NEW.version_number IS DISTINCT FROM OLD.version_number
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Knowledge version identity fields are immutable';
  END IF;

  IF (
    NEW.title IS DISTINCT FROM OLD.title
    OR NEW.summary IS DISTINCT FROM OLD.summary
    OR NEW.category_id IS DISTINCT FROM OLD.category_id
    OR NEW.audience_roles IS DISTINCT FROM OLD.audience_roles
    OR NEW.change_summary IS DISTINCT FROM OLD.change_summary
    OR NEW.source_kind IS DISTINCT FROM OLD.source_kind
    OR NEW.based_on_version_id IS DISTINCT FROM OLD.based_on_version_id
    OR NEW.effective_on IS DISTINCT FROM OLD.effective_on
    OR NEW.review_due_on IS DISTINCT FROM OLD.review_due_on
    OR NEW.acknowledgment_required IS DISTINCT FROM OLD.acknowledgment_required
    OR NEW.acknowledgment_due_days IS DISTINCT FROM OLD.acknowledgment_due_days
    OR NEW.acknowledgment_statement IS DISTINCT FROM OLD.acknowledgment_statement
  ) THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Reviewed or published knowledge metadata is immutable';
    END IF;
    IF COALESCE(current_setting('app.knowledge_authoring', true), '') <> '1' THEN
      RAISE EXCEPTION 'Draft metadata may only be changed through guarded authoring actions';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.configure_knowledge_acknowledgment(
  p_version_id uuid,
  p_required boolean,
  p_due_days integer DEFAULT NULL,
  p_statement text DEFAULT NULL
)
RETURNS public.knowledge_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version public.knowledge_versions;
  v_role text;
  v_statement text;
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
    RAISE EXCEPTION 'Only an owner or manager may configure acknowledgments';
  END IF;
  IF v_version.status <> 'draft' THEN
    RAISE EXCEPTION 'Acknowledgment settings can only change while the version is a draft';
  END IF;

  IF p_required THEN
    IF p_due_days IS NULL OR p_due_days NOT BETWEEN 1 AND 90 THEN
      RAISE EXCEPTION 'Choose an acknowledgment deadline from 1 to 90 days';
    END IF;
    v_statement := trim(COALESCE(NULLIF(p_statement, ''),
      'I acknowledge that I received and read this office policy or procedure.'));
    IF length(v_statement) NOT BETWEEN 10 AND 1000 THEN
      RAISE EXCEPTION 'The acknowledgment statement must be 10 to 1000 characters';
    END IF;
  ELSE
    p_due_days := NULL;
    v_statement := 'I acknowledge that I received and read this office policy or procedure.';
  END IF;

  PERFORM set_config('app.knowledge_authoring', '1', true);
  UPDATE public.knowledge_versions
  SET acknowledgment_required = p_required,
      acknowledgment_due_days = p_due_days,
      acknowledgment_statement = v_statement
  WHERE id = p_version_id
  RETURNING * INTO v_version;

  RETURN v_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_knowledge_draft_with_acknowledgment(
  p_org_id uuid,
  p_kind text,
  p_title text,
  p_summary text DEFAULT '',
  p_category_id uuid DEFAULT NULL,
  p_audience_roles text[] DEFAULT ARRAY['owner', 'manager', 'employee']::text[],
  p_blocks jsonb DEFAULT '[{"block_type":"paragraph","plain_text":"Start writing here.","data":{}}]'::jsonb,
  p_acknowledgment_required boolean DEFAULT false,
  p_acknowledgment_due_days integer DEFAULT NULL,
  p_acknowledgment_statement text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_id uuid;
  v_version_id uuid;
BEGIN
  v_item_id := public.create_knowledge_draft(
    p_org_id, p_kind, p_title, p_summary, p_category_id,
    p_audience_roles, p_blocks
  );

  SELECT id INTO v_version_id
  FROM public.knowledge_versions
  WHERE item_id = v_item_id
    AND org_id = p_org_id
    AND status = 'draft'
  ORDER BY version_number DESC
  LIMIT 1;

  PERFORM public.configure_knowledge_acknowledgment(
    v_version_id,
    p_acknowledgment_required,
    p_acknowledgment_due_days,
    p_acknowledgment_statement
  );

  RETURN v_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_knowledge_draft_with_acknowledgment(
  p_version_id uuid,
  p_title text,
  p_summary text DEFAULT '',
  p_category_id uuid DEFAULT NULL,
  p_audience_roles text[] DEFAULT ARRAY['owner', 'manager', 'employee']::text[],
  p_change_summary text DEFAULT '',
  p_blocks jsonb DEFAULT '[]'::jsonb,
  p_acknowledgment_required boolean DEFAULT false,
  p_acknowledgment_due_days integer DEFAULT NULL,
  p_acknowledgment_statement text DEFAULT NULL
)
RETURNS public.knowledge_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version public.knowledge_versions;
BEGIN
  v_version := public.save_knowledge_draft(
    p_version_id, p_title, p_summary, p_category_id,
    p_audience_roles, p_change_summary, p_blocks
  );

  v_version := public.configure_knowledge_acknowledgment(
    p_version_id,
    p_acknowledgment_required,
    p_acknowledgment_due_days,
    p_acknowledgment_statement
  );

  RETURN v_version;
END;
$$;

REVOKE ALL ON FUNCTION public.configure_knowledge_acknowledgment(uuid, boolean, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_knowledge_draft_with_acknowledgment(uuid, text, text, text, uuid, text[], jsonb, boolean, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_knowledge_draft_with_acknowledgment(uuid, text, text, uuid, text[], text, jsonb, boolean, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.configure_knowledge_acknowledgment(uuid, boolean, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_knowledge_draft_with_acknowledgment(uuid, text, text, text, uuid, text[], jsonb, boolean, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_knowledge_draft_with_acknowledgment(uuid, text, text, uuid, text[], text, jsonb, boolean, integer, text) TO authenticated;

-- ================================================================
-- 4. Assignment creation and role-change synchronization
-- ================================================================

CREATE OR REPLACE FUNCTION public.create_knowledge_acknowledgment_assignments(
  p_version_id uuid,
  p_only_user_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version public.knowledge_versions;
  v_created integer := 0;
BEGIN
  SELECT * INTO v_version
  FROM public.knowledge_versions
  WHERE id = p_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Knowledge version not found';
  END IF;
  IF v_version.status <> 'published' OR NOT v_version.acknowledgment_required THEN
    RETURN 0;
  END IF;

  WITH eligible AS (
    SELECT
      m.user_id,
      m.role::text AS role_at_assignment,
      e.id AS employee_id
    FROM public.org_members m
    LEFT JOIN public.employees e
      ON e.org_id = m.org_id
     AND e.user_id = m.user_id
     AND e.employment_status = 'active'
    WHERE m.org_id = v_version.org_id
      AND m.status = 'active'
      AND m.role::text = ANY(v_version.audience_roles)
      AND (p_only_user_id IS NULL OR m.user_id = p_only_user_id)
  ), inserted AS (
    INSERT INTO public.knowledge_acknowledgments (
      org_id, version_id, user_id, employee_id, role_at_assignment,
      statement_snapshot, due_at
    )
    SELECT
      v_version.org_id,
      v_version.id,
      eligible.user_id,
      eligible.employee_id,
      eligible.role_at_assignment,
      v_version.acknowledgment_statement,
      now() + make_interval(days => v_version.acknowledgment_due_days)
    FROM eligible
    ON CONFLICT (version_id, user_id) DO NOTHING
    RETURNING id, org_id, user_id, due_at
  ), notified AS (
    INSERT INTO public.notifications (
      org_id, recipient_user_id, notification_type,
      title, message, related_table, related_id
    )
    SELECT
      inserted.org_id,
      inserted.user_id,
      'knowledge_acknowledgment_required',
      'Office acknowledgment required',
      format('A published office policy or procedure needs your acknowledgment by %s.',
        to_char(inserted.due_at AT TIME ZONE 'America/New_York', 'Mon DD, YYYY')),
      'knowledge_acknowledgments',
      inserted.id
    FROM inserted
    RETURNING id
  )
  SELECT count(*) INTO v_created FROM inserted;

  RETURN v_created;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_knowledge_acknowledgments_for_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version_id uuid;
BEGIN
  IF NEW.status = 'active' THEN
    FOR v_version_id IN
      SELECT v.id
      FROM public.knowledge_versions v
      JOIN public.knowledge_items i
        ON i.current_published_version_id = v.id
       AND i.org_id = v.org_id
      WHERE v.org_id = NEW.org_id
        AND v.status = 'published'
        AND v.acknowledgment_required
        AND NEW.role::text = ANY(v.audience_roles)
    LOOP
      PERFORM public.create_knowledge_acknowledgment_assignments(v_version_id, NEW.user_id);
    END LOOP;
  END IF;

  UPDATE public.knowledge_acknowledgments a
  SET waived_at = now(),
      waived_reason = CASE
        WHEN NEW.status <> 'active' THEN 'Membership is no longer active.'
        ELSE 'The member role is no longer in this version''s required audience.'
      END
  FROM public.knowledge_versions v
  WHERE a.version_id = v.id
    AND a.org_id = NEW.org_id
    AND a.user_id = NEW.user_id
    AND a.acknowledged_at IS NULL
    AND a.waived_at IS NULL
    AND (
      NEW.status <> 'active'
      OR NOT (NEW.role::text = ANY(v.audience_roles))
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_knowledge_acknowledgments_for_member
  ON public.org_members;
CREATE TRIGGER sync_knowledge_acknowledgments_for_member
  AFTER INSERT OR UPDATE OF status, role
  ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_knowledge_acknowledgments_for_member();

REVOKE ALL ON FUNCTION public.create_knowledge_acknowledgment_assignments(uuid, uuid) FROM PUBLIC, authenticated, anon;

-- ================================================================
-- 5. Exact-user view and signature actions
-- ================================================================

CREATE OR REPLACE FUNCTION public.mark_knowledge_acknowledgment_viewed(p_assignment_id uuid)
RETURNS public.knowledge_acknowledgments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.knowledge_acknowledgments;
BEGIN
  SELECT * INTO v_assignment
  FROM public.knowledge_acknowledgments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acknowledgment assignment not found';
  END IF;
  IF v_assignment.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the assigned person can mark this version viewed';
  END IF;
  IF v_assignment.waived_at IS NOT NULL THEN
    RETURN v_assignment;
  END IF;

  UPDATE public.knowledge_acknowledgments
  SET first_viewed_at = COALESCE(first_viewed_at, now())
  WHERE id = p_assignment_id
  RETURNING * INTO v_assignment;

  RETURN v_assignment;
END;
$$;

CREATE OR REPLACE FUNCTION public.acknowledge_knowledge_version(
  p_assignment_id uuid,
  p_typed_name text
)
RETURNS public.knowledge_acknowledgments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.knowledge_acknowledgments;
  v_clean_name text := trim(COALESCE(p_typed_name, ''));
  v_is_current boolean;
BEGIN
  IF length(v_clean_name) < 2 THEN
    RAISE EXCEPTION 'Type your full name to acknowledge';
  END IF;

  SELECT * INTO v_assignment
  FROM public.knowledge_acknowledgments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acknowledgment assignment not found';
  END IF;
  IF v_assignment.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the assigned person can acknowledge this version';
  END IF;
  IF v_assignment.waived_at IS NOT NULL THEN
    RAISE EXCEPTION 'This acknowledgment is no longer required';
  END IF;
  IF v_assignment.acknowledged_at IS NOT NULL THEN
    RAISE EXCEPTION 'This version is already acknowledged';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.knowledge_items i
    JOIN public.knowledge_versions v
      ON v.id = i.current_published_version_id
     AND v.item_id = i.id
     AND v.org_id = i.org_id
    WHERE v.id = v_assignment.version_id
      AND v.status = 'published'
  ) INTO v_is_current;

  IF NOT v_is_current THEN
    RAISE EXCEPTION 'A newer version is now published; acknowledge the current version instead';
  END IF;

  UPDATE public.knowledge_acknowledgments
  SET first_viewed_at = COALESCE(first_viewed_at, now()),
      acknowledged_at = now(),
      signed_name = v_clean_name
  WHERE id = p_assignment_id
  RETURNING * INTO v_assignment;

  UPDATE public.notifications
  SET is_read = true
  WHERE recipient_user_id = auth.uid()
    AND related_table = 'knowledge_acknowledgments'
    AND related_id = p_assignment_id;

  INSERT INTO public.audit_events (
    user_id, org_id, employee_id, actor_id, event_type, action_type,
    target_table, target_id, after_json
  ) VALUES (
    auth.uid(),
    v_assignment.org_id,
    v_assignment.employee_id,
    auth.uid(),
    'knowledge_version_acknowledged',
    'update',
    'knowledge_acknowledgments',
    v_assignment.id,
    jsonb_build_object(
      'version_id', v_assignment.version_id,
      'acknowledged_at', v_assignment.acknowledged_at,
      'was_overdue', v_assignment.acknowledged_at > v_assignment.due_at
    )
  );

  RETURN v_assignment;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_knowledge_acknowledgment_viewed(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.acknowledge_knowledge_version(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_knowledge_acknowledgment_viewed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_knowledge_version(uuid, text) TO authenticated;

-- ================================================================
-- 6. Publication creates exact-version assignments
-- ================================================================

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
    based_on_version_id, created_by,
    title, summary, category_id, audience_roles,
    acknowledgment_required, acknowledgment_due_days, acknowledgment_statement
  ) VALUES (
    v_item.org_id, p_item_id, v_next_number, 'draft', 'manual',
    v_source.id, auth.uid(),
    v_source.title, v_source.summary, v_source.category_id, v_source.audience_roles,
    v_source.acknowledgment_required, v_source.acknowledgment_due_days,
    v_source.acknowledgment_statement
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

    UPDATE public.knowledge_acknowledgments
    SET waived_at = now(),
        waived_reason = 'A newer version was published before acknowledgment.'
    WHERE version_id = v_previous_id
      AND acknowledged_at IS NULL
      AND waived_at IS NULL;
  END IF;

  UPDATE public.knowledge_versions
  SET status = 'published',
      published_by = auth.uid(),
      published_at = now()
  WHERE id = p_version_id
  RETURNING * INTO v_version;

  UPDATE public.knowledge_items
  SET current_published_version_id = v_version.id,
      title = v_version.title,
      summary = v_version.summary,
      category_id = v_version.category_id,
      audience_roles = v_version.audience_roles
  WHERE id = v_version.item_id;

  PERFORM public.create_knowledge_acknowledgment_assignments(v_version.id, NULL);

  INSERT INTO public.audit_events (
    user_id, org_id, actor_id, event_type, action_type,
    target_table, target_id, before_json, after_json
  ) VALUES (
    auth.uid(), v_version.org_id, auth.uid(), 'knowledge_version_published', 'update',
    'knowledge_versions', v_version.id,
    jsonb_build_object('previous_version_id', v_previous_id),
    jsonb_build_object(
      'published_version_id', v_version.id,
      'version_number', v_version.version_number,
      'acknowledgment_required', v_version.acknowledgment_required
    )
  );

  RETURN v_version;
END;
$$;

-- ================================================================
-- 7. RLS: assigned person + administrators, RPC-only writes
-- ================================================================

ALTER TABLE public.knowledge_acknowledgments ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.knowledge_acknowledgments TO authenticated;
GRANT ALL ON public.knowledge_acknowledgments TO service_role;

CREATE POLICY "Users read own knowledge acknowledgments"
  ON public.knowledge_acknowledgments FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins read organization knowledge acknowledgments"
  ON public.knowledge_acknowledgments FOR SELECT
  TO authenticated
  USING (public.is_org_admin(org_id));

COMMENT ON TABLE public.knowledge_acknowledgments IS
  'Exact-version receipt acknowledgments. Signatures are server-stamped by the assigned user and never imply agreement or discipline.';
