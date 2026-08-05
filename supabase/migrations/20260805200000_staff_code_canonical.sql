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
--
-- The attribution invariant (every active auditable actor has a usable code) is
-- NOT enforced by silently mutating production tags. A canonical staff code is
-- office-assigned, so the system must never turn a person's name into an
-- official identifier on its own. Instead, active members missing a code are
-- surfaced in a manager-only attention list in the app, where a manager
-- confirms a suggested code (see StaffCodeAttentionCard / useStaffCodes).
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

-- Staff codes are office-assigned: only a manager/owner (or a server/service
-- context such as accept-invite and these backfills) may set or change a tag.
-- A non-admin authenticated member — e.g. someone in onboarding — is rejected
-- at the database, independent of any UI.
CREATE OR REPLACE FUNCTION public.enforce_tag_admin_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tag IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.tag IS DISTINCT FROM OLD.tag) THEN
    -- auth.uid() is NULL for service-role/server writes (allowed); an
    -- authenticated caller must be an admin of the row's org.
    IF auth.uid() IS NOT NULL AND NOT public.is_org_admin(NEW.org_id) THEN
      RAISE EXCEPTION 'Only a manager or owner can assign a staff code'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_tag_admin_only() FROM anon, authenticated;

DROP TRIGGER IF EXISTS employees_enforce_tag_admin_only ON public.employees;
CREATE TRIGGER employees_enforce_tag_admin_only
  BEFORE INSERT OR UPDATE OF tag ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tag_admin_only();

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

-- Authoritative staff directory with REAL org-membership status, so the app can
-- accurately tell an active auditable actor from a loginless/inactive/former/
-- removed/invited one. SECURITY DEFINER (the org_members read policies only
-- expose your own + admin rows), gated so a caller only sees their own org.
CREATE OR REPLACE FUNCTION public.org_staff_directory(p_org_id uuid)
RETURNS TABLE (
  employee_id uuid,
  user_id uuid,
  display_name text,
  tag text,
  employment_status text,
  membership_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.user_id, e.display_name, e.tag,
         e.employment_status::text, m.status::text
  FROM public.employees e
  LEFT JOIN public.org_members m
    ON m.org_id = e.org_id AND m.user_id = e.user_id
  WHERE e.org_id = p_org_id
    AND public.is_org_member(p_org_id);
$$;

REVOKE EXECUTE ON FUNCTION public.org_staff_directory(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.org_staff_directory(uuid) TO authenticated;

COMMENT ON COLUMN public.profiles.initials IS
  'DEPRECATED: replaced by the canonical office-assigned staff code employees.tag. Kept for backward compatibility; no longer written by the app.';
