-- Office performance pulse: three separately-configured monthly goals and the
-- two Close the Day new-patient counts behind them.
--
-- Business definitions this schema encodes:
--   * Production   — value of care delivered, entered at Close the Day. Paced
--                    only against monthly_production_target_cents.
--   * Collections  — money received (derived from saved deposit amounts).
--                    Paced only against monthly_collections_target_cents.
--   * New patients seen      — completed first visits; the only number that
--                              advances the new-patient goal.
--   * New patients scheduled — new-patient appointments booked that day; a
--                              pipeline indicator, never goal progress.
--
-- Aggregate office-operation numbers only: counts and amounts, never a patient
-- name, appointment identity, or chart detail. Visibility values are
-- dashboard-display controls ('everyone' | 'admin_only'), not secrecy claims.
-- Every target is optional; NULL (or 0) means "no goal configured" and must
-- never render as a fake pace verdict.
--
-- org_practice_settings already carries member-read / admin-write RLS
-- ("Admins manage practice settings"), so only admins can change targets or
-- visibility — no new policy is needed for the added columns.

ALTER TABLE public.org_practice_settings
  ADD COLUMN IF NOT EXISTS monthly_production_target_cents bigint
    CHECK (monthly_production_target_cents >= 0),
  ADD COLUMN IF NOT EXISTS monthly_new_patients_seen_target_count integer
    CHECK (monthly_new_patients_seen_target_count >= 0),
  ADD COLUMN IF NOT EXISTS production_visibility text NOT NULL DEFAULT 'everyone'
    CHECK (production_visibility IN ('everyone', 'admin_only')),
  ADD COLUMN IF NOT EXISTS new_patients_visibility text NOT NULL DEFAULT 'everyone'
    CHECK (new_patients_visibility IN ('everyone', 'admin_only'));

-- Close the Day practice vitals: aggregate new-patient counts for the day.
-- Nullable on purpose — old records and unanswered questions stay "not
-- recorded"; an explicit 0 is a deliberate answer. (A CHECK passes on NULL,
-- so these constraints bind only recorded values.)
ALTER TABLE public.deposit_logs
  ADD COLUMN IF NOT EXISTS new_patients_scheduled_count integer
    CHECK (new_patients_scheduled_count >= 0),
  ADD COLUMN IF NOT EXISTS new_patients_seen_count integer
    CHECK (new_patients_seen_count >= 0);

-- Late edits to the new-patient counts are practice-vitals edits like any
-- other: extend the existing vitals audit receipt to cover both fields.
-- Same-day corrections remain unaudited — they are part of closing the day.
CREATE OR REPLACE FUNCTION public.log_deposit_vitals_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_changed boolean;
BEGIN
  v_changed :=
    NEW.production_cents      IS DISTINCT FROM OLD.production_cents
    OR NEW.hygiene_cancellations IS DISTINCT FROM OLD.hygiene_cancellations
    OR NEW.hygiene_no_shows      IS DISTINCT FROM OLD.hygiene_no_shows
    OR NEW.doctor_cancellations  IS DISTINCT FROM OLD.doctor_cancellations
    OR NEW.doctor_no_shows       IS DISTINCT FROM OLD.doctor_no_shows
    OR NEW.new_patients_scheduled_count IS DISTINCT FROM OLD.new_patients_scheduled_count
    OR NEW.new_patients_seen_count      IS DISTINCT FROM OLD.new_patients_seen_count;

  -- Same-day corrections are just part of closing out the day.
  IF v_changed AND NEW.deposit_date < (now() AT TIME ZONE 'America/New_York')::date THEN
    INSERT INTO public.audit_events (
      user_id, org_id, actor_id, event_type, action_type,
      target_table, target_id, before_json, after_json, related_date
    ) VALUES (
      auth.uid(), NEW.org_id, auth.uid(), 'deposit_vitals_edit', 'update',
      'deposit_logs', NEW.id,
      jsonb_build_object(
        'production_cents', OLD.production_cents,
        'hygiene_cancellations', OLD.hygiene_cancellations,
        'hygiene_no_shows', OLD.hygiene_no_shows,
        'doctor_cancellations', OLD.doctor_cancellations,
        'doctor_no_shows', OLD.doctor_no_shows,
        'new_patients_scheduled_count', OLD.new_patients_scheduled_count,
        'new_patients_seen_count', OLD.new_patients_seen_count
      ),
      jsonb_build_object(
        'production_cents', NEW.production_cents,
        'hygiene_cancellations', NEW.hygiene_cancellations,
        'hygiene_no_shows', NEW.hygiene_no_shows,
        'doctor_cancellations', NEW.doctor_cancellations,
        'doctor_no_shows', NEW.doctor_no_shows,
        'new_patients_scheduled_count', NEW.new_patients_scheduled_count,
        'new_patients_seen_count', NEW.new_patients_seen_count
      ),
      NEW.deposit_date
    );
  END IF;

  RETURN NEW;
END;
$$;
