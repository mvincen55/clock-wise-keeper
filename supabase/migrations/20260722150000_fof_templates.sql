-- Financial Options Form (FOF) builder — DE-IDENTIFIED CONFIGURATION ONLY.
-- HIPAA: deliberately NO patient tables. Patient-entered FOF data lives only
-- in browser memory and goes straight to the printer; it is never persisted.

CREATE TABLE public.fof_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE REFERENCES public.orgs(id) ON DELETE CASCADE,
  practice_name text NOT NULL DEFAULT 'Harelick Dental Associates, LLC',
  address_line1 text NOT NULL DEFAULT '278 Alden Road',
  address_line2 text NOT NULL DEFAULT 'Fairhaven, MA 02719',
  phone text NOT NULL DEFAULT '(508) 993-0515',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.fof_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  discount_percent numeric(5,2) NOT NULL DEFAULT 10.00,
  discount_label text NOT NULL DEFAULT 'Office Discount (Prepay discount)',
  show_insurance_estimate boolean NOT NULL DEFAULT false,
  show_write_off boolean NOT NULL DEFAULT false,
  show_prepay_option boolean NOT NULL DEFAULT true,
  show_installment_option boolean NOT NULL DEFAULT true,
  installment_count int NOT NULL DEFAULT 3 CHECK (installment_count BETWEEN 1 AND 6),
  installment_labels jsonb NOT NULL DEFAULT
    '["Visit 1 (Upon scheduling)","Visit 2 (Prep date)","Visit 3 (On delivery)"]'::jsonb,
  footnotes jsonb NOT NULL DEFAULT '[]'::jsonb,
  signature_intro text NOT NULL DEFAULT
    'has read this Financial Options Form in its entirety and agrees to the following plan:',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fof_templates_org ON public.fof_templates(org_id, sort_order);

ALTER TABLE public.fof_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fof_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read fof_settings"
  ON public.fof_settings FOR SELECT
  TO authenticated
  USING (is_org_member(org_id));

CREATE POLICY "Members manage fof_settings"
  ON public.fof_settings FOR ALL
  TO authenticated
  USING (is_org_member(org_id))
  WITH CHECK (is_org_member(org_id));

CREATE POLICY "Members read fof_templates"
  ON public.fof_templates FOR SELECT
  TO authenticated
  USING (is_org_member(org_id));

CREATE POLICY "Members manage fof_templates"
  ON public.fof_templates FOR ALL
  TO authenticated
  USING (is_org_member(org_id))
  WITH CHECK (is_org_member(org_id));

CREATE TRIGGER trg_fof_settings_updated_at
  BEFORE UPDATE ON public.fof_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_fof_templates_updated_at
  BEFORE UPDATE ON public.fof_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
