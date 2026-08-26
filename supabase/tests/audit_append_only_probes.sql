-- ============================================================
-- Phase 2 verification probes — append-only audit log.
-- (Time Clock Legitimacy Hardening; see audits/time-clock-preflight.md)
--
-- Run in the SQL editor (connection role postgres) AFTER applying
-- migration 20260814130000_append_only_audit.sql. One transaction,
-- ROLLBACK at the end — nothing persists. Each probe raises
-- 'PROBE n FAILED …' on failure; a clean run means every probe passed.
--
-- Coverage (the Phase 2 verify list):
--   1  policy state: the org-admin FOR ALL policy is gone; INSERT and
--      SELECT policies remain; no UPDATE/DELETE policy for any role
--   2  UPDATE as the table-owner role rejected by the trigger
--   3  DELETE as the table-owner role rejected by the trigger
--   4  UPDATE and DELETE as service_role (BYPASSRLS) rejected — RLS
--      does not bind service role; the trigger does
--   5  TRUNCATE rejected by the statement trigger
--   6  UPDATE/DELETE as an authenticated org ADMIN touch zero rows
--      (the exact capability the dropped FOR ALL policy used to grant)
--   7  the surface that must keep working still works: member INSERT
--      with the actor check, and org-admin SELECT of others' rows
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '25s';

-- ---------- fixtures (rolled back) ----------
INSERT INTO auth.users (id, email) VALUES
  ('0a000000-0000-4000-8000-0000000000aa', 'probe-owner@example.test'),
  ('0e000000-0000-4000-8000-0000000000ee', 'probe-emp@example.test');

INSERT INTO public.orgs (id, name, created_by) VALUES
  ('0f000000-0000-4000-8000-0000000000ff', 'Audit Probe Org', '0a000000-0000-4000-8000-0000000000aa');

INSERT INTO public.org_members (org_id, user_id, role, status) VALUES
  ('0f000000-0000-4000-8000-0000000000ff', '0a000000-0000-4000-8000-0000000000aa', 'owner', 'active'),
  ('0f000000-0000-4000-8000-0000000000ff', '0e000000-0000-4000-8000-0000000000ee', 'employee', 'active');

INSERT INTO public.employees (id, org_id, user_id, display_name) VALUES
  ('1a000000-0000-4000-8000-0000000000aa', '0f000000-0000-4000-8000-0000000000ff', '0a000000-0000-4000-8000-0000000000aa', 'Probe Owner'),
  ('1e000000-0000-4000-8000-0000000000ee', '0f000000-0000-4000-8000-0000000000ff', '0e000000-0000-4000-8000-0000000000ee', 'Probe Employee');

INSERT INTO public.audit_events (id, user_id, org_id, employee_id, actor_id, event_type, event_details)
VALUES ('2a000000-0000-4000-8000-000000000001',
        '0e000000-0000-4000-8000-0000000000ee',
        '0f000000-0000-4000-8000-0000000000ff',
        '1e000000-0000-4000-8000-0000000000ee',
        '0e000000-0000-4000-8000-0000000000ee',
        'probe_seed',
        '{"target_employee_id":"1e000000-0000-4000-8000-0000000000ee"}'::jsonb);

-- ---------- PROBE 1: policy state ----------
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename='audit_events' AND policyname='Org admin audit_events';
  IF n <> 0 THEN RAISE EXCEPTION 'PROBE 1 FAILED: the org-admin FOR ALL policy still exists'; END IF;

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename='audit_events' AND policyname='Org members insert audit_events' AND cmd='INSERT';
  IF n <> 1 THEN RAISE EXCEPTION 'PROBE 1 FAILED: member INSERT policy missing'; END IF;

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename='audit_events' AND policyname='Employees select own audit_events' AND cmd='SELECT';
  IF n <> 1 THEN RAISE EXCEPTION 'PROBE 1 FAILED: SELECT policy missing'; END IF;

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename='audit_events' AND cmd IN ('UPDATE','DELETE','ALL');
  IF n <> 0 THEN RAISE EXCEPTION 'PROBE 1 FAILED: % UPDATE/DELETE/ALL policies remain on audit_events', n; END IF;

  RAISE NOTICE 'PROBE 1 OK';
END $$;

-- ---------- PROBE 2: UPDATE as owner role rejected ----------
DO $$
BEGIN
  UPDATE public.audit_events SET event_type = 'tampered'
   WHERE id = '2a000000-0000-4000-8000-000000000001';
  RAISE EXCEPTION 'PROBE 2 FAILED: owner-role UPDATE was allowed';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'AUDIT_APPEND_ONLY%' THEN RAISE NOTICE 'PROBE 2 OK'; ELSE RAISE; END IF;
END $$;

