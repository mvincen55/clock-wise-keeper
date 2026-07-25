-- Genericization Phase 2 (final bucket): PTO accrual tiers become org
-- rows — the same pattern as discount rules. The tiers move accrual
-- math, so values carry CHECK bounds and the PTO ledger snapshot test
-- guards the engine. Shipped defaults (seeded for existing orgs) are
-- the original office's policy.

CREATE TABLE public.pto_accrual_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  min_years numeric(5,2) NOT NULL CHECK (min_years >= 0),
  max_years numeric(5,2) NOT NULL CHECK (max_years > min_years),
  -- Accrued PTO hours per basis hour (capped worked + PTO taken).
  rate numeric(6,4) NOT NULL CHECK (rate BETWEEN 0 AND 1),
  -- Max accrued hours per week at this tier.
  weekly_cap numeric(5,2) NOT NULL CHECK (weekly_cap BETWEEN 0 AND 40),
  label text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pto_accrual_tiers_org ON public.pto_accrual_tiers(org_id, sort_order);

ALTER TABLE public.pto_accrual_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read pto_accrual_tiers"
  ON public.pto_accrual_tiers FOR SELECT
  TO authenticated
  USING (is_org_member(org_id));

CREATE POLICY "Admins manage pto_accrual_tiers"
  ON public.pto_accrual_tiers FOR ALL
  TO authenticated
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

CREATE TRIGGER trg_pto_accrual_tiers_updated_at
  BEFORE UPDATE ON public.pto_accrual_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed every existing org with the shipped tiers.
INSERT INTO public.pto_accrual_tiers (org_id, min_years, max_years, rate, weekly_cap, label, sort_order)
SELECT o.id, t.min_years, t.max_years, t.rate, t.weekly_cap, t.label, t.sort_order
FROM public.orgs o
CROSS JOIN (VALUES
  (0.00, 1.00, 0.0576, 2.30, 'Year 1', 0),
  (1.00, 5.00, 0.0769, 3.08, 'Years 2–5', 1),
  (5.00, 11.00, 0.0962, 3.85, 'Year 6–11', 2),
  (11.00, 999.00, 0.1009, 4.00, 'Year 12+', 3)
) AS t(min_years, max_years, rate, weekly_cap, label, sort_order);
