ALTER TABLE public.training_attempts
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'quiz';

ALTER TABLE public.training_attempts
  DROP CONSTRAINT IF EXISTS training_attempts_type_check;

ALTER TABLE public.training_attempts
  ADD CONSTRAINT training_attempts_type_check CHECK (type IN ('quiz', 'roleplay'));

DROP FUNCTION IF EXISTS public.training_attempt_summaries(uuid);

CREATE OR REPLACE FUNCTION public.training_attempt_summaries(_org_id uuid)
RETURNS TABLE(
  id uuid,
  org_id uuid,
  module_id uuid,
  user_id uuid,
  score integer,
  passed boolean,
  type text,
  completed_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.org_id, a.module_id, a.user_id, a.score, a.passed, a.type, a.completed_at
  FROM public.training_attempts a
  WHERE a.org_id = _org_id
    AND (
      a.user_id = auth.uid()
      OR public.is_org_admin(a.org_id)
    );
$$;

REVOKE ALL ON FUNCTION public.training_attempt_summaries(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.training_attempt_summaries(uuid) TO authenticated;