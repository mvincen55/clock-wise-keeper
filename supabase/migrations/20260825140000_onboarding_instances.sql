-- Onboarding instances + dual sign-off (Phase 3 of the onboarding sign-off
-- module; docs/onboarding-signoff.md).
--
-- Starting a hire COPIES the chosen template into the instance (name, role
-- label, and one row per item with its section) so later template edits
-- never rewrite anyone's onboarding history. Each item then carries TWO
-- sign-off slots — trainer and trainee — and is complete only when both are
-- signed. With require_pin_on_signoff on, each slot is stamped by the
-- attest edge function from a PIN-verified attestation row; with it off,
-- the editable-initials fallback RPC stamps the slot and the record stays
-- marked unverified (no attestation reference).
--
-- Employment records: these PERSIST permanently by design (no patient data;
-- in scope for the no-PHI system). Clients hold SELECT only — every write
-- goes through the RPCs below or the attest function's service role, so a
-- snapshot cannot be edited after the fact from a browser.
--
-- Read visibility is org-member-wide: dual sign-off happens on a shared
-- office terminal signed in as WHOEVER, so any active member session must
-- be able to render an instance to run the sign-off flow. The completion
-- entry in the HR file (Phase 4) stays on accountability_reports with its
-- stricter visibility.

CREATE TABLE public.onboarding_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  -- The new hire.
  employee_id uuid NOT NULL,
  -- Provenance only; the snapshot below is authoritative for content.
  template_id uuid REFERENCES public.onboarding_templates(id) ON DELETE SET NULL,
  template_name text NOT NULL,
  role_label text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'complete')),
  started_at timestamptz NOT NULL DEFAULT now(),
  started_by uuid,
  completed_at timestamptz,
  -- Phase 4: the accountability report written to the HR file on completion.
  hr_report_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (employee_id, org_id)
    REFERENCES public.employees(id, org_id) ON DELETE CASCADE
);

CREATE TABLE public.onboarding_instance_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES public.onboarding_instances(id) ON DELETE CASCADE,
  -- Snapshot of the template content at start.
  section_title text NOT NULL,
  section_sort int NOT NULL DEFAULT 0,
  item_title text NOT NULL,
  item_detail text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  -- Trainer slot.
  trainer_employee_id uuid,
  trainer_initials text NOT NULL DEFAULT '',
  trainer_signed_at timestamptz,
  trainer_attestation_id uuid REFERENCES public.attestations(id) ON DELETE SET NULL,
  -- Trainee slot (the instance's employee).
  trainee_initials text NOT NULL DEFAULT '',
  trainee_signed_at timestamptz,
  trainee_attestation_id uuid REFERENCES public.attestations(id) ON DELETE SET NULL,
  -- Set when BOTH slots are signed; an item is complete only then.
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (trainer_employee_id, org_id)
    REFERENCES public.employees(id, org_id)
);

CREATE INDEX idx_onboarding_instances_org ON public.onboarding_instances(org_id, status, started_at DESC);
CREATE INDEX idx_onboarding_instances_employee ON public.onboarding_instances(employee_id);
CREATE INDEX idx_onboarding_instance_items_instance ON public.onboarding_instance_items(instance_id, section_sort, sort_order);
CREATE INDEX idx_onboarding_instance_items_open ON public.onboarding_instance_items(org_id, created_at) WHERE completed_at IS NULL;

ALTER TABLE public.onboarding_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_instance_items ENABLE ROW LEVEL SECURITY;

-- SELECT only for clients; the RPCs below and the attest edge function
-- (service role) are the write paths. This is also what makes the snapshot
-- immutable: no browser can UPDATE a copied title or a recorded signature.
REVOKE ALL ON public.onboarding_instances FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.onboarding_instance_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.onboarding_instances TO authenticated;
GRANT SELECT ON public.onboarding_instance_items TO authenticated;
GRANT ALL ON public.onboarding_instances TO service_role;
GRANT ALL ON public.onboarding_instance_items TO service_role;

CREATE POLICY "Members read onboarding instances"
  ON public.onboarding_instances FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "Members read onboarding instance items"
  ON public.onboarding_instance_items FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

CREATE TRIGGER trg_onboarding_instances_updated_at
  BEFORE UPDATE ON public.onboarding_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_onboarding_instance_items_updated_at
  BEFORE UPDATE ON public.onboarding_instance_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ================================================================
-- 1. Start flow — snapshot taken here, in one transaction
-- ================================================================

