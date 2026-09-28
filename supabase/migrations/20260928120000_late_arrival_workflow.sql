-- ============================================================
-- Late arrivals without the busywork.
--
-- Before: every late arrival demanded an explanation from the employee
-- ("Explain why you were late"), opened a per-tardy follow-up item for a
-- manager, and the accountability engine turned three of them into a
-- signed accountability record on a daily scan.
--
-- Now:
--   1. A routine late arrival is acknowledged, not explained. The employee
--      chooses "acknowledge as unexcused" (a receipt: who and when, nothing
--      else), "request excused" (a short explanation for a manager to
--      decide), or "report incorrect time" (the existing correction
--      request). Acknowledgment and excuse status are separate columns;
--      dismissing the prompt records nothing and erases nothing.
--   2. An excuse request is a decision item the moment it is filed.
--      decide_tardy_excuse() approves (excused) or declines (unexcused),
--      notes optional, never by the person it is about.
--   3. The threshold is the office's existing late-arrival rule
--      (escalation_policies, kind tardy_threshold: count within a rolling
--      window of days; default 3 in 30). Every office gets the row.
--   4. Crossing it opens an attendance incident report in the existing
--      incident_reports table (category 'attendance', status
--      'meeting_required'), visible to the team member and the office's
--      managers, with every qualifying late arrival linked in
--      attendance_incident_events.
--   5. The report closes only after a manager records the meeting and both
--      the manager and the team member sign (server-stamped). Changing the
--      signed content afterwards is an amendment that resets signatures.
--   6. One report per crossing: linked events never count again; while a
--      report is open, later late arrivals attach to it as follow-ups; a
--      new report needs a fresh set inside the rolling window.
--
-- Evaluation runs from a trigger on tardies (and on the rule itself), so it
-- never depends on a manager clicking anything. This migration evaluates
-- nobody: no backlog of incidents is generated from historical data.
--
-- DEPLOY NOTES (GitHub merges deploy nothing in this repo):
--   * Apply this migration, then deploy accountability-engine (it no longer
--     opens late-arrival records) and publish the frontend.
--   * Verification probes: supabase/tests/late_arrival_probes.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. tardies: acknowledgment and excuse status, kept apart
-- ------------------------------------------------------------
ALTER TABLE public.tardies
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid,
  ADD COLUMN IF NOT EXISTS excuse_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS excuse_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS excuse_decided_by uuid,
  ADD COLUMN IF NOT EXISTS manager_note text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.tardies.acknowledged_at IS 'When the employee acknowledged the late arrival as unexcused. A receipt, not a gate: an unacknowledged late arrival still counts.';
COMMENT ON COLUMN public.tardies.acknowledged_by IS 'The signed-in user who acknowledged (always the employee; stamped server-side).';
COMMENT ON COLUMN public.tardies.excuse_requested_at IS 'When the employee asked for the late arrival to be excused. With approval_status unreviewed this is a pending request, which does not count toward the threshold until decided.';
COMMENT ON COLUMN public.tardies.excuse_decided_at IS 'When a manager decided the excuse (approval_status approved = excused, unapproved = unexcused).';
COMMENT ON COLUMN public.tardies.excuse_decided_by IS 'The manager who decided. Never the employee the row is about.';
COMMENT ON COLUMN public.tardies.manager_note IS 'Optional note left with the decision.';
COMMENT ON COLUMN public.tardies.reason_text IS 'The employee''s explanation when they request an excuse. Optional; never required to record or acknowledge a late arrival.';

-- A decision no longer needs a written reason.
DROP TRIGGER IF EXISTS trg_validate_tardy_reason ON public.tardies;
DROP FUNCTION IF EXISTS public.validate_tardy_reason();

-- History keeps its meaning: an explanation waiting on a manager was an
-- excuse request; a decision already made is a decision already made.
UPDATE public.tardies
   SET excuse_requested_at = COALESCE(updated_at, created_at)
 WHERE approval_status = 'unreviewed'
   AND excuse_requested_at IS NULL
   AND length(btrim(coalesce(reason_text, ''))) > 0;

UPDATE public.tardies
   SET excuse_decided_at = COALESCE(approved_at, updated_at, created_at),
       excuse_decided_by = approved_by
 WHERE approval_status IN ('approved', 'unapproved')
   AND excuse_decided_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tardies_excuse_pending
  ON public.tardies (org_id, excuse_requested_at)
  WHERE approval_status = 'unreviewed' AND excuse_requested_at IS NOT NULL;

-- RLS says who may touch a row; this says which columns. Employees still
-- edit only their explanation directly (everything else moves through the
-- functions below), and nobody — whatever their role — decides their own
-- late arrival by editing the row.
CREATE OR REPLACE FUNCTION public.guard_employee_tardy_update()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF current_user <> 'authenticated' THEN RETURN NEW; END IF;
  IF NEW.user_id = auth.uid() AND (
       NEW.approval_status    IS DISTINCT FROM OLD.approval_status
    OR NEW.approved_by        IS DISTINCT FROM OLD.approved_by
    OR NEW.approved_at        IS DISTINCT FROM OLD.approved_at
    OR NEW.excuse_decided_at  IS DISTINCT FROM OLD.excuse_decided_at
    OR NEW.excuse_decided_by  IS DISTINCT FROM OLD.excuse_decided_by
    OR NEW.manager_note       IS DISTINCT FROM OLD.manager_note) THEN
    RAISE EXCEPTION 'You cannot decide your own late arrival' USING ERRCODE = '42501';
  END IF;
  IF public.is_org_admin(NEW.org_id) THEN RETURN NEW; END IF;
  IF NEW.user_id            IS DISTINCT FROM OLD.user_id
     OR NEW.org_id          IS DISTINCT FROM OLD.org_id
     OR NEW.employee_id     IS DISTINCT FROM OLD.employee_id
     OR NEW.entry_date      IS DISTINCT FROM OLD.entry_date
     OR NEW.time_entry_id   IS DISTINCT FROM OLD.time_entry_id
     OR NEW.expected_start_time IS DISTINCT FROM OLD.expected_start_time
     OR NEW.actual_start_time   IS DISTINCT FROM OLD.actual_start_time
     OR NEW.minutes_late    IS DISTINCT FROM OLD.minutes_late
     OR NEW.approval_status IS DISTINCT FROM OLD.approval_status
     OR NEW.approved_by     IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at     IS DISTINCT FROM OLD.approved_at
     OR NEW.resolved        IS DISTINCT FROM OLD.resolved
     OR NEW.timezone_suspect IS DISTINCT FROM OLD.timezone_suspect
     OR NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at
     OR NEW.acknowledged_by IS DISTINCT FROM OLD.acknowledged_by
     OR NEW.excuse_requested_at IS DISTINCT FROM OLD.excuse_requested_at
     OR NEW.excuse_decided_at IS DISTINCT FROM OLD.excuse_decided_at
     OR NEW.excuse_decided_by IS DISTINCT FROM OLD.excuse_decided_by
     OR NEW.manager_note    IS DISTINCT FROM OLD.manager_note THEN
    RAISE EXCEPTION 'Employees may only update the tardy reason';
  END IF;
  RETURN NEW;
END;
$fn$;

-- ------------------------------------------------------------
-- 2. Shared helpers
-- ------------------------------------------------------------

-- Does this late arrival count toward the office's threshold right now?
-- A real late arrival (minutes on record, clock trusted, not corrected
-- away), not excused, and not waiting on an excuse decision. Acknowledgment
-- is deliberately absent: it is a receipt, not a gate.
CREATE OR REPLACE FUNCTION public.late_arrival_counts(t public.tardies)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT t.minutes_late > 0
     AND NOT t.timezone_suspect
     AND NOT t.resolved
     AND t.approval_status <> 'approved'
     AND NOT (t.approval_status = 'unreviewed' AND t.excuse_requested_at IS NOT NULL);
$fn$;

