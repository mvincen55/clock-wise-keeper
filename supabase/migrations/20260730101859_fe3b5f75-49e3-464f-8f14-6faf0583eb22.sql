REVOKE EXECUTE ON FUNCTION public.my_department() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_view_team_goal(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.bump_team_goal(uuid, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.my_department() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_team_goal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bump_team_goal(uuid, integer) TO authenticated;