-- Historical consolidation note:
-- Two files previously shared migration version 20260803180000. Supabase's
-- migration ledger accepts one row per version, so their statements now live
-- together here in the same filename order the repository previously used.

-- In-app editing for library documents (Office Handbook / Insurance Desk).
-- The OWNER can always edit document text; whether MANAGERS may edit too is
-- the owner's call, stored here. All staff can read the flag (the reader
-- uses it to decide whether to show the Edit action); only owners write it.

CREATE TABLE public.doc_library_settings (
  org_id uuid PRIMARY KEY REFERENCES public.orgs(id) ON DELETE CASCADE,
  managers_can_edit boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.doc_library_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read doc_library_settings"
  ON public.doc_library_settings FOR SELECT
  TO authenticated
  USING (is_org_member(org_id));

CREATE POLICY "Owners manage doc_library_settings"
  ON public.doc_library_settings FOR ALL
  TO authenticated
  USING (is_org_owner(org_id))
  WITH CHECK (is_org_owner(org_id));

CREATE TRIGGER update_doc_library_settings_updated_at
  BEFORE UPDATE ON public.doc_library_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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
