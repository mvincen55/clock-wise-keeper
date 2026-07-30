ALTER TABLE public.deposit_logs
  ADD COLUMN IF NOT EXISTS production_cents integer,
  ADD COLUMN IF NOT EXISTS hygiene_cancellations integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hygiene_no_shows integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS doctor_cancellations integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS doctor_no_shows integer NOT NULL DEFAULT 0;

ALTER TABLE public.deposit_logs
  ADD CONSTRAINT deposit_logs_vitals_nonneg CHECK (
    COALESCE(production_cents, 0) >= 0
    AND hygiene_cancellations >= 0
    AND hygiene_no_shows >= 0
    AND doctor_cancellations >= 0
    AND doctor_no_shows >= 0
  );

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
    OR NEW.doctor_no_shows       IS DISTINCT FROM OLD.doctor_no_shows;

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
        'doctor_no_shows', OLD.doctor_no_shows
      ),
      jsonb_build_object(
        'production_cents', NEW.production_cents,
        'hygiene_cancellations', NEW.hygiene_cancellations,
        'hygiene_no_shows', NEW.hygiene_no_shows,
        'doctor_cancellations', NEW.doctor_cancellations,
        'doctor_no_shows', NEW.doctor_no_shows
      ),
      NEW.deposit_date
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_deposit_vitals_change ON public.deposit_logs;
CREATE TRIGGER log_deposit_vitals_change
  AFTER UPDATE ON public.deposit_logs
  FOR EACH ROW EXECUTE FUNCTION public.log_deposit_vitals_change();