-- Cross-office write guards.
--
-- The 2026-09-15 isolation audit found a family of INSERT policies that check
-- only "this row is mine" (auth.uid() = created_by / user_id) and trust the
-- client-supplied org_id, employee_id, or recipient. A member of office A who
-- learns an id from office B could file a request, a tardy, a message, or a
-- notification INTO office B, where B's managers would see and act on it.
-- Every policy below now pins the row to an office the writer belongs to and
-- pins every referenced person to that same office. Two SECURITY DEFINER
-- helpers make that possible without widening what a member can read.
--
-- Also here: three intra-office integrity fixes the same audit surfaced
-- (employees could edit their own PTO accrual inputs; a checklist completion
-- could point at another office's item because of a self-comparing subquery;
-- any member could add a geofence to any office), the onboarding privacy
-- promise for work-style answers, the global attendance sweep log, and a
-- membership gate on the schedule lookup RPC.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Is _user_id an active member of _org_id?  (org_members RLS lets a member see
-- only their own row and the admins' rows, so policies cannot ask directly.)
CREATE OR REPLACE FUNCTION public.user_in_org(_org_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members m
    WHERE m.org_id = _org_id AND m.user_id = _user_id AND m.status = 'active'
  );
$$;

-- Does employee _employee_id belong to _org_id (and, when given, to _user_id)?
CREATE OR REPLACE FUNCTION public.employee_in_org(_employee_id uuid, _org_id uuid, _user_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = _employee_id
      AND e.org_id = _org_id
      AND (_user_id IS NULL OR e.user_id = _user_id)
  );
$$;

-- The office a conversation belongs to (mirrors conv_type / conv_created_by).
CREATE OR REPLACE FUNCTION public.conv_org_id(_conv uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.org_id FROM public.conversations c WHERE c.id = _conv;
$$;

REVOKE EXECUTE ON FUNCTION public.user_in_org(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.employee_in_org(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.conv_org_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_in_org(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.employee_in_org(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conv_org_id(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Requests: the row's office is mine and the employee it names is me, there.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Employee creates correction requests" ON public.correction_requests;
CREATE POLICY "Employee creates correction requests"
  ON public.correction_requests FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND public.is_org_member(org_id)
    AND public.employee_in_org(employee_id, org_id, auth.uid())
  );

DROP POLICY IF EXISTS "Employee creates own PTO requests" ON public.pto_requests;
CREATE POLICY "Employee creates own PTO requests"
  ON public.pto_requests FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND public.is_org_member(org_id)
    AND public.employee_in_org(employee_id, org_id, auth.uid())
  );

DROP POLICY IF EXISTS "Requester creates requests" ON public.change_requests;
CREATE POLICY "Requester creates requests"
  ON public.change_requests FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = requested_by
    AND public.is_org_member(org_id)
    AND public.employee_in_org(employee_id, org_id, auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Attendance self-writes: same rule. (days_off already has a trigger that
-- forces org_id/user_id from the employee row; these three did not.)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Employees insert own tardies" ON public.tardies;
CREATE POLICY "Employees insert own tardies"
  ON public.tardies FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_org_member(org_id)
    AND public.employee_in_org(employee_id, org_id, auth.uid())
  );

DROP POLICY IF EXISTS "Employees insert own attendance_day_status" ON public.attendance_day_status;
CREATE POLICY "Employees insert own attendance_day_status"
  ON public.attendance_day_status FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_org_member(org_id)
    AND public.employee_in_org(employee_id, org_id, auth.uid())
  );

DROP POLICY IF EXISTS "Employees insert own attendance_exceptions" ON public.attendance_exceptions;
CREATE POLICY "Employees insert own attendance_exceptions"
  ON public.attendance_exceptions FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_org_member(org_id)
    AND public.employee_in_org(employee_id, org_id, auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Imports and the schedule correction log
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Own imports" ON public.imports;
CREATE POLICY "Own imports" ON public.imports
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.is_org_member(org_id));

DROP POLICY IF EXISTS "Authenticated users can insert their own corrections" ON public.schedule_correction_log;
CREATE POLICY "Authenticated users can insert their own corrections"
  ON public.schedule_correction_log FOR INSERT TO authenticated
  WITH CHECK (
    edited_by = auth.uid()
    AND (org_id IS NULL OR public.is_org_member(org_id))
  );

-- ---------------------------------------------------------------------------
-- Support: a message carries its ticket's office, never a chosen one.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Members write to their own tickets" ON public.support_messages;
CREATE POLICY "Members write to their own tickets"
  ON public.support_messages FOR INSERT TO authenticated
  WITH CHECK (
    role = 'user'
    AND author_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND t.user_id = auth.uid()
        AND t.org_id = support_messages.org_id
        AND t.status <> 'resolved'
    )
  );

-- ---------------------------------------------------------------------------
-- Messaging: rows carry their conversation's office; added participants and
-- request recipients must be members of that office.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Send messages where allowed" ON public.messages;
CREATE POLICY "Send messages where allowed" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND sender_kind = 'member' AND reported_at IS NULL
    AND org_id = public.conv_org_id(conversation_id)
    AND (
      (public.conv_type(conversation_id) = ANY (ARRAY['dm','group','ai']) AND public.is_conv_participant(conversation_id))
      OR (public.conv_type(conversation_id) = 'announcement' AND public.is_org_admin(org_id))
    )
  );

DROP POLICY IF EXISTS "Add participants you may add" ON public.conversation_participants;
CREATE POLICY "Add participants you may add" ON public.conversation_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(org_id)
    AND org_id = public.conv_org_id(conversation_id)
    AND public.user_in_org(org_id, user_id)
    AND public.conv_type(conversation_id) <> 'ai'
    AND (
      (user_id = auth.uid() AND public.can_read_conv(conversation_id))
      OR public.conv_created_by(conversation_id) = auth.uid()
    )
  );

DROP POLICY IF EXISTS "members send requests" ON public.office_requests;
CREATE POLICY "members send requests"
  ON public.office_requests FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_org_member(org_id)
    AND public.user_in_org(org_id, recipient_id)
  );

