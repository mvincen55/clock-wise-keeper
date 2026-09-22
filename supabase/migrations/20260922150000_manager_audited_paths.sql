-- Three audited paths the manager experience needs (design §5.4, §9).
--
-- Each is a SECURITY DEFINER function that changes the record and writes its
-- audit row in the same transaction. The audit_events INSERT policy only
-- checks membership, so a row written from the browser proves nothing; a row
-- written here cannot be skipped or forged. Nothing is deleted from the audit
-- log (it is append-only); reversals are new events.

-- 1. Seal or unseal a closeout. Same-day seals were never logged, and the
--    past-day trigger logs only a field diff with no actor context; this logs
--    both directions with who, when, and why. The rule is the UPDATE policy's:
--    any member today; later, owners, managers, or the closeout-history grant.
CREATE OR REPLACE FUNCTION public.seal_close_day(p_closeout_id uuid, p_seal boolean, p_reason text DEFAULT '')
RETURNS public.deposit_logs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_log public.deposit_logs;
  v_uid uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'America/New_York')::date;
  v_before jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_log FROM public.deposit_logs WHERE id = p_closeout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Closeout not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.is_org_member(v_log.org_id) THEN RAISE EXCEPTION 'Not a member of this office' USING ERRCODE = '42501'; END IF;
  IF v_log.deposit_date < v_today
     AND NOT (public.is_org_admin(v_log.org_id) OR public.has_permission(v_log.org_id, 'edit_closeout_history')) THEN
    RAISE EXCEPTION 'Only an owner, a manager, or someone with the closeout-history grant can change a past day' USING ERRCODE = '42501';
  END IF;
  IF (p_seal AND v_log.sealed_at IS NOT NULL) OR (NOT p_seal AND v_log.sealed_at IS NULL) THEN
    RETURN v_log; -- already in the requested state; nothing to record
  END IF;
  v_before := jsonb_build_object('sealed_at', v_log.sealed_at, 'sealed_by', v_log.sealed_by);
  UPDATE public.deposit_logs
     SET sealed_at = CASE WHEN p_seal THEN now() ELSE NULL END,
         sealed_by = CASE WHEN p_seal THEN v_uid ELSE NULL END
   WHERE id = p_closeout_id
   RETURNING * INTO v_log;
  INSERT INTO public.audit_events
    (user_id, org_id, actor_id, event_type, action_type, target_table, target_id, before_json, after_json, reason, related_date, event_details)
  VALUES
    (v_uid, v_log.org_id, v_uid, CASE WHEN p_seal THEN 'close_day_seal' ELSE 'close_day_unseal' END, 'update', 'deposit_logs', v_log.id,
     v_before, jsonb_build_object('sealed_at', v_log.sealed_at, 'sealed_by', v_log.sealed_by),
     NULLIF(btrim(coalesce(p_reason, '')), ''), v_log.deposit_date, jsonb_build_object('target_employee_id', NULL));
  RETURN v_log;
END $$;
REVOKE ALL ON FUNCTION public.seal_close_day(uuid, boolean, text) FROM public;
GRANT EXECUTE ON FUNCTION public.seal_close_day(uuid, boolean, text) TO authenticated;

