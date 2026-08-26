-- PIN attestation primitive — a server-verified "this specific person
-- confirms this specific action" record, usable by any feature (first
-- consumer: onboarding dual sign-off).
--
-- Offices commonly run one shared login, so "who confirmed this" cannot come
-- from auth.uid(). Each employee gets a per-person PIN, stored ONLY as a
-- bcrypt hash (pgcrypto — the database crypto layer this schema already
-- leans on for token generation). Verification happens server-side in
-- _verify_employee_pin_internal, and attestation rows are written ONLY by
-- the `attest` edge function with the service role.
--
-- Employment/business data only — no patient data anywhere in this module.
--
-- Security model, in one place:
--  - employee_pins.pin_hash is unreadable by app roles: the SELECT grant to
--    authenticated lists every column EXCEPT pin_hash. A 4-8 digit PIN has
--    little entropy, so even the bcrypt hash must never reach a client.
--  - No client write path on employee_pins: set/change go through
--    set_employee_pin (SECURITY DEFINER) — an admin for anyone in their
--    org, a member for their own record. clear_employee_pin is admin-only.
--  - Lockout (5 failures → 15 minutes; both org-configurable on
--    org_practice_settings) is enforced atomically inside
--    _verify_employee_pin_internal, which only service_role may execute.
--  - attestations take NO client writes: authenticated holds only SELECT,
--    and the only policy is a read policy. The attest edge function is the
--    single writer.

CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;

-- ================================================================
-- 1. Per-employee PIN storage (beside the employee record)
-- ================================================================

CREATE TABLE public.employee_pins (
  employee_id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  pin_hash text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  set_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Composite key so a tenant mismatch is rejected by PostgreSQL itself.
  FOREIGN KEY (employee_id, org_id)
    REFERENCES public.employees(id, org_id) ON DELETE CASCADE
);

CREATE INDEX idx_employee_pins_org ON public.employee_pins(org_id);

ALTER TABLE public.employee_pins ENABLE ROW LEVEL SECURITY;

-- Status only (set / locked / when) — never the hash. Clients must select
-- named columns; SELECT * fails by design because pin_hash is not granted.
REVOKE ALL ON public.employee_pins FROM PUBLIC, anon, authenticated;
GRANT SELECT (employee_id, org_id, failed_attempts, locked_until, set_by, created_at, updated_at)
  ON public.employee_pins TO authenticated;
GRANT ALL ON public.employee_pins TO service_role;

CREATE POLICY "Admins and self read pin status"
  ON public.employee_pins FOR SELECT
  TO authenticated
  USING (
    public.is_org_admin(org_id)
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = employee_id AND e.user_id = auth.uid()
    )
  );

CREATE TRIGGER trg_employee_pins_updated_at
  BEFORE UPDATE ON public.employee_pins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ================================================================
-- 2. Attestations — the permanent "person X confirmed action Y" record
-- ================================================================

CREATE TABLE public.attestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  -- The person who attested (PIN-verified) — NOT the signed-in session.
  employee_id uuid NOT NULL,
  -- The session the terminal was signed into, kept for the audit trail.
  session_user_id uuid,
  action_type text NOT NULL CHECK (action_type ~ '^[a-z0-9_]{3,64}$'),
  -- What was confirmed, as a reference (same shape notifications use).
  related_table text NOT NULL CHECK (related_table ~ '^[a-z_]{1,64}$'),
  related_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified boolean NOT NULL DEFAULT true,
  -- Server timestamp: written by the attest function, never by a client.
  attested_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (employee_id, org_id)
    REFERENCES public.employees(id, org_id) ON DELETE CASCADE
);

CREATE INDEX idx_attestations_related ON public.attestations(org_id, related_table, related_id);
CREATE INDEX idx_attestations_employee ON public.attestations(employee_id, attested_at DESC);

ALTER TABLE public.attestations ENABLE ROW LEVEL SECURITY;

-- No client insert/update/delete path — the attest edge function is the
-- single writer. SELECT only, and only through the read policy below.
REVOKE ALL ON public.attestations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.attestations TO authenticated;
GRANT ALL ON public.attestations TO service_role;

CREATE POLICY "Admins and self read attestations"
  ON public.attestations FOR SELECT
  TO authenticated
  USING (
    public.is_org_admin(org_id)
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = employee_id AND e.user_id = auth.uid()
    )
  );

-- ================================================================
-- 3. Org-configurable behavior (defaults are the product)
-- ================================================================

ALTER TABLE public.org_practice_settings
  ADD COLUMN IF NOT EXISTS require_pin_on_signoff boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pin_lockout_attempts integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS pin_lockout_minutes integer NOT NULL DEFAULT 15;

ALTER TABLE public.org_practice_settings
  DROP CONSTRAINT IF EXISTS org_practice_settings_pin_lockout_attempts_check;
