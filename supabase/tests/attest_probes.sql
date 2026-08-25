-- ============================================================
-- PIN attestation primitive — verification probes (Phase 1).
--
-- Run in the STAGING SQL editor (connection role postgres) AFTER applying
-- migration 20260825120000_pin_attestation.sql. The whole script runs in
-- one transaction and ROLLS BACK at the end — nothing persists, including
-- the auth.users fixtures. Each probe prints 'PROBE n OK' via NOTICE and
-- raises 'PROBE n FAILED: …' on failure; the first failure aborts.
--
-- Coverage (the Phase 1 test list):
--   1  set_employee_pin stores a bcrypt hash, never the plaintext
--   2  wrong PIN increments the counter and reports attempts remaining
--   3  the org-configured limit locks the PIN for the configured minutes
--   4  a locked PIN refuses even the CORRECT value
--   5  after the lock clears, the correct PIN verifies and resets state
--   6  no PIN row → status no_pin
--   7  authenticated role has no INSERT/UPDATE/DELETE privilege on
--      attestations and cannot read employee_pins.pin_hash
--   8  a non-admin member cannot set another member's PIN
-- ============================================================

BEGIN;

-- ---------- fixtures (rolled back) ----------
INSERT INTO auth.users (id, email) VALUES
  ('1a000000-0000-4000-8000-00000000001a', 'attest-admin@example.test'),
  ('1b000000-0000-4000-8000-00000000001b', 'attest-member@example.test');

INSERT INTO public.orgs (id, name, created_by) VALUES
  ('1f000000-0000-4000-8000-00000000001f', 'Attest Probe Org', '1a000000-0000-4000-8000-00000000001a');

INSERT INTO public.org_members (org_id, user_id, role, status) VALUES
  ('1f000000-0000-4000-8000-00000000001f', '1a000000-0000-4000-8000-00000000001a', 'owner', 'active'),
  ('1f000000-0000-4000-8000-00000000001f', '1b000000-0000-4000-8000-00000000001b', 'employee', 'active');

INSERT INTO public.employees (id, org_id, user_id, display_name) VALUES
  ('1ea00000-0000-4000-8000-000000000e1a', '1f000000-0000-4000-8000-00000000001f', '1a000000-0000-4000-8000-00000000001a', 'Probe Admin'),
  ('1eb00000-0000-4000-8000-000000000e1b', '1f000000-0000-4000-8000-00000000001f', '1b000000-0000-4000-8000-00000000001b', 'Probe Member');

INSERT INTO public.org_practice_settings (org_id, pin_lockout_attempts, pin_lockout_minutes)
VALUES ('1f000000-0000-4000-8000-00000000001f', 3, 15);

-- ---------- PROBE 1: hash stored, plaintext nowhere ----------
DO $$
DECLARE
  v_hash text;
BEGIN
  PERFORM public.set_employee_pin('1eb00000-0000-4000-8000-000000000e1b', '246810');
  SELECT pin_hash INTO v_hash FROM public.employee_pins
   WHERE employee_id = '1eb00000-0000-4000-8000-000000000e1b';
  IF v_hash IS NULL OR v_hash !~ '^\$2' THEN
    RAISE EXCEPTION 'PROBE 1 FAILED: expected a bcrypt hash, got %', v_hash;
  END IF;
  IF v_hash LIKE '%246810%' THEN
    RAISE EXCEPTION 'PROBE 1 FAILED: plaintext PIN visible in the stored value';
  END IF;
  RAISE NOTICE 'PROBE 1 OK';
END;
$$;

-- ---------- PROBE 2: wrong PIN counts down ----------
DO $$
DECLARE
  r jsonb;
BEGIN
  r := public._verify_employee_pin_internal('1eb00000-0000-4000-8000-000000000e1b', '111111');
  IF r->>'status' <> 'wrong' OR (r->>'attempts_remaining')::int <> 2 THEN
    RAISE EXCEPTION 'PROBE 2 FAILED: %', r;
  END IF;
  RAISE NOTICE 'PROBE 2 OK';
END;
$$;

