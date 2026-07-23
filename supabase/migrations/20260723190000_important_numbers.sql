-- Important Numbers: the office contact directory (the breakroom sheet,
-- in the app). Business configuration only — practice identifiers (Tax
-- ID, NPI/DEA/license numbers), vendor/lab/carrier phone numbers,
-- referral practices, staff work contacts. No patient data.
CREATE TABLE public.important_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  section text NOT NULL,
  label text NOT NULL,
  value text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_important_numbers_org
  ON public.important_numbers(org_id, section, sort_order);

ALTER TABLE public.important_numbers ENABLE ROW LEVEL SECURITY;

-- Whole-office reference: everyone reads, owners/managers maintain.
CREATE POLICY "Members read important_numbers"
  ON public.important_numbers FOR SELECT
  TO authenticated
  USING (is_org_member(org_id));

CREATE POLICY "Admins manage important_numbers"
  ON public.important_numbers FOR ALL
  TO authenticated
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

CREATE TRIGGER trg_important_numbers_updated_at
  BEFORE UPDATE ON public.important_numbers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
