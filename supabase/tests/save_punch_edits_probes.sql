-- ============================================================
-- Phase 4 verification probes — transactional editing.
-- (Time Clock Legitimacy Hardening; see audits/time-clock-preflight.md)
--
-- Run in the SQL editor (connection role postgres) AFTER applying
-- migration 20260814150000_transactional_editing.sql. One transaction,
-- ROLLBACK at the end — nothing persists. Each probe raises
-- 'PROBE n FAILED …' on failure; a clean run means every probe passed.
--
-- Coverage (the Phase 4 test list):
--   1  admin edit applies: manual time accepted, EXACTLY ONE audit row
--      per op (reason, actor = admin, target_employee_id = the ENTRY's
--      employee), total recomputed
--   2  mid-list failure rolls back EVERYTHING: no changes, zero audits
--   3  employees cannot call it (EDIT_ADMIN_ONLY)
--   4  null-entry mode creates the missed day with the TARGET's ids
--   5  final-sequence validation rejects in/in and rolls back
--   6  void op voids with audit; ops on voided punches rejected
--   7  renumber: out-of-order edits leave live punches seq-ordered by
--      punch_time, with fresh seqs past every kept voided seq
--   8  client-side punch UPDATE is closed for admins too (policy gone)
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '25s';

-- ---------- fixtures (rolled back) ----------
INSERT INTO auth.users (id, email) VALUES
  ('4a000000-0000-4000-8000-0000000000aa', 'probe-admin@example.test'),
  ('4e000000-0000-4000-8000-0000000000ee', 'probe-emp4@example.test');

INSERT INTO public.orgs (id, name, created_by) VALUES
  ('4f000000-0000-4000-8000-0000000000ff', 'Edit Probe Org', '4a000000-0000-4000-8000-0000000000aa');

INSERT INTO public.org_members (org_id, user_id, role, status) VALUES
  ('4f000000-0000-4000-8000-0000000000ff', '4a000000-0000-4000-8000-0000000000aa', 'owner', 'active'),
  ('4f000000-0000-4000-8000-0000000000ff', '4e000000-0000-4000-8000-0000000000ee', 'employee', 'active');

INSERT INTO public.employees (id, org_id, user_id, display_name) VALUES
  ('4b000000-0000-4000-8000-0000000000bb', '4f000000-0000-4000-8000-0000000000ff', '4a000000-0000-4000-8000-0000000000aa', 'Probe Admin'),
  ('4c000000-0000-4000-8000-0000000000cc', '4f000000-0000-4000-8000-0000000000ff', '4e000000-0000-4000-8000-0000000000ee', 'Probe Employee 4');

-- Seed a worked day for the employee: in 3h ago, out 1h ago (~120 min).
DO $$
DECLARE r_in jsonb; r_out jsonb;
BEGIN
  r_in := public._record_punch_internal(
    p_employee_id := '4c000000-0000-4000-8000-0000000000cc',
    p_action := 'clock_in', p_punch_time := now() - interval '3 hours',
    p_actor := '4e000000-0000-4000-8000-0000000000ee');
  r_out := public._record_punch_internal(
    p_employee_id := '4c000000-0000-4000-8000-0000000000cc',
    p_action := 'clock_out', p_punch_time := now() - interval '1 hour',
    p_actor := '4e000000-0000-4000-8000-0000000000ee');
  PERFORM set_config('probe.entry_id', r_out->>'entry_id', true);
  PERFORM set_config('probe.in_id', r_in->>'punch_id', true);
  PERFORM set_config('probe.out_id', r_out->>'punch_id', true);
END $$;