-- ---------- PROBE 3: the configured limit locks for the configured minutes ----------
DO $$
DECLARE
  r jsonb;
BEGIN
  PERFORM public._verify_employee_pin_internal('1eb00000-0000-4000-8000-000000000e1b', '111111');
  r := public._verify_employee_pin_internal('1eb00000-0000-4000-8000-000000000e1b', '111111');
  IF r->>'status' <> 'locked' THEN
    RAISE EXCEPTION 'PROBE 3 FAILED: third wrong attempt did not lock: %', r;
  END IF;
  IF (r->>'locked_until')::timestamptz > now() + interval '16 minutes'
     OR (r->>'locked_until')::timestamptz < now() + interval '14 minutes' THEN
    RAISE EXCEPTION 'PROBE 3 FAILED: lock window is not the configured 15 minutes: %', r;
  END IF;
  RAISE NOTICE 'PROBE 3 OK';
END;
$$;

-- ---------- PROBE 4: locked refuses the correct PIN ----------
DO $$
DECLARE
  r jsonb;
BEGIN
  r := public._verify_employee_pin_internal('1eb00000-0000-4000-8000-000000000e1b', '246810');
  IF r->>'status' <> 'locked' THEN
    RAISE EXCEPTION 'PROBE 4 FAILED: locked account accepted a PIN: %', r;
  END IF;
  RAISE NOTICE 'PROBE 4 OK';
END;
$$;

-- ---------- PROBE 5: after the lock clears, correct PIN verifies ----------
DO $$
DECLARE
  r jsonb;
BEGIN
  UPDATE public.employee_pins SET locked_until = now() - interval '1 second'
   WHERE employee_id = '1eb00000-0000-4000-8000-000000000e1b';
  r := public._verify_employee_pin_internal('1eb00000-0000-4000-8000-000000000e1b', '246810');
  IF r->>'status' <> 'ok' THEN
    RAISE EXCEPTION 'PROBE 5 FAILED: %', r;
  END IF;
  PERFORM 1 FROM public.employee_pins
   WHERE employee_id = '1eb00000-0000-4000-8000-000000000e1b'
     AND failed_attempts = 0 AND locked_until IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROBE 5 FAILED: success did not reset the lockout state';
  END IF;
  RAISE NOTICE 'PROBE 5 OK';
END;
$$;

-- ---------- PROBE 6: no PIN row ----------
DO $$
DECLARE
  r jsonb;
BEGIN
  r := public._verify_employee_pin_internal('1ea00000-0000-4000-8000-000000000e1a', '246810');
  IF r->>'status' <> 'no_pin' THEN
    RAISE EXCEPTION 'PROBE 6 FAILED: %', r;
  END IF;
  RAISE NOTICE 'PROBE 6 OK';
END;
$$;

-- ---------- PROBE 7: client roles hold no write path / no hash read ----------
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.attestations', 'INSERT')
     OR has_table_privilege('authenticated', 'public.attestations', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.attestations', 'DELETE') THEN
    RAISE EXCEPTION 'PROBE 7 FAILED: authenticated can write attestations';
  END IF;
  IF has_column_privilege('authenticated', 'public.employee_pins', 'pin_hash', 'SELECT') THEN
    RAISE EXCEPTION 'PROBE 7 FAILED: authenticated can read pin_hash';
  END IF;
  IF has_function_privilege('authenticated', 'public._verify_employee_pin_internal(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PROBE 7 FAILED: authenticated can execute the verifier';
  END IF;
  RAISE NOTICE 'PROBE 7 OK';
END;
$$;

-- ---------- PROBE 8: a non-admin member cannot set another member's PIN ----------
DO $$
BEGIN
  -- Simulate the employee member's JWT context.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '1b000000-0000-4000-8000-00000000001b', 'role', 'authenticated')::text,
    true);
  BEGIN
    PERFORM public.set_employee_pin('1ea00000-0000-4000-8000-000000000e1a', '999999');
    RAISE EXCEPTION 'PROBE 8 FAILED: member set another member''s PIN';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL; -- exactly the refusal we want
  END;
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'PROBE 8 OK';
END;
$$;

ROLLBACK;