CREATE OR REPLACE FUNCTION public.late_arrival_notify(
  p_org_id uuid, p_recipient uuid, p_actor uuid, p_type text,
  p_title text, p_message text, p_table text, p_id uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $fn$
  INSERT INTO public.notifications (
    org_id, recipient_user_id, actor_user_id, notification_type, title, message, related_table, related_id
  )
  SELECT p_org_id, p_recipient, p_actor, p_type, p_title, p_message, p_table, p_id
   WHERE p_recipient IS NOT NULL AND p_recipient IS DISTINCT FROM p_actor;
$fn$;

-- Who is responsible for a report about this person: every active owner
-- or manager except the subject — owners only when the subject is a
-- manager or an owner and another owner exists (the incident countersign
-- rule). Whoever this names records the meeting, is notified, and signs.
CREATE OR REPLACE FUNCTION public.attendance_report_reviewers(p_org_id uuid, p_subject_user uuid, p_countersign_role text)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH pool AS (
    SELECT m.user_id, m.role
      FROM public.org_members m
     WHERE m.org_id = p_org_id
       AND m.status = 'active'
       AND m.role IN ('owner', 'manager')
       AND (p_subject_user IS NULL OR m.user_id <> p_subject_user)
  )
  SELECT user_id FROM pool
   WHERE coalesce(p_countersign_role, 'manager') <> 'owner'
      OR role = 'owner'
      OR NOT EXISTS (SELECT 1 FROM pool o WHERE o.role = 'owner');
$fn$;

-- The person's name as the office writes it.
CREATE OR REPLACE FUNCTION public.late_arrival_person_name(p_employee_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT coalesce(nullif(btrim(coalesce(e.preferred_name, '')), ''), e.display_name, 'a team member')
    FROM public.employees e WHERE e.id = p_employee_id;
$fn$;

-- ------------------------------------------------------------
-- 3. The employee's three answers to "you were late"
-- ------------------------------------------------------------

-- Acknowledge as unexcused: a receipt. No reason, no signature, no manager.
CREATE OR REPLACE FUNCTION public.acknowledge_tardy(p_tardy_id uuid)
RETURNS public.tardies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  t public.tardies;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  SELECT * INTO t FROM public.tardies WHERE id = p_tardy_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Late arrival not found' USING ERRCODE = 'P0002'; END IF;
  IF t.user_id <> v_uid THEN
    RAISE EXCEPTION 'Only the person who arrived late can acknowledge it' USING ERRCODE = '42501';
  END IF;
  IF t.approval_status = 'unreviewed' AND t.excuse_requested_at IS NOT NULL THEN
    RAISE EXCEPTION 'Your excuse request is waiting on a decision' USING ERRCODE = '22023';
  END IF;
  IF t.acknowledged_at IS NOT NULL THEN RETURN t; END IF;
  UPDATE public.tardies
     SET acknowledged_at = now(), acknowledged_by = v_uid
   WHERE id = t.id
   RETURNING * INTO t;
  RETURN t;
END;
$fn$;

-- Request excused: a short explanation, decided by a manager. Files the
-- decision item at once (the queue reads the row) and tells the office's
-- managers. Re-submitting while it waits updates the wording only.
CREATE OR REPLACE FUNCTION public.request_tardy_excuse(p_tardy_id uuid, p_explanation text)
RETURNS public.tardies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  t public.tardies;
  v_uid uuid := auth.uid();
  v_text text := btrim(coalesce(p_explanation, ''));
  v_first boolean;
  v_name text;
  v_admin uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF length(v_text) < 3 THEN RAISE EXCEPTION 'Add a short explanation' USING ERRCODE = '22023'; END IF;
  IF length(v_text) > 1000 THEN RAISE EXCEPTION 'Keep the explanation under 1,000 characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO t FROM public.tardies WHERE id = p_tardy_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Late arrival not found' USING ERRCODE = 'P0002'; END IF;
  IF t.user_id <> v_uid THEN
    RAISE EXCEPTION 'Only the person who arrived late can ask for it to be excused' USING ERRCODE = '42501';
  END IF;
  IF t.approval_status <> 'unreviewed' THEN
    RAISE EXCEPTION 'This late arrival has already been decided' USING ERRCODE = '22023';
  END IF;
  v_first := t.excuse_requested_at IS NULL;
  UPDATE public.tardies
     SET reason_text = v_text,
         excuse_requested_at = coalesce(excuse_requested_at, now())
   WHERE id = t.id
   RETURNING * INTO t;

  IF v_first THEN
    v_name := public.late_arrival_person_name(t.employee_id);
    FOR v_admin IN SELECT public.attendance_report_reviewers(t.org_id, t.user_id, 'manager') LOOP
      PERFORM public.late_arrival_notify(
        t.org_id, v_admin, v_uid, 'tardy_excuse_requested',
        'Excuse requested: pending review',
        format('%s asked for the late arrival on %s (%s minutes) to be excused.', v_name, to_char(t.entry_date, 'Mon FMDD, YYYY'), t.minutes_late),
        'tardies', t.id);
    END LOOP;
  END IF;
  RETURN t;
END;
$fn$;

-- A manager's decision, on a request or on any late arrival at any time.
-- Excused never counts; unexcused counts. Notes are optional. The person
-- the row is about can never decide it. Audited, and the person is told.
CREATE OR REPLACE FUNCTION public.decide_tardy_excuse(p_tardy_id uuid, p_decision text, p_note text DEFAULT '')
RETURNS public.tardies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  t public.tardies;
  v_uid uuid := auth.uid();
  v_note text := btrim(coalesce(p_note, ''));
  v_status text;
  v_before jsonb;
  v_was_requested boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF p_decision NOT IN ('excused', 'unexcused') THEN
    RAISE EXCEPTION 'Decide excused or unexcused' USING ERRCODE = '22023';
  END IF;
  IF length(v_note) > 2000 THEN RAISE EXCEPTION 'Keep the note under 2,000 characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO t FROM public.tardies WHERE id = p_tardy_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Late arrival not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.is_org_admin(t.org_id) THEN
    RAISE EXCEPTION 'Only an owner or manager can decide a late arrival' USING ERRCODE = '42501';
  END IF;
  IF t.user_id = v_uid THEN
    RAISE EXCEPTION 'You cannot decide your own late arrival' USING ERRCODE = '42501';
  END IF;
  v_status := CASE WHEN p_decision = 'excused' THEN 'approved' ELSE 'unapproved' END;
  v_was_requested := t.excuse_requested_at IS NOT NULL AND t.approval_status = 'unreviewed';
  v_before := jsonb_build_object('approval_status', t.approval_status, 'manager_note', t.manager_note,
                                 'excuse_decided_at', t.excuse_decided_at, 'excuse_decided_by', t.excuse_decided_by);

  UPDATE public.tardies
     SET approval_status = v_status,
         excuse_decided_at = now(),
         excuse_decided_by = v_uid,
         manager_note = v_note,
         approved_by = CASE WHEN v_status = 'approved' THEN v_uid ELSE NULL END,
         approved_at = CASE WHEN v_status = 'approved' THEN now() ELSE NULL END
   WHERE id = t.id
   RETURNING * INTO t;

  INSERT INTO public.audit_events
    (user_id, org_id, actor_id, event_type, action_type, target_table, target_id, before_json, after_json, reason, related_date, event_details)
  VALUES
    (v_uid, t.org_id, v_uid, 'tardy_excuse_decided', 'update', 'tardies', t.id, v_before,
     jsonb_build_object('approval_status', t.approval_status, 'manager_note', t.manager_note,
                        'excuse_decided_at', t.excuse_decided_at, 'excuse_decided_by', t.excuse_decided_by),
     nullif(v_note, ''), t.entry_date,
     jsonb_build_object('target_employee_id', t.employee_id, 'decision', p_decision, 'was_requested', v_was_requested));

  PERFORM public.late_arrival_notify(
    t.org_id, t.user_id, v_uid,
    CASE WHEN v_status = 'approved' THEN 'tardy_excuse_approved' ELSE 'tardy_excuse_declined' END,
    CASE WHEN v_status = 'approved' THEN 'Late arrival excused' ELSE 'Late arrival marked unexcused' END,
    format('Your late arrival on %s (%s minutes) was %s.%s',
           to_char(t.entry_date, 'Mon FMDD, YYYY'), t.minutes_late,
           CASE WHEN v_status = 'approved' THEN 'excused' ELSE 'marked unexcused' END,
           CASE WHEN v_note <> '' THEN ' Note: ' || v_note ELSE '' END),
    'tardies', t.id);
  RETURN t;
END;
$fn$;

-- ------------------------------------------------------------
-- 4. incident_reports: the attendance category and its workflow
-- ------------------------------------------------------------
ALTER TABLE public.incident_reports DROP CONSTRAINT IF EXISTS incident_reports_category_check;
ALTER TABLE public.incident_reports ADD CONSTRAINT incident_reports_category_check CHECK (category IN (
  'sharps_injury',
  'blood_body_fluid_exposure',
  'slip_trip_fall',
  'chemical_exposure',
  'equipment_malfunction',
  'patient_related',
  'ergonomic_strain',
  'illness',
  'other',
  'attendance'
));

ALTER TABLE public.incident_reports DROP CONSTRAINT IF EXISTS incident_reports_status_check;
ALTER TABLE public.incident_reports ADD CONSTRAINT incident_reports_status_check CHECK (status IN (
  'open', 'under_review', 'closed',
  -- the attendance workflow, in order
  'meeting_required', 'meeting_completed', 'awaiting_signatures'
));

-- An attendance report has no human author.
ALTER TABLE public.incident_reports ALTER COLUMN reported_by DROP NOT NULL;

ALTER TABLE public.incident_reports
  -- the rule that opened it and the facts it documents
  ADD COLUMN IF NOT EXISTS rule_threshold_count integer,
  ADD COLUMN IF NOT EXISTS rule_window_days integer,
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS occurrence_count integer,
  ADD COLUMN IF NOT EXISTS total_minutes_late integer,
  -- the meeting, recorded by a manager
  ADD COLUMN IF NOT EXISTS meeting_date date,
  ADD COLUMN IF NOT EXISTS meeting_summary text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS meeting_next_steps text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS meeting_recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS meeting_recorded_by uuid,
  -- the team member's own words
  ADD COLUMN IF NOT EXISTS employee_comment text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS employee_comment_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

COMMENT ON COLUMN public.incident_reports.period_start IS 'Attendance reports: the rolling window that met the rule (period_end - window days + 1).';
COMMENT ON COLUMN public.incident_reports.closed_at IS 'Attendance reports: stamped when the second signature lands.';

-- One open attendance report per person: later late arrivals attach to it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_incident_reports_open_attendance
  ON public.incident_reports (employee_id)
  WHERE category = 'attendance' AND status <> 'closed';

-- The late arrivals a report is about, one row each, with the facts as
-- they read when linked (the tardy row may later be corrected or removed;
-- the report keeps its snapshot). A date is linked to at most one report.
CREATE TABLE IF NOT EXISTS public.attendance_incident_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  incident_report_id uuid NOT NULL REFERENCES public.incident_reports(id) ON DELETE CASCADE,
  tardy_id uuid REFERENCES public.tardies(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  expected_start_time time,
  actual_start_time timestamptz,
  minutes_late integer NOT NULL DEFAULT 0,
  -- qualifying: part of the set that met the rule; follow_up: a later late
  -- arrival that landed while the report was open.
  role text NOT NULL DEFAULT 'qualifying' CHECK (role IN ('qualifying', 'follow_up')),
  linked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entry_date)
);
COMMENT ON TABLE public.attendance_incident_events IS 'Late arrivals linked to an attendance incident report; a linked date never counts toward another report.';
CREATE INDEX IF NOT EXISTS idx_attendance_incident_events_report
  ON public.attendance_incident_events (incident_report_id, entry_date);

ALTER TABLE public.attendance_incident_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Subject and admins read attendance incident events" ON public.attendance_incident_events;
CREATE POLICY "Subject and admins read attendance incident events"
  ON public.attendance_incident_events FOR SELECT TO authenticated
  USING (public.can_access_employee(employee_id));
REVOKE ALL ON public.attendance_incident_events FROM anon, authenticated;
GRANT SELECT ON public.attendance_incident_events TO authenticated;
GRANT ALL ON public.attendance_incident_events TO service_role;

-- Every change to signed content, with what it was and what it became.
CREATE TABLE IF NOT EXISTS public.incident_report_amendments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  incident_report_id uuid NOT NULL REFERENCES public.incident_reports(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('meeting', 'employee_comment')),
  amended_by uuid NOT NULL,
  amended_by_name text NOT NULL DEFAULT '',
  amended_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL DEFAULT '',
  before_json jsonb,
  after_json jsonb,
  signatures_reset boolean NOT NULL DEFAULT false
);
COMMENT ON TABLE public.incident_report_amendments IS 'Audit trail of changes to an attendance incident report after it was recorded; a reset means both signatures had to be given again.';
CREATE INDEX IF NOT EXISTS idx_incident_report_amendments_report
  ON public.incident_report_amendments (incident_report_id, amended_at);