DROP POLICY IF EXISTS "Restricted notification inserts" ON public.notifications;
CREATE POLICY "Restricted notification inserts"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(org_id)
    AND public.user_in_org(org_id, recipient_user_id)
    AND (
      public.is_org_admin(org_id)
      OR EXISTS (
        SELECT 1 FROM public.org_members om
        WHERE om.org_id = notifications.org_id
          AND om.user_id = notifications.recipient_user_id
          AND om.status = 'active'
          AND om.role IN ('owner', 'manager')
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Checklist completions: the item must belong to the completion's office.
-- The original subquery compared i.org_id to itself (unqualified org_id binds
-- to the inner table), so it was always true.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Members complete checklist items" ON public.checklist_completions;
CREATE POLICY "Members complete checklist items"
  ON public.checklist_completions FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(org_id)
    AND completed_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.checklist_items i
      WHERE i.id = checklist_completions.item_id
        AND i.org_id = checklist_completions.org_id
    )
  );

-- ---------------------------------------------------------------------------
-- PTO accrual inputs are the office's to set. Employees keep reading their
-- own; the "own ... FOR ALL" policies that let them rewrite hire dates, caps,
-- and balance anchors are narrowed to SELECT.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Own pto_settings" ON public.pto_settings;
CREATE POLICY "Own pto_settings" ON public.pto_settings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Own pto_snapshots" ON public.pto_snapshots;
CREATE POLICY "Own pto_snapshots" ON public.pto_snapshots
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Own pto_ledger_weeks" ON public.pto_ledger_weeks;
CREATE POLICY "Own pto_ledger_weeks" ON public.pto_ledger_weeks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Work zones are attendance inputs: members read their office's zones, only
-- owners/managers create them (the "Org admin work_zones" policy already
-- exists), and no one can file a zone under another office.
-- ---------------------------------------------------------------------------

-- Zones created through the app never carried org_id (only the Feb 2026
-- backfill set it), so classify_clock_location — which reads by org — has
-- been ignoring every zone added since. Attach each orphan to its creator's
-- office; the app now writes org_id on every new zone.
UPDATE public.work_zones z
   SET org_id = m.org_id
  FROM public.org_members m
 WHERE z.org_id IS NULL
   AND m.user_id = z.user_id
   AND m.status = 'active'
   AND m.id = (
     SELECT m2.id FROM public.org_members m2
      WHERE m2.user_id = z.user_id AND m2.status = 'active'
      ORDER BY m2.created_at
      LIMIT 1
   );

