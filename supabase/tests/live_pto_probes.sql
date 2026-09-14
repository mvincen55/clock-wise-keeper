-- Run only against a disposable empty PostgreSQL database.
BEGIN;
DO $$ DECLARE role_name text; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN EXECUTE format('CREATE ROLE %I',role_name); END IF;
 END LOOP;
END $$;
CREATE TABLE orgs(id uuid PRIMARY KEY);
CREATE TABLE employees(id uuid PRIMARY KEY,org_id uuid,user_id uuid,hire_date date,real_hire_date date,timezone text);
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
CREATE FUNCTION public.is_org_admin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE TABLE pto_settings(employee_id uuid,org_id uuid,hire_date date,worked_hours_cap_weekly numeric,max_balance numeric,timezone text);
CREATE TABLE pto_snapshots(employee_id uuid,org_id uuid,snapshot_date date,snapshot_balance_hours numeric);
CREATE TABLE time_entries(employee_id uuid,org_id uuid,entry_date date,total_minutes numeric);
CREATE TABLE days_off(employee_id uuid,org_id uuid,date_start date,hours numeric,type text);
CREATE TABLE pto_ledger_weeks(id uuid,user_id uuid,employee_id uuid,org_id uuid,period_start date,period_end date,worked_hours_raw numeric,worked_hours_capped numeric,pto_taken_hours numeric,tier_rate numeric,calculated_accrual numeric,weekly_cap numeric,accrual_credited numeric,running_balance numeric);
\ir ../migrations/20260914150000_live_pto_ledger.sql
\ir ../migrations/20260914170000_pto_join_date_anchor.sql
\ir ../migrations/20260914180000_payroll_pto_evidence.sql
INSERT INTO orgs VALUES ('00000000-0000-0000-0000-000000000010');
INSERT INTO employees VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010',NULL,current_date,'2022-12-23','America/New_York');
INSERT INTO pto_settings SELECT id,org_id,hire_date,40,100,timezone FROM employees;
INSERT INTO pto_snapshots SELECT id,org_id,current_date-extract(dow FROM current_date)::int-7,10 FROM employees;
INSERT INTO time_entries SELECT employee_id,org_id,snapshot_date,3000 FROM pto_snapshots;
DO $$ DECLARE e uuid='00000000-0000-0000-0000-000000000001'; r record; BEGIN
 SELECT * INTO r FROM get_live_pto_ledger(e) ORDER BY period_start LIMIT 1;
 ASSERT r.tier_rate=.0769 AND r.worked_hours_capped=40 AND r.accrual_credited=3.08 AND r.running_balance=13.08,'real date overrides provisional; overtime excluded';
 UPDATE employees SET real_hire_date=current_date;
 SELECT * INTO r FROM get_live_pto_ledger(e) ORDER BY period_start LIMIT 1;
 ASSERT r.tier_rate=.0576 AND r.accrual_credited=2.30,'date changes immediately recompute';
 UPDATE employees SET real_hire_date='2022-12-23';
 UPDATE time_entries SET total_minutes=600;
 SELECT * INTO r FROM get_live_pto_ledger(e) ORDER BY period_start LIMIT 1;
 ASSERT r.accrual_credited=.77,'worked hours edits immediately recompute';
 INSERT INTO days_off SELECT employee_id,org_id,snapshot_date,8,'scheduled_with_notice' FROM pto_snapshots;
 SELECT * INTO r FROM get_live_pto_ledger(e) ORDER BY period_start LIMIT 1;
 ASSERT r.pto_taken_hours=8 AND r.running_balance=3.38,'time off edits immediately recompute';
 DELETE FROM days_off;
 INSERT INTO days_off SELECT employee_id,org_id,snapshot_date,NULL,'unscheduled' FROM pto_snapshots;
 SELECT * INTO r FROM get_live_pto_ledger(e) ORDER BY period_start LIMIT 1;
 ASSERT r.pto_taken_hours=0 AND r.running_balance=10.77,'unknown hours never imply eight hours';
 UPDATE days_off SET hours=0;
 SELECT * INTO r FROM get_live_pto_ledger(e) ORDER BY period_start LIMIT 1;
 ASSERT r.pto_taken_hours=0,'explicit zero preserved';
 UPDATE days_off SET hours=2.5;
 SELECT * INTO r FROM get_live_pto_ledger(e) ORDER BY period_start LIMIT 1;
 ASSERT r.pto_taken_hours=2.5 AND r.running_balance=8.46,'actual partial-day hours used';
 DELETE FROM days_off;
 UPDATE pto_settings SET max_balance=10.5;
 SELECT * INTO r FROM get_live_pto_ledger(e) ORDER BY period_start LIMIT 1;
 ASSERT r.accrual_credited=.5,'policy cap changes immediately recompute';
 UPDATE pto_snapshots SET snapshot_balance_hours=1;
 SELECT * INTO r FROM get_live_pto_ledger(e) ORDER BY period_start LIMIT 1;
 ASSERT r.running_balance=1.77,'snapshot changes immediately recompute';
 DELETE FROM time_entries;
 SELECT * INTO r FROM get_live_pto_ledger(e) ORDER BY period_start LIMIT 1;
 ASSERT r.running_balance=1,'deletions immediately recompute';
 DELETE FROM pto_snapshots;
 ASSERT (SELECT count(*)=0 FROM get_live_pto_ledger(e)),'no invented starting balance';
 ASSERT (SELECT count(*)=0 FROM pto_ledger_weeks),'reads never rewrite legacy ledger';
