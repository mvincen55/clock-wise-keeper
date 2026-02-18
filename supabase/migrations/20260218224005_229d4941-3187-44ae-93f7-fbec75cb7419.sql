
-- PTO request type enum
CREATE TYPE public.pto_request_type AS ENUM ('pto', 'sick', 'unpaid', 'other');

-- PTO request status enum
CREATE TYPE public.pto_request_status AS ENUM ('pending', 'approved', 'denied', 'cancelled');

-- PTO transaction type enum
CREATE TYPE public.pto_transaction_type AS ENUM ('accrual', 'taken', 'adjustment');

-- PTO transaction source enum
CREATE TYPE public.pto_transaction_source AS ENUM ('system', 'manager', 'request');

-- ===================== pto_requests =====================
CREATE TABLE public.pto_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.orgs(id),
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  created_by UUID NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  hours_requested NUMERIC,
  pto_type public.pto_request_type NOT NULL DEFAULT 'pto',
  note TEXT NOT NULL,
  status public.pto_request_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  manager_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pto_request_dates_valid CHECK (end_date >= start_date),
  CONSTRAINT pto_request_note_required CHECK (length(trim(note)) >= 1)
);

ALTER TABLE public.pto_requests ENABLE ROW LEVEL SECURITY;

-- Employee can create their own requests
CREATE POLICY "Employee creates own PTO requests"
  ON public.pto_requests FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Employee can view own requests
CREATE POLICY "Employee sees own PTO requests"
  ON public.pto_requests FOR SELECT
  USING (auth.uid() = created_by);

-- Employee can cancel own pending requests
CREATE POLICY "Employee cancels own pending PTO requests"
  ON public.pto_requests FOR UPDATE
  USING (auth.uid() = created_by AND status = 'pending')
  WITH CHECK (status = 'cancelled');

-- Org admin full access
CREATE POLICY "Org admin manages PTO requests"
  ON public.pto_requests FOR ALL
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

-- Trigger for updated_at
CREATE TRIGGER update_pto_requests_updated_at
  BEFORE UPDATE ON public.pto_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Validation trigger: manager_note required when denied
CREATE OR REPLACE FUNCTION public.validate_pto_request_denial()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path = 'public'
AS $$
BEGIN
  IF NEW.status = 'denied' THEN
    IF NEW.manager_note IS NULL OR length(trim(NEW.manager_note)) < 5 THEN
      RAISE EXCEPTION 'manager_note is required when denying a PTO request (min 5 chars)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_pto_request_denial_trigger
  BEFORE UPDATE ON public.pto_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_pto_request_denial();

-- ===================== pto_transactions =====================
CREATE TABLE public.pto_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.orgs(id),
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  transaction_date DATE NOT NULL,
  hours NUMERIC NOT NULL,
  transaction_type public.pto_transaction_type NOT NULL,
  source public.pto_transaction_source NOT NULL DEFAULT 'system',
  source_id UUID,
  reason TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pto_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employee sees own PTO transactions"
  ON public.pto_transactions FOR SELECT
  USING (public.can_access_employee(employee_id));

CREATE POLICY "Org admin manages PTO transactions"
  ON public.pto_transactions FOR ALL
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

-- ===================== Extend days_off =====================
ALTER TABLE public.days_off
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS request_id UUID REFERENCES public.pto_requests(id);
