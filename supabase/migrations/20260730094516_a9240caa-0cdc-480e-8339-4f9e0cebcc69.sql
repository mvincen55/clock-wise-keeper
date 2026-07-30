-- ============ reminder_hooks ============
CREATE TABLE public.reminder_hooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('goal_task_due','training_due','plan_stall','checklist_gap','sprint_progress','follow_up')),
  ref_id uuid,
  fire_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','cancelled')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminder_hooks TO authenticated;
GRANT ALL ON public.reminder_hooks TO service_role;

ALTER TABLE public.reminder_hooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their own reminder hooks"
  ON public.reminder_hooks FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(org_id));

CREATE POLICY "Admins read org reminder hooks"
  ON public.reminder_hooks FOR SELECT TO authenticated
  USING (public.is_org_admin(org_id));

CREATE POLICY "Members cancel their own reminder hooks"
  ON public.reminder_hooks FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(org_id))
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(org_id));

CREATE INDEX reminder_hooks_due_idx ON public.reminder_hooks (status, fire_at);
CREATE INDEX reminder_hooks_user_idx ON public.reminder_hooks (user_id, status);
CREATE UNIQUE INDEX reminder_hooks_dedupe_idx
  ON public.reminder_hooks (user_id, kind, ref_id, fire_at)
  WHERE ref_id IS NOT NULL AND status = 'pending';

CREATE TRIGGER update_reminder_hooks_updated_at
  BEFORE UPDATE ON public.reminder_hooks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ team_goals (sprints) ============
CREATE TABLE public.team_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  title text NOT NULL,
  metric text NOT NULL,
  target_count integer NOT NULL CHECK (target_count > 0),
  period text NOT NULL CHECK (period IN ('week','month')),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  reward text NOT NULL,
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','won','missed','cancelled')),
  created_by uuid NOT NULL,
  ai_suggested boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_goals TO authenticated;
GRANT ALL ON public.team_goals TO service_role;

ALTER TABLE public.team_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read team goals"
  ON public.team_goals FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "Admins create team goals"
  ON public.team_goals FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(org_id) AND created_by = auth.uid());

CREATE POLICY "Admins update team goals"
  ON public.team_goals FOR UPDATE TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

CREATE POLICY "Admins delete team goals"
  ON public.team_goals FOR DELETE TO authenticated
  USING (public.is_org_admin(org_id));

CREATE INDEX team_goals_org_status_idx ON public.team_goals (org_id, status, ends_on);

CREATE TRIGGER update_team_goals_updated_at
  BEFORE UPDATE ON public.team_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Honor tally: any member can add to the count, nothing else.
CREATE OR REPLACE FUNCTION public.bump_team_goal(_goal_id uuid, _amount integer DEFAULT 1)
RETURNS public.team_goals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g public.team_goals;
BEGIN
  SELECT * INTO g FROM public.team_goals WHERE id = _goal_id;
  IF g.id IS NULL THEN
    RAISE EXCEPTION 'Sprint not found';
  END IF;
  IF NOT public.is_org_member(g.org_id) THEN
    RAISE EXCEPTION 'Not a member of this office';
  END IF;
  IF g.status <> 'active' THEN
    RAISE EXCEPTION 'This sprint is closed';
  END IF;
  IF _amount IS NULL OR _amount < 1 OR _amount > 25 THEN
    RAISE EXCEPTION 'Add between 1 and 25 at a time';
  END IF;

  UPDATE public.team_goals
     SET progress = progress + _amount
   WHERE id = _goal_id
  RETURNING * INTO g;

  RETURN g;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_team_goal(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bump_team_goal(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bump_team_goal(uuid, integer) TO service_role;