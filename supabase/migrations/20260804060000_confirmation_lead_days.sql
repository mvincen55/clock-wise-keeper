-- Office scheduling policy: how many days ahead the front desk confirms
-- appointments. Drives the wording of the front-desk goal starters (and any
-- future coaching copy that references the confirmation window). Lives on
-- org_practice_settings with the other office-wide toggles; member-read /
-- admin-write RLS already covers it.
ALTER TABLE public.org_practice_settings
  ADD COLUMN IF NOT EXISTS confirmation_lead_days int NOT NULL DEFAULT 2
    CHECK (confirmation_lead_days BETWEEN 1 AND 14);
