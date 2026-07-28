-- Incident report signatures — the electronic sign-off trail.
--
-- Two signatures close the loop on a report: the employee it happened to
-- attests to the account of it, then a manager or owner countersigns.
-- Neither is a drawn image — a typed full name plus a server-stamped
-- time, carrying the same weight the signed paper form carries in the
-- safety binder.
--
-- Who countersigns depends on who the report is ABOUT, not who filed it:
-- an employee's report is signed off by any owner or manager, while a
-- manager's or an owner's own report goes up to an owner. Nobody ever
-- signs off on their own report.
--
-- Signatures move only through the two functions at the bottom of this
-- file. Direct UPDATEs — from anyone, admin or not — cannot touch them
-- (see guard_incident_report_update below), so a signature always means
-- the named person pressed sign while signed in as themselves.

ALTER TABLE public.incident_reports
  -- The employee's attestation: their typed name, when they typed it,
  -- and the auth user who was signed in at the time.
  ADD COLUMN employee_signature text NOT NULL DEFAULT '',
  ADD COLUMN employee_signed_at timestamptz,
  ADD COLUMN employee_signed_by uuid,

  -- The countersignature, plus the role that gave it (a report signed
  -- by an owner reads differently a year later than one a manager
  -- signed, and roles change).
  ADD COLUMN manager_signature text NOT NULL DEFAULT '',
  ADD COLUMN manager_signed_at timestamptz,
  ADD COLUMN manager_signed_by uuid,
  ADD COLUMN manager_signed_role text NOT NULL DEFAULT '',

  -- Who is allowed to countersign: 'manager' means any owner or manager,
  -- 'owner' means an owner only. Stamped from the subject's role when the
  -- report is filed — never client-supplied.
  ADD COLUMN countersign_role text NOT NULL DEFAULT 'manager'
    CHECK (countersign_role IN ('manager', 'owner'));

-- The queue the notification bell points at: reports still waiting on a
-- signature, newest first.
CREATE INDEX idx_incident_reports_awaiting_signature
  ON public.incident_reports(org_id, incident_date DESC)
  WHERE manager_signed_at IS NULL;

-- ============================================================
-- Which role has to countersign a report about this employee.
--
-- Managers and owners cannot clear their own reports, so anything filed
-- about one goes up to an owner; everyone else's is signed off by any
-- admin. An employee with no linked login is an ordinary employee.
-- ============================================================
CREATE OR REPLACE FUNCTION public.incident_countersign_role(_employee_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.employees e
      JOIN public.org_members m
        ON m.user_id = e.user_id AND m.org_id = e.org_id
      WHERE e.id = _employee_id
        AND m.status = 'active'
        AND m.role IN ('owner', 'manager')
    ) THEN 'owner'
    ELSE 'manager'
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.incident_countersign_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.incident_countersign_role(uuid) TO authenticated;

-- A filed report always starts unsigned, and the client never says who
-- has to sign it.
CREATE OR REPLACE FUNCTION public.stamp_incident_report_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN RETURN NEW; END IF;
  NEW.countersign_role    := public.incident_countersign_role(NEW.employee_id);
  NEW.employee_signature  := '';
  NEW.employee_signed_at  := NULL;
  NEW.employee_signed_by  := NULL;
  NEW.manager_signature   := '';
  NEW.manager_signed_at   := NULL;
  NEW.manager_signed_by   := NULL;
  NEW.manager_signed_role := '';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_incident_report_insert ON public.incident_reports;
CREATE TRIGGER trg_stamp_incident_report_insert
BEFORE INSERT ON public.incident_reports
FOR EACH ROW EXECUTE FUNCTION public.stamp_incident_report_insert();

