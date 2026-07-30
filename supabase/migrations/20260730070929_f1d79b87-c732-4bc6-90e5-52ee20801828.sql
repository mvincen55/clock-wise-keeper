ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_reason text;

-- Only the goal's owner may edit or archive it.
DROP POLICY IF EXISTS "Update own goals" ON public.goals;
CREATE POLICY "Update own goals" ON public.goals
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Delete own goals" ON public.goals;
CREATE POLICY "Delete own goals" ON public.goals
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE public.goal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('edited', 'archived', 'replaced')),
  reason text NOT NULL,
  old_title text NOT NULL,
  new_title text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.goal_events TO authenticated;
GRANT ALL ON public.goal_events TO service_role;

ALTER TABLE public.goal_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View goal events like the parent goal" ON public.goal_events
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(org_id)
    AND EXISTS (
      SELECT 1 FROM public.goals g
      WHERE g.id = goal_events.goal_id
        AND (g.visibility = 'team' OR g.user_id = auth.uid() OR public.is_org_admin(g.org_id))
    )
  );

CREATE POLICY "Members record events on their own goals" ON public.goal_events
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.goals g
      WHERE g.id = goal_events.goal_id
        AND g.user_id = auth.uid()
        AND g.org_id = goal_events.org_id
    )
  );

-- Linking a replacement goal only sets new_title on your own event.
CREATE POLICY "Members link replacements on their own events" ON public.goal_events
  FOR UPDATE TO authenticated
  USING (actor_id = auth.uid())
  WITH CHECK (actor_id = auth.uid());

CREATE INDEX goal_events_org_created_idx ON public.goal_events (org_id, created_at DESC);
CREATE INDEX goal_events_goal_idx ON public.goal_events (goal_id);