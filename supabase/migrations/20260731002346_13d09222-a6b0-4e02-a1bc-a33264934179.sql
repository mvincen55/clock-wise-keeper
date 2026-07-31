CREATE TABLE public.goal_reminder_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  reminder_hour smallint NOT NULL DEFAULT 8,
  channel text NOT NULL DEFAULT 'in_app',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT goal_reminder_prefs_user_unique UNIQUE (user_id),
  CONSTRAINT goal_reminder_prefs_hour_range CHECK (reminder_hour BETWEEN 0 AND 23),
  CONSTRAINT goal_reminder_prefs_channel_valid CHECK (channel IN ('in_app', 'email', 'both'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.goal_reminder_prefs TO authenticated;
GRANT ALL ON public.goal_reminder_prefs TO service_role;

ALTER TABLE public.goal_reminder_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manage my own reminder settings"
ON public.goal_reminder_prefs FOR ALL TO authenticated
USING (user_id = auth.uid() AND is_org_member(org_id))
WITH CHECK (user_id = auth.uid() AND is_org_member(org_id));

CREATE POLICY "Admins can view team reminder settings"
ON public.goal_reminder_prefs FOR SELECT TO authenticated
USING (is_org_admin(org_id));

CREATE TRIGGER update_goal_reminder_prefs_updated_at
BEFORE UPDATE ON public.goal_reminder_prefs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();