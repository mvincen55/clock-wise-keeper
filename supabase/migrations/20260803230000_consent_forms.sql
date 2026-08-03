-- Forms & Consents: treatment consent templates, versions, bundles,
-- office rules, and a template-activity audit trail.
--
-- HARD BOUNDARY (same as the rest of the product): these tables store the
-- office's OWN template library and configuration only. Patient names,
-- tooth numbers, diagnoses, signatures, balances, and completed patient
-- packets are NEVER stored — the Complete Forms workflow keeps that data
-- in browser memory and clears it after printing (see src/lib/consents/).
-- The audit trail records template activity (who published what, when) and
-- de-identified fee-override facts (a CDT code and amounts), never a patient.

-- ================================================================
-- 1. consent_forms — the template library
-- ================================================================

CREATE TABLE public.consent_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other' CHECK (category IN (
    'general_consent','surgical_consent','restorative','endodontic',
    'periodontal','implant','orthodontic','sedation','medication',
    'financial','preoperative','postoperative','office_policy','other'
  )),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  -- CDT codes / procedure keywords this form is recommended for.
  procedure_codes text[] NOT NULL DEFAULT '{}',
  -- Per-form override of who may edit; office-wide team permissions live
  -- in consent_settings and are enforced by consent_team_can() below.
  editable_by text NOT NULL DEFAULT 'managers' CHECK (editable_by IN ('managers','everyone')),
  -- Denormalized from the published content so the library can filter
  -- without unpacking JSON. The publish mutation keeps these in sync.
  requires_patient_signature boolean NOT NULL DEFAULT true,
  requires_doctor_signature boolean NOT NULL DEFAULT false,
  requires_witness_signature boolean NOT NULL DEFAULT false,
  requires_guardian_signature boolean NOT NULL DEFAULT false,
  -- Office rule: a hygienist may complete this form without a doctor
  -- signature (e.g. SRP / sonic instrumentation consents). Never hard-coded.
  hygienist_may_complete boolean NOT NULL DEFAULT false,
  includes_cost boolean NOT NULL DEFAULT false,
  is_financial boolean NOT NULL DEFAULT false,
  -- Shipped demo content; badge stays until the office edits + publishes.
  is_sample boolean NOT NULL DEFAULT false,
  -- AI-converted uploads park here until a human reviews them.
  needs_review boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','upload','duplicate','sample')),
  -- 0 = never published. Published snapshots live in consent_form_versions.
  current_version integer NOT NULL DEFAULT 0,
  -- Copy of the current published version's content, so the library and the
  -- Complete Forms workflow read one row per form. History stays in
  -- consent_form_versions.
  published_content jsonb,
  -- The unpublished working copy ({ blocks: [...] }); template text only.
  draft_content jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_consent_forms_org ON public.consent_forms(org_id, status, category);

-- ================================================================
-- 2. consent_form_versions — immutable published snapshots
-- ================================================================

CREATE TABLE public.consent_form_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  form_id uuid NOT NULL REFERENCES public.consent_forms(id) ON DELETE CASCADE,
  version integer NOT NULL,
  -- Full template snapshot ({ blocks: [...] }) — office wording only.
  content jsonb NOT NULL,
  change_notes text NOT NULL DEFAULT '',
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid,
  UNIQUE (form_id, version)
);

CREATE INDEX idx_consent_form_versions_form ON public.consent_form_versions(form_id, version DESC);

-- ================================================================
-- 3. consent_bundles + consent_bundle_items — treatment packets
-- ================================================================

CREATE TABLE public.consent_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  procedure_codes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  sort_order integer NOT NULL DEFAULT 0,
  is_sample boolean NOT NULL DEFAULT false,
  use_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_consent_bundles_org ON public.consent_bundles(org_id, status, sort_order);

CREATE TABLE public.consent_bundle_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  bundle_id uuid NOT NULL REFERENCES public.consent_bundles(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES public.consent_forms(id) ON DELETE CASCADE,
  requirement text NOT NULL DEFAULT 'required'
    CHECK (requirement IN ('required','recommended','optional','conditional')),
  -- Conditional items: the question the workflow asks, e.g. "Bone graft planned?"
  condition_label text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (bundle_id, form_id)
);

CREATE INDEX idx_consent_bundle_items_bundle ON public.consent_bundle_items(bundle_id, sort_order);

-- ================================================================
-- 4. consent_settings — one row of office rules per org
-- ================================================================

CREATE TABLE public.consent_settings (
  org_id uuid PRIMARY KEY,
  -- Privacy: how long the Complete Forms workflow may sit idle before
  -- temporary patient information is cleared from the browser.
  clear_timeout_minutes integer NOT NULL DEFAULT 30 CHECK (clear_timeout_minutes BETWEEN 5 AND 240),
  warn_before_clear boolean NOT NULL DEFAULT true,
  -- Team-tier permissions (owners/managers always may).
  team_can_upload boolean NOT NULL DEFAULT false,
  team_can_edit_templates boolean NOT NULL DEFAULT false,
  team_can_publish boolean NOT NULL DEFAULT false,
  team_can_archive boolean NOT NULL DEFAULT false,
  team_can_create_bundles boolean NOT NULL DEFAULT false,
  team_can_override_fees boolean NOT NULL DEFAULT true,
  team_can_print boolean NOT NULL DEFAULT true,
  team_can_change_signatures boolean NOT NULL DEFAULT false,
  -- Office-wide signature rules the workflow applies on top of each form.
  require_witness_default boolean NOT NULL DEFAULT false,
  require_guardian_for_minors boolean NOT NULL DEFAULT true,
  -- The office's designated financial agreement template, offered in Step 4.
  financial_form_id uuid REFERENCES public.consent_forms(id) ON DELETE SET NULL,
  always_offer_financial boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ================================================================
-- 5. consent_audit_log — template activity only, never patients
-- ================================================================

CREATE TABLE public.consent_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  -- e.g. form_created, form_published, form_archived, bundle_changed,
  -- fee_overridden, settings_changed.
  action text NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('form','bundle','settings','packet')),
  entity_id uuid,
  entity_name text NOT NULL DEFAULT '',
  actor_id uuid,
  actor_name text NOT NULL DEFAULT '',
  -- De-identified facts only (version numbers, CDT codes, amounts).
  -- NEVER patient names, tooth numbers, diagnoses, or completed forms.
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_consent_audit_org ON public.consent_audit_log(org_id, created_at DESC);

