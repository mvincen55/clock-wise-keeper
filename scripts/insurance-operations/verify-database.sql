-- Executed only by the existing fresh-local-database release gate. Every fixture
-- is synthetic and rolled back. Uses actual migrated auth/RLS helpers.
BEGIN;
INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES
 ('f1111111-1111-4111-8111-111111111111','insurance-owner@example.invalid','{}','{}'),
 ('f2222222-2222-4222-8222-222222222222','insurance-staff@example.invalid','{}','{}'),
 ('f3333333-3333-4333-8333-333333333333','insurance-other@example.invalid','{}','{}');
INSERT INTO public.allowed_users(email) VALUES ('insurance-owner@example.invalid'),('insurance-staff@example.invalid'),('insurance-other@example.invalid');
INSERT INTO public.orgs(id,name,created_by) VALUES
 ('f4444444-4444-4444-8444-444444444444','Synthetic insurance office','f1111111-1111-4111-8111-111111111111'),
 ('f5555555-5555-4555-8555-555555555555','Synthetic other office','f3333333-3333-4333-8333-333333333333');
INSERT INTO public.org_members(org_id,user_id,role,status) VALUES
 ('f4444444-4444-4444-8444-444444444444','f1111111-1111-4111-8111-111111111111','owner','active'),
 ('f4444444-4444-4444-8444-444444444444','f2222222-2222-4222-8222-222222222222','employee','active'),
 ('f5555555-5555-4555-8555-555555555555','f3333333-3333-4333-8333-333333333333','owner','active');
INSERT INTO public.important_numbers(id,org_id,section,label,value) VALUES
 ('f6666666-6666-4666-8666-666666666666','f4444444-4444-4444-8444-444444444444','Insurance','Synthetic payer','+12025550100');

CREATE FUNCTION pg_temp.io_fixture_settings() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{
 "version":1,"enabled":false,"defaultKind":"breakdown","defaultDelivery":"answers",
 "presets":{
  "breakdown":{"questions":[{"key":"frequency","scope":"bwx","required":true},{"key":"unusual_notes","scope":"plan","required":true}],"limits":{"holdSeconds":300,"totalSeconds":600,"retries":0}},
  "eligibility":{"questions":[{"key":"eligible","scope":"plan","required":true}],"limits":{"holdSeconds":300,"totalSeconds":600,"retries":0}},
  "combined":{"questions":[{"key":"rollover","scope":"plan","required":true}],"limits":{"holdSeconds":300,"totalSeconds":600,"retries":0}}},
 "bundles":[],"carrierOverrides":[],"mappings":[],"billingPolicies":[{"payerId":"f6666666-6666-4666-8666-666666666666","downgradeFee":"office_fee","maximumFee":"office_fee"}],
 "concurrency":1,"spendingLimitCents":500,"freshnessDays":90,"roles":["owner","manager"],"alerts":{"completion":true,"attention":true,"sound":false}
 }'::jsonb $$;
CREATE FUNCTION pg_temp.io_fixture_plan() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{
 "payerId":"f6666666-6666-4666-8666-666666666666","groupRaw":"00042","product":"Synthetic PPO","subgroup":"A","network":"Synthetic network","providerId":null,
 "effectiveFrom":"2026-01-01","effectiveTo":"2026-12-31","benefitYear":"2026","insurancePlanId":null,"feeScheduleId":null,"manualId":null,
 "source":"Synthetic release fixture","sourceDate":"2026-09-11","confidence":"high","rules":[{"key":"frequency","scope":"bwx","status":"confirmed","value":{"amount":2,"unit":"visits","window":"calendar_year","windowMonths":null}}]
 }'::jsonb $$;
CREATE FUNCTION pg_temp.io_expect_denied(command text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN RETURN; END;
 RAISE EXCEPTION 'Expected rejection: %',command;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f1111111-1111-4111-8111-111111111111',true);
SELECT public.insurance_save_settings('f4444444-4444-4444-8444-444444444444',0,pg_temp.io_fixture_settings());
SELECT public.insurance_publish_plan('f4444444-4444-4444-8444-444444444444',null,0,pg_temp.io_fixture_plan(),true);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.insurance_operation_settings WHERE org_id='f4444444-4444-4444-8444-444444444444') <> 1 THEN RAISE EXCEPTION 'Owner cannot read office settings'; END IF;
 IF (SELECT count(*) FROM public.insurance_plan_versions WHERE org_id='f4444444-4444-4444-8444-444444444444') <> 1 THEN RAISE EXCEPTION 'Owner cannot read plan'; END IF;
END $$;
SELECT pg_temp.io_expect_denied($q$SELECT public.insurance_save_settings('f4444444-4444-4444-8444-444444444444',0,pg_temp.io_fixture_settings())$q$);
SELECT pg_temp.io_expect_denied($q$SELECT public.insurance_save_settings('f4444444-4444-4444-8444-444444444444',1,pg_temp.io_fixture_settings() || '{"patientName":"synthetic"}'::jsonb)$q$);
SELECT pg_temp.io_expect_denied($q$SELECT public.insurance_publish_plan('f4444444-4444-4444-8444-444444444444',null,0,pg_temp.io_fixture_plan() || '{"rules":[{"key":"unusual_notes","scope":"plan","status":"confirmed","value":"synthetic"}]}'::jsonb,true)$q$);
SELECT pg_temp.io_expect_denied($q$UPDATE public.insurance_plan_versions SET status='superseded'$q$);
SELECT pg_temp.io_expect_denied($q$UPDATE public.insurance_operation_settings SET enabled=true$q$);
SELECT set_config('request.jwt.claim.sub','f2222222-2222-4222-8222-222222222222',true);
SELECT pg_temp.io_expect_denied($q$SELECT public.insurance_save_settings('f4444444-4444-4444-8444-444444444444',1,pg_temp.io_fixture_settings())$q$);
SELECT pg_temp.io_expect_denied($q$SELECT public.insurance_publish_plan('f4444444-4444-4444-8444-444444444444',null,0,pg_temp.io_fixture_plan(),true)$q$);
SELECT set_config('request.jwt.claim.sub','f3333333-3333-4333-8333-333333333333',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.insurance_operation_settings WHERE org_id='f4444444-4444-4444-8444-444444444444') THEN RAISE EXCEPTION 'Cross-office settings leak'; END IF;
 IF EXISTS(SELECT 1 FROM public.insurance_plan_versions WHERE org_id='f4444444-4444-4444-8444-444444444444') THEN RAISE EXCEPTION 'Cross-office plan leak'; END IF;
END $$;
SELECT pg_temp.io_expect_denied($q$SELECT public.insurance_save_settings('f4444444-4444-4444-8444-444444444444',1,pg_temp.io_fixture_settings())$q$);
SELECT pg_temp.io_expect_denied($q$SELECT public.insurance_publish_plan('f5555555-5555-4555-8555-555555555555',null,0,pg_temp.io_fixture_plan(),true)$q$);
RESET ROLE;
DO $$ BEGIN
 IF has_table_privilege('anon','public.insurance_operation_settings','SELECT') OR has_function_privilege('anon','public.insurance_save_settings(uuid,integer,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Anonymous insurance access'; END IF;
END $$;
ROLLBACK;
SELECT 'insurance database probes passed using real migrated auth and RLS' AS result;
