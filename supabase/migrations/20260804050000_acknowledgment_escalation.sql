-- Schedule-aware, transparent escalation for exact-version acknowledgments.
-- Routine reminders respect the assigned person's actual work schedule, days off,
-- call-outs, office closures, and quiet hours. Blocking, snoozing, and questions
-- are explicit, reasoned states rather than silent ways to evade accountability.

-- ================================================================
-- 1. Office-level escalation settings
-- ================================================================

CREATE TABLE public.knowledge_acknowledgment_escalation_settings (
  org_id uuid PRIMARY KEY REFERENCES public.orgs(id) ON DELETE CASCADE,
  routine_reminders_enabled boolean NOT NULL DEFAULT true,
  quiet_hours_start time NOT NULL DEFAULT '19:00',
  quiet_hours_end time NOT NULL DEFAULT '07:00',
  email_after_workdays integer NOT NULL DEFAULT 1
    CHECK (email_after_workdays BETWEEN 0 AND 10),
  manager_after_workdays integer NOT NULL DEFAULT 2
    CHECK (manager_after_workdays BETWEEN 0 AND 20),
  owner_after_workdays integer NOT NULL DEFAULT 2
    CHECK (owner_after_workdays BETWEEN 0 AND 20),
  max_snoozes integer NOT NULL DEFAULT 2
    CHECK (max_snoozes BETWEEN 0 AND 5),
  max_snooze_workdays integer NOT NULL DEFAULT 3
    CHECK (max_snooze_workdays BETWEEN 1 AND 10),
  question_pauses_escalation boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.knowledge_acknowledgment_escalation_settings (org_id)
SELECT id FROM public.orgs
ON CONFLICT (org_id) DO NOTHING;

CREATE TRIGGER touch_knowledge_acknowledgment_escalation_settings
  BEFORE UPDATE ON public.knowledge_acknowledgment_escalation_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.knowledge_acknowledgment_escalation_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.knowledge_acknowledgment_escalation_settings TO authenticated;
GRANT ALL ON public.knowledge_acknowledgment_escalation_settings TO service_role;

CREATE POLICY "Members read acknowledgment escalation settings"
  ON public.knowledge_acknowledgment_escalation_settings FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

-- ================================================================
-- 2. Assignment pause, question, and escalation state
-- ================================================================

ALTER TABLE public.knowledge_acknowledgments
  ADD COLUMN blocked_at timestamptz,
  ADD COLUMN blocked_reason text NOT NULL DEFAULT '',
  ADD COLUMN blocking_user_id uuid,
  ADD COLUMN snoozed_until timestamptz,
  ADD COLUMN snooze_reason text NOT NULL DEFAULT '',
  ADD COLUMN snooze_count integer NOT NULL DEFAULT 0,
  ADD COLUMN question_text text NOT NULL DEFAULT '',
  ADD COLUMN question_asked_at timestamptz,
  ADD COLUMN question_resolved_at timestamptz,
  ADD COLUMN question_resolution text NOT NULL DEFAULT '',
  ADD COLUMN escalation_level smallint NOT NULL DEFAULT 0,
  ADD COLUMN overdue_at timestamptz,
  ADD COLUMN last_escalated_at timestamptz,
  ADD COLUMN next_escalation_at timestamptz;

ALTER TABLE public.knowledge_acknowledgments
  ADD CONSTRAINT knowledge_acknowledgments_block_check CHECK (
    (blocked_at IS NULL AND blocked_reason = '' AND blocking_user_id IS NULL)
    OR
    (blocked_at IS NOT NULL AND length(trim(blocked_reason)) BETWEEN 5 AND 1000)
  ),
  ADD CONSTRAINT knowledge_acknowledgments_snooze_check CHECK (
    snooze_count BETWEEN 0 AND 5
    AND (
      (snoozed_until IS NULL AND snooze_reason = '')
      OR
      (snoozed_until IS NOT NULL AND length(trim(snooze_reason)) BETWEEN 5 AND 1000)
    )
  ),
  ADD CONSTRAINT knowledge_acknowledgments_question_check CHECK (
    (question_asked_at IS NULL AND question_text = '' AND question_resolved_at IS NULL AND question_resolution = '')
    OR
    (
      question_asked_at IS NOT NULL
      AND length(trim(question_text)) BETWEEN 5 AND 2000
      AND (
        (question_resolved_at IS NULL AND question_resolution = '')
        OR
        (question_resolved_at IS NOT NULL AND length(trim(question_resolution)) BETWEEN 3 AND 4000)
      )
    )
  ),
  ADD CONSTRAINT knowledge_acknowledgments_escalation_level_check CHECK (
    escalation_level BETWEEN 0 AND 4
  );

UPDATE public.knowledge_acknowledgments
SET next_escalation_at = due_at
WHERE acknowledged_at IS NULL
  AND waived_at IS NULL
  AND next_escalation_at IS NULL;

CREATE INDEX knowledge_acknowledgments_escalation_due_idx
  ON public.knowledge_acknowledgments(next_escalation_at, escalation_level)
  WHERE acknowledged_at IS NULL AND waived_at IS NULL;

-- ================================================================
-- 3. Immutable escalation receipt
-- ================================================================

CREATE TABLE public.knowledge_acknowledgment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL,
  event_key text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'assigned', 'viewed', 'blocked', 'unblocked', 'snoozed',
    'question_asked', 'question_resolved', 'overdue', 'acknowledged',
    'waived', 'reminder_in_app', 'reminder_email_queued',
    'manager_escalated', 'owner_escalated', 'reactivated'
  )),
  channel text NOT NULL DEFAULT 'system'
    CHECK (channel IN ('system', 'in_app', 'email', 'sms')),
  actor_user_id uuid,
  recipient_user_id uuid,
  detail text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_acknowledgment_events_assignment_fk
    FOREIGN KEY (assignment_id, org_id)
    REFERENCES public.knowledge_acknowledgments(id, org_id)
    ON DELETE RESTRICT,
  UNIQUE (org_id, event_key)
);

