-- Live release probe. Run with the sheet migration in a transaction, and
-- always roll back. Uses an existing allowlisted manager and staff account;
-- all campaign/test records disappear on rollback.
DO $$
DECLARE manager_user uuid; staff_user uuid; staff_emp uuid; manager_emp uuid; org uuid;
  cid uuid:=gen_random_uuid(); s public.fts_sheets; s2 public.fts_sheets; r public.fts_sheet_rows;
  v jsonb; v2 jsonb; result jsonb; request uuid:=gen_random_uuid(); original uuid; h public.fts_activities;
  base timestamptz; bonus timestamptz; wk date; n int; pending_row public.fts_sheet_rows;
BEGIN
  SELECT m.user_id,e.id,m.org_id INTO manager_user,manager_emp,org FROM public.org_members m JOIN public.employees e ON e.user_id=m.user_id AND e.org_id=m.org_id
    WHERE m.org_id='852fc8e0-4071-499b-b655-f86d6f789cd5' AND m.status='active' AND m.role IN ('owner','manager') AND e.employment_status='active' ORDER BY (e.display_name ILIKE '%Megan%') DESC LIMIT 1;
  SELECT m.user_id,e.id INTO staff_user,staff_emp FROM public.org_members m JOIN public.employees e ON e.user_id=m.user_id AND e.org_id=m.org_id
    WHERE m.org_id=org AND m.status='active' AND m.role='employee' AND e.employment_status='active' LIMIT 1;
  IF manager_user IS NULL OR staff_user IS NULL THEN RAISE EXCEPTION 'Existing manager and employee accounts required'; END IF;
  base:=date_trunc('day',now() AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'+interval '8 hours'; bonus:=base+interval '15 minutes';
  INSERT INTO public.fts_campaigns(id,org_id,name,starts_on,ends_on) VALUES(cid,org,'Q4 sheet rollback probe',(base AT TIME ZONE 'America/New_York')::date-14,'2026-12-31');
  INSERT INTO public.fts_participants(campaign_id,org_id,employee_id,scoring_role) VALUES(cid,org,staff_emp,'assistant'),(cid,org,manager_emp,'clerical');
  wk:=public.fts_week_key(base,'America/New_York','2026-12-31');
  PERFORM set_config('request.jwt.claim.sub',manager_user::text,true); PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',manager_user,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  s:=public.fts_print_sheet(cid,wk,request); s2:=public.fts_print_sheet(cid,wk,request);
  IF s.id<>s2.id OR s.sheet_code!~'^S-[0-9]{4}-A$' THEN RAISE EXCEPTION 'Print retry created a new sheet'; END IF;
  BEGIN PERFORM public.fts_set_auto_import(cid,true); RAISE EXCEPTION 'Unvalidated automatic entry enabled'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  v:=jsonb_build_object('row_no',4,'blank',false,'occurred_at',to_char(base AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'credit_employee_id',staff_emp,
    'booked_by_employee_id',manager_emp,'staff_confirmed',true,'handoff_verified',true,'prepay_yes',true,'prepay_at',to_char(bonus AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'prepay_verified',true,'app_code',NULL,'crossed_out',false,
    'confidence',jsonb_build_object('occurred_at',1,'credit',1,'booked_by',1,'staff',1,'handoff_verified',1,'prepay_yes',1,'prepay_at',1,'prepay_verified',1,'app_code',1,'crossed_out',1));
  result:=public.fts_apply_sheet_scan(cid,s.sheet_code,'local:tesseract-7',jsonb_build_array(v),now(),gen_random_uuid());
  SELECT * INTO r FROM public.fts_sheet_rows WHERE sheet_id=s.id AND row_no=4;
  IF r.handoff_state<>'flagged' OR NOT('auto_import_off'=ANY(r.flags)) OR r.handoff_activity_id IS NOT NULL THEN RAISE EXCEPTION 'Disabled importer awarded points'; END IF;
  r:=public.fts_resolve_sheet_row(r.id,'enter',staff_emp,NULL,base,bonus,NULL,true,true);
  IF (SELECT COALESCE(sum(awarded_points),0) FROM public.fts_activities WHERE campaign_id=cid AND employee_id=staff_emp AND tally_week=wk AND status='approved')<>4 OR r.handoff_state<>'entered' OR r.prepay_state<>'entered' THEN RAISE EXCEPTION 'Verified handoff and prepay did not earn four'; END IF;
  original:=r.handoff_activity_id;
  result:=public.fts_apply_sheet_scan(cid,s.sheet_code,'local:tesseract-7',jsonb_build_array(v),now(),gen_random_uuid());
  IF (SELECT COALESCE(sum(awarded_points),0) FROM public.fts_activities WHERE campaign_id=cid AND employee_id=staff_emp AND tally_week=wk AND status='approved')<>4 OR (result->>'already_in')::int<>1 THEN RAISE EXCEPTION 'Rescan duplicated credit'; END IF;
  v2:=jsonb_set(v,'{occurred_at}',to_jsonb(to_char((base+interval '1 minute') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
  result:=public.fts_apply_sheet_scan(cid,s.sheet_code,'local:tesseract-7',jsonb_build_array(v2),now(),gen_random_uuid());
  SELECT * INTO r FROM public.fts_sheet_rows WHERE sheet_id=s.id AND row_no=4;
  IF NOT('row_changed'=ANY(r.flags)) OR (SELECT COALESCE(sum(awarded_points),0) FROM public.fts_activities WHERE campaign_id=cid AND employee_id=staff_emp AND tally_week=wk AND status='approved')<>4 THEN RAISE EXCEPTION 'Changed scan overwrote original points'; END IF;
  r:=public.fts_resolve_sheet_row(r.id,'keep_original');
  r:=public.fts_resolve_sheet_row(r.id,'replace',staff_emp,NULL,base+interval '1 minute',bonus,'recorded_in_error',true,true);
  IF r.handoff_activity_id=original OR (SELECT supersedes_id FROM public.fts_activities WHERE id=r.handoff_activity_id)<>original OR (SELECT COALESCE(sum(awarded_points),0) FROM public.fts_activities WHERE campaign_id=cid AND employee_id=staff_emp AND tally_week=wk AND status='approved')<>4 THEN RAISE EXCEPTION 'Correction failed to replace with history'; END IF;
  BEGIN PERFORM public.fts_reverse(r.handoff_activity_id,'recorded_in_error'); RAISE EXCEPTION 'Parent reversed before bonus'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM public.fts_reverse(r.prepay_activity_id,'recorded_in_error'); PERFORM public.fts_reverse(r.handoff_activity_id,'recorded_in_error');
  result:=public.fts_apply_sheet_scan(cid,s.sheet_code,'local:tesseract-7',jsonb_build_array(v2),now(),gen_random_uuid());
  IF (SELECT COALESCE(sum(awarded_points),0) FROM public.fts_activities WHERE campaign_id=cid AND employee_id=staff_emp AND tally_week=wk AND status='approved')<>0 OR (SELECT handoff_state FROM public.fts_sheet_rows WHERE id=r.id)<>'skipped' THEN RAISE EXCEPTION 'Rescan resurrected a reversed handoff'; END IF;

  -- UI -> paper exact code links to one existing entry, not another handoff.
  h:=public.fts_record_for(cid,staff_emp,'operative_handoff',base+interval '2 minutes',1,gen_random_uuid(),manager_emp);
  v2:=v||jsonb_build_object('row_no',5,'occurred_at',to_char(h.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'app_code',h.entry_code,'prepay_at',NULL);
  result:=public.fts_apply_sheet_scan(cid,s.sheet_code,'local:tesseract-7',jsonb_build_array(v2),now(),gen_random_uuid());
  SELECT * INTO r FROM public.fts_sheet_rows WHERE sheet_id=s.id AND row_no=5;
  r:=public.fts_resolve_sheet_row(r.id,'link',staff_emp,h.id,h.occurred_at,NULL,NULL,true,false);
  IF r.handoff_activity_id<>h.id OR (SELECT COALESCE(sum(awarded_points),0) FROM public.fts_activities WHERE campaign_id=cid AND employee_id=staff_emp AND tally_week=wk AND status='approved')<>2 THEN RAISE EXCEPTION 'App-paper link did not reuse original'; END IF;
  -- Now temporarily mark the reader validated in this rollback test only.
  PERFORM public.fts_validate_reader(cid,30,3,.95,0,0); PERFORM public.fts_set_auto_import(cid,true);
  v2:=v||jsonb_build_object('row_no',6,'occurred_at',to_char((base+interval '3 minutes') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'prepay_at',NULL);
  result:=public.fts_apply_sheet_scan(cid,s.sheet_code,'local:tesseract-7',jsonb_build_array(v2),now(),gen_random_uuid());
  SELECT * INTO r FROM public.fts_sheet_rows WHERE sheet_id=s.id AND row_no=6;
  IF NOT('possible_duplicate'=ANY(r.flags)) OR (SELECT COALESCE(sum(awarded_points),0) FROM public.fts_activities WHERE campaign_id=cid AND employee_id=staff_emp AND tally_week=wk AND status='approved')<>2 THEN RAISE EXCEPTION 'Possible app-paper duplicate awarded'; END IF;
  r:=public.fts_resolve_sheet_row(r.id,'enter_both',staff_emp,NULL,base+interval '3 minutes',NULL,NULL,true,true);
  IF r.handoff_state<>'entered' OR r.prepay_state<>'flagged' OR (SELECT COALESCE(sum(awarded_points),0) FROM public.fts_activities WHERE campaign_id=cid AND employee_id=staff_emp AND tally_week=wk AND status='approved')<>4 THEN RAISE EXCEPTION 'Unclear prepayment blocked the clear handoff'; END IF;
  -- A new-day confirmed row auto-enters only under validated mode; explicit
  -- unverified paper becomes an own pending report with zero points.
  v2:=v||jsonb_build_object('row_no',7,'occurred_at',to_char((base-interval '1 day') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'handoff_verified',false,'prepay_yes',false,'prepay_verified',false,'prepay_at',NULL);
  result:=public.fts_apply_sheet_scan(cid,s.sheet_code,'local:tesseract-7',jsonb_build_array(v2),now(),gen_random_uuid());
  SELECT * INTO r FROM public.fts_sheet_rows WHERE sheet_id=s.id AND row_no=7;
  IF r.handoff_state<>'awaiting' OR (SELECT awarded_points FROM public.fts_activities WHERE id=r.handoff_activity_id) IS NOT NULL THEN RAISE EXCEPTION 'Unverified report earned points'; END IF;
  -- Approving the original report must not silently resolve a changed reading.
  v2:=v||jsonb_build_object('row_no',8,'occurred_at',to_char((base-interval '2 days') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'handoff_verified',false,'prepay_yes',false,'prepay_verified',false,'prepay_at',NULL);
  result:=public.fts_apply_sheet_scan(cid,s.sheet_code,'local:tesseract-7',jsonb_build_array(v2),now(),gen_random_uuid());
  SELECT * INTO pending_row FROM public.fts_sheet_rows WHERE sheet_id=s.id AND row_no=8;
  v2:=jsonb_set(v2,'{occurred_at}',to_jsonb(to_char((base-interval '2 days'+interval '1 minute') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
  result:=public.fts_apply_sheet_scan(cid,s.sheet_code,'local:tesseract-7',jsonb_build_array(v2),now(),gen_random_uuid());
  PERFORM public.fts_verify(pending_row.handoff_activity_id,true);
  SELECT * INTO pending_row FROM public.fts_sheet_rows WHERE id=pending_row.id;
  IF pending_row.handoff_state<>'flagged' OR NOT('row_changed'=ANY(pending_row.flags)) THEN RAISE EXCEPTION 'Original verification hid the changed-row warning'; END IF;
  pending_row:=public.fts_resolve_sheet_row(pending_row.id,'keep_original');
  IF pending_row.handoff_state<>'entered' OR cardinality(pending_row.flags)<>0 THEN RAISE EXCEPTION 'Explicit keep-original did not resolve the warning'; END IF;
  BEGIN PERFORM public.fts_apply_sheet_scan(cid,s.sheet_code,'local:tesseract-7',jsonb_build_array(v||jsonb_build_object('patient','disallowed')),now(),gen_random_uuid()); RAISE EXCEPTION 'Arbitrary text accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM public.fts_apply_sheet_scan(cid,s.sheet_code,'local:tesseract-7',jsonb_build_array(v),NULL,gen_random_uuid()); RAISE EXCEPTION 'Missing image release accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN INSERT INTO public.fts_sheets(campaign_id,org_id,sheet_code,week_key,printed_by,print_request_key) VALUES(cid,org,'unauthorized',wk,staff_user,gen_random_uuid()); RAISE EXCEPTION 'Direct table write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub',staff_user::text,true); PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',staff_user,'role','authenticated')::text,true);
  SELECT count(*) INTO n FROM public.fts_sheet_rows WHERE campaign_id=cid; IF n<>0 THEN RAISE EXCEPTION 'Raw sheet rows exposed to staff'; END IF;
  SELECT count(*) INTO n FROM public.fts_activities WHERE id=r.handoff_activity_id; IF n<>1 THEN RAISE EXCEPTION 'Own paper report hidden from staff'; END IF;
  BEGIN PERFORM public.fts_print_sheet(cid,wk); RAISE EXCEPTION 'Staff printed manager sheet'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  EXECUTE 'RESET ROLE';
END $$;
SELECT 'PASS: sheet permissions, independent 2+2 awards, rescans, changes, corrected versions, app links, possible duplicates, reversals, validation gate, pending visibility and structured-only input' AS result;
