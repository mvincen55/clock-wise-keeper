-- Incident Reports: the office injury / exposure log — sharps sticks,
-- blood and body-fluid exposures, falls, chemical and equipment events.
--
-- Every report is filed AGAINST an employee (the person involved) and
-- lives in that employee's record. Staff file for themselves; owners and
-- managers file for anyone. Visibility mirrors can_access_employee():
-- the employee the report is about, plus the org's owners and managers.
-- No one else on the team sees it.
--
-- SCOPE: workplace safety only. NO PATIENT IDENTIFIERS belong in any
-- field — a source-patient follow-up is tracked as a yes/no flag and
-- manager notes, never a name, chart number, or test result.

CREATE TABLE public.incident_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,

  -- Whose record this files under: the person the incident happened to.
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,

  -- Who wrote it. Employees may only write for themselves, so for them
  -- reported_by_employee_id = employee_id; admins may write for anyone.
  reported_by uuid NOT NULL,
  reported_by_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  reported_by_name text NOT NULL DEFAULT '',

  -- When it happened (Eastern calendar date; time is wall-clock as typed,
  -- null when nobody remembers the exact minute).
  incident_date date NOT NULL,
  incident_time time,

  category text NOT NULL DEFAULT 'other' CHECK (category IN (
    'sharps_injury',
    'blood_body_fluid_exposure',
    'slip_trip_fall',
    'chemical_exposure',
    'equipment_malfunction',
    'patient_related',
    'ergonomic_strain',
    'illness',
    'other'
  )),
  severity text NOT NULL DEFAULT 'minor' CHECK (severity IN ('minor', 'moderate', 'severe')),

  -- Where in the office: "Operatory 2", "Sterilization", "Front desk".
  location text NOT NULL DEFAULT '',
  description text NOT NULL,
  body_part text NOT NULL DEFAULT '',

  -- OSHA sharps log wants the device: "Hu-Friedy scaler", "explorer",
  -- "27g needle". Doubles as the equipment name for other categories.
  device_involved text NOT NULL DEFAULT '',
  ppe_worn text NOT NULL DEFAULT 'unknown'
    CHECK (ppe_worn IN ('yes', 'no', 'partial', 'unknown', 'na')),
  witnesses text NOT NULL DEFAULT '',
  immediate_action text NOT NULL DEFAULT '',
  medical_treatment text NOT NULL DEFAULT 'none' CHECK (medical_treatment IN (
    'none', 'first_aid', 'provider_visit', 'emergency_room', 'declined', 'pending'
  )),

  -- Exposure follow-up (source testing, bloodwork, vaccination status) is
  -- a flag plus manager notes. Health details about any individual — the
  -- employee's or a patient's — stay out of this table.
  follow_up_required boolean NOT NULL DEFAULT false,
  follow_up_notes text NOT NULL DEFAULT '',
  work_related boolean NOT NULL DEFAULT true,
  days_away int NOT NULL DEFAULT 0 CHECK (days_away >= 0),

  -- Manager workflow. Employees never move these (guard trigger below).
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'closed')),
  reviewed_by uuid,
  reviewed_by_name text NOT NULL DEFAULT '',
  reviewed_at timestamptz,
  review_notes text NOT NULL DEFAULT '',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_incident_reports_employee
  ON public.incident_reports(employee_id, incident_date DESC);
CREATE INDEX idx_incident_reports_org
  ON public.incident_reports(org_id, incident_date DESC);
CREATE INDEX idx_incident_reports_open
  ON public.incident_reports(org_id, status)
  WHERE status <> 'closed';

ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY;

-- Read: the employee the report is about, plus owners/managers. This is
-- exactly can_access_employee() — the same gate punches and attendance use.
CREATE POLICY "Subject and admins read incident_reports"
  ON public.incident_reports FOR SELECT
  TO authenticated
  USING (public.can_access_employee(employee_id));

-- File: admins for anyone in their org, everyone else for themselves only.
-- The employees lookup is qualified with the table name on purpose — an
-- unqualified org_id inside the subquery would bind to e.org_id and
-- compare the column to itself, letting a report point across orgs.
CREATE POLICY "Members file incident_reports"
  ON public.incident_reports FOR INSERT
  TO authenticated
  WITH CHECK (
    is_org_member(org_id)
    AND reported_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = incident_reports.employee_id
        AND e.org_id = incident_reports.org_id
        AND (e.user_id = auth.uid() OR is_org_admin(incident_reports.org_id))
    )
  );

-- Admins correct, review, and close anything in their org.
CREATE POLICY "Admins update incident_reports"
  ON public.incident_reports FOR UPDATE
  TO authenticated
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

-- The author keeps editing their own account of what happened while the
-- report is still open. The guard trigger keeps them out of the review
-- fields and stops them re-filing the report under someone else.
CREATE POLICY "Authors update own open incident_reports"
  ON public.incident_reports FOR UPDATE
  TO authenticated
  USING (reported_by = auth.uid() AND status = 'open')
  WITH CHECK (reported_by = auth.uid() AND status = 'open');

CREATE POLICY "Admins delete incident_reports"
  ON public.incident_reports FOR DELETE
  TO authenticated
  USING (is_org_admin(org_id));

-- Same shape as guard_employee_tardy_update: RLS says who may touch the
-- row, the trigger says which columns.
CREATE OR REPLACE FUNCTION public.guard_incident_report_update()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN RETURN NEW; END IF;
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

DROP TRIGGER IF EXISTS trg_guard_incident_report_update ON public.incident_reports;
CREATE TRIGGER trg_guard_incident_report_update
BEFORE UPDATE ON public.incident_reports
FOR EACH ROW EXECUTE FUNCTION public.guard_incident_report_update();

CREATE TRIGGER trg_incident_reports_updated_at
  BEFORE UPDATE ON public.incident_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- employees: managers could not list their own team.
--
-- SELECT on employees was limited to "the linked user sees self" and "the
-- org's CREATOR manages everything" — so a manager who did not create the
-- org read an empty roster. Filing a report for someone else needs that
-- roster, and so do Team / Reports / Approvals, which are already gated on
-- is_org_admin in the UI. Owners and managers already read the whole org's
-- punches, time entries, attendance, and tardies; this brings the roster
-- in line with that posture. Employees still see only themselves.
-- ============================================================
CREATE POLICY "Admins read employees"
  ON public.employees FOR SELECT
  TO authenticated
  USING (is_org_admin(org_id));
