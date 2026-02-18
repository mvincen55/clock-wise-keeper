-- Fix RLS: replace restrictive-only policies with permissive ones that include both checks

-- pto_settings
DROP POLICY IF EXISTS "Users manage own pto_settings" ON public.pto_settings;
DROP POLICY IF EXISTS "Users can manage own pto_settings" ON public.pto_settings;
DROP POLICY IF EXISTS "Must be allowed user for pto_settings" ON public.pto_settings;
CREATE POLICY "Users manage own pto_settings"
  ON public.pto_settings FOR ALL
  USING (auth.uid() = user_id AND is_allowed_user())
  WITH CHECK (auth.uid() = user_id AND is_allowed_user());

-- pto_snapshots
DROP POLICY IF EXISTS "Users manage own pto_snapshots" ON public.pto_snapshots;
DROP POLICY IF EXISTS "Users can manage own pto_snapshots" ON public.pto_snapshots;
DROP POLICY IF EXISTS "Must be allowed user for pto_snapshots" ON public.pto_snapshots;
CREATE POLICY "Users manage own pto_snapshots"
  ON public.pto_snapshots FOR ALL
  USING (auth.uid() = user_id AND is_allowed_user())
  WITH CHECK (auth.uid() = user_id AND is_allowed_user());

-- pto_ledger_weeks
DROP POLICY IF EXISTS "Users manage own pto_ledger_weeks" ON public.pto_ledger_weeks;
DROP POLICY IF EXISTS "Users can manage own pto_ledger_weeks" ON public.pto_ledger_weeks;
DROP POLICY IF EXISTS "Must be allowed user for pto_ledger_weeks" ON public.pto_ledger_weeks;
CREATE POLICY "Users manage own pto_ledger_weeks"
  ON public.pto_ledger_weeks FOR ALL
  USING (auth.uid() = user_id AND is_allowed_user())
  WITH CHECK (auth.uid() = user_id AND is_allowed_user());