END $$;
-- Invoker RLS must deny another employee rather than expose source data.
DO $$ DECLARE e uuid='00000000-0000-0000-0000-000000000001'; BEGIN
 UPDATE employees SET hire_date=current_date-21;
 INSERT INTO pto_snapshots SELECT id,org_id,hire_date,4.61 FROM employees;
 INSERT INTO pto_snapshots SELECT id,org_id,current_date-7,99 FROM employees;
 ASSERT (SELECT running_balance=4.61 FROM get_live_pto_ledger(e) ORDER BY period_start DESC LIMIT 1),'join-date balance wins over later duplicate';
 UPDATE employees SET hire_date=current_date-28;
 INSERT INTO pto_snapshots SELECT id,org_id,hire_date,0 FROM employees;
 ASSERT (SELECT running_balance=0 FROM get_live_pto_ledger(e) ORDER BY period_start DESC LIMIT 1),'updated join date and explicit zero survive reload';
END $$;
DO $$ DECLARE e uuid='00000000-0000-0000-0000-000000000001'; week date=current_date-extract(dow FROM current_date)::int-7; BEGIN
 INSERT INTO payroll_pto_records(org_id,employee_id,payroll_employee_id,payroll_employee_name,period_start,period_end,check_date,check_number,pto_hours,pto_ytd_hours,source_file,source_sha256,source_page)
 SELECT org_id,id,'57','Test employee',week,week+6,current_date,'check-1',8,100,'source.pdf','hash',29 FROM employees;
 INSERT INTO days_off SELECT id,org_id,week,8,'scheduled_with_notice' FROM employees;
 ASSERT (SELECT pto_taken_hours=8 FROM get_live_pto_ledger(e) WHERE period_start=week),'payroll and daily leave count once, not twice; YTD never deducted';
 UPDATE payroll_pto_records SET pto_hours=0;
 ASSERT (SELECT pto_taken_hours=0 FROM get_live_pto_ledger(e) WHERE period_start=week),'confirmed zero payroll PTO overrides an unsupported daily amount';
 BEGIN
 INSERT INTO payroll_pto_records SELECT gen_random_uuid(),org_id,employee_id,payroll_employee_id,payroll_employee_name,period_start,period_end,check_date,check_number,pto_hours,pto_ytd_hours,worked_hours,source_file,source_sha256,source_page,earnings,review_note,created_at FROM payroll_pto_records;
 RAISE EXCEPTION 'duplicate check accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_employee ON employees USING (user_id::text=current_setting('test.actor',true));
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA auth TO authenticated;
SET ROLE authenticated;
SET test.actor='00000000-0000-0000-0000-000000000099';
DO $$ BEGIN
 ASSERT (SELECT count(*)=0 FROM get_live_pto_ledger('00000000-0000-0000-0000-000000000001')),'RLS must hide inaccessible employee';
 ASSERT (SELECT count(*)=0 FROM payroll_pto_records),'payroll evidence must not expose another employee';
END $$;
RESET ROLE;
ROLLBACK;
