CREATE OR REPLACE FUNCTION public.enforce_goal_smart_gate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  check_quality boolean;
BEGIN
  -- Only judge the wording when it is being written: inserts, or an edit that
  -- actually touches the title or the measurable target. Status-only changes
  -- (complete, archive) must stay possible on goals saved before this rule.
  check_quality := TG_OP = 'INSERT'
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.smart_target IS DISTINCT FROM OLD.smart_target;

  IF check_quality THEN
    IF length(btrim(coalesce(NEW.title, ''))) < 3 THEN
      RAISE EXCEPTION 'A goal needs a specific title (at least 3 characters)'
        USING ERRCODE = 'check_violation';
    END IF;

    IF length(btrim(coalesce(NEW.smart_target, ''))) < 1 THEN
      RAISE EXCEPTION 'A goal needs a measurable target before it can be saved'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.status = 'archived' THEN
    IF length(btrim(coalesce(NEW.archived_reason, ''))) < 10 THEN
      RAISE EXCEPTION 'Archiving a goal requires a reason (at least 10 characters)'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.archived_at := coalesce(NEW.archived_at, now());
  ELSE
    NEW.archived_at := NULL;
    NEW.archived_reason := NULL;
  END IF;

  RETURN NEW;
END;
$function$;