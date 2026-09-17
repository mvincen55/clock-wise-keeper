-- Run only against a disposable empty PostgreSQL database (CI creates one).
-- Stubs the attendance engine's world, applies
-- 20260917120000_tardy_default_unapproved_and_approval_requests.sql, and
-- runs _recompute_attendance_range_internal end to end: an automatic
-- tardy lands unapproved, disappears once the day is no longer late, and
-- a manager's decision survives any recompute and is mirrored for the
-- dashboard as tardy_reviewed.
BEGIN;
DO $$ DECLARE role_name text; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN EXECUTE format('CREATE ROLE %I',role_name); END IF;
 END LOOP;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
CREATE TABLE public.orgs(id uuid PRIMARY KEY);
CREATE TABLE public.employees(id uuid PRIMARY KEY, org_id uuid, user_id uuid, display_name text, preferred_name text);
CREATE TABLE public.org_members(org_id uuid, user_id uuid, role text, status text);
CREATE FUNCTION public.is_org_admin(o uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM public.org_members WHERE org_id=o AND user_id=auth.uid() AND status='active' AND role IN ('owner','manager'))
$$;
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE FUNCTION public.get_user_timezone(p_user_id uuid) RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'America/New_York' $$;
-- No versioned schedule in this office: the engine falls back to work_schedule.
CREATE FUNCTION public.get_schedule_for_date(p_user_id uuid, p_date date)
RETURNS TABLE(version_id uuid, version_name text, effective_start_date date, effective_end_date date, apply_to_remote boolean, timezone text,
              weekday smallint, enabled boolean, start_time time, end_time time, grace_minutes integer, threshold_minutes integer)
LANGUAGE sql STABLE AS $$ SELECT NULL::uuid,NULL::text,NULL::date,NULL::date,NULL::boolean,NULL::text,NULL::smallint,NULL::boolean,NULL::time,NULL::time,NULL::int,NULL::int WHERE false $$;
CREATE TABLE public.work_schedule(user_id uuid, weekday smallint, enabled boolean, start_time time, end_time time, grace_minutes int, threshold_minutes int, apply_to_remote boolean);
CREATE TABLE public.office_closures(closure_date date, user_id uuid, org_id uuid);
CREATE TABLE public.days_off(user_id uuid, date_start date, date_end date, type text);
CREATE TABLE public.time_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, employee_id uuid, entry_date date, is_remote boolean DEFAULT false, entry_comment text, total_minutes int DEFAULT 0);
CREATE TABLE public.punches(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), time_entry_id uuid, seq int, punch_type text, punch_time timestamptz,
  voided_at timestamptz, is_edited boolean DEFAULT false, time_verified boolean DEFAULT true);
CREATE TABLE public.notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid, recipient_user_id uuid, actor_user_id uuid,
  notification_type text, title text, message text, related_table text, related_id uuid, is_read boolean DEFAULT false, created_at timestamptz DEFAULT now());
CREATE TABLE public.tardies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL, org_id uuid NOT NULL, employee_id uuid NOT NULL, time_entry_id uuid,
  entry_date date NOT NULL, expected_start_time time NOT NULL, actual_start_time timestamptz NOT NULL,
  minutes_late integer NOT NULL DEFAULT 0, reason_text text,
  approval_status text NOT NULL DEFAULT 'unreviewed' CHECK (approval_status IN ('unreviewed', 'approved', 'unapproved')),
  approved_by uuid, approved_at timestamptz, resolved boolean NOT NULL DEFAULT false, timezone_suspect boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, entry_date)
);
CREATE TRIGGER update_tardies_updated_at BEFORE UPDATE ON public.tardies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE public.attendance_day_status(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, org_id uuid, employee_id uuid, entry_date date NOT NULL,
  schedule_expected_start time, schedule_expected_end time, is_scheduled_day boolean, office_closed boolean, has_punches boolean, is_remote boolean,
  is_absent boolean, is_incomplete boolean, is_late boolean, minutes_late int, tardy_approval_status text DEFAULT 'unreviewed',
  has_edits boolean, has_day_comment boolean, has_day_off boolean, timezone_suspect boolean, status_code text, status_reasons jsonb,
  recompute_version int, computed_at timestamptz, UNIQUE(user_id, entry_date));

-- fixtures: Wednesdays start 9:45 with a 5-minute grace; B and A are employees, E owns the office
INSERT INTO orgs VALUES ('00000000-0000-0000-0000-000000000010');
INSERT INTO employees VALUES
 ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-000000000010','a0000000-0000-0000-0000-00000000000a','Rivera, Sam','Sam'),
 ('00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-000000000010','b0000000-0000-0000-0000-00000000000b','Chen, Alex',NULL);
INSERT INTO org_members VALUES ('00000000-0000-0000-0000-000000000010','e0000000-0000-0000-0000-00000000000e','owner','active');
INSERT INTO work_schedule SELECT u, 3, true, '09:45', '17:00', 5, 1, false FROM unnest(ARRAY['a0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b']::uuid[]) u;
INSERT INTO time_entries (id,user_id,employee_id,entry_date) VALUES
 ('20000000-0000-0000-0000-00000000000b','b0000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000b','2026-09-16'),
 ('20000000-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a','2026-09-16');