ALTER TABLE public.incident_report_amendments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Subject and admins read incident amendments" ON public.incident_report_amendments;
CREATE POLICY "Subject and admins read incident amendments"
  ON public.incident_report_amendments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.incident_reports r
     WHERE r.id = incident_report_amendments.incident_report_id
       AND public.can_access_employee(r.employee_id)
  ));
REVOKE ALL ON public.incident_report_amendments FROM anon, authenticated;
GRANT SELECT ON public.incident_report_amendments TO authenticated;
GRANT ALL ON public.incident_report_amendments TO service_role;

-- Nobody files an attendance report by hand; the rule opens them.
CREATE OR REPLACE FUNCTION public.stamp_incident_report_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF current_user <> 'authenticated' THEN RETURN NEW; END IF;
  IF NEW.category = 'attendance' THEN
    RAISE EXCEPTION 'Attendance incident reports are opened by the late-arrival rule, not filed by hand' USING ERRCODE = '42501';
  END IF;
  NEW.countersign_role    := public.incident_countersign_role(NEW.employee_id);
  NEW.employee_signature  := '';
  NEW.employee_signed_at  := NULL;
  NEW.employee_signed_by  := NULL;
  NEW.manager_signature   := '';
  NEW.manager_signed_at   := NULL;
  NEW.manager_signed_by   := NULL;
  NEW.manager_signed_role := '';
  RETURN NEW;
END;
$fn$;

-- The column guard, with attendance reports folded in: they change only
-- through their workflow functions (which run as the table owner and never
-- reach this branch). Everything else is as before.
CREATE OR REPLACE FUNCTION public.guard_incident_report_update()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  facts_changed boolean;
BEGIN
  IF current_user <> 'authenticated' THEN RETURN NEW; END IF;

  IF OLD.category = 'attendance' OR NEW.category = 'attendance' THEN
    RAISE EXCEPTION 'An attendance incident report changes only through its workflow: the meeting record, the team member''s comment, and signatures'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.employee_signature  IS DISTINCT FROM OLD.employee_signature
     OR NEW.employee_signed_at  IS DISTINCT FROM OLD.employee_signed_at
     OR NEW.employee_signed_by  IS DISTINCT FROM OLD.employee_signed_by
     OR NEW.manager_signature   IS DISTINCT FROM OLD.manager_signature
     OR NEW.manager_signed_at   IS DISTINCT FROM OLD.manager_signed_at
     OR NEW.manager_signed_by   IS DISTINCT FROM OLD.manager_signed_by
     OR NEW.manager_signed_role IS DISTINCT FROM OLD.manager_signed_role
     OR NEW.countersign_role    IS DISTINCT FROM OLD.countersign_role THEN
    RAISE EXCEPTION 'Incident report signatures are set by signing, not by editing';
  END IF;

  facts_changed :=
    NEW.employee_id       IS DISTINCT FROM OLD.employee_id
    OR NEW.incident_date  IS DISTINCT FROM OLD.incident_date
    OR NEW.incident_time  IS DISTINCT FROM OLD.incident_time
    OR NEW.category       IS DISTINCT FROM OLD.category
    OR NEW.severity       IS DISTINCT FROM OLD.severity
    OR NEW.location       IS DISTINCT FROM OLD.location
    OR NEW.description    IS DISTINCT FROM OLD.description
    OR NEW.body_part      IS DISTINCT FROM OLD.body_part
    OR NEW.device_involved IS DISTINCT FROM OLD.device_involved
    OR NEW.ppe_worn       IS DISTINCT FROM OLD.ppe_worn
    OR NEW.witnesses      IS DISTINCT FROM OLD.witnesses
    OR NEW.immediate_action IS DISTINCT FROM OLD.immediate_action
    OR NEW.medical_treatment IS DISTINCT FROM OLD.medical_treatment
    OR NEW.work_related   IS DISTINCT FROM OLD.work_related
    OR NEW.days_away      IS DISTINCT FROM OLD.days_away;

  IF facts_changed THEN
    NEW.employee_signature  := '';
    NEW.employee_signed_at  := NULL;
    NEW.employee_signed_by  := NULL;
    NEW.manager_signature   := '';
    NEW.manager_signed_at   := NULL;
    NEW.manager_signed_by   := NULL;
    NEW.manager_signed_role := '';
    NEW.countersign_role    := public.incident_countersign_role(NEW.employee_id);
  END IF;

  IF public.is_org_admin(NEW.org_id) THEN RETURN NEW; END IF;
  IF NEW.org_id                  IS DISTINCT FROM OLD.org_id
     OR NEW.employee_id          IS DISTINCT FROM OLD.employee_id
     OR NEW.reported_by          IS DISTINCT FROM OLD.reported_by
     OR NEW.reported_by_employee_id IS DISTINCT FROM OLD.reported_by_employee_id
     OR NEW.created_at           IS DISTINCT FROM OLD.created_at
     OR NEW.status               IS DISTINCT FROM OLD.status
     OR NEW.reviewed_by          IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_by_name     IS DISTINCT FROM OLD.reviewed_by_name
     OR NEW.reviewed_at          IS DISTINCT FROM OLD.reviewed_at
     OR NEW.review_notes         IS DISTINCT FROM OLD.review_notes
     OR NEW.follow_up_notes      IS DISTINCT FROM OLD.follow_up_notes THEN
    RAISE EXCEPTION 'Only owners and managers may review, close, or reassign an incident report';
  END IF;
  RETURN NEW;
END;
$fn$;

-- An attendance report is part of the attendance record: it is closed, never removed.
CREATE OR REPLACE FUNCTION public.guard_incident_report_delete()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF current_user = 'authenticated' AND OLD.category = 'attendance' THEN
    RAISE EXCEPTION 'An attendance incident report is part of the attendance record and cannot be deleted' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$fn$;
DROP TRIGGER IF EXISTS trg_guard_incident_report_delete ON public.incident_reports;
CREATE TRIGGER trg_guard_incident_report_delete
  BEFORE DELETE ON public.incident_reports
  FOR EACH ROW EXECUTE FUNCTION public.guard_incident_report_delete();

-- ------------------------------------------------------------
-- 5. The office's late-arrival rule: every office has one
-- ------------------------------------------------------------
INSERT INTO public.escalation_policies
  (org_id, kind, threshold_count, threshold_window_days, reviewer_role, review_due_days, escalate_to, escalate_after_days, is_active)
SELECT o.id, 'tardy_threshold', 3, 30, 'manager', 3, 'owner', 2, true
  FROM public.orgs o
ON CONFLICT (org_id, kind) DO NOTHING;

