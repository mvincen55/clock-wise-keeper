
-- ============ escalation_policies ============
CREATE TABLE public.escalation_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('tardy_threshold','bypass_unresolved','checklist_gap','goal_stall')),
  threshold_count int NOT NULL DEFAULT 3 CHECK (threshold_count > 0),
  threshold_window_days int NOT NULL DEFAULT 30 CHECK (threshold_window_days > 0),
  reviewer_role text NOT NULL DEFAULT 'manager' CHECK (reviewer_role IN ('manager','owner')),
  review_due_days int NOT NULL DEFAULT 3 CHECK (review_due_days >= 0),
  escalate_to text CHECK (escalate_to IN ('owner')),
  escalate_after_days int NOT NULL DEFAULT 2 CHECK (escalate_after_days >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, kind)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.escalation_policies TO authenticated;
GRANT ALL ON public.escalation_policies TO service_role;
ALTER TABLE public.escalation_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their office policies"
  ON public.escalation_policies FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));
CREATE POLICY "Admins manage escalation policies"
  ON public.escalation_policies FOR ALL TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

CREATE TRIGGER escalation_policies_updated_at
  BEFORE UPDATE ON public.escalation_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ accountability_reports ============
CREATE TABLE public.accountability_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  policy_id uuid REFERENCES public.escalation_policies(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('tardy_threshold','bypass_unresolved','checklist_gap','goal_stall')),
  subject_user_id uuid NOT NULL,
  subject_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  summary text NOT NULL,
  facts jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'awaiting_member'
    CHECK (status IN ('awaiting_member','awaiting_manager','awaiting_owner','closed')),
  member_reason text,
  member_signed_name text,
  member_signed_at timestamptz,
  manager_note text,
  manager_signed_name text,
  manager_signed_at timestamptz,
  reviewer_user_id uuid,
  review_due_at timestamptz,
  escalated_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_accountability_reports_org_status
  ON public.accountability_reports (org_id, status);
CREATE INDEX idx_accountability_reports_subject
  ON public.accountability_reports (subject_user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.accountability_reports TO authenticated;
GRANT ALL ON public.accountability_reports TO service_role;
ALTER TABLE public.accountability_reports ENABLE ROW LEVEL SECURITY;

-- Only owners/managers read the raw table. The subject reads a masked view of
-- their own record through my_accountability_reports() so the escalation hop
-- to the owner is never visible to them.
CREATE POLICY "Admins read accountability reports"
  ON public.accountability_reports FOR SELECT TO authenticated
  USING (public.is_org_admin(org_id));
CREATE POLICY "Admins create accountability reports"
  ON public.accountability_reports FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(org_id));
CREATE POLICY "Admins update accountability reports"
  ON public.accountability_reports FOR UPDATE TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

CREATE TRIGGER accountability_reports_updated_at
  BEFORE UPDATE ON public.accountability_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Managers may only add their note/signature and close; the facts are frozen.
CREATE OR REPLACE FUNCTION public.guard_accountability_report_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN RETURN NEW; END IF;
  IF NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.subject_user_id IS DISTINCT FROM OLD.subject_user_id
     OR NEW.period_start IS DISTINCT FROM OLD.period_start
     OR NEW.period_end IS DISTINCT FROM OLD.period_end
     OR NEW.summary IS DISTINCT FROM OLD.summary
     OR NEW.facts IS DISTINCT FROM OLD.facts
     OR NEW.member_reason IS DISTINCT FROM OLD.member_reason
     OR NEW.member_signed_name IS DISTINCT FROM OLD.member_signed_name
     OR NEW.member_signed_at IS DISTINCT FROM OLD.member_signed_at THEN
    RAISE EXCEPTION 'The facts and the member''s own words cannot be edited';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_accountability_report_update
  BEFORE UPDATE ON public.accountability_reports
  FOR EACH ROW EXECUTE FUNCTION public.guard_accountability_report_update();

