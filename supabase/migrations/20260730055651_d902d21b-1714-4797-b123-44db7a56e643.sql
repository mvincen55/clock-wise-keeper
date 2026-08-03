CREATE TABLE public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  month text NOT NULL,
  visibility text NOT NULL DEFAULT 'team' CHECK (visibility IN ('team','private')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','archived')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goals TO authenticated;
GRANT ALL ON public.goals TO service_role;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.goal_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  title text NOT NULL,
  due_date date,
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goal_tasks TO authenticated;
GRANT ALL ON public.goal_tasks TO service_role;
ALTER TABLE public.goal_tasks ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.goal_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('on_track','at_risk','done')),
  content text NOT NULL,
  auto_drafted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goal_updates TO authenticated;
GRANT ALL ON public.goal_updates TO service_role;
ALTER TABLE public.goal_updates ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.work_style_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL UNIQUE,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_style_profiles TO authenticated;
GRANT ALL ON public.work_style_profiles TO service_role;
ALTER TABLE public.work_style_profiles ENABLE ROW LEVEL SECURITY;

CREATE INDEX goals_org_month_idx ON public.goals (org_id, month);
CREATE INDEX goal_tasks_goal_idx ON public.goal_tasks (goal_id);
CREATE INDEX goal_updates_goal_idx ON public.goal_updates (goal_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.can_view_goal(_goal_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.goals g
    WHERE g.id = _goal_id
      AND public.is_org_member(g.org_id)
      AND (g.visibility = 'team' OR g.user_id = auth.uid() OR public.is_org_admin(g.org_id))
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_goal(_goal_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.goals g WHERE g.id = _goal_id AND g.user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.can_manage_goal(_goal_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.goals g
    WHERE g.id = _goal_id AND (g.user_id = auth.uid() OR public.is_org_admin(g.org_id))
  );
$$;

CREATE POLICY "View goals in my org" ON public.goals FOR SELECT TO authenticated
  USING (public.is_org_member(org_id)
    AND (visibility = 'team' OR user_id = auth.uid() OR public.is_org_admin(org_id)));
CREATE POLICY "Create own goals or admin for member" ON public.goals FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id) AND created_by = auth.uid()
    AND (user_id = auth.uid() OR public.is_org_admin(org_id)));
CREATE POLICY "Update own goals" ON public.goals FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_org_admin(org_id))
  WITH CHECK (user_id = auth.uid() OR public.is_org_admin(org_id));
CREATE POLICY "Delete own goals" ON public.goals FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_org_admin(org_id));

CREATE POLICY "View tasks of visible goals" ON public.goal_tasks FOR SELECT TO authenticated
  USING (public.can_view_goal(goal_id));
CREATE POLICY "Manage own goal tasks" ON public.goal_tasks FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_goal(goal_id));
CREATE POLICY "Update own goal tasks" ON public.goal_tasks FOR UPDATE TO authenticated
  USING (public.owns_goal(goal_id)) WITH CHECK (public.owns_goal(goal_id));
CREATE POLICY "Delete own goal tasks" ON public.goal_tasks FOR DELETE TO authenticated
  USING (public.can_manage_goal(goal_id));

CREATE POLICY "View updates of visible goals" ON public.goal_updates FOR SELECT TO authenticated
  USING (public.can_view_goal(goal_id));
CREATE POLICY "Goal owner posts updates" ON public.goal_updates FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.owns_goal(goal_id));
CREATE POLICY "Author edits own updates" ON public.goal_updates FOR UPDATE TO authenticated
  USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY "Author deletes own updates" ON public.goal_updates FOR DELETE TO authenticated
  USING (author_id = auth.uid());

CREATE POLICY "View own work style profile" ON public.work_style_profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_org_admin(org_id));
CREATE POLICY "Insert own work style profile" ON public.work_style_profiles FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id) AND (user_id = auth.uid() OR public.is_org_admin(org_id)));
CREATE POLICY "Update own work style profile" ON public.work_style_profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_org_admin(org_id))
  WITH CHECK (user_id = auth.uid() OR public.is_org_admin(org_id));

CREATE TRIGGER goals_updated_at BEFORE UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER goal_tasks_updated_at BEFORE UPDATE ON public.goal_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER work_style_profiles_updated_at BEFORE UPDATE ON public.work_style_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();