ALTER TABLE public.org_practice_settings
  ADD CONSTRAINT org_practice_settings_pin_lockout_attempts_check
  CHECK (pin_lockout_attempts BETWEEN 1 AND 10);

ALTER TABLE public.org_practice_settings
  DROP CONSTRAINT IF EXISTS org_practice_settings_pin_lockout_minutes_check;
ALTER TABLE public.org_practice_settings
  ADD CONSTRAINT org_practice_settings_pin_lockout_minutes_check
  CHECK (pin_lockout_minutes BETWEEN 1 AND 1440);

-- ================================================================
-- 4. Setting and clearing a PIN (the only write path clients have)
-- ================================================================

-- An admin sets/resets any employee's PIN in their org; a member with their
-- own login sets their own. The PIN is hashed here and nowhere else —
-- plaintext never lands in a table, a log, or a return value.
CREATE OR REPLACE FUNCTION public.set_employee_pin(_employee_id uuid, _pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  emp public.employees;
BEGIN
  IF _pin IS NULL OR _pin !~ '^[0-9]{4,8}$' THEN
    RAISE EXCEPTION 'A sign-off PIN is 4-8 digits';
  END IF;

  SELECT * INTO emp FROM public.employees WHERE id = _employee_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  -- auth.uid() is NULL only in service contexts (allowed); an authenticated
  -- caller must be an org admin or the employee themself.
  IF auth.uid() IS NOT NULL
     AND NOT public.is_org_admin(emp.org_id)
     AND (emp.user_id IS NULL OR emp.user_id <> auth.uid()) THEN
    RAISE EXCEPTION 'Only a manager or owner can set this PIN'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.employee_pins (employee_id, org_id, pin_hash, failed_attempts, locked_until, set_by)
  VALUES (_employee_id, emp.org_id, crypt(_pin, gen_salt('bf', 10)), 0, NULL, auth.uid())
  ON CONFLICT (employee_id) DO UPDATE
    SET pin_hash = EXCLUDED.pin_hash,
        failed_attempts = 0,
        locked_until = NULL,
        set_by = EXCLUDED.set_by,
        updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_employee_pin(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_employee_pin(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.clear_employee_pin(_employee_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT org_id INTO v_org FROM public.employees WHERE id = _employee_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.is_org_admin(v_org) THEN
    RAISE EXCEPTION 'Only a manager or owner can clear a PIN'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  DELETE FROM public.employee_pins WHERE employee_id = _employee_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clear_employee_pin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_employee_pin(uuid) TO authenticated, service_role;

-- ================================================================
-- 5. Verification core — service_role only, lockout enforced atomically
-- ================================================================

-- Returns jsonb: {status:'ok'} | {status:'wrong', attempts_remaining}
--              | {status:'locked', locked_until} | {status:'no_pin'}.
-- The row lock serializes concurrent attempts so the counter cannot be
-- raced past the limit. On lock, failed_attempts resets — the window
-- starts clean when the lock expires.
CREATE OR REPLACE FUNCTION public._verify_employee_pin_internal(_employee_id uuid, _pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  rec public.employee_pins;
  max_attempts integer;
  lock_minutes integer;
  lock_until timestamptz;
BEGIN
  SELECT * INTO rec FROM public.employee_pins
   WHERE employee_id = _employee_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'no_pin');
  END IF;

  max_attempts := COALESCE(
    (SELECT s.pin_lockout_attempts FROM public.org_practice_settings s WHERE s.org_id = rec.org_id), 5);
  lock_minutes := COALESCE(
    (SELECT s.pin_lockout_minutes FROM public.org_practice_settings s WHERE s.org_id = rec.org_id), 15);

  IF rec.locked_until IS NOT NULL AND rec.locked_until > now() THEN
    RETURN jsonb_build_object('status', 'locked', 'locked_until', rec.locked_until);
  END IF;

  IF _pin IS NOT NULL AND rec.pin_hash = crypt(_pin, rec.pin_hash) THEN
    UPDATE public.employee_pins
       SET failed_attempts = 0, locked_until = NULL, updated_at = now()
     WHERE employee_id = _employee_id;
    RETURN jsonb_build_object('status', 'ok');
  END IF;

  IF rec.failed_attempts + 1 >= max_attempts THEN
    lock_until := now() + make_interval(mins => lock_minutes);
    UPDATE public.employee_pins
       SET failed_attempts = 0, locked_until = lock_until, updated_at = now()
     WHERE employee_id = _employee_id;
    RETURN jsonb_build_object('status', 'locked', 'locked_until', lock_until);
  END IF;

  UPDATE public.employee_pins
     SET failed_attempts = rec.failed_attempts + 1, updated_at = now()
   WHERE employee_id = _employee_id;
  RETURN jsonb_build_object('status', 'wrong', 'attempts_remaining', max_attempts - rec.failed_attempts - 1);
END;
$$;

REVOKE EXECUTE ON FUNCTION public._verify_employee_pin_internal(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._verify_employee_pin_internal(uuid, text) TO service_role;
