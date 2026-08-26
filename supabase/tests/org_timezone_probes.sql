-- ============================================================
-- Phase 6 verification probes — org timezone + inheritance.
-- (Time Clock Legitimacy Hardening; see audits/time-clock-preflight.md)
--
-- Run in the SQL editor (connection role postgres) AFTER applying
-- migration 20260814160000_org_timezone.sql. One transaction,
-- ROLLBACK at the end — nothing persists. Each probe raises
-- 'PROBE n FAILED …' on failure; a clean run means every probe passed.
--
-- Coverage (the Phase 6 verify list):
--   1  catalog: org_practice_settings.timezone exists NOT NULL with the
--      America/New_York default; employees.timezone is nullable with NO
--      default; get_user_timezone stays SECURITY DEFINER + pinned path
--   2  a fresh employee row inserted without a timezone lands NULL
--      (inherit) — the old column default is really gone
--   3  resolver chain: NULL employee tz inherits the office timezone;
--      an explicit employee tz overrides it; the pto_settings legacy
--      fallback still works for accounts with no office setting; and
--      with nothing set anywhere the default is America/New_York
--   4  end-to-end entry dating: a punch through the RPC core for an
--      office set to Pacific/Honolulu is dated on Honolulu's calendar,
--      not New York's (06:00 UTC = Jan 14 in Honolulu, Jan 15 in NY)
--   5  data fix: no employees row still holds the literal old default
--      (valid immediately after the migration; an explicit
--      America/New_York override chosen later would trip this)
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '25s';

-- ---------- fixtures (rolled back) ----------
INSERT INTO auth.users (id, email) VALUES
  ('6a000000-0000-4000-8000-0000000000aa', 'probe-tz-hnl@example.test'),
  ('6a000000-0000-4000-8000-0000000000ab', 'probe-tz-legacy@example.test'),
  ('6a000000-0000-4000-8000-0000000000ac', 'probe-tz-bare@example.test');

INSERT INTO public.orgs (id, name, created_by) VALUES
  ('6f000000-0000-4000-8000-0000000000ff', 'TZ Probe Org HNL', '6a000000-0000-4000-8000-0000000000aa'),
  ('6f000000-0000-4000-8000-0000000000fe', 'TZ Probe Org Bare', '6a000000-0000-4000-8000-0000000000ab');

-- Office setting only for the first org: Hawaii (UTC-10, no DST — dates
-- are deterministic year-round, which keeps probe 4 stable).
INSERT INTO public.org_practice_settings (org_id, timezone) VALUES
  ('6f000000-0000-4000-8000-0000000000ff', 'Pacific/Honolulu');

-- ---------- PROBE 1: catalog shape ----------
DO $$
DECLARE
  v_nullable text;
  v_default text;
  v_secdef boolean;
  v_config text[];
BEGIN
  SELECT is_nullable, column_default INTO v_nullable, v_default
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'org_practice_settings' AND column_name = 'timezone';
  IF v_nullable IS NULL THEN
    RAISE EXCEPTION 'PROBE 1 FAILED: org_practice_settings.timezone column is missing';
  END IF;
  IF v_nullable <> 'NO' OR v_default NOT LIKE '%America/New_York%' THEN
    RAISE EXCEPTION 'PROBE 1 FAILED: office timezone should be NOT NULL default America/New_York (nullable=%, default=%)', v_nullable, v_default;
  END IF;

  SELECT is_nullable, column_default INTO v_nullable, v_default
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'timezone';
  IF v_nullable <> 'YES' OR v_default IS NOT NULL THEN
    RAISE EXCEPTION 'PROBE 1 FAILED: employees.timezone should be nullable with no default (nullable=%, default=%)', v_nullable, v_default;
  END IF;

  SELECT p.prosecdef, p.proconfig INTO v_secdef, v_config
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_user_timezone';
  IF NOT v_secdef
     OR v_config IS NULL
     OR array_to_string(v_config, ',') NOT LIKE '%search_path%public%' THEN
    RAISE EXCEPTION 'PROBE 1 FAILED: get_user_timezone lost SECURITY DEFINER or its pinned search_path';
  END IF;

  RAISE NOTICE 'PROBE 1 OK (catalog shape)';
END $$;

-- ---------- PROBE 2: fresh employee rows inherit (timezone NULL) ----------
INSERT INTO public.employees (id, org_id, user_id, display_name) VALUES
  ('6e000000-0000-4000-8000-0000000000ee', '6f000000-0000-4000-8000-0000000000ff', '6a000000-0000-4000-8000-0000000000aa', 'Probe TZ HNL'),
  ('6e000000-0000-4000-8000-0000000000ed', '6f000000-0000-4000-8000-0000000000fe', '6a000000-0000-4000-8000-0000000000ab', 'Probe TZ Legacy'),
  ('6e000000-0000-4000-8000-0000000000ec', '6f000000-0000-4000-8000-0000000000fe', '6a000000-0000-4000-8000-0000000000ac', 'Probe TZ Bare');

