
-- ═══════════════════════════════════════════════════
-- PHASE 3: RLS OVERHAUL — Org-membership-based gates
-- ═══════════════════════════════════════════════════

-- 1. Security definer helper: is user a member of this org (optionally with specific roles)?
CREATE OR REPLACE FUNCTION public.is_org_member(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = _org_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$;

-- 2. Security definer helper: is user a manager or owner of this org?
CREATE OR REPLACE FUNCTION public.is_org_admin(_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = _org_id
      AND user_id = auth.uid()
      AND status = 'active'
      AND role IN ('owner', 'manager')
  );
$$;

-- 3. Security definer helper: can the current user access this employee?
--    True if: user IS the employee, OR user is manager/owner of the employee's org
CREATE OR REPLACE FUNCTION public.can_access_employee(_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = _employee_id
      AND (
        e.user_id = auth.uid()
        OR public.is_org_admin(e.org_id)
      )
  );
$$;

-- ═══════════════════════════════════════════════════
-- DROP OLD POLICIES & CREATE NEW ONES
-- ═══════════════════════════════════════════════════

-- === TIME_ENTRIES ===
DROP POLICY IF EXISTS "Users manage own time_entries" ON public.time_entries;

CREATE POLICY "Own time_entries" ON public.time_entries
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Org admin time_entries" ON public.time_entries
  FOR ALL USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

-- === PUNCHES ===
DROP POLICY IF EXISTS "Users manage own punches" ON public.punches;

CREATE POLICY "Own punches" ON public.punches
  FOR ALL USING (public.can_access_employee(employee_id))
  WITH CHECK (public.can_access_employee(employee_id));

-- === ATTENDANCE_DAY_STATUS ===
DROP POLICY IF EXISTS "Users manage own attendance_day_status" ON public.attendance_day_status;

CREATE POLICY "Own attendance_day_status" ON public.attendance_day_status
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Org admin attendance_day_status" ON public.attendance_day_status
  FOR ALL USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

-- === DAYS_OFF ===
DROP POLICY IF EXISTS "Users manage own days_off" ON public.days_off;

CREATE POLICY "Own days_off" ON public.days_off
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Org admin days_off" ON public.days_off
  FOR ALL USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

-- === OFFICE_CLOSURES ===
DROP POLICY IF EXISTS "Users manage own office_closures" ON public.office_closures;

CREATE POLICY "Own office_closures" ON public.office_closures
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Org admin office_closures" ON public.office_closures
  FOR ALL USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

-- === TARDIES ===
DROP POLICY IF EXISTS "Users manage own tardies" ON public.tardies;

CREATE POLICY "Own tardies" ON public.tardies
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Org admin tardies" ON public.tardies
  FOR ALL USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

-- === ATTENDANCE_EXCEPTIONS ===
DROP POLICY IF EXISTS "Users manage own attendance_exceptions" ON public.attendance_exceptions;

CREATE POLICY "Own attendance_exceptions" ON public.attendance_exceptions
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Org admin attendance_exceptions" ON public.attendance_exceptions
  FOR ALL USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

-- === AUDIT_EVENTS ===
DROP POLICY IF EXISTS "Users manage own audit_events" ON public.audit_events;

CREATE POLICY "Own audit_events" ON public.audit_events
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Org admin audit_events" ON public.audit_events
  FOR ALL USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

-- === SCHEDULE_VERSIONS ===
DROP POLICY IF EXISTS "Users manage own schedule_versions" ON public.schedule_versions;

CREATE POLICY "Own schedule_versions" ON public.schedule_versions
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Org admin schedule_versions" ON public.schedule_versions
  FOR ALL USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

-- === SCHEDULE_WEEKDAYS (via schedule_version ownership) ===
DROP POLICY IF EXISTS "Users manage own schedule_weekdays" ON public.schedule_weekdays;

CREATE POLICY "Own schedule_weekdays" ON public.schedule_weekdays
  FOR ALL USING (user_owns_schedule_version(schedule_version_id))
  WITH CHECK (user_owns_schedule_version(schedule_version_id));

CREATE POLICY "Org admin schedule_weekdays" ON public.schedule_weekdays
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.schedule_versions sv
      WHERE sv.id = schedule_version_id
        AND public.is_org_admin(sv.org_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.schedule_versions sv
      WHERE sv.id = schedule_version_id
        AND public.is_org_admin(sv.org_id)
    )
  );

