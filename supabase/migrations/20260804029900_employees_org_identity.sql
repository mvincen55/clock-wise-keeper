-- Composite foreign keys use both the globally unique employee id and org id
-- so tenant mismatches are rejected by PostgreSQL itself.
-- This migration must run before the acknowledgment tables are created.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.employees'::regclass
      AND conname = 'employees_id_org_unique'
  ) THEN
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_id_org_unique UNIQUE (id, org_id);
  END IF;
END;
$$;