-- ============================================================
-- The column guard, restated with the signature rules folded in.
--
-- Unchanged from the original: RLS says who may touch the row, this says
-- which columns, and non-admins stay out of the review fields.
--
-- New: signatures are set by signing, not by editing — and correcting
-- the facts of a signed report retires the signatures it invalidates,
-- because a signature only ever means "this account, as it read then".
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_incident_report_update()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  facts_changed boolean;
BEGIN
  IF current_user <> 'authenticated' THEN RETURN NEW; END IF;

  -- The sign functions run as the table owner and never reach this
  -- branch, so any signature movement here came from a plain UPDATE.
  IF NEW.employee_signature  IS DISTINCT FROM OLD.employee_signature
     OR NEW.employee_signed_at  IS DISTINCT FROM OLD.employee_signed_at
     OR NEW.employee_signed_by  IS DISTINCT FROM OLD.employee_signed_by
     OR NEW.manager_signature   IS DISTINCT FROM OLD.manager_signature
     OR NEW.manager_signed_at   IS DISTINCT FROM OLD.manager_signed_at
     OR NEW.manager_signed_by   IS DISTINCT FROM OLD.manager_signed_by
     OR NEW.manager_signed_role IS DISTINCT FROM OLD.manager_signed_role
     OR NEW.countersign_role    IS DISTINCT FROM OLD.countersign_role THEN
    RAISE EXCEPTION 'Incident report signatures are set by signing, not by editing';
  END IF;

  -- What was signed: the account of what happened. Status, review notes,
  -- and the follow-up flag are the manager's own record and move freely.
  facts_changed :=
    NEW.employee_id       IS DISTINCT FROM OLD.employee_id
    OR NEW.incident_date  IS DISTINCT FROM OLD.incident_date
    OR NEW.incident_time  IS DISTINCT FROM OLD.incident_time
    OR NEW.category       IS DISTINCT FROM OLD.category
    OR NEW.severity       IS DISTINCT FROM OLD.severity
    OR NEW.location       IS DISTINCT FROM OLD.location
    OR NEW.description    IS DISTINCT FROM OLD.description
    OR NEW.body_part      IS DISTINCT FROM OLD.body_part
    OR NEW.device_involved IS DISTINCT FROM OLD.device_involved
    OR NEW.ppe_worn       IS DISTINCT FROM OLD.ppe_worn
    OR NEW.witnesses      IS DISTINCT FROM OLD.witnesses
    OR NEW.immediate_action IS DISTINCT FROM OLD.immediate_action
    OR NEW.medical_treatment IS DISTINCT FROM OLD.medical_treatment
    OR NEW.work_related   IS DISTINCT FROM OLD.work_related
    OR NEW.days_away      IS DISTINCT FROM OLD.days_away;

  IF facts_changed THEN
    NEW.employee_signature  := '';
    NEW.employee_signed_at  := NULL;
    NEW.employee_signed_by  := NULL;
    NEW.manager_signature   := '';
    NEW.manager_signed_at   := NULL;
    NEW.manager_signed_by   := NULL;
    NEW.manager_signed_role := '';
    -- A corrected report is about whoever it now names.
    NEW.countersign_role    := public.incident_countersign_role(NEW.employee_id);
  END IF;

  IF public.is_org_admin(NEW.org_id) THEN RETURN NEW; END IF;
  IF NEW.org_id                  IS DISTINCT FROM OLD.org_id
     OR NEW.employee_id          IS DISTINCT FROM OLD.employee_id
     OR NEW.reported_by          IS DISTINCT FROM OLD.reported_by
     OR NEW.reported_by_employee_id IS DISTINCT FROM OLD.reported_by_employee_id
     OR NEW.created_at           IS DISTINCT FROM OLD.created_at
     OR NEW.status               IS DISTINCT FROM OLD.status
     OR NEW.reviewed_by          IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_by_name     IS DISTINCT FROM OLD.reviewed_by_name
     OR NEW.reviewed_at          IS DISTINCT FROM OLD.reviewed_at
     OR NEW.review_notes         IS DISTINCT FROM OLD.review_notes
     OR NEW.follow_up_notes      IS DISTINCT FROM OLD.follow_up_notes THEN
    RAISE EXCEPTION 'Only owners and managers may review, close, or reassign an incident report';
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- Signing, step one: the employee the report is about.
--
-- Only they can do this — not the manager who filed it for them, not an
-- owner. The typed name is theirs to type.
-- ============================================================
CREATE OR REPLACE FUNCTION public.sign_incident_report_employee(
  _report_id uuid,
  _typed_name text
)
RETURNS public.incident_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rpt public.incident_reports;
  clean text := btrim(coalesce(_typed_name, ''));
