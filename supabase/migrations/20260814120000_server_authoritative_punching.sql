-- ============================================================
-- PHASE 1: SERVER-AUTHORITATIVE PUNCHING
-- (Time Clock Legitimacy Hardening — see audits/time-clock-preflight.md)
--
-- The punch write path moves entirely server-side. The device clock and
-- the client stop being trusted for time:
--   1. Repair any duplicate (time_entry_id, seq) pairs, then add the
--      unique backstop index.
--   2. _record_punch_internal(...): the single punch-writing core —
--      server time, midnight continuation, alternation enforcement,
--      seq assignment under the entry row lock, audit in the same
--      transaction. service_role only (the geo edge function calls it).
--   3. record_punch(p_action): the client-facing RPC. Resolves the
--      employee from auth.uid(); the client sends no timestamp.
--   4. trg_audit_punch_change extended to INSERT, so any punch that
--      appears OUTSIDE the RPC still leaves a trace.
--   5. Employee INSERT policies on punches/time_entries dropped.
--      Employee writes happen only through RPCs now. This also closes
--      the cross-entry hole (the old policy never checked that
--      time_entry_id belonged to the caller — preflight adjustment #9).
--
-- DEPLOY NOTES (GitHub merges deploy nothing in this repo):
--   * Apply this migration.
--   * Redeploy edge functions: process-location-event, confirm-import
--     (both changed in this phase; the geo function now requires
--     _record_punch_internal to exist — apply the migration FIRST).
--   * Verification probes: supabase/tests/record_punch_probes.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1a. Repair duplicate (time_entry_id, seq) pairs before the unique
--     index. Client-side seq assignment could race (seq also defaults
--     to 0), so re-sequence affected entries by punch_time. Scoped to
--     entries that actually contain duplicates: the UPDATE deliberately
--     runs with triggers live, so the repair itself is audited.
-- ------------------------------------------------------------
WITH dup_entries AS (
  SELECT time_entry_id
    FROM public.punches
   GROUP BY time_entry_id, seq
  HAVING COUNT(*) > 1
),
renumbered AS (
  SELECT p.id,
         row_number() OVER (
           PARTITION BY p.time_entry_id
           ORDER BY p.punch_time, p.created_at, p.id
         ) - 1 AS new_seq
    FROM public.punches p
   WHERE p.time_entry_id IN (SELECT DISTINCT time_entry_id FROM dup_entries)
)
UPDATE public.punches p
   SET seq = r.new_seq
  FROM renumbered r
 WHERE p.id = r.id
   AND p.seq IS DISTINCT FROM r.new_seq;

-- ------------------------------------------------------------
-- 1b. The unique backstop. idx_punches_entry (non-unique) already
--     serves reads; this one exists to make seq races impossible.
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS punches_entry_seq_uidx
  ON public.punches(time_entry_id, seq);

-- ------------------------------------------------------------
-- 2. The punch-writing core. SECURITY DEFINER, service_role only.
--    p_punch_time exists for the geo path, which may deliver a
--    (server-validated, ±bounded) event timestamp; the client RPC
--    never passes it and always gets date_trunc('minute', now()).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._record_punch_internal(
  p_employee_id uuid,
  p_action text,
  p_source text DEFAULT 'manual',
  p_punch_time timestamptz DEFAULT NULL,
  p_low_confidence boolean DEFAULT false,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_actor uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp record;
  v_now timestamptz;
  v_tz text;
  v_today date;
  v_entry_date date;
  v_entry_id uuid;
  v_today_entry_id uuid;
  v_yday_entry_id uuid;
  v_last_type public.punch_type;
  v_yday_last_type public.punch_type;
  v_yday_last_time timestamptz;
  v_seq integer;
  v_punch record;
  v_punch_type public.punch_type;
  v_event_type text;
BEGIN
  IF p_action NOT IN ('clock_in', 'clock_out') THEN
    RAISE EXCEPTION 'PUNCH_BAD_ACTION: unknown action "%"', p_action USING ERRCODE = '22023';
  END IF;

  SELECT e.id, e.org_id, e.user_id INTO v_emp
    FROM public.employees e
   WHERE e.id = p_employee_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PUNCH_NO_EMPLOYEE: employee record not found' USING ERRCODE = '22023';
  END IF;
  IF v_emp.user_id IS NULL THEN
    -- time_entries.user_id is NOT NULL; an unlinked (import-only)
    -- employee has no account to punch with.
    RAISE EXCEPTION 'PUNCH_UNLINKED_EMPLOYEE: employee has no linked account' USING ERRCODE = '22023';
  END IF;

  v_punch_type := CASE WHEN p_action = 'clock_in' THEN 'in'::public.punch_type ELSE 'out'::public.punch_type END;
  v_now := date_trunc('minute', COALESCE(p_punch_time, now()));
  -- Org timezone plugs in here in Phase 6 (get_user_timezone gains an
  -- org-settings fallback); the call site does not change.
  v_tz := COALESCE(public.get_user_timezone(v_emp.user_id), 'America/New_York');
  v_today := (v_now AT TIME ZONE v_tz)::date;
  v_entry_date := v_today;

  -- Resolve the target entry. For clock_out, prefer an open in on
  -- today's entry; otherwise apply the midnight continuation rule:
  -- yesterday's entry whose last punch is an unpaired in less than
  -- 16 hours old takes this out, instead of an orphan on a fresh entry.
  IF p_action = 'clock_out' THEN
    SELECT te.id INTO v_today_entry_id
      FROM public.time_entries te
     WHERE te.employee_id = p_employee_id AND te.entry_date = v_today;

    IF v_today_entry_id IS NOT NULL THEN
      SELECT p.punch_type INTO v_last_type
        FROM public.punches p
       WHERE p.time_entry_id = v_today_entry_id
       ORDER BY p.seq DESC
       LIMIT 1;
    END IF;

    IF v_today_entry_id IS NOT NULL AND v_last_type = 'in' THEN
      v_entry_id := v_today_entry_id;
    ELSE
      SELECT te.id INTO v_yday_entry_id
        FROM public.time_entries te
       WHERE te.employee_id = p_employee_id AND te.entry_date = v_today - 1;

      IF v_yday_entry_id IS NOT NULL THEN
        SELECT p.punch_type, p.punch_time INTO v_yday_last_type, v_yday_last_time
          FROM public.punches p
         WHERE p.time_entry_id = v_yday_entry_id
         ORDER BY p.seq DESC
         LIMIT 1;

        IF v_yday_last_type = 'in' AND v_now - v_yday_last_time < interval '16 hours' THEN
          v_entry_id := v_yday_entry_id;
          v_entry_date := v_today - 1;
        END IF;
      END IF;

      IF v_entry_id IS NULL THEN
        IF v_today_entry_id IS NOT NULL THEN
          -- Fall through to the authoritative post-lock alternation
          -- check, which will reject with PUNCH_NO_OPEN_IN.
          v_entry_id := v_today_entry_id;
        ELSE
          -- Nothing to close anywhere; don't mint an empty entry.
          RAISE EXCEPTION 'PUNCH_NO_OPEN_IN: no open clock-in to close' USING ERRCODE = 'P0001';
        END IF;
      END IF;
    END IF;
  END IF;

  -- Upsert the entry (the unique (employee_id, entry_date) index
  -- absorbs creation races; DO NOTHING avoids a no-op UPDATE cascade).
  IF v_entry_id IS NULL THEN
    INSERT INTO public.time_entries (user_id, org_id, employee_id, entry_date, source)
    VALUES (v_emp.user_id, v_emp.org_id, p_employee_id, v_entry_date, p_source::public.source_type)
    ON CONFLICT (employee_id, entry_date) DO NOTHING
    RETURNING id INTO v_entry_id;

    IF v_entry_id IS NULL THEN
      SELECT te.id INTO v_entry_id
        FROM public.time_entries te
       WHERE te.employee_id = p_employee_id AND te.entry_date = v_entry_date;
    END IF;
  END IF;

  -- Serialize per entry: seq assignment and the alternation check are
  -- only trustworthy under the entry row lock.
  PERFORM 1 FROM public.time_entries WHERE id = v_entry_id FOR UPDATE;

  v_last_type := NULL;
  SELECT p.punch_type INTO v_last_type
    FROM public.punches p
   WHERE p.time_entry_id = v_entry_id
   ORDER BY p.seq DESC
   LIMIT 1;

  -- Alternation: sequence validation only — never a policy gate. A
  -- clock-out that has an open in is NEVER withheld.
  IF p_action = 'clock_in' AND v_last_type = 'in' THEN
    RAISE EXCEPTION 'PUNCH_ALREADY_IN: already clocked in' USING ERRCODE = 'P0001';
  END IF;
  IF p_action = 'clock_out' AND (v_last_type IS NULL OR v_last_type = 'out') THEN
    RAISE EXCEPTION 'PUNCH_NO_OPEN_IN: no open clock-in to close' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(MAX(p.seq), -1) + 1 INTO v_seq
    FROM public.punches p
   WHERE p.time_entry_id = v_entry_id;

  -- The row-level INSERT audit (trg_audit_punch_change) is for punches
  -- that appear outside this function; suppress it here so each punch
  -- gets exactly one audit row — the richer one below.
  PERFORM set_config('purple.punch_audited', '1', true);

  INSERT INTO public.punches (
    time_entry_id, org_id, employee_id, seq, punch_type, punch_time,
    source, low_confidence, location_lat, location_lng
  ) VALUES (
    v_entry_id, v_emp.org_id, p_employee_id, v_seq, v_punch_type, v_now,
    p_source::public.source_type, COALESCE(p_low_confidence, false), p_lat, p_lng
  )
  RETURNING * INTO v_punch;

  PERFORM set_config('purple.punch_audited', '0', true);

  v_event_type := CASE
    WHEN p_source = 'auto_location' THEN 'auto_' || v_punch_type::text
    ELSE p_action
  END;

  INSERT INTO public.audit_events (
    user_id, org_id, employee_id, actor_id, event_type,
    action_type, target_table, target_id, after_json,
    event_details, related_date, related_entry_id
  ) VALUES (
    v_emp.user_id, v_emp.org_id, p_employee_id, COALESCE(p_actor, auth.uid()), v_event_type,
    'insert', 'punches', v_punch.id, to_jsonb(v_punch),
    jsonb_build_object(
      'punch_time', v_now,
      'seq', v_seq,
      'source', p_source,
      'target_employee_id', p_employee_id,
      'low_confidence', COALESCE(p_low_confidence, false)
    ),
    v_entry_date, v_entry_id
  );

  RETURN jsonb_build_object(
    'entry_id', v_entry_id,
    'punch_id', v_punch.id,
    'seq', v_seq,
    'punch_time', v_now,
    'entry_date', v_entry_date,
    'punch_type', v_punch_type
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public._record_punch_internal(uuid, text, text, timestamptz, boolean, double precision, double precision, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._record_punch_internal(uuid, text, text, timestamptz, boolean, double precision, double precision, uuid)
  TO service_role;

-- ------------------------------------------------------------
-- 3. The client-facing RPC. Identity comes from the JWT; the client
--    sends nothing but the action.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_punch(p_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'PUNCH_NOT_AUTHENTICATED: sign in to punch' USING ERRCODE = '42501';
  END IF;

  SELECT e.id INTO v_employee_id
    FROM public.employees e
   WHERE e.user_id = auth.uid()
   LIMIT 1;
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'PUNCH_NO_EMPLOYEE: no employee record for this account' USING ERRCODE = '22023';
  END IF;

  RETURN public._record_punch_internal(
    p_employee_id := v_employee_id,
    p_action      := p_action,
    p_source      := 'manual',
    p_actor       := auth.uid()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_punch(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_punch(text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 4. Audit trigger covers INSERT too. Suppressed only for the punch
--    the RPC just audited itself; every other insert (import, admin
--    console, anything else) now leaves a trace at the DB layer.
--    UPDATE/DELETE branches unchanged from 20260707182446.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_punch_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_actor uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_setting('purple.punch_audited', true) = '1' THEN
      RETURN NEW;
    END IF;
    SELECT te.user_id INTO v_user_id FROM public.time_entries te WHERE te.id = NEW.time_entry_id;
    v_actor := COALESCE(NEW.edited_by, auth.uid());
    INSERT INTO public.audit_events (
      user_id, org_id, employee_id, actor_id, event_type,
      action_type, target_table, target_id, after_json,
      event_details, related_entry_id, related_date
    ) VALUES (
      COALESCE(v_user_id, NEW.employee_id), NEW.org_id, NEW.employee_id, v_actor, 'punch_created',
      'insert', 'punches', NEW.id, to_jsonb(NEW),
      jsonb_build_object('source', NEW.source, 'seq', NEW.seq, 'target_employee_id', NEW.employee_id),
      NEW.time_entry_id, (SELECT entry_date FROM public.time_entries WHERE id = NEW.time_entry_id)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    SELECT te.user_id INTO v_user_id FROM public.time_entries te WHERE te.id = NEW.time_entry_id;
    v_actor := COALESCE(NEW.edited_by, auth.uid());
    INSERT INTO public.audit_events (
      user_id, org_id, employee_id, actor_id, event_type,
      action_type, target_table, target_id, before_json, after_json,
      related_entry_id, related_date
    ) VALUES (
      COALESCE(v_user_id, NEW.employee_id), NEW.org_id, NEW.employee_id, v_actor, 'punch_edit',
      'update', 'punches', NEW.id, to_jsonb(OLD), to_jsonb(NEW),
      NEW.time_entry_id, (SELECT entry_date FROM public.time_entries WHERE id = NEW.time_entry_id)
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT te.user_id INTO v_user_id FROM public.time_entries te WHERE te.id = OLD.time_entry_id;
    v_actor := COALESCE(OLD.edited_by, auth.uid());
    INSERT INTO public.audit_events (
      user_id, org_id, employee_id, actor_id, event_type,
      action_type, target_table, target_id, before_json,
      related_entry_id, related_date
    ) VALUES (
      COALESCE(v_user_id, OLD.employee_id), OLD.org_id, OLD.employee_id, v_actor, 'punch_deleted',
      'delete', 'punches', OLD.id, to_jsonb(OLD),
      OLD.time_entry_id, (SELECT entry_date FROM public.time_entries WHERE id = OLD.time_entry_id)
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_punch_change ON public.punches;
CREATE TRIGGER trg_audit_punch_change
AFTER INSERT OR UPDATE OR DELETE ON public.punches
FOR EACH ROW EXECUTE FUNCTION public.log_punch_change();

-- ------------------------------------------------------------
-- 5. RLS tightening: employee writes to punch data now happen only
--    through RPCs. Employee SELECT stays; org-admin ALL stays for now
--    (Phases 3 and 4 constrain those properly).
--    Consequences, handled in this same phase:
--      * process-location-event now calls _record_punch_internal with
--        service role (it previously rode these policies).
--      * confirm-import becomes explicitly admin-only (admin writes
--        ride the org-admin ALL policies).
--      * MissingShiftBanner's client-side punch backfill is retired;
--        employees route through correction requests (Phase 4 wires
--        the apply path).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Employees insert own punches" ON public.punches;
DROP POLICY IF EXISTS "Employees insert own time_entries" ON public.time_entries;
