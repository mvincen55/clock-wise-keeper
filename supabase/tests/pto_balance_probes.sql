-- ============================================================
-- PTO bank guard probes (migration 20260929120000_pto_balance_guard.sql)
--
-- Run in a disposable database AFTER the migration chain (the release
-- gate does this on every replay) or in the SQL editor as postgres. One
-- transaction, ROLLBACK at the end — nothing persists. Each probe raises
-- 'PROBE n FAILED …' on failure; a clean run means every probe passed.
--
--   1  the available reading: the starting balance, nothing booked ahead
--   2  a manager records PTO within the bank; the next hours over it are refused
--   3  editing hours up is measured by the difference, not the whole day
--   4  office closures and hours-free days off never touch the bank
--   5  no starting balance on file: PTO hours refused, a plain absence fine
--   6  a person allowed to go negative is not held
--   7  someone who does not accrue PTO has no bank to guard
--   8  visibility and grants: own bank yes, a teammate's no; the guard is private
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- ---------- fixtures (rolled back) ----------
INSERT INTO auth.users (id, email) VALUES
  ('cf000000-0000-4000-8000-00000000000a', 'probe-pto-owner@example.test'),
  ('cf000000-0000-4000-8000-00000000000c', 'probe-pto-a@example.test'),
  ('cf000000-0000-4000-8000-00000000000d', 'probe-pto-d@example.test');

INSERT INTO public.orgs (id, name, created_by) VALUES
  ('cf000000-0000-4000-8000-0000000000cf', 'PTO Bank Probe Org', 'cf000000-0000-4000-8000-00000000000a');

INSERT INTO public.org_members (org_id, user_id, role, status) VALUES
  ('cf000000-0000-4000-8000-0000000000cf', 'cf000000-0000-4000-8000-00000000000a', 'owner', 'active'),
  ('cf000000-0000-4000-8000-0000000000cf', 'cf000000-0000-4000-8000-00000000000c', 'employee', 'active'),
  ('cf000000-0000-4000-8000-0000000000cf', 'cf000000-0000-4000-8000-00000000000d', 'employee', 'active');

-- A: a login and a 10-hour starting balance. B: no login, no starting
-- balance. C: no login, does not accrue PTO. D: a login, 1 hour, and an
-- exception on the record that allows a negative balance.
INSERT INTO public.employees (id, org_id, user_id, display_name, hire_date, pto_eligible) VALUES
  ('cfee0000-0000-4000-8000-00000000000a', 'cf000000-0000-4000-8000-0000000000cf', 'cf000000-0000-4000-8000-00000000000a', 'Probe Owner', '2026-01-04', true),
  ('cfee0000-0000-4000-8000-00000000000c', 'cf000000-0000-4000-8000-0000000000cf', 'cf000000-0000-4000-8000-00000000000c', 'Probe Employee A', '2026-01-04', true),
  ('cfee0000-0000-4000-8000-00000000000b', 'cf000000-0000-4000-8000-0000000000cf', NULL, 'Probe Employee B', '2026-01-04', true),
  ('cfee0000-0000-4000-8000-00000000000e', 'cf000000-0000-4000-8000-0000000000cf', NULL, 'Probe Employee C', '2026-01-04', false),
  ('cfee0000-0000-4000-8000-00000000000d', 'cf000000-0000-4000-8000-0000000000cf', 'cf000000-0000-4000-8000-00000000000d', 'Probe Employee D', '2026-01-04', true);

INSERT INTO public.pto_snapshots (org_id, employee_id, user_id, snapshot_date, snapshot_balance_hours) VALUES
  ('cf000000-0000-4000-8000-0000000000cf', 'cfee0000-0000-4000-8000-00000000000c', 'cf000000-0000-4000-8000-00000000000c', '2026-01-04', 10),
  ('cf000000-0000-4000-8000-0000000000cf', 'cfee0000-0000-4000-8000-00000000000d', 'cf000000-0000-4000-8000-00000000000d', '2026-01-04', 1);

-- D's exception on the record (the row may already exist when a trigger
-- gives every new employee a settings row; either way it ends up an exception).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.pto_settings WHERE employee_id = 'cfee0000-0000-4000-8000-00000000000d') THEN
    UPDATE public.pto_settings SET allow_negative = true, policy_override = true
     WHERE employee_id = 'cfee0000-0000-4000-8000-00000000000d';
  ELSE
    INSERT INTO public.pto_settings (org_id, employee_id, user_id, hire_date, worked_hours_cap_weekly, max_balance, allow_negative, timezone, policy_override)
    VALUES ('cf000000-0000-4000-8000-0000000000cf', 'cfee0000-0000-4000-8000-00000000000d', 'cf000000-0000-4000-8000-00000000000d', '2026-01-04', 40, 100, true, 'America/New_York', true);
  END IF;