CREATE OR REPLACE FUNCTION public.late_arrival_rule_for_new_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  INSERT INTO public.escalation_policies
    (org_id, kind, threshold_count, threshold_window_days, reviewer_role, review_due_days, escalate_to, escalate_after_days, is_active)
  VALUES (NEW.id, 'tardy_threshold', 3, 30, 'manager', 3, 'owner', 2, true)
  ON CONFLICT (org_id, kind) DO NOTHING;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS late_arrival_rule_for_new_org ON public.orgs;
CREATE TRIGGER late_arrival_rule_for_new_org
  AFTER INSERT ON public.orgs
  FOR EACH ROW EXECUTE FUNCTION public.late_arrival_rule_for_new_org();

-- ------------------------------------------------------------
-- 6. The evaluator: one report per crossing
-- ------------------------------------------------------------
-- Reads every late arrival of one person that counts and is not yet part
-- of a report (nor of a legacy accountability record covering the same
-- dates), in date order, and slides the office's window over them. The
-- first date whose trailing window holds the threshold opens a report on
-- that set; every later one attaches to the open report as a follow-up.
-- Dates are the office-local entry dates the attendance engine already
-- writes, so the window is the office's calendar, not the server's.
CREATE OR REPLACE FUNCTION public.evaluate_late_arrival_threshold(p_org_id uuid, p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_rule record;
  v_emp record;
  v_threshold integer;
  v_window integer;
  v_open public.incident_reports;
  v_report public.incident_reports;
  v_ids uuid[];
  v_dates date[];
  v_minutes integer[];
  v_n integer;
  i integer;
  j integer;
  v_count integer;
  v_total integer;
  v_period_start date;
  v_period_end date;
  v_rule_text text;
  v_name text;
  v_reviewer uuid;
  v_created integer := 0;
BEGIN
  IF p_org_id IS NULL OR p_user_id IS NULL THEN RETURN 0; END IF;
  -- One evaluation per person at a time: two punches landing together must
  -- never open two reports.
  PERFORM pg_advisory_xact_lock(hashtextextended('late_arrival:' || p_user_id::text, 0));

  SELECT p.threshold_count, p.threshold_window_days, p.is_active INTO v_rule
    FROM public.escalation_policies p
   WHERE p.org_id = p_org_id AND p.kind = 'tardy_threshold';
  IF FOUND THEN
    IF NOT v_rule.is_active THEN RETURN 0; END IF;
    v_threshold := GREATEST(1, v_rule.threshold_count);
    v_window := GREATEST(1, v_rule.threshold_window_days);
  ELSE
    v_threshold := 3;
    v_window := 30;
  END IF;

  SELECT e.id, e.clocks_in INTO v_emp
    FROM public.employees e
   WHERE e.org_id = p_org_id AND e.user_id = p_user_id AND e.employment_status = 'active'
   LIMIT 1;
  IF NOT FOUND OR NOT coalesce(v_emp.clocks_in, true) THEN RETURN 0; END IF;

  SELECT r.* INTO v_open
    FROM public.incident_reports r
   WHERE r.employee_id = v_emp.id AND r.category = 'attendance' AND r.status <> 'closed'
   ORDER BY r.created_at DESC
   LIMIT 1;

  SELECT array_agg(q.id ORDER BY q.entry_date, q.id),
         array_agg(q.entry_date ORDER BY q.entry_date, q.id),
         array_agg(q.minutes_late ORDER BY q.entry_date, q.id)
    INTO v_ids, v_dates, v_minutes
    FROM (
      SELECT t.id, t.entry_date, t.minutes_late
        FROM public.tardies t
       WHERE t.org_id = p_org_id
         AND t.user_id = p_user_id
         AND public.late_arrival_counts(t)
         AND NOT EXISTS (
           SELECT 1 FROM public.attendance_incident_events l
            WHERE l.user_id = t.user_id AND l.entry_date = t.entry_date)
         AND NOT EXISTS (
           SELECT 1
             FROM public.accountability_reports ar
             CROSS JOIN LATERAL jsonb_array_elements(
               CASE WHEN jsonb_typeof(ar.facts -> 'events') = 'array' THEN ar.facts -> 'events' ELSE '[]'::jsonb END) ev
            WHERE ar.org_id = p_org_id
              AND ar.kind = 'tardy_threshold'
              AND ar.subject_user_id = p_user_id
              AND ev ->> 'entry_date' = t.entry_date::text)
    ) q;
  v_n := coalesce(array_length(v_ids, 1), 0);
  IF v_n = 0 THEN RETURN 0; END IF;

  FOR i IN 1..v_n LOOP
    IF v_open.id IS NOT NULL THEN
      -- A report is open: this late arrival rides along as a follow-up. An
      -- arrival older than the report's own period is stale and is left out.
      IF v_open.period_start IS NULL OR v_dates[i] >= v_open.period_start THEN
        INSERT INTO public.attendance_incident_events
          (org_id, incident_report_id, tardy_id, user_id, employee_id, entry_date,
           expected_start_time, actual_start_time, minutes_late, role)
        SELECT t.org_id, v_open.id, t.id, t.user_id, v_emp.id, t.entry_date,
               t.expected_start_time, t.actual_start_time, t.minutes_late, 'follow_up'
          FROM public.tardies t WHERE t.id = v_ids[i]
        ON CONFLICT (user_id, entry_date) DO NOTHING;
      END IF;
      CONTINUE;
    END IF;

    v_count := 0;
    v_total := 0;
    FOR j IN 1..i LOOP
      IF v_dates[j] >= v_dates[i] - (v_window - 1) THEN
        v_count := v_count + 1;
        v_total := v_total + coalesce(v_minutes[j], 0);
      END IF;
    END LOOP;
    IF v_count < v_threshold THEN CONTINUE; END IF;

    v_period_end := v_dates[i];
    v_period_start := v_dates[i] - (v_window - 1);
    v_rule_text := format('%s unexcused late arrivals within a rolling %s-day period', v_threshold, v_window);
    v_name := public.late_arrival_person_name(v_emp.id);

    INSERT INTO public.incident_reports (
      org_id, employee_id, reported_by, reported_by_employee_id, reported_by_name,
      incident_date, incident_time, category, severity, location, description,
      body_part, device_involved, ppe_worn, witnesses, immediate_action, medical_treatment,
      follow_up_required, follow_up_notes, work_related, days_away, status, countersign_role,
      rule_threshold_count, rule_window_days, period_start, period_end, occurrence_count, total_minutes_late
    ) VALUES (
      p_org_id, v_emp.id, NULL, NULL, 'Late-arrival rule (automatic)',
      v_period_end, NULL, 'attendance', 'minor', '',
      format('Attendance threshold reached: %s. Between %s and %s, %s late arrivals were recorded, %s minutes late in total. '
             'This report was opened automatically by the office''s late-arrival rule. It documents the threshold crossing; '
             'a meeting with the team member and both signatures are required to close it.',
             v_rule_text, to_char(v_period_start, 'Mon FMDD, YYYY'), to_char(v_period_end, 'Mon FMDD, YYYY'), v_count, v_total),
      '', '', 'na', '', '', 'none',
      false, '', true, 0, 'meeting_required', public.incident_countersign_role(v_emp.id),
      v_threshold, v_window, v_period_start, v_period_end, v_count, v_total
    )
    RETURNING * INTO v_report;

    FOR j IN 1..i LOOP
      IF v_dates[j] >= v_period_start THEN
        INSERT INTO public.attendance_incident_events
          (org_id, incident_report_id, tardy_id, user_id, employee_id, entry_date,
           expected_start_time, actual_start_time, minutes_late, role)
        SELECT t.org_id, v_report.id, t.id, t.user_id, v_emp.id, t.entry_date,
               t.expected_start_time, t.actual_start_time, t.minutes_late, 'qualifying'
          FROM public.tardies t WHERE t.id = v_ids[j]
        ON CONFLICT (user_id, entry_date) DO NOTHING;
      END IF;
    END LOOP;

    INSERT INTO public.audit_events
      (user_id, org_id, actor_id, event_type, action_type, target_table, target_id, after_json, related_date, event_details)
    VALUES
      (p_user_id, p_org_id, NULL, 'attendance_incident_opened', 'insert', 'incident_reports', v_report.id,
       jsonb_build_object('rule', v_rule_text, 'period_start', v_period_start, 'period_end', v_period_end,
                          'occurrence_count', v_count, 'total_minutes_late', v_total),
       v_period_end,
       jsonb_build_object('target_employee_id', v_emp.id, 'system', true));

    PERFORM public.late_arrival_notify(
      p_org_id, p_user_id, NULL, 'attendance_incident_opened',
      'Attendance incident report opened',
      format('Your late arrivals reached the office rule (%s). A report listing the dates is in your record. Status: Meeting required. Your manager will meet with you; both of you sign afterwards.', v_rule_text),
      'incident_reports', v_report.id);
    FOR v_reviewer IN SELECT public.attendance_report_reviewers(p_org_id, p_user_id, v_report.countersign_role) LOOP
      PERFORM public.late_arrival_notify(
        p_org_id, v_reviewer, NULL, 'attendance_incident_meeting',
        format('Meet with %s', v_name),
        format('%s reached the late-arrival rule (%s): %s late arrivals, %s minutes in total between %s and %s. Record the meeting, then both of you sign to close the report.',
               v_name, v_rule_text, v_count, v_total, to_char(v_period_start, 'Mon FMDD, YYYY'), to_char(v_period_end, 'Mon FMDD, YYYY')),
        'incident_reports', v_report.id);
    END LOOP;

    v_open := v_report;
    v_created := v_created + 1;
  END LOOP;

  RETURN v_created;
END;
$fn$;

-- Every change that can move a person over or under the rule re-evaluates
-- them: a new late arrival, a decision, a request, a correction. Receipts
-- (acknowledgments) and wording never do.
CREATE OR REPLACE FUNCTION public.trigger_evaluate_late_arrivals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.approval_status IS NOT DISTINCT FROM OLD.approval_status
     AND NEW.excuse_requested_at IS NOT DISTINCT FROM OLD.excuse_requested_at
     AND NEW.resolved IS NOT DISTINCT FROM OLD.resolved
     AND NEW.timezone_suspect IS NOT DISTINCT FROM OLD.timezone_suspect
     AND NEW.minutes_late IS NOT DISTINCT FROM OLD.minutes_late
     AND NEW.entry_date IS NOT DISTINCT FROM OLD.entry_date THEN
    RETURN NULL;
  END IF;
  PERFORM public.evaluate_late_arrival_threshold(NEW.org_id, NEW.user_id);
  RETURN NULL;
END;
$fn$;
DROP TRIGGER IF EXISTS trg_evaluate_late_arrivals ON public.tardies;
CREATE TRIGGER trg_evaluate_late_arrivals
  AFTER INSERT OR UPDATE ON public.tardies
  FOR EACH ROW EXECUTE FUNCTION public.trigger_evaluate_late_arrivals();

-- Changing the rule re-checks everyone in the office against it. A row
-- being created (the seed above, a new office) evaluates nobody.
CREATE OR REPLACE FUNCTION public.trigger_evaluate_late_arrivals_for_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  r record;
BEGIN
  IF NEW.kind <> 'tardy_threshold' OR NOT NEW.is_active THEN RETURN NULL; END IF;
  IF NEW.threshold_count = OLD.threshold_count
     AND NEW.threshold_window_days = OLD.threshold_window_days
     AND NEW.is_active = OLD.is_active THEN
    RETURN NULL;
  END IF;
  FOR r IN
    SELECT DISTINCT e.user_id
      FROM public.employees e
     WHERE e.org_id = NEW.org_id AND e.user_id IS NOT NULL
       AND e.employment_status = 'active' AND e.clocks_in
  LOOP
    PERFORM public.evaluate_late_arrival_threshold(NEW.org_id, r.user_id);
  END LOOP;
  RETURN NULL;
END;
$fn$;
DROP TRIGGER IF EXISTS trg_evaluate_late_arrivals_for_org ON public.escalation_policies;
CREATE TRIGGER trg_evaluate_late_arrivals_for_org
  AFTER UPDATE ON public.escalation_policies
  FOR EACH ROW EXECUTE FUNCTION public.trigger_evaluate_late_arrivals_for_org();

-- ------------------------------------------------------------
-- 7. The meeting, the team member's comment, and the signatures
-- ------------------------------------------------------------

-- A manager records the meeting: date, a brief summary, agreed next steps.
-- Recording it moves the report to meeting_completed and asks the team
-- member to read and sign. Recording it again is an amendment: it needs a
-- reason, is written to the amendment log, and — if anything had been
-- signed, or the report was closed — clears both signatures so they are
-- given again over the new wording.
CREATE OR REPLACE FUNCTION public.record_attendance_meeting(
  p_report_id uuid, p_meeting_date date, p_summary text, p_next_steps text DEFAULT '', p_amendment_reason text DEFAULT ''
)
RETURNS public.incident_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  rpt public.incident_reports;
  v_uid uuid := auth.uid();
  v_summary text := btrim(coalesce(p_summary, ''));
  v_next text := btrim(coalesce(p_next_steps, ''));
  v_reason text := btrim(coalesce(p_amendment_reason, ''));
  v_subject_user uuid;
  v_tz text;
  v_today date;
  v_name text;
  v_reset boolean;
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  SELECT * INTO rpt FROM public.incident_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Incident report not found' USING ERRCODE = 'P0002'; END IF;
  IF rpt.category <> 'attendance' THEN
    RAISE EXCEPTION 'Only an attendance incident report has a meeting record' USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_org_admin(rpt.org_id) THEN
    RAISE EXCEPTION 'Only an owner or manager can record the meeting' USING ERRCODE = '42501';
  END IF;
  SELECT e.user_id INTO v_subject_user FROM public.employees e WHERE e.id = rpt.employee_id;
  IF v_subject_user IS NOT NULL AND v_subject_user = v_uid THEN
    RAISE EXCEPTION 'The meeting is recorded by a manager, not by the person the report is about' USING ERRCODE = '42501';
  END IF;
  IF p_meeting_date IS NULL THEN RAISE EXCEPTION 'Enter the date of the meeting' USING ERRCODE = '22023'; END IF;
  SELECT coalesce(s.timezone, 'America/New_York') INTO v_tz FROM public.org_practice_settings s WHERE s.org_id = rpt.org_id;
  BEGIN
    v_today := (now() AT TIME ZONE coalesce(v_tz, 'America/New_York'))::date;
  EXCEPTION WHEN OTHERS THEN
    v_today := (now() AT TIME ZONE 'America/New_York')::date;
  END;
  IF p_meeting_date > v_today THEN RAISE EXCEPTION 'The meeting date cannot be in the future' USING ERRCODE = '22023'; END IF;
  IF length(v_summary) < 3 THEN RAISE EXCEPTION 'Write a brief summary of what was discussed' USING ERRCODE = '22023'; END IF;
  IF length(v_summary) > 4000 OR length(v_next) > 4000 THEN
    RAISE EXCEPTION 'Keep the meeting record under 4,000 characters per field' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(nullif(btrim(coalesce(e.preferred_name, '')), ''), e.display_name, '') INTO v_name
    FROM public.employees e WHERE e.org_id = rpt.org_id AND e.user_id = v_uid LIMIT 1;

  IF rpt.meeting_recorded_at IS NULL THEN
    UPDATE public.incident_reports
       SET meeting_date = p_meeting_date,
           meeting_summary = v_summary,
           meeting_next_steps = v_next,
           meeting_recorded_at = now(),
           meeting_recorded_by = v_uid,
           reviewed_by = v_uid,
           reviewed_by_name = coalesce(v_name, ''),
           reviewed_at = now(),
           status = 'meeting_completed'
     WHERE id = rpt.id
     RETURNING * INTO rpt;

    INSERT INTO public.audit_events
      (user_id, org_id, actor_id, event_type, action_type, target_table, target_id, after_json, related_date, event_details)
    VALUES
      (v_uid, rpt.org_id, v_uid, 'attendance_meeting_recorded', 'update', 'incident_reports', rpt.id,
       jsonb_build_object('meeting_date', rpt.meeting_date, 'meeting_summary', rpt.meeting_summary, 'meeting_next_steps', rpt.meeting_next_steps),
       rpt.meeting_date, jsonb_build_object('target_employee_id', rpt.employee_id));

    PERFORM public.late_arrival_notify(
      rpt.org_id, v_subject_user, v_uid, 'attendance_incident_signature_needed',
      'Meeting recorded: your signature is requested',
      format('The meeting about your attendance incident report was recorded for %s. Read the summary, add a comment if you wish, and sign to confirm the discussion and receipt. Signing does not mean you agree with every statement.',
             to_char(rpt.meeting_date, 'Mon FMDD, YYYY')),
      'incident_reports', rpt.id);
    RETURN rpt;
  END IF;

  -- An amendment.
  IF length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Say what changed and why; the amendment is part of the record' USING ERRCODE = '22023';
  END IF;
  v_reset := rpt.employee_signed_at IS NOT NULL OR rpt.manager_signed_at IS NOT NULL OR rpt.status = 'closed';
  v_before := jsonb_build_object('meeting_date', rpt.meeting_date, 'meeting_summary', rpt.meeting_summary, 'meeting_next_steps', rpt.meeting_next_steps);
  v_after := jsonb_build_object('meeting_date', p_meeting_date, 'meeting_summary', v_summary, 'meeting_next_steps', v_next);
  IF v_before = v_after THEN RETURN rpt; END IF;

  INSERT INTO public.incident_report_amendments
    (org_id, incident_report_id, kind, amended_by, amended_by_name, reason, before_json, after_json, signatures_reset)
  VALUES
    (rpt.org_id, rpt.id, 'meeting', v_uid, coalesce(v_name, ''), v_reason, v_before, v_after, v_reset);

  UPDATE public.incident_reports
     SET meeting_date = p_meeting_date,
         meeting_summary = v_summary,
         meeting_next_steps = v_next,
         reviewed_by = v_uid,
         reviewed_by_name = coalesce(v_name, ''),
         reviewed_at = now(),
         employee_signature  = CASE WHEN v_reset THEN '' ELSE employee_signature END,
         employee_signed_at  = CASE WHEN v_reset THEN NULL ELSE employee_signed_at END,
         employee_signed_by  = CASE WHEN v_reset THEN NULL ELSE employee_signed_by END,
         manager_signature   = CASE WHEN v_reset THEN '' ELSE manager_signature END,
         manager_signed_at   = CASE WHEN v_reset THEN NULL ELSE manager_signed_at END,
         manager_signed_by   = CASE WHEN v_reset THEN NULL ELSE manager_signed_by END,
         manager_signed_role = CASE WHEN v_reset THEN '' ELSE manager_signed_role END,
         status = CASE WHEN v_reset THEN 'meeting_completed' ELSE status END,
         closed_at = CASE WHEN v_reset THEN NULL ELSE closed_at END
   WHERE id = rpt.id
   RETURNING * INTO rpt;

  INSERT INTO public.audit_events
    (user_id, org_id, actor_id, event_type, action_type, target_table, target_id, before_json, after_json, reason, related_date, event_details)
  VALUES
    (v_uid, rpt.org_id, v_uid, 'attendance_meeting_amended', 'update', 'incident_reports', rpt.id, v_before, v_after, v_reason,
     rpt.meeting_date, jsonb_build_object('target_employee_id', rpt.employee_id, 'signatures_reset', v_reset));

  PERFORM public.late_arrival_notify(
    rpt.org_id, v_subject_user, v_uid, 'attendance_incident_amended',
    'Attendance incident report amended',
    format('The meeting record on your attendance incident report was amended: %s.%s', v_reason,
           CASE WHEN v_reset THEN ' Both signatures are needed again over the amended wording.' ELSE '' END),
    'incident_reports', rpt.id);
  RETURN rpt;
END;
$fn$;

-- The team member's own comment, in their own words, any time before the
-- report closes. Changing it after a signature is an amendment that
-- clears both signatures: nobody's signature stays over content they did
-- not see.
CREATE OR REPLACE FUNCTION public.comment_attendance_report(p_report_id uuid, p_comment text)
RETURNS public.incident_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  rpt public.incident_reports;
  v_uid uuid := auth.uid();
  v_comment text := btrim(coalesce(p_comment, ''));
  v_reset boolean;
  v_name text;
  v_reviewer uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF length(v_comment) > 4000 THEN RAISE EXCEPTION 'Keep the comment under 4,000 characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO rpt FROM public.incident_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Incident report not found' USING ERRCODE = 'P0002'; END IF;
  IF rpt.category <> 'attendance' THEN
    RAISE EXCEPTION 'Only an attendance incident report takes a team member comment' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = rpt.employee_id AND e.user_id = v_uid) THEN
    RAISE EXCEPTION 'Only the team member the report is about can add their comment' USING ERRCODE = '42501';
  END IF;
  IF rpt.status = 'closed' THEN
    RAISE EXCEPTION 'This report is closed; its comment is part of the signed record' USING ERRCODE = '22023';
  END IF;
  IF rpt.employee_comment = v_comment THEN RETURN rpt; END IF;
  v_reset := rpt.employee_signed_at IS NOT NULL OR rpt.manager_signed_at IS NOT NULL;
  v_name := public.late_arrival_person_name(rpt.employee_id);

  IF v_reset THEN
    INSERT INTO public.incident_report_amendments
      (org_id, incident_report_id, kind, amended_by, amended_by_name, reason, before_json, after_json, signatures_reset)
    VALUES
      (rpt.org_id, rpt.id, 'employee_comment', v_uid, v_name, 'Team member comment changed after signing',
       jsonb_build_object('employee_comment', rpt.employee_comment), jsonb_build_object('employee_comment', v_comment), true);
  END IF;

  UPDATE public.incident_reports
     SET employee_comment = v_comment,
         employee_comment_at = now(),
         employee_signature  = CASE WHEN v_reset THEN '' ELSE employee_signature END,
         employee_signed_at  = CASE WHEN v_reset THEN NULL ELSE employee_signed_at END,
         employee_signed_by  = CASE WHEN v_reset THEN NULL ELSE employee_signed_by END,
         manager_signature   = CASE WHEN v_reset THEN '' ELSE manager_signature END,
         manager_signed_at   = CASE WHEN v_reset THEN NULL ELSE manager_signed_at END,
         manager_signed_by   = CASE WHEN v_reset THEN NULL ELSE manager_signed_by END,
         manager_signed_role = CASE WHEN v_reset THEN '' ELSE manager_signed_role END,
         status = CASE WHEN v_reset THEN 'meeting_completed' ELSE status END
   WHERE id = rpt.id
   RETURNING * INTO rpt;

  IF v_reset THEN
    FOR v_reviewer IN SELECT public.attendance_report_reviewers(rpt.org_id, v_uid, rpt.countersign_role) LOOP
      PERFORM public.late_arrival_notify(
        rpt.org_id, v_reviewer, v_uid, 'attendance_incident_amended',
        format('%s changed their comment', v_name),
        format('%s changed their comment on the attendance incident report after it was signed. Both signatures are needed again.', v_name),
        'incident_reports', rpt.id);
    END LOOP;
  END IF;
  RETURN rpt;
