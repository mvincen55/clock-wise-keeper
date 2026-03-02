
-- Fix days_off: drop restrictive policies, recreate as permissive
DROP POLICY IF EXISTS "Org admin days_off" ON public.days_off;
DROP POLICY IF EXISTS "Own days_off" ON public.days_off;

CREATE POLICY "Org admin days_off" ON public.days_off
  FOR ALL USING (is_org_admin(org_id)) WITH CHECK (is_org_admin(org_id));

CREATE POLICY "Own days_off" ON public.days_off
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
