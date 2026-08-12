-- ============================================================
-- SEMANTIC PUNCH KINDS — a break is not the end of the day.
--
-- punch_type ('in'/'out') stays the mechanical pairing the hours
-- math runs on. punch_kind records what the member actually said
-- they were doing when the punch was written:
--
--   clock_in     first arrival of the workday        (punch_type 'in')
--   break_end    returning from lunch/a break        (punch_type 'in')
--   break_start  leaving temporarily — lunch/break   (punch_type 'out')
--   shift_end    done for the day                    (punch_type 'out')
--
-- NULL means "no stated intent": every punch written before this
-- migration, spreadsheet imports, GPS auto-punches, and manager
-- corrections. NULL is never backfilled or inferred from times,
-- schedules, or punch counts — guessed intent is worse than none.
--
-- Only an explicit shift_end runs the end-of-day checklist
-- enforcement; a break_start never does.
-- ============================================================

CREATE TYPE public.punch_kind AS ENUM ('clock_in', 'break_start', 'break_end', 'shift_end');

ALTER TABLE public.punches ADD COLUMN punch_kind public.punch_kind;

COMMENT ON COLUMN public.punches.punch_kind IS
  'Stated intent of the punch: clock_in / break_start / break_end / shift_end. NULL = no stated intent (pre-existing rows, imports, GPS auto-punches, manual corrections). Never inferred from time of day, schedules, or punch counts.';

-- A kind can never contradict its mechanical direction — a punch
-- editor flipping punch_type must clear (or re-state) the kind.
ALTER TABLE public.punches ADD CONSTRAINT punches_kind_matches_type CHECK (
  punch_kind IS NULL
  OR (punch_type = 'in'  AND punch_kind IN ('clock_in', 'break_end'))
  OR (punch_type = 'out' AND punch_kind IN ('break_start', 'shift_end'))
);
