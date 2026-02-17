
-- 1. Extend source_type enum with new values
ALTER TYPE public.source_type ADD VALUE IF NOT EXISTS 'auto_location';
ALTER TYPE public.source_type ADD VALUE IF NOT EXISTS 'system_adjustment';

-- 2. Add location columns to punches table
ALTER TABLE public.punches
  ADD COLUMN IF NOT EXISTS low_confidence boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS location_lat double precision,
  ADD COLUMN IF NOT EXISTS location_lng double precision;

-- 3. Add remote flag and daily comment to time_entries
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS is_remote boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS entry_comment text;

-- 4. Create work_zones table
CREATE TABLE public.work_zones (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  zone_name text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  radius_meters integer NOT NULL DEFAULT 150,
  enter_delay_minutes integer NOT NULL DEFAULT 2,
  exit_delay_minutes integer NOT NULL DEFAULT 5,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.work_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own work_zones"
  ON public.work_zones FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_work_zones_updated_at
  BEFORE UPDATE ON public.work_zones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Create location_events table
CREATE TABLE public.location_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy double precision,
  zone_id uuid REFERENCES public.work_zones(id) ON DELETE SET NULL,
  zone_status text CHECK (zone_status IN ('entered', 'exited', 'inside', 'outside')),
  action_taken text,
  confidence_flag boolean NOT NULL DEFAULT true,
  punch_id uuid REFERENCES public.punches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.location_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own location_events"
  ON public.location_events FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 6. Add index for fast zone lookups
CREATE INDEX idx_work_zones_user_active ON public.work_zones(user_id) WHERE is_active = true;
CREATE INDEX idx_location_events_user ON public.location_events(user_id, created_at DESC);