DO $$
DECLARE
  v_tz text;
BEGIN
  SELECT timezone INTO v_tz FROM public.employees WHERE id = '6e000000-0000-4000-8000-0000000000ee';
  IF v_tz IS NOT NULL THEN
    RAISE EXCEPTION 'PROBE 2 FAILED: new employee got timezone % instead of NULL (default not dropped?)', v_tz;
  END IF;
  RAISE NOTICE 'PROBE 2 OK (new rows inherit)';
END $$;

-- ---------- PROBE 3: the resolution chain ----------
-- Legacy fixture: second org has NO office setting; its first user has an
-- old pto_settings row carrying a timezone.
INSERT INTO public.pto_settings (employee_id, org_id, user_id, timezone) VALUES
  ('6e000000-0000-4000-8000-0000000000ed', '6f000000-0000-4000-8000-0000000000fe',
   '6a000000-0000-4000-8000-0000000000ab', 'America/Denver');

DO $$
DECLARE
  v_tz text;
BEGIN
  -- (a) NULL employee tz → the office timezone.
  v_tz := public.get_user_timezone('6a000000-0000-4000-8000-0000000000aa');
  IF v_tz <> 'Pacific/Honolulu' THEN
    RAISE EXCEPTION 'PROBE 3 FAILED: expected office tz Pacific/Honolulu, got %', v_tz;
  END IF;

  -- (b) explicit per-person override beats the office.
  UPDATE public.employees SET timezone = 'America/Phoenix'
   WHERE id = '6e000000-0000-4000-8000-0000000000ee';
  v_tz := public.get_user_timezone('6a000000-0000-4000-8000-0000000000aa');
  IF v_tz <> 'America/Phoenix' THEN
    RAISE EXCEPTION 'PROBE 3 FAILED: explicit override lost — expected America/Phoenix, got %', v_tz;
  END IF;
  UPDATE public.employees SET timezone = NULL
   WHERE id = '6e000000-0000-4000-8000-0000000000ee';

  -- (c) no office setting → legacy pto_settings fallback still honored.
  v_tz := public.get_user_timezone('6a000000-0000-4000-8000-0000000000ab');
  IF v_tz <> 'America/Denver' THEN
    RAISE EXCEPTION 'PROBE 3 FAILED: legacy pto_settings fallback broken — expected America/Denver, got %', v_tz;
  END IF;

  -- (d) nothing anywhere → the historical default.
  v_tz := public.get_user_timezone('6a000000-0000-4000-8000-0000000000ac');
  IF v_tz <> 'America/New_York' THEN
    RAISE EXCEPTION 'PROBE 3 FAILED: bare account should default to America/New_York, got %', v_tz;
  END IF;

  RAISE NOTICE 'PROBE 3 OK (override > office > legacy > default)';
END $$;

-- ---------- PROBE 4: server entry dating follows the office ----------
DO $$
DECLARE
  r_in jsonb;
  r_out jsonb;
  v_date date;
  v_total int;
BEGIN
  -- 2026-01-15 06:00 UTC is 2026-01-14 20:00 in Honolulu but already
  -- 2026-01-15 01:00 in New York. If dating still used the NY default,
  -- entry_date would come back Jan 15.
  r_in := public._record_punch_internal(
    p_employee_id := '6e000000-0000-4000-8000-0000000000ee',
    p_action      := 'clock_in',
    p_punch_time  := '2026-01-15 06:00:00+00'::timestamptz,
    p_actor       := '6a000000-0000-4000-8000-0000000000aa');
  r_out := public._record_punch_internal(
    p_employee_id := '6e000000-0000-4000-8000-0000000000ee',
    p_action      := 'clock_out',
    p_punch_time  := '2026-01-15 08:00:00+00'::timestamptz,
    p_actor       := '6a000000-0000-4000-8000-0000000000aa');

  SELECT entry_date, total_minutes INTO v_date, v_total
    FROM public.time_entries WHERE id = (r_out->>'entry_id')::uuid;
  IF v_date <> DATE '2026-01-14' THEN
    RAISE EXCEPTION 'PROBE 4 FAILED: entry dated % — expected 2026-01-14 (Honolulu calendar)', v_date;
  END IF;
  IF (r_in->>'entry_id') <> (r_out->>'entry_id') OR v_total <> 120 THEN
    RAISE EXCEPTION 'PROBE 4 FAILED: pair did not land on one entry totaling 120 (got % min)', v_total;
  END IF;

  RAISE NOTICE 'PROBE 4 OK (entry dated on the office calendar)';
END $$;

-- ---------- PROBE 5: the old literal default was cleared ----------
DO $$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM public.employees WHERE timezone = 'America/New_York';
  IF n > 0 THEN
    RAISE EXCEPTION 'PROBE 5 FAILED: % employees still hold literal America/New_York (expected 0 immediately after migration)', n;
  END IF;
  RAISE NOTICE 'PROBE 5 OK (no residue of the old default)';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL PROBES PASSED — rolling back fixtures.'; END $$;

ROLLBACK;
