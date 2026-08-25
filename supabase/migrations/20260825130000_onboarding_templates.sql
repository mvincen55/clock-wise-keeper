-- Onboarding templates — the per-role "everything a new team member must
-- learn" checklists an office builds for itself (Phase 2 of the onboarding
-- sign-off module; docs/onboarding-signoff.md).
--
-- Templates are org content: name, free-text role label (never an enum —
-- every office titles roles its own way), sections, and items with optional
-- detail text. Employment/business data only — no patient data. Instances
-- (Phase 3) SNAPSHOT a template at start, so editing or deleting a template
-- never rewrites anyone's onboarding history.
--
-- Who edits: owners and managers, plus employees the office has delegated
-- to via the existing employee_permissions grants — this migration registers
-- the 'manage_onboarding' key and rides can_manage_permissions()'s
-- owner-controlled delegation, exactly like manage_office_goals.

CREATE TABLE public.onboarding_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  -- Free text per org ("Front Desk", "Sterilization Tech", …), never an enum.
  role_label text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.onboarding_template_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.onboarding_templates(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.onboarding_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.onboarding_templates(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES public.onboarding_template_sections(id) ON DELETE CASCADE,
  title text NOT NULL,
  -- Optional sub-note shown under the item ("Where: back office cabinet…").
  detail text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_onboarding_templates_org ON public.onboarding_templates(org_id, is_active);
CREATE INDEX idx_onboarding_template_sections_tpl ON public.onboarding_template_sections(template_id, sort_order);
CREATE INDEX idx_onboarding_template_items_section ON public.onboarding_template_items(section_id, sort_order);
CREATE INDEX idx_onboarding_template_items_tpl ON public.onboarding_template_items(template_id);

ALTER TABLE public.onboarding_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_template_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_template_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_template_sections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_template_items TO authenticated;
GRANT ALL ON public.onboarding_templates TO service_role;
GRANT ALL ON public.onboarding_template_sections TO service_role;
GRANT ALL ON public.onboarding_template_items TO service_role;

-- ================================================================
-- 1. Register the delegated permission key (existing grants machinery)
-- ================================================================

ALTER TABLE public.employee_permissions
  DROP CONSTRAINT IF EXISTS employee_permissions_permission_check;
ALTER TABLE public.employee_permissions
  ADD CONSTRAINT employee_permissions_permission_check
  CHECK (permission = ANY (ARRAY[
    'edit_closeout_history', 'view_reports', 'manage_office_goals',
    'manage_onboarding'
  ]));

-- Who may build/edit templates: admins, or an employee holding the grant.
CREATE OR REPLACE FUNCTION public.can_manage_onboarding(_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_org_admin(_org_id)
    OR public.has_permission(_org_id, 'manage_onboarding');
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_onboarding(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_onboarding(uuid) TO authenticated, service_role;

-- ================================================================
-- 2. Policies
-- ================================================================

CREATE POLICY "Members read onboarding templates"
  ON public.onboarding_templates FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "Onboarding managers write templates"
  ON public.onboarding_templates FOR ALL
  TO authenticated
  USING (public.can_manage_onboarding(org_id))
  WITH CHECK (public.can_manage_onboarding(org_id));

CREATE POLICY "Members read onboarding template sections"
  ON public.onboarding_template_sections FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "Onboarding managers write template sections"
  ON public.onboarding_template_sections FOR ALL
  TO authenticated
  USING (public.can_manage_onboarding(org_id))
  WITH CHECK (
    public.can_manage_onboarding(org_id)
    AND EXISTS (
      SELECT 1 FROM public.onboarding_templates t
      WHERE t.id = template_id AND t.org_id = org_id
    )
  );

CREATE POLICY "Members read onboarding template items"
  ON public.onboarding_template_items FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "Onboarding managers write template items"
  ON public.onboarding_template_items FOR ALL
  TO authenticated
  USING (public.can_manage_onboarding(org_id))
  WITH CHECK (
    public.can_manage_onboarding(org_id)
    AND EXISTS (
      SELECT 1 FROM public.onboarding_template_sections s
      WHERE s.id = section_id AND s.org_id = org_id AND s.template_id = template_id
    )
  );

CREATE TRIGGER trg_onboarding_templates_updated_at
  BEFORE UPDATE ON public.onboarding_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_onboarding_template_sections_updated_at
  BEFORE UPDATE ON public.onboarding_template_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_onboarding_template_items_updated_at
  BEFORE UPDATE ON public.onboarding_template_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
