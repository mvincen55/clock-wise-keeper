CREATE POLICY "Org members can read org"
ON public.orgs FOR SELECT
TO authenticated
USING (is_org_member(id));