-- ---------- PROBE 1: admin edit applies with one reasoned audit per op ----------
DO $$
DECLARE
  v_entry uuid := current_setting('probe.entry_id')::uuid;
  v_out uuid := current_setting('probe.out_id')::uuid;
  r jsonb;
  n int;
  v_total int;
  v_emp uuid;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"4a000000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);

  r := public.save_punch_edits(
    p_entry_id := v_entry,
    p_edits := jsonb_build_array(jsonb_build_object(
      'op', 'update', 'id', v_out,
      'punch_time', to_char(now() - interval '30 minutes', 'YYYY-MM-DD"T"HH24:MI:00+00:00'),
      'punch_type', 'out')),
    p_reason := 'probe: forgot to clock out on time');

  PERFORM set_config('role', 'postgres', true);

  IF (r->>'applied_ops')::int <> 1 THEN
    RAISE EXCEPTION 'PROBE 1 FAILED: applied_ops %, expected 1', r->>'applied_ops';
  END IF;
  IF jsonb_array_length(r->'audit_event_ids') <> 1 THEN
    RAISE EXCEPTION 'PROBE 1 FAILED: % audit ids returned, expected 1', jsonb_array_length(r->'audit_event_ids');
  END IF;

  SELECT count(*) INTO n FROM public.audit_events
   WHERE id = ((r->'audit_event_ids')->>0)::uuid
     AND event_type = 'punch_edit'
     AND actor_id = '4a000000-0000-4000-8000-0000000000aa'
     AND reason = 'probe: forgot to clock out on time'
     AND (event_details->>'target_employee_id')::uuid = '4c000000-0000-4000-8000-0000000000cc'
     AND (event_details->>'manual_time')::boolean = true;
  IF n <> 1 THEN RAISE EXCEPTION 'PROBE 1 FAILED: audit row shape wrong'; END IF;

  -- Exactly one audit row was added for the punch by this edit (trigger suppressed).
  SELECT count(*) INTO n FROM public.audit_events
   WHERE target_table = 'punches' AND target_id = v_out AND action_type = 'update';
  IF n <> 1 THEN RAISE EXCEPTION 'PROBE 1 FAILED: % update-audits for the punch, expected exactly 1', n; END IF;

  SELECT total_minutes INTO v_total FROM public.time_entries WHERE id = v_entry;
  IF v_total IS NULL OR v_total < 145 OR v_total > 155 THEN
    RAISE EXCEPTION 'PROBE 1 FAILED: total % after moving the out, expected ~150', v_total;
  END IF;

  SELECT employee_id INTO v_emp FROM public.punches WHERE id = v_out;
  IF v_emp <> '4c000000-0000-4000-8000-0000000000cc' THEN
    RAISE EXCEPTION 'PROBE 1 FAILED: punch employee flipped to %', v_emp;
  END IF;

  RAISE NOTICE 'PROBE 1 OK';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

-- ---------- PROBE 2: mid-list failure rolls back everything ----------
DO $$
DECLARE
  v_entry uuid := current_setting('probe.entry_id')::uuid;
  v_out uuid := current_setting('probe.out_id')::uuid;
  v_before_audits int;
  v_before_time timestamptz;
  n int;
BEGIN
  SELECT count(*) INTO v_before_audits FROM public.audit_events WHERE related_entry_id = v_entry;
  SELECT punch_time INTO v_before_time FROM public.punches WHERE id = v_out;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"4a000000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);

  BEGIN
    PERFORM public.save_punch_edits(
      p_entry_id := v_entry,
      p_edits := jsonb_build_array(
        jsonb_build_object('op', 'update', 'id', v_out,
          'punch_time', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:00+00:00'), 'punch_type', 'out'),
        jsonb_build_object('op', 'explode')),
      p_reason := 'probe: should roll back');
    RAISE EXCEPTION 'PROBE 2 FAILED: bad op list was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'EDIT_BAD_OP%' THEN RAISE; END IF;
  END;

  PERFORM set_config('role', 'postgres', true);

  SELECT count(*) INTO n FROM public.audit_events WHERE related_entry_id = v_entry;
  IF n <> v_before_audits THEN
    RAISE EXCEPTION 'PROBE 2 FAILED: % audits appeared from a rolled-back edit', n - v_before_audits;
  END IF;
  PERFORM 1 FROM public.punches WHERE id = v_out AND punch_time = v_before_time;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROBE 2 FAILED: the first op survived the rollback'; END IF;

  RAISE NOTICE 'PROBE 2 OK';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

-- ---------- PROBE 3: employees cannot call it ----------
DO $$
DECLARE v_entry uuid := current_setting('probe.entry_id')::uuid;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"4e000000-0000-4000-8000-0000000000ee","role":"authenticated"}', true);
  BEGIN
    PERFORM public.save_punch_edits(
      p_entry_id := v_entry,
      p_edits := jsonb_build_array(jsonb_build_object('op', 'void', 'id', current_setting('probe.out_id'))),
      p_reason := 'probe: employee should be rejected');
    RAISE EXCEPTION 'PROBE 3 FAILED: an employee ran save_punch_edits';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'EDIT_ADMIN_ONLY%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'PROBE 3 OK';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

