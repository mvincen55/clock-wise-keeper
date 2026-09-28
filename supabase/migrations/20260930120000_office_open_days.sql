-- Office open days: dates the office works although its weekly pattern says
-- closed (an open Saturday). The Office Calendar kept this list in the
-- manager's browser (localStorage) until now, so no other device and no
-- other page could read it. It is office data: every member reads it (the
-- Office Calendar and Close the Day share one office-day rule), owners and
-- managers maintain it. One row per office per date; no free text.
--
-- Written to re-run safely, so applying it twice (Lovable's migration tool
-- alongside this file, or a replay from zero) never fails on what exists.

CREATE TABLE IF NOT EXISTS public.office_open_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  open_date date NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, open_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.office_open_days TO authenticated;
GRANT ALL ON public.office_open_days TO service_role;

ALTER TABLE public.office_open_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read office open days" ON public.office_open_days;
CREATE POLICY "Members read office open days"
  ON public.office_open_days FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS "Admins manage office open days" ON public.office_open_days;
CREATE POLICY "Admins manage office open days"
  ON public.office_open_days FOR ALL TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

CREATE INDEX IF NOT EXISTS office_open_days_org_date_idx ON public.office_open_days (org_id, open_date);
