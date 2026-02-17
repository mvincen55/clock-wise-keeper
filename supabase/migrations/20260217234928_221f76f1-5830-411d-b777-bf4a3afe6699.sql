
-- 1. Create allowed_users table
CREATE TABLE public.allowed_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.allowed_users ENABLE ROW LEVEL SECURITY;

-- Only authenticated users whose email is in allowed_users can read
CREATE POLICY "Allowed users can read allowlist"
  ON public.allowed_users FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (SELECT email FROM auth.users WHERE id = auth.uid()) IN (SELECT email FROM public.allowed_users)
  );

-- 2. Seed the single allowed email
INSERT INTO public.allowed_users (email) VALUES ('meganvincent43@gmail.com');

-- 3. Create a security definer function to check allowlist (avoids recursion)
CREATE OR REPLACE FUNCTION public.is_allowed_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.allowed_users
    WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );
$$;

-- 4. Drop all existing RLS policies and recreate with allowlist check

-- time_entries
DROP POLICY IF EXISTS "Users manage own time_entries" ON public.time_entries;
CREATE POLICY "Users manage own time_entries"
  ON public.time_entries FOR ALL
  USING (auth.uid() = user_id AND public.is_allowed_user())
  WITH CHECK (auth.uid() = user_id AND public.is_allowed_user());

-- punches
DROP POLICY IF EXISTS "Users manage own punches" ON public.punches;
CREATE POLICY "Users manage own punches"
  ON public.punches FOR ALL
  USING (public.user_owns_time_entry(time_entry_id) AND public.is_allowed_user())
  WITH CHECK (public.user_owns_time_entry(time_entry_id) AND public.is_allowed_user());

-- days_off
DROP POLICY IF EXISTS "Users manage own days_off" ON public.days_off;
CREATE POLICY "Users manage own days_off"
  ON public.days_off FOR ALL
  USING (auth.uid() = user_id AND public.is_allowed_user())
  WITH CHECK (auth.uid() = user_id AND public.is_allowed_user());

-- tardies
DROP POLICY IF EXISTS "Users manage own tardies" ON public.tardies;
CREATE POLICY "Users manage own tardies"
  ON public.tardies FOR ALL
  USING (auth.uid() = user_id AND public.is_allowed_user())
  WITH CHECK (auth.uid() = user_id AND public.is_allowed_user());

-- audit_events
DROP POLICY IF EXISTS "Users manage own audit_events" ON public.audit_events;
CREATE POLICY "Users manage own audit_events"
  ON public.audit_events FOR ALL
  USING (auth.uid() = user_id AND public.is_allowed_user())
  WITH CHECK (auth.uid() = user_id AND public.is_allowed_user());

-- imports
DROP POLICY IF EXISTS "Users manage own imports" ON public.imports;
CREATE POLICY "Users manage own imports"
  ON public.imports FOR ALL
  USING (auth.uid() = user_id AND public.is_allowed_user())
  WITH CHECK (auth.uid() = user_id AND public.is_allowed_user());

-- import_rows
DROP POLICY IF EXISTS "Users manage own import_rows" ON public.import_rows;
CREATE POLICY "Users manage own import_rows"
  ON public.import_rows FOR ALL
  USING (public.user_owns_import(import_id) AND public.is_allowed_user())
  WITH CHECK (public.user_owns_import(import_id) AND public.is_allowed_user());

-- work_zones
DROP POLICY IF EXISTS "Users manage own work_zones" ON public.work_zones;
CREATE POLICY "Users manage own work_zones"
  ON public.work_zones FOR ALL
  USING (auth.uid() = user_id AND public.is_allowed_user())
  WITH CHECK (auth.uid() = user_id AND public.is_allowed_user());

-- location_events
DROP POLICY IF EXISTS "Users manage own location_events" ON public.location_events;
CREATE POLICY "Users manage own location_events"
  ON public.location_events FOR ALL
  USING (auth.uid() = user_id AND public.is_allowed_user())
  WITH CHECK (auth.uid() = user_id AND public.is_allowed_user());

-- payroll_summaries
DROP POLICY IF EXISTS "Users manage own payroll_summaries" ON public.payroll_summaries;
CREATE POLICY "Users manage own payroll_summaries"
  ON public.payroll_summaries FOR ALL
  USING (auth.uid() = user_id AND public.is_allowed_user())
  WITH CHECK (auth.uid() = user_id AND public.is_allowed_user());

-- profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id AND public.is_allowed_user());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id AND public.is_allowed_user());

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id AND public.is_allowed_user());

-- work_schedule
DROP POLICY IF EXISTS "Users manage own work_schedule" ON public.work_schedule;
CREATE POLICY "Users manage own work_schedule"
  ON public.work_schedule FOR ALL
  USING (auth.uid() = user_id AND public.is_allowed_user())
  WITH CHECK (auth.uid() = user_id AND public.is_allowed_user());
