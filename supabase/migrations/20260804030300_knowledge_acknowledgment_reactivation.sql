-- When an inactive member returns or a role becomes eligible again, restore an
-- unacknowledged current-version assignment instead of letting the unique
-- version/user key leave it permanently waived.

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
  ), assigned AS (
    INSERT INTO public.knowledge_acknowledgments (
      org_id, version_id, user_id, employee_id, role_at_assignment,
      statement_snapshot, title_snapshot, version_number_snapshot, due_at
    )
    SELECT
      v_version.org_id,
      v_version.id,
      eligible.user_id,
      eligible.employee_id,
      eligible.role_at_assignment,
      v_version.acknowledgment_statement,
      v_version.title,
      v_version.version_number,
      now() + make_interval(days => v_version.acknowledgment_due_days)
    FROM eligible
    ON CONFLICT (version_id, user_id) DO UPDATE
    SET employee_id = EXCLUDED.employee_id,
        role_at_assignment = EXCLUDED.role_at_assignment,
        statement_snapshot = EXCLUDED.statement_snapshot,
        title_snapshot = EXCLUDED.title_snapshot,
        version_number_snapshot = EXCLUDED.version_number_snapshot,
        assigned_at = now(),
        due_at = EXCLUDED.due_at,
        first_viewed_at = NULL,
        waived_at = NULL,
        waived_reason = '',
        signed_name = ''
    WHERE knowledge_acknowledgments.acknowledged_at IS NULL
      AND knowledge_acknowledgments.waived_at IS NOT NULL
    RETURNING id, org_id, user_id, due_at, title_snapshot
  ), notified AS (
    INSERT INTO public.notifications (
      org_id, recipient_user_id, notification_type,
      title, message, related_table, related_id
    )
    SELECT
      assigned.org_id,
      assigned.user_id,
      'knowledge_acknowledgment_required',
      'Office acknowledgment required',
      format('“%s” needs your acknowledgment by %s.',
        assigned.title_snapshot,
        to_char(assigned.due_at AT TIME ZONE 'America/New_York', 'Mon DD, YYYY')),
      'knowledge_acknowledgments',
      assigned.id
    FROM assigned
    RETURNING id
  )
  SELECT count(*) INTO v_created FROM assigned;

  RETURN v_created;
END;
$$;

REVOKE ALL ON FUNCTION public.create_knowledge_acknowledgment_assignments(uuid, uuid)
  FROM PUBLIC, authenticated, anon;

COMMENT ON FUNCTION public.create_knowledge_acknowledgment_assignments(uuid, uuid) IS
  'Internal exact-version assignment helper; inserts new rows and reactivates only previously waived, unacknowledged rows.';
