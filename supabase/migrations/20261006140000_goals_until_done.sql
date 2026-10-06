-- Goals run until they are completed or changed. They are no longer bound to
-- the calendar month they were set in.
--
-- Personal goals (public.goals):
--   * due_on       — an optional target date the member chooses. No date means
--                    the goal simply runs until it is done.
--   * completed_at — when the member marked it complete. Backfilled from
--                    updated_at for goals already marked completed, which is the
--                    only timestamp those rows carry.
--   * month        — kept as the month the goal was SET (history and the
--                    per-month analytics). It no longer scopes anything.
--
-- The office goal (public.team_goals):
--   * period gains 'open': the goal runs until the target is reached or a
--     manager changes it, with no end date.
--   * ends_on becomes nullable, and is null exactly when period = 'open'.
--
-- Additive and replay-safe. Nothing is dropped.

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS due_on date,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

UPDATE public.goals
   SET completed_at = updated_at
 WHERE status = 'completed' AND completed_at IS NULL;

CREATE INDEX IF NOT EXISTS goals_org_status_idx ON public.goals (org_id, status);

COMMENT ON COLUMN public.goals.month IS
  'The month the goal was set (YYYY-MM). History and analytics only; a goal runs until it is completed or archived.';
COMMENT ON COLUMN public.goals.due_on IS
  'Optional target date chosen by the member. Null means the goal runs until it is done.';
COMMENT ON COLUMN public.goals.completed_at IS
  'When the member marked the goal complete.';

ALTER TABLE public.team_goals ALTER COLUMN ends_on DROP NOT NULL;

ALTER TABLE public.team_goals DROP CONSTRAINT IF EXISTS team_goals_period_check;
ALTER TABLE public.team_goals ADD CONSTRAINT team_goals_period_check
  CHECK (period IN ('week', 'month', 'open'));

ALTER TABLE public.team_goals DROP CONSTRAINT IF EXISTS team_goals_window_check;
ALTER TABLE public.team_goals ADD CONSTRAINT team_goals_window_check
  CHECK ((period = 'open') = (ends_on IS NULL));

COMMENT ON COLUMN public.team_goals.ends_on IS
  'Last day of a week or month goal. Null for an open goal, which runs until the target is reached or it is changed.';
