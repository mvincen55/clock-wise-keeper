CREATE TABLE public.goal_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  author text NOT NULL CHECK (author IN ('member','pathfinder')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX goal_messages_goal_created_idx ON public.goal_messages (goal_id, created_at);

GRANT SELECT, INSERT ON public.goal_messages TO authenticated;
GRANT ALL ON public.goal_messages TO service_role;

ALTER TABLE public.goal_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Goal owner can read their pathfinder thread"
ON public.goal_messages FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.goals g WHERE g.id = goal_messages.goal_id AND g.user_id = auth.uid()));

CREATE POLICY "Goal owner can write to their pathfinder thread"
ON public.goal_messages FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.goals g WHERE g.id = goal_messages.goal_id AND g.user_id = auth.uid() AND g.org_id = goal_messages.org_id));