END $$;

-- ---------- helpers (temporary, rolled back) ----------
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

-- Records a day off as the signed-in person; returns the error text, or '' when it went through.
CREATE FUNCTION pg_temp.try_day_off(p_emp uuid, p_user uuid, p_type public.day_off_type, p_hours numeric, p_start date)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.days_off (org_id, employee_id, user_id, date_start, date_end, type, hours, notes, created_by)
  VALUES ('cf000000-0000-4000-8000-0000000000cf', p_emp, p_user, p_start, p_start, p_type, p_hours, 'probe', 'cf000000-0000-4000-8000-00000000000a');
  RETURN '';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;

-- ---------- probe 1: the available reading ----------
DO $$
DECLARE v numeric;
BEGIN
  v := public.pto_available_hours('cfee0000-0000-4000-8000-00000000000c');
  IF v IS DISTINCT FROM 10 THEN RAISE EXCEPTION 'PROBE 1 FAILED: expected 10.00 available for A, got %', v; END IF;
  IF public.pto_available_hours('cfee0000-0000-4000-8000-00000000000b') IS NOT NULL THEN
    RAISE EXCEPTION 'PROBE 1 FAILED: B has no starting balance and should read NULL';
  END IF;
  IF public.pto_allows_negative('cfee0000-0000-4000-8000-00000000000c') THEN
    RAISE EXCEPTION 'PROBE 1 FAILED: A follows the office policy, which does not allow a negative balance';
  END IF;
  IF NOT public.pto_allows_negative('cfee0000-0000-4000-8000-00000000000d') THEN
    RAISE EXCEPTION 'PROBE 1 FAILED: D is an exception allowed to go negative';
  END IF;
  RAISE NOTICE 'PROBE 1 OK';
END $$;

-- ---------- probe 2: within the bank, then over it ----------
SELECT pg_temp.as_user('cf000000-0000-4000-8000-00000000000a');
DO $$
DECLARE v_err text; v numeric;
BEGIN
  v_err := pg_temp.try_day_off('cfee0000-0000-4000-8000-00000000000c', 'cf000000-0000-4000-8000-00000000000c', 'scheduled_with_notice', 8, current_date + 7);
  IF v_err <> '' THEN RAISE EXCEPTION 'PROBE 2 FAILED: 8 of 10 hours refused: %', v_err; END IF;
  v := public.pto_available_hours('cfee0000-0000-4000-8000-00000000000c');
  IF v IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'PROBE 2 FAILED: expected 2.00 available after booking 8, got %', v; END IF;
  v_err := pg_temp.try_day_off('cfee0000-0000-4000-8000-00000000000c', 'cf000000-0000-4000-8000-00000000000c', 'scheduled_with_notice', 4, current_date + 14);
  IF v_err NOT LIKE 'Not enough PTO: Probe Employee A has 2.00 hours available and this would use 4.00.%' THEN
    RAISE EXCEPTION 'PROBE 2 FAILED: 4 more hours should be refused with the bank named, got: %', v_err;
  END IF;
  IF (SELECT count(*) FROM public.days_off WHERE employee_id = 'cfee0000-0000-4000-8000-00000000000c') <> 1 THEN
    RAISE EXCEPTION 'PROBE 2 FAILED: the refused day off was written';
  END IF;
  RAISE NOTICE 'PROBE 2 OK';
END $$;

-- ---------- probe 3: editing hours is measured by the difference ----------
DO $$
DECLARE v_id uuid; v_err text; v numeric;
BEGIN
  SELECT id INTO v_id FROM public.days_off WHERE employee_id = 'cfee0000-0000-4000-8000-00000000000c';
  BEGIN
    UPDATE public.days_off SET hours = 11 WHERE id = v_id;
    RAISE EXCEPTION 'PROBE 3 FAILED: raising 8 to 11 hours needs 3 with 2 available and should be refused';
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    IF v_err LIKE 'PROBE 3 FAILED%' THEN RAISE; END IF;
    IF v_err NOT LIKE 'Not enough PTO:%' THEN RAISE EXCEPTION 'PROBE 3 FAILED: unexpected refusal: %', v_err; END IF;
  END;
  UPDATE public.days_off SET hours = 10 WHERE id = v_id;
  v := public.pto_available_hours('cfee0000-0000-4000-8000-00000000000c');
  IF v IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'PROBE 3 FAILED: expected 0.00 available after raising to 10, got %', v; END IF;
  UPDATE public.days_off SET hours = 6 WHERE id = v_id;
  UPDATE public.days_off SET hours = 10 WHERE id = v_id;
  RAISE NOTICE 'PROBE 3 OK';