-- ================================================================
-- 6. updated_at triggers
-- ================================================================

CREATE TRIGGER update_consent_forms_updated_at
  BEFORE UPDATE ON public.consent_forms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_consent_bundles_updated_at
  BEFORE UPDATE ON public.consent_bundles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_consent_settings_updated_at
  BEFORE UPDATE ON public.consent_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ================================================================
-- 7. Permission helper + RLS
-- ================================================================

-- Reads the office's team-permission flags without granting table access.
-- SECURITY DEFINER so policies can consult it; returns false when the org
-- has never saved settings (safe default: managers only).
CREATE FUNCTION public.consent_team_can(p_org_id uuid, p_perm text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT CASE p_perm
      WHEN 'upload'   THEN s.team_can_upload
      WHEN 'edit'     THEN s.team_can_edit_templates
      WHEN 'publish'  THEN s.team_can_publish
      WHEN 'archive'  THEN s.team_can_archive
      WHEN 'bundles'  THEN s.team_can_create_bundles
      ELSE false
    END
    FROM public.consent_settings s
    WHERE s.org_id = p_org_id
  ), false);
$$;

ALTER TABLE public.consent_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_form_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_bundle_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_audit_log ENABLE ROW LEVEL SECURITY;

-- Templates: every member reads (completing forms needs them); editing is
-- admins, plus the team when the office granted it (globally or per-form).
CREATE POLICY "Members read consent forms"
  ON public.consent_forms FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "Admins and permitted team create consent forms"
  ON public.consent_forms FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin(org_id)
    OR (public.is_org_member(org_id) AND public.consent_team_can(org_id, 'upload'))
  );

CREATE POLICY "Admins and permitted team update consent forms"
  ON public.consent_forms FOR UPDATE TO authenticated
  USING (
    public.is_org_admin(org_id)
    OR (
      public.is_org_member(org_id)
      AND (public.consent_team_can(org_id, 'edit') OR editable_by = 'everyone')
    )
  )
  WITH CHECK (
    public.is_org_admin(org_id)
    OR (
      public.is_org_member(org_id)
      AND (public.consent_team_can(org_id, 'edit') OR editable_by = 'everyone')
    )
  );

CREATE POLICY "Admins delete consent forms"
  ON public.consent_forms FOR DELETE TO authenticated
  USING (public.is_org_admin(org_id));

-- Versions are immutable snapshots: read by members, written by admins or
-- the team when publishing is granted. No UPDATE policy on purpose.
CREATE POLICY "Members read consent form versions"
  ON public.consent_form_versions FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "Admins and permitted team publish versions"
  ON public.consent_form_versions FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin(org_id)
    OR (public.is_org_member(org_id) AND public.consent_team_can(org_id, 'publish'))
  );

CREATE POLICY "Admins delete consent form versions"
  ON public.consent_form_versions FOR DELETE TO authenticated
  USING (public.is_org_admin(org_id));

-- Bundles: members read, admins manage (team when granted).
CREATE POLICY "Members read consent bundles"
  ON public.consent_bundles FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "Admins and permitted team manage consent bundles"
  ON public.consent_bundles FOR ALL TO authenticated
  USING (
    public.is_org_admin(org_id)
    OR (public.is_org_member(org_id) AND public.consent_team_can(org_id, 'bundles'))
  )
  WITH CHECK (
    public.is_org_admin(org_id)
    OR (public.is_org_member(org_id) AND public.consent_team_can(org_id, 'bundles'))
  );

CREATE POLICY "Members read consent bundle items"
  ON public.consent_bundle_items FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "Admins and permitted team manage consent bundle items"
  ON public.consent_bundle_items FOR ALL TO authenticated
  USING (
    public.is_org_admin(org_id)
    OR (public.is_org_member(org_id) AND public.consent_team_can(org_id, 'bundles'))
  )
  WITH CHECK (
    public.is_org_admin(org_id)
    OR (public.is_org_member(org_id) AND public.consent_team_can(org_id, 'bundles'))
  );

-- Office rules: members read (the workflow applies them), admins write.
CREATE POLICY "Members read consent settings"
  ON public.consent_settings FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "Admins manage consent settings"
  ON public.consent_settings FOR ALL TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

-- Audit: any member may append (fee overrides happen at the front desk);
-- reading is admin-only. Append-only — no update/delete policies.
CREATE POLICY "Members append consent audit"
  ON public.consent_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY "Admins read consent audit"
  ON public.consent_audit_log FOR SELECT TO authenticated
  USING (public.is_org_admin(org_id));

-- Bundle use counter: bumped when a packet is started from a bundle so the
-- dashboard can rank "most-used bundles" without storing packet contents.
-- SECURITY DEFINER because Team members can use bundles they cannot edit.
CREATE FUNCTION public.consent_bundle_used(p_bundle_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.consent_bundles b
  SET use_count = use_count + 1
  WHERE b.id = p_bundle_id
    AND public.is_org_member(b.org_id);
$$;
