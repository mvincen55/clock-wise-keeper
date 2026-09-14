-- Disposable local database only.
\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE TABLE employees(id uuid PRIMARY KEY,org_id uuid,user_id uuid);
CREATE TABLE time_entries(id uuid PRIMARY KEY,employee_id uuid,org_id uuid,user_id uuid NOT NULL,created_by uuid,entry_date date,total_minutes int);
CREATE TABLE days_off(id uuid PRIMARY KEY,employee_id uuid,org_id uuid,user_id uuid NOT NULL,created_by uuid,date_start date,date_end date);
CREATE TABLE punches(id uuid PRIMARY KEY,time_entry_id uuid,employee_id uuid,org_id uuid);
CREATE FUNCTION recompute_attendance_range(uuid,date,date) RETURNS int LANGUAGE plpgsql AS $$ BEGIN ASSERT $1 IS NOT NULL; RETURN 0; END $$;
INSERT INTO employees VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010',NULL);
INSERT INTO time_entries VALUES ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000099',NULL,'2026-06-08',480);
\ir ../migrations/20260914020000_employee_history_identity.sql
CREATE TRIGGER recompute_time AFTER INSERT OR UPDATE ON time_entries FOR EACH ROW EXECUTE FUNCTION trigger_recompute_from_time_entry();
CREATE TRIGGER recompute_off AFTER INSERT OR UPDATE ON days_off FOR EACH ROW EXECUTE FUNCTION trigger_recompute_from_days_off();
DO $$ BEGIN
  ASSERT (SELECT user_id IS NULL AND created_by='00000000-0000-0000-0000-000000000099' AND total_minutes=480 FROM time_entries), 'repair preserves hours and uploader';
  INSERT INTO days_off VALUES ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000099',NULL,'2026-06-09','2026-06-09');
  ASSERT (SELECT user_id IS NULL FROM days_off), 'loginless leave has no borrowed login';
  UPDATE employees SET user_id='00000000-0000-0000-0000-000000000011';
  ASSERT (SELECT user_id='00000000-0000-0000-0000-000000000011' FROM time_entries), 'time follows accepted login';
  ASSERT (SELECT user_id='00000000-0000-0000-0000-000000000011' FROM days_off), 'leave follows accepted login';
  BEGIN
    UPDATE time_entries SET org_id='00000000-0000-0000-0000-000000000020';
    RAISE EXCEPTION 'cross-org assignment accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO punches VALUES(gen_random_uuid(),'00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000099','00000000-0000-0000-0000-000000000010');
    RAISE EXCEPTION 'wrong employee punch accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  UPDATE time_entries SET user_id='00000000-0000-0000-0000-000000000099';
  ASSERT (SELECT user_id='00000000-0000-0000-0000-000000000011' FROM time_entries), 'writes cannot borrow another login';
  RAISE NOTICE 'All employee history identity probes passed';
END $$;
ROLLBACK;
