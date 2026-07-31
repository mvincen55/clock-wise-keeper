
-- S+M gate + archive reason, enforced server-side
CREATE OR REPLACE FUNCTION public.enforce_goal_smart_gate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF length(btrim(coalesce(NEW.title, ''))) < 3 THEN
    RAISE EXCEPTION 'A goal needs a specific title (at least 3 characters)'
      USING ERRCODE = 'check_violation';
  END IF;

  IF length(btrim(coalesce(NEW.smart_target, ''))) < 1 THEN
    RAISE EXCEPTION 'A goal needs a measurable target before it can be saved'
      USING ERRCODE = 'check_violation';
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
$$;

DROP TRIGGER IF EXISTS enforce_goal_smart_gate_ins ON public.goals;
DROP TRIGGER IF EXISTS enforce_goal_smart_gate_upd ON public.goals;

CREATE TRIGGER enforce_goal_smart_gate_ins
BEFORE INSERT ON public.goals
FOR EACH ROW EXECUTE FUNCTION public.enforce_goal_smart_gate();

CREATE TRIGGER enforce_goal_smart_gate_upd
BEFORE UPDATE ON public.goals
FOR EACH ROW EXECUTE FUNCTION public.enforce_goal_smart_gate();

-- goal_events: reason must be substantive, actor must be the caller
CREATE OR REPLACE FUNCTION public.enforce_goal_event_reason()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF length(btrim(coalesce(NEW.reason, ''))) < 10 THEN
    RAISE EXCEPTION 'A goal change note must be at least 10 characters'
      USING ERRCODE = 'check_violation';
  END IF;
  IF auth.uid() IS NOT NULL THEN
    NEW.actor_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_goal_event_reason_ins ON public.goal_events;
CREATE TRIGGER enforce_goal_event_reason_ins
BEFORE INSERT ON public.goal_events
FOR EACH ROW EXECUTE FUNCTION public.enforce_goal_event_reason();
