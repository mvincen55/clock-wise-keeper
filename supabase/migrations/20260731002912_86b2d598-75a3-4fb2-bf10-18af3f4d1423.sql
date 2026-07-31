CREATE TABLE public.goal_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid,
  run_date date NOT NULL,
  run_hour smallint NOT NULL,
  item_id uuid,
  item_title text,
  owner_user_id uuid,
  due_date date,
  days_left integer,
  outcome text NOT NULL,
  reason text,
  channel text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.goal_reminder_log TO authenticated;
GRANT ALL ON public.goal_reminder_log TO service_role;

ALTER TABLE public.goal_reminder_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their own reminder log"
ON public.goal_reminder_log FOR SELECT TO authenticated
USING (owner_user_id = auth.uid());

CREATE POLICY "Admins can view org reminder log"
ON public.goal_reminder_log FOR SELECT TO authenticated
USING (org_id IS NOT NULL AND public.is_org_admin(org_id));

CREATE INDEX idx_goal_reminder_log_owner_date
  ON public.goal_reminder_log (owner_user_id, run_date DESC);
CREATE INDEX idx_goal_reminder_log_org_date
  ON public.goal_reminder_log (org_id, run_date DESC);