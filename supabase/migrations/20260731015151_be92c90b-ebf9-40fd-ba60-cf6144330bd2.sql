-- Column-level access: hide `answers` (transcripts) from direct table reads
REVOKE SELECT ON public.training_attempts FROM authenticated;
GRANT SELECT (id, org_id, module_id, user_id, score, passed, completed_at, type)
  ON public.training_attempts TO authenticated;
GRANT ALL ON public.training_attempts TO service_role;

-- Admins may read attempt metadata for their org (transcripts blocked by column grants)
DROP POLICY IF EXISTS "Org admins read attempt metadata" ON public.training_attempts;
CREATE POLICY "Org admins read attempt metadata"
ON public.training_attempts
FOR SELECT
TO authenticated
USING (public.is_org_admin(org_id));

-- The view no longer needs SECURITY DEFINER semantics
ALTER VIEW public.training_attempt_summary SET (security_invoker = on);