END;
$fn$;

-- Signing, step one: the employee the report is about. Unchanged for
-- safety reports. For an attendance report the meeting must be on record,
-- and the second signature closes the report.
CREATE OR REPLACE FUNCTION public.sign_incident_report_employee(
  _report_id uuid,
  _typed_name text
)
RETURNS public.incident_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  rpt public.incident_reports;
  clean text := btrim(coalesce(_typed_name, ''));
  v_attendance boolean;
  v_closing boolean := false;
  v_reviewer uuid;
BEGIN
  IF clean = '' THEN
    RAISE EXCEPTION 'Type your full name to sign';
  END IF;

  SELECT * INTO rpt FROM public.incident_reports WHERE id = _report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incident report not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = rpt.employee_id AND e.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the employee an incident report is about can sign it';
  END IF;

  IF rpt.employee_signed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This report is already signed';
  END IF;

  v_attendance := rpt.category = 'attendance';
  IF v_attendance THEN
    IF rpt.status = 'closed' THEN
      RAISE EXCEPTION 'This report is closed';
    END IF;
    IF rpt.meeting_recorded_at IS NULL THEN
      RAISE EXCEPTION 'The meeting has to be recorded before this report can be signed';
    END IF;
    v_closing := rpt.manager_signed_at IS NOT NULL;
  END IF;

  UPDATE public.incident_reports
     SET employee_signature = clean,
         employee_signed_at = now(),
         employee_signed_by = auth.uid(),
         status = CASE WHEN v_attendance THEN CASE WHEN v_closing THEN 'closed' ELSE 'awaiting_signatures' END ELSE status END,
         closed_at = CASE WHEN v_attendance AND v_closing THEN now() ELSE closed_at END
   WHERE id = _report_id
  RETURNING * INTO rpt;

  IF v_attendance THEN
    IF v_closing THEN
      PERFORM public.late_arrival_notify(
        rpt.org_id, rpt.manager_signed_by, auth.uid(), 'attendance_incident_closed',
        'Attendance incident report closed',
        format('%s signed the attendance incident report from %s. Both signatures are on it and it is closed.',
               clean, to_char(rpt.period_end, 'Mon FMDD, YYYY')),
        'incident_reports', rpt.id);
    ELSE
      FOR v_reviewer IN SELECT public.attendance_report_reviewers(rpt.org_id, auth.uid(), rpt.countersign_role) LOOP
        PERFORM public.late_arrival_notify(
          rpt.org_id, v_reviewer, auth.uid(), 'attendance_incident_signature_needed',
          'Attendance report needs your signature',
          format('%s signed the attendance incident report from %s. Your signature closes it.',
                 clean, to_char(rpt.period_end, 'Mon FMDD, YYYY')),
          'incident_reports', rpt.id);
      END LOOP;
    END IF;
  END IF;

  RETURN rpt;
