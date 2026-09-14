CREATE TABLE public.employee_checklist_settings (
 employee_id uuid PRIMARY KEY REFERENCES public.employees(id),
 org_id uuid NOT NULL REFERENCES public.orgs(id),
 bypass_required boolean NOT NULL DEFAULT true,
 updated_by uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.employee_checklist_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY checklist_setting_read ON public.employee_checklist_settings FOR SELECT TO authenticated
 USING(public.is_org_admin(org_id) OR EXISTS(SELECT 1 FROM public.employees e WHERE e.id=employee_id AND e.org_id=employee_checklist_settings.org_id AND e.user_id=auth.uid()));
REVOKE ALL ON public.employee_checklist_settings FROM anon,authenticated;
GRANT SELECT ON public.employee_checklist_settings TO authenticated;
GRANT ALL ON public.employee_checklist_settings TO service_role;

CREATE FUNCTION public.set_employee_checklist_requirement(p_employee_id uuid,p_required boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE e public.employees%ROWTYPE;
BEGIN
 SELECT * INTO e FROM public.employees WHERE id=p_employee_id;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_org_admin(e.org_id) THEN
  RAISE EXCEPTION 'Only an active owner or manager can change checklist requirements' USING ERRCODE='42501';
 END IF;
 IF p_required IS NULL THEN RAISE EXCEPTION 'Choose whether checklist bypass is required'; END IF;
 INSERT INTO public.employee_checklist_settings(employee_id,org_id,bypass_required,updated_by)
 VALUES(e.id,e.org_id,p_required,auth.uid())
 ON CONFLICT(employee_id) DO UPDATE SET bypass_required=excluded.bypass_required,updated_by=excluded.updated_by,updated_at=now();
END $$;
REVOKE ALL ON FUNCTION public.set_employee_checklist_requirement(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_employee_checklist_requirement(uuid,boolean) TO authenticated,service_role;

-- Enforce exemptions even for a stale browser or the service-role edge endpoint.
-- The endpoint returns before notifying anyone when an insert is rejected.
CREATE FUNCTION public.enforce_employee_checklist_requirement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.employee_checklist_settings s WHERE s.employee_id=NEW.employee_id AND s.org_id=NEW.org_id AND NOT s.bypass_required) THEN
  RAISE EXCEPTION 'Checklist bypass is not required for this employee' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER employee_checklist_requirement BEFORE INSERT ON public.checklist_bypasses
 FOR EACH ROW EXECUTE FUNCTION public.enforce_employee_checklist_requirement();
