-- ============================================================
-- Phase 1 verification probes — server-authoritative punching.
-- (Time Clock Legitimacy Hardening; see audits/time-clock-preflight.md)
--
-- Run in the STAGING SQL editor (connection role postgres) AFTER applying
-- migration 20260814120000_server_authoritative_punching.sql. The whole
-- script runs in one transaction and ROLLS BACK at the end — nothing
-- persists, including the auth.users fixtures. Each probe prints
-- 'PROBE n OK' via NOTICE and raises 'PROBE n FAILED: …' on failure;
-- the first failure aborts the script.
--
-- Coverage (the Phase 1 test list):
--   1  clock_in creates the entry, a seq-0 punch, and EXACTLY ONE audit row
--   2  alternation: a second clock_in is rejected (PUNCH_ALREADY_IN)
--   3  clock_out pairs and recomputes; a second clock_out is rejected
--   4  midnight continuation: the out attaches to yesterday's open entry
--   5  a stale (>16h) open-in does NOT capture the out
--   6  duplicate (time_entry_id, seq) rejected by punches_entry_seq_uidx —
--      the backstop for the two-concurrent-calls race (a single SQL
--      session cannot interleave; run two parallel sessions to see the
--      FOR UPDATE serialization directly)
--   7  a punch inserted OUTSIDE the RPC still leaves an audit trace
--   8  employee-role INSERTs into punches / time_entries rejected by RLS
--   9  record_punch end-to-end under an authenticated employee JWT
-- ============================================================

BEGIN;

-- ---------- fixtures (rolled back) ----------
INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-4000-8000-00000000000a', 'probe-a@example.test'),
  ('b0000000-0000-4000-8000-00000000000b', 'probe-b@example.test'),
  ('c0000000-0000-4000-8000-00000000000c', 'probe-c@example.test'),
  ('d0000000-0000-4000-8000-00000000000d', 'probe-d@example.test');

INSERT INTO public.orgs (id, name, created_by) VALUES
  ('f0000000-0000-4000-8000-0000000000f0', 'Probe Org', 'a0000000-0000-4000-8000-00000000000a');

INSERT INTO public.employees (id, org_id, user_id, display_name) VALUES
  ('ea000000-0000-4000-8000-0000000000ea', 'f0000000-0000-4000-8000-0000000000f0', 'a0000000-0000-4000-8000-00000000000a', 'Probe A'),
  ('eb000000-0000-4000-8000-0000000000eb', 'f0000000-0000-4000-8000-0000000000f0', 'b0000000-0000-4000-8000-00000000000b', 'Probe B'),
  ('ec000000-0000-4000-8000-0000000000ec', 'f0000000-0000-4000-8000-0000000000f0', 'c0000000-0000-4000-8000-00000000000c', 'Probe C'),
  ('ed000000-0000-4000-8000-0000000000ed', 'f0000000-0000-4000-8000-0000000000f0', 'd0000000-0000-4000-8000-00000000000d', 'Probe D');

-- ---------- PROBE 1: clock_in creates entry + punch + one audit row ----------
DO $$
DECLARE
  r jsonb;
  v_entry uuid;
  v_punch uuid;
  n int;
BEGIN
  r := public._record_punch_internal(
    p_employee_id := 'ea000000-0000-4000-8000-0000000000ea',
    p_action      := 'clock_in',
    p_actor       := 'a0000000-0000-4000-8000-00000000000a');

  v_entry := (r->>'entry_id')::uuid;
  v_punch := (r->>'punch_id')::uuid;

  IF (r->>'seq')::int <> 0 THEN
    RAISE EXCEPTION 'PROBE 1 FAILED: first punch seq is %, expected 0', r->>'seq';
  END IF;

  SELECT count(*) INTO n FROM public.punches WHERE time_entry_id = v_entry;
  IF n <> 1 THEN
    RAISE EXCEPTION 'PROBE 1 FAILED: entry has % punches, expected 1', n;
  END IF;

  SELECT count(*) INTO n FROM public.audit_events
   WHERE target_table = 'punches' AND target_id = v_punch;
  IF n <> 1 THEN
    RAISE EXCEPTION 'PROBE 1 FAILED: % audit rows for the punch, expected exactly 1 (RPC row, trigger suppressed)', n;
  END IF;

  PERFORM 1 FROM public.audit_events
   WHERE target_id = v_punch
     AND event_type = 'clock_in'
     AND actor_id = 'a0000000-0000-4000-8000-00000000000a'
     AND (event_details->>'target_employee_id')::uuid = 'ea000000-0000-4000-8000-0000000000ea';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROBE 1 FAILED: audit row is missing event_type/actor/target_employee_id shape';
  END IF;

  RAISE NOTICE 'PROBE 1 OK (entry %, punch %)', v_entry, v_punch;
END $$;

