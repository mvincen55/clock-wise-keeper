-- ============================================================
-- PTO usage: the hours a team member says they are using.
--
-- Until now the bank deducted the `hours` typed on a days_off row, so PTO
-- use and a recorded absence were one record. The office wants them apart:
-- a person (or a manager for them) records "Use PTO: 8 hours on Oct 9"
-- whether or not a day off is on the calendar, the payroll report prints
-- those hours, and the live ledger deducts them. Hours typed on a time-off
-- record still count, through a synced 'day_off' usage row, so nothing
-- recorded before today changes; the backfill below creates those rows.
--
--   pto_usage                 one row per declared use: date, hours, note,
--                             who recorded it; voided rows stay for the record
--   record_pto_usage(...)     the team member (their own) or an owner/manager
--                             (anyone's) records a use; the bank guard applies
--   void_pto_usage(...)       takes a declared use back, with a reason
--   guard_pto_usage_balance   BEFORE INSERT/UPDATE: refuses hours the bank
--                             cannot cover unless this person may go negative
--   sync_pto_usage_from_day_off  keeps the 'day_off' row of a days_off record
--                             equal to the hours typed on it
--   get_live_pto_ledger       full replace from 20260914230000: pto_taken_hours
--                             now reads pto_usage
--   pto_available_hours       full replace from 20260929120000: "booked ahead"
--                             now reads pto_usage dated after today
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pto_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  -- The team member's login, kept in step with the roster by the identity trigger.
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  usage_date date NOT NULL,
  hours numeric(6,2) NOT NULL CHECK (hours > 0 AND hours <= 400),
  note text NOT NULL DEFAULT '',
  -- employee: recorded by the person; manager: by an owner or manager for
  -- them; day_off: the hours typed on a days_off record, kept in sync.
  source text NOT NULL DEFAULT 'employee' CHECK (source IN ('employee', 'manager', 'day_off')),
  day_off_id uuid REFERENCES public.days_off(id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid,
  void_reason text
);
COMMENT ON TABLE public.pto_usage IS 'PTO hours a team member records as used. The live ledger deducts these rows, never a day off by itself.';
CREATE UNIQUE INDEX IF NOT EXISTS pto_usage_day_off_uidx ON public.pto_usage (day_off_id) WHERE day_off_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pto_usage_employee_date_idx ON public.pto_usage (employee_id, usage_date);
CREATE INDEX IF NOT EXISTS pto_usage_org_date_idx ON public.pto_usage (org_id, usage_date);

ALTER TABLE public.pto_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pto_usage FROM anon, authenticated;
GRANT SELECT ON public.pto_usage TO authenticated;
GRANT ALL ON public.pto_usage TO service_role;

-- Everyone reads their own; owners and managers read the office. Writes go
-- through the two functions below, which stamp who did what.
DROP POLICY IF EXISTS "Own or admin read PTO usage" ON public.pto_usage;
CREATE POLICY "Own or admin read PTO usage" ON public.pto_usage FOR SELECT TO authenticated
  USING (public.can_access_employee(employee_id));

-- Roster identity (org check, user_id from the employee row, created_by
-- default) and updated_at, as on days_off.
DROP TRIGGER IF EXISTS pto_usage_employee_identity ON public.pto_usage;
CREATE TRIGGER pto_usage_employee_identity BEFORE INSERT OR UPDATE ON public.pto_usage
  FOR EACH ROW EXECUTE FUNCTION public.enforce_history_employee_identity();
DROP TRIGGER IF EXISTS update_pto_usage_updated_at ON public.pto_usage;
CREATE TRIGGER update_pto_usage_updated_at BEFORE UPDATE ON public.pto_usage
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- The bank guard, as guard_pto_balance does for hours on a days_off row. A
-- 'day_off' row was judged there already; a voided row deducts nothing.
CREATE OR REPLACE FUNCTION public.guard_pto_usage_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_delta numeric;
  v_available numeric;
  v_name text;
  v_eligible boolean;
BEGIN
  IF NEW.source = 'day_off' OR NEW.voided_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  v_delta := NEW.hours;
  IF TG_OP = 'UPDATE' AND OLD.employee_id = NEW.employee_id AND OLD.voided_at IS NULL THEN
    v_delta := v_delta - OLD.hours;
  END IF;
  IF v_delta <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT e.display_name, coalesce(e.pto_eligible, true) INTO v_name, v_eligible
    FROM public.employees e WHERE e.id = NEW.employee_id;
  IF v_eligible IS FALSE THEN
    RETURN NEW;
  END IF;
  IF public.pto_allows_negative(NEW.employee_id) THEN
    RETURN NEW;
  END IF;

  v_available := public.pto_available_hours(NEW.employee_id);
  IF v_available IS NULL THEN
    RAISE EXCEPTION 'No PTO starting balance is on file for %. Set it on their Team card before recording PTO hours.',
      coalesce(v_name, 'this team member')
      USING ERRCODE = 'P0001';
  END IF;
  IF v_delta > v_available + 0.005 THEN
    RAISE EXCEPTION 'Not enough PTO: % has % hours available and this would use %.',
      coalesce(v_name, 'this team member'),
      to_char(greatest(v_available, 0), 'FM9990.00'),
      to_char(v_delta, 'FM9990.00')
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.guard_pto_usage_balance() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_pto_usage_balance ON public.pto_usage;
CREATE TRIGGER trg_guard_pto_usage_balance
  BEFORE INSERT OR UPDATE OF hours, employee_id, voided_at ON public.pto_usage
  FOR EACH ROW EXECUTE FUNCTION public.guard_pto_usage_balance();

-- Hours typed on a time-off record are PTO use too: one synced row per
-- days_off record, replaced when the hours change, removed with the record
-- (the foreign key cascades) or when the hours come off it.
CREATE OR REPLACE FUNCTION public.sync_pto_usage_from_day_off()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
BEGIN
  IF NEW.type = 'office_closed' OR coalesce(NEW.hours, 0) <= 0 THEN
    DELETE FROM public.pto_usage u WHERE u.day_off_id = NEW.id;
    RETURN NEW;
  END IF;
  INSERT INTO public.pto_usage (org_id, employee_id, usage_date, hours, note, source, day_off_id, created_by)
  VALUES (NEW.org_id, NEW.employee_id, NEW.date_start, round(NEW.hours, 2), coalesce(NEW.notes, ''), 'day_off', NEW.id, NEW.created_by)
  ON CONFLICT (day_off_id) WHERE day_off_id IS NOT NULL DO UPDATE
    SET org_id = EXCLUDED.org_id,
        employee_id = EXCLUDED.employee_id,
        usage_date = EXCLUDED.usage_date,
        hours = EXCLUDED.hours,
        note = EXCLUDED.note,
        voided_at = NULL,
        voided_by = NULL,
        void_reason = NULL;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.sync_pto_usage_from_day_off() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_sync_pto_usage_from_day_off ON public.days_off;
CREATE TRIGGER trg_sync_pto_usage_from_day_off
  AFTER INSERT OR UPDATE OF hours, type, date_start, employee_id, notes ON public.days_off
  FOR EACH ROW EXECUTE FUNCTION public.sync_pto_usage_from_day_off();

-- Every day off that already carries hours gets its usage row, so no bank
-- moves on deploy.
INSERT INTO public.pto_usage (org_id, employee_id, usage_date, hours, note, source, day_off_id, created_by, created_at)
SELECT d.org_id, d.employee_id, d.date_start, round(d.hours, 2), coalesce(d.notes, ''), 'day_off', d.id, d.created_by, d.created_at
  FROM public.days_off d
 WHERE coalesce(d.hours, 0) > 0
   AND d.hours <= 400
   AND d.type <> 'office_closed'
   AND NOT EXISTS (SELECT 1 FROM public.pto_usage u WHERE u.day_off_id = d.id);

-- Recording a use: the team member for themselves, an owner or manager for
-- anyone on the roster. The guard above decides whether the bank covers it.
CREATE OR REPLACE FUNCTION public.record_pto_usage(p_employee_id uuid, p_usage_date date, p_hours numeric, p_note text DEFAULT '')
RETURNS public.pto_usage
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  e public.employees;
  v_row public.pto_usage;
  v_note text := btrim(coalesce(p_note, ''));
  v_source text;
  v_name text;
  v_admin uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  SELECT * INTO e FROM public.employees WHERE id = p_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Team member not found' USING ERRCODE = 'P0002'; END IF;
  IF e.user_id IS DISTINCT FROM v_uid AND NOT public.is_org_admin(e.org_id) THEN
    RAISE EXCEPTION 'Only the team member, an owner, or a manager can record PTO use' USING ERRCODE = '42501';
  END IF;
  IF e.pto_eligible IS FALSE THEN
    RAISE EXCEPTION 'PTO does not apply to %''s arrangement with the office' , e.display_name USING ERRCODE = '22023';
  END IF;
  IF p_usage_date IS NULL THEN RAISE EXCEPTION 'Pick the date the PTO is used' USING ERRCODE = '22023'; END IF;
  IF p_hours IS NULL OR p_hours <= 0 OR p_hours > 400 THEN
    RAISE EXCEPTION 'Enter the PTO hours being used: more than 0, at most 400' USING ERRCODE = '22023';
  END IF;
  IF length(v_note) > 500 THEN RAISE EXCEPTION 'Keep the note under 500 characters' USING ERRCODE = '22023'; END IF;
  v_source := CASE WHEN e.user_id = v_uid THEN 'employee' ELSE 'manager' END;

  INSERT INTO public.pto_usage (org_id, employee_id, usage_date, hours, note, source, created_by)
  VALUES (e.org_id, e.id, p_usage_date, round(p_hours, 2), v_note, v_source, v_uid)
  RETURNING * INTO v_row;

  INSERT INTO public.audit_events
    (user_id, org_id, employee_id, actor_id, event_type, action_type, target_table, target_id, after_json, reason, related_date, event_details)
  VALUES
    (coalesce(e.user_id, v_uid), e.org_id, e.id, v_uid, 'pto_usage_recorded', 'insert', 'pto_usage', v_row.id,
     jsonb_build_object('usage_date', v_row.usage_date, 'hours', v_row.hours, 'note', v_row.note, 'source', v_row.source),
     nullif(v_note, ''), v_row.usage_date, jsonb_build_object('target_employee_id', e.id));

  -- A person's own entry reaches the managers who run payroll.
  IF v_source = 'employee' THEN
    v_name := public.late_arrival_person_name(e.id);
    FOR v_admin IN SELECT public.attendance_report_reviewers(e.org_id, v_uid, 'manager') LOOP
      PERFORM public.late_arrival_notify(
        e.org_id, v_admin, v_uid, 'pto_usage_recorded',
        'PTO hours recorded',
        format('%s is using %s PTO hours on %s.%s', v_name, to_char(v_row.hours, 'FM9990.00'), to_char(v_row.usage_date, 'Mon FMDD, YYYY'),
               CASE WHEN v_note <> '' THEN ' Note: ' || v_note ELSE '' END),
        'pto_usage', v_row.id);
    END LOOP;
  END IF;
  RETURN v_row;
END;
$fn$;
REVOKE ALL ON FUNCTION public.record_pto_usage(uuid, date, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_pto_usage(uuid, date, numeric, text) TO authenticated, service_role;

-- Taking a use back. The row stays, marked void, with the reason; the
-- 'day_off' rows change only through their time-off record.
CREATE OR REPLACE FUNCTION public.void_pto_usage(p_id uuid, p_reason text DEFAULT '')
RETURNS public.pto_usage
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.pto_usage;
  e public.employees;
  v_admin boolean;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_row FROM public.pto_usage WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PTO use not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO e FROM public.employees WHERE id = v_row.employee_id;
  v_admin := public.is_org_admin(v_row.org_id);
  IF NOT v_admin AND e.user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Only the team member, an owner, or a manager can take this back' USING ERRCODE = '42501';
  END IF;
  IF v_row.source = 'day_off' THEN
    RAISE EXCEPTION 'These hours come from a time-off record; change the hours on that record instead' USING ERRCODE = '22023';
  END IF;
  IF length(v_reason) > 500 THEN RAISE EXCEPTION 'Keep the reason under 500 characters' USING ERRCODE = '22023'; END IF;
  IF v_row.voided_at IS NOT NULL THEN RETURN v_row; END IF;

  UPDATE public.pto_usage
     SET voided_at = now(), voided_by = v_uid, void_reason = nullif(v_reason, '')
   WHERE id = v_row.id
   RETURNING * INTO v_row;

  INSERT INTO public.audit_events
    (user_id, org_id, employee_id, actor_id, event_type, action_type, target_table, target_id, before_json, after_json, reason, related_date, event_details)
  VALUES
    (coalesce(e.user_id, v_uid), v_row.org_id, v_row.employee_id, v_uid, 'pto_usage_voided', 'update', 'pto_usage', v_row.id,
     jsonb_build_object('voided_at', NULL), jsonb_build_object('voided_at', v_row.voided_at, 'hours', v_row.hours, 'usage_date', v_row.usage_date),
     nullif(v_reason, ''), v_row.usage_date, jsonb_build_object('target_employee_id', v_row.employee_id));
  RETURN v_row;
END;
$fn$;
REVOKE ALL ON FUNCTION public.void_pto_usage(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_pto_usage(uuid, text) TO authenticated, service_role;

-- The live ledger: PTO taken in a week is the week's recorded use.
CREATE OR REPLACE FUNCTION public.get_live_pto_ledger(p_employee_id uuid)
RETURNS SETOF public.pto_ledger_weeks
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_catalog
AS $fn$
DECLARE
 e public.employees%ROWTYPE;
 s public.pto_settings%ROWTYPE;
 anchor public.pto_snapshots%ROWTYPE;
 w public.pto_ledger_weeks%ROWTYPE;
 start_date date; today date; tenure_date date; years int;
 confirmation public.pto_balance_reconciliations%ROWTYPE;
 payroll_hours numeric; balance numeric; raw_hours numeric; basis numeric; calculated numeric; credit numeric;
BEGIN
 SELECT * INTO e FROM public.employees WHERE id=p_employee_id;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT * INTO s FROM public.pto_settings WHERE employee_id=e.id AND org_id=e.org_id;
 tenure_date := coalesce(e.real_hire_date, e.hire_date, s.hire_date);
 IF tenure_date IS NULL THEN RETURN; END IF;
 today := (now() AT TIME ZONE coalesce(s.timezone,e.timezone,'America/New_York'))::date;
 SELECT * INTO anchor FROM public.pto_snapshots
 WHERE employee_id=e.id AND org_id=e.org_id AND snapshot_date<=today
 -- The join-date balance is authoritative even when a later legacy row exists.
 -- Preserve the legacy anchor until a join-date balance is explicitly confirmed.
 ORDER BY (snapshot_date=e.hire_date) DESC NULLS LAST, snapshot_date DESC LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;
 -- Preserve the existing Sunday/Saturday accrual boundaries and snapshot anchor.
 start_date := anchor.snapshot_date + ((7-extract(dow FROM anchor.snapshot_date)::int)%7);
 balance := anchor.snapshot_balance_hours;
 WHILE start_date<=today LOOP
  w := NULL;
  w.employee_id:=e.id; w.org_id:=e.org_id; w.user_id:=e.user_id;
  w.period_start:=start_date; w.period_end:=start_date+6;
  SELECT coalesce(sum(total_minutes),0)/60.0 INTO raw_hours FROM public.time_entries
   WHERE employee_id=e.id AND org_id=e.org_id AND entry_date BETWEEN start_date AND least(start_date+6,today);
  SELECT raw_hours+coalesce(sum(hours_delta),0) INTO raw_hours FROM public.worked_hour_adjustments
   WHERE employee_id=e.id AND org_id=e.org_id AND entry_date BETWEEN start_date AND least(start_date+6,today);
  w.worked_hours_raw:=round(raw_hours,2);
  basis:=least(greatest(raw_hours,0),coalesce(s.worked_hours_cap_weekly,40),40);
  w.worked_hours_capped:=round(basis,2);
  -- PTO used is what people record as used (pto_usage), never derived from
  -- a day off: a time-off record only reaches the bank through the hours
  -- typed on it, which sync into pto_usage as a 'day_off' row.
  SELECT coalesce(sum(u.hours),0) INTO w.pto_taken_hours FROM public.pto_usage u
   WHERE u.employee_id=e.id AND u.org_id=e.org_id AND u.voided_at IS NULL
    AND u.usage_date BETWEEN start_date AND least(start_date+6,today);
  -- Payroll-confirmed weekly PTO replaces the overlapping daily total.
  -- Summing the two would deduct the same leave twice. YTD is never usage.
  SELECT sum(p.pto_hours) INTO payroll_hours FROM public.payroll_pto_records p
   WHERE p.employee_id=e.id AND p.org_id=e.org_id
    AND p.period_start=start_date AND p.period_end=start_date+6 AND p.period_end<=today;
  w.pto_taken_hours:=coalesce(payroll_hours,w.pto_taken_hours);
  -- Calendar anniversaries, rather than a 365.25-day approximation.
  years:=extract(year FROM age(start_date,tenure_date))::int;
  w.tier_rate:=CASE WHEN years>=11 THEN .1009 WHEN years>=5 THEN .0962 WHEN years>=1 THEN .0769 ELSE .0576 END;
  w.weekly_cap:=CASE WHEN years>=11 THEN 4.00 WHEN years>=5 THEN 3.85 WHEN years>=1 THEN 3.08 ELSE 2.30 END;
  calculated:=round(w.tier_rate*(basis+w.pto_taken_hours),4);
  w.calculated_accrual:=round(calculated,2);
  credit:=round(least(calculated,w.weekly_cap,greatest(0,coalesce(s.max_balance,100)-balance)),2);
  w.accrual_credited:=credit;
  balance:=round(balance+credit-w.pto_taken_hours,2);
  -- A confirmed closing balance settles earlier history without erasing it.
  -- Future work and PTO continue from this balance; the confirmation is not usage.
  SELECT * INTO confirmation FROM public.pto_balance_reconciliations r
   WHERE r.employee_id=e.id AND r.org_id=e.org_id
    AND r.period_end=start_date+6 AND r.period_end<=today;
  IF FOUND THEN
   w.reconciliation_hours:=round(confirmation.balance_hours-balance,2);
   w.reconciliation_note:=confirmation.reason;
   w.confirmed_balance:=confirmation.balance_hours;
   balance:=confirmation.balance_hours;
  END IF;
  w.running_balance:=balance;
  RETURN NEXT w;
  start_date:=start_date+7;
 END LOOP;
END;
$fn$;

-- What can still be given: the bank today minus use already recorded for
-- days after today. Full replace of the live function.
CREATE OR REPLACE FUNCTION public.pto_available_hours(p_employee_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  v_emp public.employees%ROWTYPE;
  v_today date;
  v_balance numeric;
  v_booked numeric;
BEGIN
  SELECT * INTO v_emp FROM public.employees WHERE id = p_employee_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.can_access_employee(p_employee_id) THEN
    RAISE EXCEPTION 'You cannot read this PTO bank' USING ERRCODE = '42501';
  END IF;
  v_today := (now() AT TIME ZONE coalesce(v_emp.timezone, 'America/New_York'))::date;

  SELECT w.running_balance INTO v_balance
    FROM public.get_live_pto_ledger(p_employee_id) w
   ORDER BY w.period_start DESC
   LIMIT 1;
  IF v_balance IS NULL THEN
    SELECT s.snapshot_balance_hours INTO v_balance
      FROM public.pto_snapshots s
     WHERE s.employee_id = p_employee_id AND s.snapshot_date <= v_today
     ORDER BY (s.snapshot_date = v_emp.hire_date) DESC NULLS LAST, s.snapshot_date DESC
     LIMIT 1;
  END IF;
  IF v_balance IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(sum(u.hours), 0) INTO v_booked
    FROM public.pto_usage u
   WHERE u.employee_id = p_employee_id
     AND u.voided_at IS NULL
     AND u.usage_date > v_today;

  RETURN round(v_balance - v_booked, 2);
END;
$fn$;
REVOKE ALL ON FUNCTION public.pto_available_hours(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pto_available_hours(uuid) TO authenticated, service_role;
