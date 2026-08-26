-- ============================================================
-- PHASE 2: APPEND-ONLY AUDIT LOG
-- (Time Clock Legitimacy Hardening — see audits/time-clock-preflight.md)
--
-- An audit log the boss can rewrite is not an audit log.
--
--   1. Drop "Org admin audit_events" (FOR ALL since 20260218191828):
--      it let owners/managers UPDATE and DELETE audit rows from the
--      client. What remains is exactly the intended surface:
--        * INSERT — "Org members insert audit_events" (20260707182446),
--          member-scoped with the actor check
--          (actor_id IS NULL OR actor_id = auth.uid()).
--        * SELECT — "Employees select own audit_events" (20260812142025):
--          own rows OR is_org_admin(org_id) OR
--          has_permission(org_id, 'view_reports'). Org-admin SELECT
--          therefore survives inside this policy; no new policy needed
--          (and the view_reports arm is preserved — preflight
--          adjustment #6).
--        * No UPDATE or DELETE policy for any role.
--   2. Belt and suspenders: RLS does not bind service role (BYPASSRLS),
--      so a trigger enforces immutability below RLS — BEFORE UPDATE OR
--      DELETE raises unconditionally, and BEFORE TRUNCATE closes the
--      row-trigger bypass. Nothing rewrites audit history, not even
--      the SQL editor on a bad day.
--   3. Write convention (enforced in app code, adopted by Phase 1's
--      server-side writers already): event_details carries
--      target_employee_id — whose RECORD changed — distinct from
--      actor_id (who did it). Office-scoped events carry an explicit
--      null. No backfill; new writes comply.
--
-- Also in this phase (frontend): WipeDataTool no longer deletes
-- audit_events — audit history is retained by design. Its punches /
-- time_entries deletes still work for admins and now leave DB-layer
-- audit traces via trg_audit_punch_change; Phase 3 (void-not-delete)
-- must revisit that tool again when row deletion goes away entirely.
--
-- DEPLOY NOTES (GitHub merges deploy nothing in this repo):
--   * Apply this migration. No edge functions change in this phase.
--   * Publish the frontend (WipeDataTool + audit-write convention).
--   * Verification probes: supabase/tests/audit_append_only_probes.sql
-- ============================================================

DROP POLICY IF EXISTS "Org admin audit_events" ON public.audit_events;

CREATE OR REPLACE FUNCTION public.audit_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'AUDIT_APPEND_ONLY: audit_events rows can never be % — the audit log is append-only', lower(TG_OP)
    USING ERRCODE = '42501',
          HINT = 'Corrections are recorded as new audit events, never by rewriting history.';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_events_append_only ON public.audit_events;
CREATE TRIGGER trg_audit_events_append_only
BEFORE UPDATE OR DELETE ON public.audit_events
FOR EACH ROW EXECUTE FUNCTION public.audit_events_append_only();

DROP TRIGGER IF EXISTS trg_audit_events_no_truncate ON public.audit_events;
CREATE TRIGGER trg_audit_events_no_truncate
BEFORE TRUNCATE ON public.audit_events
FOR EACH STATEMENT EXECUTE FUNCTION public.audit_events_append_only();
