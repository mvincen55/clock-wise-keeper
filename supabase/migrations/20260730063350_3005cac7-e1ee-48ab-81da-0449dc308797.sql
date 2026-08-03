CREATE TABLE public.training_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  audience_tags text[] NOT NULL DEFAULT '{}',
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'staff' CHECK (source IN ('pathfinder','staff')),
  origin_goal_id uuid REFERENCES public.goals(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published','archived')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_modules TO authenticated;
GRANT ALL ON public.training_modules TO service_role;
ALTER TABLE public.training_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read published modules"
  ON public.training_modules FOR SELECT TO authenticated
  USING (public.is_org_member(org_id) AND (status = 'published' OR public.is_org_admin(org_id)));

CREATE POLICY "Org members create modules"
  ON public.training_modules FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id) AND created_by = auth.uid());

CREATE POLICY "Admins update modules"
  ON public.training_modules FOR UPDATE TO authenticated
  USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));

CREATE POLICY "Admins delete modules"
  ON public.training_modules FOR DELETE TO authenticated
  USING (public.is_org_admin(org_id));

CREATE TRIGGER training_modules_updated_at
  BEFORE UPDATE ON public.training_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_training_modules_org_status ON public.training_modules(org_id, status);

CREATE TABLE public.training_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.training_modules(id) ON DELETE CASCADE,
  assigned_to uuid NOT NULL,
  assigned_by uuid NOT NULL,
  due_date date,
  status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','in_progress','completed')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_id, assigned_to)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_assignments TO authenticated;
GRANT ALL ON public.training_assignments TO service_role;
ALTER TABLE public.training_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read all assignments"
  ON public.training_assignments FOR SELECT TO authenticated
  USING (public.is_org_admin(org_id));

CREATE POLICY "Assignee reads own assignments"
  ON public.training_assignments FOR SELECT TO authenticated
  USING (assigned_to = auth.uid());

CREATE POLICY "Admins create assignments"
  ON public.training_assignments FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(org_id) AND assigned_by = auth.uid());

CREATE POLICY "Assignee updates own assignment"
  ON public.training_assignments FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid()) WITH CHECK (assigned_to = auth.uid());

CREATE POLICY "Admins manage assignments"
  ON public.training_assignments FOR DELETE TO authenticated
  USING (public.is_org_admin(org_id));

CREATE INDEX idx_training_assignments_assignee ON public.training_assignments(assigned_to, status);

CREATE TABLE public.training_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.training_modules(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  score int NOT NULL DEFAULT 0,
  passed boolean NOT NULL DEFAULT false,
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  completed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.training_attempts TO authenticated;
GRANT ALL ON public.training_attempts TO service_role;
ALTER TABLE public.training_attempts ENABLE ROW LEVEL SECURITY;

-- Only the person who took the quiz may read or write their attempts, answers included.
CREATE POLICY "Own attempts read"
  ON public.training_attempts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Own attempts insert"
  ON public.training_attempts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(org_id));

CREATE INDEX idx_training_attempts_module_user ON public.training_attempts(module_id, user_id);

-- Admins see score / pass-fail only. The answers column is not exposed here.
CREATE VIEW public.training_attempt_summary
WITH (security_invoker = false) AS
  SELECT a.id, a.org_id, a.module_id, a.user_id, a.score, a.passed, a.completed_at
  FROM public.training_attempts a
  WHERE a.user_id = auth.uid() OR public.is_org_admin(a.org_id);

GRANT SELECT ON public.training_attempt_summary TO authenticated;