-- B's only punch so far is the evening re-clock-in (5:58 PM Eastern)
INSERT INTO punches (time_entry_id,seq,punch_type,punch_time) VALUES ('20000000-0000-0000-0000-00000000000b',0,'in','2026-09-16 21:58+00');
-- A arrived at 10:29 AM Eastern
INSERT INTO punches (time_entry_id,seq,punch_type,punch_time) VALUES ('20000000-0000-0000-0000-00000000000a',0,'in','2026-09-16 14:29+00'),('20000000-0000-0000-0000-00000000000a',1,'out','2026-09-16 21:00+00');

\ir ../migrations/20260917120000_tardy_default_unapproved_and_approval_requests.sql

DO $$
DECLARE t record; s record; n int; b uuid := 'b0000000-0000-0000-0000-00000000000b'; a uuid := 'a0000000-0000-0000-0000-00000000000a';
BEGIN
  -- 1. the engine writes an automatic, unapproved tardy and mirrors it
  n := _recompute_attendance_range_internal(b, '2026-09-16', '2026-09-16');
  ASSERT n=1, 'one day recomputed';
  SELECT * INTO t FROM tardies WHERE user_id=b AND entry_date='2026-09-16';
  ASSERT FOUND AND t.approval_status='unapproved' AND t.minutes_late=488 AND t.reviewed_at IS NULL AND t.reason_text IS NULL, format('automatic tardy is unapproved with no decision (%s, %s)', t.approval_status, t.minutes_late);
  SELECT * INTO s FROM attendance_day_status WHERE user_id=b AND entry_date='2026-09-16';
  ASSERT s.is_late AND s.tardy_approval_status='unapproved' AND s.tardy_reviewed=false AND s.status_code='late', 'day status mirrors an undecided unapproved tardy';

  -- 2. the morning punch turns up (9:50, inside the grace): the automatic tardy goes away
  INSERT INTO punches (time_entry_id,seq,punch_type,punch_time) VALUES
   ('20000000-0000-0000-0000-00000000000b',1,'in','2026-09-16 13:50+00'),('20000000-0000-0000-0000-00000000000b',2,'out','2026-09-16 17:00+00');
  PERFORM _recompute_attendance_range_internal(b, '2026-09-16', '2026-09-16');
  ASSERT NOT EXISTS (SELECT 1 FROM tardies WHERE user_id=b AND entry_date='2026-09-16'), 'a day that is no longer late drops its automatic tardy';
  SELECT * INTO s FROM attendance_day_status WHERE user_id=b AND entry_date='2026-09-16';
  ASSERT NOT s.is_late AND s.tardy_approval_status='unreviewed' AND s.tardy_reviewed=false, 'day status shows no tardy';

  -- 3. a manager's decision is a record: it survives recomputes, late or not
  PERFORM _recompute_attendance_range_internal(a, '2026-09-16', '2026-09-16');
  SELECT * INTO t FROM tardies WHERE user_id=a AND entry_date='2026-09-16';
  ASSERT t.minutes_late=39 AND t.approval_status='unapproved', format('A is 39 minutes late (%s)', t.minutes_late);
  PERFORM set_config('test.actor','e0000000-0000-0000-0000-00000000000e',true);
  PERFORM review_tardy(t.id,'unapproved','Second time this month');
  PERFORM set_config('test.actor','',true);
  PERFORM _recompute_attendance_range_internal(a, '2026-09-16', '2026-09-16');
  SELECT * INTO t FROM tardies WHERE user_id=a AND entry_date='2026-09-16';
  ASSERT t.approval_status='unapproved' AND t.reviewed_at IS NOT NULL AND t.reason_text='Second time this month' AND t.minutes_late=39, 'a recompute of a late day keeps the decision';
  SELECT * INTO s FROM attendance_day_status WHERE user_id=a AND entry_date='2026-09-16';
  ASSERT s.is_late AND s.tardy_approval_status='unapproved' AND s.tardy_reviewed=true, 'day status mirrors the decision';
  INSERT INTO punches (time_entry_id,seq,punch_type,punch_time) VALUES ('20000000-0000-0000-0000-00000000000a',2,'in','2026-09-16 13:40+00'),('20000000-0000-0000-0000-00000000000a',3,'out','2026-09-16 13:45+00');
  PERFORM _recompute_attendance_range_internal(a, '2026-09-16', '2026-09-16');
  ASSERT EXISTS (SELECT 1 FROM tardies WHERE user_id=a AND entry_date='2026-09-16' AND reviewed_at IS NOT NULL), 'a decided tardy stays even when the day is no longer late';
  SELECT * INTO s FROM attendance_day_status WHERE user_id=a AND entry_date='2026-09-16';
  ASSERT NOT s.is_late AND s.tardy_approval_status='unapproved' AND s.tardy_reviewed=true, 'day status keeps the decision alongside the corrected day';
  RAISE NOTICE 'attendance engine probes passed';
END $$;
ROLLBACK;
