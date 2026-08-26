-- ============================================================
-- Phase 3 verification probes — void, not delete.
-- (Time Clock Legitimacy Hardening; see audits/time-clock-preflight.md)
--
-- Run in the SQL editor (connection role postgres) AFTER applying
-- migration 20260814140000_void_not_delete.sql. One transaction,
-- ROLLBACK at the end — nothing persists. Each probe raises
-- 'PROBE n FAILED …' on failure; a clean run means every probe passed.
--
-- Coverage (the Phase 3 verify list):
--   1  a punch pair records and totals normally through the RPC core
--   2  voiding the out-punch recomputes the entry total to zero, the
--      void keeps the row and its seq, and the void itself is audited
--   3  alternation ignores voided punches: with the out voided, the
--      last LIVE punch is the in, so a new clock_out is accepted —
--      and its seq continues PAST the voided punch's kept seq
--   4  DELETE on punches and on time_entries is rejected for the
--      owner role AND for service_role (the triggers bind below RLS)
--   5  the attendance recompute counts only live punches
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '25s';

-- ---------- fixtures (rolled back) ----------
INSERT INTO auth.users (id, email) VALUES
  ('3a000000-0000-4000-8000-0000000000aa', 'probe-void@example.test');

INSERT INTO public.orgs (id, name, created_by) VALUES
  ('3f000000-0000-4000-8000-0000000000ff', 'Void Probe Org', '3a000000-0000-4000-8000-0000000000aa');

INSERT INTO public.employees (id, org_id, user_id, display_name) VALUES
  ('3e000000-0000-4000-8000-0000000000ee', '3f000000-0000-4000-8000-0000000000ff', '3a000000-0000-4000-8000-0000000000aa', 'Probe Void');

-- ---------- PROBE 1: a pair records and totals ----------
DO $$
DECLARE
  r_in jsonb;
  r_out jsonb;
  v_total int;
BEGIN
  r_in := public._record_punch_internal(
    p_employee_id := '3e000000-0000-4000-8000-0000000000ee',
    p_action      := 'clock_in',
    p_punch_time  := now() - interval '2 hours',
    p_actor       := '3a000000-0000-4000-8000-0000000000aa');
  r_out := public._record_punch_internal(
    p_employee_id := '3e000000-0000-4000-8000-0000000000ee',
    p_action      := 'clock_out',
    p_actor       := '3a000000-0000-4000-8000-0000000000aa');

  SELECT total_minutes INTO v_total FROM public.time_entries WHERE id = (r_out->>'entry_id')::uuid;
  IF v_total IS NULL OR v_total < 115 OR v_total > 125 THEN
    RAISE EXCEPTION 'PROBE 1 FAILED: pair totals % minutes, expected ~120', v_total;
  END IF;

  -- Stash ids for later probes
  PERFORM set_config('probe.entry_id', r_out->>'entry_id', true);
  PERFORM set_config('probe.out_punch_id', r_out->>'punch_id', true);
  PERFORM set_config('probe.out_seq', r_out->>'seq', true);

  RAISE NOTICE 'PROBE 1 OK (total % min)', v_total;
END $$;

-- ---------- PROBE 2: void zeroes the total, keeps the row + seq, audited ----------
DO $$
DECLARE
  v_entry uuid := current_setting('probe.entry_id')::uuid;
  v_punch uuid := current_setting('probe.out_punch_id')::uuid;
  v_total int;
  n int;
BEGIN
  UPDATE public.punches
     SET voided_at = now(), voided_by = '3a000000-0000-4000-8000-0000000000aa',
         void_reason = 'probe void'
   WHERE id = v_punch;

  SELECT total_minutes INTO v_total FROM public.time_entries WHERE id = v_entry;
  IF v_total <> 0 THEN
    RAISE EXCEPTION 'PROBE 2 FAILED: total is % after voiding the out, expected 0', v_total;
  END IF;

  SELECT count(*) INTO n FROM public.punches WHERE id = v_punch AND voided_at IS NOT NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'PROBE 2 FAILED: voided row is gone or not marked'; END IF;

  SELECT count(*) INTO n FROM public.audit_events
   WHERE target_table = 'punches' AND target_id = v_punch AND event_type = 'punch_edit';
  IF n < 1 THEN RAISE EXCEPTION 'PROBE 2 FAILED: the void left no audit row'; END IF;

  RAISE NOTICE 'PROBE 2 OK';
