
-- 1. Create enum for modification source
CREATE TYPE public.modification_source AS ENUM ('employee_request', 'manager_edit', 'system');

-- 2. Create enum for correction request status
CREATE TYPE public.correction_request_status AS ENUM ('pending', 'approved', 'denied', 'applied');

-- 3. Create correction_requests table
CREATE TABLE public.correction_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  created_by uuid NOT NULL,
  target_table text NOT NULL,
  target_id uuid NOT NULL,
  proposed_change jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL CHECK (length(trim(reason)) >= 10),
  status public.correction_request_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.correction_requests ENABLE ROW LEVEL SECURITY;

-- Employee can create and view own requests
CREATE POLICY "Employee creates correction requests"
  ON public.correction_requests FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Employee sees own correction requests"
  ON public.correction_requests FOR SELECT
  USING (auth.uid() = created_by);

-- Org admin manages all requests
CREATE POLICY "Org admin manages correction requests"
  ON public.correction_requests FOR ALL
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

-- Org creator manages all requests
CREATE POLICY "Org creator manages correction requests"
  ON public.correction_requests FOR ALL
  USING (EXISTS (SELECT 1 FROM orgs WHERE orgs.id = correction_requests.org_id AND orgs.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM orgs WHERE orgs.id = correction_requests.org_id AND orgs.created_by = auth.uid()));

-- 4. Extend audit_events with governance fields
ALTER TABLE public.audit_events
  ADD COLUMN IF NOT EXISTS action_type text,
  ADD COLUMN IF NOT EXISTS target_table text,
  ADD COLUMN IF NOT EXISTS target_id uuid,
  ADD COLUMN IF NOT EXISTS before_json jsonb,
  ADD COLUMN IF NOT EXISTS after_json jsonb,
  ADD COLUMN IF NOT EXISTS reason text;

-- 5. Extend attendance_day_status with modification tracking
ALTER TABLE public.attendance_day_status
  ADD COLUMN IF NOT EXISTS has_modification boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_modified_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_modified_by uuid,
  ADD COLUMN IF NOT EXISTS modification_source public.modification_source;

-- 6. Validation trigger: deny resolution requires resolution_note
CREATE OR REPLACE FUNCTION public.validate_correction_resolution()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'denied' THEN
    IF NEW.resolution_note IS NULL OR length(trim(NEW.resolution_note)) < 10 THEN
      RAISE EXCEPTION 'resolution_note (min 10 chars) is required when denying a correction request';
    END IF;
  END IF;
  IF NEW.status IN ('approved', 'applied') AND NEW.reviewed_by IS NULL THEN
    RAISE EXCEPTION 'reviewed_by is required when approving a correction request';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_correction_resolution
  BEFORE UPDATE ON public.correction_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_correction_resolution();

-- 7. Index for fast queue lookups
CREATE INDEX idx_correction_requests_org_status ON public.correction_requests(org_id, status);
CREATE INDEX idx_correction_requests_employee ON public.correction_requests(employee_id);
CREATE INDEX idx_audit_events_target ON public.audit_events(target_table, target_id);
