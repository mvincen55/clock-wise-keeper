-- Run only against a disposable empty PostgreSQL database (CI creates one).
-- Stubs the tables the migration touches as they stand before it, applies
-- 20260917120000_tardy_default_unapproved_and_approval_requests.sql, and
-- checks the policy: automatic tardies land unapproved, decisions stamp
-- reviewed_at, employees ask through the RPC, managers decide, RLS holds.
BEGIN;
DO $$ DECLARE role_name text; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN EXECUTE format('CREATE ROLE %I',role_name); END IF;
 END LOOP;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
CREATE TABLE public.orgs(id uuid PRIMARY KEY);
CREATE TABLE public.employees(id uuid PRIMARY KEY, org_id uuid, user_id uuid, display_name text, preferred_name text);
CREATE TABLE public.org_members(org_id uuid, user_id uuid, role text, status text);
CREATE FUNCTION public.is_org_admin(o uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM public.org_members WHERE org_id=o AND user_id=auth.uid() AND status='active' AND role IN ('owner','manager'))
$$;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid) TO authenticated;
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TABLE public.notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid, recipient_user_id uuid, actor_user_id uuid,
  notification_type text, title text, message text, related_table text, related_id uuid, is_read boolean DEFAULT false, created_at timestamptz DEFAULT now());
-- tardies as they stand before the migration (20260217231201 + later columns)
CREATE TABLE public.tardies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  org_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  time_entry_id uuid,
  entry_date date NOT NULL,
  expected_start_time time NOT NULL,
  actual_start_time timestamptz NOT NULL,
  minutes_late integer NOT NULL DEFAULT 0,
  reason_text text,
  approval_status text NOT NULL DEFAULT 'unreviewed' CHECK (approval_status IN ('unreviewed', 'approved', 'unapproved')),
  approved_by uuid,
  approved_at timestamptz,
  resolved boolean NOT NULL DEFAULT false,
  timezone_suspect boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, entry_date)
);
CREATE TRIGGER update_tardies_updated_at BEFORE UPDATE ON public.tardies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
GRANT SELECT, UPDATE ON public.tardies TO authenticated;
-- the reason rule as it stood (20260218025251): the migration must replace it before backfilling
CREATE FUNCTION public.validate_tardy_reason() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.approval_status IN ('approved', 'unapproved') THEN
    IF NEW.reason_text IS NULL OR length(trim(NEW.reason_text)) = 0 THEN
      RAISE EXCEPTION 'reason_text is required when approval_status is approved or unapproved';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_tardy_reason BEFORE INSERT OR UPDATE ON public.tardies FOR EACH ROW EXECUTE FUNCTION public.validate_tardy_reason();
CREATE TABLE public.attendance_day_status(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, entry_date date, tardy_approval_status text DEFAULT 'unreviewed');

-- fixtures: one office; M manages, A and B clock in
INSERT INTO orgs VALUES ('00000000-0000-0000-0000-000000000010');
INSERT INTO employees VALUES
 ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-000000000010','a0000000-0000-0000-0000-00000000000a','Rivera, Sam','Sam'),
 ('00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-000000000010','b0000000-0000-0000-0000-00000000000b','Chen, Alex',NULL),
 ('00000000-0000-0000-0000-00000000000e','00000000-0000-0000-0000-000000000010','e0000000-0000-0000-0000-00000000000e','Vincent, Megan',NULL);
INSERT INTO org_members VALUES
 ('00000000-0000-0000-0000-000000000010','e0000000-0000-0000-0000-00000000000e','owner','active'),
 ('00000000-0000-0000-0000-000000000010','a0000000-0000-0000-0000-00000000000a','employee','active'),
 ('00000000-0000-0000-0000-000000000010','b0000000-0000-0000-0000-00000000000b','employee','active');
