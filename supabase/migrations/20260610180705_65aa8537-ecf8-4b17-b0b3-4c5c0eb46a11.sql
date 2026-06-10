
REVOKE EXECUTE ON FUNCTION public.trigger_recompute_from_schedule_version() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_recompute_from_schedule_weekday() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_recompute_from_schedule_assignment() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public._recompute_schedule_window(uuid,date,date) FROM anon, authenticated, PUBLIC;