-- === WORK_ZONES ===
DROP POLICY IF EXISTS "Users manage own work_zones" ON public.work_zones;

CREATE POLICY "Own work_zones" ON public.work_zones
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Org admin work_zones" ON public.work_zones
  FOR ALL USING (org_id IS NOT NULL AND public.is_org_admin(org_id))
  WITH CHECK (org_id IS NOT NULL AND public.is_org_admin(org_id));

-- === LOCATION_EVENTS ===
DROP POLICY IF EXISTS "Users manage own location_events" ON public.location_events;

CREATE POLICY "Own location_events" ON public.location_events
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Org admin location_events" ON public.location_events
  FOR ALL USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

-- === IMPORTS ===
DROP POLICY IF EXISTS "Users manage own imports" ON public.imports;

CREATE POLICY "Own imports" ON public.imports
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Org admin imports" ON public.imports
  FOR ALL USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

-- === IMPORT_ROWS (via import ownership) ===
DROP POLICY IF EXISTS "Users manage own import_rows" ON public.import_rows;

CREATE POLICY "Own import_rows" ON public.import_rows
  FOR ALL USING (user_owns_import(import_id))
  WITH CHECK (user_owns_import(import_id));

CREATE POLICY "Org admin import_rows" ON public.import_rows
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.imports i
      WHERE i.id = import_id
        AND public.is_org_admin(i.org_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.imports i
      WHERE i.id = import_id
        AND public.is_org_admin(i.org_id)
    )
  );

-- === PAYROLL_SETTINGS ===
DROP POLICY IF EXISTS "Users manage own payroll_settings" ON public.payroll_settings;

CREATE POLICY "Own payroll_settings" ON public.payroll_settings
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Org admin payroll_settings" ON public.payroll_settings
  FOR ALL USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

-- === PAYROLL_SUMMARIES ===
DROP POLICY IF EXISTS "Users manage own payroll_summaries" ON public.payroll_summaries;

CREATE POLICY "Own payroll_summaries" ON public.payroll_summaries
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Org admin payroll_summaries" ON public.payroll_summaries
  FOR ALL USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

-- === PTO_SETTINGS ===
DROP POLICY IF EXISTS "Users manage own pto_settings" ON public.pto_settings;

CREATE POLICY "Own pto_settings" ON public.pto_settings
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Org admin pto_settings" ON public.pto_settings
  FOR ALL USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

-- === PTO_LEDGER_WEEKS ===
DROP POLICY IF EXISTS "Users manage own pto_ledger_weeks" ON public.pto_ledger_weeks;

CREATE POLICY "Own pto_ledger_weeks" ON public.pto_ledger_weeks
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Org admin pto_ledger_weeks" ON public.pto_ledger_weeks
  FOR ALL USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

-- === PTO_SNAPSHOTS ===
DROP POLICY IF EXISTS "Users manage own pto_snapshots" ON public.pto_snapshots;

CREATE POLICY "Own pto_snapshots" ON public.pto_snapshots
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Org admin pto_snapshots" ON public.pto_snapshots
  FOR ALL USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

-- === WORK_SCHEDULE (legacy) ===
DROP POLICY IF EXISTS "Users manage own work_schedule" ON public.work_schedule;

CREATE POLICY "Own work_schedule" ON public.work_schedule
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- === SCHEDULE_ASSIGNMENTS ===
-- Already has org_creator policy from Phase 1, keep it

-- === CHANGE_REQUESTS ===
-- Already has proper policies from Phase 1, keep them

-- === REPORT_RUNS ===
-- Already has proper policies from Phase 1, keep them
