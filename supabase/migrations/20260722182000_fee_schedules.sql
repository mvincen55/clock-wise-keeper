-- Fee schedules and insurance plans powering the itemized Financial
-- Options Form builder. DE-IDENTIFIED CONFIGURATION ONLY: procedure codes,
-- office/carrier fees, and plan rules. Patient-specific values (remaining
-- deductible, remaining annual max, chosen procedures) are entered at form
-- time and live only in browser memory — never persisted.

CREATE TABLE public.fee_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'carrier' CHECK (kind IN ('office', 'carrier')),
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.fee_schedule_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.fee_schedules(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  code text NOT NULL,
  description text NOT NULL DEFAULT '',
  fee_cents int NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('preventive', 'basic', 'major', 'other')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, code)
);

CREATE TABLE public.insurance_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  fee_schedule_id uuid REFERENCES public.fee_schedules(id) ON DELETE SET NULL,
  preventive_pct int NOT NULL DEFAULT 100 CHECK (preventive_pct BETWEEN 0 AND 100),
  basic_pct int NOT NULL DEFAULT 80 CHECK (basic_pct BETWEEN 0 AND 100),
  major_pct int NOT NULL DEFAULT 50 CHECK (major_pct BETWEEN 0 AND 100),
  deductible_cents int NOT NULL DEFAULT 5000,
  deductible_waived_preventive boolean NOT NULL DEFAULT true,
  annual_max_cents int NOT NULL DEFAULT 150000,
  writeoff_applies boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fee_schedules_org ON public.fee_schedules(org_id, sort_order);
CREATE INDEX idx_fee_schedule_items_schedule ON public.fee_schedule_items(schedule_id, code);
CREATE INDEX idx_insurance_plans_org ON public.insurance_plans(org_id, sort_order);

ALTER TABLE public.fee_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_schedule_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_plans ENABLE ROW LEVEL SECURITY;

-- All staff read (the builder needs fees); only owners/managers manage.
CREATE POLICY "Members read fee_schedules"
  ON public.fee_schedules FOR SELECT
  TO authenticated
  USING (is_org_member(org_id));

CREATE POLICY "Admins manage fee_schedules"
  ON public.fee_schedules FOR ALL
  TO authenticated
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

CREATE POLICY "Members read fee_schedule_items"
  ON public.fee_schedule_items FOR SELECT
  TO authenticated
  USING (is_org_member(org_id));

CREATE POLICY "Admins manage fee_schedule_items"
  ON public.fee_schedule_items FOR ALL
  TO authenticated
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

CREATE POLICY "Members read insurance_plans"
  ON public.insurance_plans FOR SELECT
  TO authenticated
  USING (is_org_member(org_id));

CREATE POLICY "Admins manage insurance_plans"
  ON public.insurance_plans FOR ALL
  TO authenticated
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

CREATE TRIGGER trg_fee_schedules_updated_at
  BEFORE UPDATE ON public.fee_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_fee_schedule_items_updated_at
  BEFORE UPDATE ON public.fee_schedule_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_insurance_plans_updated_at
  BEFORE UPDATE ON public.insurance_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
