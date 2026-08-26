-- ============================================================
-- PHASE 4: TRANSACTIONAL EDITING AND A WORKING MANAGER PATH
-- (Time Clock Legitimacy Hardening — see audits/time-clock-preflight.md)
--
--   1. save_punch_edits(p_entry_id, p_edits, p_reason, p_employee_id,
--      p_entry_date): the ONLY punch edit path. Org-admin-only
--      (enforced in the function, not just RLS). The target employee is
--      resolved from the ENTRY row — the editor's own org context never
--      decides whose record changes (preflight finding F·06). Applies a
--      list of {op:"update"|"void"|"insert"} operations atomically:
--      any failure rolls back everything, audits included. One audit
--      row per operation (old value, new value, reason, actor,
--      target_employee_id). Operations on voided punches are rejected.
--      For a fully missed day, p_entry_id IS NULL plus p_employee_id
--      and p_entry_date creates the entry inside the transaction.
--      Manual punch_time values are accepted here — this is the
--      human-judgment correction path — and each audit row records
--      manual_time: true; original_punch_time is preserved server-side
--      from the current row (first original wins).
--   2. Seq normalization: when edits leave live punches out of
--      punch_time order, they are renumbered IN punch_time order into
--      fresh seqs past MAX(seq) over ALL punches — monotone, so it can
--      never collide with a voided punch's kept seq. Voided punches
--      are never renumbered.
--   3. Final-sequence validation: live punches must alternate
--      in/out/in/out (a trailing open in is allowed — that's a
--      still-open day, not an error). Violation aborts the whole edit.
--   4. log_punch_change's UPDATE branch now honors the same
--      suppression GUC as INSERT: the RPC writes one richer audit row
--      per operation itself, and mechanical seq renumbering does not
--      spam the trail. Any punch UPDATE outside the RPCs still logs.
--   5. RLS: "Org admin punches" (FOR ALL) is split into SELECT +
--      INSERT. No client role can UPDATE punches any more — even
--      admins go through the audited RPC. (DELETE has been
--      trigger-blocked since Phase 3.) confirm-import's void/insert
--      moves to service role in the same PR.
--   6. correction_requests gains applied_audit_event_ids so an applied
--      request can point at exactly the audit events that applied it.
--      Approval sets status 'approved'; 'applied' is set only when a
--      change actually lands (frontend in the same PR).
--
-- DEPLOY NOTES (GitHub merges deploy nothing in this repo):
--   * Apply this migration, then deploy confirm-import, then publish
--     the frontend. Until the frontend publishes, the old editor's
--     direct punch UPDATEs fail with a clear RLS error (no silent
--     no-ops; nothing is lost).
--   * Verification probes: supabase/tests/save_punch_edits_probes.sql
-- ============================================================

ALTER TABLE public.correction_requests
  ADD COLUMN IF NOT EXISTS applied_audit_event_ids uuid[];

