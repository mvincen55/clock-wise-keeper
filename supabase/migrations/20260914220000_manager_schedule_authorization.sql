-- The RPC's explicit is_org_admin(employee.org_id) check authorizes managers.
-- Invoker SELECT FOR UPDATE additionally required an employee UPDATE policy,
-- which only the original org creator had. Keep general employee edits scoped
-- as before and elevate only this authorized, transactional schedule operation.
ALTER FUNCTION public.create_employee_schedule(uuid,date,date,text,boolean,jsonb) SECURITY DEFINER;
ALTER FUNCTION public.create_employee_schedule(uuid,date,date,text,boolean,jsonb) SET search_path=public,pg_catalog;

-- In-place corrections also update assignments directly. Validate every
-- referenced object belongs to the office the acting manager administers.
CREATE POLICY "Office admins manage schedule assignments" ON public.schedule_assignments
 FOR ALL TO authenticated USING(public.is_org_admin(org_id))
 WITH CHECK(public.is_org_admin(org_id)
  AND EXISTS(SELECT 1 FROM public.employees e WHERE e.id=employee_id AND e.org_id=schedule_assignments.org_id)
  AND EXISTS(SELECT 1 FROM public.schedule_versions s WHERE s.id=schedule_version_id AND s.org_id=schedule_assignments.org_id));
