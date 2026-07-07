# Post-Remediation Adversarial Review — 2026-07-07

Independent review of the 4-phase hardening pass (commit `b53ab4a` "Applied security hardening")
before go-live as payroll system of record. All SQL run against the live DB went through the
Lovable MCP admin connection; every schema change is mirrored as a migration in this commit.

**Branch note:** this review was developed on `claude/new-session-pinnkr` (the branch assigned to
this session) rather than `hardening-review`. Treat it the same way: review, then merge to main.

## Verdict

The hardening pass itself held up well — RLS lockdown, audit trigger, recompute-trigger ownership
of `total_minutes`, and the unique indexes are all live and correct. The **RLS attack test passed
14/14 through the real API** with a non-admin JWT. However, the review found **four real gaps**
(two of them payroll-integrity bugs) that are fixed in this commit, one of which required a
schema change (applied live + mirrored).

## Spec verification matrix

| # | Spec item | Implemented | Verified | Gap found | Fix applied |
|---|---|---|---|---|---|
| A1a | No writer produces non-UTC `punch_time` | Partially | Grepped every writer in `src/` + `supabase/functions/` | **`PunchEditorModal` still used the old fake-UTC convention** — displayed `getUTCHours()` in the time inputs and saved Eastern wall time stamped `Z` (comment even said "stays Eastern-in-UTC"). Every quick-fix path (scheduled end, fill missing) funneled through it. **`MissingShiftBanner`** likewise stamped `<input type="time">` values directly as `Z`. | Both now convert via new DST-correct `easternWallToUtcIso` / `easternTimeInputValue` helpers in `src/lib/time-utils.ts` |
| A1b | No display path formats in UTC | Yes | `formatTime`/`formatDate` all pin `America/New_York`; `export-report` clean | `PunchEditorModal` time inputs displayed UTC hours (fixed above). `TimeFixModal`/`BulkRepairTool` intentionally display raw UTC as diagnostics — see Open items | — |
| A2 | Confirm-import ET→UTC conversion is DST-correct | Mostly | Unit tests: `src/test/confirm-import.test.ts`, `src/test/time-utils.test.ts` (29 tests pass) | The single-pass offset lookup was **1 hour off for early-morning wall times on transition days** (e.g. 06:30 ET on 2026-03-08 → stored as 07:30 EDT; 02:00 ET on 2026-11-01 → stored as 01:00 EST). The spec's own probe times (02:30 nonexistent, 01:30 ambiguous) happened to resolve acceptably, which is why it looked right. | Double offset resolution with wall-clock check; nonexistent times shift forward (02:30→03:30 EDT), ambiguous times take the earlier (EDT) occurrence. Logic extracted to `supabase/functions/confirm-import/lib.ts` and unit-tested |
| A3 | `createAutoPunch` no longer UPDATEs `time_entries`; recompute trigger owns `total_minutes` | Yes | `pg_get_functiondef` of `trigger_recompute_from_punch` — pairs by seq/time, updates `total_minutes`; trigger `trg_recompute_punch` live on INSERT/UPDATE/DELETE; `createAutoPunch` writes punches only and handles the 23505 race | `usePunchEditor` (admin punch editor) still client-wrote `total_minutes` after saving, racing the trigger | Removed the client-side write; the trigger is the single owner |
| A4 | Punch audit trigger is SECURITY DEFINER with pinned search_path | Yes | `pg_proc`: `log_punch_change` `prosecdef=true`, `proconfig=[search_path=public]` (same for all helper/recompute functions); `trg_audit_punch_change` live on UPDATE+DELETE | None | — |
| A5 | Unique index `(employee_id, entry_date)` vs legacy NULL `employee_id` rows | Yes | Index def confirmed (default NULLS DISTINCT); **0 rows** with NULL `employee_id` exist; every current writer populates it | Intended behavior confirmed — no partial index needed. But see the adjacent discovery below (A5b) | — |
| A5b | *(discovered)* Legacy `UNIQUE (user_id, entry_date)` constraint still on `time_entries` | — | Reproduced live: seeding two employees' entries on the same date failed 23505 | **Multi-employee imports were impossible**: confirm-import assigns the importer's `user_id` to entries for unlinked employees (`user_id` is NOT NULL), so the second employee on any shared date violated the constraint and the whole import 500'd | Constraint dropped live + mirrored in `supabase/migrations/20260707184845_*.sql`. Per-employee uniqueness is owned by `time_entries_employee_date_uidx`. `useTodayEntry` re-scoped to own `employee_id` so multiple same-date entries under one `user_id` can't break the clock widget |
| A5c | *(discovered)* confirm-import selected `employee_code` from `employees` — column doesn't exist | — | Reproduced live: 42703 error; the function ignored it | **All import rows silently fell back to the importer's own employee record** (match maps stayed empty) — every employee's hours would be attributed to whoever ran the import | Select fixed to real columns and the error is no longer swallowed; matching is by `display_name`; a row naming an unmatched employee is now **skipped with an `import_unmatched_employee` audit event** instead of misattributed to the importer |
| B | RLS attack test | — | **`scripts/verify-rls.ts` run live: 14/14 PASS** (see below) | Script did not exist | Added; run with `npx tsx scripts/verify-rls.ts` (prompts for credentials or reads `TEST_USER_EMAIL`/`TEST_USER_PASSWORD`; nothing hardcoded) |
| C | Import matrix integrity | Partially | Pure logic unit-tested (15 tests); DB invariants exercised live (below) | Mispair detection was **dead code** — it compared positionally-assigned `punch_type` values against the same positional rule, so it could never fire | `detectMispaired` now flags odd punch counts, unparseable times (defaulted to noon), and out-of-chronological-order sequences, with reasons recorded in the audit event |
| D | This report | — | — | — | `REVIEW.md` |

