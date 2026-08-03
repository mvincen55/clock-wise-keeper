-- Broken Appointments module — DE-IDENTIFIED CONFIGURATION ONLY.
-- HIPAA: deliberately NO patient tables (same boundary as the FOF, see
-- 20260722150000_fof_templates.sql). Patient-entered wizard data lives only
-- in browser memory and goes straight to the printer or the clipboard; it
-- is never persisted or transmitted.

-- One row per org: fee/notice/rung parameters and per-office wording.
CREATE TABLE public.broken_appt_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE REFERENCES public.orgs(id) ON DELETE CASCADE,
  fee_amount numeric(8,2) NOT NULL DEFAULT 75,
  notice_business_hours int NOT NULL DEFAULT 48,
  history_window_years int NOT NULL DEFAULT 5,
  vip_prepay_floor numeric(8,2) NOT NULL DEFAULT 150,
  -- Blank = fall back to org_branding.phone (identity lives on org_branding).
  office_phone text NOT NULL DEFAULT '',
  -- ISO dates (besides weekends) excluded from business-hour notice math.
  office_closed_dates jsonb NOT NULL DEFAULT '[]'::jsonb,
  module_nav_label text NOT NULL DEFAULT 'Broken Appointments',
  -- Letter closing. Shipped with the reference office's wording; blank
  -- signature_name falls back to the practice name at render time.
  signature_name text NOT NULL DEFAULT 'Megan Vincent',
  signature_title text NOT NULL DEFAULT 'Office Manager',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Letter and text-reply templates ({{merge_field}} placeholders only —
-- patient values are merged in the browser at render time).
CREATE TABLE public.broken_appt_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('letter', 'reply')),
  code text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, kind, code)
);

CREATE INDEX idx_broken_appt_templates_org
  ON public.broken_appt_templates(org_id, kind, sort_order);

ALTER TABLE public.broken_appt_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broken_appt_templates ENABLE ROW LEVEL SECURITY;

-- Member-read / admin-write, matching the post-review FOF posture
-- (20260723170000_fof_security_review.sql).
CREATE POLICY "Members read broken_appt_settings"
  ON public.broken_appt_settings FOR SELECT
  TO authenticated
  USING (is_org_member(org_id));

CREATE POLICY "Admins manage broken_appt_settings"
  ON public.broken_appt_settings FOR ALL
  TO authenticated
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

CREATE POLICY "Members read broken_appt_templates"
  ON public.broken_appt_templates FOR SELECT
  TO authenticated
  USING (is_org_member(org_id));

CREATE POLICY "Admins manage broken_appt_templates"
  ON public.broken_appt_templates FOR ALL
  TO authenticated
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

CREATE TRIGGER trg_broken_appt_settings_updated_at
  BEFORE UPDATE ON public.broken_appt_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_broken_appt_templates_updated_at
  BEFORE UPDATE ON public.broken_appt_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