CREATE OR REPLACE FUNCTION public.start_onboarding_instance(
  _employee_id uuid,
  _template_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp public.employees;
  tpl public.onboarding_templates;
  v_instance_id uuid;
  v_item_count int;
BEGIN
  SELECT * INTO emp FROM public.employees WHERE id = _employee_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;
  IF emp.employment_status <> 'active' THEN
    RAISE EXCEPTION 'Onboarding can only be started for an active employee';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.can_manage_onboarding(emp.org_id) THEN
    RAISE EXCEPTION 'Only a manager or owner can start onboarding'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO tpl FROM public.onboarding_templates
   WHERE id = _template_id AND org_id = emp.org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found';
  END IF;
  IF NOT tpl.is_active THEN
    RAISE EXCEPTION 'This template is inactive';
  END IF;

  SELECT count(*) INTO v_item_count
    FROM public.onboarding_template_items WHERE template_id = tpl.id;
  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'This template has no items yet';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.onboarding_instances
    WHERE employee_id = _employee_id AND template_id = _template_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'An onboarding from this template is already underway for this employee';
  END IF;

  INSERT INTO public.onboarding_instances
    (org_id, employee_id, template_id, template_name, role_label, started_by)
  VALUES (emp.org_id, _employee_id, tpl.id, tpl.name, tpl.role_label, auth.uid())
  RETURNING id INTO v_instance_id;

  -- The snapshot: values copied, never referenced — later template edits
  -- cannot reach these rows.
  INSERT INTO public.onboarding_instance_items
    (org_id, instance_id, section_title, section_sort, item_title, item_detail, sort_order)
  SELECT emp.org_id, v_instance_id, s.title, s.sort_order, i.title, i.detail, i.sort_order
    FROM public.onboarding_template_items i
    JOIN public.onboarding_template_sections s ON s.id = i.section_id
   WHERE i.template_id = tpl.id
   ORDER BY s.sort_order, i.sort_order;

  -- Tell the new hire, when they have their own login.
  IF emp.user_id IS NOT NULL THEN
    INSERT INTO public.notifications
      (org_id, recipient_user_id, actor_user_id, notification_type, title, message, related_table, related_id)
    VALUES (
      emp.org_id, emp.user_id, auth.uid(), 'onboarding_started',
      'Your onboarding checklist is ready',
      'Everything you''ll learn is laid out step by step. You and your trainer sign each item off together.',
      'onboarding_instances', v_instance_id
    );
  END IF;

  RETURN v_instance_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_onboarding_instance(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_onboarding_instance(uuid, uuid) TO authenticated, service_role;

-- ================================================================
-- 2. Editable-initials fallback (require_pin_on_signoff = off)
-- ================================================================

-- Stamps one side of an item's dual sign-off with typed initials and NO
-- attestation reference — the record stays visibly unverified. Refused
-- outright while the office requires PINs.
CREATE OR REPLACE FUNCTION public.record_onboarding_signoff_fallback(
  _item_id uuid,
  _side text,
  _initials text,
  _trainer_employee_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item public.onboarding_instance_items;
  inst public.onboarding_instances;
  clean_initials text := upper(btrim(coalesce(_initials, '')));
  require_pin boolean;
BEGIN
  IF _side NOT IN ('trainer', 'trainee') THEN
    RAISE EXCEPTION 'Unknown sign-off side';
  END IF;
  IF clean_initials !~ '^[A-Z0-9]{2,8}$' THEN
    RAISE EXCEPTION 'Initials are 2-8 letters or digits';
  END IF;

  SELECT * INTO item FROM public.onboarding_instance_items WHERE id = _item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found';
  END IF;
  SELECT * INTO inst FROM public.onboarding_instances WHERE id = item.instance_id;

  IF auth.uid() IS NOT NULL AND NOT public.is_org_member(item.org_id) THEN
    RAISE EXCEPTION 'Not a member of this office'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF inst.status <> 'active' THEN
    RAISE EXCEPTION 'This onboarding is already complete';
  END IF;

  require_pin := COALESCE(
    (SELECT s.require_pin_on_signoff FROM public.org_practice_settings s WHERE s.org_id = item.org_id),
    true);
  IF require_pin THEN
    RAISE EXCEPTION 'This office requires PIN-verified sign-offs';
  END IF;

  IF _side = 'trainer' THEN
    IF item.trainer_signed_at IS NOT NULL THEN
      RAISE EXCEPTION 'The trainer side is already signed';
    END IF;
    IF _trainer_employee_id IS NULL THEN
      RAISE EXCEPTION 'Pick which team member trained this item';
    END IF;
    IF _trainer_employee_id = inst.employee_id THEN
      RAISE EXCEPTION 'The trainer must be someone other than the new hire';
    END IF;
    PERFORM 1 FROM public.employees e
     WHERE e.id = _trainer_employee_id AND e.org_id = item.org_id
       AND e.employment_status = 'active';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Trainer not found';
    END IF;

    UPDATE public.onboarding_instance_items
       SET trainer_employee_id = _trainer_employee_id,
           trainer_initials = clean_initials,
           trainer_signed_at = now(),
           completed_at = CASE WHEN trainee_signed_at IS NOT NULL THEN now() ELSE NULL END
     WHERE id = _item_id;
  ELSE
    IF item.trainee_signed_at IS NOT NULL THEN
      RAISE EXCEPTION 'The new hire side is already signed';
    END IF;

    UPDATE public.onboarding_instance_items
       SET trainee_initials = clean_initials,
           trainee_signed_at = now(),
           completed_at = CASE WHEN trainer_signed_at IS NOT NULL THEN now() ELSE NULL END
     WHERE id = _item_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_onboarding_signoff_fallback(uuid, text, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_onboarding_signoff_fallback(uuid, text, text, uuid)
  TO authenticated, service_role;

-- ================================================================
-- 3. PIN sign-off applier core — called by the attest edge function
-- ================================================================

-- Applies a PIN-verified attestation to the right slot of an item. The SIDE
-- is decided HERE from who attested (the instance's employee = trainee;
-- anyone else = trainer), never by the client. service_role only, like
-- _verify_employee_pin_internal.
CREATE OR REPLACE FUNCTION public._apply_onboarding_signoff_internal(_attestation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  att public.attestations;
  item public.onboarding_instance_items;
  inst public.onboarding_instances;
  v_initials text;
  v_side text;
BEGIN
  SELECT * INTO att FROM public.attestations WHERE id = _attestation_id;
  IF NOT FOUND OR NOT att.verified THEN
    RETURN jsonb_build_object('applied', false, 'error', 'Attestation not found');
  END IF;
  IF att.related_table <> 'onboarding_instance_items' THEN
    RETURN jsonb_build_object('applied', false, 'error', 'Attestation does not reference an onboarding item');
  END IF;

  SELECT * INTO item FROM public.onboarding_instance_items
   WHERE id = att.related_id FOR UPDATE;
  IF NOT FOUND OR item.org_id <> att.org_id THEN
    RETURN jsonb_build_object('applied', false, 'error', 'Onboarding item not found');
  END IF;
  SELECT * INTO inst FROM public.onboarding_instances WHERE id = item.instance_id;
  IF inst.status <> 'active' THEN
    RETURN jsonb_build_object('applied', false, 'error', 'This onboarding is already complete');
  END IF;

  SELECT COALESCE(NULLIF(upper(btrim(e.tag)), ''), 'PIN')
    INTO v_initials
    FROM public.employees e WHERE e.id = att.employee_id;

  IF att.employee_id = inst.employee_id THEN
    v_side := 'trainee';
    IF item.trainee_signed_at IS NOT NULL THEN
      RETURN jsonb_build_object('applied', false, 'error', 'The new hire side is already signed');
    END IF;
    UPDATE public.onboarding_instance_items
       SET trainee_initials = v_initials,
           trainee_signed_at = att.attested_at,
           trainee_attestation_id = att.id,
           completed_at = CASE WHEN trainer_signed_at IS NOT NULL THEN att.attested_at ELSE NULL END
     WHERE id = item.id;
  ELSE
    v_side := 'trainer';
    IF item.trainer_signed_at IS NOT NULL THEN
      RETURN jsonb_build_object('applied', false, 'error', 'The trainer side is already signed');
    END IF;
    UPDATE public.onboarding_instance_items
       SET trainer_employee_id = att.employee_id,
           trainer_initials = v_initials,
           trainer_signed_at = att.attested_at,
           trainer_attestation_id = att.id,
           completed_at = CASE WHEN trainee_signed_at IS NOT NULL THEN att.attested_at ELSE NULL END
     WHERE id = item.id;
  END IF;

  RETURN jsonb_build_object('applied', true, 'side', v_side);
END;
$$;

REVOKE EXECUTE ON FUNCTION public._apply_onboarding_signoff_internal(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._apply_onboarding_signoff_internal(uuid) TO service_role;
