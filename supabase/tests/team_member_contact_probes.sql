-- Run only against a disposable local PostgreSQL database.
-- Creates a minimal auth/employee fixture, exercises the migration, then rolls back.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;


CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.user', true), '')::uuid $$;
CREATE TABLE public.org_members (org_id uuid, user_id uuid, role text, status text);
CREATE FUNCTION public.is_org_admin(_org_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS (SELECT 1 FROM public.org_members WHERE org_id=_org_id AND user_id=auth.uid() AND status='active' AND role IN ('owner','manager')) $$;
CREATE TABLE public.employees (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, user_id uuid, display_name text NOT NULL, email text, timezone text, completed_at timestamptz, learning_style text, favorites jsonb DEFAULT '{}');
INSERT INTO public.org_members VALUES
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011','owner','active'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000012','manager','active'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000013','employee','active');
\ir ../migrations/20260914010000_employee_name_fields.sql
DO $$
DECLARE member_id uuid; before_stamp timestamptz := now(); row_after public.employees;
BEGIN
  PERFORM set_config('test.user','00000000-0000-0000-0000-000000000011',false);
  member_id := public.save_team_member_contact('00000000-0000-0000-0000-000000000001',null,'Jane',null,'Smith',null);
  SELECT * INTO row_after FROM public.employees WHERE id=member_id;
  ASSERT row_after.display_name='Jane Smith' AND row_after.email IS NULL AND row_after.middle_initial IS NULL AND row_after.user_id IS NULL, 'owner creates pending record without optional values';
  UPDATE public.employees SET user_id='00000000-0000-0000-0000-000000000013',completed_at=before_stamp WHERE id=member_id;
  PERFORM set_config('test.user','00000000-0000-0000-0000-000000000012',false);
  PERFORM public.save_team_member_contact('00000000-0000-0000-0000-000000000001',member_id,'Janet','a.','Smith','jane@example.com','{"phone":"202-555-0100","alternate_phone":"202-555-0101","address_line1":"10 Example Street","city":"Example City","emergency_contact_name":"Alex Smith","emergency_contact_phone":"202-555-0102"}');
  SELECT * INTO row_after FROM public.employees WHERE id=member_id;
  ASSERT row_after.display_name='Janet A Smith' AND row_after.phone='202-555-0100' AND row_after.alternate_phone='202-555-0101' AND row_after.address_line1='10 Example Street', 'manager saves name and contact';
  ASSERT row_after.emergency_contact_name='Alex Smith' AND row_after.emergency_contact_phone='202-555-0102', 'emergency contact persisted';
  ASSERT 'Jane Smith'=ANY(row_after.name_aliases), 'old names retained for imports';
  ASSERT row_after.user_id='00000000-0000-0000-0000-000000000013' AND row_after.completed_at=before_stamp, 'linked account and completed onboarding preserved';
  BEGIN
    PERFORM public.save_team_member_contact('00000000-0000-0000-0000-000000000001',member_id,'Jane',null,' ',null);
    RAISE EXCEPTION 'blank surname accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.save_team_member_contact('00000000-0000-0000-0000-000000000001',member_id,'Jane','Ann','Smith',null);
    RAISE EXCEPTION 'invalid MI accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.save_team_member_contact('00000000-0000-0000-0000-000000000002',member_id,'Jane',null,'Smith',null);
    RAISE EXCEPTION 'other organization accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('test.user','00000000-0000-0000-0000-000000000013',false);
  BEGIN
    PERFORM public.save_team_member_contact('00000000-0000-0000-0000-000000000001',member_id,'Jane',null,'Smith',null);
    RAISE EXCEPTION 'employee write accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM public.save_employee_onboarding_preferences(member_id,'visual','{"food":"Tacos","drink":"Iced tea"}');
  SELECT * INTO row_after FROM public.employees WHERE id=member_id;
  ASSERT row_after.favorites->>'food'='Tacos', 'shared favorites persisted for linked employee';
  ASSERT row_after.completed_at=before_stamp, 'favorites save does not alter onboarding completion';
  PERFORM set_config('test.user','00000000-0000-0000-0000-000000000012',false);
  BEGIN
    PERFORM public.save_employee_onboarding_preferences(member_id,'visual','{}');
    RAISE EXCEPTION 'another person preferences write accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  ASSERT NOT has_function_privilege('anon','public.save_team_member_contact(uuid,uuid,text,text,text,text,jsonb)','EXECUTE'), 'anonymous execute blocked';
  ASSERT has_function_privilege('authenticated','public.save_team_member_contact(uuid,uuid,text,text,text,text,jsonb)','EXECUTE'), 'authenticated execution available';
  RAISE NOTICE 'All team contact database checks passed';
END $$;

ROLLBACK;
