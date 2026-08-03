CREATE TABLE public.office_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  event_date date NOT NULL,
  title text NOT NULL DEFAULT 'Team meeting',
  category text NOT NULL DEFAULT 'team_meeting' CHECK (category IN ('team_meeting','other')),
  start_time time,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.office_events TO authenticated;
GRANT ALL ON public.office_events TO service_role;

ALTER TABLE public.office_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view office events"
  ON public.office_events FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "Admins manage office events"
  ON public.office_events FOR ALL TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

CREATE INDEX office_events_org_date_idx ON public.office_events (org_id, event_date);

CREATE TRIGGER office_events_updated_at
  BEFORE UPDATE ON public.office_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.goal_tasks
  ADD COLUMN training_module_id uuid REFERENCES public.training_modules(id) ON DELETE SET NULL;

CREATE INDEX goal_tasks_training_module_idx ON public.goal_tasks (training_module_id);

CREATE OR REPLACE FUNCTION public.complete_goal_task_from_training()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.passed THEN
    UPDATE public.goal_tasks t
       SET done = true,
           done_at = COALESCE(t.done_at, now()),
           updated_at = now()
      FROM public.goals g
     WHERE t.goal_id = g.id
       AND t.training_module_id = NEW.module_id
       AND g.user_id = NEW.user_id
       AND t.done = false;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER training_attempt_completes_goal_task
  AFTER INSERT ON public.training_attempts
  FOR EACH ROW EXECUTE FUNCTION public.complete_goal_task_from_training();