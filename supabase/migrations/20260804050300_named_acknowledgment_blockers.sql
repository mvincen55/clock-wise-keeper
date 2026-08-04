-- Preserve the human-readable blocker in the assignment and event receipt so a
-- named dependency never degrades into an opaque user UUID.

CREATE OR REPLACE FUNCTION public.block_knowledge_acknowledgment(
  p_assignment_id uuid,
  p_reason text,
  p_blocking_user_id uuid DEFAULT NULL
)
RETURNS public.knowledge_acknowledgments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.knowledge_acknowledgments;
  v_reason text := trim(COALESCE(p_reason, ''));
  v_blocker_name text;
  v_visible_reason text;
BEGIN
  IF length(v_reason) NOT BETWEEN 5 AND 900 THEN
    RAISE EXCEPTION 'Explain what is blocking this in 5 to 900 characters';
  END IF;

  SELECT * INTO v_assignment
  FROM public.knowledge_acknowledgments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND OR v_assignment.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Acknowledgment assignment not found';
  END IF;
  IF v_assignment.acknowledged_at IS NOT NULL OR v_assignment.waived_at IS NOT NULL THEN
    RAISE EXCEPTION 'This acknowledgment is no longer active';
  END IF;
  IF NOT public.knowledge_acknowledgment_user_is_eligible(v_assignment) THEN
    RAISE EXCEPTION 'This acknowledgment is no longer assigned to an active eligible member';
  END IF;

  IF p_blocking_user_id IS NOT NULL THEN
    SELECT e.display_name INTO v_blocker_name
    FROM public.org_members m
    LEFT JOIN public.employees e
      ON e.org_id = m.org_id
     AND e.user_id = m.user_id
    WHERE m.org_id = v_assignment.org_id
      AND m.user_id = p_blocking_user_id
      AND m.status = 'active'
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'The selected blocker is not an active member of this office';
    END IF;

    v_visible_reason := format(
      'Waiting on %s: %s',
      COALESCE(NULLIF(trim(v_blocker_name), ''), 'named office member'),
      v_reason
    );
  ELSE
    v_visible_reason := v_reason;
  END IF;

  UPDATE public.knowledge_acknowledgments
  SET blocked_at = now(),
      blocked_reason = v_visible_reason,
      blocking_user_id = p_blocking_user_id,
      snoozed_until = NULL,
      snooze_reason = '',
      next_escalation_at = NULL
  WHERE id = p_assignment_id
  RETURNING * INTO v_assignment;

  PERFORM public.knowledge_record_acknowledgment_event(
    v_assignment.id,
    'blocked:' || v_assignment.id || ':' || extract(epoch from v_assignment.blocked_at)::bigint,
    'blocked',
    'system',
    auth.uid(),
    p_blocking_user_id,
    v_visible_reason,
    jsonb_build_object(
      'blocking_user_id', p_blocking_user_id,
      'blocking_name_snapshot', v_blocker_name
    )
  );

  INSERT INTO public.notifications (
    org_id, recipient_user_id, notification_type, title, message,
    related_table, related_id
  )
  SELECT
    v_assignment.org_id,
    m.user_id,
    'knowledge_acknowledgment_blocked',
    'An acknowledgment is blocked',
    format('“%s” is blocked: %s', v_assignment.title_snapshot, left(v_visible_reason, 260)),
    'knowledge_acknowledgments',
    v_assignment.id
  FROM public.org_members m
  WHERE m.org_id = v_assignment.org_id
    AND m.status = 'active'
    AND m.role IN ('owner', 'manager')
    AND m.user_id <> auth.uid()
    AND (
      p_blocking_user_id IS NULL
      OR m.user_id = p_blocking_user_id
      OR m.role = 'owner'
    );

  RETURN v_assignment;
END;
$$;

REVOKE ALL ON FUNCTION public.block_knowledge_acknowledgment(uuid, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.block_knowledge_acknowledgment(uuid, text, uuid)
  TO authenticated;
