
-- 1) Remove public SELECT on org_invites; lookup will go through accept-invite edge function (service role)
DROP POLICY IF EXISTS "Anyone can read invite by token" ON public.org_invites;

-- 2) Lock down SECURITY DEFINER functions that should not be directly callable by clients
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_recompute_from_closure() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_recompute_from_days_off() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_recompute_from_punch() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_recompute_from_tardy() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_recompute_from_time_entry() FROM anon, authenticated, PUBLIC;

-- recompute_attendance_range is invoked by authenticated clients; revoke anon only
REVOKE EXECUTE ON FUNCTION public.recompute_attendance_range(uuid, date, date) FROM anon, PUBLIC;
