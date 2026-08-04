-- Membership status is part of acknowledgment eligibility. A former member
-- must not retain assignment visibility or be able to call a SECURITY DEFINER
-- signature action directly after the membership row is removed.

DROP POLICY IF EXISTS "Users read own knowledge acknowledgments"
  ON public.knowledge_acknowledgments;
CREATE POLICY "Active users read own knowledge acknowledgments"
  ON public.knowledge_acknowledgments FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND public.is_org_member(org_id)
  );

CREATE OR REPLACE FUNCTION public.knowledge_acknowledgment_user_is_eligible(
  p_assignment public.knowledge_acknowledgments
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_members m
    JOIN public.knowledge_versions v
      ON v.id = p_assignment.version_id
     AND v.org_id = p_assignment.org_id
    WHERE m.org_id = p_assignment.org_id
      AND m.user_id = p_assignment.user_id
      AND m.status = 'active'
      AND m.role::text = ANY(v.audience_roles)
  );
$$;

REVOKE ALL ON FUNCTION public.knowledge_acknowledgment_user_is_eligible(public.knowledge_acknowledgments)
  FROM PUBLIC, authenticated, anon;

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
  IF NOT public.knowledge_acknowledgment_user_is_eligible(v_assignment) THEN
    RAISE EXCEPTION 'This acknowledgment is no longer assigned to an active eligible member';
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
  IF NOT public.knowledge_acknowledgment_user_is_eligible(v_assignment) THEN
    RAISE EXCEPTION 'This acknowledgment is no longer assigned to an active eligible member';
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

CREATE OR REPLACE FUNCTION public.waive_knowledge_acknowledgments_for_deleted_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.knowledge_acknowledgments
  SET waived_at = now(),
      waived_reason = 'Membership was removed from the organization.'
  WHERE org_id = OLD.org_id
    AND user_id = OLD.user_id
    AND acknowledged_at IS NULL
    AND waived_at IS NULL;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS waive_knowledge_acknowledgments_for_deleted_member
  ON public.org_members;
CREATE TRIGGER waive_knowledge_acknowledgments_for_deleted_member
  AFTER DELETE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.waive_knowledge_acknowledgments_for_deleted_member();

REVOKE ALL ON FUNCTION public.waive_knowledge_acknowledgments_for_deleted_member()
  FROM PUBLIC, authenticated, anon;