-- ---------- PROBE 4: null-entry mode creates the missed day with target ids ----------
DO $$
DECLARE
  r jsonb;
  v_day date := (now() AT TIME ZONE 'America/New_York')::date - 10;
  v_uid uuid;
  v_emp uuid;
  v_total int;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"4a000000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);

  r := public.save_punch_edits(
    p_entry_id := NULL,
    p_edits := jsonb_build_array(
      jsonb_build_object('op', 'insert', 'punch_type', 'in',
        'punch_time', (v_day::text || 'T13:00:00+00:00')),
      jsonb_build_object('op', 'insert', 'punch_type', 'out',
        'punch_time', (v_day::text || 'T21:00:00+00:00'))),
    p_reason := 'probe: manager fixing a fully missed day',
    p_employee_id := '4c000000-0000-4000-8000-0000000000cc',
    p_entry_date := v_day);

  PERFORM set_config('role', 'postgres', true);

  SELECT te.user_id, te.employee_id, te.total_minutes INTO v_uid, v_emp, v_total
    FROM public.time_entries te WHERE te.id = (r->>'entry_id')::uuid;
  IF v_uid <> '4e000000-0000-4000-8000-0000000000ee' OR v_emp <> '4c000000-0000-4000-8000-0000000000cc' THEN
    RAISE EXCEPTION 'PROBE 4 FAILED: created entry carries wrong identity (user %, employee %)', v_uid, v_emp;
  END IF;
  IF v_total <> 480 THEN
    RAISE EXCEPTION 'PROBE 4 FAILED: missed-day total % expected 480', v_total;
  END IF;

  RAISE NOTICE 'PROBE 4 OK';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

-- ---------- PROBE 5: in/in final sequence rejected and rolled back ----------
DO $$
DECLARE
  v_entry uuid := current_setting('probe.entry_id')::uuid;
  v_out uuid := current_setting('probe.out_id')::uuid;
  v_before_audits int;
BEGIN
  SELECT count(*) INTO v_before_audits FROM public.audit_events WHERE related_entry_id = v_entry;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"4a000000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);
  BEGIN
    PERFORM public.save_punch_edits(
      p_entry_id := v_entry,
      p_edits := jsonb_build_array(jsonb_build_object(
        'op', 'update', 'id', v_out,
        'punch_time', to_char(now() - interval '30 minutes', 'YYYY-MM-DD"T"HH24:MI:00+00:00'),
        'punch_type', 'in')),
      p_reason := 'probe: in/in must be rejected');
    RAISE EXCEPTION 'PROBE 5 FAILED: an in/in sequence was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'EDIT_SEQUENCE_INVALID%' THEN RAISE; END IF;
  END;
  PERFORM set_config('role', 'postgres', true);

  PERFORM 1 FROM public.punches WHERE id = v_out AND punch_type = 'out';
  IF NOT FOUND THEN RAISE EXCEPTION 'PROBE 5 FAILED: the rejected edit persisted'; END IF;
  PERFORM 1 FROM public.audit_events WHERE related_entry_id = v_entry
    HAVING count(*) <> v_before_audits;
  IF FOUND THEN RAISE EXCEPTION 'PROBE 5 FAILED: audits leaked from the rejected edit'; END IF;

  RAISE NOTICE 'PROBE 5 OK';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

