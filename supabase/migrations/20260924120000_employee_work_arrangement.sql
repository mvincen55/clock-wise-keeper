-- Some people on the roster never punch a clock or accrue PTO: the office's
-- doctors, added to Team with their schedule codes (DR05) so the posted
-- schedule reads against them. Until now every active employee was assumed
-- to clock in — a doctor with a work schedule and no punches read as absent
-- on People, the arrivals trend, and the Reports missing-day list.
--
-- Two roster flags, both default true, both set only by an owner or manager
-- through set_employee_work_arrangement (audited). Attendance, missing-time,
-- payroll readiness, the Team snapshot and the Reports Analyst leave a
-- non-clocking person out the same way they leave owners out; PTO surfaces
-- hide for someone who does not accrue it. Nothing is deleted when a flag
-- flips: history stays, only what the office is held to changes.
--
-- Also: a treating provider whose schedule code matches exactly one active
-- team member's staff code IS that team member, so the registry link is made
-- automatically (on either side changing, and once now for existing rows)
-- instead of asking the office to pick the same person twice.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS clocks_in boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pto_eligible boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.employees.clocks_in IS 'False for a team member who is on the schedule but never punches (a doctor): left out of attendance, missing-time and payroll checks.';
COMMENT ON COLUMN public.employees.pto_eligible IS 'False for a team member who does not accrue PTO: balances, accrual and requests do not apply to them.';

CREATE OR REPLACE FUNCTION public.set_employee_work_arrangement(p_employee_id uuid, p_clocks_in boolean, p_pto_eligible boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  e public.employees%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO e FROM public.employees WHERE id = p_employee_id;
  IF NOT FOUND OR v_uid IS NULL OR NOT public.is_org_admin(e.org_id) THEN
    RAISE EXCEPTION 'Only an active owner or manager can change how a team member is tracked' USING ERRCODE = '42501';
  END IF;
  IF p_clocks_in IS NULL OR p_pto_eligible IS NULL THEN
    RAISE EXCEPTION 'Choose whether this person uses the time clock and accrues PTO' USING ERRCODE = '22023';
  END IF;
  IF e.clocks_in = p_clocks_in AND e.pto_eligible = p_pto_eligible THEN
    RETURN jsonb_build_object('id', e.id, 'clocks_in', e.clocks_in, 'pto_eligible', e.pto_eligible);
  END IF;
  UPDATE public.employees SET clocks_in = p_clocks_in, pto_eligible = p_pto_eligible WHERE id = e.id;
  INSERT INTO public.audit_events (user_id, org_id, employee_id, actor_id, event_type, action_type, target_table, target_id, before_json, after_json, event_details)
  VALUES (v_uid, e.org_id, e.id, v_uid, 'employee_work_arrangement_updated', 'update', 'employees', e.id,
          jsonb_build_object('clocks_in', e.clocks_in, 'pto_eligible', e.pto_eligible),
          jsonb_build_object('clocks_in', p_clocks_in, 'pto_eligible', p_pto_eligible),
          jsonb_build_object('target_employee_id', e.id));
  RETURN jsonb_build_object('id', e.id, 'clocks_in', p_clocks_in, 'pto_eligible', p_pto_eligible);
END $$;
REVOKE ALL ON FUNCTION public.set_employee_work_arrangement(uuid, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_employee_work_arrangement(uuid, boolean, boolean) TO authenticated, service_role;

-- The one active team member whose staff code is this schedule code, or null
-- when there is none or more than one (a shared code names nobody).
CREATE OR REPLACE FUNCTION public.employee_for_schedule_code(p_org_id uuid, p_code text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_ids uuid[];
BEGIN
  IF p_org_id IS NULL OR nullif(btrim(coalesce(p_code, '')), '') IS NULL THEN RETURN NULL; END IF;
  SELECT array_agg(id) INTO v_ids FROM public.employees
   WHERE org_id = p_org_id AND employment_status = 'active' AND upper(btrim(tag)) = upper(btrim(p_code));
  IF coalesce(array_length(v_ids, 1), 0) = 1 THEN RETURN v_ids[1]; END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.employee_for_schedule_code(uuid, text) FROM PUBLIC, anon, authenticated;

-- A provider given a schedule code links to the team member wearing it. An
-- explicit "Not linked" without a code change is respected until the code or
-- the staff code moves.
CREATE OR REPLACE FUNCTION public.link_provider_by_schedule_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF NEW.employee_id IS NULL AND NEW.schedule_code IS NOT NULL THEN
    NEW.employee_id := public.employee_for_schedule_code(NEW.org_id, NEW.schedule_code);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.link_provider_by_schedule_code() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS org_providers_link_by_schedule_code ON public.org_providers;
CREATE TRIGGER org_providers_link_by_schedule_code
  BEFORE INSERT OR UPDATE OF schedule_code ON public.org_providers
  FOR EACH ROW EXECUTE FUNCTION public.link_provider_by_schedule_code();

-- A team member given a staff code (or restored to active) claims the unlinked
-- provider carrying that code.
CREATE OR REPLACE FUNCTION public.link_providers_to_employee_tag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF NEW.tag IS NULL OR NEW.employment_status <> 'active' THEN RETURN NEW; END IF;
  UPDATE public.org_providers p
     SET employee_id = NEW.id
   WHERE p.org_id = NEW.org_id AND p.employee_id IS NULL AND p.schedule_code IS NOT NULL
     AND p.schedule_code = upper(btrim(NEW.tag))
     AND public.employee_for_schedule_code(NEW.org_id, p.schedule_code) = NEW.id;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.link_providers_to_employee_tag() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS employees_link_providers_by_tag ON public.employees;
CREATE TRIGGER employees_link_providers_by_tag
  AFTER INSERT OR UPDATE OF tag, employment_status ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.link_providers_to_employee_tag();

-- Once, for the rows already here: every unlinked provider whose code names
-- exactly one active team member.
UPDATE public.org_providers p
   SET employee_id = public.employee_for_schedule_code(p.org_id, p.schedule_code)
 WHERE p.employee_id IS NULL AND p.schedule_code IS NOT NULL
   AND public.employee_for_schedule_code(p.org_id, p.schedule_code) IS NOT NULL;
