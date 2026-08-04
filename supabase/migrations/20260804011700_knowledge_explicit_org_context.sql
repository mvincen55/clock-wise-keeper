-- Creation must target the organization selected by the application. Choosing
-- an arbitrary first membership becomes unsafe as soon as a consultant, owner,
-- or support user belongs to more than one practice.

DROP FUNCTION public.ensure_default_knowledge_categories();
DROP FUNCTION public.create_knowledge_draft(text, text, text, uuid, text[], jsonb);

CREATE FUNCTION public.ensure_default_knowledge_categories(p_org_id uuid)
RETURNS SETOF public.knowledge_categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role::text INTO v_role
  FROM public.org_members
  WHERE org_id = p_org_id
    AND user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;

  IF v_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Only an owner or manager may set up the knowledge library';
  END IF;

  INSERT INTO public.knowledge_categories (
    org_id, area, name, slug, description, sort_order, created_by
  ) VALUES
    (p_org_id, 'handbook', 'Welcome & Culture', 'welcome-culture', 'Who we are and how we work together.', 10, auth.uid()),
    (p_org_id, 'handbook', 'Employment & Attendance', 'employment-attendance', 'Scheduling, attendance, time off, and employment expectations.', 20, auth.uid()),
    (p_org_id, 'handbook', 'Compensation & Benefits', 'compensation-benefits', 'Pay, benefits, and employee programs.', 30, auth.uid()),
    (p_org_id, 'handbook', 'Conduct & Safety', 'conduct-safety', 'Professional conduct, workplace safety, and required protections.', 40, auth.uid()),
    (p_org_id, 'handbook', 'Communication & Accountability', 'communication-accountability', 'How decisions, feedback, and follow-through are handled.', 50, auth.uid()),
    (p_org_id, 'playbook', 'Front Desk', 'front-desk', 'Scheduling, phones, patient communication, and front-office workflows.', 10, auth.uid()),
    (p_org_id, 'playbook', 'Clinical Support', 'clinical-support', 'Dental assistant, sterilization, room, and clinical support procedures.', 20, auth.uid()),
    (p_org_id, 'playbook', 'Hygiene', 'hygiene', 'Hygiene workflows, handoffs, and patient education.', 30, auth.uid()),
    (p_org_id, 'playbook', 'Doctor Workflows', 'doctor-workflows', 'Clinical communication, exams, treatment planning, and handoffs.', 40, auth.uid()),
    (p_org_id, 'playbook', 'Insurance & Billing', 'insurance-billing', 'Claims, estimates, financial communication, and billing workflows.', 50, auth.uid()),
    (p_org_id, 'playbook', 'Daily Operations', 'daily-operations', 'Opening, huddle, checklists, deposits, and closeout.', 60, auth.uid()),
    (p_org_id, 'playbook', 'Emergency & Compliance', 'emergency-compliance', 'Emergency response, compliance, and required office controls.', 70, auth.uid())
  ON CONFLICT (org_id, area, slug) DO NOTHING;

  RETURN QUERY
  SELECT *
  FROM public.knowledge_categories
  WHERE org_id = p_org_id
  ORDER BY area, sort_order, name;
END;
$$;

CREATE FUNCTION public.create_knowledge_draft(
  p_org_id uuid,
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
  v_role text;
  v_item_id uuid;
  v_version_id uuid;
  v_slug text;
  v_block jsonb;
  v_index integer := 0;
BEGIN
  SELECT role::text INTO v_role
  FROM public.org_members
  WHERE org_id = p_org_id
    AND user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;

  IF v_role NOT IN ('owner', 'manager') THEN
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

  PERFORM public.knowledge_assert_category_matches_kind(p_org_id, p_category_id, p_kind);
  PERFORM public.knowledge_validate_blocks(p_blocks);
  v_slug := public.knowledge_unique_slug(p_org_id, p_kind, p_title, NULL);

  INSERT INTO public.knowledge_items (
    org_id, category_id, kind, title, slug, summary,
    audience_roles, created_by
  ) VALUES (
    p_org_id, p_category_id, p_kind, trim(p_title), v_slug,
    trim(COALESCE(p_summary, '')), p_audience_roles, auth.uid()
  ) RETURNING id INTO v_item_id;

  INSERT INTO public.knowledge_versions (
    org_id, item_id, version_number, status, source_kind, created_by,
    title, summary, category_id, audience_roles
  ) VALUES (
    p_org_id, v_item_id, 1, 'draft', 'manual', auth.uid(),
    trim(p_title), trim(COALESCE(p_summary, '')), p_category_id, p_audience_roles
  ) RETURNING id INTO v_version_id;

  FOR v_block IN SELECT value FROM jsonb_array_elements(p_blocks)
  LOOP
    INSERT INTO public.knowledge_blocks (
      org_id, version_id, block_key, block_type, sort_order,
      plain_text, data
    ) VALUES (
      p_org_id,
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
    auth.uid(), p_org_id, auth.uid(), 'knowledge_draft_created', 'insert',
    'knowledge_items', v_item_id,
    jsonb_build_object('kind', p_kind, 'title', trim(p_title), 'version_id', v_version_id)
  );

  RETURN v_item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_default_knowledge_categories(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_knowledge_draft(uuid, text, text, text, uuid, text[], jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_default_knowledge_categories(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_knowledge_draft(uuid, text, text, text, uuid, text[], jsonb) TO authenticated;

-- These tenant-aware internals are called only by guarded security-definer
-- actions. They are not part of the public client API.
REVOKE ALL ON FUNCTION public.knowledge_unique_slug(uuid, text, text, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.knowledge_assert_category_matches_kind(uuid, uuid, text) FROM authenticated;

COMMENT ON FUNCTION public.create_knowledge_draft(uuid, text, text, text, uuid, text[], jsonb) IS
  'Creates a governed draft in the explicitly selected organization after verifying the caller is an active owner or manager there.';
