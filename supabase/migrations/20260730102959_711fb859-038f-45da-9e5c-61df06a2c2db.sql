-- Executive Co-Pilot: personal captured items + AI capture proposals.

ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.checklist_items
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS first_step text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS deferral_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE INDEX IF NOT EXISTS checklist_items_owner_idx
  ON public.checklist_items(owner_user_id, due_date);

-- Personal lists/items stay private to their owner; shared ones are unchanged.
DROP POLICY IF EXISTS checklists_select ON public.checklists;
DROP POLICY IF EXISTS "Members read checklists" ON public.checklists;
CREATE POLICY checklists_select ON public.checklists FOR SELECT TO authenticated
  USING (public.is_org_member(org_id) AND (owner_user_id IS NULL OR owner_user_id = auth.uid()));

DROP POLICY IF EXISTS checklist_items_select ON public.checklist_items;
DROP POLICY IF EXISTS "Members read checklist_items" ON public.checklist_items;
CREATE POLICY checklist_items_select ON public.checklist_items FOR SELECT TO authenticated
  USING (public.is_org_member(org_id) AND (owner_user_id IS NULL OR owner_user_id = auth.uid()));

-- Members manage only their own personal list and its items.
DROP POLICY IF EXISTS checklists_own_personal ON public.checklists;
CREATE POLICY checklists_own_personal ON public.checklists FOR ALL TO authenticated
  USING (public.is_org_member(org_id) AND owner_user_id = auth.uid())
  WITH CHECK (public.is_org_member(org_id) AND owner_user_id = auth.uid());

DROP POLICY IF EXISTS checklist_items_own_personal ON public.checklist_items;
CREATE POLICY checklist_items_own_personal ON public.checklist_items FOR ALL TO authenticated
  USING (public.is_org_member(org_id) AND owner_user_id = auth.uid())
  WITH CHECK (public.is_org_member(org_id) AND owner_user_id = auth.uid());

-- Capture proposals: nothing lands on a list without a tap, and a declined
-- proposal is never raised again (unique fingerprint per member).
CREATE TABLE IF NOT EXISTS public.capture_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  surface text NOT NULL,
  title text NOT NULL,
  first_step text,
  due_date date,
  fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','confirmed','declined')),
  item_id uuid REFERENCES public.checklist_items(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS capture_proposals_fingerprint_idx
  ON public.capture_proposals(user_id, fingerprint);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.capture_proposals TO authenticated;
GRANT ALL ON public.capture_proposals TO service_role;
ALTER TABLE public.capture_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS capture_proposals_own ON public.capture_proposals;
CREATE POLICY capture_proposals_own ON public.capture_proposals FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(org_id));