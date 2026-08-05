-- Richer invites: capture a new hire's start date, current PTO balance, and a
-- weekly work schedule at invite time. accept-invite reads these off the invite
-- and seeds employees.hire_date, a pto_settings row, a pto_snapshots opening
-- balance, and a schedule_version so PTO/attendance tracking is correct from the
-- moment they join.
--
-- weekly_schedule is a JSON array of {weekday (0=Sun..6=Sat), enabled, start_time
-- 'HH:MM', end_time 'HH:MM'} objects; an empty array means "no schedule set".

ALTER TABLE public.org_invites
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS initial_pto_hours numeric,
  ADD COLUMN IF NOT EXISTS weekly_schedule jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Managers (not just the org creator) need to review and revoke outstanding
-- invites in-app. Reads/writes from the invite create + accept flows still go
-- through edge functions with the service role, so this policy only governs the
-- client-side pending-invites list and revoke actions.
DROP POLICY IF EXISTS "Org admins manage invites" ON public.org_invites;
CREATE POLICY "Org admins manage invites" ON public.org_invites FOR ALL
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));
