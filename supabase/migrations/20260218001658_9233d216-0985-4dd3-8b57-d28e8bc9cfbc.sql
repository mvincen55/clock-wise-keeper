
-- Payroll settings
CREATE TABLE public.payroll_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  pay_period_type text NOT NULL DEFAULT 'weekly',
  week_start_day smallint NOT NULL DEFAULT 1,
  missing_shift_buffer_minutes integer NOT NULL DEFAULT 60,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.payroll_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own payroll_settings"
  ON public.payroll_settings FOR ALL
  USING (auth.uid() = user_id AND is_allowed_user())
  WITH CHECK (auth.uid() = user_id AND is_allowed_user());

CREATE TRIGGER update_payroll_settings_updated_at
  BEFORE UPDATE ON public.payroll_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Office closures
CREATE TABLE public.office_closures (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  closure_date date NOT NULL,
  name text NOT NULL,
  is_full_day boolean NOT NULL DEFAULT true,
  hours numeric NOT NULL DEFAULT 8,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, closure_date)
);

ALTER TABLE public.office_closures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own office_closures"
  ON public.office_closures FOR ALL
  USING (auth.uid() = user_id AND is_allowed_user())
  WITH CHECK (auth.uid() = user_id AND is_allowed_user());

CREATE INDEX idx_office_closures_user_date ON public.office_closures(user_id, closure_date);

-- Attendance exceptions
CREATE TYPE public.exception_type AS ENUM ('missing_shift', 'other');
CREATE TYPE public.exception_status AS ENUM ('open', 'resolved', 'ignored');

CREATE TABLE public.attendance_exceptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  exception_date date NOT NULL,
  type public.exception_type NOT NULL DEFAULT 'missing_shift',
  status public.exception_status NOT NULL DEFAULT 'open',
  reason_text text,
  resolved_at timestamp with time zone,
  resolution_action text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.attendance_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own attendance_exceptions"
  ON public.attendance_exceptions FOR ALL
  USING (auth.uid() = user_id AND is_allowed_user())
  WITH CHECK (auth.uid() = user_id AND is_allowed_user());

CREATE INDEX idx_attendance_exceptions_user_date ON public.attendance_exceptions(user_id, exception_date, type, status);

CREATE TRIGGER update_attendance_exceptions_updated_at
  BEFORE UPDATE ON public.attendance_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
