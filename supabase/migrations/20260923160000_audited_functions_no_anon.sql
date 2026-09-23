-- The four functions added by 20260922150000 (seal_close_day,
-- reverse_pto_approval, withdraw_knowledge_approval) and 20260922160000
-- (set_org_pto_policy) revoke EXECUTE from PUBLIC and grant it to
-- authenticated. Supabase's default privileges had already granted EXECUTE
-- on each new function to anon, authenticated, and service_role the moment it
-- was created, and REVOKE ... FROM PUBLIC leaves an explicit grant alone, so
-- anon kept EXECUTE. Every one of these functions rejects a call with no
-- signed-in user before it touches anything, so nothing was reachable; this
-- makes the grant say what the guard already enforces. service_role keeps
-- EXECUTE.
REVOKE EXECUTE ON FUNCTION public.seal_close_day(uuid, boolean, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reverse_pto_approval(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.withdraw_knowledge_approval(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_org_pto_policy(uuid, numeric, numeric, boolean) FROM anon;
