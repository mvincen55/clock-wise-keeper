ALTER TABLE public.org_invites
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS initial_pto_hours numeric,
  ADD COLUMN IF NOT EXISTS weekly_schedule jsonb NOT NULL DEFAULT '[]'::jsonb;

DROP POLICY IF EXISTS "Org admins manage invites" ON public.org_invites;
CREATE POLICY "Org admins manage invites"
  ON public.org_invites
  FOR ALL
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_invites TO authenticated;
GRANT ALL ON public.org_invites TO service_role;