-- Onboarding lifecycle wiring (Phase 4 of the onboarding sign-off module;
-- docs/onboarding-signoff.md). Connects instances to the machinery that
-- already exists — nothing parallel is invented:
--
--  * STALE ITEMS ride the escalation engine: a new escalation_policies kind
--    'onboarding_stale' (member-visible like every policy — communicated
--    expectations), org-configurable threshold. When an active instance has
--    >= threshold_count items open longer than threshold_window_days, the
--    sweep creates ONE one-off item on the office's manager checklist
--    (source 'onboarding_stale') and notifies admins — factual tone, never
--    threatening.
--  * REVIEW TASKS: starting an instance also schedules review items on the
--    manager checklist at org-configurable day offsets
--    (org_practice_settings.onboarding_review_days, default {7,30,60,90}),
--    as dated one-off items (source 'onboarding_review').
--  * COMPLETION: when every item is dual-signed AND every scheduled review
--    is checked off, the sweep writes the completion entry to the
--    employee's HR file — the existing accountability_reports "Permanent
--    record" (new kind 'onboarding_complete', closed on arrival) — and
--    marks the instance complete.
--
-- Employment data only; additive; no destructive changes.

-- ================================================================
-- 1. Register the new kinds on the existing engine tables
-- ================================================================

ALTER TABLE public.escalation_policies
  DROP CONSTRAINT IF EXISTS escalation_policies_kind_check;
ALTER TABLE public.escalation_policies
  ADD CONSTRAINT escalation_policies_kind_check
  CHECK (kind IN ('tardy_threshold','bypass_unresolved','checklist_gap','goal_stall','onboarding_stale'));

ALTER TABLE public.accountability_reports
  DROP CONSTRAINT IF EXISTS accountability_reports_kind_check;
ALTER TABLE public.accountability_reports
  ADD CONSTRAINT accountability_reports_kind_check
  CHECK (kind IN ('tardy_threshold','bypass_unresolved','checklist_gap','goal_stall','onboarding_stale','onboarding_complete'));

-- Default stale rule for every existing office: ANY single item open past
-- 14 days raises a manager task. Both numbers stay office-editable in
-- Settings → People & policies (the same visible-threshold card as the
-- other rules).
INSERT INTO public.escalation_policies
  (org_id, kind, threshold_count, threshold_window_days, reviewer_role, review_due_days, escalate_to, escalate_after_days, is_active)
SELECT o.id, 'onboarding_stale', 1, 14, 'manager', 3, 'owner', 2, true
FROM public.orgs o
ON CONFLICT (org_id, kind) DO NOTHING;

-- Review intervals, org-configurable (defaults are the product).
ALTER TABLE public.org_practice_settings
  ADD COLUMN IF NOT EXISTS onboarding_review_days integer[] NOT NULL DEFAULT '{7,30,60,90}';

-- A new hire on a shared login has no user account yet: completion records
-- attach to the EMPLOYEE (subject_employee_id); the user id is optional.
-- Permissive-only change — existing rows and flows are untouched.
ALTER TABLE public.accountability_reports
  ALTER COLUMN subject_user_id DROP NOT NULL;

-- ================================================================
-- 2. The office's manager checklist (find, or create the seeded shape)
-- ================================================================

