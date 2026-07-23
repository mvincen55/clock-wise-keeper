-- Office checklists: the paper Clerical / Clinical / Manager sheets as
-- recurring task lists with completion tracking. Business operations data
-- only — no patient information belongs in task titles or completions.
--
-- Model (per 2026-07-23 decisions):
-- - Shared tasks: one checkbox per period, the app records who checked it.
--   per_person items give every teammate their own checkbox instead.
-- - History is kept: completions are rows keyed by period (day/week/
--   month/year), so past periods stay browsable like the filed sheets.

CREATE TABLE public.checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  -- 'manager' checklists are visible to owners/managers only (RLS below).
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'manager')),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  checklist_id uuid NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  title text NOT NULL,
  cadence text NOT NULL DEFAULT 'daily' CHECK (cadence IN ('daily', 'weekly', 'monthly', 'yearly')),
  -- true = every teammate checks their own box for the period.
  per_person boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.checklist_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.checklist_items(id) ON DELETE CASCADE,
  -- Eastern-local period: 'YYYY-MM-DD' daily, 'week-YYYY-MM-DD' (Monday)
  -- weekly, 'YYYY-MM' monthly, 'YYYY' yearly.
  period_key text NOT NULL,
  completed_by uuid NOT NULL,
  completed_by_name text NOT NULL DEFAULT '',
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, period_key, completed_by)
);

CREATE INDEX idx_checklists_org ON public.checklists(org_id, sort_order);
CREATE INDEX idx_checklist_items_list ON public.checklist_items(checklist_id, cadence, sort_order);
CREATE INDEX idx_checklist_completions_item ON public.checklist_completions(item_id, period_key);
CREATE INDEX idx_checklist_completions_org ON public.checklist_completions(org_id, period_key);

ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_completions ENABLE ROW LEVEL SECURITY;

-- Everyone sees 'all' checklists; manager checklists are admin-only.
CREATE POLICY "Members read checklists"
  ON public.checklists FOR SELECT
  TO authenticated
  USING (is_org_member(org_id) AND (audience = 'all' OR is_org_admin(org_id)));

CREATE POLICY "Admins manage checklists"
  ON public.checklists FOR ALL
  TO authenticated
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

CREATE POLICY "Members read checklist_items"
  ON public.checklist_items FOR SELECT
  TO authenticated
  USING (
    is_org_member(org_id)
    AND EXISTS (
      SELECT 1 FROM public.checklists c
      WHERE c.id = checklist_id
        AND (c.audience = 'all' OR is_org_admin(c.org_id))
    )
  );

CREATE POLICY "Admins manage checklist_items"
  ON public.checklist_items FOR ALL
  TO authenticated
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

CREATE POLICY "Members read checklist_completions"
  ON public.checklist_completions FOR SELECT
  TO authenticated
  USING (is_org_member(org_id));

-- Checking a box is always in your own name, on an item in your org.
CREATE POLICY "Members complete checklist items"
  ON public.checklist_completions FOR INSERT
  TO authenticated
  WITH CHECK (
    is_org_member(org_id)
    AND completed_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.checklist_items i
      WHERE i.id = item_id AND i.org_id = org_id
    )
  );

-- Un-check your own box; managers can clear anyone's (mistake fixing).
CREATE POLICY "Members remove own completions"
  ON public.checklist_completions FOR DELETE
  TO authenticated
  USING (is_org_member(org_id) AND (completed_by = auth.uid() OR is_org_admin(org_id)));

CREATE TRIGGER trg_checklists_updated_at
  BEFORE UPDATE ON public.checklists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_checklist_items_updated_at
  BEFORE UPDATE ON public.checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
