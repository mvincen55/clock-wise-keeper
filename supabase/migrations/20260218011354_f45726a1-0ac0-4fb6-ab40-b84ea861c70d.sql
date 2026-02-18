
-- Table: attendance_day_status - precomputed daily attendance flags
CREATE TABLE public.attendance_day_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  entry_date DATE NOT NULL,
  schedule_expected_start TIME WITHOUT TIME ZONE,
  schedule_expected_end TIME WITHOUT TIME ZONE,
  is_scheduled_day BOOLEAN NOT NULL DEFAULT false,
  office_closed BOOLEAN NOT NULL DEFAULT false,
  has_punches BOOLEAN NOT NULL DEFAULT false,
  is_remote BOOLEAN NOT NULL DEFAULT false,
  is_absent BOOLEAN NOT NULL DEFAULT false,
  is_incomplete BOOLEAN NOT NULL DEFAULT false,
  is_late BOOLEAN NOT NULL DEFAULT false,
  minutes_late INTEGER DEFAULT 0,
  tardy_approval_status TEXT DEFAULT 'unreviewed',
  has_edits BOOLEAN NOT NULL DEFAULT false,
  has_day_comment BOOLEAN NOT NULL DEFAULT false,
  computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, entry_date)
);

-- Enable RLS
ALTER TABLE public.attendance_day_status ENABLE ROW LEVEL SECURITY;

-- RLS: owner only
CREATE POLICY "Users manage own attendance_day_status"
  ON public.attendance_day_status
  FOR ALL
  USING ((auth.uid() = user_id) AND is_allowed_user())
  WITH CHECK ((auth.uid() = user_id) AND is_allowed_user());

-- Index for lookups
CREATE INDEX idx_attendance_day_status_user_date ON public.attendance_day_status(user_id, entry_date);
CREATE INDEX idx_attendance_day_status_absent ON public.attendance_day_status(user_id, is_absent) WHERE is_absent = true;
CREATE INDEX idx_attendance_day_status_late ON public.attendance_day_status(user_id, is_late) WHERE is_late = true;
CREATE INDEX idx_attendance_day_status_incomplete ON public.attendance_day_status(user_id, is_incomplete) WHERE is_incomplete = true;
