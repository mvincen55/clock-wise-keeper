-- Post-review hardening (2026-07-23 adversarial review of the FOF/email/docs push).
--
-- 1) fof_settings / fof_templates were member-writable while every other
--    config table is member-read/admin-write: any employee could edit the
--    practice identity (name/address/phone/website) and the discount rules
--    (percentages, membership/senior flags) their FOFs are computed from.
--    Writes now require owner/manager; member read stays.
-- 2) The four email queue RPC wrappers are SECURITY DEFINER but had no
--    pinned search_path (posture: every DEFINER function pins it). All
--    internal calls are schema-qualified and EXECUTE is service_role-only,
--    so this is defense-in-depth rather than a live exploit.
-- 3) fee_schedule_items / insurance_plans rows could reference another
--    org's fee_schedules row (RLS checks only the row's own org_id).
--    Composite FKs now force the referenced schedule into the same org.

-- 1) FOF config: admin-write (the "Members read ..." policies remain).
DROP POLICY IF EXISTS "Members manage fof_settings" ON public.fof_settings;
DROP POLICY IF EXISTS "Members manage fof_templates" ON public.fof_templates;

CREATE POLICY "Admins manage fof_settings"
  ON public.fof_settings FOR ALL
  TO authenticated
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

CREATE POLICY "Admins manage fof_templates"
  ON public.fof_templates FOR ALL
  TO authenticated
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

-- 1b) process-email-queue logs 429 attempts with status 'rate_limited',
--     which the original CHECK constraint rejected — the insert failed
--     silently and rate-limited attempts were never logged. Widen the
--     constraint to match the writer.
ALTER TABLE public.email_send_log DROP CONSTRAINT IF EXISTS email_send_log_status_check;
ALTER TABLE public.email_send_log
  ADD CONSTRAINT email_send_log_status_check
  CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq', 'rate_limited'));

-- 2) Pin search_path on the email queue RPC wrappers.
ALTER FUNCTION public.enqueue_email(TEXT, JSONB) SET search_path = public;
ALTER FUNCTION public.read_email_batch(TEXT, INT, INT) SET search_path = public;
ALTER FUNCTION public.delete_email(TEXT, BIGINT) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) SET search_path = public;

-- 3) Same-org referential integrity for schedule references.
ALTER TABLE public.fee_schedules
  ADD CONSTRAINT fee_schedules_id_org_key UNIQUE (id, org_id);

ALTER TABLE public.fee_schedule_items
  DROP CONSTRAINT IF EXISTS fee_schedule_items_schedule_id_fkey,
  ADD CONSTRAINT fee_schedule_items_schedule_org_fkey
    FOREIGN KEY (schedule_id, org_id)
    REFERENCES public.fee_schedules(id, org_id) ON DELETE CASCADE;

-- Nullable reference: only the schedule pointer clears when the schedule
-- goes away (PG15+ column list on SET NULL keeps org_id intact).
ALTER TABLE public.insurance_plans
  DROP CONSTRAINT IF EXISTS insurance_plans_fee_schedule_id_fkey,
  ADD CONSTRAINT insurance_plans_fee_schedule_org_fkey
    FOREIGN KEY (fee_schedule_id, org_id)
    REFERENCES public.fee_schedules(id, org_id)
    ON DELETE SET NULL (fee_schedule_id);