END $$;

-- ---------- probe 4: closures and hours-free days off never touch the bank ----------
DO $$
DECLARE v_err text;
BEGIN
  v_err := pg_temp.try_day_off('cfee0000-0000-4000-8000-00000000000c', 'cf000000-0000-4000-8000-00000000000c', 'office_closed', 100, current_date + 21);
  IF v_err <> '' THEN RAISE EXCEPTION 'PROBE 4 FAILED: an office closure was held to the bank: %', v_err; END IF;
  v_err := pg_temp.try_day_off('cfee0000-0000-4000-8000-00000000000c', 'cf000000-0000-4000-8000-00000000000c', 'unscheduled', NULL, current_date + 28);
  IF v_err <> '' THEN RAISE EXCEPTION 'PROBE 4 FAILED: a callout without hours was refused: %', v_err; END IF;
  v_err := pg_temp.try_day_off('cfee0000-0000-4000-8000-00000000000c', 'cf000000-0000-4000-8000-00000000000c', 'other', 0, current_date + 29);
  IF v_err <> '' THEN RAISE EXCEPTION 'PROBE 4 FAILED: an absence with zero hours was refused: %', v_err; END IF;
  RAISE NOTICE 'PROBE 4 OK';
END $$;

-- ---------- probe 5: no starting balance on file ----------
DO $$
DECLARE v_err text;
BEGIN
  v_err := pg_temp.try_day_off('cfee0000-0000-4000-8000-00000000000b', NULL, 'scheduled_with_notice', 1, current_date + 7);
  IF v_err NOT LIKE 'No PTO starting balance is on file for Probe Employee B.%' THEN
    RAISE EXCEPTION 'PROBE 5 FAILED: PTO hours without a starting balance should be refused by name, got: %', v_err;
  END IF;
  v_err := pg_temp.try_day_off('cfee0000-0000-4000-8000-00000000000b', NULL, 'unscheduled', 0, current_date + 7);
  IF v_err <> '' THEN RAISE EXCEPTION 'PROBE 5 FAILED: a callout for someone without a bank was refused: %', v_err; END IF;
  RAISE NOTICE 'PROBE 5 OK';
END $$;

-- ---------- probe 6: allowed to go negative ----------
DO $$
DECLARE v_err text;
BEGIN
  v_err := pg_temp.try_day_off('cfee0000-0000-4000-8000-00000000000d', 'cf000000-0000-4000-8000-00000000000d', 'scheduled_with_notice', 5, current_date + 7);
  IF v_err <> '' THEN RAISE EXCEPTION 'PROBE 6 FAILED: D may go negative and was held: %', v_err; END IF;
  IF public.pto_available_hours('cfee0000-0000-4000-8000-00000000000d') IS DISTINCT FROM -4 THEN
    RAISE EXCEPTION 'PROBE 6 FAILED: D should read -4.00 available';
  END IF;
  RAISE NOTICE 'PROBE 6 OK';
END $$;

-- ---------- probe 7: no bank to guard ----------
DO $$
DECLARE v_err text;
BEGIN
  v_err := pg_temp.try_day_off('cfee0000-0000-4000-8000-00000000000e', NULL, 'scheduled_with_notice', 8, current_date + 7);
  IF v_err <> '' THEN RAISE EXCEPTION 'PROBE 7 FAILED: someone who does not accrue PTO was held to a bank: %', v_err; END IF;
  RAISE NOTICE 'PROBE 7 OK';
END $$;

-- ---------- probe 8: visibility and grants ----------
SELECT pg_temp.as_user('cf000000-0000-4000-8000-00000000000c');
DO $$
DECLARE v numeric; v_err text;
BEGIN
  v := public.pto_available_hours('cfee0000-0000-4000-8000-00000000000c');
  IF v IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'PROBE 8 FAILED: A reads their own bank as %', v; END IF;
  BEGIN
    PERFORM public.pto_available_hours('cfee0000-0000-4000-8000-00000000000d');
    RAISE EXCEPTION 'PROBE 8 FAILED: A read a teammate''s bank';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RAISE NOTICE 'PROBE 8 visibility OK';
END $$;
SELECT pg_temp.as_system();
DO $$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.pto_available_hours(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.pto_allows_negative(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PROBE 8 FAILED: the app cannot read the bank';
  END IF;
  IF has_function_privilege('anon', 'public.pto_available_hours(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.guard_pto_balance()', 'EXECUTE') THEN
    RAISE EXCEPTION 'PROBE 8 FAILED: app-facing grants are wrong';
  END IF;
  RAISE NOTICE 'PROBE 8 OK';
END $$;

SELECT 'pto bank probes passed' AS result;
ROLLBACK;
