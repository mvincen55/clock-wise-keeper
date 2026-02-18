
-- ═══════════════════════════════════════════════════
-- PHASE 2: Add org columns, backfill with USER triggers disabled
-- ═══════════════════════════════════════════════════

-- Step 1: Add nullable columns
ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.orgs(id),
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS created_by uuid;

ALTER TABLE public.punches ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.orgs(id),
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS created_by uuid;

ALTER TABLE public.attendance_day_status ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.orgs(id),
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id);

ALTER TABLE public.days_off ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.orgs(id),
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS created_by uuid;

ALTER TABLE public.office_closures ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.orgs(id),
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS created_by uuid;

ALTER TABLE public.tardies ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.orgs(id),
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id);

ALTER TABLE public.schedule_versions ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.orgs(id),
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id);

ALTER TABLE public.work_zones ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.orgs(id);

ALTER TABLE public.location_events ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.orgs(id),
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id);

ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.orgs(id);

ALTER TABLE public.audit_events ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.orgs(id),
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS actor_id uuid;

ALTER TABLE public.pto_settings ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.orgs(id),
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id);

ALTER TABLE public.pto_ledger_weeks ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.orgs(id),
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id);

ALTER TABLE public.pto_snapshots ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.orgs(id),
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id);

ALTER TABLE public.attendance_exceptions ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.orgs(id),
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id);

ALTER TABLE public.payroll_settings ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.orgs(id);

ALTER TABLE public.payroll_summaries ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.orgs(id),
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id);

-- Step 2: Disable USER triggers only
ALTER TABLE public.time_entries DISABLE TRIGGER USER;
ALTER TABLE public.punches DISABLE TRIGGER USER;
ALTER TABLE public.days_off DISABLE TRIGGER USER;
ALTER TABLE public.office_closures DISABLE TRIGGER USER;
ALTER TABLE public.tardies DISABLE TRIGGER USER;
ALTER TABLE public.attendance_day_status DISABLE TRIGGER USER;

-- Step 3: Create org, employee, backfill
DO $$
DECLARE
  v_user_id uuid := '44071dab-e03a-49bb-9d8d-c9bd8e4c3f75';
  v_org_id uuid;
  v_emp_id uuid;
BEGIN
  INSERT INTO public.orgs (name, created_by) VALUES ('My Organization', v_user_id)
  RETURNING id INTO v_org_id;
  
  INSERT INTO public.org_members (org_id, user_id, role, status)
  VALUES (v_org_id, v_user_id, 'owner', 'active');
  
  INSERT INTO public.employees (org_id, user_id, display_name, email, employment_status, hire_date, timezone)
  VALUES (v_org_id, v_user_id, 'Megan Vincent', 'meganvincent43@gmail.com', 'active',
    COALESCE((SELECT hire_date FROM public.pto_settings WHERE user_id = v_user_id LIMIT 1), '2022-02-07'),
    COALESCE((SELECT timezone FROM public.pto_settings WHERE user_id = v_user_id LIMIT 1), 'America/New_York'))
  RETURNING id INTO v_emp_id;

  UPDATE public.time_entries SET org_id = v_org_id, employee_id = v_emp_id, created_by = user_id WHERE org_id IS NULL;
  UPDATE public.punches SET org_id = v_org_id, employee_id = v_emp_id, created_by = COALESCE(edited_by, (SELECT te.user_id FROM public.time_entries te WHERE te.id = punches.time_entry_id LIMIT 1)) WHERE org_id IS NULL;
  UPDATE public.attendance_day_status SET org_id = v_org_id, employee_id = v_emp_id WHERE org_id IS NULL;
  UPDATE public.days_off SET org_id = v_org_id, employee_id = v_emp_id, created_by = user_id WHERE org_id IS NULL;
  UPDATE public.office_closures SET org_id = v_org_id, employee_id = v_emp_id, created_by = user_id WHERE org_id IS NULL;
  UPDATE public.tardies SET org_id = v_org_id, employee_id = v_emp_id WHERE org_id IS NULL;
  UPDATE public.schedule_versions SET org_id = v_org_id, employee_id = v_emp_id WHERE org_id IS NULL;
  UPDATE public.work_zones SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.location_events SET org_id = v_org_id, employee_id = v_emp_id WHERE org_id IS NULL;
  UPDATE public.imports SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.audit_events SET org_id = v_org_id, employee_id = v_emp_id, actor_id = user_id WHERE org_id IS NULL;
  UPDATE public.pto_settings SET org_id = v_org_id, employee_id = v_emp_id WHERE org_id IS NULL;
  UPDATE public.pto_ledger_weeks SET org_id = v_org_id, employee_id = v_emp_id WHERE org_id IS NULL;
  UPDATE public.pto_snapshots SET org_id = v_org_id, employee_id = v_emp_id WHERE org_id IS NULL;
  UPDATE public.attendance_exceptions SET org_id = v_org_id, employee_id = v_emp_id WHERE org_id IS NULL;
  UPDATE public.payroll_settings SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.payroll_summaries SET org_id = v_org_id, employee_id = v_emp_id WHERE org_id IS NULL;
