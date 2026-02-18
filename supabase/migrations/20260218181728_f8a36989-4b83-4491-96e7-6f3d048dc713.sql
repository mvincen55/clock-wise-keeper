
-- ═══════════════════════════════════════════════════
-- PHASE 1: Organization Schema Foundation
-- ═══════════════════════════════════════════════════

-- Enums
CREATE TYPE public.app_org_role AS ENUM ('owner', 'manager', 'employee');
CREATE TYPE public.org_member_status AS ENUM ('active', 'invited', 'disabled');
CREATE TYPE public.employment_status AS ENUM ('active', 'inactive', 'terminated');
CREATE TYPE public.change_request_type AS ENUM ('punch_edit', 'day_off', 'schedule_change', 'other');
CREATE TYPE public.change_request_status AS ENUM ('pending', 'approved', 'denied');
CREATE TYPE public.report_run_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- 1. orgs
CREATE TABLE public.orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;

-- 2. org_members
CREATE TABLE public.org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role app_org_role NOT NULL DEFAULT 'employee',
  status org_member_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

-- 3. employees
CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id uuid,
  display_name text NOT NULL,
  email text,
  employment_status employment_status NOT NULL DEFAULT 'active',
  hire_date date,
  timezone text NOT NULL DEFAULT 'America/New_York',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- 4. org_invites
CREATE TABLE public.org_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  email text NOT NULL,
  role app_org_role NOT NULL DEFAULT 'employee',
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.org_invites ENABLE ROW LEVEL SECURITY;

-- 5. schedule_assignments
CREATE TABLE public.schedule_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  schedule_version_id uuid NOT NULL REFERENCES public.schedule_versions(id) ON DELETE CASCADE,
  effective_start date NOT NULL,
  effective_end date,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.schedule_assignments ENABLE ROW LEVEL SECURITY;

-- Prevent overlapping assignments per employee
ALTER TABLE public.schedule_assignments
  ADD CONSTRAINT no_overlapping_schedule_assignments
  EXCLUDE USING gist (
    employee_id WITH =,
    daterange(effective_start, COALESCE(effective_end, '9999-12-31'::date), '[]') WITH &&
  );

-- 6. change_requests (employee self-serve)
CREATE TABLE public.change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  request_type change_request_type NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  status change_request_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.change_requests ENABLE ROW LEVEL SECURITY;

-- 7. report_runs
CREATE TABLE public.report_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  report_type text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}',
  status report_run_status NOT NULL DEFAULT 'pending',
  row_count int,
  storage_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE public.report_runs ENABLE ROW LEVEL SECURITY;

-- Updated_at triggers for new tables
CREATE TRIGGER update_orgs_updated_at BEFORE UPDATE ON public.orgs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_org_members_updated_at BEFORE UPDATE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_change_requests_updated_at BEFORE UPDATE ON public.change_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════
-- TEMPORARY RLS: Allow org creators to manage their orgs
-- (Will be replaced in Phase 3 with proper membership-gated policies)
-- ═══════════════════════════════════════════════════

-- Orgs: creator can do everything
CREATE POLICY "Org creator manages org" ON public.orgs FOR ALL
  USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

-- Org members: user can see their own memberships
CREATE POLICY "Members see own memberships" ON public.org_members FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Org creator manages members" ON public.org_members FOR ALL
  USING (EXISTS (SELECT 1 FROM public.orgs WHERE id = org_id AND created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.orgs WHERE id = org_id AND created_by = auth.uid()));

-- Employees: linked user can see self
CREATE POLICY "Employee sees self" ON public.employees FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Org creator manages employees" ON public.employees FOR ALL
  USING (EXISTS (SELECT 1 FROM public.orgs WHERE id = org_id AND created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.orgs WHERE id = org_id AND created_by = auth.uid()));

-- Org invites: org creator manages
CREATE POLICY "Org creator manages invites" ON public.org_invites FOR ALL
  USING (EXISTS (SELECT 1 FROM public.orgs WHERE id = org_id AND created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.orgs WHERE id = org_id AND created_by = auth.uid()));
-- Anyone with token can read their invite (for accept flow)
CREATE POLICY "Anyone can read invite by token" ON public.org_invites FOR SELECT
  USING (true);

-- Schedule assignments: org creator manages
CREATE POLICY "Org creator manages assignments" ON public.schedule_assignments FOR ALL
  USING (EXISTS (SELECT 1 FROM public.orgs WHERE id = org_id AND created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.orgs WHERE id = org_id AND created_by = auth.uid()));

-- Change requests: requester + org managers
CREATE POLICY "Requester sees own requests" ON public.change_requests FOR SELECT
  USING (auth.uid() = requested_by);
CREATE POLICY "Requester creates requests" ON public.change_requests FOR INSERT
  WITH CHECK (auth.uid() = requested_by);
CREATE POLICY "Org creator manages requests" ON public.change_requests FOR ALL
  USING (EXISTS (SELECT 1 FROM public.orgs WHERE id = org_id AND created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.orgs WHERE id = org_id AND created_by = auth.uid()));

-- Report runs: requester + org managers
CREATE POLICY "Requester sees own reports" ON public.report_runs FOR SELECT
  USING (auth.uid() = requested_by);
CREATE POLICY "Org creator manages reports" ON public.report_runs FOR ALL
  USING (EXISTS (SELECT 1 FROM public.orgs WHERE id = org_id AND created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.orgs WHERE id = org_id AND created_by = auth.uid()));
