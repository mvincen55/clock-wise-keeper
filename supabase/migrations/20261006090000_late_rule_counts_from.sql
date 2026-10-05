-- The late-arrival rule gains a counting start. The office announces the
-- rule to the team on Tue Oct 6, 2026 and counts from Wed Oct 7: a late
-- arrival before that day stays on the record (the Late arrivals tab still
-- lists it) but never counts toward the rule, never opens a report, and
-- never rides along on one. counts_from is null for an office that counts
-- everything, which is what every office did until now.
--
-- evaluate_late_arrival_threshold and trigger_evaluate_late_arrivals_for_org
-- are full replaces of the functions from 20260928120000_late_arrival_workflow.
-- The evaluator reads counts_from with the rule and leaves out tardies dated
-- before it; the office trigger re-checks everyone when the counting start
-- changes, as it does for the other fields of the rule.
ALTER TABLE public.escalation_policies ADD COLUMN IF NOT EXISTS counts_from date;
COMMENT ON COLUMN public.escalation_policies.counts_from IS
  'First day whose occurrences count toward this rule; null counts everything on the record.';

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
  v_counts_from date;
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

  SELECT p.threshold_count, p.threshold_window_days, p.is_active, p.counts_from INTO v_rule
    FROM public.escalation_policies p
   WHERE p.org_id = p_org_id AND p.kind = 'tardy_threshold';
  IF FOUND THEN
    IF NOT v_rule.is_active THEN RETURN 0; END IF;
    v_threshold := GREATEST(1, v_rule.threshold_count);
    v_window := GREATEST(1, v_rule.threshold_window_days);
    v_counts_from := v_rule.counts_from;
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
         AND (v_counts_from IS NULL OR t.entry_date >= v_counts_from)
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
     AND NEW.is_active = OLD.is_active
     AND NEW.counts_from IS NOT DISTINCT FROM OLD.counts_from THEN
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
