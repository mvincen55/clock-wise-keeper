-- Standing wording guidance for the FOF AI ("train as we go"): managers
-- teach preferred treatment wording through the FOF assistant widget and
-- the rules apply to every future AI pass. DE-IDENTIFIED configuration
-- only — rules are general wording preferences, never patient details.
CREATE TABLE public.fof_ai_guidance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_by uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fof_ai_guidance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read fof_ai_guidance"
  ON public.fof_ai_guidance FOR SELECT
  TO authenticated
  USING (is_org_member(org_id));

-- Only managers/owners train the assistant.
CREATE POLICY "Admins manage fof_ai_guidance"
  ON public.fof_ai_guidance FOR ALL
  TO authenticated
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

CREATE TRIGGER update_fof_ai_guidance_updated_at
  BEFORE UPDATE ON public.fof_ai_guidance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
