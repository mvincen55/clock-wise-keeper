
-- PTO Settings (one per user)
CREATE TABLE public.pto_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  hire_date date NOT NULL DEFAULT '2022-02-07',
  worked_hours_cap_weekly numeric NOT NULL DEFAULT 40,
  max_balance numeric NOT NULL DEFAULT 100,
  allow_negative boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'America/New_York',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.pto_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own pto_settings"
  ON public.pto_settings FOR ALL
  USING (auth.uid() = user_id AND is_allowed_user())
  WITH CHECK (auth.uid() = user_id AND is_allowed_user());

-- PTO Snapshots (balance anchors)
CREATE TABLE public.pto_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  snapshot_date date NOT NULL,
  snapshot_balance_hours numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, snapshot_date)
);

ALTER TABLE public.pto_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own pto_snapshots"
  ON public.pto_snapshots FOR ALL
  USING (auth.uid() = user_id AND is_allowed_user())
  WITH CHECK (auth.uid() = user_id AND is_allowed_user());

-- PTO Ledger Weeks (computed weekly records)
CREATE TABLE public.pto_ledger_weeks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  worked_hours_raw numeric NOT NULL DEFAULT 0,
  worked_hours_capped numeric NOT NULL DEFAULT 0,
  pto_taken_hours numeric NOT NULL DEFAULT 0,
  tier_rate numeric NOT NULL DEFAULT 0,
  calculated_accrual numeric NOT NULL DEFAULT 0,
  weekly_cap numeric NOT NULL DEFAULT 0,
  accrual_credited numeric NOT NULL DEFAULT 0,
  running_balance numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, period_start)
);

ALTER TABLE public.pto_ledger_weeks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own pto_ledger_weeks"
  ON public.pto_ledger_weeks FOR ALL
  USING (auth.uid() = user_id AND is_allowed_user())
  WITH CHECK (auth.uid() = user_id AND is_allowed_user());

CREATE INDEX idx_pto_ledger_weeks_user_period ON public.pto_ledger_weeks(user_id, period_start);
CREATE INDEX idx_pto_snapshots_user_date ON public.pto_snapshots(user_id, snapshot_date);