-- ---------- PROBE 2: double clock_in rejected ----------
DO $$
BEGIN
  PERFORM public._record_punch_internal(
    p_employee_id := 'ea000000-0000-4000-8000-0000000000ea',
    p_action      := 'clock_in');
  RAISE EXCEPTION 'PROBE 2 FAILED: double clock_in was accepted';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'PUNCH_ALREADY_IN%' THEN
    RAISE NOTICE 'PROBE 2 OK';
  ELSE
    RAISE;
  END IF;
END $$;

-- ---------- PROBE 3: clock_out pairs; second clock_out rejected ----------
DO $$
DECLARE
  r jsonb;
  n int;
BEGIN
  r := public._record_punch_internal(
    p_employee_id := 'ea000000-0000-4000-8000-0000000000ea',
    p_action      := 'clock_out',
    p_actor       := 'a0000000-0000-4000-8000-00000000000a');

  IF (r->>'seq')::int <> 1 THEN
    RAISE EXCEPTION 'PROBE 3 FAILED: out seq is %, expected 1', r->>'seq';
  END IF;

  SELECT total_minutes INTO n FROM public.time_entries WHERE id = (r->>'entry_id')::uuid;
  IF n IS NULL OR n < 0 THEN
    RAISE EXCEPTION 'PROBE 3 FAILED: total_minutes is % after pairing', n;
  END IF;

  BEGIN
    PERFORM public._record_punch_internal(
      p_employee_id := 'ea000000-0000-4000-8000-0000000000ea',
      p_action      := 'clock_out');
    RAISE EXCEPTION 'PROBE 3 FAILED: clock_out with nothing open was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'PUNCH_NO_OPEN_IN%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'PROBE 3 OK';
END $$;

-- ---------- PROBE 4: midnight continuation ----------
DO $$
DECLARE
  v_yday date := (now() AT TIME ZONE 'America/New_York')::date - 1;
  v_entry uuid;
  r jsonb;
  n int;
BEGIN
  INSERT INTO public.time_entries (user_id, org_id, employee_id, entry_date, source)
  VALUES ('b0000000-0000-4000-8000-00000000000b', 'f0000000-0000-4000-8000-0000000000f0',
          'eb000000-0000-4000-8000-0000000000eb', v_yday, 'manual')
  RETURNING id INTO v_entry;

  INSERT INTO public.punches (time_entry_id, org_id, employee_id, seq, punch_type, punch_time, source)
  VALUES (v_entry, 'f0000000-0000-4000-8000-0000000000f0', 'eb000000-0000-4000-8000-0000000000eb',
          0, 'in', now() - interval '2 hours', 'manual');

  r := public._record_punch_internal(
    p_employee_id := 'eb000000-0000-4000-8000-0000000000eb',
    p_action      := 'clock_out',
    p_actor       := 'b0000000-0000-4000-8000-00000000000b');

  IF (r->>'entry_id')::uuid <> v_entry THEN
    RAISE EXCEPTION 'PROBE 4 FAILED: out landed on entry % instead of yesterday''s %', r->>'entry_id', v_entry;
  END IF;
  IF (r->>'entry_date')::date <> v_yday THEN
    RAISE EXCEPTION 'PROBE 4 FAILED: entry_date % returned, expected %', r->>'entry_date', v_yday;
  END IF;

  SELECT count(*) INTO n FROM public.time_entries
   WHERE employee_id = 'eb000000-0000-4000-8000-0000000000eb';
  IF n <> 1 THEN
    RAISE EXCEPTION 'PROBE 4 FAILED: a spurious same-day entry was created (% entries)', n;
  END IF;

  RAISE NOTICE 'PROBE 4 OK (paired across midnight into %)', v_yday;
END $$;

-- ---------- PROBE 5: stale open-in (>16h) does not capture the out ----------
DO $$
DECLARE
  v_yday date := (now() AT TIME ZONE 'America/New_York')::date - 1;
  v_entry uuid;
BEGIN
  INSERT INTO public.time_entries (user_id, org_id, employee_id, entry_date, source)
  VALUES ('c0000000-0000-4000-8000-00000000000c', 'f0000000-0000-4000-8000-0000000000f0',
          'ec000000-0000-4000-8000-0000000000ec', v_yday, 'manual')
  RETURNING id INTO v_entry;

  INSERT INTO public.punches (time_entry_id, org_id, employee_id, seq, punch_type, punch_time, source)
  VALUES (v_entry, 'f0000000-0000-4000-8000-0000000000f0', 'ec000000-0000-4000-8000-0000000000ec',
          0, 'in', now() - interval '17 hours', 'manual');

  BEGIN
    PERFORM public._record_punch_internal(
      p_employee_id := 'ec000000-0000-4000-8000-0000000000ec',
      p_action      := 'clock_out');
    RAISE EXCEPTION 'PROBE 5 FAILED: a 17-hour-old open-in captured the out';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'PUNCH_NO_OPEN_IN%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'PROBE 5 OK';