-- ============ subject-facing, escalation-blind reader ============
CREATE OR REPLACE FUNCTION public.my_accountability_reports()
RETURNS TABLE(
  id uuid, org_id uuid, kind text, period_start date, period_end date,
  summary text, status text, member_reason text, member_signed_name text,
  member_signed_at timestamptz, manager_note text, manager_signed_name text,
  manager_signed_at timestamptz, closed_at timestamptz, created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.org_id, r.kind, r.period_start, r.period_end,
         r.summary,
         -- awaiting_owner is collapsed into 'awaiting_manager': to the member,
         -- nothing changed when a review moves up the chain.
         CASE WHEN r.status = 'awaiting_owner' THEN 'awaiting_manager' ELSE r.status END,
         r.member_reason, r.member_signed_name, r.member_signed_at,
         r.manager_note, r.manager_signed_name, r.manager_signed_at,
         r.closed_at, r.created_at
  FROM public.accountability_reports r
  WHERE r.subject_user_id = auth.uid()
  ORDER BY r.created_at DESC;
$$;

-- ============ member signs ============
CREATE OR REPLACE FUNCTION public.sign_accountability_report(
  _report_id uuid, _reason text, _typed_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.accountability_reports;
  clean_name text := btrim(coalesce(_typed_name, ''));
  clean_reason text := btrim(coalesce(_reason, ''));
  pol public.escalation_policies;
BEGIN
  IF clean_name = '' THEN RAISE EXCEPTION 'Type your name to sign the record'; END IF;
  IF length(clean_reason) < 3 THEN RAISE EXCEPTION 'Add a short note about what happened'; END IF;

  SELECT * INTO r FROM public.accountability_reports WHERE id = _report_id;
  IF NOT FOUND OR r.subject_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Record not found';
  END IF;
  IF r.member_signed_at IS NOT NULL THEN
    RAISE EXCEPTION 'You already signed this record';
  END IF;

  SELECT * INTO pol FROM public.escalation_policies WHERE id = r.policy_id;

  UPDATE public.accountability_reports
     SET member_reason = clean_reason,
         member_signed_name = clean_name,
         member_signed_at = now(),
         status = 'awaiting_manager',
         review_due_at = now() + (COALESCE(pol.review_due_days, 3) || ' days')::interval
   WHERE id = _report_id;
END;
$$;

-- ============ manager / owner countersigns and closes ============
CREATE OR REPLACE FUNCTION public.countersign_accountability_report(
  _report_id uuid, _note text, _typed_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.accountability_reports;
  clean_name text := btrim(coalesce(_typed_name, ''));
  clean_note text := btrim(coalesce(_note, ''));
BEGIN
  IF clean_name = '' THEN RAISE EXCEPTION 'Type your name to sign off'; END IF;
  IF length(clean_note) < 3 THEN RAISE EXCEPTION 'Document the conversation before signing off'; END IF;

  SELECT * INTO r FROM public.accountability_reports WHERE id = _report_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Record not found'; END IF;
  IF NOT public.is_org_admin(r.org_id) THEN
    RAISE EXCEPTION 'Only an owner or manager can sign off on a record';
  END IF;
  IF r.subject_user_id = auth.uid() THEN
    RAISE EXCEPTION 'A record cannot be signed off by the person it is about';
  END IF;
  IF r.manager_signed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This record is already signed off';
  END IF;

  UPDATE public.accountability_reports
     SET manager_note = clean_note,
         manager_signed_name = clean_name,
         manager_signed_at = now(),
         reviewer_user_id = auth.uid(),
         status = 'closed',
         closed_at = now()
   WHERE id = _report_id;
END;
$$;

-- ============ escalation sweep ============
CREATE OR REPLACE FUNCTION public.sweep_accountability_escalations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  o record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT ar.*, COALESCE(p.escalate_after_days, 2) AS after_days,
           COALESCE(p.escalate_to, 'owner') AS target
      FROM public.accountability_reports ar
      LEFT JOIN public.escalation_policies p ON p.id = ar.policy_id
     WHERE ar.status = 'awaiting_manager'
       AND ar.review_due_at IS NOT NULL
  LOOP
    CONTINUE WHEN r.target IS NULL;
    CONTINUE WHEN now() < r.review_due_at + (r.after_days || ' days')::interval;

    UPDATE public.accountability_reports
       SET status = 'awaiting_owner', escalated_at = now()
     WHERE id = r.id;

    FOR o IN
      SELECT m.user_id FROM public.org_members m
       WHERE m.org_id = r.org_id AND m.role = 'owner' AND m.status = 'active'
         AND m.user_id <> r.subject_user_id
    LOOP
      INSERT INTO public.notifications (
        org_id, recipient_user_id, notification_type, title, message,
        related_table, related_id
      ) VALUES (
        r.org_id, o.user_id, 'accountability_escalation',
        'A review has been sitting',
        'This review has sat past its due date and needs a look. The record is waiting on a sign-off.',
        'accountability_reports', r.id
      );
    END LOOP;

    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sweep_accountability_escalations() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.my_accountability_reports() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sign_accountability_report(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.countersign_accountability_report(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.guard_accountability_report_update() FROM anon, authenticated;

-- ============ seed the default chain for every existing office ============
INSERT INTO public.escalation_policies
  (org_id, kind, threshold_count, threshold_window_days, reviewer_role, review_due_days, escalate_to, escalate_after_days, is_active)
SELECT o.id, 'tardy_threshold', 3, 30, 'manager', 3, 'owner', 2, true
FROM public.orgs o
ON CONFLICT (org_id, kind) DO NOTHING;
