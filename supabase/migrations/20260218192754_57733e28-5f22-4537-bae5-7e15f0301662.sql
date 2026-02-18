
-- Add org admin policy for change_requests (currently only org creator can manage)
CREATE POLICY "Org admin manages requests"
  ON public.change_requests FOR ALL
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));
