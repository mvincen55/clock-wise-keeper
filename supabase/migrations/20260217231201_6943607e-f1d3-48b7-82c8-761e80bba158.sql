
-- Work schedule table (per user, per weekday)
CREATE TABLE public.work_schedule (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0=Sunday
  start_time time NOT NULL DEFAULT '08:00',
  end_time time NOT NULL DEFAULT '17:00',
  enabled boolean NOT NULL DEFAULT true,
  grace_minutes integer NOT NULL DEFAULT 0,
  threshold_minutes integer NOT NULL DEFAULT 1,
  apply_to_remote boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, weekday)
);

ALTER TABLE public.work_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own work_schedule"
  ON public.work_schedule FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_work_schedule_updated_at
  BEFORE UPDATE ON public.work_schedule
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Tardies table
CREATE TABLE public.tardies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  time_entry_id uuid REFERENCES public.time_entries(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  expected_start_time time NOT NULL,
  actual_start_time timestamptz NOT NULL,
  minutes_late integer NOT NULL DEFAULT 0,
  reason_text text,
  approval_status text NOT NULL DEFAULT 'unreviewed' CHECK (approval_status IN ('unreviewed', 'approved', 'unapproved')),
  approved_by uuid,
  approved_at timestamptz,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, entry_date)
);

ALTER TABLE public.tardies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own tardies"
  ON public.tardies FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_tardies_updated_at
  BEFORE UPDATE ON public.tardies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_tardies_user_date ON public.tardies(user_id, entry_date);
CREATE INDEX idx_tardies_approval ON public.tardies(approval_status);
CREATE INDEX idx_tardies_minutes ON public.tardies(minutes_late);
CREATE INDEX idx_work_schedule_user ON public.work_schedule(user_id);