END $$;

-- ---------- PROBE 6: duplicate (time_entry_id, seq) rejected ----------
DO $$
DECLARE
  v_entry uuid;
BEGIN
  SELECT id INTO v_entry FROM public.time_entries
   WHERE employee_id = 'eb000000-0000-4000-8000-0000000000eb' LIMIT 1;

  BEGIN
    INSERT INTO public.punches (time_entry_id, org_id, employee_id, seq, punch_type, punch_time, source)
    VALUES (v_entry, 'f0000000-0000-4000-8000-0000000000f0', 'eb000000-0000-4000-8000-0000000000eb',
            1, 'in', now(), 'manual');
    RAISE EXCEPTION 'PROBE 6 FAILED: duplicate seq was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  RAISE NOTICE 'PROBE 6 OK (punches_entry_seq_uidx enforced)';
END $$;

-- ---------- PROBE 7: outside-the-RPC insert still leaves a trace ----------
DO $$
DECLARE
  v_entry uuid;
  v_punch uuid;
  n int;
BEGIN
  SELECT id INTO v_entry FROM public.time_entries
   WHERE employee_id = 'ec000000-0000-4000-8000-0000000000ec' LIMIT 1;

  INSERT INTO public.punches (time_entry_id, org_id, employee_id, seq, punch_type, punch_time, source)
  VALUES (v_entry, 'f0000000-0000-4000-8000-0000000000f0', 'ec000000-0000-4000-8000-0000000000ec',
          1, 'out', now() - interval '16 hours', 'manual')
  RETURNING id INTO v_punch;

  SELECT count(*) INTO n FROM public.audit_events
   WHERE target_table = 'punches' AND target_id = v_punch AND event_type = 'punch_created';
  IF n <> 1 THEN
    RAISE EXCEPTION 'PROBE 7 FAILED: direct insert produced % punch_created audit rows, expected 1', n;
  END IF;

  RAISE NOTICE 'PROBE 7 OK (trigger audits non-RPC inserts)';
END $$;

-- ---------- PROBE 8: employee-role writes rejected by RLS ----------
DO $$
DECLARE
  v_entry uuid;
BEGIN
  SELECT id INTO v_entry FROM public.time_entries
   WHERE employee_id = 'eb000000-0000-4000-8000-0000000000eb' LIMIT 1;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"d0000000-0000-4000-8000-00000000000d","role":"authenticated"}', true);

  BEGIN
    INSERT INTO public.punches (time_entry_id, org_id, employee_id, seq, punch_type, punch_time, source)
    VALUES (v_entry, 'f0000000-0000-4000-8000-0000000000f0', 'ed000000-0000-4000-8000-0000000000ed',
            99, 'in', now(), 'manual');
    RAISE EXCEPTION 'PROBE 8 FAILED: employee-role punch INSERT was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.time_entries (user_id, org_id, employee_id, entry_date, source)
    VALUES ('d0000000-0000-4000-8000-00000000000d', 'f0000000-0000-4000-8000-0000000000f0',
            'ed000000-0000-4000-8000-0000000000ed', (now() AT TIME ZONE 'America/New_York')::date, 'manual');
    RAISE EXCEPTION 'PROBE 8 FAILED: employee-role time_entries INSERT was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  RAISE NOTICE 'PROBE 8 OK (client-side punch writes are closed)';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

-- ---------- PROBE 9: record_punch end-to-end as an authenticated JWT ----------
DO $$
DECLARE
  r jsonb;
  n int;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"d0000000-0000-4000-8000-00000000000d","role":"authenticated"}', true);

  r := public.record_punch('clock_in');

  PERFORM set_config('role', 'postgres', true);

  IF (r->>'seq')::int <> 0 THEN
    RAISE EXCEPTION 'PROBE 9 FAILED: seq %, expected 0', r->>'seq';
  END IF;

  SELECT count(*) INTO n FROM public.audit_events
   WHERE target_table = 'punches'
     AND target_id = (r->>'punch_id')::uuid
     AND event_type = 'clock_in'
     AND actor_id = 'd0000000-0000-4000-8000-00000000000d';
  IF n <> 1 THEN
    RAISE EXCEPTION 'PROBE 9 FAILED: % clock_in audit rows with the JWT actor, expected 1', n;
  END IF;

  SELECT count(*) INTO n FROM public.punches
   WHERE id = (r->>'punch_id')::uuid
     AND punch_time = date_trunc('minute', punch_time);
  IF n <> 1 THEN
    RAISE EXCEPTION 'PROBE 9 FAILED: punch_time is not minute-truncated server time';
  END IF;

  RAISE NOTICE 'PROBE 9 OK (record_punch works under an employee JWT)';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

DO $$ BEGIN RAISE NOTICE 'ALL PROBES PASSED — rolling back fixtures.'; END $$;

ROLLBACK;
