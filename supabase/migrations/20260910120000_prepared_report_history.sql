-- Report snapshots retain source definitions and unknowns for one-time historical imports.
CREATE TABLE IF NOT EXISTS public.practice_report_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  report_start date NOT NULL,
  report_end date NOT NULL,
  source_key text NOT NULL,
  payload jsonb NOT NULL,
  imported_by uuid REFERENCES auth.users(id),
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, source_key),
  CHECK (report_end >= report_start),
  CHECK (jsonb_typeof(payload) = 'object')
);
ALTER TABLE public.practice_report_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS practice_reports_admin_read ON public.practice_report_imports;
CREATE POLICY practice_reports_admin_read ON public.practice_report_imports
  FOR SELECT TO authenticated USING (public.is_org_admin(org_id));
DROP POLICY IF EXISTS practice_reports_admin_insert ON public.practice_report_imports;
CREATE POLICY practice_reports_admin_insert ON public.practice_report_imports
  FOR INSERT TO authenticated WITH CHECK (public.is_org_admin(org_id) AND imported_by = auth.uid());
DROP POLICY IF EXISTS practice_reports_admin_update ON public.practice_report_imports;
CREATE POLICY practice_reports_admin_update ON public.practice_report_imports
  FOR UPDATE TO authenticated USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id) AND imported_by = auth.uid());
GRANT SELECT, INSERT, UPDATE ON public.practice_report_imports TO authenticated;
ALTER TABLE public.deposit_logs ADD COLUMN IF NOT EXISTS other_collections_cents integer NOT NULL DEFAULT 0 CHECK (other_collections_cents >= 0);
ALTER TABLE public.deposit_logs ADD COLUMN IF NOT EXISTS missed_appointments_recorded boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.deposit_logs.other_collections_cents IS 'Verified receipts whose tender is unclassified. Included in receipts, excluded from bank cash/check subtotal.';
COMMENT ON COLUMN public.deposit_logs.missed_appointments_recorded IS 'False for source reports without daily cancellation/no-show counts. Numeric counters are not observations when false.';
