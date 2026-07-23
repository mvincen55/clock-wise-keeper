-- Deposit Log: the daily deposit sheet (cash, numbered checks, card and
-- financing totals, bank split). Office financial record — check amounts
-- only, no payer names, no bank account numbers.
CREATE TABLE public.deposit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  deposit_date date NOT NULL,
  cash_cents int NOT NULL DEFAULT 0,
  -- Ordered check amounts in cents (position = check line number).
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  ins_cc_cents int NOT NULL DEFAULT 0,
  pt_cc_cents int NOT NULL DEFAULT 0,
  illumitrac_cents int NOT NULL DEFAULT 0,
  outside_financing_cents int NOT NULL DEFAULT 0,
  prepared_by uuid,
  prepared_by_name text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, deposit_date)
);

CREATE INDEX idx_deposit_logs_org ON public.deposit_logs(org_id, deposit_date DESC);

ALTER TABLE public.deposit_logs ENABLE ROW LEVEL SECURITY;

-- Clerical staff prepare the deposit, so members read and write; only
-- managers can delete a day's record.
CREATE POLICY "Members read deposit_logs"
  ON public.deposit_logs FOR SELECT
  TO authenticated
  USING (is_org_member(org_id));

CREATE POLICY "Members create deposit_logs"
  ON public.deposit_logs FOR INSERT
  TO authenticated
  WITH CHECK (is_org_member(org_id));

CREATE POLICY "Members update deposit_logs"
  ON public.deposit_logs FOR UPDATE
  TO authenticated
  USING (is_org_member(org_id))
  WITH CHECK (is_org_member(org_id));

CREATE POLICY "Admins delete deposit_logs"
  ON public.deposit_logs FOR DELETE
  TO authenticated
  USING (is_org_admin(org_id));

CREATE TRIGGER trg_deposit_logs_updated_at
  BEFORE UPDATE ON public.deposit_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
