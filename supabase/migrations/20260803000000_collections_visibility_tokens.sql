-- Practice Settings > Collections Visibility: the app reads/writes
-- 'everyone' / 'admin_only', but the column was created with
-- CHECK (collections_visibility IN ('team','admins')) and DEFAULT 'team'.
-- Saving from the UI violated org_practice_settings_visibility_check, and
-- the stored 'team' matched no dropdown option, so the select rendered blank.
-- Recreate the constraint around the app's tokens and remap existing rows.

ALTER TABLE public.org_practice_settings
  DROP CONSTRAINT IF EXISTS org_practice_settings_visibility_check;

UPDATE public.org_practice_settings
SET collections_visibility = CASE collections_visibility
  WHEN 'team' THEN 'everyone'
  WHEN 'admins' THEN 'admin_only'
  ELSE collections_visibility
END
WHERE collections_visibility IN ('team', 'admins');

ALTER TABLE public.org_practice_settings
  ALTER COLUMN collections_visibility SET DEFAULT 'everyone';

ALTER TABLE public.org_practice_settings
  ADD CONSTRAINT org_practice_settings_visibility_check
  CHECK (collections_visibility IN ('everyone', 'admin_only'));
