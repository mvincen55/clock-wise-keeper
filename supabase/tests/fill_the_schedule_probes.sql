-- Run after the migration in a single transaction. Everything rolls back.
-- Uses real allowlisted members for authorization, only temporary campaign rows.
BEGIN;
DO $$
DECLARE
  org uuid := '852fc8e0-4071-499b-b655-f86d6f789cd5';
  manager_user uuid; manager_emp uuid; staff_user uuid; staff_emp uuid;
  cid uuid; other_org uuid := gen_random_uuid(); other_cid uuid;
  r public.fts_activities; b public.fts_activities; bonus public.fts_activities;
  key uuid; n int; grp text; expected int;
BEGIN
  SELECT m.user_id,e.id INTO manager_user,manager_emp FROM public.org_members m
    JOIN public.employees e ON e.org_id=m.org_id AND e.user_id=m.user_id
    JOIN auth.users u ON u.id=m.user_id JOIN public.allowed_users a ON a.email=u.email
    WHERE m.org_id=org AND m.status='active' AND m.role IN ('manager','owner') AND e.employment_status='active' LIMIT 1;
  SELECT m.user_id,e.id INTO staff_user,staff_emp FROM public.org_members m
    JOIN public.employees e ON e.org_id=m.org_id AND e.user_id=m.user_id
    JOIN auth.users u ON u.id=m.user_id JOIN public.allowed_users a ON a.email=u.email
    WHERE m.org_id=org AND m.status='active' AND m.role='employee' AND e.employment_status='active' LIMIT 1;
  IF manager_user IS NULL OR staff_user IS NULL THEN RAISE EXCEPTION 'Need an existing allowlisted manager and member for probes'; END IF;
  INSERT INTO public.fts_campaigns(org_id,name,starts_on,ends_on) VALUES(org,'__rollback_fts_'||gen_random_uuid(),'2026-10-01','2026-12-31') RETURNING id INTO cid;
  INSERT INTO public.fts_participants(campaign_id,org_id,employee_id) VALUES(cid,org,manager_emp),(cid,org,staff_emp);
  INSERT INTO public.orgs(id,name,created_by) VALUES(other_org,'__rollback_fts_other_org',manager_user);
  INSERT INTO public.fts_campaigns(org_id,name,starts_on,ends_on) VALUES(other_org,'__rollback_fts_other','2026-10-01','2026-12-31') RETURNING id INTO other_cid;

  IF public.fts_week_key('2026-10-02 15:59:59+00','America/New_York','2026-12-31') <> date '2026-10-02'
    OR public.fts_week_key('2026-10-02 16:00:00+00','America/New_York','2026-12-31') <> date '2026-10-09'
    OR public.fts_week_key('2026-10-03 15:00:00+00','America/New_York','2026-12-31') <> date '2026-10-09'
    OR public.fts_week_key('2026-11-06 16:59:59+00','America/New_York','2026-12-31') <> date '2026-11-06'
    OR public.fts_week_key('2026-11-06 17:00:00+00','America/New_York','2026-12-31') <> date '2026-11-13'
    OR public.fts_week_key('2027-01-01 04:59:59+00','America/New_York','2026-12-31') <> date '2026-12-31' THEN RAISE EXCEPTION 'Eastern/DST/final tally failed'; END IF;

  PERFORM set_config('request.jwt.claim.sub',staff_user::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',staff_user,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  key:=gen_random_uuid();
  r:=public.fts_record_own(cid,'qr_card','2026-10-02 15:00:00+00',1,key);
  b:=public.fts_record_own(cid,'qr_card','2026-10-02 15:00:00+00',1,key);
  IF r.id IS DISTINCT FROM b.id OR r.awarded_points IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'QR/idempotency failed'; END IF;
  BEGIN PERFORM public.fts_record_own(cid,'operative_handoff','2026-10-02 15:00:00+00',1,key); RAISE EXCEPTION 'Expected reused key rejection'; EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN PERFORM public.fts_set_weekly_calls(cid,staff_emp,'2026-10-02',10); RAISE EXCEPTION 'Staff manager operation allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.fts_record_own(other_cid,'qr_card','2026-10-02 15:00:00+00',1,gen_random_uuid()); RAISE EXCEPTION 'Cross-org write allowed'; EXCEPTION WHEN no_data_found THEN NULL; END;
  BEGIN INSERT INTO public.fts_activities(campaign_id,org_id,employee_id,activity_type,occurred_at,tally_week,request_key,recorded_by) VALUES(cid,org,staff_emp,'qr_card',now(),'2026-10-02',gen_random_uuid(),staff_user); RAISE EXCEPTION 'Direct write allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM public.fts_withdraw_own(r.id,'recorded_in_error');
  b:=public.fts_record_own(cid,'unscheduled_booking','2026-10-02 15:00:00+00',1,gen_random_uuid());
  IF b.status IS DISTINCT FROM 'pending' OR b.awarded_points IS NOT NULL THEN RAISE EXCEPTION 'Pending report earns points'; END IF;
  r:=public.fts_record_own(cid,'chairside_card','2026-10-02 15:00:00+00',1,gen_random_uuid());

  PERFORM set_config('request.jwt.claim.sub',manager_user::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',manager_user,'role','authenticated')::text,true);
  BEGIN PERFORM public.fts_verify(r.id,true,NULL); RAISE EXCEPTION 'Unset chairside approved'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM public.fts_set_rate(cid,'pts_chairside_card',4);
  r:=public.fts_verify(r.id,true,NULL);
  PERFORM public.fts_set_rate(cid,'pts_chairside_card',9);
  IF r.awarded_points IS DISTINCT FROM 4 THEN RAISE EXCEPTION 'Chairside award not frozen'; END IF;
  b:=public.fts_verify(b.id,true,NULL);
  IF b.awarded_points IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Booking points failed'; END IF;
  bonus:=public.fts_award_bonus(b.id,'attend_bonus','2026-10-05 14:00:00+00',gen_random_uuid());
  IF bonus.awarded_points IS DISTINCT FROM 2 OR bonus.tally_week IS DISTINCT FROM date '2026-10-09' THEN RAISE EXCEPTION 'Cross-week attendance failed'; END IF;
  BEGIN PERFORM public.fts_award_bonus(b.id,'attend_bonus','2026-10-05 14:00:00+00',gen_random_uuid()); RAISE EXCEPTION 'Duplicate attendance allowed'; EXCEPTION WHEN unique_violation THEN NULL; END;
  PERFORM public.fts_award_bonus(b.id,'prepay_bonus','2026-10-05 14:00:00+00',gen_random_uuid());
  BEGIN PERFORM public.fts_reverse(b.id,'recorded_in_error'); RAISE EXCEPTION 'Origin reversed before bonuses'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  FOREACH grp IN ARRAY ARRAY['doctor','hygienist','clerical','assistant'] LOOP
    PERFORM public.fts_set_scoring_role(cid,staff_emp,grp,true);
    r:=public.fts_award_review(cid,staff_emp,'2026-10-02 15:00:00+00',gen_random_uuid());
    expected:=CASE grp WHEN 'clerical' THEN 5 WHEN 'assistant' THEN 7 ELSE 3 END;
    IF r.awarded_points IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Role rate failed: %',grp; END IF;
  END LOOP;
  -- Unknown role blocks eligibility despite points; clerical requires calls.
  PERFORM public.fts_set_scoring_role(cid,staff_emp,NULL,true);
  BEGIN PERFORM public.fts_set_picks_received(cid,staff_emp,'2026-10-02',1); RAISE EXCEPTION 'Unknown role bypassed gate'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM public.fts_set_scoring_role(cid,staff_emp,'clerical',true);
  BEGIN PERFORM public.fts_set_picks_received(cid,staff_emp,'2026-10-02',1); RAISE EXCEPTION 'Clerical bypassed calls'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM public.fts_set_weekly_calls(cid,staff_emp,'2026-10-02',10);
  PERFORM public.fts_set_weekly_calls(cid,staff_emp,'2026-10-02',12);
  SELECT verified_count INTO n FROM public.fts_weekly_calls WHERE campaign_id=cid AND employee_id=staff_emp AND week_key='2026-10-02';
  IF n IS DISTINCT FROM 12 THEN RAISE EXCEPTION 'Calls added instead of replaced'; END IF;
  PERFORM public.fts_set_picks_received(cid,staff_emp,'2026-10-02',2);
  PERFORM public.fts_set_weekly_calls(cid,staff_emp,'2026-10-02',0);
  SELECT received_count INTO n FROM public.fts_prize_picks WHERE campaign_id=cid AND employee_id=staff_emp AND week_key='2026-10-02';
  IF n IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'Correction silently rewrote received picks'; END IF;
  PERFORM public.fts_save_huddle(cid,'2026-10-02',ARRAY[manager_emp,staff_emp]);
  PERFORM public.fts_save_huddle(cid,'2026-10-02',ARRAY[manager_emp]);
  SELECT count(*) INTO n FROM public.fts_huddle_attendance WHERE campaign_id=cid AND huddle_date='2026-10-02' AND on_time;
  IF n IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Huddle correction failed'; END IF;
  PERFORM public.fts_set_open_hours(cid,'2026-10-02',NULL);
  IF (SELECT doctor_open_hours FROM public.fts_week_metrics WHERE campaign_id=cid AND week_key='2026-10-02') IS NOT NULL THEN RAISE EXCEPTION 'Missing hours became zero'; END IF;
  PERFORM public.fts_set_open_hours(cid,'2026-10-02',4);
  BEGIN PERFORM public.fts_set_weekly_calls(cid,staff_emp,'2026-12-31',10); RAISE EXCEPTION 'Future factual calls accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM public.fts_record_for(cid,manager_emp,'qr_card','2026-10-02 15:00:00+00',1,gen_random_uuid());

  PERFORM set_config('request.jwt.claim.sub',staff_user::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',staff_user,'role','authenticated')::text,true);
  SELECT count(*) INTO n FROM public.fts_activities WHERE campaign_id=cid AND employee_id=manager_emp;
  IF n IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'Coworker history exposed'; END IF;
  SELECT count(*) INTO n FROM public.fts_campaigns WHERE id=other_cid;
  IF n IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'Cross-org campaign exposed'; END IF;
  PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
  BEGIN PERFORM public.fts_record_own(cid,'qr_card','2026-10-02 15:00:00+00',1,gen_random_uuid()); RAISE EXCEPTION 'Unknown unallowlisted caller accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  EXECUTE 'RESET ROLE';
END $$;
SELECT 'PASS: actual RPCs, RLS, role rates, unknown role and call gates, corrections, frozen awards, idempotency, bonuses, date arithmetic, Eastern/DST/final tally and missing hours' AS result;
ROLLBACK;
