
-- TimeVault Database Schema

-- Helper function for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Day off type enum
CREATE TYPE public.day_off_type AS ENUM ('pto', 'sick', 'holiday', 'unpaid', 'other');

-- Import status enum
CREATE TYPE public.import_status AS ENUM ('pending', 'previewing', 'confirmed', 'failed');

-- Punch type enum
CREATE TYPE public.punch_type AS ENUM ('in', 'out');

-- Source enum
CREATE TYPE public.source_type AS ENUM ('manual', 'import');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Time entries (one row per user per date)
CREATE TABLE public.time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_name TEXT,
  employee_code TEXT,
  entry_date DATE NOT NULL,
  total_minutes INTEGER,
  source source_type NOT NULL DEFAULT 'manual',
  raw_total_hhmm TEXT,
  raw_text TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, entry_date)
);
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own time_entries" ON public.time_entries FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_time_entries_user_date ON public.time_entries(user_id, entry_date);

CREATE TRIGGER update_time_entries_updated_at BEFORE UPDATE ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Punches (many per time_entry)
CREATE TABLE public.punches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  time_entry_id UUID NOT NULL REFERENCES public.time_entries(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL DEFAULT 0,
  punch_type punch_type NOT NULL,
  punch_time TIMESTAMPTZ NOT NULL,
  source source_type NOT NULL DEFAULT 'manual',
  raw_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.punches ENABLE ROW LEVEL SECURITY;

-- Security definer to check punch ownership
CREATE OR REPLACE FUNCTION public.user_owns_time_entry(_entry_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.time_entries WHERE id = _entry_id AND user_id = auth.uid()
  );
$$;

CREATE POLICY "Users manage own punches" ON public.punches FOR ALL
  USING (public.user_owns_time_entry(time_entry_id))
  WITH CHECK (public.user_owns_time_entry(time_entry_id));

CREATE INDEX idx_punches_entry ON public.punches(time_entry_id, seq);

-- Days off
CREATE TABLE public.days_off (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date_start DATE NOT NULL,
  date_end DATE NOT NULL,
  type day_off_type NOT NULL DEFAULT 'pto',
  hours NUMERIC(5,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.days_off ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own days_off" ON public.days_off FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_days_off_user ON public.days_off(user_id, date_start);

CREATE TRIGGER update_days_off_updated_at BEFORE UPDATE ON public.days_off
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Imports
CREATE TABLE public.imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status import_status NOT NULL DEFAULT 'pending',
  report_range_start DATE,
  report_range_end DATE,
  source_type TEXT,
  company_name TEXT,
  raw_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own imports" ON public.imports FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Import rows
CREATE TABLE public.import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES public.imports(id) ON DELETE CASCADE,
  employee_name TEXT,
  employee_code TEXT,
  entry_date DATE,
  punch_times TEXT[],
  total_hhmm TEXT,
  note_lines TEXT[],
  raw_text TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.user_owns_import(_import_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.imports WHERE id = _import_id AND user_id = auth.uid()
  );
$$;

CREATE POLICY "Users manage own import_rows" ON public.import_rows FOR ALL
  USING (public.user_owns_import(import_id))
  WITH CHECK (public.user_owns_import(import_id));

-- Audit events
CREATE TABLE public.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_details JSONB,
  related_date DATE,
  related_entry_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own audit_events" ON public.audit_events FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_audit_user_date ON public.audit_events(user_id, created_at);

-- Payroll summaries
CREATE TABLE public.payroll_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  range_start DATE NOT NULL,
  range_end DATE NOT NULL,
  total_minutes INTEGER,
  raw_total_hhmm TEXT,
  raw_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payroll_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own payroll_summaries" ON public.payroll_summaries FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