END;
$fn$;

-- Signing, step two: the countersignature. The role rules are unchanged;
-- an attendance report additionally needs the meeting on record, and the
-- second signature closes it.
CREATE OR REPLACE FUNCTION public.countersign_incident_report(
  _report_id uuid,
  _typed_name text
)
RETURNS public.incident_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  rpt public.incident_reports;
  clean text := btrim(coalesce(_typed_name, ''));
  caller_role text;
  subject_user uuid;
  owner_available boolean;
  v_attendance boolean;
  v_closing boolean := false;
BEGIN
  IF clean = '' THEN
    RAISE EXCEPTION 'Type your full name to sign';
  END IF;

  SELECT * INTO rpt FROM public.incident_reports WHERE id = _report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incident report not found';
  END IF;

  SELECT m.role INTO caller_role
    FROM public.org_members m
   WHERE m.org_id = rpt.org_id
     AND m.user_id = auth.uid()
     AND m.status = 'active';

  IF caller_role IS NULL OR caller_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Only an owner or manager can sign off on an incident report';
  END IF;

  SELECT e.user_id INTO subject_user
    FROM public.employees e WHERE e.id = rpt.employee_id;

  IF subject_user IS NOT NULL AND subject_user = auth.uid() THEN
    RAISE EXCEPTION 'An incident report cannot be signed off by the person it is about';
  END IF;

  IF rpt.countersign_role = 'owner' AND caller_role <> 'owner' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.org_id = rpt.org_id
        AND m.role = 'owner'
        AND m.status = 'active'
        AND (subject_user IS NULL OR m.user_id <> subject_user)
    ) INTO owner_available;

    IF owner_available THEN
      RAISE EXCEPTION 'This report is about a manager or an owner — an owner has to sign it off';
    END IF;
  END IF;

  IF rpt.manager_signed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This report has already been signed off';
  END IF;

  v_attendance := rpt.category = 'attendance';
  IF v_attendance THEN
    IF rpt.status = 'closed' THEN
      RAISE EXCEPTION 'This report is closed';
    END IF;
    IF rpt.meeting_recorded_at IS NULL THEN
      RAISE EXCEPTION 'Record the meeting before signing';
    END IF;
    v_closing := rpt.employee_signed_at IS NOT NULL;
  END IF;

  UPDATE public.incident_reports
     SET manager_signature   = clean,
         manager_signed_at   = now(),
         manager_signed_by   = auth.uid(),
         manager_signed_role = caller_role,
         status = CASE
                    WHEN v_attendance THEN CASE WHEN v_closing THEN 'closed' ELSE 'awaiting_signatures' END
                    WHEN status = 'open' THEN 'under_review'
                    ELSE status
                  END,
         closed_at = CASE WHEN v_attendance AND v_closing THEN now() ELSE closed_at END
   WHERE id = _report_id
  RETURNING * INTO rpt;

  IF v_attendance THEN
    PERFORM public.late_arrival_notify(
      rpt.org_id, subject_user, auth.uid(),
      CASE WHEN v_closing THEN 'attendance_incident_closed' ELSE 'attendance_incident_signature_needed' END,
      CASE WHEN v_closing THEN 'Attendance incident report closed' ELSE 'Your signature closes the report' END,
      CASE WHEN v_closing
           THEN format('%s signed your attendance incident report from %s. Both signatures are on it and it is closed.', clean, to_char(rpt.period_end, 'Mon FMDD, YYYY'))
           ELSE format('%s signed your attendance incident report from %s. Your signature is the last step; it confirms the discussion and receipt, not agreement with every statement.', clean, to_char(rpt.period_end, 'Mon FMDD, YYYY'))
      END,
      'incident_reports', rpt.id);
  END IF;

  RETURN rpt;
