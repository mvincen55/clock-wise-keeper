CREATE TABLE public.worked_hour_adjustments (
 id uuid PRIMARY KEY,
 org_id uuid NOT NULL REFERENCES public.orgs(id),
 employee_id uuid NOT NULL REFERENCES public.employees(id),
 entry_date date NOT NULL,
 hours_delta numeric(10,2) NOT NULL CHECK(hours_delta<>0 AND abs(hours_delta)<=168),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 2000),
 entered_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.worked_hour_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY worked_adjustment_read ON public.worked_hour_adjustments FOR SELECT TO authenticated
 USING(public.is_org_admin(org_id) OR EXISTS(SELECT 1 FROM public.employees e WHERE e.id=employee_id AND e.org_id=worked_hour_adjustments.org_id AND e.user_id=auth.uid()));
REVOKE ALL ON public.worked_hour_adjustments FROM anon,authenticated;
GRANT SELECT ON public.worked_hour_adjustments TO authenticated;
GRANT ALL ON public.worked_hour_adjustments TO service_role;
CREATE INDEX worked_adjustment_employee_date ON public.worked_hour_adjustments(employee_id,entry_date);

CREATE FUNCTION public.add_worked_hour_adjustment(p_id uuid,p_employee_id uuid,p_entry_date date,p_hours_delta numeric,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE e public.employees%ROWTYPE; existing public.worked_hour_adjustments%ROWTYPE; week date; total numeric;
BEGIN
 SELECT * INTO e FROM public.employees WHERE id=p_employee_id;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_org_admin(e.org_id) THEN
  RAISE EXCEPTION 'Only an active owner or manager can adjust hours' USING ERRCODE='42501';
 END IF;
 IF p_id IS NULL OR p_entry_date IS NULL OR p_hours_delta IS NULL OR p_hours_delta=0 OR abs(p_hours_delta)>168 OR p_hours_delta<>round(p_hours_delta,2) OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 2000 THEN
  RAISE EXCEPTION 'Enter a date, nonzero hours with at most two decimals, and a reason (3-2000 characters)';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(e.id::text,0));
 SELECT * INTO existing FROM public.worked_hour_adjustments WHERE id=p_id;
 IF FOUND THEN
  IF existing.employee_id=e.id AND existing.entered_by=auth.uid() AND existing.entry_date=p_entry_date AND existing.hours_delta=p_hours_delta AND existing.reason=btrim(p_reason) THEN RETURN existing.id; END IF;
  RAISE EXCEPTION 'This adjustment request was already used';
 END IF;
 week:=p_entry_date-extract(dow FROM p_entry_date)::int;
 SELECT round(coalesce(sum(total_minutes),0)/60,2) INTO total FROM public.time_entries WHERE employee_id=e.id AND org_id=e.org_id AND entry_date BETWEEN week AND week+6;
 SELECT total+coalesce(sum(hours_delta),0)+p_hours_delta INTO total FROM public.worked_hour_adjustments WHERE employee_id=e.id AND org_id=e.org_id AND entry_date BETWEEN week AND week+6;
 IF total<0 THEN RAISE EXCEPTION 'The adjustment would make weekly worked hours negative'; END IF;
 INSERT INTO public.worked_hour_adjustments(id,org_id,employee_id,entry_date,hours_delta,reason,entered_by)
 VALUES(p_id,e.org_id,e.id,p_entry_date,p_hours_delta,btrim(p_reason),auth.uid());
 RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.add_worked_hour_adjustment(uuid,uuid,date,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_worked_hour_adjustment(uuid,uuid,date,numeric,text) TO authenticated,service_role;

-- Records are append-only for application users. Reverse with a new signed
-- adjustment and a reason rather than rewriting the original time or history.

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
  SELECT coalesce(sum(hours),0) INTO w.pto_taken_hours FROM public.days_off
   WHERE employee_id=e.id AND org_id=e.org_id AND date_start BETWEEN start_date AND least(start_date+6,today)
    AND type<>'office_closed';
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
  w.running_balance:=balance;
  RETURN NEXT w;
  start_date:=start_date+7;
 END LOOP;
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_live_pto_ledger(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_live_pto_ledger(uuid) TO authenticated,service_role;
COMMENT ON FUNCTION public.get_live_pto_ledger(uuid) IS 'Live PTO ledger from confirmed snapshots and current inputs; actual employment start determines tenure, provisional date is fallback.';
