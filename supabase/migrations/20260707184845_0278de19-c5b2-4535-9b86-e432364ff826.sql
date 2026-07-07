-- Post-remediation review fix (applied live via Lovable MCP on 2026-07-07,
-- mirrored here so repo migrations match the live schema).
--
-- Drop the legacy single-user uniqueness rule UNIQUE (user_id, entry_date).
-- time_entries.user_id is NOT NULL, and confirm-import assigns the importer's
-- user_id to entries for employees without linked accounts — so this constraint
-- made any multi-employee import for a shared date fail with 23505.
-- Per-employee uniqueness is owned by time_entries_employee_date_uidx
-- (employee_id, entry_date), added in the Phase 4 hardening migration.
-- No code path upserts on (user_id, entry_date).

ALTER TABLE public.time_entries DROP CONSTRAINT IF EXISTS time_entries_user_id_entry_date_key;
