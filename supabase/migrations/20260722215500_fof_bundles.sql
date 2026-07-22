-- Named procedure bundles ("Implant", "Denture", "Crown"...) — reusable
-- groups of CDT codes that expand into builder lines with current fees.
-- De-identified configuration only.

CREATE TABLE public.fof_procedure_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fof_bundles_org ON public.fof_procedure_bundles(org_id, sort_order);

ALTER TABLE public.fof_procedure_bundles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read fof_procedure_bundles"
  ON public.fof_procedure_bundles FOR SELECT
  TO authenticated
  USING (is_org_member(org_id));

CREATE POLICY "Admins manage fof_procedure_bundles"
  ON public.fof_procedure_bundles FOR ALL
  TO authenticated
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

CREATE TRIGGER trg_fof_bundles_updated_at
  BEFORE UPDATE ON public.fof_procedure_bundles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
