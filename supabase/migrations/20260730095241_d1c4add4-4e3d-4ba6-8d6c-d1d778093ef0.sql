-- 1. Signed privacy terms ---------------------------------------------------
CREATE TABLE public.policy_acknowledgments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  document TEXT NOT NULL,
  signed_name TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, document)
);

GRANT SELECT, INSERT ON public.policy_acknowledgments TO authenticated;
GRANT ALL ON public.policy_acknowledgments TO service_role;
ALTER TABLE public.policy_acknowledgments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their own acknowledgments"
  ON public.policy_acknowledgments FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins see who has signed"
  ON public.policy_acknowledgments FOR SELECT TO authenticated
  USING (public.is_org_admin(org_id));

CREATE POLICY "Members sign for themselves"
  ON public.policy_acknowledgments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(org_id));

-- 2. Onboarding progress -----------------------------------------------------
CREATE TABLE public.member_onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  terms_done_at TIMESTAMPTZ,
  work_style_done_at TIMESTAMPTZ,
  basics_done_at TIMESTAMPTZ,
  goal_done_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

GRANT SELECT, INSERT, UPDATE ON public.member_onboarding TO authenticated;
GRANT ALL ON public.member_onboarding TO service_role;
ALTER TABLE public.member_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage their own onboarding"
  ON public.member_onboarding FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(org_id));

CREATE POLICY "Admins read onboarding status"
  ON public.member_onboarding FOR SELECT TO authenticated
  USING (public.is_org_admin(org_id));

CREATE TRIGGER member_onboarding_updated_at
  BEFORE UPDATE ON public.member_onboarding
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Permanent tag registry --------------------------------------------------
-- Rows are never deleted: a tag used once is retired to that person forever.
CREATE TABLE public.employee_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  employee_id UUID,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX employee_tags_unique_idx
  ON public.employee_tags (org_id, upper(tag));

GRANT SELECT, INSERT ON public.employee_tags TO authenticated;
GRANT ALL ON public.employee_tags TO service_role;
ALTER TABLE public.employee_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read the tag registry"
  ON public.employee_tags FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "Members reserve tags in their org"
  ON public.employee_tags FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id));

-- 4. Employee fields ---------------------------------------------------------
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS preferred_name TEXT,
  ADD COLUMN IF NOT EXISTS tag TEXT;

-- Tag shape and per-org uniqueness among live records.
ALTER TABLE public.employees
  ADD CONSTRAINT employees_tag_shape CHECK (tag IS NULL OR tag ~ '^[A-Z0-9]{2,4}$');

CREATE UNIQUE INDEX employees_tag_unique_idx
  ON public.employees (org_id, tag) WHERE tag IS NOT NULL;

-- Every tag ever set is registered, so it can never be handed to someone else.
CREATE OR REPLACE FUNCTION public.register_employee_tag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_id UUID;
BEGIN
  IF NEW.tag IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT employee_id INTO owner_id
  FROM public.employee_tags
  WHERE org_id = NEW.org_id AND upper(tag) = upper(NEW.tag);

  IF owner_id IS NOT NULL AND owner_id <> NEW.id THEN
    RAISE EXCEPTION 'Tag % is already retired to another team member', NEW.tag
      USING ERRCODE = 'unique_violation';
  END IF;

  IF owner_id IS NULL THEN
    INSERT INTO public.employee_tags (org_id, tag, employee_id, display_name)
    VALUES (NEW.org_id, upper(NEW.tag), NEW.id, NEW.display_name);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER employees_register_tag
  AFTER INSERT OR UPDATE OF tag ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.register_employee_tag();

REVOKE EXECUTE ON FUNCTION public.register_employee_tag() FROM anon, authenticated;