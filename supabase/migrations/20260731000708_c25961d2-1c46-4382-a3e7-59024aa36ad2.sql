-- 2.3 allowed_users RLS recursion fix: use the SECURITY DEFINER helper.
DROP POLICY IF EXISTS "Allowed users can read allowlist" ON public.allowed_users;
CREATE POLICY "Allowed users can read allowlist"
  ON public.allowed_users FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL AND public.is_allowed_user());

-- 2.4 training_modules: allow the 'draft' status the audit/review flow expects.
ALTER TABLE public.training_modules DROP CONSTRAINT IF EXISTS training_modules_status_check;
ALTER TABLE public.training_modules
  ADD CONSTRAINT training_modules_status_check
  CHECK (status = ANY (ARRAY['published'::text, 'archived'::text, 'draft'::text]));

-- 2.2 goal_events: documented here (table already live) so migrations stay the schema record.
CREATE TABLE IF NOT EXISTS public.goal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  type text NOT NULL,
  reason text NOT NULL,
  old_title text NOT NULL,
  new_title text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.goal_events DROP CONSTRAINT IF EXISTS goal_events_type_check;
ALTER TABLE public.goal_events
  ADD CONSTRAINT goal_events_type_check
  CHECK (type = ANY (ARRAY['edited'::text, 'archived'::text, 'replaced'::text]));
GRANT SELECT, INSERT, UPDATE ON public.goal_events TO authenticated;
GRANT ALL ON public.goal_events TO service_role;
ALTER TABLE public.goal_events ENABLE ROW LEVEL SECURITY;