END $$;

-- ---------- PROBE 3: alternation ignores voided; seq continues past it ----------
DO $$
DECLARE
  r jsonb;
  v_old_seq int := current_setting('probe.out_seq')::int;
BEGIN
  -- Last LIVE punch is the in (the out is voided) → clock_out accepted.
  r := public._record_punch_internal(
    p_employee_id := '3e000000-0000-4000-8000-0000000000ee',
    p_action      := 'clock_out',
    p_actor       := '3a000000-0000-4000-8000-0000000000aa');

  IF (r->>'seq')::int <= v_old_seq THEN
    RAISE EXCEPTION 'PROBE 3 FAILED: new seq % does not continue past voided seq %', r->>'seq', v_old_seq;
  END IF;
  IF (r->>'entry_id')::uuid <> current_setting('probe.entry_id')::uuid THEN
    RAISE EXCEPTION 'PROBE 3 FAILED: re-close landed on the wrong entry';
  END IF;

  RAISE NOTICE 'PROBE 3 OK (new out seq %)', r->>'seq';
END $$;

-- ---------- PROBE 4: DELETE rejected everywhere ----------
DO $$
DECLARE
  v_entry uuid := current_setting('probe.entry_id')::uuid;
  v_punch uuid := current_setting('probe.out_punch_id')::uuid;
BEGIN
  BEGIN
    DELETE FROM public.punches WHERE id = v_punch;
    RAISE EXCEPTION 'PROBE 4 FAILED: owner-role punch DELETE was allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'TIME_RECORD_DELETE_FORBIDDEN%' THEN RAISE; END IF;
  END;

  BEGIN
    DELETE FROM public.time_entries WHERE id = v_entry;
    RAISE EXCEPTION 'PROBE 4 FAILED: owner-role entry DELETE was allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'TIME_RECORD_DELETE_FORBIDDEN%' THEN RAISE; END IF;
  END;

  PERFORM set_config('role', 'service_role', true);
  BEGIN
    DELETE FROM public.punches WHERE id = v_punch;
    RAISE EXCEPTION 'PROBE 4 FAILED: service_role punch DELETE was allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'TIME_RECORD_DELETE_FORBIDDEN%' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM public.time_entries WHERE id = v_entry;
    RAISE EXCEPTION 'PROBE 4 FAILED: service_role entry DELETE was allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'TIME_RECORD_DELETE_FORBIDDEN%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'PROBE 4 OK (time records cannot be destroyed)';
END $$;
RESET ROLE;

-- ---------- PROBE 5: attendance counts live punches only ----------
DO $$
DECLARE
  v_count int;
  v_day date;
BEGIN
  SELECT te.entry_date INTO v_day FROM public.time_entries te
   WHERE te.id = current_setting('probe.entry_id')::uuid;

  PERFORM public.recompute_attendance_range('3a000000-0000-4000-8000-0000000000aa', v_day, v_day);

  SELECT (ads.status_reasons->>'punch_count')::int INTO v_count
    FROM public.attendance_day_status ads
   WHERE ads.user_id = '3a000000-0000-4000-8000-0000000000aa' AND ads.entry_date = v_day;

  -- 3 punches exist (in, voided out, live out); only 2 are live.
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'PROBE 5 FAILED: attendance punch_count is %, expected 2 live', v_count;
  END IF;

  RAISE NOTICE 'PROBE 5 OK';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL PROBES PASSED — rolling back fixtures.'; END $$;

ROLLBACK;
