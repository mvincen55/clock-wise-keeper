-- PR 1B — Integrity hardening for the PR 1A canonical foundations.
--
-- Closes the database-level gaps the PR 1A review identified:
--   1. org_providers: a provider may only link to an employee of the SAME org,
--      org identity is immutable after creation, and display names are trimmed
--      and never blank. Enforced here, not just in the UI.
--   2. procedure_meta: codes are trimmed + uppercased at the database (so
--      case-only duplicates collapse into the org_id+code unique constraint),
--      blank codes are rejected, org/code identity is immutable after creation
--      (corrections = deactivate old row + create new one, so the fof_code_names
--      compatibility cache never strands stale rows), and the metadata
--      invariants are enforced: needs_surfaces requires needs_teeth,
--      per_surface requires teeth+surfaces, per_tooth requires teeth.
--   3. fof_settings.doctor_names sync: guaranteed to work even when the org has
--      no fof_settings row yet (upsert instead of bare UPDATE; fof_settings has
--      UNIQUE(org_id) and every other column is defaulted).
--   4. employees.tag: case-insensitive uniqueness directly on the live column
--      as defense in depth (the registration trigger + employee_tags unique
--      index already prevent case-variant reuse, but the live column's own
--      unique index was case-sensitive).
--
-- Replay-safe: every trigger is dropped before creation; functions use
-- CREATE OR REPLACE; the new index uses IF NOT EXISTS.

-- 1) Provider integrity -------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_provider_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    RAISE EXCEPTION 'A provider cannot move to a different office'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.display_name := trim(NEW.display_name);
  IF NEW.display_name = '' THEN
    RAISE EXCEPTION 'Provider name is required'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.employee_id IS NOT NULL THEN
    PERFORM 1 FROM public.employees e
    WHERE e.id = NEW.employee_id AND e.org_id = NEW.org_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'A provider can only be linked to a team member of the same office'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_provider_integrity() FROM anon, authenticated;

DROP TRIGGER IF EXISTS org_providers_enforce_integrity ON public.org_providers;
CREATE TRIGGER org_providers_enforce_integrity
  BEFORE INSERT OR UPDATE ON public.org_providers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_provider_integrity();

-- 2) Procedure metadata integrity --------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_procedure_meta_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.code := upper(trim(NEW.code));
  ELSE
    IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN
      RAISE EXCEPTION 'A procedure cannot move to a different office'
        USING ERRCODE = 'check_violation';
    END IF;
    IF upper(trim(NEW.code)) IS DISTINCT FROM OLD.code THEN
      RAISE EXCEPTION 'A procedure code is permanent. Deactivate this row and create the corrected code instead.'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.code := OLD.code;
  END IF;

  IF NEW.code = '' THEN
    RAISE EXCEPTION 'Procedure code is required'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.patient_name := trim(NEW.patient_name);
  NEW.internal_description := trim(NEW.internal_description);

  -- Metadata invariants (mirrored in src/lib/procedures.ts::validateProcedureMeta).
  IF NEW.needs_surfaces AND NOT NEW.needs_teeth THEN
    RAISE EXCEPTION 'Surface selection requires tooth selection'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.quantity_strategy = 'per_surface' AND NOT (NEW.needs_teeth AND NEW.needs_surfaces) THEN
    RAISE EXCEPTION 'A per-surface code must require teeth and surfaces'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.quantity_strategy = 'per_tooth' AND NOT NEW.needs_teeth THEN
    RAISE EXCEPTION 'A per-tooth code must require teeth'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_procedure_meta_integrity() FROM anon, authenticated;

DROP TRIGGER IF EXISTS procedure_meta_enforce_integrity ON public.procedure_meta;
CREATE TRIGGER procedure_meta_enforce_integrity
  BEFORE INSERT OR UPDATE ON public.procedure_meta
  FOR EACH ROW EXECUTE FUNCTION public.enforce_procedure_meta_integrity();

-- 3) doctor_names sync works without a pre-existing fof_settings row ----------

CREATE OR REPLACE FUNCTION public.sync_fof_doctor_names()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := COALESCE(NEW.org_id, OLD.org_id);
  v_names jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(display_name ORDER BY sort_order, display_name), '[]'::jsonb)
  INTO v_names
  FROM public.org_providers
  WHERE org_id = v_org AND active AND provider_type = 'doctor';

  -- fof_settings has UNIQUE(org_id) and defaults for every other column, so
  -- the compatibility cache can be created on demand for a brand-new org.
  INSERT INTO public.fof_settings (org_id, doctor_names)
  VALUES (v_org, v_names)
  ON CONFLICT (org_id) DO UPDATE SET doctor_names = EXCLUDED.doctor_names;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_fof_doctor_names() FROM anon, authenticated;

-- 4) Case-insensitive uniqueness on the live staff-code column ----------------

CREATE UNIQUE INDEX IF NOT EXISTS employees_tag_ci_unique_idx
  ON public.employees (org_id, upper(tag))
  WHERE tag IS NOT NULL;