## RLS attack test — live results (non-admin JWT via PostgREST)

A disposable non-admin user (`role=employee`, active org member) was seeded via the admin
connection, used for the test, then fully removed along with everything it touched.
DB row counts verified identical to the pre-test state afterward.

| Check | Result |
|---|---|
| Sign in as non-admin (`role=employee`) | ✅ |
| INSERT own `time_entry` (clock-in survives lockdown) | ✅ |
| INSERT own punch | ✅ |
| UPDATE own punch → 0 rows | ✅ |
| DELETE own punch → 0 rows | ✅ |
| UPDATE own `time_entry` → 0 rows | ✅ |
| DELETE own `time_entry` → 0 rows | ✅ |
| INSERT own `audit_event` (self-logging allowed) | ✅ |
| UPDATE `audit_event` → 0 rows | ✅ |
| DELETE `audit_event` → 0 rows | ✅ |
| INSERT notification to non-admin recipient → rejected (RLS) | ✅ |
| SELECT punches — only own visible | ✅ |
| SELECT another employee's punches → 0 rows | ✅ |
| INSERT punch for another employee → rejected (RLS) | ✅ |

Admin cleanup of the test punches was performed through the Lovable MCP and **both deletions
produced `punch_deleted` rows via `trg_audit_punch_change`**, with full `before_json` snapshots —
the audit trail catches admin-context deletes too.

## Import matrix — live DB invariants

- Two employees with `time_entries` on the same date: **inserts succeed** (after A5b fix; failed before).
- Duplicate `(employee_id, entry_date)` insert → **23505 from `time_entries_employee_date_uidx`** ✅
- `payroll_summaries` upsert on `(org_id, range_start, range_end)` twice → **1 row, latest value** ✅
- Cross-employee attribution, `org_id`/`employee_id` population, and mispair audit rows are covered
  by the unit tests of the extracted logic (`src/test/confirm-import.test.ts`).
- All seeds removed afterward.

⚠️ The **deployed** confirm-import edge function still runs the pre-review code until this branch
merges to main and Lovable redeploys. Re-run one skip/overwrite/merge import against the preview
after merge as a smoke test.

## Route through Lovable (not applied — your call)

1. **Optional tightening** — every current writer populates `employee_id` and no NULL rows exist:
   ```sql
   ALTER TABLE public.time_entries ALTER COLUMN employee_id SET NOT NULL;
   ```
   (Mirror as a migration if applied.)

## Open items (non-blocking, flagged)

1. **Legacy repair tools are now dangerous.** `TimezoneRepairTool`, `BulkRepairTool`, and
   `TimeFixModal` shift punch times by fixed offsets on the assumption the DB holds fake-UTC.
   The DB is now real UTC — running them would corrupt good data. Remove or disable them before
   staff onboarding (left untouched here; removing UI was out of scope for this review).
2. **Employee edits to `is_remote`/`entry_comment` silently no-op.** The lockdown removed
   employee UPDATE on `time_entries`, but `useUpdateEntry` (and the punch editor for non-admins)
   still issue UPDATEs that affect 0 rows with no error. Either hide those controls from
   non-admins or add a narrow UPDATE policy limited to `is_remote`/`entry_comment`.
3. **Role naming**: the runbook's go-live checklist says staff should land as role `member`;
   the actual enum is `owner` / `manager` / `employee`. Non-admin = **`employee`**.
4. `punches` has no unique constraint on `(time_entry_id, seq)`; merge-strategy imports can
   produce duplicate seq values (ordering falls back to `punch_time`). Cosmetic today.
5. The GPS flow (`process-location-event`) verified clean by code review: real-UTC timestamps,
   input validation with range-checked timestamp, delay logic, no `time_entries` writes.
   The runbook's live phone test (Step 4) remains the outstanding physical check.

## Files changed in this review

- `src/lib/time-utils.ts` — DST-correct `easternWallToUtcIso`, `easternTimeInputValue`, `getEasternOffsetMinutes`
- `src/components/PunchEditorModal.tsx` — editor reads/writes Eastern wall ↔ real UTC
- `src/components/MissingShiftBanner.tsx` — manual/remote punch entry converts ET → real UTC
- `src/hooks/usePunchEditor.ts` — removed client-side `total_minutes` write
- `src/hooks/useTimeEntries.ts` — `useTodayEntry` scoped to own employee
- `supabase/functions/confirm-import/index.ts` — employee matching fixed, no importer fallback for named rows, mispair detection live
- `supabase/functions/confirm-import/lib.ts` — extracted pure logic (testable from vitest)
- `supabase/migrations/20260707184845_*.sql` — drop legacy `UNIQUE (user_id, entry_date)` (applied live)
- `scripts/verify-rls.ts` — repeatable RLS attack test
- `src/test/time-utils.test.ts`, `src/test/confirm-import.test.ts` — 28 new unit tests (29 total pass)

Verification: `npx vitest run` (29/29), `npx tsc --noEmit` (clean), `npx vite build` (succeeds).
