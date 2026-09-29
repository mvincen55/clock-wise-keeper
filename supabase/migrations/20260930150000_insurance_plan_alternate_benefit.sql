-- Per-plan alternate-benefit (downgrade) override for the Financial
-- Options Form. De-identified office configuration: a saved insurance plan
-- may say whether it downgrades posterior composite fillings to the amalgam
-- benefit. NULL means the plan follows the office-wide FOF setting
-- (fof_settings.downgrade_default_on); true/false is this plan's own rule.
-- Additive and idempotent; no data changes. Existing RLS
-- (members read, owners/managers manage) covers the new column.
ALTER TABLE public.insurance_plans
  ADD COLUMN IF NOT EXISTS alternate_benefit_downgrade boolean;

COMMENT ON COLUMN public.insurance_plans.alternate_benefit_downgrade IS
  'NULL = follow fof_settings.downgrade_default_on; true/false = this plan''s own alternate-benefit (amalgam downgrade) rule on the FOF.';
