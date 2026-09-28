-- ============================================================
-- Late-arrival workflow verification probes.
-- (migration 20260928120000_late_arrival_workflow.sql)
--
-- Run in a disposable database AFTER the migration chain (the release
-- gate does this on every replay) or in the SQL editor as postgres. One
-- transaction, ROLLBACK at the end — nothing persists. Each probe raises
-- 'PROBE n FAILED …' on failure; a clean run means every probe passed.
--
-- Coverage:
--   1  every office gets the late-arrival rule (3 in 30, on)
--   2  employee and manager permissions: acknowledge / request / decide,
--      nobody decides their own, direct edits are guarded
--   3  an excuse request is pending at once, notifies the managers, and
--      does not count until decided
--   4  threshold boundary: two count, the third opens exactly one report
--      with the rule, the period, every event, the totals, both audiences
--      notified — acknowledgment never gates it
--   5  approved excuses never count; a declined request counts the moment
--      it is declined (recalculation on decision)
--   6  timezone-suspect and corrected (resolved) arrivals never count
--   7  rolling window in office dates: day 1 and day 30 share a window,
--      day 1 and day 31 do not; a later arrival attaches as a follow-up
--   8  duplicate prevention: re-evaluating changes nothing; later arrivals
--      attach to the open report without new alerts
--   9  meeting → signatures → closed; nothing signs before the meeting,
--      nobody signs for anyone else, direct edits and deletes refused,
--      an amendment resets both signatures, a closed report is done
--  10  after closure the included events never re-trigger; a fresh set
--      inside the window opens the next report
--  11  visibility: the team member and the managers read the report and
--      its events; another employee reads nothing
--  12  a corrected punch removes an untouched late arrival and resolves an
--      acknowledged one; neither counts (office-timezone dating)
--  13  events already covered by a legacy accountability record never open
--      a second workflow
--  14  changing the rule re-evaluates the office
--  15  nobody files an attendance report by hand; the evaluator is not
--      callable by app roles
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- ---------- fixtures (rolled back) ----------
INSERT INTO auth.users (id, email) VALUES
  ('ce000000-0000-4000-8000-00000000000a', 'probe-la-owner@example.test'),
  ('ce000000-0000-4000-8000-00000000000b', 'probe-la-manager@example.test'),
  ('ce000000-0000-4000-8000-00000000000c', 'probe-la-a@example.test'),
  ('ce000000-0000-4000-8000-00000000000d', 'probe-la-b@example.test'),
  ('ce000000-0000-4000-8000-00000000000e', 'probe-la-c@example.test'),
  ('ce000000-0000-4000-8000-00000000000f', 'probe-la-d@example.test'),
  ('ce000000-0000-4000-8000-000000000010', 'probe-la-e@example.test'),
  ('ce000000-0000-4000-8000-000000000011', 'probe-la-f@example.test'),
  ('ce000000-0000-4000-8000-000000000012', 'probe-la-g@example.test'),
  ('ce000000-0000-4000-8000-000000000013', 'probe-la-h@example.test'),
  ('ce000000-0000-4000-8000-000000000014', 'probe-la-manager2@example.test');

INSERT INTO public.orgs (id, name, created_by) VALUES
  ('ce000000-0000-4000-8000-0000000000ce', 'Late Arrival Probe Org', 'ce000000-0000-4000-8000-00000000000a');

INSERT INTO public.org_members (org_id, user_id, role, status) VALUES
  ('ce000000-0000-4000-8000-0000000000ce', 'ce000000-0000-4000-8000-00000000000a', 'owner', 'active'),
  ('ce000000-0000-4000-8000-0000000000ce', 'ce000000-0000-4000-8000-00000000000b', 'manager', 'active'),
  ('ce000000-0000-4000-8000-0000000000ce', 'ce000000-0000-4000-8000-000000000014', 'manager', 'active'),
  ('ce000000-0000-4000-8000-0000000000ce', 'ce000000-0000-4000-8000-00000000000c', 'employee', 'active'),
  ('ce000000-0000-4000-8000-0000000000ce', 'ce000000-0000-4000-8000-00000000000d', 'employee', 'active'),
  ('ce000000-0000-4000-8000-0000000000ce', 'ce000000-0000-4000-8000-00000000000e', 'employee', 'active'),
  ('ce000000-0000-4000-8000-0000000000ce', 'ce000000-0000-4000-8000-00000000000f', 'employee', 'active'),
  ('ce000000-0000-4000-8000-0000000000ce', 'ce000000-0000-4000-8000-000000000010', 'employee', 'active'),
  ('ce000000-0000-4000-8000-0000000000ce', 'ce000000-0000-4000-8000-000000000011', 'employee', 'active'),
  ('ce000000-0000-4000-8000-0000000000ce', 'ce000000-0000-4000-8000-000000000012', 'employee', 'active'),
  ('ce000000-0000-4000-8000-0000000000ce', 'ce000000-0000-4000-8000-000000000013', 'employee', 'active');

INSERT INTO public.employees (id, org_id, user_id, display_name) VALUES
  ('ceee0000-0000-4000-8000-00000000000a', 'ce000000-0000-4000-8000-0000000000ce', 'ce000000-0000-4000-8000-00000000000a', 'Probe Owner'),
  ('ceee0000-0000-4000-8000-00000000000b', 'ce000000-0000-4000-8000-0000000000ce', 'ce000000-0000-4000-8000-00000000000b', 'Probe Manager'),
  ('ceee0000-0000-4000-8000-000000000014', 'ce000000-0000-4000-8000-0000000000ce', 'ce000000-0000-4000-8000-000000000014', 'Probe Manager Two'),
  ('ceee0000-0000-4000-8000-00000000000c', 'ce000000-0000-4000-8000-0000000000ce', 'ce000000-0000-4000-8000-00000000000c', 'Probe Employee A'),
  ('ceee0000-0000-4000-8000-00000000000d', 'ce000000-0000-4000-8000-0000000000ce', 'ce000000-0000-4000-8000-00000000000d', 'Probe Employee B'),
  ('ceee0000-0000-4000-8000-00000000000e', 'ce000000-0000-4000-8000-0000000000ce', 'ce000000-0000-4000-8000-00000000000e', 'Probe Employee C'),
  ('ceee0000-0000-4000-8000-00000000000f', 'ce000000-0000-4000-8000-0000000000ce', 'ce000000-0000-4000-8000-00000000000f', 'Probe Employee D'),
  ('ceee0000-0000-4000-8000-000000000010', 'ce000000-0000-4000-8000-0000000000ce', 'ce000000-0000-4000-8000-000000000010', 'Probe Employee E'),
  ('ceee0000-0000-4000-8000-000000000011', 'ce000000-0000-4000-8000-0000000000ce', 'ce000000-0000-4000-8000-000000000011', 'Probe Employee F'),
  ('ceee0000-0000-4000-8000-000000000012', 'ce000000-0000-4000-8000-0000000000ce', 'ce000000-0000-4000-8000-000000000012', 'Probe Employee G'),
  ('ceee0000-0000-4000-8000-000000000013', 'ce000000-0000-4000-8000-0000000000ce', 'ce000000-0000-4000-8000-000000000013', 'Probe Employee H');