DROP POLICY IF EXISTS "Own work_zones" ON public.work_zones;
CREATE POLICY "Members read office work_zones" ON public.work_zones
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR (org_id IS NOT NULL AND public.is_org_member(org_id)));

-- ---------------------------------------------------------------------------
-- Work-style answers are private to the person who gave them (the onboarding
-- promise). Owners and managers no longer read or edit them.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "View own work style profile" ON public.work_style_profiles;
CREATE POLICY "View own work style profile" ON public.work_style_profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Insert own work style profile" ON public.work_style_profiles;
CREATE POLICY "Insert own work style profile" ON public.work_style_profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(org_id));

DROP POLICY IF EXISTS "Update own work style profile" ON public.work_style_profiles;
CREATE POLICY "Update own work style profile" ON public.work_style_profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(org_id))
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(org_id));

-- ---------------------------------------------------------------------------
-- The attendance sweep log is a global operations table (it names employees
-- of every office in its error details). Nothing in the app reads it; the
-- service role does not need a policy.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Org owners can read sweep log" ON public.attendance_sweep_log;

-- ---------------------------------------------------------------------------
-- get_schedule_for_date is callable by any signed-in user with any user id.
-- A signed-in caller may look up themselves or someone in an office they
-- administer; anyone else gets no rows. Server-side callers (no auth.uid())
-- are unaffected.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_schedule_for_date(p_user_id uuid, p_date date)
RETURNS TABLE(
  version_id uuid, version_name text,
  effective_start_date date, effective_end_date date,
  apply_to_remote boolean, timezone text,
  weekday smallint, enabled boolean,
  start_time time, end_time time,
  grace_minutes integer, threshold_minutes integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_result record;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.org_members target
      WHERE target.user_id = p_user_id
        AND target.status = 'active'
        AND public.is_org_admin(target.org_id)
    ) THEN
      RETURN;
    END IF;
  END IF;

  -- Try schedule_assignments first (employee-based)
  SELECT
    sv.id AS version_id, sv.name AS version_name,
    sv.effective_start_date, sv.effective_end_date,
    sv.apply_to_remote, sv.timezone,
    sw.weekday, sw.enabled,
    sw.start_time, sw.end_time,
    sw.grace_minutes, sw.threshold_minutes
  INTO v_result
  FROM public.employees e
  JOIN public.schedule_assignments sa ON sa.employee_id = e.id
  JOIN public.schedule_versions sv ON sv.id = sa.schedule_version_id
  JOIN public.schedule_weekdays sw ON sw.schedule_version_id = sv.id
  WHERE e.user_id = p_user_id
    AND sa.effective_start <= p_date
    AND (sa.effective_end IS NULL OR sa.effective_end >= p_date)
    AND sv.effective_start_date <= p_date
    AND (sv.effective_end_date IS NULL OR sv.effective_end_date >= p_date)
    AND sw.weekday = EXTRACT(DOW FROM p_date)::SMALLINT
  ORDER BY sa.effective_start DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_result.version_id, v_result.version_name,
      v_result.effective_start_date, v_result.effective_end_date,
      v_result.apply_to_remote, v_result.timezone,
      v_result.weekday, v_result.enabled,
      v_result.start_time, v_result.end_time,
      v_result.grace_minutes, v_result.threshold_minutes;
    RETURN;
  END IF;

  -- Fallback: schedule_versions by user_id (legacy + direct assignment)
  RETURN QUERY
  SELECT
    sv.id, sv.name,
    sv.effective_start_date, sv.effective_end_date,
    sv.apply_to_remote, sv.timezone,
    sw.weekday, sw.enabled,
    sw.start_time, sw.end_time,
    sw.grace_minutes, sw.threshold_minutes
  FROM public.schedule_versions sv
  JOIN public.schedule_weekdays sw ON sw.schedule_version_id = sv.id
  WHERE sv.user_id = p_user_id
    AND sv.effective_start_date <= p_date
    AND (sv.effective_end_date IS NULL OR sv.effective_end_date >= p_date)
    AND sw.weekday = EXTRACT(DOW FROM p_date)::SMALLINT
  ORDER BY sv.effective_start_date DESC
  LIMIT 1;
END;
$function$;
