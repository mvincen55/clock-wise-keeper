-- Close the Day + Schedule Intelligence.
--
-- Expands the Deposit Log into the Close the Day workflow and adds the
-- Schedule Intelligence storage. HARD BOUNDARY: every table here stores
-- sanitized, aggregate operational data only — minutes, counts, codes,
-- ratios, and column geometry. No screenshots, no OCR text, no appointment
-- descriptions, no patient information of any kind. The screenshot itself is
-- processed in the browser and never reaches this database (see
-- src/lib/schedule-reader/).
--
-- The closeout identity is the existing deposit_logs row (one per org/day):
-- child tables reference deposit_logs.id as closeout_id. Idempotent.

-- ================================================================
-- 1. deposit_logs — Close the Day columns (seal + staffing reality)
-- ================================================================

ALTER TABLE public.deposit_logs
  ADD COLUMN IF NOT EXISTS sealed_at timestamptz,
  ADD COLUMN IF NOT EXISTS sealed_by uuid,
  ADD COLUMN IF NOT EXISTS staffing_assessment text,
  ADD COLUMN IF NOT EXISTS staffing_pressure text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS staffing_factors text[] NOT NULL DEFAULT '{}',
  -- Business-operations note only; PHI-scrubbed client-side before save.
  ADD COLUMN IF NOT EXISTS staffing_note text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS schedule_capture_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS capture_confidence numeric,
  ADD COLUMN IF NOT EXISTS needs_manager_review boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE public.deposit_logs
    ADD CONSTRAINT deposit_logs_staffing_assessment_check CHECK (
      staffing_assessment IS NULL OR staffing_assessment = ANY (ARRAY[
        'extra_coverage','about_right','stretched','understaffed','unsafe'
      ])
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.deposit_logs
    ADD CONSTRAINT deposit_logs_staffing_pressure_check CHECK (
      staffing_pressure <@ ARRAY[
        'hygiene','doctor_side','assisting','front_desk','sterilization','whole_office'
      ]
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.deposit_logs
    ADD CONSTRAINT deposit_logs_staffing_factors_check CHECK (
      staffing_factors <@ ARRAY[
        'callout_absence','provider_unavailable','schedule_too_dense',
        'too_many_columns','same_day_additions','cancellations_reshuffling',
        'new_employee_training','equipment_interruption','communication_breakdown','other'
      ]
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.deposit_logs
    ADD CONSTRAINT deposit_logs_capture_status_check CHECK (
      schedule_capture_status = ANY (ARRAY['none','processed','confirmed'])
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Same-day edits stay open to members (closing out IS the day's work).
-- After the business day, only owners/managers may edit — and the audit
-- trigger below records what changed.
DROP POLICY IF EXISTS "Members update deposit_logs" ON public.deposit_logs;
CREATE POLICY "Members update deposit_logs same day, admins later"
  ON public.deposit_logs FOR UPDATE
  TO authenticated
  USING (
    public.is_org_member(org_id)
    AND (
      deposit_date >= (now() AT TIME ZONE 'America/New_York')::date
      OR public.is_org_admin(org_id)
    )
  )
  WITH CHECK (
    public.is_org_member(org_id)
    AND (
      deposit_date >= (now() AT TIME ZONE 'America/New_York')::date
      OR public.is_org_admin(org_id)
    )
  );

-- Audit late edits to the Close the Day fields (the existing
-- log_deposit_vitals_change trigger already covers the vitals columns).
CREATE OR REPLACE FUNCTION public.log_day_close_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_changed boolean;
BEGIN
  v_changed :=
    NEW.staffing_assessment IS DISTINCT FROM OLD.staffing_assessment
    OR NEW.staffing_pressure  IS DISTINCT FROM OLD.staffing_pressure
    OR NEW.staffing_factors   IS DISTINCT FROM OLD.staffing_factors
    OR NEW.staffing_note      IS DISTINCT FROM OLD.staffing_note
    OR NEW.sealed_at          IS DISTINCT FROM OLD.sealed_at;

  -- Same-day corrections are part of closing out the day.
  IF v_changed AND NEW.deposit_date < (now() AT TIME ZONE 'America/New_York')::date THEN
    INSERT INTO public.audit_events (
      user_id, org_id, actor_id, event_type, action_type,
      target_table, target_id, before_json, after_json, related_date
    ) VALUES (
      auth.uid(), NEW.org_id, auth.uid(), 'day_close_edit', 'update',
      'deposit_logs', NEW.id,
      jsonb_build_object(
        'staffing_assessment', OLD.staffing_assessment,
        'staffing_pressure', OLD.staffing_pressure,
        'staffing_factors', OLD.staffing_factors,
        'staffing_note', OLD.staffing_note,
        'sealed_at', OLD.sealed_at
      ),
      jsonb_build_object(
        'staffing_assessment', NEW.staffing_assessment,
        'staffing_pressure', NEW.staffing_pressure,
        'staffing_factors', NEW.staffing_factors,
        'staffing_note', NEW.staffing_note,
        'sealed_at', NEW.sealed_at
      ),
      NEW.deposit_date
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_day_close_change ON public.deposit_logs;
CREATE TRIGGER log_day_close_change
  AFTER UPDATE ON public.deposit_logs
  FOR EACH ROW EXECUTE FUNCTION public.log_day_close_change();

-- Mobile fallback for Privacy View Capture is opt-in per office.
ALTER TABLE public.org_practice_settings
  ADD COLUMN IF NOT EXISTS mobile_capture_enabled boolean NOT NULL DEFAULT false;

-- ================================================================
-- 2. Operational roles (separate from permission roles)
-- ================================================================
-- Permission roles (owner/manager/employee) control authorization and stay
-- on org_members. Operational roles describe the WORK a person does; one
-- person can hold several. Never inferred from the permission role.

CREATE TABLE IF NOT EXISTS public.employee_operational_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  operational_role text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  starts_on date,
  ends_on date,
  -- Members propose their own roles during onboarding; an owner/manager
  -- confirms. Unconfirmed rows are visible but marked pending in the UI.
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

DO $$ BEGIN
  ALTER TABLE public.employee_operational_roles
    ADD CONSTRAINT employee_operational_roles_role_check CHECK (
      operational_role = ANY (ARRAY[
        'dentist','hygienist','dental_assistant','front_desk',
        'office_manager','sterilization','floater','other'
      ])
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS employee_operational_roles_unique_idx
  ON public.employee_operational_roles (org_id, employee_id, operational_role);
CREATE INDEX IF NOT EXISTS employee_operational_roles_org_idx
  ON public.employee_operational_roles (org_id, employee_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_operational_roles TO authenticated;
GRANT ALL ON public.employee_operational_roles TO service_role;
ALTER TABLE public.employee_operational_roles ENABLE ROW LEVEL SECURITY;

-- Members already see teammate names/roles on the Team surfaces; operational
-- roles ride the same visibility. This does not widen employee privacy.
DROP POLICY IF EXISTS "Members read operational roles" ON public.employee_operational_roles;
CREATE POLICY "Members read operational roles"
  ON public.employee_operational_roles FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

-- A member may PROPOSE their own roles (onboarding); confirmation fields
-- must be empty on a self-insert. Admins insert anything.
DROP POLICY IF EXISTS "Self propose or admin insert operational roles" ON public.employee_operational_roles;
CREATE POLICY "Self propose or admin insert operational roles"
  ON public.employee_operational_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_org_admin(org_id)
    OR (
      public.is_org_member(org_id)
      AND confirmed_by IS NULL AND confirmed_at IS NULL
      AND EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = employee_id AND e.org_id = org_id AND e.user_id = auth.uid()
      )
    )
  );

-- Only owners/managers assign, change, or confirm roles after that.
DROP POLICY IF EXISTS "Admins update operational roles" ON public.employee_operational_roles;
CREATE POLICY "Admins update operational roles"
  ON public.employee_operational_roles FOR UPDATE
  TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

DROP POLICY IF EXISTS "Admins delete operational roles" ON public.employee_operational_roles;
CREATE POLICY "Admins delete operational roles"
  ON public.employee_operational_roles FOR DELETE
  TO authenticated
  USING (public.is_org_admin(org_id));

-- Onboarding gains a "Your role" step.
ALTER TABLE public.member_onboarding
  ADD COLUMN IF NOT EXISTS role_done_at timestamptz;

-- ================================================================
-- 3. Staffing expectations (configurable — every office differs)
-- ================================================================

CREATE TABLE IF NOT EXISTS public.schedule_staffing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  department text NOT NULL,
  provider_role text NOT NULL,
  support_role text,
  provider_count numeric NOT NULL,
  support_count numeric,
  max_simultaneous_columns integer,
  applies_on_weekdays integer[],
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.schedule_staffing_rules
    ADD CONSTRAINT schedule_staffing_rules_department_check CHECK (
      department = ANY (ARRAY['hygiene','doctor','front_desk','sterilization','other'])
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.schedule_staffing_rules
    ADD CONSTRAINT schedule_staffing_rules_roles_check CHECK (
      provider_role = ANY (ARRAY[
        'dentist','hygienist','dental_assistant','front_desk',
        'office_manager','sterilization','floater','other'
      ])
      AND (support_role IS NULL OR support_role = ANY (ARRAY[
        'dentist','hygienist','dental_assistant','front_desk',
        'office_manager','sterilization','floater','other'
      ]))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.schedule_staffing_rules
    ADD CONSTRAINT schedule_staffing_rules_counts_check CHECK (
      provider_count > 0
      AND (support_count IS NULL OR support_count >= 0)
      AND (max_simultaneous_columns IS NULL OR max_simultaneous_columns > 0)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS schedule_staffing_rules_org_idx
  ON public.schedule_staffing_rules (org_id, is_active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_staffing_rules TO authenticated;
GRANT ALL ON public.schedule_staffing_rules TO service_role;
ALTER TABLE public.schedule_staffing_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read staffing rules" ON public.schedule_staffing_rules;
CREATE POLICY "Members read staffing rules"
  ON public.schedule_staffing_rules FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS "Admins manage staffing rules" ON public.schedule_staffing_rules;
CREATE POLICY "Admins manage staffing rules"
  ON public.schedule_staffing_rules FOR ALL
  TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

DO $$ BEGIN
  CREATE TRIGGER trg_schedule_staffing_rules_updated_at
    BEFORE UPDATE ON public.schedule_staffing_rules
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ================================================================
-- 4. PMS layout profiles (sanitized calibration output ONLY)
-- ================================================================
-- layout_signature/status_legend hold relative column positions, expected
-- provider labels, department assignments, status colors, block-style
-- patterns, and the time grid. They may NEVER hold screenshots, patient
-- text, OCR text, or appointment descriptions. The calibration screenshot
-- itself is destroyed in the browser and never stored.

CREATE TABLE IF NOT EXISTS public.schedule_layout_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  pms_name text,
  is_default boolean NOT NULL DEFAULT false,
  layout_signature jsonb NOT NULL,
  status_legend jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS schedule_layout_profiles_org_idx
  ON public.schedule_layout_profiles (org_id, is_default);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_layout_profiles TO authenticated;
GRANT ALL ON public.schedule_layout_profiles TO service_role;
ALTER TABLE public.schedule_layout_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read layout profiles" ON public.schedule_layout_profiles;
CREATE POLICY "Members read layout profiles"
  ON public.schedule_layout_profiles FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS "Admins manage layout profiles" ON public.schedule_layout_profiles;
CREATE POLICY "Admins manage layout profiles"
  ON public.schedule_layout_profiles FOR ALL
  TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

DO $$ BEGIN
  CREATE TRIGGER trg_schedule_layout_profiles_updated_at
    BEFORE UPDATE ON public.schedule_layout_profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ================================================================
-- 5. Provider day metrics (aggregates only — never appointments)
-- ================================================================

CREATE TABLE IF NOT EXISTS public.provider_day_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  closeout_id uuid NOT NULL REFERENCES public.deposit_logs(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  provider_label text NOT NULL,
  provider_role text NOT NULL,
  department text NOT NULL,
  business_date date NOT NULL,

  gross_available_minutes integer NOT NULL DEFAULT 0,
  intentional_unavailable_minutes integer NOT NULL DEFAULT 0,
  net_bookable_minutes integer NOT NULL DEFAULT 0,
  scheduled_minutes integer NOT NULL DEFAULT 0,
  true_open_minutes integer NOT NULL DEFAULT 0,

  cancellation_count integer NOT NULL DEFAULT 0,
  cancellation_open_minutes integer NOT NULL DEFAULT 0,
  no_show_count integer NOT NULL DEFAULT 0,
  no_show_open_minutes integer NOT NULL DEFAULT 0,
  other_open_minutes integer NOT NULL DEFAULT 0,
  unclassified_minutes integer NOT NULL DEFAULT 0,

  recovered_minutes integer,
  recovered_open_pct numeric,
  same_day_additions integer,
  overlap_minutes integer,
  longest_booked_stretch_minutes integer,
  continuous_without_buffer_minutes integer,

  active_columns integer NOT NULL DEFAULT 1,
  simultaneous_column_minutes integer,
  schedule_density numeric,
  schedule_volatility numeric,

  support_staff_assigned numeric,
  staffing_to_column_ratio numeric,

  automated_workload_class text,
  confidence numeric NOT NULL DEFAULT 0,
  review_status text NOT NULL DEFAULT 'needs_review',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

DO $$ BEGIN
  ALTER TABLE public.provider_day_metrics
    ADD CONSTRAINT provider_day_metrics_role_check CHECK (
      provider_role = ANY (ARRAY[
        'dentist','hygienist','dental_assistant','front_desk',
        'office_manager','sterilization','floater','other'
      ])
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.provider_day_metrics
    ADD CONSTRAINT provider_day_metrics_department_check CHECK (
      department = ANY (ARRAY['hygiene','doctor','front_desk','other'])
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.provider_day_metrics
    ADD CONSTRAINT provider_day_metrics_workload_check CHECK (
      automated_workload_class IS NULL OR automated_workload_class = ANY (ARRAY[
        'light','steady','full','compressed','overloaded'
      ])
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.provider_day_metrics
    ADD CONSTRAINT provider_day_metrics_review_check CHECK (
      review_status = ANY (ARRAY['auto_accepted','user_confirmed','needs_review'])
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.provider_day_metrics
    ADD CONSTRAINT provider_day_metrics_nonneg_check CHECK (
      gross_available_minutes >= 0 AND intentional_unavailable_minutes >= 0
      AND net_bookable_minutes >= 0 AND scheduled_minutes >= 0
      AND true_open_minutes >= 0 AND cancellation_count >= 0
      AND cancellation_open_minutes >= 0 AND no_show_count >= 0
      AND no_show_open_minutes >= 0 AND other_open_minutes >= 0
      AND unclassified_minutes >= 0 AND active_columns >= 1
      AND confidence >= 0 AND confidence <= 1
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS provider_day_metrics_unique_idx
  ON public.provider_day_metrics (closeout_id, provider_label);
CREATE INDEX IF NOT EXISTS provider_day_metrics_org_date_idx
  ON public.provider_day_metrics (org_id, business_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_day_metrics TO authenticated;
GRANT ALL ON public.provider_day_metrics TO service_role;
ALTER TABLE public.provider_day_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read provider metrics" ON public.provider_day_metrics;
CREATE POLICY "Members read provider metrics"
  ON public.provider_day_metrics FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS "Members insert provider metrics" ON public.provider_day_metrics;
CREATE POLICY "Members insert provider metrics"
  ON public.provider_day_metrics FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_member(org_id));

-- Same-day corrections by members; later corrections owner/manager only
-- (and audited by the trigger below).
DROP POLICY IF EXISTS "Members update provider metrics same day, admins later" ON public.provider_day_metrics;
CREATE POLICY "Members update provider metrics same day, admins later"
  ON public.provider_day_metrics FOR UPDATE
  TO authenticated
  USING (
    public.is_org_member(org_id)
    AND (
      business_date >= (now() AT TIME ZONE 'America/New_York')::date
      OR public.is_org_admin(org_id)
    )
  )
  WITH CHECK (
    public.is_org_member(org_id)
    AND (
      business_date >= (now() AT TIME ZONE 'America/New_York')::date
      OR public.is_org_admin(org_id)
    )
  );

DROP POLICY IF EXISTS "Admins delete provider metrics" ON public.provider_day_metrics;
CREATE POLICY "Admins delete provider metrics"
  ON public.provider_day_metrics FOR DELETE
  TO authenticated
  USING (public.is_org_admin(org_id));

DO $$ BEGIN
  CREATE TRIGGER trg_provider_day_metrics_updated_at
    BEFORE UPDATE ON public.provider_day_metrics
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Corrections after the closeout date create an audit event.
CREATE OR REPLACE FUNCTION public.log_provider_metrics_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.business_date < (now() AT TIME ZONE 'America/New_York')::date THEN
    INSERT INTO public.audit_events (
      user_id, org_id, actor_id, event_type, action_type,
      target_table, target_id, before_json, after_json, related_date
    ) VALUES (
      auth.uid(), NEW.org_id, auth.uid(), 'schedule_metrics_edit', 'update',
      'provider_day_metrics', NEW.id,
      to_jsonb(OLD) - 'created_at' - 'updated_at',
      to_jsonb(NEW) - 'created_at' - 'updated_at',
      NEW.business_date
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_provider_metrics_change ON public.provider_day_metrics;
CREATE TRIGGER log_provider_metrics_change
  AFTER UPDATE ON public.provider_day_metrics
  FOR EACH ROW EXECUTE FUNCTION public.log_provider_metrics_change();

-- ================================================================
-- 6. Classified operational blocks (codes + minutes, never wording)
-- ================================================================

CREATE TABLE IF NOT EXISTS public.schedule_block_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  closeout_id uuid NOT NULL REFERENCES public.deposit_logs(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  provider_label text,
  department text,
  classification_code text NOT NULL,
  excluded_minutes integer NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  user_confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

DO $$ BEGIN
  ALTER TABLE public.schedule_block_entries
    ADD CONSTRAINT schedule_block_entries_code_check CHECK (
      classification_code = ANY (ARRAY[
        'PROVIDER_OUT_EARLY','PROVIDER_STARTS_LATE','PROVIDER_OFF','LUNCH_BLOCK',
        'MEETING_BLOCK','TRAINING_BLOCK','ADMIN_BLOCK','EMERGENCY_RESERVE',
        'EQUIPMENT_UNAVAILABLE','STAFFING_LIMITATION','OFFICE_CLOSED',
        'OTHER_OPERATIONAL_BLOCK','UNCLASSIFIED'
      ])
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.schedule_block_entries
    ADD CONSTRAINT schedule_block_entries_sane_check CHECK (
      excluded_minutes >= 0 AND excluded_minutes <= 1440
      AND confidence >= 0 AND confidence <= 1
      AND (department IS NULL OR department = ANY (ARRAY['hygiene','doctor','front_desk','other']))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS schedule_block_entries_closeout_idx
  ON public.schedule_block_entries (closeout_id);
CREATE INDEX IF NOT EXISTS schedule_block_entries_org_date_idx
  ON public.schedule_block_entries (org_id, business_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_block_entries TO authenticated;
GRANT ALL ON public.schedule_block_entries TO service_role;
ALTER TABLE public.schedule_block_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read block entries" ON public.schedule_block_entries;
CREATE POLICY "Members read block entries"
  ON public.schedule_block_entries FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS "Members insert block entries" ON public.schedule_block_entries;
CREATE POLICY "Members insert block entries"
  ON public.schedule_block_entries FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_member(org_id));

DROP POLICY IF EXISTS "Members update block entries same day, admins later" ON public.schedule_block_entries;
CREATE POLICY "Members update block entries same day, admins later"
  ON public.schedule_block_entries FOR UPDATE
  TO authenticated
  USING (
    public.is_org_member(org_id)
    AND (
      business_date >= (now() AT TIME ZONE 'America/New_York')::date
      OR public.is_org_admin(org_id)
    )
  )
  WITH CHECK (
    public.is_org_member(org_id)
    AND (
      business_date >= (now() AT TIME ZONE 'America/New_York')::date
      OR public.is_org_admin(org_id)
    )
  );

DROP POLICY IF EXISTS "Admins delete block entries" ON public.schedule_block_entries;
CREATE POLICY "Admins delete block entries"
  ON public.schedule_block_entries FOR DELETE
  TO authenticated
  USING (public.is_org_admin(org_id));

-- ================================================================
-- 7. Manager-configurable operational phrase rules (sanitized)
-- ================================================================
-- Short, generic office phrases only ("dr smith off" is NOT allowed to carry
-- more than a provider mapping; patient names and narratives are blocked by
-- length + the client-side sanitizer).

CREATE TABLE IF NOT EXISTS public.schedule_phrase_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  phrase text NOT NULL,
  classification_code text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

DO $$ BEGIN
  ALTER TABLE public.schedule_phrase_rules
    ADD CONSTRAINT schedule_phrase_rules_phrase_check CHECK (
      char_length(phrase) BETWEEN 2 AND 40
      AND phrase !~ '[\n\r]'
      AND phrase !~ '\d{3}[\s.-]?\d{3,4}'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.schedule_phrase_rules
    ADD CONSTRAINT schedule_phrase_rules_code_check CHECK (
      classification_code = ANY (ARRAY[
        'PROVIDER_OUT_EARLY','PROVIDER_STARTS_LATE','PROVIDER_OFF','LUNCH_BLOCK',
        'MEETING_BLOCK','TRAINING_BLOCK','ADMIN_BLOCK','EMERGENCY_RESERVE',
        'EQUIPMENT_UNAVAILABLE','STAFFING_LIMITATION','OFFICE_CLOSED',
        'OTHER_OPERATIONAL_BLOCK'
      ])
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS schedule_phrase_rules_unique_idx
  ON public.schedule_phrase_rules (org_id, phrase);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_phrase_rules TO authenticated;
GRANT ALL ON public.schedule_phrase_rules TO service_role;
ALTER TABLE public.schedule_phrase_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read phrase rules" ON public.schedule_phrase_rules;
CREATE POLICY "Members read phrase rules"
  ON public.schedule_phrase_rules FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS "Admins manage phrase rules" ON public.schedule_phrase_rules;
CREATE POLICY "Admins manage phrase rules"
  ON public.schedule_phrase_rules FOR ALL
  TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));
