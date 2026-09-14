-- Payroll totals are period evidence, not invented daily attendance records.
CREATE TABLE public.payroll_pto_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 org_id uuid NOT NULL REFERENCES public.orgs(id),
 employee_id uuid REFERENCES public.employees(id),
 payroll_employee_id text NOT NULL,
 payroll_employee_name text NOT NULL,
 period_start date NOT NULL,
 period_end date NOT NULL CHECK(period_end>=period_start),
 check_date date NOT NULL,
 check_number text NOT NULL,
 pto_hours numeric NOT NULL CHECK(pto_hours>=0),
 pto_ytd_hours numeric,
 worked_hours numeric,
 source_file text NOT NULL,
 source_sha256 text NOT NULL,
 source_page int NOT NULL CHECK(source_page>0),
 earnings jsonb NOT NULL DEFAULT '[]'::jsonb,
 review_note text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,payroll_employee_id,check_date,check_number)
);
ALTER TABLE public.payroll_pto_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY payroll_pto_read ON public.payroll_pto_records FOR SELECT TO authenticated
 USING(public.is_org_admin(org_id) OR EXISTS (
 SELECT 1 FROM public.employees e WHERE e.id=employee_id AND e.org_id=payroll_pto_records.org_id AND e.user_id=auth.uid()));
REVOKE ALL ON public.payroll_pto_records FROM anon,authenticated;
GRANT SELECT ON public.payroll_pto_records TO authenticated;
GRANT ALL ON public.payroll_pto_records TO service_role;
CREATE INDEX payroll_pto_employee_period ON public.payroll_pto_records(employee_id,period_start,period_end);
COMMENT ON TABLE public.payroll_pto_records IS 'Source-backed payroll period totals. Current-period PTO replaces daily PTO totals for an exact completed week, never adds to them. YTD is evidence only and is never deducted. Unmatched identities remain unassigned.';

-- Read-through calculation: no stale materialized balance and no destructive
-- delete/reinsert from a browser. SECURITY INVOKER retains all source-table RLS.
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
  w.worked_hours_raw:=round(raw_hours,2);
  basis:=least(raw_hours,coalesce(s.worked_hours_cap_weekly,40),40);
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
