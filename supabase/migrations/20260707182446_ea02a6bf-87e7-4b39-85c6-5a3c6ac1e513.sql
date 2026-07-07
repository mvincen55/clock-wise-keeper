
-- ============================================================
-- PHASE 3: RLS LOCKDOWN
-- ============================================================

-- ---------- time_entries ----------
DROP POLICY IF EXISTS "Own time_entries" ON public.time_entries;

CREATE POLICY "Employees select own time_entries"
  ON public.time_entries FOR SELECT
  USING (auth.uid() = user_id OR public.is_org_admin(org_id));

CREATE POLICY "Employees insert own time_entries"
  ON public.time_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);
-- "Org admin time_entries" ALL policy already exists → admins retain UPDATE/DELETE

-- ---------- punches ----------
DROP POLICY IF EXISTS "Own punches" ON public.punches;

-- Admin ALL is not present on punches today; add it.
CREATE POLICY "Org admin punches"
  ON public.punches FOR ALL
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

CREATE POLICY "Employees select own punches"
  ON public.punches FOR SELECT
  USING (public.can_access_employee(employee_id));

CREATE POLICY "Employees insert own punches"
  ON public.punches FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND e.user_id = auth.uid())
  );

-- ---------- tardies ----------
DROP POLICY IF EXISTS "Own tardies" ON public.tardies;

CREATE POLICY "Employees select own tardies"
  ON public.tardies FOR SELECT
  USING (auth.uid() = user_id OR public.is_org_admin(org_id));

CREATE POLICY "Employees insert own tardies"
  ON public.tardies FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ---------- attendance_day_status ----------
DROP POLICY IF EXISTS "Own attendance_day_status" ON public.attendance_day_status;

CREATE POLICY "Employees select own attendance_day_status"
  ON public.attendance_day_status FOR SELECT
  USING (auth.uid() = user_id OR public.is_org_admin(org_id));

CREATE POLICY "Employees insert own attendance_day_status"
  ON public.attendance_day_status FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ---------- attendance_exceptions ----------
DROP POLICY IF EXISTS "Own attendance_exceptions" ON public.attendance_exceptions;

CREATE POLICY "Employees select own attendance_exceptions"
  ON public.attendance_exceptions FOR SELECT
  USING (auth.uid() = user_id OR public.is_org_admin(org_id));

CREATE POLICY "Employees insert own attendance_exceptions"
  ON public.attendance_exceptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ---------- days_off ----------
DROP POLICY IF EXISTS "Own days_off" ON public.days_off;

CREATE POLICY "Employees select own days_off"
  ON public.days_off FOR SELECT
  USING (auth.uid() = user_id OR public.is_org_admin(org_id));

CREATE POLICY "Employees insert own days_off"
  ON public.days_off FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ---------- audit_events ----------
DROP POLICY IF EXISTS "Own audit_events" ON public.audit_events;

CREATE POLICY "Org members insert audit_events"
  ON public.audit_events FOR INSERT
  WITH CHECK (
    public.is_org_member(org_id)
    AND (actor_id IS NULL OR actor_id = auth.uid())
  );

CREATE POLICY "Employees select own audit_events"
  ON public.audit_events FOR SELECT
  USING (auth.uid() = user_id OR public.is_org_admin(org_id));

-- No UPDATE / DELETE policies for audit_events; admin ALL policy already exists.

-- ---------- notifications: tighten INSERT ----------
DROP POLICY IF EXISTS "Org members insert notifications" ON public.notifications;

CREATE POLICY "Restricted notification inserts"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_org_member(org_id)
    AND (
      -- Admins can notify anyone in the org
      public.is_org_admin(org_id)
      -- Non-admins can only address notifications to org admins
      OR EXISTS (
        SELECT 1 FROM public.org_members om
        WHERE om.org_id = notifications.org_id
          AND om.user_id = notifications.recipient_user_id
          AND om.status = 'active'
          AND om.role IN ('owner', 'manager')
      )
    )
  );

-- ============================================================
-- AUDIT PUNCH CHANGES AT THE DB LAYER
-- ============================================================

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
  IF TG_OP = 'UPDATE' THEN
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
AFTER UPDATE OR DELETE ON public.punches
FOR EACH ROW EXECUTE FUNCTION public.log_punch_change();

-- ============================================================
-- EXTEND PUNCH RECOMPUTE TO OWN time_entries.total_minutes
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_recompute_from_punch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_date date;
  v_user_id uuid;
  v_entry_id uuid;
  v_total_min int;
BEGIN
  IF TG_OP = 'DELETE' THEN v_entry_id := OLD.time_entry_id;
  ELSE v_entry_id := NEW.time_entry_id;
  END IF;

  SELECT te.entry_date, te.user_id INTO v_entry_date, v_user_id
    FROM public.time_entries te WHERE te.id = v_entry_id;

  -- Recompute total_minutes from paired in/out sequence
  IF v_entry_id IS NOT NULL THEN
    WITH ordered AS (
      SELECT punch_type, punch_time,
             row_number() OVER (ORDER BY seq, punch_time) AS rn
        FROM public.punches
       WHERE time_entry_id = v_entry_id
    ),
    paired AS (
      SELECT a.punch_time AS in_time, b.punch_time AS out_time
        FROM ordered a
        JOIN ordered b ON b.rn = a.rn + 1
       WHERE a.punch_type = 'in' AND b.punch_type = 'out' AND a.rn % 2 = 1
    )
    SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (out_time - in_time)) / 60)::int, 0)
      INTO v_total_min FROM paired;

    UPDATE public.time_entries
       SET total_minutes = v_total_min
     WHERE id = v_entry_id;
  END IF;

  IF v_entry_date IS NOT NULL AND v_user_id IS NOT NULL THEN
    PERFORM public.recompute_attendance_range(v_user_id, v_entry_date, v_entry_date);
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

-- ============================================================
-- PHASE 4: UNIQUE INDEXES
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS time_entries_employee_date_uidx
  ON public.time_entries(employee_id, entry_date);

CREATE UNIQUE INDEX IF NOT EXISTS payroll_summaries_org_range_uidx
  ON public.payroll_summaries(org_id, range_start, range_end);
