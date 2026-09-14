BEGIN;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE public.employees(id uuid PRIMARY KEY,org_id uuid,user_id uuid,tag text,preferred_name text,team text);
CREATE UNIQUE INDEX codes ON employees(org_id,tag);
CREATE FUNCTION public.is_org_admin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='00000000-0000-0000-0000-000000000001' AND auth.uid()='00000000-0000-0000-0000-000000000010' $$;
CREATE FUNCTION public.is_org_member(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='00000000-0000-0000-0000-000000000001' $$;
INSERT INTO employees VALUES
('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000001',NULL,'DA20',NULL,NULL),
('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011','ABC',NULL,NULL),
('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000002',NULL,'DEF',NULL,NULL);
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT SELECT,UPDATE ON employees TO authenticated;
CREATE POLICY admin_read ON employees FOR SELECT USING(public.is_org_admin(org_id));
\ir ../migrations/20260915010000_save_employee_basics.sql
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',true);
DO $$ BEGIN
 ASSERT (public.save_employee_basics('00000000-0000-0000-0000-000000000100','{"tag":"da02"}')->>'tag')='DA02';
 BEGIN
  PERFORM public.save_employee_basics('00000000-0000-0000-0000-000000000100','{"tag":"ABC"}');
  RAISE EXCEPTION 'Duplicate accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  PERFORM public.save_employee_basics('00000000-0000-0000-0000-000000000102','{"tag":"DA03"}');
  RAISE EXCEPTION 'Cross-office change accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',true);
DO $$ BEGIN
 ASSERT (public.save_employee_basics('00000000-0000-0000-0000-000000000101','{"preferred_name":"Name"}')->>'preferred_name')='Name';
 BEGIN
  PERFORM public.save_employee_basics('00000000-0000-0000-0000-000000000101','{"tag":"DA03"}');
  RAISE EXCEPTION 'Employee changed own code';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.save_employee_basics('00000000-0000-0000-0000-000000000100','{"tag":"DA03"}');
  RAISE EXCEPTION 'Employee changed another code';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;

