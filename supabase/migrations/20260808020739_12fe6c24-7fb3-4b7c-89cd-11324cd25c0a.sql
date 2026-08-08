ALTER TABLE public.team_goals
  ADD COLUMN IF NOT EXISTS scope_role text,
  ADD COLUMN IF NOT EXISTS category text;

ALTER TABLE public.team_goals DROP CONSTRAINT IF EXISTS team_goals_scope_check;
ALTER TABLE public.team_goals ADD CONSTRAINT team_goals_scope_check
  CHECK (scope IN ('team','department','individual','role'));

ALTER TABLE public.team_goals DROP CONSTRAINT IF EXISTS team_goals_scope_role_check;
ALTER TABLE public.team_goals ADD CONSTRAINT team_goals_scope_role_check
  CHECK (
    scope_role IS NULL OR scope_role IN (
      'dentist','hygienist','dental_assistant','front_desk',
      'office_manager','sterilization','floater','other'
    )
  );

ALTER TABLE public.team_goals DROP CONSTRAINT IF EXISTS team_goals_scope_shape_check;
ALTER TABLE public.team_goals ADD CONSTRAINT team_goals_scope_shape_check
  CHECK (
    (scope = 'team' AND scope_department IS NULL AND scope_user_id IS NULL AND scope_role IS NULL)
    OR (scope = 'department' AND scope_department IS NOT NULL AND scope_user_id IS NULL AND scope_role IS NULL)
    OR (scope = 'individual' AND scope_user_id IS NOT NULL AND scope_department IS NULL AND scope_role IS NULL)
    OR (scope = 'role' AND scope_role IS NOT NULL AND scope_department IS NULL AND scope_user_id IS NULL)
  );

CREATE OR REPLACE FUNCTION public.my_operational_roles()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT r.operational_role), '{}')
  FROM public.employee_operational_roles r
  JOIN public.employees e ON e.id = r.employee_id
  WHERE e.user_id = auth.uid()
    AND (r.starts_on IS NULL OR r.starts_on <= CURRENT_DATE)
    AND (r.ends_on IS NULL OR r.ends_on >= CURRENT_DATE)
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
        OR (g.scope = 'role' AND g.scope_role = ANY(public.my_operational_roles()))
      )
  )
$$;

DROP POLICY IF EXISTS "team_goals_select_scoped" ON public.team_goals;
CREATE POLICY "team_goals_select_scoped" ON public.team_goals
FOR SELECT TO authenticated
USING (
  public.is_org_member(org_id)
  AND (
    scope = 'team'
    OR public.is_org_admin(org_id)
    OR (scope = 'individual' AND scope_user_id = auth.uid())
    OR (scope = 'department' AND scope_department = public.my_department())
    OR (scope = 'role' AND scope_role = ANY(public.my_operational_roles()))
  )
);