-- ============================================================
-- The PTO bank: what a team member can still take, and never below zero.
--
-- The live ledger (get_live_pto_ledger) already says what each person has
-- today. This adds the two readings the office manages the bank with, and
-- the guard that keeps every path — a manager recording time off, a PTO
-- request being approved, hours being edited later — from taking a bank
-- below zero unless that person is allowed to go negative.
--
--   pto_allows_negative(employee)  the rule for this person: their own
--                                  exception when they are one, otherwise
--                                  the office policy
--   pto_available_hours(employee)  the bank today minus time off already
--                                  booked after today (spoken for); NULL
--                                  when no starting balance is on file
--   guard_pto_balance()            BEFORE INSERT/UPDATE on days_off:
--                                  refuses hours the bank cannot cover
--
-- Office closures never touch the bank; a day off without hours deducts
-- nothing and is never refused. Team members who do not accrue PTO
-- (employees.pto_eligible = false) have no bank to guard.
-- ============================================================

CREATE OR REPLACE FUNCTION public.pto_allows_negative(p_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT coalesce(
    (SELECT CASE WHEN s.policy_override THEN s.allow_negative END
       FROM public.pto_settings s
      WHERE s.employee_id = p_employee_id
      LIMIT 1),
    (SELECT p.allow_negative
       FROM public.org_pto_policy p
       JOIN public.employees e ON e.org_id = p.org_id
      WHERE e.id = p_employee_id),
    false);
$$;

COMMENT ON FUNCTION public.pto_allows_negative(uuid) IS
  'Whether this team member may take their PTO bank below zero: their own exception when marked one, otherwise the office policy.';

CREATE OR REPLACE FUNCTION public.pto_available_hours(p_employee_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
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
  -- Only the person and the office's admins read a bank (the definer
  -- context is what lets the guard trigger read it for anyone).
  IF auth.uid() IS NOT NULL AND NOT public.can_access_employee(p_employee_id) THEN
    RAISE EXCEPTION 'You cannot read this PTO bank' USING ERRCODE = '42501';
  END IF;
  v_today := (now() AT TIME ZONE coalesce(v_emp.timezone, 'America/New_York'))::date;

  -- The ledger's closing balance: the same number the PTO page shows.
  SELECT w.running_balance INTO v_balance
    FROM public.get_live_pto_ledger(p_employee_id) w
   ORDER BY w.period_start DESC
   LIMIT 1;
  IF v_balance IS NULL THEN
    -- Before the first accrual week closes, the starting balance itself,
    -- chosen the way the ledger chooses its anchor.
    SELECT s.snapshot_balance_hours INTO v_balance
      FROM public.pto_snapshots s
     WHERE s.employee_id = p_employee_id AND s.snapshot_date <= v_today
     ORDER BY (s.snapshot_date = v_emp.hire_date) DESC NULLS LAST, s.snapshot_date DESC
     LIMIT 1;
  END IF;
  IF v_balance IS NULL THEN
    RETURN NULL;
  END IF;

  -- Time off already booked after today is spoken for.
  SELECT coalesce(sum(d.hours), 0) INTO v_booked
    FROM public.days_off d
   WHERE d.employee_id = p_employee_id
     AND d.date_start > v_today
     AND d.type <> 'office_closed';

  RETURN round(v_balance - v_booked, 2);
END;
$$;

COMMENT ON FUNCTION public.pto_available_hours(uuid) IS
  'Hours this team member can still take: the live PTO balance today minus time off already booked after today. NULL when no starting balance is on file.';

CREATE OR REPLACE FUNCTION public.guard_pto_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_delta numeric;
  v_available numeric;
  v_name text;
  v_eligible boolean;
BEGIN
  IF NEW.type = 'office_closed' OR coalesce(NEW.hours, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- Only the hours being added to the bank's debit count: editing a row
  -- up by two hours asks for two, not for the whole day again.
  v_delta := coalesce(NEW.hours, 0);
  IF TG_OP = 'UPDATE' AND OLD.employee_id = NEW.employee_id AND OLD.type <> 'office_closed' THEN
    v_delta := v_delta - coalesce(OLD.hours, 0);
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
$$;

DROP TRIGGER IF EXISTS trg_guard_pto_balance ON public.days_off;
CREATE TRIGGER trg_guard_pto_balance
  BEFORE INSERT OR UPDATE OF hours, type, employee_id ON public.days_off
  FOR EACH ROW EXECUTE FUNCTION public.guard_pto_balance();

-- Grants: the two readings are app-facing; the guard is the trigger's alone.
REVOKE ALL ON FUNCTION public.pto_allows_negative(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pto_available_hours(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pto_allows_negative(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pto_available_hours(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_pto_balance() FROM PUBLIC, anon, authenticated;
