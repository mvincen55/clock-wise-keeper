-- Office overrides for the patient-facing name of a procedure code.
--
-- The app ships built-in patient-friendly names for common CDT codes
-- (practice-management exports use staff shorthand like "CrnAllCer" that
-- no patient can read). Offices word things their own way, so owners and
-- managers can override any code's name here; team members only read it.
--
-- Per CODE, not per schedule: this is what the patient reads on the
-- printed form, and it must not change depending on their insurance.
--
-- De-identified configuration only. NOTE: this text is staff-authored, so
-- it prints but is deliberately kept OUT of AI payloads — the name-visits
-- request stays derived from codes alone (see src/lib/fof/ai.ts), which is
-- what guarantees no staff-typed text can reach a gateway with no BAA.
CREATE TABLE public.fof_code_names (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  code text NOT NULL,
  patient_name text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One name per code per org; the upsert relies on this.
CREATE UNIQUE INDEX fof_code_names_org_code_uidx
  ON public.fof_code_names (org_id, code);

ALTER TABLE public.fof_code_names ENABLE ROW LEVEL SECURITY;

-- Everyone in the office can see the wording patients get.
CREATE POLICY "Members read fof_code_names"
  ON public.fof_code_names FOR SELECT
  TO authenticated
  USING (is_org_member(org_id));

-- Only owners/managers change or remove it.
CREATE POLICY "Admins manage fof_code_names"
  ON public.fof_code_names FOR ALL
  TO authenticated
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

CREATE TRIGGER update_fof_code_names_updated_at
  BEFORE UPDATE ON public.fof_code_names
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
