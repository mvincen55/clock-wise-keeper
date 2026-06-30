
-- 1) Lock down SECURITY DEFINER functions: revoke from PUBLIC/anon, grant only to roles that need them.
-- Helpers used in RLS policies must remain executable by authenticated.

REVOKE EXECUTE ON FUNCTION public.is_allowed_user() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_org_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_employee(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_owns_import(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_owns_schedule_version(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_owns_time_entry(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_timezone(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_employee_timezone(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_local_punch_time(timestamptz, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_schedule_for_date(uuid, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recompute_attendance_range(uuid, date, date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_allowed_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_employee(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_import(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_schedule_version(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_time_entry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_timezone(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_employee_timezone(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_local_punch_time(timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_schedule_for_date(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_attendance_range(uuid, date, date) TO authenticated;

-- 2) Drop the stale backup table containing sensitive attendance data.
DROP TABLE IF EXISTS public.attendance_day_status_backup_pre_schedule_fix;

-- 3) Allow employees to read their own schedule assignments.
CREATE POLICY "Employees can read own assignments"
ON public.schedule_assignments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = schedule_assignments.employee_id
      AND e.user_id = auth.uid()
  )
  OR public.is_org_admin(schedule_assignments.org_id)
);

-- 4) Add UPDATE policy on imports storage bucket scoped to owning user.
CREATE POLICY "Users update own imports"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'imports' AND (auth.uid())::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'imports' AND (auth.uid())::text = (storage.foldername(name))[1]
);