INSERT INTO tardies (id,user_id,org_id,employee_id,entry_date,expected_start_time,actual_start_time,minutes_late,reason_text,approval_status,approved_by,approved_at) VALUES
 ('10000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-00000000000a','2026-09-14','09:00','2026-09-14 14:29+00',84,NULL,'unreviewed',NULL,NULL),
 ('10000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-00000000000a','2026-09-10','09:00','2026-09-10 13:20+00',15,'Traffic','approved','e0000000-0000-0000-0000-00000000000e','2026-09-10 20:00+00'),
 ('10000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-00000000000b','2026-09-14','08:20','2026-09-14 12:28+00',3,NULL,'unreviewed',NULL,NULL);

\ir ../migrations/20260917120000_tardy_default_unapproved_and_approval_requests.sql

DO $$
DECLARE r record; req uuid; n int;
BEGIN
  -- 1. backfill and defaults
  ASSERT (SELECT approval_status='unapproved' AND reviewed_at IS NULL FROM tardies WHERE id='10000000-0000-0000-0000-000000000001'), 'untouched row becomes unapproved with no decision stamp';
  ASSERT (SELECT reviewed_at='2026-09-10 20:00+00' AND reviewed_by='e0000000-0000-0000-0000-00000000000e' FROM tardies WHERE id='10000000-0000-0000-0000-000000000002'), 'approved row keeps its decision';
  INSERT INTO tardies (user_id,org_id,employee_id,entry_date,expected_start_time,actual_start_time,minutes_late)
   VALUES ('b0000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-00000000000b','2026-09-16','09:45','2026-09-16 21:58+00',488);
  ASSERT (SELECT approval_status='unapproved' AND reason_text IS NULL FROM tardies WHERE entry_date='2026-09-16'), 'an automatic tardy lands unapproved without a reason';
  BEGIN
    UPDATE tardies SET approval_status='unreviewed' WHERE entry_date='2026-09-16';
    RAISE EXCEPTION 'unreviewed accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE tardies SET reviewed_at=now() WHERE entry_date='2026-09-16';
    RAISE EXCEPTION 'decision without a reason accepted';
  EXCEPTION WHEN raise_exception THEN NULL; END;
  ASSERT (SELECT column_name IS NOT NULL FROM information_schema.columns WHERE table_name='attendance_day_status' AND column_name='tardy_reviewed'), 'dashboard mirror column exists';

  -- 2. the employee asks
  PERFORM set_config('test.actor','a0000000-0000-0000-0000-00000000000a',true);
  BEGIN
    PERFORM request_tardy_approval('10000000-0000-0000-0000-000000000001','   ');
    RAISE EXCEPTION 'blank reason accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM request_tardy_approval('10000000-0000-0000-0000-000000000003','Not mine');
    RAISE EXCEPTION 'another employee''s tardy accepted';
  EXCEPTION WHEN no_data_found THEN NULL; END;
  BEGIN
    PERFORM request_tardy_approval('10000000-0000-0000-0000-000000000002','Already fine');
    RAISE EXCEPTION 'approved tardy accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  req := request_tardy_approval('10000000-0000-0000-0000-000000000001','Ran the deposit to the bank first, Megan knew');
  SELECT * INTO r FROM tardy_approval_requests WHERE id=req;
  ASSERT r.status='pending' AND r.org_id='00000000-0000-0000-0000-000000000010' AND r.employee_id='00000000-0000-0000-0000-00000000000a' AND r.entry_date='2026-09-14', 'request carries the tardy''s identity';
  ASSERT (SELECT reason_text='Ran the deposit to the bank first, Megan knew' FROM tardies WHERE id='10000000-0000-0000-0000-000000000001'), 'request reason becomes the tardy reason';
  SELECT count(*) INTO n FROM notifications WHERE notification_type='tardy_request_new';
  ASSERT n=1 AND (SELECT recipient_user_id='e0000000-0000-0000-0000-00000000000e' AND related_id=req AND message LIKE 'Sam asked you%' FROM notifications WHERE notification_type='tardy_request_new'), 'the owner is told, by preferred name';
  BEGIN
    PERFORM request_tardy_approval('10000000-0000-0000-0000-000000000001','Again');
    RAISE EXCEPTION 'second waiting request accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  -- 3. only a manager decides; a denial needs a note
  PERFORM set_config('test.actor','b0000000-0000-0000-0000-00000000000b',true);
  BEGIN
    PERFORM decide_tardy_approval_request(req,true,NULL);
    RAISE EXCEPTION 'employee decided a request';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('test.actor','e0000000-0000-0000-0000-00000000000e',true);
  BEGIN
    PERFORM decide_tardy_approval_request(req,false,'');
    RAISE EXCEPTION 'denial without a note accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM decide_tardy_approval_request(req,true,'Yes, I asked her to');
  SELECT * INTO r FROM tardies WHERE id='10000000-0000-0000-0000-000000000001';
  ASSERT r.approval_status='approved' AND r.approved_by='e0000000-0000-0000-0000-00000000000e' AND r.reviewed_at IS NOT NULL AND r.reviewed_by='e0000000-0000-0000-0000-00000000000e', 'approval excuses the tardy and stamps the decision';
  ASSERT (SELECT status='approved' AND review_note='Yes, I asked her to' FROM tardy_approval_requests WHERE id=req), 'request records the decision';
  ASSERT (SELECT count(*)=1 FROM notifications WHERE notification_type='tardy_request_approved' AND recipient_user_id='a0000000-0000-0000-0000-00000000000a' AND related_id=req), 'the employee is told';
  BEGIN
    PERFORM decide_tardy_approval_request(req,false,'Changed my mind');
    RAISE EXCEPTION 'decided request decided twice';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

  -- 4. a direct review answers a waiting request
  PERFORM set_config('test.actor','b0000000-0000-0000-0000-00000000000b',true);
  req := request_tardy_approval('10000000-0000-0000-0000-000000000003','Bus was late');
  BEGIN
    PERFORM review_tardy('10000000-0000-0000-0000-000000000003','approved','I said so');
    RAISE EXCEPTION 'employee reviewed a tardy';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('test.actor','e0000000-0000-0000-0000-00000000000e',true);
  BEGIN
    PERFORM review_tardy('10000000-0000-0000-0000-000000000003','maybe','Hmm');
    RAISE EXCEPTION 'unknown decision accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM review_tardy('10000000-0000-0000-0000-000000000003','unapproved','Third time this month');
  SELECT * INTO r FROM tardies WHERE id='10000000-0000-0000-0000-000000000003';
  ASSERT r.approval_status='unapproved' AND r.approved_by IS NULL AND r.reviewed_at IS NOT NULL AND r.reason_text='Third time this month', 'direct review stamps an unexcused decision';
  ASSERT (SELECT status='denied' AND review_note='Third time this month' FROM tardy_approval_requests WHERE id=req), 'the waiting request is denied by the same decision';
  ASSERT (SELECT count(*)=1 FROM notifications WHERE notification_type='tardy_request_denied' AND recipient_user_id='b0000000-0000-0000-0000-00000000000b'), 'the employee hears the denial';

  -- 5. reads under RLS: an employee sees only their own requests; writes are RPC-only
  PERFORM set_config('test.actor','a0000000-0000-0000-0000-00000000000a',true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM tardy_approval_requests;
  ASSERT n=1 AND (SELECT bool_and(requested_by='a0000000-0000-0000-0000-00000000000a') FROM tardy_approval_requests), 'employee reads own requests only';
  BEGIN
    INSERT INTO tardy_approval_requests (org_id,employee_id,tardy_id,entry_date,requested_by,reason)
     VALUES ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-000000000002','2026-09-10','a0000000-0000-0000-0000-00000000000a','Forged');
    RAISE EXCEPTION 'direct insert accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE tardies SET reviewed_at=now(), reason_text='Self-reviewed' WHERE id='10000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'employee stamped a decision';
  EXCEPTION WHEN raise_exception THEN NULL; END;
  PERFORM set_config('test.actor','e0000000-0000-0000-0000-00000000000e',true);
  SELECT count(*) INTO n FROM tardy_approval_requests;
  ASSERT n=2, 'the owner reads the office''s requests';
  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'tardy approval probes passed';
END $$;
ROLLBACK;