CREATE INDEX knowledge_acknowledgment_events_assignment_idx
  ON public.knowledge_acknowledgment_events(assignment_id, created_at, id);

ALTER TABLE public.knowledge_acknowledgment_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.knowledge_acknowledgment_events TO authenticated;
GRANT ALL ON public.knowledge_acknowledgment_events TO service_role;

CREATE POLICY "Subjects and admins read acknowledgment receipts"
  ON public.knowledge_acknowledgment_events FOR SELECT
  TO authenticated
  USING (
    public.is_org_admin(org_id)
    OR EXISTS (
      SELECT 1
      FROM public.knowledge_acknowledgments a
      WHERE a.id = assignment_id
        AND a.org_id = knowledge_acknowledgment_events.org_id
        AND a.user_id = auth.uid()
        AND public.is_org_member(a.org_id)
    )
  );

-- ================================================================
-- 4. Work-calendar helpers
-- ================================================================

CREATE OR REPLACE FUNCTION public.knowledge_user_work_context(
  p_org_id uuid,
  p_user_id uuid,
  p_date date
)
RETURNS TABLE(
  is_working boolean,
  reason text,
  work_timezone text,
  work_start time,
  work_end time
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_timezone text := COALESCE(public.get_user_timezone(p_user_id), 'America/New_York');
  v_schedule record;
  v_legacy record;
  v_day_off_type text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.org_members m
    WHERE m.org_id = p_org_id
      AND m.user_id = p_user_id
      AND m.status = 'active'
  ) THEN
    RETURN QUERY SELECT false, 'inactive_membership'::text, v_timezone, NULL::time, NULL::time;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.office_closures c
    WHERE c.org_id = p_org_id
      AND c.closure_date = p_date
  ) OR EXISTS (
    SELECT 1 FROM public.days_off d
    WHERE d.org_id = p_org_id
      AND d.user_id = p_user_id
      AND d.date_start <= p_date
      AND d.date_end >= p_date
      AND d.type = 'office_closed'
  ) THEN
    RETURN QUERY SELECT false, 'office_closed'::text, v_timezone, NULL::time, NULL::time;
    RETURN;
  END IF;

  SELECT d.type::text INTO v_day_off_type
  FROM public.days_off d
  WHERE d.org_id = p_org_id
    AND d.user_id = p_user_id
    AND d.date_start <= p_date
    AND d.date_end >= p_date
    AND d.type <> 'office_closed'
  ORDER BY d.created_at DESC
  LIMIT 1;

  IF v_day_off_type IS NOT NULL THEN
    RETURN QUERY SELECT false, ('day_off:' || v_day_off_type)::text, v_timezone, NULL::time, NULL::time;
    RETURN;
  END IF;

  SELECT * INTO v_schedule
  FROM public.get_schedule_for_date(p_user_id, p_date)
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT
      COALESCE(v_schedule.enabled, false),
      CASE WHEN COALESCE(v_schedule.enabled, false)
        THEN 'assigned_schedule'::text ELSE 'scheduled_off'::text END,
      COALESCE(v_schedule.timezone, v_timezone),
      v_schedule.start_time,
      v_schedule.end_time;
    RETURN;
  END IF;

  SELECT ws.enabled, ws.start_time, ws.end_time INTO v_legacy
  FROM public.work_schedule ws
  WHERE ws.user_id = p_user_id
    AND ws.weekday = EXTRACT(DOW FROM p_date)::smallint
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT
      COALESCE(v_legacy.enabled, false),
      CASE WHEN COALESCE(v_legacy.enabled, false)
        THEN 'legacy_schedule'::text ELSE 'scheduled_off'::text END,
      v_timezone,
      v_legacy.start_time,
      v_legacy.end_time;
    RETURN;
  END IF;

  -- An owner or manager may not have entered a personal schedule yet. Keep the
  -- workflow moving with a transparent Monday-Friday fallback instead of
  -- silently exempting leadership from deadlines.
  IF EXTRACT(DOW FROM p_date)::integer BETWEEN 1 AND 5 THEN
    RETURN QUERY SELECT true, 'weekday_fallback'::text, v_timezone, '09:00'::time, '17:00'::time;
  ELSE
    RETURN QUERY SELECT false, 'weekend_fallback'::text, v_timezone, NULL::time, NULL::time;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.knowledge_add_working_days(
  p_org_id uuid,
  p_user_id uuid,
  p_start timestamptz,
  p_workdays integer,
  p_target_time time DEFAULT '17:00'
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_timezone text := COALESCE(public.get_user_timezone(p_user_id), 'America/New_York');
  v_local_date date := (p_start AT TIME ZONE v_timezone)::date;
  v_local_time time := (p_start AT TIME ZONE v_timezone)::time;
  v_context record;
  v_count integer := 0;
  v_checked integer := 0;
  v_target_date date;
BEGIN
  IF p_workdays < 0 OR p_workdays > 60 THEN
    RAISE EXCEPTION 'Working-day offset must be between 0 and 60';
  END IF;

  IF p_workdays = 0 THEN
    SELECT * INTO v_context
    FROM public.knowledge_user_work_context(p_org_id, p_user_id, v_local_date);
    IF v_context.is_working AND v_local_time < p_target_time THEN
      v_target_date := v_local_date;
    END IF;
  END IF;

  WHILE v_target_date IS NULL LOOP
    v_local_date := v_local_date + 1;
    v_checked := v_checked + 1;
    IF v_checked > 180 THEN
      RAISE EXCEPTION 'No working date could be found within 180 days';
    END IF;

    SELECT * INTO v_context
    FROM public.knowledge_user_work_context(p_org_id, p_user_id, v_local_date);

    IF v_context.is_working THEN
      v_count := v_count + 1;
      IF v_count >= GREATEST(p_workdays, 1) THEN
        v_target_date := v_local_date;
      END IF;
    END IF;
  END LOOP;

  RETURN (v_target_date::text || ' ' || p_target_time::text)::timestamp AT TIME ZONE v_timezone;
END;
$$;

CREATE OR REPLACE FUNCTION public.knowledge_routine_notice_window(
  p_org_id uuid,
  p_user_id uuid,
  p_at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_timezone text := COALESCE(public.get_user_timezone(p_user_id), 'America/New_York');
  v_local_date date := (p_at AT TIME ZONE v_timezone)::date;
  v_local_time time := (p_at AT TIME ZONE v_timezone)::time;
  v_context record;
  v_settings public.knowledge_acknowledgment_escalation_settings;
  v_quiet boolean;
  v_in_shift boolean;
BEGIN
  SELECT * INTO v_settings
  FROM public.knowledge_acknowledgment_escalation_settings
  WHERE org_id = p_org_id;

  IF FOUND AND NOT v_settings.routine_reminders_enabled THEN
    RETURN false;
  END IF;

  SELECT * INTO v_context
  FROM public.knowledge_user_work_context(p_org_id, p_user_id, v_local_date);

  IF NOT COALESCE(v_context.is_working, false) THEN
    RETURN false;
  END IF;

  IF v_context.work_start IS NULL OR v_context.work_end IS NULL THEN
    v_in_shift := true;
  ELSIF v_context.work_start <= v_context.work_end THEN
    v_in_shift := v_local_time >= v_context.work_start AND v_local_time <= v_context.work_end;
  ELSE
    v_in_shift := v_local_time >= v_context.work_start OR v_local_time <= v_context.work_end;
  END IF;

  IF NOT v_in_shift THEN
    RETURN false;
  END IF;

  IF COALESCE(v_settings.quiet_hours_start, '19:00'::time)
     <= COALESCE(v_settings.quiet_hours_end, '07:00'::time) THEN
    v_quiet := v_local_time >= COALESCE(v_settings.quiet_hours_start, '19:00'::time)
      AND v_local_time < COALESCE(v_settings.quiet_hours_end, '07:00'::time);
  ELSE
    v_quiet := v_local_time >= COALESCE(v_settings.quiet_hours_start, '19:00'::time)
      OR v_local_time < COALESCE(v_settings.quiet_hours_end, '07:00'::time);
  END IF;

  RETURN NOT v_quiet;
END;
$$;

REVOKE ALL ON FUNCTION public.knowledge_user_work_context(uuid, uuid, date)
  FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.knowledge_add_working_days(uuid, uuid, timestamptz, integer, time)
  FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.knowledge_routine_notice_window(uuid, uuid, timestamptz)
  FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_user_work_context(uuid, uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.knowledge_add_working_days(uuid, uuid, timestamptz, integer, time) TO service_role;
GRANT EXECUTE ON FUNCTION public.knowledge_routine_notice_window(uuid, uuid, timestamptz) TO service_role;

-- ================================================================
-- 5. Guarded receipt and settings actions
-- ================================================================

CREATE OR REPLACE FUNCTION public.knowledge_record_acknowledgment_event(
  p_assignment_id uuid,
  p_event_key text,
  p_event_type text,
  p_channel text DEFAULT 'system',
  p_actor_user_id uuid DEFAULT NULL,
  p_recipient_user_id uuid DEFAULT NULL,
  p_detail text DEFAULT '',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_inserted boolean := false;
BEGIN
  SELECT org_id INTO v_org_id
  FROM public.knowledge_acknowledgments
  WHERE id = p_assignment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acknowledgment assignment not found';
  END IF;

  INSERT INTO public.knowledge_acknowledgment_events (
    org_id, assignment_id, event_key, event_type, channel,
    actor_user_id, recipient_user_id, detail, metadata
  ) VALUES (
    v_org_id, p_assignment_id, p_event_key, p_event_type, p_channel,
    p_actor_user_id, p_recipient_user_id, COALESCE(p_detail, ''), COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (org_id, event_key) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_knowledge_acknowledgment_escalation_settings(
  p_org_id uuid,
  p_routine_reminders_enabled boolean,
  p_quiet_hours_start time,
  p_quiet_hours_end time,
  p_email_after_workdays integer,
  p_manager_after_workdays integer,
  p_owner_after_workdays integer,
  p_max_snoozes integer,
  p_max_snooze_workdays integer,
  p_question_pauses_escalation boolean
)
RETURNS public.knowledge_acknowledgment_escalation_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.knowledge_acknowledgment_escalation_settings;
BEGIN
  IF NOT public.is_org_admin(p_org_id) THEN
    RAISE EXCEPTION 'Only an owner or manager may change escalation settings';
  END IF;

  INSERT INTO public.knowledge_acknowledgment_escalation_settings (
    org_id, routine_reminders_enabled, quiet_hours_start, quiet_hours_end,
    email_after_workdays, manager_after_workdays, owner_after_workdays,
    max_snoozes, max_snooze_workdays, question_pauses_escalation
  ) VALUES (
    p_org_id, p_routine_reminders_enabled, p_quiet_hours_start, p_quiet_hours_end,
    p_email_after_workdays, p_manager_after_workdays, p_owner_after_workdays,
    p_max_snoozes, p_max_snooze_workdays, p_question_pauses_escalation
  )
  ON CONFLICT (org_id) DO UPDATE SET
    routine_reminders_enabled = EXCLUDED.routine_reminders_enabled,
    quiet_hours_start = EXCLUDED.quiet_hours_start,
    quiet_hours_end = EXCLUDED.quiet_hours_end,
    email_after_workdays = EXCLUDED.email_after_workdays,
    manager_after_workdays = EXCLUDED.manager_after_workdays,
    owner_after_workdays = EXCLUDED.owner_after_workdays,
    max_snoozes = EXCLUDED.max_snoozes,
    max_snooze_workdays = EXCLUDED.max_snooze_workdays,
    question_pauses_escalation = EXCLUDED.question_pauses_escalation
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.knowledge_record_acknowledgment_event(uuid, text, text, text, uuid, uuid, text, jsonb)
  FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.save_knowledge_acknowledgment_escalation_settings(uuid, boolean, time, time, integer, integer, integer, integer, integer, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.knowledge_record_acknowledgment_event(uuid, text, text, text, uuid, uuid, text, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.save_knowledge_acknowledgment_escalation_settings(uuid, boolean, time, time, integer, integer, integer, integer, integer, boolean)
  TO authenticated;

-- ================================================================
-- 6. Member and reviewer actions
-- ================================================================

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
BEGIN
  IF length(v_reason) NOT BETWEEN 5 AND 1000 THEN
    RAISE EXCEPTION 'Explain what is blocking this in 5 to 1000 characters';
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

  IF p_blocking_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.org_members m
    WHERE m.org_id = v_assignment.org_id
      AND m.user_id = p_blocking_user_id
      AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'The selected blocker is not an active member of this office';
  END IF;

  UPDATE public.knowledge_acknowledgments
  SET blocked_at = now(),
      blocked_reason = v_reason,
      blocking_user_id = p_blocking_user_id,
      snoozed_until = NULL,
      snooze_reason = '',
      next_escalation_at = NULL
  WHERE id = p_assignment_id
  RETURNING * INTO v_assignment;

  PERFORM public.knowledge_record_acknowledgment_event(
    v_assignment.id,
    'blocked:' || v_assignment.id || ':' || extract(epoch from v_assignment.blocked_at)::bigint,
    'blocked', 'system', auth.uid(), p_blocking_user_id,
    v_reason,
    jsonb_build_object('blocking_user_id', p_blocking_user_id)
  );

  INSERT INTO public.notifications (
    org_id, recipient_user_id, notification_type, title, message,
    related_table, related_id
  )
  SELECT v_assignment.org_id, m.user_id, 'knowledge_acknowledgment_blocked',
    'An acknowledgment is blocked',
    format('“%s” is waiting on something before it can be completed: %s',
      v_assignment.title_snapshot, left(v_reason, 240)),
    'knowledge_acknowledgments', v_assignment.id
  FROM public.org_members m
  WHERE m.org_id = v_assignment.org_id
    AND m.status = 'active'
    AND m.role IN ('owner', 'manager')
    AND m.user_id <> auth.uid()
    AND (p_blocking_user_id IS NULL OR m.user_id = p_blocking_user_id OR m.role = 'owner');

  RETURN v_assignment;
END;
$$;

CREATE OR REPLACE FUNCTION public.unblock_knowledge_acknowledgment(
  p_assignment_id uuid,
  p_note text DEFAULT ''
)
RETURNS public.knowledge_acknowledgments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.knowledge_acknowledgments;
  v_note text := trim(COALESCE(p_note, ''));
BEGIN
  SELECT * INTO v_assignment
  FROM public.knowledge_acknowledgments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Acknowledgment assignment not found'; END IF;
  IF auth.uid() <> v_assignment.user_id
     AND auth.uid() IS DISTINCT FROM v_assignment.blocking_user_id
     AND NOT public.is_org_admin(v_assignment.org_id) THEN
    RAISE EXCEPTION 'Only the assigned person, named blocker, owner, or manager may clear this block';
  END IF;
  IF v_assignment.blocked_at IS NULL THEN
    RETURN v_assignment;
  END IF;

  UPDATE public.knowledge_acknowledgments
  SET blocked_at = NULL,
      blocked_reason = '',
      blocking_user_id = NULL,
      next_escalation_at = GREATEST(now(), due_at)
  WHERE id = p_assignment_id
  RETURNING * INTO v_assignment;

  PERFORM public.knowledge_record_acknowledgment_event(
    v_assignment.id,
    'unblocked:' || v_assignment.id || ':' || extract(epoch from now())::bigint,
    'unblocked', 'system', auth.uid(), v_assignment.user_id,
    v_note,
    '{}'::jsonb
  );

  INSERT INTO public.notifications (
    org_id, recipient_user_id, notification_type, title, message,
    related_table, related_id
  ) VALUES (
    v_assignment.org_id, v_assignment.user_id, 'knowledge_acknowledgment_unblocked',
    'Your acknowledgment can move again',
    CASE WHEN v_note = '' THEN 'The block was cleared.' ELSE left(v_note, 300) END,
    'knowledge_acknowledgments', v_assignment.id
  );

  RETURN v_assignment;
END;
$$;

CREATE OR REPLACE FUNCTION public.snooze_knowledge_acknowledgment(
  p_assignment_id uuid,
  p_reason text,
  p_workdays integer
)
RETURNS public.knowledge_acknowledgments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.knowledge_acknowledgments;
  v_settings public.knowledge_acknowledgment_escalation_settings;
  v_reason text := trim(COALESCE(p_reason, ''));
  v_until timestamptz;
BEGIN
  IF length(v_reason) NOT BETWEEN 5 AND 1000 THEN
    RAISE EXCEPTION 'Give a visible snooze reason in 5 to 1000 characters';
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
  IF v_assignment.blocked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Clear the block before snoozing this acknowledgment';
  END IF;
  IF v_assignment.question_asked_at IS NOT NULL AND v_assignment.question_resolved_at IS NULL THEN
    RAISE EXCEPTION 'This acknowledgment is already paused for an unanswered question';
  END IF;

  SELECT * INTO v_settings
  FROM public.knowledge_acknowledgment_escalation_settings
  WHERE org_id = v_assignment.org_id;

  IF v_assignment.snooze_count >= COALESCE(v_settings.max_snoozes, 2) THEN
    RAISE EXCEPTION 'This acknowledgment has reached the office snooze limit';
  END IF;
  IF p_workdays < 1 OR p_workdays > COALESCE(v_settings.max_snooze_workdays, 3) THEN
    RAISE EXCEPTION 'Choose a snooze from 1 to % working days', COALESCE(v_settings.max_snooze_workdays, 3);
  END IF;

  v_until := public.knowledge_add_working_days(
    v_assignment.org_id, v_assignment.user_id, now(), p_workdays, '09:00'::time
  );

  UPDATE public.knowledge_acknowledgments
  SET snoozed_until = v_until,
      snooze_reason = v_reason,
      snooze_count = snooze_count + 1,
      next_escalation_at = v_until
  WHERE id = p_assignment_id
  RETURNING * INTO v_assignment;

  PERFORM public.knowledge_record_acknowledgment_event(
    v_assignment.id,
    'snoozed:' || v_assignment.id || ':' || v_assignment.snooze_count,
    'snoozed', 'system', auth.uid(), auth.uid(),
    v_reason,
    jsonb_build_object('until', v_until, 'workdays', p_workdays, 'snooze_count', v_assignment.snooze_count)
  );

  RETURN v_assignment;
END;
$$;

CREATE OR REPLACE FUNCTION public.ask_knowledge_acknowledgment_question(
  p_assignment_id uuid,
  p_question text
)
RETURNS public.knowledge_acknowledgments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.knowledge_acknowledgments;
  v_settings public.knowledge_acknowledgment_escalation_settings;
  v_question text := trim(COALESCE(p_question, ''));
BEGIN
  IF length(v_question) NOT BETWEEN 5 AND 2000 THEN
    RAISE EXCEPTION 'Ask a clear question in 5 to 2000 characters';
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
  IF v_assignment.question_asked_at IS NOT NULL AND v_assignment.question_resolved_at IS NULL THEN
    RAISE EXCEPTION 'An unanswered question is already open for this version';
  END IF;

  SELECT * INTO v_settings
  FROM public.knowledge_acknowledgment_escalation_settings
  WHERE org_id = v_assignment.org_id;

  UPDATE public.knowledge_acknowledgments
  SET question_text = v_question,
      question_asked_at = now(),
      question_resolved_at = NULL,
      question_resolution = '',
      next_escalation_at = CASE
        WHEN COALESCE(v_settings.question_pauses_escalation, true) THEN NULL
        ELSE next_escalation_at
      END
  WHERE id = p_assignment_id
  RETURNING * INTO v_assignment;

  PERFORM public.knowledge_record_acknowledgment_event(
    v_assignment.id,
    'question:' || v_assignment.id || ':' || extract(epoch from v_assignment.question_asked_at)::bigint,
    'question_asked', 'system', auth.uid(), NULL,
    v_question,
    jsonb_build_object('pauses_escalation', COALESCE(v_settings.question_pauses_escalation, true))
  );

  INSERT INTO public.notifications (
    org_id, recipient_user_id, notification_type, title, message,
    related_table, related_id
  )
  SELECT v_assignment.org_id, m.user_id, 'knowledge_acknowledgment_question',
    'A policy question needs an answer',
    format('Question about “%s”: %s', v_assignment.title_snapshot, left(v_question, 260)),
    'knowledge_acknowledgments', v_assignment.id
  FROM public.org_members m
  WHERE m.org_id = v_assignment.org_id
    AND m.status = 'active'
    AND m.role IN ('owner', 'manager')
    AND m.user_id <> auth.uid();

  RETURN v_assignment;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_knowledge_acknowledgment_question(
  p_assignment_id uuid,
  p_resolution text
)
RETURNS public.knowledge_acknowledgments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.knowledge_acknowledgments;
  v_resolution text := trim(COALESCE(p_resolution, ''));
BEGIN
  IF length(v_resolution) NOT BETWEEN 3 AND 4000 THEN
    RAISE EXCEPTION 'Document the answer in 3 to 4000 characters';
  END IF;

  SELECT * INTO v_assignment
  FROM public.knowledge_acknowledgments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Acknowledgment assignment not found'; END IF;
  IF NOT public.is_org_admin(v_assignment.org_id) OR auth.uid() = v_assignment.user_id THEN
    RAISE EXCEPTION 'A different owner or manager must answer this question';
  END IF;
  IF v_assignment.question_asked_at IS NULL OR v_assignment.question_resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'There is no open question to resolve';
  END IF;

  UPDATE public.knowledge_acknowledgments
  SET question_resolved_at = now(),
      question_resolution = v_resolution,
      next_escalation_at = GREATEST(now(), due_at)
  WHERE id = p_assignment_id
  RETURNING * INTO v_assignment;

  PERFORM public.knowledge_record_acknowledgment_event(
    v_assignment.id,
    'question-resolved:' || v_assignment.id || ':' || extract(epoch from v_assignment.question_resolved_at)::bigint,
    'question_resolved', 'system', auth.uid(), v_assignment.user_id,
    v_resolution,
    '{}'::jsonb
  );

  INSERT INTO public.notifications (
    org_id, recipient_user_id, notification_type, title, message,
    related_table, related_id
  ) VALUES (
    v_assignment.org_id, v_assignment.user_id, 'knowledge_acknowledgment_question_answered',
    'Your policy question was answered', left(v_resolution, 300),
    'knowledge_acknowledgments', v_assignment.id
  );

  RETURN v_assignment;
END;
$$;

REVOKE ALL ON FUNCTION public.block_knowledge_acknowledgment(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unblock_knowledge_acknowledgment(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.snooze_knowledge_acknowledgment(uuid, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ask_knowledge_acknowledgment_question(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_knowledge_acknowledgment_question(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.block_knowledge_acknowledgment(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unblock_knowledge_acknowledgment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.snooze_knowledge_acknowledgment(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ask_knowledge_acknowledgment_question(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_knowledge_acknowledgment_question(uuid, text) TO authenticated;

-- ================================================================
-- 7. Exact-version signing with an optional simultaneous question
-- ================================================================

CREATE OR REPLACE FUNCTION public.mark_knowledge_acknowledgment_viewed(p_assignment_id uuid)
RETURNS public.knowledge_acknowledgments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.knowledge_acknowledgments;
  v_was_viewed boolean;
BEGIN
  SELECT *, first_viewed_at IS NOT NULL INTO v_assignment, v_was_viewed
  FROM public.knowledge_acknowledgments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Acknowledgment assignment not found'; END IF;
  IF v_assignment.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the assigned person can mark this version viewed';
  END IF;
  IF v_assignment.waived_at IS NOT NULL THEN RETURN v_assignment; END IF;
  IF NOT public.knowledge_acknowledgment_user_is_eligible(v_assignment) THEN
    RAISE EXCEPTION 'This acknowledgment is no longer assigned to an active eligible member';
  END IF;

  UPDATE public.knowledge_acknowledgments
  SET first_viewed_at = COALESCE(first_viewed_at, now())
  WHERE id = p_assignment_id
  RETURNING * INTO v_assignment;

  IF NOT v_was_viewed THEN
    PERFORM public.knowledge_record_acknowledgment_event(
      v_assignment.id,
      'viewed:' || v_assignment.id,
      'viewed', 'system', auth.uid(), auth.uid(),
      'The assigned person opened the exact published version.',
      '{}'::jsonb
    );
  END IF;

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

  IF NOT FOUND THEN RAISE EXCEPTION 'Acknowledgment assignment not found'; END IF;
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
      signed_name = v_clean_name,
      blocked_at = NULL,
      blocked_reason = '',
      blocking_user_id = NULL,
      snoozed_until = NULL,
      snooze_reason = '',
      next_escalation_at = NULL
  WHERE id = p_assignment_id
  RETURNING * INTO v_assignment;

  UPDATE public.notifications
  SET is_read = true
  WHERE recipient_user_id = auth.uid()
    AND related_table = 'knowledge_acknowledgments'
    AND related_id = p_assignment_id;

  PERFORM public.knowledge_record_acknowledgment_event(
    v_assignment.id,
    'acknowledged:' || v_assignment.id,
    'acknowledged', 'system', auth.uid(), auth.uid(),
    format('Version %s was acknowledged by %s.', v_assignment.version_number_snapshot, v_clean_name),
    jsonb_build_object('was_overdue', v_assignment.acknowledged_at > v_assignment.due_at)
  );

  INSERT INTO public.audit_events (
    user_id, org_id, employee_id, actor_id, event_type, action_type,
    target_table, target_id, after_json
  ) VALUES (
    auth.uid(), v_assignment.org_id, v_assignment.employee_id, auth.uid(),
    'knowledge_version_acknowledged', 'update',
    'knowledge_acknowledgments', v_assignment.id,
    jsonb_build_object(
      'version_id', v_assignment.version_id,
      'acknowledged_at', v_assignment.acknowledged_at,
      'was_overdue', v_assignment.acknowledged_at > v_assignment.due_at,
      'question_open', v_assignment.question_asked_at IS NOT NULL AND v_assignment.question_resolved_at IS NULL
    )
  );

  RETURN v_assignment;
END;
$$;

CREATE OR REPLACE FUNCTION public.acknowledge_knowledge_version_with_question(
  p_assignment_id uuid,
  p_typed_name text,
  p_question text DEFAULT NULL
)
RETURNS public.knowledge_acknowledgments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_question text := trim(COALESCE(p_question, ''));
  v_assignment public.knowledge_acknowledgments;
BEGIN
  IF v_question <> '' THEN
    PERFORM public.ask_knowledge_acknowledgment_question(p_assignment_id, v_question);
  END IF;
  v_assignment := public.acknowledge_knowledge_version(p_assignment_id, p_typed_name);
  RETURN v_assignment;
END;
$$;

REVOKE ALL ON FUNCTION public.acknowledge_knowledge_version_with_question(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_knowledge_version_with_question(uuid, text, text)
  TO authenticated;

-- ================================================================
-- 8. Future assignments use working-day deadlines and reset pause state
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

  IF NOT FOUND THEN RAISE EXCEPTION 'Knowledge version not found'; END IF;
  IF v_version.status <> 'published' OR NOT v_version.acknowledgment_required THEN
    RETURN 0;
  END IF;

  WITH eligible AS (
    SELECT
      m.user_id,
      m.role::text AS role_at_assignment,
      e.id AS employee_id,
      public.knowledge_add_working_days(
        v_version.org_id, m.user_id, now(), v_version.acknowledgment_due_days, '17:00'::time
      ) AS due_at
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
      statement_snapshot, title_snapshot, version_number_snapshot,
      due_at, next_escalation_at
    )
    SELECT
      v_version.org_id, v_version.id, eligible.user_id, eligible.employee_id,
      eligible.role_at_assignment, v_version.acknowledgment_statement,
      v_version.title, v_version.version_number,
      eligible.due_at, eligible.due_at
    FROM eligible
    ON CONFLICT (version_id, user_id) DO UPDATE SET
      employee_id = EXCLUDED.employee_id,
      role_at_assignment = EXCLUDED.role_at_assignment,
      statement_snapshot = EXCLUDED.statement_snapshot,
      title_snapshot = EXCLUDED.title_snapshot,
      version_number_snapshot = EXCLUDED.version_number_snapshot,
      assigned_at = now(),
      due_at = EXCLUDED.due_at,
      first_viewed_at = NULL,
      waived_at = NULL,
      waived_reason = '',
      signed_name = '',
      blocked_at = NULL,
      blocked_reason = '',
      blocking_user_id = NULL,
      snoozed_until = NULL,
      snooze_reason = '',
      snooze_count = 0,
      question_text = '',
      question_asked_at = NULL,
      question_resolved_at = NULL,
      question_resolution = '',
      escalation_level = 0,
      overdue_at = NULL,
      last_escalated_at = NULL,
      next_escalation_at = EXCLUDED.due_at
    WHERE knowledge_acknowledgments.acknowledged_at IS NULL
      AND knowledge_acknowledgments.waived_at IS NOT NULL
    RETURNING id, org_id, user_id, due_at, title_snapshot, assigned_at
  ), notified AS (
    INSERT INTO public.notifications (
      org_id, recipient_user_id, notification_type,
      title, message, related_table, related_id
    )
    SELECT
      assigned.org_id, assigned.user_id,
      'knowledge_acknowledgment_required',
      'Office acknowledgment required',
      format('“%s” needs your acknowledgment by %s.',
        assigned.title_snapshot,
        to_char(assigned.due_at AT TIME ZONE public.get_user_timezone(assigned.user_id), 'Mon DD, YYYY')),
      'knowledge_acknowledgments', assigned.id
    FROM assigned
    RETURNING id
  ), evented AS (
    INSERT INTO public.knowledge_acknowledgment_events (
      org_id, assignment_id, event_key, event_type, channel,
      recipient_user_id, detail, metadata
    )
    SELECT
      assigned.org_id, assigned.id,
      'assigned:' || assigned.id || ':' || extract(epoch from assigned.assigned_at)::bigint,
      'assigned', 'in_app', assigned.user_id,
      format('Assigned with a working-day deadline of %s.', assigned.due_at),
      jsonb_build_object('due_at', assigned.due_at)
    FROM assigned
    ON CONFLICT (org_id, event_key) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO v_created FROM assigned;

  RETURN v_created;
END;
$$;

REVOKE ALL ON FUNCTION public.create_knowledge_acknowledgment_assignments(uuid, uuid)
  FROM PUBLIC, authenticated, anon;

-- Backfill one factual assignment receipt for active historical rows.
INSERT INTO public.knowledge_acknowledgment_events (
  org_id, assignment_id, event_key, event_type, channel,
  recipient_user_id, detail, metadata, created_at
)
SELECT
  a.org_id, a.id, 'assigned-backfill:' || a.id,
  'assigned', 'system', a.user_id,
  'Assignment existed before escalation receipts were enabled.',
  jsonb_build_object('due_at', a.due_at), a.assigned_at
FROM public.knowledge_acknowledgments a
ON CONFLICT (org_id, event_key) DO NOTHING;

COMMENT ON TABLE public.knowledge_acknowledgment_events IS
  'Immutable factual receipt of assignment, pause, question, reminder, escalation, and signature events.';
COMMENT ON FUNCTION public.knowledge_user_work_context(uuid, uuid, date) IS
  'Resolves whether a person is expected to work on a date using assigned schedules, days off, call-outs, closures, and a transparent weekday fallback.';
COMMENT ON FUNCTION public.knowledge_add_working_days(uuid, uuid, timestamptz, integer, time) IS
  'Adds person-specific working days rather than calendar days.';
