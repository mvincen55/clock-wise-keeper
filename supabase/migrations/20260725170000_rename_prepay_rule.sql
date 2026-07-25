-- Phase 2 review: the provisionally-named 'courtesy' program is renamed
-- 'prepay' — it matches the printed form's language ("Prepay Discount"),
-- and "courtesy" stays a generic category term rather than any single
-- program's name.

ALTER TABLE public.fof_discount_rules
  DROP CONSTRAINT fof_discount_rules_rule_key_check;

UPDATE public.fof_discount_rules SET rule_key = 'prepay' WHERE rule_key = 'courtesy';

ALTER TABLE public.fof_discount_rules
  ADD CONSTRAINT fof_discount_rules_rule_key_check
  CHECK (rule_key IN ('senior', 'prepay', 'membership'));
