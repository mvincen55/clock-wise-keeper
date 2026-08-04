-- Keep enough immutable identity on each assignment to show accurate history
-- after the underlying version is superseded.

ALTER TABLE public.knowledge_acknowledgments
  ADD COLUMN title_snapshot text NOT NULL DEFAULT '',
  ADD COLUMN version_number_snapshot integer NOT NULL DEFAULT 1
    CHECK (version_number_snapshot > 0);

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
    ON CONFLICT (version_id, user_id) DO NOTHING
    RETURNING id, org_id, user_id, due_at, title_snapshot
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
      format('“%s” needs your acknowledgment by %s.',
        inserted.title_snapshot,
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
