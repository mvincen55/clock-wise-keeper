-- PR 1A — Canonical office-assigned staff code.
--
-- We consolidate on the existing employees.tag (org-scoped, unique, permanent
-- registry) as the ONE canonical staff code. This migration:
--   1. Enforces the office rule of 3-4 uppercase chars for any NEW or EDITED
--      tag, while GRANDFATHERING existing 2-char tags (e.g. legacy "ME") so the
--      migration never fails. Legacy tags are surfaced to managers in-app and
--      must be updated to 3-4 chars the next time they are edited.
--   2. Backfills employees.tag from the deprecated profiles.initials ONLY when
--      the employee tag is empty AND the initial is already a valid 3-4 code.
--      It never overwrites a manager-assigned tag.
--   3. Enforces the attribution invariant: every active org member who can
--      perform auditable actions gets a usable tag. Active-member employees
--      missing a tag are auto-assigned a suggested unique 3-char code (managers
--      can change it; it is flagged in-app as auto-suggested).
--
-- profiles.initials is now DEPRECATED (kept for backward compatibility; the app
-- stops writing it). All attribution flows through the shared staff-code helper.
--
-- Additive + idempotent. Backfills operate on existing data only, so a
-- replay-from-zero on an empty database is a no-op.

-- 1) Format enforcement: 3-4 chars for new/changed tags, grandfather the rest.
CREATE OR REPLACE FUNCTION public.enforce_employee_tag_format()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.tag IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.tag IS DISTINCT FROM OLD.tag) THEN
    IF NEW.tag !~ '^[A-Z0-9]{3,4}$' THEN
      RAISE EXCEPTION
        'Staff code must be 3-4 uppercase letters or digits (got %)', NEW.tag
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_employee_tag_format() FROM anon, authenticated;

DROP TRIGGER IF EXISTS employees_enforce_tag_format ON public.employees;
CREATE TRIGGER employees_enforce_tag_format
  BEFORE INSERT OR UPDATE OF tag ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.enforce_employee_tag_format();

-- 2) Backfill tag from a valid 3-4 profiles.initials where the tag is empty.
--    Never overwrites an existing (manager-assigned) tag.
UPDATE public.employees e
SET tag = upper(p.initials)
FROM public.profiles p
WHERE e.user_id = p.id
  AND (e.tag IS NULL OR e.tag = '')
  AND p.initials IS NOT NULL
  AND upper(p.initials) ~ '^[A-Z0-9]{3,4}$'
  -- avoid colliding with a tag already reserved in this org's registry
  AND NOT EXISTS (
    SELECT 1 FROM public.employee_tags t
    WHERE t.org_id = e.org_id AND upper(t.tag) = upper(p.initials)
  );

-- 3) Enforce the attribution invariant: auto-assign a suggested unique 3-char
--    code to every active-member employee that still has no tag.
DO $$
DECLARE
  rec RECORD;
  base TEXT;
  candidate TEXT;
  suffix INT;
BEGIN
  FOR rec IN
    SELECT e.id, e.org_id, e.display_name
    FROM public.employees e
    JOIN public.org_members m
      ON m.org_id = e.org_id AND m.user_id = e.user_id AND m.status = 'active'
    WHERE e.user_id IS NOT NULL
      AND (e.tag IS NULL OR e.tag = '')
  LOOP
    -- First 3 alphanumerics of the name, uppercased, padded with 'X'.
    base := upper(regexp_replace(coalesce(rec.display_name, ''), '[^A-Za-z0-9]', '', 'g'));
    base := left(base, 3);
    WHILE length(base) < 3 LOOP base := base || 'X'; END LOOP;

    candidate := base;
    suffix := 1;
    -- Ensure org-unique against live tags AND the permanent registry.
    WHILE EXISTS (
            SELECT 1 FROM public.employees x
            WHERE x.org_id = rec.org_id AND upper(x.tag) = candidate
          )
          OR EXISTS (
            SELECT 1 FROM public.employee_tags t
            WHERE t.org_id = rec.org_id AND upper(t.tag) = candidate
          )
    LOOP
      -- Replace last char with a digit to stay within 3 chars.
      candidate := left(base, 2) || suffix::text;
      suffix := suffix + 1;
      IF suffix > 9 THEN
        candidate := left(base, 1) || lpad(suffix::text, 2, '0');
      END IF;
      EXIT WHEN suffix > 99; -- give up gracefully; leave untagged for manual fix
    END LOOP;

    IF candidate ~ '^[A-Z0-9]{3,4}$'
       AND NOT EXISTS (
         SELECT 1 FROM public.employees x
         WHERE x.org_id = rec.org_id AND upper(x.tag) = candidate
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.employee_tags t
         WHERE t.org_id = rec.org_id AND upper(t.tag) = candidate
       ) THEN
      UPDATE public.employees SET tag = candidate WHERE id = rec.id;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON COLUMN public.profiles.initials IS
  'DEPRECATED: replaced by the canonical office-assigned staff code employees.tag. Kept for backward compatibility; no longer written by the app.';
