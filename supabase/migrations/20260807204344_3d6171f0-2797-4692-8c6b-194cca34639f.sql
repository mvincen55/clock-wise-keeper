REVOKE ALL ON FUNCTION public.claim_team_moments(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_team_moments(uuid, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.open_team_moments(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_team_moments(uuid[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.cleanup_team_moments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_team_moments() TO service_role;