-- "No patients": a day the office had no patients for this person — the
-- doctor is off and an assistant chooses not to come in. It is a recorded,
-- explained day off (never an absence, never a callout) with no hours
-- against the time-off bank. The attendance engine treats it like planned
-- time off in the next migration; the app offers it beside time off,
-- callout and medical leave (AttendanceActions, Team Attendance, the
-- calendar). The enum value is added on its own so the function change
-- that references it replays in a later transaction.
ALTER TYPE public.day_off_type ADD VALUE IF NOT EXISTS 'no_patients';
