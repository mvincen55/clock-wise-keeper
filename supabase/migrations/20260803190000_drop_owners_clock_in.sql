-- The three membership types are Owner, Manager, and Team ('employee' token),
-- and owners are the only ones who never clock in — it's a property of the
-- role now, not an office setting. The "Owners clock in" toggle is gone from
-- Practice Settings, useClocksIn() derives from role alone, and the
-- checklist-bypass function exempts owners unconditionally, so the column has
-- no readers left.
--
-- APPLY AFTER the matching app code deploys: the previous build still selects
-- owners_clock_in by name in usePracticeSettings, and dropping the column
-- first would 400 that query (breaking collections visibility/target reads).

ALTER TABLE public.org_practice_settings
  DROP COLUMN IF EXISTS owners_clock_in;