END $$;

-- Step 4: Re-enable triggers
ALTER TABLE public.time_entries ENABLE TRIGGER USER;
ALTER TABLE public.punches ENABLE TRIGGER USER;
ALTER TABLE public.days_off ENABLE TRIGGER USER;
ALTER TABLE public.office_closures ENABLE TRIGGER USER;
ALTER TABLE public.tardies ENABLE TRIGGER USER;
ALTER TABLE public.attendance_day_status ENABLE TRIGGER USER;

-- Step 5: Make NOT NULL
ALTER TABLE public.time_entries ALTER COLUMN org_id SET NOT NULL, ALTER COLUMN employee_id SET NOT NULL;
ALTER TABLE public.punches ALTER COLUMN org_id SET NOT NULL, ALTER COLUMN employee_id SET NOT NULL;
ALTER TABLE public.attendance_day_status ALTER COLUMN org_id SET NOT NULL, ALTER COLUMN employee_id SET NOT NULL;
ALTER TABLE public.days_off ALTER COLUMN org_id SET NOT NULL, ALTER COLUMN employee_id SET NOT NULL;
ALTER TABLE public.office_closures ALTER COLUMN org_id SET NOT NULL, ALTER COLUMN employee_id SET NOT NULL;
ALTER TABLE public.tardies ALTER COLUMN org_id SET NOT NULL, ALTER COLUMN employee_id SET NOT NULL;
ALTER TABLE public.schedule_versions ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.location_events ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.imports ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.audit_events ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.pto_settings ALTER COLUMN org_id SET NOT NULL, ALTER COLUMN employee_id SET NOT NULL;
ALTER TABLE public.pto_ledger_weeks ALTER COLUMN org_id SET NOT NULL, ALTER COLUMN employee_id SET NOT NULL;
ALTER TABLE public.pto_snapshots ALTER COLUMN org_id SET NOT NULL, ALTER COLUMN employee_id SET NOT NULL;
ALTER TABLE public.attendance_exceptions ALTER COLUMN org_id SET NOT NULL, ALTER COLUMN employee_id SET NOT NULL;
ALTER TABLE public.payroll_settings ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.payroll_summaries ALTER COLUMN org_id SET NOT NULL;

-- Step 6: Indexes
CREATE INDEX IF NOT EXISTS idx_time_entries_org_emp ON public.time_entries(org_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_punches_org_emp ON public.punches(org_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_status_org_emp ON public.attendance_day_status(org_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_days_off_org_emp ON public.days_off(org_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_tardies_org_emp ON public.tardies(org_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_org ON public.audit_events(org_id);
CREATE INDEX IF NOT EXISTS idx_employees_org ON public.employees(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.org_members(org_id);
