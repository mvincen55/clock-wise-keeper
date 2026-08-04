-- Historical consolidation note:
-- Two files previously shared migration version 20260724220000. Supabase's
-- migration ledger accepts one row per version, so their statements now live
-- together here in the same filename order the repository previously used.

-- Per-procedure wording & policy notes on fee schedule items. Team-visible
-- office configuration (no patient data) that the AI follows: the FOF's
-- wording passes (name-visits, fof-assistant) and Ask AI (ask-docs) all
-- read the office schedule's notes as authoritative guidance.
ALTER TABLE public.fee_schedule_items
  ADD COLUMN notes text NOT NULL DEFAULT '';

-- Important Numbers v2: tabbed directory (Office, Team, Referrals, Labs,
-- Insurance Companies, Other — manager-renamable), member contributions.
--
-- Permission model: everyone reads; owners/managers manage everything;
-- team members may ADD entries and edit NOTES on existing entries, but
-- can never change a name/number/placement or delete (column-level rule
-- enforced by trigger, since RLS is row-level only).

-- 1) Tabs are per-org rows so managers can rename/reorder them.
CREATE TABLE public.important_number_tabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.important_number_tabs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read important_number_tabs"
  ON public.important_number_tabs FOR SELECT
  TO authenticated
  USING (is_org_member(org_id));

CREATE POLICY "Admins manage important_number_tabs"
  ON public.important_number_tabs FOR ALL
  TO authenticated
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

CREATE TRIGGER trg_important_number_tabs_updated_at
  BEFORE UPDATE ON public.important_number_tabs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the six standard tabs for every existing org.
INSERT INTO public.important_number_tabs (org_id, name, sort_order)
SELECT o.id, t.name, t.sort_order
FROM public.orgs o
CROSS JOIN (VALUES
  ('Office', 0), ('Team', 1), ('Referrals', 2),
  ('Labs', 3), ('Insurance Companies', 4), ('Other', 5)
) AS t(name, sort_order);

-- 2) Entries live under a tab.
ALTER TABLE public.important_numbers
  ADD COLUMN tab text NOT NULL DEFAULT 'Other';

-- Sort existing sections into their natural tabs.
UPDATE public.important_numbers SET tab = CASE
  WHEN section IN ('Practice IDs', 'NPI Numbers', 'DEA Numbers', 'License Numbers') THEN 'Office'
  WHEN section IN ('Doctor Phones', 'Team Members') THEN 'Team'
  WHEN section IN ('Oral Surgery', 'Orthodontists', 'Periodontists', 'Endodontists') THEN 'Referrals'
  WHEN section IN ('Labs', 'Delivery') THEN 'Labs'
  WHEN section = 'Insurance Companies' THEN 'Insurance Companies'
  ELSE 'Other'
END;

-- 3) Team members add entries and edit notes; never names/numbers.
CREATE POLICY "Members add important_numbers"
  ON public.important_numbers FOR INSERT
  TO authenticated
  WITH CHECK (is_org_member(org_id));

CREATE POLICY "Members update important_numbers"
  ON public.important_numbers FOR UPDATE
  TO authenticated
  USING (is_org_member(org_id))
  WITH CHECK (is_org_member(org_id));

-- Column-level guard: non-admins may only change notes.
CREATE FUNCTION public.important_numbers_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT is_org_admin(OLD.org_id) THEN
    IF NEW.org_id IS DISTINCT FROM OLD.org_id
       OR NEW.tab IS DISTINCT FROM OLD.tab
       OR NEW.section IS DISTINCT FROM OLD.section
       OR NEW.label IS DISTINCT FROM OLD.label
       OR NEW.value IS DISTINCT FROM OLD.value
       OR NEW.sort_order IS DISTINCT FROM OLD.sort_order THEN
      RAISE EXCEPTION 'Only managers can change names, numbers, or placement';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_important_numbers_guard
  BEFORE UPDATE ON public.important_numbers
  FOR EACH ROW EXECUTE FUNCTION public.important_numbers_guard();
