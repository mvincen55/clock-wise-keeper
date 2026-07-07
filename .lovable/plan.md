
# Production Hardening Plan

This is a large, interdependent change set. I'll implement it in the exact order you specified, pausing only for the database migration approval steps (schema/RLS changes require your click-through).

## Phase 1 — Timestamps: real UTC in DB, ET only at display

**Edge functions**
- `process-location-event/index.ts`: delete `nowEasternIso()`, use `new Date().toISOString()`. Re-verify `entry_date` derivation via `toLocaleString('en-CA', { timeZone })` — with real UTC input it now yields the correct local date (previously double-shifted).
- `confirm-import/index.ts`: PDF times are ET wall-clock. Convert to real UTC via DST-aware offset lookup (`Intl.DateTimeFormat` with `America/New_York` + `timeZoneName: 'shortOffset'`, parse offset, apply). No fixed -05:00.

**Client**
- `src/lib/time-utils.ts`: add/consolidate `formatPunchTime`, `formatPunchDate`, `formatPunchDateTime` — all format in `America/New_York`, exclude seconds. Add `easternDateKey(iso)` for date bucketing.
- Sweep readers/writers of `punch_time` and update to: **write** `new Date().toISOString()` (real UTC), **read** via the helpers above:
  - `usePunchEditor.ts`, `PunchEditorModal.tsx`, `TimeFixModal.tsx`, `BulkRepairTool.tsx`, `TimezoneRepairTool.tsx`
  - Timesheet + Reports pages, `TeamEmployeeCard`, attendance/tardy displays that render `punch_time`

## Phase 2 — Import integrity (`confirm-import`)

- Resolve target employee per row: match `employee_code` then `employee_name` (case/space-insensitive) against `employees` where `org_id = importer.org_id`. Fallback to importer's own `employee` row. On multiple matches → append `audit_events` "import_ambiguous_employee" and skip row (or fail batch with clear error).
- Scope every `time_entries`/`punches`/existing-entry lookup and write by `employee_id` + `org_id` + `entry_date`. No org-wide `.eq('entry_date',…).maybeSingle()`.
- Write `org_id` and `employee_id` on all inserted `time_entries` and `punches`.
- `payroll_summaries` → upsert on `(org_id, range_start, range_end)`. Migration: add unique index.
- Total-minutes pairing: iterate punches ordered by `seq`; when sequence isn't strict in→out alternation, write `audit_events` row `type='import_pairing_exception'` with the offending punch ids, and skip that pair rather than blindly adding.

## Phase 3 — RLS lockdown

**Migration (single file):**
1. Trigger check: `trigger_recompute_from_punch` already recomputes attendance but does NOT update `time_entries.total_minutes`. Extend it: after recompute, `UPDATE time_entries SET total_minutes = (sum of paired punch deltas) WHERE id = v_entry_id`. Then remove the app-side `total_minutes` write in `process-location-event.createAutoPunch`.
2. Replace employee "Own X" ALL policies on `punches`, `time_entries`, `tardies`, `attendance_day_status`, `attendance_exceptions`, `days_off` with:
   - SELECT: `user_id = auth.uid() OR is_org_admin(org_id)`
   - INSERT: WITH CHECK `user_id = auth.uid()` (and admin ALL retained)
   - Admin ALL policy retained.
   - No employee UPDATE/DELETE.
3. `audit_events`: drop "Own audit_events" ALL. Add:
   - INSERT (org members): WITH CHECK `sender_user_id = auth.uid() AND is_org_member(org_id)`
   - SELECT: `user_id = auth.uid() OR is_org_admin(org_id)`
   - Admin ALL retained; no non-admin UPDATE/DELETE.
4. New SECURITY DEFINER function `log_punch_change()` + AFTER UPDATE OR DELETE trigger on `punches` writing OLD/NEW jsonb into `audit_events`.
5. `notifications` INSERT policy: WITH CHECK `is_org_admin(org_id) OR recipient_user_id IN (SELECT user_id FROM org_members WHERE org_id = notifications.org_id AND role IN ('owner','manager') AND status='active')`.

## Phase 4 — Smaller items + duplicate prevention

- Migration: `CREATE UNIQUE INDEX time_entries_employee_date_uidx ON time_entries(employee_id, entry_date) WHERE employee_id IS NOT NULL;`
- `process-location-event.getOrCreateTimeEntry`: on 23505 unique-violation, re-select and use existing row.
- `WipeDataTool.tsx`: gate render on `orgCtx.role in ('owner','manager')` (UI gate). Post-Phase-3 RLS makes any employee-side delete impossible regardless.
- `allowed_users`: untouched.

## Verification steps

Run after Phase 3 migration approves:
- SQL check policies: `SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename IN ('punches','time_entries','audit_events','tardies','attendance_day_status','attendance_exceptions','days_off','notifications') ORDER BY 1,2;`
- Playwright (non-admin session): attempt UPDATE/DELETE on `punches`/`time_entries`/`audit_events` via `supabase-js` → assert 0 rows affected.
- Playwright: two-employee import same date under all 3 strategies → verify no cross-writes.
- Playwright: re-run same import → `payroll_summaries` count stays constant.
- GPS auto-punch smoke: zone enter → punch in row created, `total_minutes` NULL/0; zone exit → punch out row, `total_minutes` recomputed by trigger.

## Order of operations (with approval gates)

1. Phase 1 code edits (edge functions + client sweep) — no schema.
2. **Migration A** (Phase 3 RLS + audit trigger + total_minutes trigger extension). ← approval gate
3. Phase 2 + `process-location-event` refactor (depends on Migration A trigger).
4. **Migration B** (Phase 4 unique indexes: `time_entries` and `payroll_summaries`). ← approval gate
5. `process-location-event` 23505 handling + `WipeDataTool` gate.
6. Verification pass; report any gaps.

## Assumptions

- `punches` and `audit_events` already have `org_id` and `employee_id` columns (visible in schema); if any table is missing them the migration will add them.
- `audit_events.sender_user_id` (or equivalent — I'll confirm on read) is the identity column for INSERT WITH CHECK.
- "Fail loudly on ambiguity" in import = log audit + skip row, batch continues. Say the word if you want the whole batch to abort instead.

Approve and I'll start with Phase 1 code edits.