END;
$fn$;

-- ------------------------------------------------------------
-- 8. Corrected lateness never counts, and never loses its history
-- ------------------------------------------------------------
-- The attendance engine (unchanged in every other line) used to delete an
-- unreviewed tardy when a correction made the day on time and leave a
-- decided one live. Now a late arrival nobody has touched is withdrawn,
-- and one that was acknowledged, requested, or decided is kept for the
-- record and marked resolved, which takes it out of every count.
CREATE OR REPLACE FUNCTION public._recompute_attendance_range_internal(p_user_id uuid, p_start_date date, p_end_date date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cur_date date;
  v_sched record;
  v_is_scheduled boolean;
  v_sched_start time;
  v_sched_end time;
  v_grace int;
  v_threshold int;
  v_apply_remote boolean;
  v_is_closed boolean;
  v_has_day_off boolean;
  v_day_off_type text;
  v_entry record;
  v_punch_count int;
  v_has_punches boolean;
  v_is_remote boolean;
  v_first_in timestamptz;
  v_first_in_local timestamp;
  v_first_in_local_time time;
  v_last_out_local_time time;
  v_is_absent boolean;
  v_is_incomplete boolean;
  v_is_late boolean;
  v_minutes_late int;
  v_has_edits boolean;
  v_has_day_comment boolean;
  v_tardy_status text;
  v_row_count int := 0;
  v_diff_min int;
  v_last_type text;
  v_tz text;
  v_tz_suspect boolean;
  v_sched_start_minutes int;
  v_actual_minutes int;
  v_all_verified boolean;
  v_status_code text;
  v_status_reasons jsonb;
  v_total_minutes int;
  v_recompute_version constant int := 5;
  v_employee_id uuid;
  v_org_id uuid;
BEGIN
  SELECT e.id, e.org_id INTO v_employee_id, v_org_id
  FROM public.employees e
  WHERE e.user_id = p_user_id
  LIMIT 1;

  v_tz := public.get_user_timezone(p_user_id);

  cur_date := p_start_date;

  WHILE cur_date <= p_end_date LOOP
    v_is_scheduled := false;
    v_sched_start := null;
    v_sched_end := null;
    v_grace := 0;
    v_threshold := 1;
    v_apply_remote := false;
    v_tz_suspect := false;
    v_all_verified := false;
    v_is_absent := false;
    v_is_incomplete := false;
    v_is_late := false;
    v_minutes_late := 0;
    v_status_code := 'ok';
    v_status_reasons := '{}'::jsonb;
    v_total_minutes := 0;
    v_day_off_type := null;
    v_last_out_local_time := null;

    SELECT * INTO v_sched FROM public.get_schedule_for_date(p_user_id, cur_date);
    IF FOUND AND v_sched.enabled THEN
      v_is_scheduled := true;
      v_sched_start := v_sched.start_time;
      v_sched_end := v_sched.end_time;
      v_grace := COALESCE(v_sched.grace_minutes, 0);
      v_threshold := COALESCE(v_sched.threshold_minutes, 1);
      v_apply_remote := COALESCE(v_sched.apply_to_remote, false);
    ELSE
      SELECT * INTO v_sched FROM public.work_schedule ws
        WHERE ws.user_id = p_user_id AND ws.weekday = EXTRACT(DOW FROM cur_date)::smallint
        LIMIT 1;
      IF FOUND AND v_sched.enabled THEN
        v_is_scheduled := true;
        v_sched_start := v_sched.start_time;
        v_sched_end := v_sched.end_time;
        v_grace := COALESCE(v_sched.grace_minutes, 0);
        v_threshold := COALESCE(v_sched.threshold_minutes, 1);
        v_apply_remote := COALESCE(v_sched.apply_to_remote, false);
      END IF;
    END IF;

    v_is_closed := EXISTS (
      SELECT 1 FROM public.office_closures
      WHERE closure_date = cur_date
        AND (user_id = p_user_id OR (v_org_id IS NOT NULL AND org_id = v_org_id))
    );
    IF NOT v_is_closed THEN
      v_is_closed := EXISTS (
        SELECT 1 FROM public.days_off
        WHERE user_id = p_user_id
          AND date_start <= cur_date AND date_end >= cur_date
          AND type = 'office_closed'
      );
    END IF;

    SELECT d.type INTO v_day_off_type
    FROM public.days_off d
    WHERE d.user_id = p_user_id
      AND d.date_start <= cur_date AND d.date_end >= cur_date
      AND d.type != 'office_closed'
    LIMIT 1;
    v_has_day_off := v_day_off_type IS NOT NULL;

    SELECT * INTO v_entry FROM public.time_entries te
    WHERE te.user_id = p_user_id AND te.employee_id = v_employee_id AND te.entry_date = cur_date LIMIT 1;

    v_has_punches := false;
    v_is_remote := false;
    v_has_day_comment := false;
    v_has_edits := false;
    v_first_in := null;
    v_first_in_local := null;
    v_first_in_local_time := null;
    v_punch_count := 0;

    IF v_entry.id IS NOT NULL THEN
      v_is_remote := COALESCE(v_entry.is_remote, false);
      v_has_day_comment := v_entry.entry_comment IS NOT NULL AND v_entry.entry_comment <> '';
      v_total_minutes := COALESCE(v_entry.total_minutes, 0);

      SELECT COUNT(*) INTO v_punch_count FROM public.punches
        WHERE time_entry_id = v_entry.id AND voided_at IS NULL;
      v_has_punches := v_punch_count > 0;

      IF v_has_punches THEN
        v_has_edits := EXISTS (
          SELECT 1 FROM public.punches
          WHERE time_entry_id = v_entry.id AND voided_at IS NULL AND is_edited = true
        );

        SELECT NOT EXISTS (
          SELECT 1 FROM public.punches
          WHERE time_entry_id = v_entry.id AND voided_at IS NULL AND time_verified = false
        ) INTO v_all_verified;

        SELECT p.punch_time,
               p.punch_time AT TIME ZONE v_tz,
               (p.punch_time AT TIME ZONE v_tz)::time
          INTO v_first_in, v_first_in_local, v_first_in_local_time
          FROM public.punches p
          WHERE p.time_entry_id = v_entry.id
            AND p.voided_at IS NULL
            AND p.punch_type = 'in'
            AND (p.punch_time AT TIME ZONE v_tz)::date = cur_date
          ORDER BY p.punch_time ASC LIMIT 1;

        IF v_first_in IS NULL THEN
          SELECT p.punch_time,
                 p.punch_time AT TIME ZONE v_tz,
                 (p.punch_time AT TIME ZONE v_tz)::time
            INTO v_first_in, v_first_in_local, v_first_in_local_time
            FROM public.punches p
            WHERE p.time_entry_id = v_entry.id AND p.voided_at IS NULL AND p.punch_type = 'in'
            ORDER BY p.punch_time ASC LIMIT 1;
        END IF;

        SELECT (p.punch_time AT TIME ZONE v_tz)::time
          INTO v_last_out_local_time
          FROM public.punches p
          WHERE p.time_entry_id = v_entry.id AND p.voided_at IS NULL AND p.punch_type = 'out'
          ORDER BY p.punch_time DESC LIMIT 1;

        IF v_punch_count % 2 != 0 THEN
          v_is_incomplete := true;
        ELSE
          SELECT p.punch_type INTO v_last_type FROM public.punches p
            WHERE p.time_entry_id = v_entry.id AND p.voided_at IS NULL
            ORDER BY p.seq DESC LIMIT 1;
          IF v_last_type = 'in' THEN v_is_incomplete := true; END IF;
        END IF;
      END IF;
    END IF;

    IF v_is_closed THEN
      v_status_code := 'closure'; v_is_absent := false; v_is_late := false; v_is_incomplete := false;
    ELSIF v_has_day_off AND v_day_off_type IN ('scheduled_with_notice', 'medical_leave', 'other') THEN
      v_status_code := 'day_off'; v_is_absent := false; v_is_late := false; v_is_incomplete := false;
    ELSIF v_has_day_off AND v_day_off_type = 'unscheduled' THEN
      v_status_code := 'absent'; v_is_absent := true; v_is_late := false; v_is_incomplete := false;
    ELSIF NOT v_is_scheduled THEN
      v_status_code := 'unscheduled'; v_is_absent := false; v_is_late := false; v_is_incomplete := false;
    ELSE
      IF NOT v_has_punches THEN
        v_is_absent := true; v_status_code := 'absent';
      ELSE
        IF NOT v_all_verified AND v_first_in_local_time IS NOT NULL AND v_sched_start IS NOT NULL THEN
          IF (v_first_in_local_time < '03:00:00'::time OR v_first_in_local_time > '23:00:00'::time) THEN
            v_sched_start_minutes := EXTRACT(HOUR FROM v_sched_start) * 60 + EXTRACT(MINUTE FROM v_sched_start);
            v_actual_minutes := EXTRACT(HOUR FROM v_first_in_local_time) * 60 + EXTRACT(MINUTE FROM v_first_in_local_time);
            IF ABS(v_actual_minutes - v_sched_start_minutes) > 480 THEN v_tz_suspect := true; END IF;
          END IF;
        END IF;

        IF NOT v_tz_suspect AND v_sched_start IS NOT NULL AND v_first_in_local_time IS NOT NULL THEN
          IF NOT v_is_remote OR v_apply_remote THEN
            v_diff_min := CEIL(EXTRACT(EPOCH FROM (
              v_first_in_local_time - (v_sched_start + (v_grace * interval '1 minute'))::time
            )) / 60);
            IF v_diff_min >= v_threshold THEN v_is_late := true; v_minutes_late := v_diff_min; END IF;
          END IF;
        END IF;

        IF v_tz_suspect THEN v_status_code := 'timezone_suspect';
        ELSIF v_is_late THEN v_status_code := 'late';
        ELSIF v_is_incomplete THEN v_status_code := 'incomplete';
        ELSIF v_is_remote THEN v_status_code := 'remote_ok';
        ELSE v_status_code := 'ok'; END IF;
      END IF;
    END IF;

    v_status_reasons := jsonb_build_object(
      'schedule_start', v_sched_start, 'schedule_end', v_sched_end,
      'first_punch', v_first_in_local_time, 'last_punch', v_last_out_local_time,
      'grace_minutes', v_grace, 'computed_minutes_late', v_minutes_late,
      'computed_minutes_worked', v_total_minutes, 'timezone', v_tz,
      'timezone_suspect', v_tz_suspect, 'day_off_type', v_day_off_type,
      'punch_count', v_punch_count, 'is_scheduled', v_is_scheduled,
      'recomputed_at', now()
    );

    IF v_is_late AND v_first_in IS NOT NULL AND v_sched_start IS NOT NULL THEN
      INSERT INTO public.tardies (
        user_id, org_id, employee_id, entry_date, time_entry_id,
        expected_start_time, actual_start_time, minutes_late, timezone_suspect
      ) VALUES (
        p_user_id, v_org_id, COALESCE(v_employee_id, p_user_id::uuid), cur_date, v_entry.id,
        v_sched_start, v_first_in, v_minutes_late, false
      )
      ON CONFLICT (user_id, entry_date) DO UPDATE SET
        time_entry_id = EXCLUDED.time_entry_id,
        expected_start_time = EXCLUDED.expected_start_time,
        actual_start_time = EXCLUDED.actual_start_time,
        minutes_late = EXCLUDED.minutes_late,
        timezone_suspect = false, resolved = false, updated_at = now();
    ELSIF v_tz_suspect AND v_first_in IS NOT NULL AND v_sched_start IS NOT NULL THEN
      INSERT INTO public.tardies (
        user_id, org_id, employee_id, entry_date, time_entry_id,
        expected_start_time, actual_start_time, minutes_late, timezone_suspect
      ) VALUES (
        p_user_id, v_org_id, COALESCE(v_employee_id, p_user_id::uuid), cur_date, v_entry.id,
        v_sched_start, v_first_in, 0, true
      )
      ON CONFLICT (user_id, entry_date) DO UPDATE SET
        time_entry_id = EXCLUDED.time_entry_id,
        expected_start_time = EXCLUDED.expected_start_time,
        actual_start_time = EXCLUDED.actual_start_time,
        minutes_late = 0, timezone_suspect = true, resolved = false, updated_at = now();
    ELSE
      -- Not late: a late arrival nobody has touched is withdrawn; one that
      -- was acknowledged, requested, or decided stays on record, resolved.
      DELETE FROM public.tardies
        WHERE user_id = p_user_id AND entry_date = cur_date
          AND approval_status = 'unreviewed'
          AND acknowledged_at IS NULL AND excuse_requested_at IS NULL;
      UPDATE public.tardies SET resolved = true, updated_at = now()
        WHERE user_id = p_user_id AND entry_date = cur_date AND resolved = false;
    END IF;

    SELECT t.approval_status INTO v_tardy_status FROM public.tardies t
      WHERE t.user_id = p_user_id AND t.entry_date = cur_date LIMIT 1;
    IF v_tardy_status IS NULL THEN v_tardy_status := 'unreviewed'; END IF;

    INSERT INTO public.attendance_day_status (
      user_id, org_id, employee_id, entry_date,
      schedule_expected_start, schedule_expected_end,
      is_scheduled_day, office_closed, has_punches, is_remote,
      is_absent, is_incomplete, is_late, minutes_late,
      tardy_approval_status, has_edits, has_day_comment, has_day_off,
      timezone_suspect, status_code, status_reasons, recompute_version, computed_at
    ) VALUES (
      p_user_id, v_org_id, COALESCE(v_employee_id, p_user_id::uuid), cur_date,
      v_sched_start, v_sched_end,
      v_is_scheduled, v_is_closed, v_has_punches, v_is_remote,
      v_is_absent, v_is_incomplete, v_is_late, v_minutes_late,
      v_tardy_status, v_has_edits, v_has_day_comment, v_has_day_off,
      v_tz_suspect, v_status_code, v_status_reasons, v_recompute_version, now()
    )
    ON CONFLICT (user_id, entry_date) DO UPDATE SET
      org_id = EXCLUDED.org_id, employee_id = EXCLUDED.employee_id,
      schedule_expected_start = EXCLUDED.schedule_expected_start,
      schedule_expected_end = EXCLUDED.schedule_expected_end,
      is_scheduled_day = EXCLUDED.is_scheduled_day,
      office_closed = EXCLUDED.office_closed,
      has_punches = EXCLUDED.has_punches, is_remote = EXCLUDED.is_remote,
      is_absent = EXCLUDED.is_absent, is_incomplete = EXCLUDED.is_incomplete,
      is_late = EXCLUDED.is_late, minutes_late = EXCLUDED.minutes_late,
      tardy_approval_status = EXCLUDED.tardy_approval_status,
      has_edits = EXCLUDED.has_edits, has_day_comment = EXCLUDED.has_day_comment,
      has_day_off = EXCLUDED.has_day_off, timezone_suspect = EXCLUDED.timezone_suspect,
      status_code = EXCLUDED.status_code, status_reasons = EXCLUDED.status_reasons,
      recompute_version = EXCLUDED.recompute_version, computed_at = now();

    v_row_count := v_row_count + 1;
    cur_date := cur_date + 1;
  END LOOP;

  RETURN v_row_count;
END;
$function$;

-- ------------------------------------------------------------
-- 9. Grants: what the app may call, what only the database runs
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.acknowledge_tardy(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_tardy_excuse(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_tardy_excuse(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_attendance_meeting(uuid, date, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.comment_attendance_report(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_tardy(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_tardy_excuse(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decide_tardy_excuse(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_attendance_meeting(uuid, date, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.comment_attendance_report(uuid, text) TO authenticated, service_role;

-- The sign functions keep their existing grants (authenticated).
REVOKE ALL ON FUNCTION public.sign_incident_report_employee(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.countersign_incident_report(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sign_incident_report_employee(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.countersign_incident_report(uuid, text) TO authenticated;

-- Database-only machinery.
REVOKE ALL ON FUNCTION public.evaluate_late_arrival_threshold(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.late_arrival_counts(public.tardies) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.late_arrival_notify(uuid, uuid, uuid, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.attendance_report_reviewers(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.late_arrival_person_name(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trigger_evaluate_late_arrivals() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trigger_evaluate_late_arrivals_for_org() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.late_arrival_rule_for_new_org() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_incident_report_delete() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_late_arrival_threshold(uuid, uuid) TO service_role;
