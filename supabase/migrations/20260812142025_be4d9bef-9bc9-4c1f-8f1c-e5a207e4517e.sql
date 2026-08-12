-- Per-employee permissions, chosen by the owner.
--
-- The three permission tiers (owner / manager / employee) stay exactly as
-- they are — this adds named, per-employee GRANTS that unlock specific
-- capabilities a tier alone would not, each enforced in RLS, never only in
-- the UI. A grant is a row; revoking deletes it. Nothing here stores patient
-- data — grants name app capabilities only.
--
-- Delegation: by default only the OWNER edits grants. The owner may flip one
-- office-wide switch to let managers edit them too. That switch lives in its
-- own owner-writable table (org_practice_settings is manager-writable, so the
-- flag cannot live there without weakening its rule).
--
-- v1 permission keys, each wired to real enforcement below:
--   edit_closeout_history — edit/unseal past-day Close the Day records
--                           (extends the deposit_logs UPDATE policy)
--   view_reports          — read the office audit trail on Reports
--                           (extends the audit_events SELECT policy)
--   manage_office_goals   — create/edit/delete office sprints
--                           (extends the team_goals write policies)

-- ================================================================
-- 1. Tables
-- ================================================================

CREATE TABLE IF NOT EXISTS public.employee_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  permission text NOT NULL CHECK (permission = ANY (ARRAY[
    'edit_closeout_history', 'view_reports', 'manage_office_goals'
  ])),
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS employee_permissions_unique_idx
  ON public.employee_permissions (org_id, employee_id, permission);
CREATE INDEX IF NOT EXISTS employee_permissions_org_idx
  ON public.employee_permissions (org_id, employee_id);

CREATE TABLE IF NOT EXISTS public.org_permission_delegation (
  org_id uuid PRIMARY KEY REFERENCES public.orgs(id) ON DELETE CASCADE,
  managers_can_manage boolean NOT NULL DEFAULT false,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.employee_permissions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.org_permission_delegation TO authenticated;
GRANT ALL ON public.employee_permissions TO service_role;
GRANT ALL ON public.org_permission_delegation TO service_role;

ALTER TABLE public.employee_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_permission_delegation ENABLE ROW LEVEL SECURITY;

-- ================================================================
-- 2. Helpers (SECURITY DEFINER, same shape as is_org_admin)
-- ================================================================

-- Does the signed-in person hold this grant in this org?
CREATE OR REPLACE FUNCTION public.has_permission(_org_id uuid, _perm text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employee_permissions p
    JOIN public.employees e ON e.id = p.employee_id
    WHERE p.org_id = _org_id
      AND p.permission = _perm
      AND e.user_id = auth.uid()
  );
$$;

-- Who may edit grants: the owner always; managers only when the owner has
-- flipped the delegation switch.
CREATE OR REPLACE FUNCTION public.can_manage_permissions(_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_org_owner(_org_id)
    OR (
      public.is_org_admin(_org_id)
      AND EXISTS (
        SELECT 1 FROM public.org_permission_delegation d
        WHERE d.org_id = _org_id AND d.managers_can_manage
      )
    );
$$;

-- ================================================================
-- 3. Policies
-- ================================================================

-- Admins see the whole grant grid (read-only for managers without
-- delegation); everyone can read their own grants for UI gating.
DROP POLICY IF EXISTS "Admins and self read employee permissions" ON public.employee_permissions;
CREATE POLICY "Admins and self read employee permissions"
  ON public.employee_permissions FOR SELECT
  TO authenticated
  USING (
    public.is_org_admin(org_id)
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = employee_id AND e.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Permission managers grant" ON public.employee_permissions;
CREATE POLICY "Permission managers grant"
  ON public.employee_permissions FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_permissions(org_id));

DROP POLICY IF EXISTS "Permission managers revoke" ON public.employee_permissions;
CREATE POLICY "Permission managers revoke"
  ON public.employee_permissions FOR DELETE
  TO authenticated
  USING (public.can_manage_permissions(org_id));

-- The delegation switch: readable by members (the UI explains who can edit),
-- writable by the OWNER only.
DROP POLICY IF EXISTS "Members read permission delegation" ON public.org_permission_delegation;
CREATE POLICY "Members read permission delegation"
  ON public.org_permission_delegation FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS "Owner writes permission delegation" ON public.org_permission_delegation;
CREATE POLICY "Owner writes permission delegation"
  ON public.org_permission_delegation FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_owner(org_id));

DROP POLICY IF EXISTS "Owner updates permission delegation" ON public.org_permission_delegation;
CREATE POLICY "Owner updates permission delegation"
  ON public.org_permission_delegation FOR UPDATE
  TO authenticated
  USING (public.is_org_owner(org_id))
  WITH CHECK (public.is_org_owner(org_id));

-- ================================================================
-- 4. Wire the three keys into the existing enforcement points
-- ================================================================

-- edit_closeout_history: same-day member editing and admin late editing stay
-- exactly as they were; a granted employee may also edit past days. The
-- late-edit audit trigger keeps recording either way.
DROP POLICY IF EXISTS "Members update deposit_logs same day, admins later" ON public.deposit_logs;
CREATE POLICY "Members update deposit_logs same day, admins later"
  ON public.deposit_logs FOR UPDATE
  TO authenticated
  USING (
    public.is_org_member(org_id)
    AND (
      deposit_date >= (now() AT TIME ZONE 'America/New_York')::date
      OR public.is_org_admin(org_id)
      OR public.has_permission(org_id, 'edit_closeout_history')
    )
  )
  WITH CHECK (
    public.is_org_member(org_id)
    AND (
      deposit_date >= (now() AT TIME ZONE 'America/New_York')::date
      OR public.is_org_admin(org_id)
      OR public.has_permission(org_id, 'edit_closeout_history')
    )
  );

-- view_reports: the office audit trail opens to granted employees; everyone
-- keeps their own rows.
DROP POLICY IF EXISTS "Employees select own audit_events" ON public.audit_events;
CREATE POLICY "Employees select own audit_events"
  ON public.audit_events FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.is_org_admin(org_id)
    OR public.has_permission(org_id, 'view_reports')
  );

-- manage_office_goals: granted employees can run sprints end to end.
DROP POLICY IF EXISTS "team_goals_admin_insert" ON public.team_goals;
CREATE POLICY "team_goals_admin_insert" ON public.team_goals
FOR INSERT TO authenticated
WITH CHECK (public.is_org_admin(org_id) OR public.has_permission(org_id, 'manage_office_goals'));

DROP POLICY IF EXISTS "team_goals_admin_update" ON public.team_goals;
CREATE POLICY "team_goals_admin_update" ON public.team_goals
FOR UPDATE TO authenticated
USING (public.is_org_admin(org_id) OR public.has_permission(org_id, 'manage_office_goals'))
WITH CHECK (public.is_org_admin(org_id) OR public.has_permission(org_id, 'manage_office_goals'));

DROP POLICY IF EXISTS "team_goals_admin_delete" ON public.team_goals;
CREATE POLICY "team_goals_admin_delete" ON public.team_goals
FOR DELETE TO authenticated
USING (public.is_org_admin(org_id) OR public.has_permission(org_id, 'manage_office_goals'));