-- Everyone works weekdays 8:00–17:00 with a 5-minute grace (legacy
-- per-person schedule, the engine's fallback when no version is assigned).
INSERT INTO public.work_schedule (user_id, weekday, start_time, end_time, enabled, grace_minutes, threshold_minutes)
SELECT u, d, '08:00'::time, '17:00'::time, true, 5, 1
  FROM unnest(ARRAY[
    'ce000000-0000-4000-8000-00000000000b','ce000000-0000-4000-8000-000000000014',
    'ce000000-0000-4000-8000-00000000000c','ce000000-0000-4000-8000-00000000000d',
    'ce000000-0000-4000-8000-00000000000e','ce000000-0000-4000-8000-00000000000f',
    'ce000000-0000-4000-8000-000000000010','ce000000-0000-4000-8000-000000000011',
    'ce000000-0000-4000-8000-000000000012','ce000000-0000-4000-8000-000000000013']::uuid[]) AS u,
       generate_series(1, 5) AS d;

-- ---------- helpers (temporary, rolled back) ----------

-- A real late day: a time entry with an in-punch p_minutes past the grace
-- cutoff (office time) and an out-punch at five, then the engine, exactly
-- as production does it. Returns the tardy id the engine wrote.
CREATE FUNCTION pg_temp.late_day(p_user uuid, p_emp uuid, p_date date, p_minutes int)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_entry uuid; v_id uuid;
BEGIN
  INSERT INTO public.time_entries (user_id, org_id, employee_id, entry_date, source)
  VALUES (p_user, 'ce000000-0000-4000-8000-0000000000ce', p_emp, p_date, 'manual')
  RETURNING id INTO v_entry;
  INSERT INTO public.punches (time_entry_id, org_id, employee_id, seq, punch_type, punch_time, source) VALUES
    (v_entry, 'ce000000-0000-4000-8000-0000000000ce', p_emp, 0, 'in',
     ((p_date::text || ' 08:05')::timestamp AT TIME ZONE 'America/New_York') + make_interval(mins => p_minutes), 'manual'),
    (v_entry, 'ce000000-0000-4000-8000-0000000000ce', p_emp, 1, 'out',
     (p_date::text || ' 17:00')::timestamp AT TIME ZONE 'America/New_York', 'manual');
  PERFORM public._recompute_attendance_range_internal(p_user, p_date, p_date);
  SELECT id INTO v_id FROM public.tardies WHERE user_id = p_user AND entry_date = p_date;
  IF v_id IS NULL THEN RAISE EXCEPTION 'late_day: the engine wrote no tardy for % on %', p_user, p_date; END IF;
  RETURN v_id;
END $$;

-- Act as a signed-in person (RLS applies) or as the database again.
CREATE FUNCTION pg_temp.as_user(p_user uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);
END $$;
CREATE FUNCTION pg_temp.as_system() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
END $$;

CREATE FUNCTION pg_temp.open_report(p_emp uuid) RETURNS public.incident_reports LANGUAGE sql AS $$
  SELECT r.* FROM public.incident_reports r
   WHERE r.employee_id = p_emp AND r.category = 'attendance' AND r.status <> 'closed'
   ORDER BY r.created_at DESC LIMIT 1;
$$;
CREATE FUNCTION pg_temp.report_count(p_emp uuid) RETURNS int LANGUAGE sql AS $$
  SELECT count(*)::int FROM public.incident_reports r WHERE r.employee_id = p_emp AND r.category = 'attendance';
$$;
CREATE FUNCTION pg_temp.notices(p_user uuid, p_type text) RETURNS int LANGUAGE sql AS $$
  SELECT count(*)::int FROM public.notifications n WHERE n.recipient_user_id = p_user AND n.notification_type = p_type;
$$;

-- ---------- PROBE 1: the rule exists for the new office ----------
DO $$
DECLARE r record;
BEGIN
  SELECT threshold_count, threshold_window_days, is_active INTO r
    FROM public.escalation_policies
   WHERE org_id = 'ce000000-0000-4000-8000-0000000000ce' AND kind = 'tardy_threshold';
  IF NOT FOUND THEN RAISE EXCEPTION 'PROBE 1 FAILED: a new office got no late-arrival rule'; END IF;
  IF r.threshold_count <> 3 OR r.threshold_window_days <> 30 OR NOT r.is_active THEN
    RAISE EXCEPTION 'PROBE 1 FAILED: default rule is % in % (active %), expected 3 in 30 on', r.threshold_count, r.threshold_window_days, r.is_active;
  END IF;
  RAISE NOTICE 'PROBE 1 OK';
END $$;

-- ---------- PROBE 2: permissions ----------
DO $$
DECLARE
  v_a uuid; v_b uuid; v_m uuid; t public.tardies; n int;
BEGIN
  PERFORM pg_temp.as_system();
  v_a := pg_temp.late_day('ce000000-0000-4000-8000-00000000000c', 'ceee0000-0000-4000-8000-00000000000c', '2026-08-03', 12);
  v_b := pg_temp.late_day('ce000000-0000-4000-8000-00000000000d', 'ceee0000-0000-4000-8000-00000000000d', '2026-08-03', 7);
  v_m := pg_temp.late_day('ce000000-0000-4000-8000-00000000000b', 'ceee0000-0000-4000-8000-00000000000b', '2026-08-03', 9);

  SELECT * INTO t FROM public.tardies WHERE id = v_a;
  IF t.minutes_late <> 12 THEN RAISE EXCEPTION 'PROBE 2 FAILED: engine wrote % minutes late for a 12-minute arrival (office timezone?)', t.minutes_late; END IF;
  IF t.acknowledged_at IS NOT NULL OR t.excuse_requested_at IS NOT NULL OR t.approval_status <> 'unreviewed' THEN
    RAISE EXCEPTION 'PROBE 2 FAILED: a fresh late arrival is not blank';
  END IF;

  -- Employee A acknowledges their own arrival: a receipt, nothing else moves.
  PERFORM pg_temp.as_user('ce000000-0000-4000-8000-00000000000c');
  t := public.acknowledge_tardy(v_a);
  IF t.acknowledged_at IS NULL OR t.acknowledged_by <> 'ce000000-0000-4000-8000-00000000000c' THEN
    RAISE EXCEPTION 'PROBE 2 FAILED: acknowledgment not stamped with who and when';
  END IF;
  IF t.approval_status <> 'unreviewed' OR t.excuse_requested_at IS NOT NULL THEN
    RAISE EXCEPTION 'PROBE 2 FAILED: acknowledging changed the excuse status';
  END IF;
  -- A cannot acknowledge B's arrival.
  BEGIN
    PERFORM public.acknowledge_tardy(v_b);
    RAISE EXCEPTION 'PROBE 2 FAILED: acknowledged someone else''s late arrival';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- A cannot decide anything.
  BEGIN
    PERFORM public.decide_tardy_excuse(v_a, 'excused', '');
    RAISE EXCEPTION 'PROBE 2 FAILED: an employee decided an excuse';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- Nor edit the decision columns directly (RLS lets A touch the row; the guard says which columns).
  BEGIN
    UPDATE public.tardies SET approval_status = 'approved' WHERE id = v_a;
    RAISE EXCEPTION 'PROBE 2 FAILED: an employee approved their own row by editing it';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN NULL; END;

  -- The manager cannot decide their own late arrival, by function or by edit.
  PERFORM pg_temp.as_user('ce000000-0000-4000-8000-00000000000b');
  BEGIN
    PERFORM public.decide_tardy_excuse(v_m, 'excused', 'traffic');
    RAISE EXCEPTION 'PROBE 2 FAILED: a manager excused their own late arrival';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.tardies SET approval_status = 'approved' WHERE id = v_m;
    RAISE EXCEPTION 'PROBE 2 FAILED: a manager approved their own row by editing it';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- But can decide an employee's — with no note, no reason, nothing else required.
  t := public.decide_tardy_excuse(v_b, 'unexcused', '');
  IF t.approval_status <> 'unapproved' OR t.excuse_decided_by <> 'ce000000-0000-4000-8000-00000000000b' OR t.excuse_decided_at IS NULL THEN
    RAISE EXCEPTION 'PROBE 2 FAILED: manager decision not recorded';
  END IF;
  SELECT count(*) INTO n FROM public.audit_events WHERE target_table = 'tardies' AND target_id = v_b AND event_type = 'tardy_excuse_decided';
  IF n <> 1 THEN RAISE EXCEPTION 'PROBE 2 FAILED: decision left % audit rows, expected 1', n; END IF;
  PERFORM pg_temp.as_system();
  IF pg_temp.notices('ce000000-0000-4000-8000-00000000000d', 'tardy_excuse_declined') <> 1 THEN
    RAISE EXCEPTION 'PROBE 2 FAILED: B was not told of the decision';
  END IF;
  RAISE NOTICE 'PROBE 2 OK';
END $$;
RESET ROLE;

-- ---------- PROBE 3: an excuse request is pending at once ----------
DO $$
DECLARE v_c uuid; t public.tardies;
BEGIN
  PERFORM pg_temp.as_system();
  v_c := pg_temp.late_day('ce000000-0000-4000-8000-00000000000e', 'ceee0000-0000-4000-8000-00000000000e', '2026-08-04', 20);
  PERFORM pg_temp.as_user('ce000000-0000-4000-8000-00000000000e');
  BEGIN
    PERFORM public.request_tardy_excuse(v_c, 'no');
    RAISE EXCEPTION 'PROBE 3 FAILED: a two-letter explanation was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  t := public.request_tardy_excuse(v_c, 'Flat tire on the parkway, called the front desk at 8:10.');
  IF t.excuse_requested_at IS NULL OR t.approval_status <> 'unreviewed' OR t.reason_text NOT LIKE 'Flat tire%' THEN
    RAISE EXCEPTION 'PROBE 3 FAILED: request not recorded as pending';
  END IF;
  -- Acknowledging while it waits is refused: the answer is with the manager.
  BEGIN
    PERFORM public.acknowledge_tardy(v_c);
    RAISE EXCEPTION 'PROBE 3 FAILED: acknowledged a pending request';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM pg_temp.as_system();
  IF public.late_arrival_counts(t) THEN RAISE EXCEPTION 'PROBE 3 FAILED: a pending request counts toward the threshold'; END IF;
  IF pg_temp.notices('ce000000-0000-4000-8000-00000000000a', 'tardy_excuse_requested') <> 1
     OR pg_temp.notices('ce000000-0000-4000-8000-00000000000b', 'tardy_excuse_requested') <> 1
     OR pg_temp.notices('ce000000-0000-4000-8000-00000000000e', 'tardy_excuse_requested') <> 0 THEN
    RAISE EXCEPTION 'PROBE 3 FAILED: the managers (and only they) should hear about the request once';
  END IF;
  -- Re-submitting reworded, still one notification each.
  PERFORM pg_temp.as_user('ce000000-0000-4000-8000-00000000000e');
  t := public.request_tardy_excuse(v_c, 'Flat tire on the parkway; called at 8:10.');
  PERFORM pg_temp.as_system();
  IF pg_temp.notices('ce000000-0000-4000-8000-00000000000b', 'tardy_excuse_requested') <> 1 THEN
    RAISE EXCEPTION 'PROBE 3 FAILED: re-submitting spammed the managers';
  END IF;
  RAISE NOTICE 'PROBE 3 OK';
END $$;
RESET ROLE;

-- ---------- PROBE 4: the third unexcused arrival opens one report ----------
DO $$
DECLARE r public.incident_reports; n int; v_total int;
BEGIN
  PERFORM pg_temp.as_system();
  -- A already has Aug 3 (12 min, acknowledged). Add Aug 10 (8) → two, no report.
  PERFORM pg_temp.late_day('ce000000-0000-4000-8000-00000000000c', 'ceee0000-0000-4000-8000-00000000000c', '2026-08-10', 8);
  IF pg_temp.report_count('ceee0000-0000-4000-8000-00000000000c') <> 0 THEN RAISE EXCEPTION 'PROBE 4 FAILED: two arrivals opened a report'; END IF;
  -- Aug 17 (15), never acknowledged: acknowledgment is not a gate.
  PERFORM pg_temp.late_day('ce000000-0000-4000-8000-00000000000c', 'ceee0000-0000-4000-8000-00000000000c', '2026-08-17', 15);
  IF pg_temp.report_count('ceee0000-0000-4000-8000-00000000000c') <> 1 THEN
    RAISE EXCEPTION 'PROBE 4 FAILED: three arrivals opened % reports, expected 1', pg_temp.report_count('ceee0000-0000-4000-8000-00000000000c');
  END IF;
  r := pg_temp.open_report('ceee0000-0000-4000-8000-00000000000c');
  IF r.status <> 'meeting_required' OR r.category <> 'attendance' THEN RAISE EXCEPTION 'PROBE 4 FAILED: status % category %', r.status, r.category; END IF;
  IF r.rule_threshold_count <> 3 OR r.rule_window_days <> 30 THEN RAISE EXCEPTION 'PROBE 4 FAILED: rule not on the report'; END IF;
  IF r.period_end <> '2026-08-17' OR r.period_start <> '2026-07-19' THEN
    RAISE EXCEPTION 'PROBE 4 FAILED: period % – %, expected 2026-07-19 – 2026-08-17', r.period_start, r.period_end;
  END IF;
  IF r.occurrence_count <> 3 OR r.total_minutes_late <> 35 THEN
    RAISE EXCEPTION 'PROBE 4 FAILED: totals % occurrences / % minutes, expected 3 / 35', r.occurrence_count, r.total_minutes_late;
  END IF;
  IF r.reported_by IS NOT NULL OR r.countersign_role <> 'manager' OR r.meeting_recorded_at IS NOT NULL THEN
    RAISE EXCEPTION 'PROBE 4 FAILED: report identity or workflow fields wrong';
  END IF;
  IF r.description NOT LIKE '%3 unexcused late arrivals within a rolling 30-day period%' THEN
    RAISE EXCEPTION 'PROBE 4 FAILED: description does not state the rule';
  END IF;
  SELECT count(*), sum(minutes_late) INTO n, v_total FROM public.attendance_incident_events WHERE incident_report_id = r.id AND role = 'qualifying';
  IF n <> 3 OR v_total <> 35 THEN RAISE EXCEPTION 'PROBE 4 FAILED: % qualifying events linked (% minutes)', n, v_total; END IF;
  SELECT count(*) INTO n FROM public.attendance_incident_events e JOIN public.tardies t ON t.id = e.tardy_id
   WHERE e.incident_report_id = r.id AND t.entry_date = e.entry_date;
  IF n <> 3 THEN RAISE EXCEPTION 'PROBE 4 FAILED: events do not link to the attendance records'; END IF;
  IF pg_temp.notices('ce000000-0000-4000-8000-00000000000c', 'attendance_incident_opened') <> 1 THEN
    RAISE EXCEPTION 'PROBE 4 FAILED: the team member was not told';
  END IF;
  IF pg_temp.notices('ce000000-0000-4000-8000-00000000000a', 'attendance_incident_meeting') <> 1
     OR pg_temp.notices('ce000000-0000-4000-8000-00000000000b', 'attendance_incident_meeting') <> 1
     OR pg_temp.notices('ce000000-0000-4000-8000-000000000014', 'attendance_incident_meeting') <> 1 THEN
    RAISE EXCEPTION 'PROBE 4 FAILED: the managers were not asked to meet';
  END IF;
  SELECT count(*) INTO n FROM public.audit_events WHERE target_table = 'incident_reports' AND target_id = r.id AND event_type = 'attendance_incident_opened';
  IF n <> 1 THEN RAISE EXCEPTION 'PROBE 4 FAILED: opening the report left % audit rows', n; END IF;
  RAISE NOTICE 'PROBE 4 OK';
END $$;

-- ---------- PROBE 5: approved never counts; declined counts when declined ----------
DO $$
DECLARE v_c2 uuid; v_c4 uuid; r public.incident_reports; n int;
BEGIN
  PERFORM pg_temp.as_system();
  -- C: Aug 4 pending (probe 3). Aug 11 unexcused, Aug 18 unexcused → only two count.
  PERFORM pg_temp.late_day('ce000000-0000-4000-8000-00000000000e', 'ceee0000-0000-4000-8000-00000000000e', '2026-08-11', 6);
  PERFORM pg_temp.late_day('ce000000-0000-4000-8000-00000000000e', 'ceee0000-0000-4000-8000-00000000000e', '2026-08-18', 9);
  IF pg_temp.report_count('ceee0000-0000-4000-8000-00000000000e') <> 0 THEN RAISE EXCEPTION 'PROBE 5 FAILED: a pending request was counted'; END IF;
  -- The manager declines the Aug 4 request: three now count, the report opens on the decision.
  SELECT id INTO v_c4 FROM public.tardies WHERE user_id = 'ce000000-0000-4000-8000-00000000000e' AND entry_date = '2026-08-04';
  PERFORM pg_temp.as_user('ce000000-0000-4000-8000-00000000000b');
  PERFORM public.decide_tardy_excuse(v_c4, 'unexcused', 'A call at 8:10 is appreciated, but a flat is still a late start.');
  PERFORM pg_temp.as_system();
  IF pg_temp.report_count('ceee0000-0000-4000-8000-00000000000e') <> 1 THEN RAISE EXCEPTION 'PROBE 5 FAILED: declining did not recalculate'; END IF;
  r := pg_temp.open_report('ceee0000-0000-4000-8000-00000000000e');
  IF r.occurrence_count <> 3 OR r.period_end <> '2026-08-18' THEN RAISE EXCEPTION 'PROBE 5 FAILED: report built on the wrong set'; END IF;

  -- D: Aug 3 unexcused, Aug 10 excused by the owner, Aug 17 unexcused, Aug 24 unexcused → three count only at Aug 24.
  PERFORM pg_temp.late_day('ce000000-0000-4000-8000-00000000000f', 'ceee0000-0000-4000-8000-00000000000f', '2026-08-03', 10);
  v_c2 := pg_temp.late_day('ce000000-0000-4000-8000-00000000000f', 'ceee0000-0000-4000-8000-00000000000f', '2026-08-10', 30);
  PERFORM pg_temp.as_user('ce000000-0000-4000-8000-00000000000a');
  PERFORM public.decide_tardy_excuse(v_c2, 'excused', 'Called ahead; school closure.');
  PERFORM pg_temp.as_system();
  PERFORM pg_temp.late_day('ce000000-0000-4000-8000-00000000000f', 'ceee0000-0000-4000-8000-00000000000f', '2026-08-17', 4);
  IF pg_temp.report_count('ceee0000-0000-4000-8000-00000000000f') <> 0 THEN RAISE EXCEPTION 'PROBE 5 FAILED: an excused arrival was counted'; END IF;
  PERFORM pg_temp.late_day('ce000000-0000-4000-8000-00000000000f', 'ceee0000-0000-4000-8000-00000000000f', '2026-08-24', 5);
  IF pg_temp.report_count('ceee0000-0000-4000-8000-00000000000f') <> 1 THEN RAISE EXCEPTION 'PROBE 5 FAILED: three unexcused with one excused between them did not open a report'; END IF;
  r := pg_temp.open_report('ceee0000-0000-4000-8000-00000000000f');
  SELECT count(*) INTO n FROM public.attendance_incident_events WHERE incident_report_id = r.id;
  IF n <> 3 OR r.total_minutes_late <> 19 THEN RAISE EXCEPTION 'PROBE 5 FAILED: the excused day was linked or counted (% events, % minutes)', n, r.total_minutes_late; END IF;
  IF pg_temp.notices('ce000000-0000-4000-8000-00000000000f', 'tardy_excuse_approved') <> 1 THEN RAISE EXCEPTION 'PROBE 5 FAILED: D was not told of the excuse'; END IF;
  RAISE NOTICE 'PROBE 5 OK';
END $$;
RESET ROLE;

-- ---------- PROBE 6: what never counts, what always does ----------
DO $$
DECLARE t public.tardies; v_e1 uuid;
BEGIN
  PERFORM pg_temp.as_system();
  v_e1 := pg_temp.late_day('ce000000-0000-4000-8000-000000000010', 'ceee0000-0000-4000-8000-000000000010', '2026-08-03', 11);
  SELECT * INTO t FROM public.tardies WHERE id = v_e1;
  IF NOT public.late_arrival_counts(t) THEN RAISE EXCEPTION 'PROBE 6 FAILED: a plain unexcused arrival does not count'; END IF;
  -- The predicate is the one rule every count reads; check each exclusion on the row as the engine would write it.
  t.timezone_suspect := true; t.minutes_late := 0;
  IF public.late_arrival_counts(t) THEN RAISE EXCEPTION 'PROBE 6 FAILED: a timezone-suspect arrival counts'; END IF;
  t.timezone_suspect := false; t.minutes_late := 11; t.resolved := true;
  IF public.late_arrival_counts(t) THEN RAISE EXCEPTION 'PROBE 6 FAILED: a corrected (resolved) arrival counts'; END IF;
  t.resolved := false; t.approval_status := 'approved';
  IF public.late_arrival_counts(t) THEN RAISE EXCEPTION 'PROBE 6 FAILED: an excused arrival counts'; END IF;
  t.approval_status := 'unreviewed'; t.excuse_requested_at := now();
  IF public.late_arrival_counts(t) THEN RAISE EXCEPTION 'PROBE 6 FAILED: a pending request counts'; END IF;
  t.excuse_requested_at := NULL; t.acknowledged_at := now(); t.acknowledged_by := t.user_id;
  IF NOT public.late_arrival_counts(t) THEN RAISE EXCEPTION 'PROBE 6 FAILED: an acknowledged arrival stopped counting (acknowledgment is a receipt, not a gate)'; END IF;
  t.acknowledged_at := NULL; t.approval_status := 'unapproved'; t.excuse_requested_at := now() - interval '1 day'; t.excuse_decided_at := now();
  IF NOT public.late_arrival_counts(t) THEN RAISE EXCEPTION 'PROBE 6 FAILED: a declined request does not count'; END IF;
  RAISE NOTICE 'PROBE 6 OK';
END $$;

-- ---------- PROBE 7: the rolling window in office dates ----------
DO $$
DECLARE r public.incident_reports; n int;
BEGIN
  PERFORM pg_temp.as_system();
  -- H: Sep 1 and Oct 1 are 31 days apart: never one window. Sep 16 between them.
  PERFORM pg_temp.late_day('ce000000-0000-4000-8000-000000000013', 'ceee0000-0000-4000-8000-000000000013', '2026-09-01', 5);
  PERFORM pg_temp.late_day('ce000000-0000-4000-8000-000000000013', 'ceee0000-0000-4000-8000-000000000013', '2026-09-16', 6);
  PERFORM pg_temp.late_day('ce000000-0000-4000-8000-000000000013', 'ceee0000-0000-4000-8000-000000000013', '2026-10-01', 7);
  IF pg_temp.report_count('ceee0000-0000-4000-8000-000000000013') <> 0 THEN RAISE EXCEPTION 'PROBE 7 FAILED: day 1 and day 32 were counted in one 30-day window'; END IF;
  -- Sep 30 is day 30 counted from Sep 1: Sep 1, 16, 30 share a window → report; Oct 1 rides as a follow-up.
  PERFORM pg_temp.late_day('ce000000-0000-4000-8000-000000000013', 'ceee0000-0000-4000-8000-000000000013', '2026-09-30', 8);
  IF pg_temp.report_count('ceee0000-0000-4000-8000-000000000013') <> 1 THEN RAISE EXCEPTION 'PROBE 7 FAILED: day 1 and day 30 did not share a window'; END IF;
  r := pg_temp.open_report('ceee0000-0000-4000-8000-000000000013');
  IF r.period_start <> '2026-09-01' OR r.period_end <> '2026-09-30' OR r.occurrence_count <> 3 THEN
    RAISE EXCEPTION 'PROBE 7 FAILED: window % – % with % events', r.period_start, r.period_end, r.occurrence_count;
  END IF;
  SELECT count(*) INTO n FROM public.attendance_incident_events WHERE incident_report_id = r.id AND role = 'follow_up' AND entry_date = '2026-10-01';
  IF n <> 1 THEN RAISE EXCEPTION 'PROBE 7 FAILED: the later arrival was not attached as a follow-up'; END IF;
  RAISE NOTICE 'PROBE 7 OK';
END $$;

-- ---------- PROBE 8: duplicate prevention ----------
DO $$
DECLARE r public.incident_reports; n int; before_alerts int;
BEGIN
  PERFORM pg_temp.as_system();
  r := pg_temp.open_report('ceee0000-0000-4000-8000-00000000000c');
  before_alerts := pg_temp.notices('ce000000-0000-4000-8000-00000000000b', 'attendance_incident_meeting');
  -- Re-running the evaluator (a repeated scan) changes nothing.
  PERFORM public.evaluate_late_arrival_threshold('ce000000-0000-4000-8000-0000000000ce', 'ce000000-0000-4000-8000-00000000000c');
  PERFORM public.evaluate_late_arrival_threshold('ce000000-0000-4000-8000-0000000000ce', 'ce000000-0000-4000-8000-00000000000c');
  IF pg_temp.report_count('ceee0000-0000-4000-8000-00000000000c') <> 1 THEN RAISE EXCEPTION 'PROBE 8 FAILED: a repeated scan opened another report'; END IF;
  -- A later arrival while the report is open attaches to it, silently.
  PERFORM pg_temp.late_day('ce000000-0000-4000-8000-00000000000c', 'ceee0000-0000-4000-8000-00000000000c', '2026-08-24', 3);
  IF pg_temp.report_count('ceee0000-0000-4000-8000-00000000000c') <> 1 THEN RAISE EXCEPTION 'PROBE 8 FAILED: a fourth arrival opened another report'; END IF;
  SELECT count(*) INTO n FROM public.attendance_incident_events WHERE incident_report_id = r.id AND role = 'follow_up';
  IF n <> 1 THEN RAISE EXCEPTION 'PROBE 8 FAILED: % follow-ups linked, expected 1', n; END IF;
  IF (SELECT occurrence_count FROM public.incident_reports WHERE id = r.id) <> 3 THEN RAISE EXCEPTION 'PROBE 8 FAILED: the follow-up rewrote the report''s facts'; END IF;
  IF pg_temp.notices('ce000000-0000-4000-8000-00000000000b', 'attendance_incident_meeting') <> before_alerts THEN
    RAISE EXCEPTION 'PROBE 8 FAILED: a follow-up raised another alert';
  END IF;
  RAISE NOTICE 'PROBE 8 OK';
END $$;

-- ---------- PROBE 9: meeting → signatures → closed ----------
DO $$
DECLARE r public.incident_reports; n int;
BEGIN
  PERFORM pg_temp.as_system();
  r := pg_temp.open_report('ceee0000-0000-4000-8000-00000000000c');

  -- Nothing signs before the meeting is on record.
  PERFORM pg_temp.as_user('ce000000-0000-4000-8000-00000000000c');
  BEGIN
    PERFORM public.sign_incident_report_employee(r.id, 'Probe Employee A');
    RAISE EXCEPTION 'PROBE 9 FAILED: the team member signed before the meeting';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%meeting%' THEN RAISE; END IF;
  END;
  -- The team member cannot record the meeting.
  BEGIN
    PERFORM public.record_attendance_meeting(r.id, '2026-08-18', 'We talked.', '', '');
    RAISE EXCEPTION 'PROBE 9 FAILED: the team member recorded the meeting';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- But can comment before anything is signed, freely.
  r := public.comment_attendance_report(r.id, 'The Aug 10 arrival was after a school drop-off I had told the office about.');
  IF r.employee_comment_at IS NULL THEN RAISE EXCEPTION 'PROBE 9 FAILED: comment not stamped'; END IF;

  PERFORM pg_temp.as_user('ce000000-0000-4000-8000-00000000000b');
  BEGIN
    PERFORM public.countersign_incident_report(r.id, 'Probe Manager');
    RAISE EXCEPTION 'PROBE 9 FAILED: the manager signed before the meeting';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%meeting%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.record_attendance_meeting(r.id, (current_date + 3), 'We talked.', '', '');
    RAISE EXCEPTION 'PROBE 9 FAILED: a meeting in the future was recorded';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  -- Direct edits and deletes are refused even for a manager.
  BEGIN
    UPDATE public.incident_reports SET meeting_summary = 'edited' WHERE id = r.id;
    RAISE EXCEPTION 'PROBE 9 FAILED: a manager edited the report directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM public.incident_reports WHERE id = r.id;
    RAISE EXCEPTION 'PROBE 9 FAILED: a manager deleted the report';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- The manager records the meeting.
  r := public.record_attendance_meeting(r.id, '2026-08-18', 'Reviewed the three dates and the office rule. A will leave 15 minutes earlier on school days.', 'Check in again in two weeks.', '');
  IF r.status <> 'meeting_completed' OR r.meeting_recorded_by <> 'ce000000-0000-4000-8000-00000000000b' OR r.meeting_recorded_at IS NULL THEN
    RAISE EXCEPTION 'PROBE 9 FAILED: meeting not recorded (status %)', r.status;
  END IF;
  -- The manager cannot sign as the employee.
  BEGIN
    PERFORM public.sign_incident_report_employee(r.id, 'Probe Manager');
    RAISE EXCEPTION 'PROBE 9 FAILED: the manager signed for the team member';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%Only the employee%' THEN RAISE; END IF;
  END;
  -- Manager signs first: one signature outstanding.
  r := public.countersign_incident_report(r.id, 'Probe Manager');
  IF r.status <> 'awaiting_signatures' OR r.manager_signed_by <> 'ce000000-0000-4000-8000-00000000000b' OR r.manager_signed_role <> 'manager' OR r.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'PROBE 9 FAILED: after the manager signed: status %, closed_at %', r.status, r.closed_at;
  END IF;
  PERFORM pg_temp.as_system();
  IF pg_temp.notices('ce000000-0000-4000-8000-00000000000c', 'attendance_incident_signature_needed') < 2 THEN
    RAISE EXCEPTION 'PROBE 9 FAILED: the team member was not asked to sign (meeting, then manager signature)';
  END IF;

  -- Another employee can neither comment nor sign.
  PERFORM pg_temp.as_user('ce000000-0000-4000-8000-00000000000d');
  BEGIN
    PERFORM public.comment_attendance_report(r.id, 'not mine');
    RAISE EXCEPTION 'PROBE 9 FAILED: another employee commented';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.sign_incident_report_employee(r.id, 'Probe Employee B');
    RAISE EXCEPTION 'PROBE 9 FAILED: another employee signed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE '%Only the employee%' THEN RAISE; END IF;
  END;

  -- The team member signs: both signatures → closed, stamped by the server.
  PERFORM pg_temp.as_user('ce000000-0000-4000-8000-00000000000c');
  r := public.sign_incident_report_employee(r.id, 'Probe Employee A');
  IF r.status <> 'closed' OR r.closed_at IS NULL OR r.employee_signed_by <> 'ce000000-0000-4000-8000-00000000000c' OR r.employee_signed_at IS NULL THEN
    RAISE EXCEPTION 'PROBE 9 FAILED: both signatures did not close the report (status %)', r.status;
  END IF;
  BEGIN
    PERFORM public.comment_attendance_report(r.id, 'late thoughts');
    RAISE EXCEPTION 'PROBE 9 FAILED: a closed report took a comment';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM pg_temp.as_system();
  IF pg_temp.notices('ce000000-0000-4000-8000-00000000000b', 'attendance_incident_closed') <> 1 THEN
    RAISE EXCEPTION 'PROBE 9 FAILED: the manager was not told the report closed';
  END IF;

  -- An amendment after closure: audited, both signatures reset, reopened for signing.
  PERFORM pg_temp.as_user('ce000000-0000-4000-8000-00000000000b');
  BEGIN
    PERFORM public.record_attendance_meeting(r.id, '2026-08-18', 'Reviewed the three dates. Corrected: A will leave 20 minutes earlier.', 'Check in again in two weeks.', '');
    RAISE EXCEPTION 'PROBE 9 FAILED: an amendment without a reason was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  r := public.record_attendance_meeting(r.id, '2026-08-18', 'Reviewed the three dates. Corrected: A will leave 20 minutes earlier.', 'Check in again in two weeks.', 'Summary said 15 minutes; we agreed on 20.');
  IF r.status <> 'meeting_completed' OR r.closed_at IS NOT NULL OR r.employee_signed_at IS NOT NULL OR r.manager_signed_at IS NOT NULL OR r.manager_signature <> '' THEN
    RAISE EXCEPTION 'PROBE 9 FAILED: the amendment did not reset signatures (status %)', r.status;
  END IF;
  PERFORM pg_temp.as_system();
  SELECT count(*) INTO n FROM public.incident_report_amendments WHERE incident_report_id = r.id AND kind = 'meeting' AND signatures_reset AND reason LIKE 'Summary said%';
  IF n <> 1 THEN RAISE EXCEPTION 'PROBE 9 FAILED: amendment not logged'; END IF;
  IF pg_temp.notices('ce000000-0000-4000-8000-00000000000c', 'attendance_incident_amended') <> 1 THEN
    RAISE EXCEPTION 'PROBE 9 FAILED: the team member was not told of the amendment';
  END IF;
  -- Both sign again → closed.
  PERFORM pg_temp.as_user('ce000000-0000-4000-8000-00000000000c');
  r := public.sign_incident_report_employee(r.id, 'Probe Employee A');
  IF r.status <> 'awaiting_signatures' THEN RAISE EXCEPTION 'PROBE 9 FAILED: employee-first signing status %', r.status; END IF;
  PERFORM pg_temp.as_user('ce000000-0000-4000-8000-00000000000b');
  r := public.countersign_incident_report(r.id, 'Probe Manager');
  IF r.status <> 'closed' OR r.closed_at IS NULL THEN RAISE EXCEPTION 'PROBE 9 FAILED: renewed signatures did not close'; END IF;
  PERFORM pg_temp.as_system();
  RAISE NOTICE 'PROBE 9 OK';
END $$;
RESET ROLE;

-- ---------- PROBE 10: after closure, only a fresh set opens the next report ----------
DO $$
DECLARE r public.incident_reports; n int;
BEGIN
  PERFORM pg_temp.as_system();
  -- A's report is closed with Aug 3/10/17 qualifying and Aug 24 a follow-up. Aug 25 alone: nothing.
  PERFORM pg_temp.late_day('ce000000-0000-4000-8000-00000000000c', 'ceee0000-0000-4000-8000-00000000000c', '2026-08-25', 4);
  IF pg_temp.report_count('ceee0000-0000-4000-8000-00000000000c') <> 1 THEN RAISE EXCEPTION 'PROBE 10 FAILED: closed events re-triggered a report'; END IF;
  SELECT count(*) INTO n FROM public.attendance_incident_events WHERE user_id = 'ce000000-0000-4000-8000-00000000000c' AND entry_date = '2026-08-25';
  IF n <> 0 THEN RAISE EXCEPTION 'PROBE 10 FAILED: an arrival after closure was attached to the closed report'; END IF;
  PERFORM pg_temp.late_day('ce000000-0000-4000-8000-00000000000c', 'ceee0000-0000-4000-8000-00000000000c', '2026-08-26', 4);
  IF pg_temp.report_count('ceee0000-0000-4000-8000-00000000000c') <> 1 THEN RAISE EXCEPTION 'PROBE 10 FAILED: two fresh arrivals opened a report'; END IF;
  PERFORM pg_temp.late_day('ce000000-0000-4000-8000-00000000000c', 'ceee0000-0000-4000-8000-00000000000c', '2026-08-27', 4);
  IF pg_temp.report_count('ceee0000-0000-4000-8000-00000000000c') <> 2 THEN RAISE EXCEPTION 'PROBE 10 FAILED: a fresh set of three did not open the next report'; END IF;
  r := pg_temp.open_report('ceee0000-0000-4000-8000-00000000000c');
  IF r.occurrence_count <> 3 OR r.period_end <> '2026-08-27' THEN RAISE EXCEPTION 'PROBE 10 FAILED: the second report is built on the wrong set'; END IF;
  SELECT count(*) INTO n FROM public.attendance_incident_events WHERE incident_report_id = r.id AND entry_date < '2026-08-25';
  IF n <> 0 THEN RAISE EXCEPTION 'PROBE 10 FAILED: the second report reused events from the first'; END IF;
  RAISE NOTICE 'PROBE 10 OK';
END $$;

-- ---------- PROBE 11: who sees the report ----------
DO $$
DECLARE r public.incident_reports; n int;
BEGIN
  PERFORM pg_temp.as_system();
  r := pg_temp.open_report('ceee0000-0000-4000-8000-00000000000c');
  PERFORM pg_temp.as_user('ce000000-0000-4000-8000-00000000000c');
  SELECT count(*) INTO n FROM public.incident_reports WHERE id = r.id;
  IF n <> 1 THEN RAISE EXCEPTION 'PROBE 11 FAILED: the team member cannot see their own report'; END IF;
  SELECT count(*) INTO n FROM public.attendance_incident_events WHERE incident_report_id = r.id;
  IF n <> 3 THEN RAISE EXCEPTION 'PROBE 11 FAILED: the team member sees % linked events, expected 3', n; END IF;
  PERFORM pg_temp.as_user('ce000000-0000-4000-8000-00000000000b');
  SELECT count(*) INTO n FROM public.incident_reports WHERE id = r.id;
  IF n <> 1 THEN RAISE EXCEPTION 'PROBE 11 FAILED: the manager cannot see the report'; END IF;
  SELECT count(*) INTO n FROM public.incident_report_amendments WHERE incident_report_id <> r.id AND org_id = 'ce000000-0000-4000-8000-0000000000ce';
  IF n <> 1 THEN RAISE EXCEPTION 'PROBE 11 FAILED: the manager sees % amendments, expected 1', n; END IF;
  PERFORM pg_temp.as_user('ce000000-0000-4000-8000-00000000000d');
  SELECT count(*) INTO n FROM public.incident_reports WHERE id = r.id;
  IF n <> 0 THEN RAISE EXCEPTION 'PROBE 11 FAILED: another employee can see the report'; END IF;
  SELECT count(*) INTO n FROM public.attendance_incident_events WHERE incident_report_id = r.id;
  IF n <> 0 THEN RAISE EXCEPTION 'PROBE 11 FAILED: another employee can see the linked events'; END IF;
  SELECT count(*) INTO n FROM public.incident_report_amendments WHERE org_id = 'ce000000-0000-4000-8000-0000000000ce';
  IF n <> 0 THEN RAISE EXCEPTION 'PROBE 11 FAILED: another employee can see amendments'; END IF;
  PERFORM pg_temp.as_system();
  RAISE NOTICE 'PROBE 11 OK';
END $$;
RESET ROLE;

-- ---------- PROBE 12: a corrected punch takes the arrival out of every count ----------
DO $$
DECLARE v_f7 uuid; v_f8 uuid; t public.tardies; n int;
BEGIN
  PERFORM pg_temp.as_system();
  v_f7 := pg_temp.late_day('ce000000-0000-4000-8000-000000000011', 'ceee0000-0000-4000-8000-000000000011', '2026-09-07', 25);
  v_f8 := pg_temp.late_day('ce000000-0000-4000-8000-000000000011', 'ceee0000-0000-4000-8000-000000000011', '2026-09-08', 25);
  SELECT * INTO t FROM public.tardies WHERE id = v_f7;
  IF t.minutes_late <> 25 THEN RAISE EXCEPTION 'PROBE 12 FAILED: 08:30 Eastern read as % minutes late (expected 25: office timezone dating)', t.minutes_late; END IF;
  PERFORM pg_temp.as_user('ce000000-0000-4000-8000-000000000011');
  PERFORM public.acknowledge_tardy(v_f7);
  PERFORM pg_temp.as_system();
  -- The manager corrects both days to 07:55 Eastern (on time).
  UPDATE public.punches p SET punch_time = (te.entry_date::text || ' 07:55')::timestamp AT TIME ZONE 'America/New_York',
                              is_edited = true, edited_by = 'ce000000-0000-4000-8000-00000000000b', edited_at = now()
    FROM public.time_entries te
   WHERE te.id = p.time_entry_id AND te.employee_id = 'ceee0000-0000-4000-8000-000000000011' AND p.punch_type = 'in';
  PERFORM public._recompute_attendance_range_internal('ce000000-0000-4000-8000-000000000011', '2026-09-07', '2026-09-08');
  -- The acknowledged one stays on record, resolved; the untouched one is withdrawn.
  SELECT * INTO t FROM public.tardies WHERE id = v_f7;
  IF NOT FOUND OR NOT t.resolved OR t.acknowledged_at IS NULL THEN RAISE EXCEPTION 'PROBE 12 FAILED: the acknowledged arrival was not kept as resolved'; END IF;
  SELECT count(*) INTO n FROM public.tardies WHERE id = v_f8;
  IF n <> 0 THEN RAISE EXCEPTION 'PROBE 12 FAILED: the untouched arrival was not withdrawn'; END IF;
  -- Two more real late days: only those two count → no report.
  PERFORM pg_temp.late_day('ce000000-0000-4000-8000-000000000011', 'ceee0000-0000-4000-8000-000000000011', '2026-09-09', 10);
  PERFORM pg_temp.late_day('ce000000-0000-4000-8000-000000000011', 'ceee0000-0000-4000-8000-000000000011', '2026-09-10', 10);
  IF pg_temp.report_count('ceee0000-0000-4000-8000-000000000011') <> 0 THEN RAISE EXCEPTION 'PROBE 12 FAILED: corrected arrivals were counted'; END IF;
  RAISE NOTICE 'PROBE 12 OK';
END $$;
RESET ROLE;

-- ---------- PROBE 13: legacy accountability records are not duplicated ----------
DO $$
DECLARE r public.incident_reports; n int;
BEGIN
  PERFORM pg_temp.as_system();
  INSERT INTO public.accountability_reports (org_id, kind, subject_user_id, subject_employee_id, period_start, period_end, summary, facts, status)
  VALUES ('ce000000-0000-4000-8000-0000000000ce', 'tardy_threshold', 'ce000000-0000-4000-8000-000000000012', 'ceee0000-0000-4000-8000-000000000012',
          '2026-08-01', '2026-08-31', '3 tardies in 30 days.',
          '{"events":[{"entry_date":"2026-08-03","minutes_late":5},{"entry_date":"2026-08-04","minutes_late":5},{"entry_date":"2026-08-05","minutes_late":5}]}'::jsonb,
          'awaiting_member');
  PERFORM pg_temp.late_day('ce000000-0000-4000-8000-000000000012', 'ceee0000-0000-4000-8000-000000000012', '2026-08-03', 5);
  PERFORM pg_temp.late_day('ce000000-0000-4000-8000-000000000012', 'ceee0000-0000-4000-8000-000000000012', '2026-08-04', 5);
  PERFORM pg_temp.late_day('ce000000-0000-4000-8000-000000000012', 'ceee0000-0000-4000-8000-000000000012', '2026-08-05', 5);
  IF pg_temp.report_count('ceee0000-0000-4000-8000-000000000012') <> 0 THEN RAISE EXCEPTION 'PROBE 13 FAILED: events in a legacy record opened a second workflow'; END IF;
  PERFORM pg_temp.late_day('ce000000-0000-4000-8000-000000000012', 'ceee0000-0000-4000-8000-000000000012', '2026-08-06', 5);
  PERFORM pg_temp.late_day('ce000000-0000-4000-8000-000000000012', 'ceee0000-0000-4000-8000-000000000012', '2026-08-07', 5);
  IF pg_temp.report_count('ceee0000-0000-4000-8000-000000000012') <> 0 THEN RAISE EXCEPTION 'PROBE 13 FAILED: two fresh events plus legacy ones opened a report'; END IF;
  PERFORM pg_temp.late_day('ce000000-0000-4000-8000-000000000012', 'ceee0000-0000-4000-8000-000000000012', '2026-08-10', 5);
  IF pg_temp.report_count('ceee0000-0000-4000-8000-000000000012') <> 1 THEN RAISE EXCEPTION 'PROBE 13 FAILED: three fresh events did not open a report'; END IF;
  r := pg_temp.open_report('ceee0000-0000-4000-8000-000000000012');
  SELECT count(*) INTO n FROM public.attendance_incident_events WHERE incident_report_id = r.id AND entry_date <= '2026-08-05';
  IF n <> 0 THEN RAISE EXCEPTION 'PROBE 13 FAILED: legacy-covered events were linked'; END IF;
  RAISE NOTICE 'PROBE 13 OK';
END $$;

-- ---------- PROBE 14: changing the rule re-evaluates the office ----------
DO $$
DECLARE n int;
BEGIN
  PERFORM pg_temp.as_system();
  -- B: Aug 3 (declined in probe 2 → unexcused) plus Aug 12 → two.
  PERFORM pg_temp.late_day('ce000000-0000-4000-8000-00000000000d', 'ceee0000-0000-4000-8000-00000000000d', '2026-08-12', 6);
  IF pg_temp.report_count('ceee0000-0000-4000-8000-00000000000d') <> 0 THEN RAISE EXCEPTION 'PROBE 14 FAILED: setup'; END IF;
  UPDATE public.escalation_policies SET threshold_count = 2 WHERE org_id = 'ce000000-0000-4000-8000-0000000000ce' AND kind = 'tardy_threshold';
  IF pg_temp.report_count('ceee0000-0000-4000-8000-00000000000d') <> 1 THEN RAISE EXCEPTION 'PROBE 14 FAILED: lowering the rule did not re-evaluate'; END IF;
  IF (SELECT rule_threshold_count FROM pg_temp.open_report('ceee0000-0000-4000-8000-00000000000d')) <> 2 THEN RAISE EXCEPTION 'PROBE 14 FAILED: the report carries the wrong rule'; END IF;
  -- Turning the rule off evaluates nobody; back to 3 for the rest.
  UPDATE public.escalation_policies SET is_active = false WHERE org_id = 'ce000000-0000-4000-8000-0000000000ce' AND kind = 'tardy_threshold';
  PERFORM pg_temp.late_day('ce000000-0000-4000-8000-000000000014', 'ceee0000-0000-4000-8000-000000000014', '2026-08-03', 5);
  PERFORM pg_temp.late_day('ce000000-0000-4000-8000-000000000014', 'ceee0000-0000-4000-8000-000000000014', '2026-08-04', 5);
  IF pg_temp.report_count('ceee0000-0000-4000-8000-000000000014') <> 0 THEN RAISE EXCEPTION 'PROBE 14 FAILED: a rule that is off opened a report'; END IF;
  UPDATE public.escalation_policies SET is_active = true, threshold_count = 3 WHERE org_id = 'ce000000-0000-4000-8000-0000000000ce' AND kind = 'tardy_threshold';
  IF pg_temp.report_count('ceee0000-0000-4000-8000-000000000014') <> 0 THEN RAISE EXCEPTION 'PROBE 14 FAILED: two arrivals opened a report at 3'; END IF;
  PERFORM pg_temp.late_day('ce000000-0000-4000-8000-000000000014', 'ceee0000-0000-4000-8000-000000000014', '2026-08-05', 5);
  IF pg_temp.report_count('ceee0000-0000-4000-8000-000000000014') <> 1 THEN RAISE EXCEPTION 'PROBE 14 FAILED: a manager''s own third arrival did not open a report'; END IF;
  -- A report about a manager is signed off by an owner.
  IF (SELECT countersign_role FROM pg_temp.open_report('ceee0000-0000-4000-8000-000000000014')) <> 'owner' THEN RAISE EXCEPTION 'PROBE 14 FAILED: a manager''s report is not routed to an owner'; END IF;
  SELECT count(*) INTO n FROM public.notifications WHERE notification_type = 'attendance_incident_meeting'
     AND related_id = (SELECT id FROM pg_temp.open_report('ceee0000-0000-4000-8000-000000000014'));
  IF n <> 1 OR NOT EXISTS (SELECT 1 FROM public.notifications WHERE notification_type = 'attendance_incident_meeting'
     AND related_id = (SELECT id FROM pg_temp.open_report('ceee0000-0000-4000-8000-000000000014')) AND recipient_user_id = 'ce000000-0000-4000-8000-00000000000a') THEN
    RAISE EXCEPTION 'PROBE 14 FAILED: the owner alone should be asked to meet with a manager (% notified)', n;
  END IF;
  RAISE NOTICE 'PROBE 14 OK';
END $$;

-- ---------- PROBE 15: no hand-filed attendance reports; evaluator is database-only ----------
DO $$
BEGIN
  PERFORM pg_temp.as_user('ce000000-0000-4000-8000-00000000000b');
  BEGIN
    INSERT INTO public.incident_reports (org_id, employee_id, reported_by, incident_date, category, description)
    VALUES ('ce000000-0000-4000-8000-0000000000ce', 'ceee0000-0000-4000-8000-00000000000d', 'ce000000-0000-4000-8000-00000000000b', '2026-08-20', 'attendance', 'typed by hand');
    RAISE EXCEPTION 'PROBE 15 FAILED: an attendance report was filed by hand';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM pg_temp.as_system();
  IF has_function_privilege('authenticated', 'public.evaluate_late_arrival_threshold(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.evaluate_late_arrival_threshold(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PROBE 15 FAILED: the evaluator is callable by an app role';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.acknowledge_tardy(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.decide_tardy_excuse(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PROBE 15 FAILED: app-facing functions have the wrong grants';
  END IF;
  RAISE NOTICE 'PROBE 15 OK';
END $$;
RESET ROLE;

SELECT 'late arrival probes passed' AS result;
ROLLBACK;
