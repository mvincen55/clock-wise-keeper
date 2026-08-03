-- Close the Day (20260731000739) added owners_clock_in DEFAULT false and the
-- app now hides the whole clock UI (header chip + mobile sticky bar) for
-- owner-role members unless the office opts in. Owners who were already
-- punching lost their Clock In/Out button overnight with nothing in the UI
-- explaining why.
--
-- Grandfather them in: any org where an active owner-role member has punch
-- history keeps the clock on. Offices that don't want owners on the clock can
-- still turn it off in Settings > Practice Settings > "Owners clock in".

INSERT INTO public.org_practice_settings (org_id, owners_clock_in)
SELECT DISTINCT m.org_id, true
FROM public.org_members m
JOIN public.employees e ON e.org_id = m.org_id AND e.user_id = m.user_id
JOIN public.time_entries te ON te.employee_id = e.id
WHERE m.role = 'owner'
  AND m.status = 'active'
ON CONFLICT (org_id) DO UPDATE
SET owners_clock_in = true,
    updated_at = now();