BEGIN
  IF clean = '' THEN
    RAISE EXCEPTION 'Type your full name to sign';
  END IF;

  SELECT * INTO rpt FROM public.incident_reports WHERE id = _report_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incident report not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = rpt.employee_id AND e.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the employee an incident report is about can sign it';
  END IF;

  IF rpt.employee_signed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This report is already signed';
  END IF;

  UPDATE public.incident_reports
     SET employee_signature = clean,
         employee_signed_at = now(),
         employee_signed_by = auth.uid()
   WHERE id = _report_id
  RETURNING * INTO rpt;

  RETURN rpt;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sign_incident_report_employee(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sign_incident_report_employee(uuid, text) TO authenticated;

-- ============================================================
-- Signing, step two: the countersignature.
--
-- An owner or manager, never the person the report is about, and an
-- owner specifically when the report is about a manager or an owner.
--
-- The one give: if the subject IS the org's only owner there is nobody
-- senior left, so any other admin may sign rather than strand the
-- report. The signed role records who actually did.
-- ============================================================
CREATE OR REPLACE FUNCTION public.countersign_incident_report(
  _report_id uuid,
  _typed_name text
)
RETURNS public.incident_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rpt public.incident_reports;
  clean text := btrim(coalesce(_typed_name, ''));
  caller_role text;
  subject_user uuid;
  owner_available boolean;
BEGIN
  IF clean = '' THEN
    RAISE EXCEPTION 'Type your full name to sign';
  END IF;

  SELECT * INTO rpt FROM public.incident_reports WHERE id = _report_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incident report not found';
  END IF;

  SELECT m.role INTO caller_role
    FROM public.org_members m
   WHERE m.org_id = rpt.org_id
     AND m.user_id = auth.uid()
     AND m.status = 'active';

  IF caller_role IS NULL OR caller_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Only an owner or manager can sign off on an incident report';
  END IF;

  SELECT e.user_id INTO subject_user
    FROM public.employees e WHERE e.id = rpt.employee_id;

  IF subject_user IS NOT NULL AND subject_user = auth.uid() THEN
    RAISE EXCEPTION 'An incident report cannot be signed off by the person it is about';
  END IF;

  IF rpt.countersign_role = 'owner' AND caller_role <> 'owner' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.org_id = rpt.org_id
        AND m.role = 'owner'
        AND m.status = 'active'
        AND (subject_user IS NULL OR m.user_id <> subject_user)
    ) INTO owner_available;

    IF owner_available THEN
      RAISE EXCEPTION 'This report is about a manager or an owner — an owner has to sign it off';
    END IF;
  END IF;

  IF rpt.manager_signed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This report has already been signed off';
  END IF;

  UPDATE public.incident_reports
     SET manager_signature   = clean,
         manager_signed_at   = now(),
         manager_signed_by   = auth.uid(),
         manager_signed_role = caller_role,
         -- Signing off is reviewing it: a report still sitting untouched
         -- has now been read by someone who can act on it.
         status = CASE WHEN status = 'open' THEN 'under_review' ELSE status END
   WHERE id = _report_id
  RETURNING * INTO rpt;

  RETURN rpt;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.countersign_incident_report(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.countersign_incident_report(uuid, text) TO authenticated;

-- Existing reports predate signing and need a countersign role that
-- matches the rule above rather than the column default.
UPDATE public.incident_reports
   SET countersign_role = public.incident_countersign_role(employee_id)
 WHERE countersign_role IS DISTINCT FROM public.incident_countersign_role(employee_id);
