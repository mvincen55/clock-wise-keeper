
ALTER TABLE public.team_goals
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'team',
  ADD COLUMN IF NOT EXISTS scope_department text,
  ADD COLUMN IF NOT EXISTS scope_user_id uuid,
  ADD COLUMN IF NOT EXISTS verification text NOT NULL DEFAULT 'honor',
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_note text,
  ADD COLUMN IF NOT EXISTS verification_doc_path text,
  ADD COLUMN IF NOT EXISTS ai_verdict jsonb,
  ADD COLUMN IF NOT EXISTS override_reason text;

ALTER TABLE public.team_goals DROP CONSTRAINT IF EXISTS team_goals_scope_check;
ALTER TABLE public.team_goals ADD CONSTRAINT team_goals_scope_check
  CHECK (scope IN ('team','department','individual'));

ALTER TABLE public.team_goals DROP CONSTRAINT IF EXISTS team_goals_scope_department_check;
ALTER TABLE public.team_goals ADD CONSTRAINT team_goals_scope_department_check
  CHECK (scope_department IS NULL OR scope_department IN ('clinical','clerical'));

ALTER TABLE public.team_goals DROP CONSTRAINT IF EXISTS team_goals_scope_shape_check;
ALTER TABLE public.team_goals ADD CONSTRAINT team_goals_scope_shape_check
  CHECK (
    (scope = 'team' AND scope_department IS NULL AND scope_user_id IS NULL)
    OR (scope = 'department' AND scope_department IS NOT NULL AND scope_user_id IS NULL)
    OR (scope = 'individual' AND scope_user_id IS NOT NULL AND scope_department IS NULL)
  );

ALTER TABLE public.team_goals DROP CONSTRAINT IF EXISTS team_goals_verification_check;
ALTER TABLE public.team_goals ADD CONSTRAINT team_goals_verification_check
  CHECK (verification IN ('honor','manager_approval','document'));

ALTER TABLE public.team_goals DROP CONSTRAINT IF EXISTS team_goals_status_check;
ALTER TABLE public.team_goals ADD CONSTRAINT team_goals_status_check
  CHECK (status IN ('active','pending_verification','won','missed','cancelled'));

ALTER TABLE public.reminder_hooks DROP CONSTRAINT IF EXISTS reminder_hooks_kind_check;
ALTER TABLE public.reminder_hooks ADD CONSTRAINT reminder_hooks_kind_check
  CHECK (kind IN ('goal_task_due','training_due','plan_stall','checklist_gap','sprint_progress','follow_up','sprint_verify'));

-- department of the current user, from employees.team
CREATE OR REPLACE FUNCTION public.my_department()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(e.team)
  FROM public.employees e
  WHERE e.user_id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.can_view_team_goal(_goal_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_goals g
    WHERE g.id = _goal_id
      AND public.is_org_member(g.org_id)
      AND (
        g.scope = 'team'
        OR public.is_org_admin(g.org_id)
        OR (g.scope = 'individual' AND g.scope_user_id = auth.uid())
        OR (g.scope = 'department' AND g.scope_department = public.my_department())
      )
  )
$$;

-- Rebuild policies
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='team_goals' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.team_goals', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "team_goals_select_scoped" ON public.team_goals
FOR SELECT TO authenticated
USING (
  public.is_org_member(org_id)
  AND (
    scope = 'team'
    OR public.is_org_admin(org_id)
    OR (scope = 'individual' AND scope_user_id = auth.uid())
    OR (scope = 'department' AND scope_department = public.my_department())
  )
);

CREATE POLICY "team_goals_admin_insert" ON public.team_goals
FOR INSERT TO authenticated
WITH CHECK (public.is_org_admin(org_id));

CREATE POLICY "team_goals_admin_update" ON public.team_goals
FOR UPDATE TO authenticated
USING (public.is_org_admin(org_id))
WITH CHECK (public.is_org_admin(org_id));

CREATE POLICY "team_goals_admin_delete" ON public.team_goals
FOR DELETE TO authenticated
USING (public.is_org_admin(org_id));

-- Members bump progress only on honor sprints inside their scope
DROP FUNCTION IF EXISTS public.bump_team_goal(uuid, integer);
CREATE OR REPLACE FUNCTION public.bump_team_goal(_goal_id uuid, _amount integer DEFAULT 1)
RETURNS public.team_goals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE g public.team_goals;
BEGIN
  SELECT * INTO g FROM public.team_goals WHERE id = _goal_id;
  IF g.id IS NULL THEN RAISE EXCEPTION 'Sprint not found'; END IF;
  IF NOT public.can_view_team_goal(_goal_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF NOT public.is_org_admin(g.org_id) AND g.verification <> 'honor' THEN
    RAISE EXCEPTION 'This sprint is verified by a manager';
  END IF;
  IF g.status NOT IN ('active') THEN RAISE EXCEPTION 'Sprint is not active'; END IF;

  UPDATE public.team_goals
     SET progress = GREATEST(0, progress + _amount),
         status = CASE
           WHEN progress + _amount >= target_count AND verification = 'honor' THEN 'won'
           WHEN progress + _amount >= target_count THEN 'pending_verification'
           ELSE status END,
         updated_at = now()
   WHERE id = _goal_id
   RETURNING * INTO g;

  RETURN g;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_goals TO authenticated;
GRANT ALL ON public.team_goals TO service_role;

-- storage policies for verification documents (bucket created separately)
CREATE POLICY "sprint_docs_admin_read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'sprint-verification'
  AND EXISTS (
    SELECT 1 FROM public.org_members m
    WHERE m.user_id = auth.uid()
      AND m.role IN ('owner','manager')
      AND m.org_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "sprint_docs_admin_write" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'sprint-verification'
  AND EXISTS (
    SELECT 1 FROM public.org_members m
    WHERE m.user_id = auth.uid()
      AND m.role IN ('owner','manager')
      AND m.org_id::text = (storage.foldername(name))[1]
  )
);