-- ------------------------------------------------------------
-- 1. The transactional editor.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_punch_edits(
  p_entry_id uuid,
  p_edits jsonb,
  p_reason text,
  p_employee_id uuid DEFAULT NULL,
  p_entry_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry record;
  v_emp record;
  v_op jsonb;
  v_op_kind text;
  v_punch record;
  v_new_time timestamptz;
  v_new_type public.punch_type;
  v_audit_ids uuid[] := '{}';
  v_audit_id uuid;
  v_now timestamptz := now();
  v_applied int := 0;
  v_max_seq int;
  v_bad boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'EDIT_NOT_AUTHENTICATED: sign in first' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'EDIT_REASON_REQUIRED: an edit reason is required' USING ERRCODE = '22023';
  END IF;
  IF p_edits IS NULL OR jsonb_typeof(p_edits) <> 'array' OR jsonb_array_length(p_edits) = 0 THEN
    RAISE EXCEPTION 'EDIT_BAD_INPUT: p_edits must be a non-empty array of operations' USING ERRCODE = '22023';
  END IF;

  -- Resolve (or create) the entry. Admin authorization happens against
  -- the ENTRY''s org in both branches, before any write.
  IF p_entry_id IS NOT NULL THEN
    SELECT * INTO v_entry FROM public.time_entries WHERE id = p_entry_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'EDIT_ENTRY_NOT_FOUND: no time entry %', p_entry_id USING ERRCODE = '22023';
    END IF;
  ELSE
    IF p_employee_id IS NULL OR p_entry_date IS NULL THEN
      RAISE EXCEPTION 'EDIT_MISSING_TARGET: p_employee_id and p_entry_date are required when p_entry_id is null' USING ERRCODE = '22023';
    END IF;
    SELECT e.id, e.org_id, e.user_id INTO v_emp FROM public.employees e WHERE e.id = p_employee_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'EDIT_NO_EMPLOYEE: employee record not found' USING ERRCODE = '22023';
    END IF;
    IF v_emp.user_id IS NULL THEN
      RAISE EXCEPTION 'EDIT_UNLINKED_EMPLOYEE: employee has no linked account' USING ERRCODE = '22023';
    END IF;
    IF NOT public.is_org_admin(v_emp.org_id) THEN
      RAISE EXCEPTION 'EDIT_ADMIN_ONLY: punch edits are manager-only; employees use correction requests' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.time_entries (user_id, org_id, employee_id, entry_date, source)
    VALUES (v_emp.user_id, v_emp.org_id, p_employee_id, p_entry_date, 'manual')
    ON CONFLICT (employee_id, entry_date) DO NOTHING
    RETURNING * INTO v_entry;

    IF v_entry.id IS NULL THEN
      SELECT * INTO v_entry FROM public.time_entries te
       WHERE te.employee_id = p_employee_id AND te.entry_date = p_entry_date;
    END IF;
  END IF;

  -- The authoritative target: the entry row''s employee. All inserted
  -- punches and audit rows carry THIS identity, never the caller''s.
  IF v_entry.employee_id IS NOT NULL THEN
    SELECT e.id, e.org_id, e.user_id INTO v_emp FROM public.employees e WHERE e.id = v_entry.employee_id;
  ELSE
    SELECT e.id, e.org_id, e.user_id INTO v_emp FROM public.employees e WHERE e.user_id = v_entry.user_id LIMIT 1;
  END IF;
  IF v_emp.id IS NULL THEN
    RAISE EXCEPTION 'EDIT_ENTRY_UNLINKED: entry has no resolvable employee' USING ERRCODE = '22023';
  END IF;

  IF NOT public.is_org_admin(v_emp.org_id) THEN
    RAISE EXCEPTION 'EDIT_ADMIN_ONLY: punch edits are manager-only; employees use correction requests' USING ERRCODE = '42501';
  END IF;

  -- Serialize per entry, same as the punch RPC.
  PERFORM 1 FROM public.time_entries WHERE id = v_entry.id FOR UPDATE;

  FOR v_op IN SELECT * FROM jsonb_array_elements(p_edits) LOOP
    v_op_kind := v_op->>'op';

    IF v_op_kind = 'update' THEN
      SELECT * INTO v_punch FROM public.punches
       WHERE id = (v_op->>'id')::uuid AND time_entry_id = v_entry.id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'EDIT_PUNCH_NOT_FOUND: punch % is not on this entry', v_op->>'id' USING ERRCODE = '22023';
      END IF;
      IF v_punch.voided_at IS NOT NULL THEN
        RAISE EXCEPTION 'EDIT_PUNCH_VOIDED: voided punches are immutable' USING ERRCODE = '22023';
      END IF;
      v_new_time := (v_op->>'punch_time')::timestamptz;
      v_new_type := (v_op->>'punch_type')::public.punch_type;
      IF v_new_time IS NULL OR v_new_type IS NULL THEN
        RAISE EXCEPTION 'EDIT_BAD_OP: update needs punch_time and punch_type' USING ERRCODE = '22023';
      END IF;

      PERFORM set_config('purple.punch_audited', '1', true);
      UPDATE public.punches SET
        punch_time = v_new_time,
        punch_type = v_new_type,
        source = COALESCE(NULLIF(v_op->>'source', '')::public.source_type, source),
        is_edited = true,
        original_punch_time = COALESCE(original_punch_time, v_punch.punch_time),
        edited_at = v_now,
        edited_by = auth.uid()
      WHERE id = v_punch.id;
      PERFORM set_config('purple.punch_audited', '0', true);

      INSERT INTO public.audit_events (
        user_id, org_id, employee_id, actor_id, event_type, action_type,
        target_table, target_id, before_json, after_json, reason,
        event_details, related_date, related_entry_id
      ) VALUES (
        v_emp.user_id, v_emp.org_id, v_emp.id, auth.uid(), 'punch_edit', 'update',
        'punches', v_punch.id, to_jsonb(v_punch),
        (SELECT to_jsonb(p) FROM public.punches p WHERE p.id = v_punch.id),
        trim(p_reason),
        jsonb_build_object('target_employee_id', v_emp.id, 'manual_time', true, 'via', 'save_punch_edits'),
        v_entry.entry_date, v_entry.id
      ) RETURNING id INTO v_audit_id;

    ELSIF v_op_kind = 'void' THEN
      SELECT * INTO v_punch FROM public.punches
       WHERE id = (v_op->>'id')::uuid AND time_entry_id = v_entry.id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'EDIT_PUNCH_NOT_FOUND: punch % is not on this entry', v_op->>'id' USING ERRCODE = '22023';
      END IF;
      IF v_punch.voided_at IS NOT NULL THEN
        RAISE EXCEPTION 'EDIT_PUNCH_VOIDED: punch is already voided' USING ERRCODE = '22023';
      END IF;

      PERFORM set_config('purple.punch_audited', '1', true);
      UPDATE public.punches SET
        voided_at = v_now,
        voided_by = auth.uid(),
        void_reason = trim(p_reason)
      WHERE id = v_punch.id;
      PERFORM set_config('purple.punch_audited', '0', true);

      INSERT INTO public.audit_events (
        user_id, org_id, employee_id, actor_id, event_type, action_type,
        target_table, target_id, before_json, after_json, reason,
        event_details, related_date, related_entry_id
      ) VALUES (
        v_emp.user_id, v_emp.org_id, v_emp.id, auth.uid(), 'punch_voided', 'update',
        'punches', v_punch.id, to_jsonb(v_punch),
        (SELECT to_jsonb(p) FROM public.punches p WHERE p.id = v_punch.id),
        trim(p_reason),
        jsonb_build_object('target_employee_id', v_emp.id, 'via', 'save_punch_edits'),
        v_entry.entry_date, v_entry.id
      ) RETURNING id INTO v_audit_id;

    ELSIF v_op_kind = 'insert' THEN
      v_new_time := (v_op->>'punch_time')::timestamptz;
      v_new_type := (v_op->>'punch_type')::public.punch_type;
      IF v_new_time IS NULL OR v_new_type IS NULL THEN
        RAISE EXCEPTION 'EDIT_BAD_OP: insert needs punch_time and punch_type' USING ERRCODE = '22023';
      END IF;

      SELECT COALESCE(MAX(seq), -1) + 1 INTO v_max_seq
        FROM public.punches WHERE time_entry_id = v_entry.id;

      PERFORM set_config('purple.punch_audited', '1', true);
      INSERT INTO public.punches (
        time_entry_id, org_id, employee_id, seq, punch_type, punch_time,
        source, is_edited, original_punch_time, edited_at, edited_by
      ) VALUES (
        v_entry.id, v_emp.org_id, v_emp.id, v_max_seq, v_new_type, v_new_time,
        'manual', true, v_new_time, v_now, auth.uid()
      ) RETURNING * INTO v_punch;
      PERFORM set_config('purple.punch_audited', '0', true);

      INSERT INTO public.audit_events (
        user_id, org_id, employee_id, actor_id, event_type, action_type,
        target_table, target_id, after_json, reason,
        event_details, related_date, related_entry_id
      ) VALUES (
        v_emp.user_id, v_emp.org_id, v_emp.id, auth.uid(), 'punch_added_manually', 'insert',
        'punches', v_punch.id, to_jsonb(v_punch),
        trim(p_reason),
        jsonb_build_object('target_employee_id', v_emp.id, 'manual_time', true, 'via', 'save_punch_edits'),
        v_entry.entry_date, v_entry.id
      ) RETURNING id INTO v_audit_id;

    ELSE
      RAISE EXCEPTION 'EDIT_BAD_OP: unknown op "%"', v_op_kind USING ERRCODE = '22023';
    END IF;

    v_audit_ids := v_audit_ids || v_audit_id;
    v_applied := v_applied + 1;
  END LOOP;

  -- Normalize: when live punches are out of punch_time order, renumber
  -- them in punch_time order into fresh seqs past MAX over ALL punches
  -- (monotone — can never collide with a voided punch''s kept seq).
  IF EXISTS (
    SELECT 1 FROM (
      SELECT punch_time, lag(punch_time) OVER (ORDER BY seq) AS prev_time
        FROM public.punches
       WHERE time_entry_id = v_entry.id AND voided_at IS NULL
    ) x WHERE x.prev_time IS NOT NULL AND x.punch_time < x.prev_time
  ) THEN
    SELECT COALESCE(MAX(seq), -1) INTO v_max_seq
      FROM public.punches WHERE time_entry_id = v_entry.id;

    PERFORM set_config('purple.punch_audited', '1', true);
    UPDATE public.punches p SET seq = v_max_seq + r.rn
      FROM (
        SELECT id, row_number() OVER (ORDER BY punch_time, seq) AS rn
          FROM public.punches
         WHERE time_entry_id = v_entry.id AND voided_at IS NULL
      ) r
     WHERE p.id = r.id;
    PERFORM set_config('purple.punch_audited', '0', true);
  END IF;

  -- Validate the final sequence: live punches alternate in/out. A
  -- trailing open ''in'' is a still-open day, not an error.
  SELECT bool_or(t.bad) INTO v_bad FROM (
    SELECT (punch_type::text <> CASE WHEN row_number() OVER (ORDER BY seq) % 2 = 1 THEN 'in' ELSE 'out' END) AS bad
      FROM public.punches
     WHERE time_entry_id = v_entry.id AND voided_at IS NULL
  ) t;
  IF COALESCE(v_bad, false) THEN
    RAISE EXCEPTION 'EDIT_SEQUENCE_INVALID: punches must alternate in/out — fix the times or types and save again' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'entry_id', v_entry.id,
    'entry_date', v_entry.entry_date,
    'employee_id', v_emp.id,
    'applied_ops', v_applied,
    'audit_event_ids', to_jsonb(v_audit_ids)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_punch_edits(uuid, jsonb, text, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_punch_edits(uuid, jsonb, text, uuid, date) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 2. The punch audit trigger honors the suppression GUC on UPDATE too:
--    the RPCs write one richer, reasoned audit row per operation, and
--    mechanical seq renumbering stays out of the trail. Any punch
--    UPDATE outside the RPCs (service-role import void included, when
--    not suppressed) still logs. INSERT/DELETE branches unchanged.
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
    IF current_setting('purple.punch_audited', true) = '1' THEN
      RETURN NEW;
    END IF;
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

-- ------------------------------------------------------------
-- 3. RLS: no client role can UPDATE punches any more. Admin reads
--    stay; admin INSERT stays (DB-audited by the INSERT trigger and
--    still used by nothing after this PR routes the import through
--    service role — kept deliberately conservative; revisit in the
--    staging checklist if it should go too).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Org admin punches" ON public.punches;

CREATE POLICY "Org admin punches select"
  ON public.punches FOR SELECT
  USING (public.is_org_admin(org_id));

CREATE POLICY "Org admin punches insert"
  ON public.punches FOR INSERT
  WITH CHECK (public.is_org_admin(org_id));