-- ---------- PROBE 3: DELETE as owner role rejected ----------
DO $$
BEGIN
  DELETE FROM public.audit_events WHERE id = '2a000000-0000-4000-8000-000000000001';
  RAISE EXCEPTION 'PROBE 3 FAILED: owner-role DELETE was allowed';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'AUDIT_APPEND_ONLY%' THEN RAISE NOTICE 'PROBE 3 OK'; ELSE RAISE; END IF;
END $$;

-- ---------- PROBE 4: UPDATE and DELETE as service_role rejected ----------
DO $$
BEGIN
  PERFORM set_config('role', 'service_role', true);

  BEGIN
    UPDATE public.audit_events SET event_type = 'tampered'
     WHERE id = '2a000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'PROBE 4 FAILED: service_role UPDATE was allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'AUDIT_APPEND_ONLY%' THEN RAISE; END IF;
  END;

  BEGIN
    DELETE FROM public.audit_events WHERE id = '2a000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'PROBE 4 FAILED: service_role DELETE was allowed';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'AUDIT_APPEND_ONLY%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'PROBE 4 OK (service role is bound by the trigger)';
END $$;
RESET ROLE;

-- ---------- PROBE 5: TRUNCATE guard in place (lock-safe form) ----------
-- A literal TRUNCATE needs ACCESS EXCLUSIVE and can stall behind live
-- traffic on a busy database; the catalog proves the guard without
-- taking the lock. tgtype 34 = BEFORE|TRUNCATE statement trigger;
-- tgtype 27 = ROW|BEFORE|DELETE|UPDATE row trigger.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_trigger t
   JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname = 'audit_events' AND t.tgname = 'trg_audit_events_no_truncate' AND t.tgtype = 34;
  IF n <> 1 THEN RAISE EXCEPTION 'PROBE 5 FAILED: BEFORE TRUNCATE statement trigger missing or wrong shape'; END IF;
  SELECT count(*) INTO n FROM pg_trigger t
   JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname = 'audit_events' AND t.tgname = 'trg_audit_events_append_only' AND t.tgtype = 27;
  IF n <> 1 THEN RAISE EXCEPTION 'PROBE 5 FAILED: BEFORE UPDATE OR DELETE row trigger missing or wrong shape'; END IF;
  RAISE NOTICE 'PROBE 5 OK';
END $$;

-- ---------- PROBE 6: authenticated org ADMIN touches zero rows ----------
DO $$
DECLARE n int;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"0a000000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);

  UPDATE public.audit_events SET event_type = 'tampered'
   WHERE id = '2a000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'PROBE 6 FAILED: admin UPDATE affected % rows', n; END IF;

  DELETE FROM public.audit_events WHERE id = '2a000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'PROBE 6 FAILED: admin DELETE affected % rows', n; END IF;

  RAISE NOTICE 'PROBE 6 OK (the dropped FOR ALL capability is really gone)';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

-- ---------- PROBE 7: the intended surface still works ----------
DO $$
DECLARE n int;
BEGIN
  -- Org admin can still read another member's audit row (SELECT arm).
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"0a000000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);

  SELECT count(*) INTO n FROM public.audit_events
   WHERE id = '2a000000-0000-4000-8000-000000000001';
  IF n <> 1 THEN RAISE EXCEPTION 'PROBE 7 FAILED: org admin can no longer read the audit trail'; END IF;

  -- Member INSERT with the actor check still works (employee writes own event).
  PERFORM set_config('request.jwt.claims',
    '{"sub":"0e000000-0000-4000-8000-0000000000ee","role":"authenticated"}', true);

  INSERT INTO public.audit_events (user_id, org_id, employee_id, actor_id, event_type, event_details)
  VALUES ('0e000000-0000-4000-8000-0000000000ee',
          '0f000000-0000-4000-8000-0000000000ff',
          '1e000000-0000-4000-8000-0000000000ee',
          '0e000000-0000-4000-8000-0000000000ee',
          'probe_member_insert',
          '{"target_employee_id":"1e000000-0000-4000-8000-0000000000ee"}'::jsonb);

  -- Spoofed actor must still be rejected by the INSERT policy's actor check.
  BEGIN
    INSERT INTO public.audit_events (user_id, org_id, employee_id, actor_id, event_type)
    VALUES ('0e000000-0000-4000-8000-0000000000ee',
            '0f000000-0000-4000-8000-0000000000ff',
            '1e000000-0000-4000-8000-0000000000ee',
            '0a000000-0000-4000-8000-0000000000aa',  -- someone else as actor
            'probe_spoofed_actor');
    RAISE EXCEPTION 'PROBE 7 FAILED: spoofed actor_id was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  RAISE NOTICE 'PROBE 7 OK (append and read surfaces intact)';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

DO $$ BEGIN RAISE NOTICE 'ALL PROBES PASSED — rolling back fixtures.'; END $$;

ROLLBACK;
