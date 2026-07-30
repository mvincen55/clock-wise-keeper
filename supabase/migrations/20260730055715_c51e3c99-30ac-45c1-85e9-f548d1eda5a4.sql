REVOKE EXECUTE ON FUNCTION public.can_view_goal(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.owns_goal(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_goal(uuid) FROM anon;