-- ---------- PROBE 6: void via RPC; ops on voided punches rejected ----------
DO $$
DECLARE
  v_entry uuid := current_setting('probe.entry_id')::uuid;
  v_out uuid := current_setting('probe.out_id')::uuid;
  r jsonb;
  v_total int;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"4a000000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);

  r := public.save_punch_edits(
    p_entry_id := v_entry,
    p_edits := jsonb_build_array(jsonb_build_object('op', 'void', 'id', v_out)),
    p_reason := 'probe: voiding the out');

  BEGIN
    PERFORM public.save_punch_edits(
      p_entry_id := v_entry,
      p_edits := jsonb_build_array(jsonb_build_object(
        'op', 'update', 'id', v_out,
        'punch_time', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:00+00:00'), 'punch_type', 'out')),
      p_reason := 'probe: editing a voided punch must fail');
    RAISE EXCEPTION 'PROBE 6 FAILED: a voided punch accepted an update';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'EDIT_PUNCH_VOIDED%' THEN RAISE; END IF;
  END;

  PERFORM set_config('role', 'postgres', true);

  PERFORM 1 FROM public.punches WHERE id = v_out AND voided_at IS NOT NULL AND void_reason = 'probe: voiding the out';
  IF NOT FOUND THEN RAISE EXCEPTION 'PROBE 6 FAILED: void did not land'; END IF;
  PERFORM 1 FROM public.audit_events WHERE id = ((r->'audit_event_ids')->>0)::uuid AND event_type = 'punch_voided';
  IF NOT FOUND THEN RAISE EXCEPTION 'PROBE 6 FAILED: no punch_voided audit row'; END IF;
  SELECT total_minutes INTO v_total FROM public.time_entries WHERE id = v_entry;
  IF v_total <> 0 THEN RAISE EXCEPTION 'PROBE 6 FAILED: total % after voiding the only out', v_total; END IF;

  RAISE NOTICE 'PROBE 6 OK';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

-- ---------- PROBE 7: renumber keeps live punches seq-ordered by time ----------
DO $$
DECLARE
  v_entry uuid := current_setting('probe.entry_id')::uuid;
  v_in uuid := current_setting('probe.in_id')::uuid;
  v_bad int;
  v_min_live_seq int;
  v_max_voided_seq int;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"4a000000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);

  -- Rebuild the day out of order: void the surviving in, then insert two
  -- pairs whose op order does not match time order (the t-6h pair comes
  -- after nothing but lands earliest). The save must renumber live
  -- punches into punch_time order without touching voided seqs.
  PERFORM public.save_punch_edits(
    p_entry_id := v_entry,
    p_edits := jsonb_build_array(
      jsonb_build_object('op', 'void', 'id', v_in),
      jsonb_build_object('op', 'insert', 'punch_type', 'in',
        'punch_time', to_char(now() - interval '6 hours', 'YYYY-MM-DD"T"HH24:MI:00+00:00')),
      jsonb_build_object('op', 'insert', 'punch_type', 'out',
        'punch_time', to_char(now() - interval '5 hours', 'YYYY-MM-DD"T"HH24:MI:00+00:00')),
      jsonb_build_object('op', 'insert', 'punch_type', 'in',
        'punch_time', to_char(now() - interval '2 hours', 'YYYY-MM-DD"T"HH24:MI:00+00:00')),
      jsonb_build_object('op', 'insert', 'punch_type', 'out',
        'punch_time', to_char(now() - interval '90 minutes', 'YYYY-MM-DD"T"HH24:MI:00+00:00'))),
    p_reason := 'probe: rebuild the day out of order');

  PERFORM set_config('role', 'postgres', true);

  -- Live punches must be seq-ordered by punch_time…
  SELECT count(*) INTO v_bad FROM (
    SELECT punch_time, lag(punch_time) OVER (ORDER BY seq) AS prev_time
      FROM public.punches WHERE time_entry_id = v_entry AND voided_at IS NULL
  ) x WHERE x.prev_time IS NOT NULL AND x.punch_time < x.prev_time;
  IF v_bad > 0 THEN RAISE EXCEPTION 'PROBE 7 FAILED: % live punches out of seq/time order', v_bad; END IF;

  -- …with seqs strictly past every kept voided seq.
  SELECT MIN(seq) INTO v_min_live_seq FROM public.punches WHERE time_entry_id = v_entry AND voided_at IS NULL;
  SELECT MAX(seq) INTO v_max_voided_seq FROM public.punches WHERE time_entry_id = v_entry AND voided_at IS NOT NULL;
  IF v_max_voided_seq IS NOT NULL AND v_min_live_seq <= v_max_voided_seq THEN
    RAISE EXCEPTION 'PROBE 7 FAILED: live seq % collides with voided seq range (max %)', v_min_live_seq, v_max_voided_seq;
  END IF;

  RAISE NOTICE 'PROBE 7 OK';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

-- ---------- PROBE 8: client punch UPDATE is closed even for admins ----------
DO $$
DECLARE
  v_out uuid := current_setting('probe.out_id')::uuid;
  n int;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"4a000000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);

  UPDATE public.punches SET punch_time = now() WHERE id = v_out;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'PROBE 8 FAILED: an admin updated a punch outside the RPC (% rows)', n;
  END IF;

  RAISE NOTICE 'PROBE 8 OK (the audited RPC is the only edit path)';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);

DO $$ BEGIN RAISE NOTICE 'ALL PROBES PASSED — rolling back fixtures.'; END $$;

ROLLBACK;
