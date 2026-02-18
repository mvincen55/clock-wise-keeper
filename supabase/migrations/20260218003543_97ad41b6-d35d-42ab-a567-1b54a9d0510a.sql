
-- Schedule Versions table
CREATE TABLE public.schedule_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT,
  effective_start_date DATE NOT NULL,
  effective_end_date DATE,
  apply_to_remote BOOLEAN NOT NULL DEFAULT false,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  week_start_day SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Schedule Weekdays table
CREATE TABLE public.schedule_weekdays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_version_id UUID NOT NULL REFERENCES public.schedule_versions(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  start_time TIME WITHOUT TIME ZONE NOT NULL DEFAULT '08:00:00',
  end_time TIME WITHOUT TIME ZONE NOT NULL DEFAULT '17:00:00',
  grace_minutes INTEGER NOT NULL DEFAULT 0,
  threshold_minutes INTEGER NOT NULL DEFAULT 1,
  UNIQUE(schedule_version_id, weekday)
);

-- Indexes
CREATE INDEX idx_schedule_versions_user_start ON public.schedule_versions(user_id, effective_start_date);
CREATE INDEX idx_schedule_weekdays_version ON public.schedule_weekdays(schedule_version_id, weekday);

-- Enable RLS
ALTER TABLE public.schedule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_weekdays ENABLE ROW LEVEL SECURITY;

-- RLS for schedule_versions
CREATE POLICY "Users manage own schedule_versions"
  ON public.schedule_versions FOR ALL
  USING (auth.uid() = user_id AND is_allowed_user())
  WITH CHECK (auth.uid() = user_id AND is_allowed_user());

-- Security definer function for schedule_weekdays ownership check
CREATE OR REPLACE FUNCTION public.user_owns_schedule_version(_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.schedule_versions WHERE id = _version_id AND user_id = auth.uid()
  );
$$;

-- RLS for schedule_weekdays
CREATE POLICY "Users manage own schedule_weekdays"
  ON public.schedule_weekdays FOR ALL
  USING (user_owns_schedule_version(schedule_version_id) AND is_allowed_user())
  WITH CHECK (user_owns_schedule_version(schedule_version_id) AND is_allowed_user());

-- Trigger for updated_at on schedule_versions
CREATE TRIGGER update_schedule_versions_updated_at
  BEFORE UPDATE ON public.schedule_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Database function: get_schedule_for_date
CREATE OR REPLACE FUNCTION public.get_schedule_for_date(p_user_id UUID, p_date DATE)
RETURNS TABLE(
  version_id UUID,
  version_name TEXT,
  effective_start_date DATE,
  effective_end_date DATE,
  apply_to_remote BOOLEAN,
  timezone TEXT,
  weekday SMALLINT,
  enabled BOOLEAN,
  start_time TIME,
  end_time TIME,
  grace_minutes INTEGER,
  threshold_minutes INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    sv.id AS version_id,
    sv.name AS version_name,
    sv.effective_start_date,
    sv.effective_end_date,
    sv.apply_to_remote,
    sv.timezone,
    sw.weekday,
    sw.enabled,
    sw.start_time,
    sw.end_time,
    sw.grace_minutes,
    sw.threshold_minutes
  FROM public.schedule_versions sv
  JOIN public.schedule_weekdays sw ON sw.schedule_version_id = sv.id
  WHERE sv.user_id = p_user_id
    AND sv.effective_start_date <= p_date
    AND (sv.effective_end_date IS NULL OR sv.effective_end_date >= p_date)
    AND sw.weekday = EXTRACT(DOW FROM p_date)::SMALLINT
  ORDER BY sv.effective_start_date DESC
  LIMIT 1;
$$;