-- 2. Reverse an approved PTO request. Today the only cancel path for an
--    approved request leaves its calendar rows in place, so the balance keeps
--    the deduction. The live ledger reads days_off.hours, so removing the
--    approval's rows (source 'pto_request', request_id) restores the balance
--    and the days_off trigger re-runs attendance. A matching credit is
--    written to pto_transactions so the transaction log reads true, and the
--    person is told.
CREATE OR REPLACE FUNCTION public.reverse_pto_approval(p_request_id uuid, p_reason text)
RETURNS public.pto_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req public.pto_requests;
  v_uid uuid := auth.uid();
  v_hours numeric;
  v_emp_user uuid;
  v_removed integer := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) < 5 THEN RAISE EXCEPTION 'A reason of at least 5 characters is required' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_req FROM public.pto_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.is_org_admin(v_req.org_id) THEN RAISE EXCEPTION 'Only an owner or manager can reverse an approval' USING ERRCODE = '42501'; END IF;
  IF v_req.status <> 'approved' THEN RAISE EXCEPTION 'Only an approved request can be reversed' USING ERRCODE = '22023'; END IF;
  v_hours := CASE WHEN v_req.pto_type = 'unpaid' THEN 0 ELSE coalesce(v_req.hours_requested, 0) END;
  SELECT user_id INTO v_emp_user FROM public.employees WHERE id = v_req.employee_id;

  DELETE FROM public.days_off WHERE request_id = v_req.id AND source = 'pto_request';
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  UPDATE public.pto_requests
     SET status = 'cancelled', reviewed_by = v_uid, reviewed_at = now(),
         manager_note = concat_ws(' · ', NULLIF(btrim(coalesce(manager_note, '')), ''), 'Approval reversed: ' || btrim(p_reason))
   WHERE id = v_req.id
   RETURNING * INTO v_req;

  IF v_hours > 0 AND EXISTS (SELECT 1 FROM public.pto_transactions t WHERE t.source_id = v_req.id AND t.transaction_type = 'taken') THEN
    INSERT INTO public.pto_transactions (org_id, employee_id, transaction_date, hours, transaction_type, source, source_id, reason, created_by)
    VALUES (v_req.org_id, v_req.employee_id, v_req.start_date, v_hours, 'adjustment', 'manager', v_req.id, 'Approval reversed: ' || btrim(p_reason), v_uid);
  END IF;

  INSERT INTO public.audit_events
    (user_id, org_id, employee_id, actor_id, event_type, action_type, target_table, target_id, before_json, after_json, reason, related_date, event_details)
  VALUES
    (coalesce(v_emp_user, v_uid), v_req.org_id, v_req.employee_id, v_uid, 'pto_request_reverse_approval', 'request_reverse', 'pto_requests', v_req.id,
     jsonb_build_object('status', 'approved'),
     jsonb_build_object('status', 'cancelled', 'days_off_removed', v_removed, 'hours_credited', v_hours),
     btrim(p_reason), v_req.start_date, jsonb_build_object('target_employee_id', v_req.employee_id));

  IF v_req.created_by IS NOT NULL AND v_req.created_by <> v_uid THEN
    INSERT INTO public.notifications (org_id, recipient_user_id, actor_user_id, notification_type, title, message, related_table, related_id)
    VALUES (v_req.org_id, v_req.created_by, v_uid, 'pto_request_reversed', 'PTO approval reversed',
            format('The approval of your %s request for %s to %s was reversed: %s', upper(v_req.pto_type::text), v_req.start_date, v_req.end_date, btrim(p_reason)),
            'pto_requests', v_req.id);
  END IF;
  RETURN v_req;
END $$;
REVOKE ALL ON FUNCTION public.reverse_pto_approval(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.reverse_pto_approval(uuid, text) TO authenticated;

-- 3. Withdraw a knowledge approval: an approved, unpublished version returns
--    to review. review_knowledge_version accepts only approved or
--    changes_requested, so this is the missing path. Content stays frozen
--    (blocks change only in draft); the approving decision is removed and
--    the withdrawal is the audit record; the submitter is told.
CREATE OR REPLACE FUNCTION public.withdraw_knowledge_approval(p_version_id uuid, p_note text DEFAULT '')
RETURNS public.knowledge_versions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_version public.knowledge_versions;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_version FROM public.knowledge_versions WHERE id = p_version_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Version not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.is_org_admin(v_version.org_id) THEN RAISE EXCEPTION 'Only an owner or manager can withdraw an approval' USING ERRCODE = '42501'; END IF;
  IF v_version.status <> 'approved' THEN RAISE EXCEPTION 'Only an approved, unpublished version can be withdrawn' USING ERRCODE = '22023'; END IF;
  PERFORM set_config('app.knowledge_workflow', '1', true);
  UPDATE public.knowledge_versions
     SET status = 'in_review', approved_by = NULL, approved_at = NULL, updated_at = now()
   WHERE id = v_version.id
   RETURNING * INTO v_version;
  DELETE FROM public.knowledge_reviews WHERE version_id = v_version.id AND decision = 'approved';
  INSERT INTO public.audit_events
    (user_id, org_id, actor_id, event_type, action_type, target_table, target_id, before_json, after_json, reason, event_details)
  VALUES
    (v_uid, v_version.org_id, v_uid, 'knowledge_approval_withdrawn', 'update', 'knowledge_versions', v_version.id,
     jsonb_build_object('status', 'approved'), jsonb_build_object('status', 'in_review'),
     NULLIF(btrim(coalesce(p_note, '')), ''), jsonb_build_object('target_employee_id', NULL));
  IF v_version.submitted_by IS NOT NULL AND v_version.submitted_by <> v_uid THEN
    INSERT INTO public.notifications (org_id, recipient_user_id, actor_user_id, notification_type, title, message, related_table, related_id)
    VALUES (v_version.org_id, v_version.submitted_by, v_uid, 'knowledge_approval_withdrawn', 'Approval withdrawn',
            format('“%s” (version %s) is back in review%s', v_version.title, v_version.version_number,
                   CASE WHEN length(btrim(coalesce(p_note, ''))) > 0 THEN ': ' || btrim(p_note) ELSE '' END),
            'knowledge_versions', v_version.id);
  END IF;
  RETURN v_version;
END $$;
REVOKE ALL ON FUNCTION public.withdraw_knowledge_approval(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.withdraw_knowledge_approval(uuid, text) TO authenticated;
