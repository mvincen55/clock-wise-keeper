-- Employee identity is permanent; a login may be attached later.
-- created_by records the uploader, never the employee's login.
ALTER TABLE public.time_entries ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.days_off ALTER COLUMN user_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_history_employee_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.employees;
BEGIN
  SELECT * INTO e FROM public.employees WHERE id=NEW.employee_id;
  IF NOT FOUND OR e.org_id IS DISTINCT FROM NEW.org_id THEN
    RAISE EXCEPTION 'Employee does not belong to this organization' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    NEW.created_by := coalesce(NEW.created_by, auth.uid(), NEW.user_id);
  END IF;
  NEW.user_id := e.user_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS history_employee_identity ON public.time_entries;
CREATE TRIGGER history_employee_identity BEFORE INSERT OR UPDATE ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.enforce_history_employee_identity();
DROP TRIGGER IF EXISTS history_employee_identity ON public.days_off;
CREATE TRIGGER history_employee_identity BEFORE INSERT OR UPDATE ON public.days_off
FOR EACH ROW EXECUTE FUNCTION public.enforce_history_employee_identity();

CREATE OR REPLACE FUNCTION public.enforce_punch_employee_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.time_entries;
BEGIN
  SELECT * INTO t FROM public.time_entries WHERE id=NEW.time_entry_id;
  IF NOT FOUND OR t.employee_id IS DISTINCT FROM NEW.employee_id OR t.org_id IS DISTINCT FROM NEW.org_id THEN
    RAISE EXCEPTION 'Punch must belong to the same employee and organization as its time entry' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS punch_employee_identity ON public.punches;
CREATE TRIGGER punch_employee_identity BEFORE INSERT OR UPDATE ON public.punches
FOR EACH ROW EXECUTE FUNCTION public.enforce_punch_employee_identity();

CREATE OR REPLACE FUNCTION public.trigger_recompute_from_time_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP IN ('DELETE','UPDATE') AND OLD.user_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.employees WHERE user_id=OLD.user_id) THEN
    PERFORM public.recompute_attendance_range(OLD.user_id,OLD.entry_date,OLD.entry_date);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.user_id IS NOT NULL THEN
    PERFORM public.recompute_attendance_range(NEW.user_id,NEW.entry_date,NEW.entry_date);
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.trigger_recompute_from_days_off()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP IN ('DELETE','UPDATE') AND OLD.user_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.employees WHERE user_id=OLD.user_id) THEN
    PERFORM public.recompute_attendance_range(OLD.user_id,OLD.date_start,OLD.date_end);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.user_id IS NOT NULL THEN
    PERFORM public.recompute_attendance_range(NEW.user_id,NEW.date_start,NEW.date_end);
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.link_employee_history_to_login()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    UPDATE public.time_entries SET user_id=NEW.user_id WHERE employee_id=NEW.id AND org_id=NEW.org_id AND user_id IS DISTINCT FROM NEW.user_id;
    UPDATE public.days_off SET user_id=NEW.user_id WHERE employee_id=NEW.id AND org_id=NEW.org_id AND user_id IS DISTINCT FROM NEW.user_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS link_employee_history_to_login ON public.employees;
CREATE TRIGGER link_employee_history_to_login AFTER UPDATE OF user_id ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.link_employee_history_to_login();

-- Preserve upload attribution while repairing legacy importer-owned records.
UPDATE public.time_entries t SET created_by=coalesce(t.created_by,t.user_id),user_id=e.user_id
FROM public.employees e WHERE e.id=t.employee_id AND e.org_id=t.org_id AND t.user_id IS DISTINCT FROM e.user_id;
UPDATE public.days_off d SET created_by=coalesce(d.created_by,d.user_id),user_id=e.user_id
FROM public.employees e WHERE e.id=d.employee_id AND e.org_id=d.org_id AND d.user_id IS DISTINCT FROM e.user_id;

REVOKE ALL ON FUNCTION public.enforce_history_employee_identity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_punch_employee_identity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_employee_history_to_login() FROM PUBLIC;