CREATE OR REPLACE FUNCTION public._onboarding_manager_checklist(_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.checklists
   WHERE org_id = _org_id AND audience = 'manager' AND owner_user_id IS NULL
   ORDER BY sort_order, created_at
   LIMIT 1;
  IF FOUND THEN RETURN v_id; END IF;

  -- Same name/shape the factory seed uses (src/lib/checklist-defaults.ts),
  -- for offices that never opened /checklists.
  INSERT INTO public.checklists (org_id, name, audience, sort_order)
  VALUES (_org_id, 'Manager', 'manager', 30)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._onboarding_manager_checklist(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._onboarding_manager_checklist(uuid) TO service_role;

-- ================================================================
-- 3. Review scheduling — start_onboarding_instance learns the last step
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
  v_checklist_id uuid;
  v_review_days integer[];
  v_offset integer;
  v_label text;
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

  -- Review tasks onto the manager checklist, at the office's intervals.
  v_review_days := COALESCE(
    (SELECT s.onboarding_review_days FROM public.org_practice_settings s WHERE s.org_id = emp.org_id),
    '{7,30,60,90}'::integer[]);
  IF array_length(v_review_days, 1) IS NOT NULL THEN
    v_checklist_id := public._onboarding_manager_checklist(emp.org_id);
    FOREACH v_offset IN ARRAY v_review_days LOOP
      CONTINUE WHEN v_offset IS NULL OR v_offset <= 0;
      v_label := CASE WHEN v_offset = 7 THEN 'Week-1 review'
                      ELSE v_offset || '-day review' END;
      INSERT INTO public.checklist_items
        (org_id, checklist_id, title, cadence, per_person, is_active, sort_order,
         due_date, source, source_ref, created_by)
      VALUES (
        emp.org_id, v_checklist_id,
        v_label || ' — ' || emp.display_name || '''s onboarding',
        'daily', false, true, 500 + v_offset,
        (now() AT TIME ZONE 'America/New_York')::date + v_offset,
        'onboarding_review',
        jsonb_build_object('instance_id', v_instance_id, 'offset_days', v_offset),
        auth.uid()
      );
    END LOOP;
  END IF;

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

-- (grants for start_onboarding_instance carry over from Phase 3's GRANT)

-- ================================================================
-- 4. The lifecycle sweep — stale detection + completion, service only
-- ================================================================

CREATE OR REPLACE FUNCTION public._onboarding_lifecycle_sweep_internal()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pol record;
  inst record;
  a record;
  v_stale_count int;
  v_oldest_days int;
  v_checklist_id uuid;
  v_open_items int;
  v_open_reviews int;
  v_total_items int;
  v_verified_items int;
  v_name text;
  v_report_id uuid;
  v_today date := (now() AT TIME ZONE 'America/New_York')::date;
  n_stale int := 0;
  n_completed int := 0;
BEGIN
  -- ---- stale scan: policy-driven, one manager task per instance ----
  FOR pol IN
    SELECT * FROM public.escalation_policies
     WHERE kind = 'onboarding_stale' AND is_active = true
  LOOP
    FOR inst IN
      SELECT i.id, i.org_id, i.employee_id,
             count(*) FILTER (WHERE it.completed_at IS NULL
                              AND it.created_at < now() - make_interval(days => pol.threshold_window_days)) AS stale_items,
             min(it.created_at) FILTER (WHERE it.completed_at IS NULL) AS oldest_open
        FROM public.onboarding_instances i
        JOIN public.onboarding_instance_items it ON it.instance_id = i.id
       WHERE i.org_id = pol.org_id AND i.status = 'active'
       GROUP BY i.id, i.org_id, i.employee_id
    LOOP
      CONTINUE WHEN inst.stale_items < pol.threshold_count;
      -- Idempotent: one open manager task per instance.
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.checklist_items ci
        WHERE ci.org_id = inst.org_id
          AND ci.source = 'onboarding_stale'
          AND ci.source_ref->>'instance_id' = inst.id::text
          AND ci.is_active = true
      );

      SELECT display_name INTO v_name FROM public.employees WHERE id = inst.employee_id;
      v_oldest_days := GREATEST(0, (now()::date - inst.oldest_open::date));
      v_checklist_id := public._onboarding_manager_checklist(inst.org_id);

      -- Factual, never threatening: the numbers and the ask, nothing else.
      INSERT INTO public.checklist_items
        (org_id, checklist_id, title, cadence, per_person, is_active, sort_order,
         due_date, source, source_ref)
      VALUES (
        inst.org_id, v_checklist_id,
        'Onboarding check-in — ' || v_name || ': ' || inst.stale_items ||
          ' item' || CASE WHEN inst.stale_items = 1 THEN '' ELSE 's' END ||
          ' open ' || pol.threshold_window_days || '+ days',
        'daily', false, true, 490,
        v_today,
        'onboarding_stale',
        jsonb_build_object('instance_id', inst.id, 'stale_items', inst.stale_items,
                           'threshold_days', pol.threshold_window_days)
      );

      FOR a IN
        SELECT m.user_id FROM public.org_members m
         WHERE m.org_id = inst.org_id AND m.status = 'active'
           AND m.role IN ('owner', 'manager')
      LOOP
        INSERT INTO public.notifications
          (org_id, recipient_user_id, notification_type, title, message, related_table, related_id)
        VALUES (
          inst.org_id, a.user_id, 'onboarding_stale',
          'Onboarding check-in added to the manager checklist',
          v_name || ' has ' || inst.stale_items || ' onboarding item' ||
            CASE WHEN inst.stale_items = 1 THEN '' ELSE 's' END ||
            ' open longer than ' || pol.threshold_window_days ||
            ' days. The oldest has been open ' || v_oldest_days || ' days.',
          'onboarding_instances', inst.id
        );
      END LOOP;

      n_stale := n_stale + 1;
    END LOOP;
  END LOOP;

  -- ---- completion: all items dual-signed AND every scheduled review done ----
  FOR inst IN
    SELECT i.* FROM public.onboarding_instances i WHERE i.status = 'active'
  LOOP
    SELECT count(*) FILTER (WHERE completed_at IS NULL),
           count(*),
           count(*) FILTER (WHERE trainer_attestation_id IS NOT NULL AND trainee_attestation_id IS NOT NULL)
      INTO v_open_items, v_total_items, v_verified_items
      FROM public.onboarding_instance_items WHERE instance_id = inst.id;
    CONTINUE WHEN v_total_items = 0 OR v_open_items > 0;

    -- Every review item scheduled for this instance must be checked off
    -- (dated one-off items complete against their own day's period_key).
    SELECT count(*) INTO v_open_reviews
      FROM public.checklist_items ci
     WHERE ci.org_id = inst.org_id
       AND ci.source = 'onboarding_review'
       AND ci.source_ref->>'instance_id' = inst.id::text
       AND ci.is_active = true
       AND NOT EXISTS (
         SELECT 1 FROM public.checklist_completions cc
         WHERE cc.item_id = ci.id
           AND cc.period_key = to_char(ci.due_date, 'YYYY-MM-DD')
       );
    CONTINUE WHEN v_open_reviews > 0;

    SELECT display_name INTO v_name FROM public.employees WHERE id = inst.employee_id;

    -- The HR file entry: the existing permanent record, closed on arrival.
    INSERT INTO public.accountability_reports
      (org_id, kind, subject_user_id,
       subject_employee_id, period_start, period_end, summary, facts, status, closed_at)
    SELECT inst.org_id, 'onboarding_complete',
           e.user_id,
           inst.employee_id,
           inst.started_at::date, v_today,
           'Completed the ' || inst.template_name || ' onboarding' ||
             CASE WHEN inst.role_label <> '' THEN ' (' || inst.role_label || ')' ELSE '' END ||
             ': ' || v_total_items || ' items, each signed off by trainer and team member' ||
             CASE WHEN v_verified_items = v_total_items THEN ', all PIN-verified' ELSE '' END ||
             '. Started ' || to_char(inst.started_at, 'Mon DD, YYYY') || '.',
           jsonb_build_object(
             'instance_id', inst.id, 'template_name', inst.template_name,
             'role_label', inst.role_label, 'items_total', v_total_items,
             'items_pin_verified', v_verified_items,
             'started_at', inst.started_at),
           'closed', now()
      FROM public.employees e WHERE e.id = inst.employee_id
    RETURNING id INTO v_report_id;

    UPDATE public.onboarding_instances
       SET status = 'complete', completed_at = now(), hr_report_id = v_report_id
     WHERE id = inst.id;

    -- The stale task, if one is still open, is done with.
    UPDATE public.checklist_items
       SET is_active = false
     WHERE org_id = inst.org_id
       AND source = 'onboarding_stale'
       AND source_ref->>'instance_id' = inst.id::text
       AND is_active = true;

    FOR a IN
      SELECT m.user_id FROM public.org_members m
       WHERE m.org_id = inst.org_id AND m.status = 'active'
         AND m.role IN ('owner', 'manager')
      UNION
      SELECT e.user_id FROM public.employees e
       WHERE e.id = inst.employee_id AND e.user_id IS NOT NULL
    LOOP
      INSERT INTO public.notifications
        (org_id, recipient_user_id, notification_type, title, message, related_table, related_id)
      VALUES (
        inst.org_id, a.user_id, 'onboarding_complete',
        v_name || '''s onboarding is complete',
        'Every item is signed off by both people and every review is done. The completion entry is on the employment record.',
        'onboarding_instances', inst.id
      );
    END LOOP;

    n_completed := n_completed + 1;
  END LOOP;

  RETURN jsonb_build_object('stale_tasks_created', n_stale, 'instances_completed', n_completed);
END;
$$;

REVOKE EXECUTE ON FUNCTION public._onboarding_lifecycle_sweep_internal()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._onboarding_lifecycle_sweep_internal() TO service_role;

-- ================================================================
-- 5. Daily schedule (same cron + vault pattern as the other engines)
-- ================================================================

DO $$
BEGIN
  PERFORM cron.unschedule('onboarding-lifecycle-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'onboarding-lifecycle-daily',
  '20 13 * * *',
  $$
  select net.http_post(
    url := 'https://lfiplzmxpmybtbzhmnkp.supabase.co/functions/v1/onboarding-lifecycle',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'email_queue_service_role_key'
      )
    ),
    body := jsonb_build_object('time', now())
  ) as request_id;
  $$
);
