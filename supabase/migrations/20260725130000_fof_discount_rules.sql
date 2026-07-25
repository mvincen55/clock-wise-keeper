-- Genericization Phase 2b: named discount rules and code lists become
-- org rows.
--
-- Templates REFERENCE rules (senior applicability flag, membership
-- opt-in); the rule rows own the values, so turning a program off or
-- changing a rate touches one row, not every template. Everything here
-- moves dollar output, so values carry CHECK bounds. Shipped defaults
-- are the original office's proven program values.

-- 1) Discount rules: one row per (org, program).
CREATE TABLE public.fof_discount_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  -- senior: 65+ program (automatic under threshold, prepay-earned above)
  -- courtesy: under-65 prepay-in-full credit
  -- membership: in-house plan (percent auto; extra = 65+ prepay add-on)
  rule_key text NOT NULL CHECK (rule_key IN ('senior', 'courtesy', 'membership')),
  enabled boolean NOT NULL DEFAULT true,
  percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (percent BETWEEN 0 AND 100),
  -- membership only: the 65+ prepay-in-full add-on percent.
  extra_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (extra_percent BETWEEN 0 AND 100),
  -- senior only: the portion threshold the program pivots on.
  threshold_cents integer NOT NULL DEFAULT 100000 CHECK (threshold_cents BETWEEN 0 AND 500000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, rule_key)
);

ALTER TABLE public.fof_discount_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read fof_discount_rules"
  ON public.fof_discount_rules FOR SELECT
  TO authenticated
  USING (is_org_member(org_id));

CREATE POLICY "Admins manage fof_discount_rules"
  ON public.fof_discount_rules FOR ALL
  TO authenticated
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

CREATE TRIGGER trg_fof_discount_rules_updated_at
  BEFORE UPDATE ON public.fof_discount_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed every existing org with the shipped program values.
INSERT INTO public.fof_discount_rules (org_id, rule_key, enabled, percent, extra_percent, threshold_cents)
SELECT o.id, r.rule_key, true, r.percent, r.extra_percent, 100000
FROM public.orgs o
CROSS JOIN (VALUES
  ('senior', 10.00, 0.00),
  ('courtesy', 5.00, 0.00),
  ('membership', 10.00, 5.00)
) AS r(rule_key, percent, extra_percent)
ON CONFLICT (org_id, rule_key) DO NOTHING;

-- 2) Code lists: never-covered, no-prepay, membership-included.
CREATE TABLE public.fof_code_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('never_covered', 'no_prepay', 'membership_included')),
  code text NOT NULL CHECK (code ~ '^D[0-9]{4}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, kind, code)
);

CREATE INDEX idx_fof_code_rules_org ON public.fof_code_rules(org_id, kind);

ALTER TABLE public.fof_code_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read fof_code_rules"
  ON public.fof_code_rules FOR SELECT
  TO authenticated
  USING (is_org_member(org_id));

CREATE POLICY "Admins manage fof_code_rules"
  ON public.fof_code_rules FOR ALL
  TO authenticated
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

-- Seed every existing org with the shipped lists.
INSERT INTO public.fof_code_rules (org_id, kind, code)
SELECT o.id, c.kind, c.code
FROM public.orgs o
CROSS JOIN (VALUES
  ('never_covered', 'D4265'), ('never_covered', 'D4268'),
  ('never_covered', 'D5982'), ('never_covered', 'D7953'),
  ('no_prepay', 'D5982'),
  ('membership_included', 'D0120'), ('membership_included', 'D0140'),
  ('membership_included', 'D0150'), ('membership_included', 'D0210'),
  ('membership_included', 'D0220'), ('membership_included', 'D0230'),
  ('membership_included', 'D0272'), ('membership_included', 'D0274'),
  ('membership_included', 'D0330'), ('membership_included', 'D1110'),
  ('membership_included', 'D1120'), ('membership_included', 'D4910'),
  ('membership_included', 'D1206'), ('membership_included', 'D1208'),
  ('membership_included', 'D1351')
) AS c(kind, code)
ON CONFLICT (org_id, kind, code) DO NOTHING;
