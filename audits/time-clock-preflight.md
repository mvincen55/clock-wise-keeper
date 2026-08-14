# Time Clock Preflight Audit (Phase 0)

**Date:** 2026-08-14 · **Audited against:** `main` @ `3e76740` · **Scope:** read-only verification of the 12 findings in the Time Clock Legitimacy Hardening plan. No code was changed in this phase.

**Verdict summary: all 12 findings are CONFIRMED.** None are wrong. Several carry nuances that invalidate *assumptions inside later phases* — those adjustments are listed first, because they change how Phases 1–4 must be executed.

---

## Adjustments to later phases (read before starting Phase 1)

1. **Phase 1, item 4 — the geo edge function does NOT run with service role.** `process-location-event` builds its client with the **anon key + the caller's JWT** (`supabase/functions/process-location-event/index.ts:79-84`), so its `time_entries`/`punches` inserts succeed *only because of the employee INSERT policies Phase 1 drops*. Dropping them breaks auto clock-in/out unless, in the same phase, the function is routed through the shared server-side path (the plan already prefers a shared SQL function — make the edge function call it, or switch the function to service role after its own auth check).
2. **Phase 1, item 4 — the CSV import path also runs in caller context, not service role.** `confirm-import` uses the anon key + caller JWT (`supabase/functions/confirm-import/index.ts:19-23`) and has no admin gate (only sign-in, lines 28-34). For an **admin** caller the writes ride the org-admin ALL policies and survive Phase 1 unchanged. For a **non-admin** importing their own single-employee report, the writes ride the employee INSERT policies and will break — say so in the Phase 1 PR, and either accept it (import becomes admin-only, which matches its real use) or route it through admin/service context as the plan directs.
3. **Phase 1 — there is a third client punch-write path the plan doesn't list.** `MissingShiftBanner.tsx` lets an employee backfill a *past* day: it inserts a `time_entries` row with an arbitrary past `entry_date` **and a client-computed `total_minutes`** (lines 104-113), inserts punch pairs with client times and client seq (117-130), and writes its own audit row (132-140). Dropping the employee INSERT policies silently breaks this flow (its inserts throw). Phase 1 must either give it a server path or deliberately retire it in favor of correction requests (Phase 4) — but decide explicitly; don't leave a dead button.
4. **Phase 3 — the unconditional `BEFORE DELETE` trigger on `punches` breaks `confirm-import` re-imports.** The import path hard-deletes existing punches before re-inserting when a row already exists for that employee/date (`confirm-import/index.ts:164`). With the no-delete trigger in place, re-imports will raise. Phase 3 must convert the import's delete-then-reinsert into void-then-insert (or an equivalent server-side rewrite) in the same phase.
5. **Phase 4 — "drop the org-admin UPDATE policy on punches" needs care: it's a FOR ALL policy.** Admin write access to `punches` is one policy, `"Org admin punches"` FOR ALL (`20260707182446:22-25`). Splitting it to SELECT-only also removes admin **INSERT**, which `confirm-import` (running as the admin caller — see #2) still needs unless it has been moved to service role/RPC first. Sequence the import rework before or with this drop.
6. **Phase 2 — preserve the `view_reports` permission arm when recreating audit policies.** The current employee SELECT policy on `audit_events` is `user_id = auth.uid() OR is_org_admin(org_id) OR has_permission(org_id, 'view_reports')` (`20260812142025:175-182`). Phase 2's "org-admin SELECT + member INSERT + employee own-row SELECT" recreation must keep the `has_permission` arm or granted-employee report access regresses.
7. **Phase 3 — the recompute function was renamed.** `recompute_attendance_range` is now a SECURITY DEFINER *authorization wrapper* (`20260804122000`) around `_recompute_attendance_range_internal` (body in `20260720144829:190+`). Phase 3's voided-row filtering goes in the **internal** function (punch count at line 332, incomplete check at 368-373, first-in/last-out in the same body) plus `trigger_recompute_from_punch`.
8. **Phase 4 — the ctx landmine is wider than the punch editor.** In the same `AttendanceActions` component, "Mark day off" inserts `days_off` with the **caller's** `employee_id` (`useDaysOff.ts:46-52`) and the follow-up recompute targets the **caller's** attendance (`useAttendanceDayStatus.ts:62-66` passes `p_user_id: user.id`). Fixing only the punch-editor wiring still leaves a manager marking *their own* record off when acting on another employee's row. Phase 4's wiring fix should thread the row's employee through all three actions, or explicitly scope what it fixes.
9. **Phase 1/5 — `punches` INSERT RLS doesn't bind the punch to the caller's own entry.** The employee INSERT check validates only `employee_id` ownership (`20260707182446:31-35`); `time_entry_id` and `org_id` are unconstrained, so an employee can attach punches (carrying their own employee_id) to **another employee's** `time_entry_id`, and `trigger_recompute_from_punch` will fold them into that entry's `total_minutes`. Phase 1's RPC-only write path closes this; noting it here because it makes the policy drop a *security* fix, not just hygiene.
10. **Phase 2 — `target_employee_id` is an `event_details` JSON key, not a column.** `audit_events` has `user_id`/`employee_id`/`actor_id` columns (`20260217200601:173-181`, extended in `20260218182002:39-41`, `20260218223145:49-55`); no migration is needed for the Phase 2 rule — it's a write-convention requirement.
11. **Phase 5 — the org-wide timesheet report has no employee dimension at all.** Reports fetches org-wide entries for admins (`Reports.tsx:232`, scope `'all'`) but renders rows keyed only by date with **no employee name column** on screen (631-671) or in the CSV (343-367), and one grand total (237). Per-employee weekly OT totals therefore require adding per-employee grouping to the report first — treat that as an unstated prerequisite inside Phase 5, not an optional nicety.
12. **Phase 5 — the default payroll week is Monday-start, so the PTO/payroll week mismatch is live today, not hypothetical.** `payroll_settings.week_start_day` defaults to `1` (`20260218001658:7`) while the PTO engine hard-aligns to Sunday (`usePtoEngine.ts:239-241`) — the two disagree out of the box.

---

## Findings

### 1. Punch/entry INSERT RLS trusts the client — CONFIRMED

`punches` INSERT checks only employee ownership, and `time_entries` INSERT checks only `user_id`, so the client freely supplies `punch_time`, `source`, `seq`, and arbitrary past `entry_date` values.

- `supabase/migrations/20260707182446_ea02a6bf-....sql:31-35` — `"Employees insert own punches"` WITH CHECK is just `EXISTS (employees e WHERE e.id = employee_id AND e.user_id = auth.uid())`; no constraint on `punch_time`, `source`, `seq`, `org_id`, or `time_entry_id` (see adjustment #9).
- Same file `:13-15` — `"Employees insert own time_entries"` WITH CHECK is `auth.uid() = user_id`; no date constraint.
- Client-supplied values in practice: `src/hooks/useTimeEntries.ts:162-170` (punch_time/source/seq), `src/components/MissingShiftBanner.tsx:104-130` (past `entry_date`, punch pairs, even `total_minutes` at line 111).

### 2. Clock-action audit exists only client/app-side; the DB trigger skips INSERT — CONFIRMED

For manual clock in/out the fire-and-forget client insert in `useClockAction` is the only audit record, and `trg_audit_punch_change` fires on UPDATE/DELETE only, so any punch INSERT that bypasses (or forgets) app code leaves no trace.

- `src/hooks/useTimeEntries.ts:175-184` — client-side `audit_events` insert, result unchecked (an audit failure still leaves the punch standing, silently).
- `supabase/migrations/20260707182446_...sql:164-167` — `CREATE TRIGGER trg_audit_punch_change AFTER UPDATE OR DELETE ON public.punches` (no INSERT); function `log_punch_change` at 123-162 handles only those two ops.
- Nuance: the geo path writes its own app-level audit (`process-location-event/index.ts:387-402`), as does `MissingShiftBanner.tsx:132-140` — the finding's point stands: nothing at the DB layer audits INSERTs.

### 3. Org admins can rewrite the audit log — CONFIRMED

`"Org admin audit_events"` is FOR ALL, so owners/managers can UPDATE and DELETE audit rows from the client.

- `supabase/migrations/20260218191828_...sql:142-144` — `CREATE POLICY "Org admin audit_events" ... FOR ALL USING (public.is_org_admin(org_id))`.
- Never dropped since: `20260707182446:82-95` replaced only the `"Own audit_events"` policy (its comment explicitly notes "admin ALL policy already exists"); `20260811180000` / `20260812142025` touched only the employee SELECT policy.

### 4. AttendanceActions' manager edit path is a stub — CONFIRMED (and worse: it reports success)

`AttendanceActions.tsx` opens `PunchEditorModal` with `entryId=""` and `punches=[]`, and because the save hook never checks write results, saving from this stub toasts "Punches saved with audit trail" while writing nothing.

- `src/components/AttendanceActions.tsx:205-213` — `entryId=""` (209), `punches={[]}` (211); mounted org-wide for managers from `src/pages/DaysOff.tsx:604,817`.
- `src/hooks/usePunchEditor.ts:110-124` — insert with `time_entry_id: ""` fails (invalid uuid) but the error object is never read; `src/components/PunchEditorModal.tsx:263` then shows the success toast.
- Same component family, same class of bug: day-off and recompute act on the *caller's* record (see adjustment #8).

### 5. No employee UPDATE/DELETE on punches + unchecked writes = silent failure with phantom audits — CONFIRMED

Current `punches` policies are admin ALL / employee SELECT / employee INSERT only, and `useSavePunchEdits` checks neither errors nor affected row counts while inserting its audit rows *before* each write, so an RLS-blocked edit no-ops silently and still leaves "punch_edited"/"punch_deleted" audit rows describing changes that never happened.

- Policy state after `20260707182446:19-35` (no employee UPDATE/DELETE anywhere later; verified across all migrations touching `ON public.punches`).
- `src/hooks/usePunchEditor.ts:52-59` (audit at 54 precedes delete at 58), `:70-95` (audits 73-89 precede update 90-94), `:133-139` (re-sort loop, unchecked) — no `error`/count check on any write.
- The audit inserts themselves pass RLS for any org member (`20260707182446:84-89`, actor check `actor_id = auth.uid()`).
- Mitigating context, not a correction: the Timesheet UI gates the editor to managers (`src/pages/Timesheet.tsx:164-169` — the comment even acknowledges the RLS gap), so the everyday path runs as admin and succeeds; the silent-failure mechanism is real for any non-admin invocation and for the stub path in finding 4.

### 6. Editor inserts punches under the EDITOR's employee_id — CONFIRMED

`useSavePunchEdits` stamps new punches with `employee_id: ctx.employee_id` and `org_id: ctx.org_id` — the logged-in editor's identity, not the entry owner's.

- `src/hooks/usePunchEditor.ts:110-124` (employee_id at 113, org_id at 112).
- Latent today only because every *working* call site is self-scoped (`src/pages/Timesheet.tsx:232`, `src/components/GlobalTimeControl.tsx:124-130` both pass the caller's own entry); the moment finding 4's wiring is fixed without fixing this, a manager's added punches land on the manager's own record. Phase 4's resolve-from-entry design kills this correctly.

### 7. Punch corrections are stamped `applied` without being applied — CONFIRMED

Approval maps status to `'applied'` unconditionally, but apply logic exists only for `target_table === 'pto_requests'`, so approved punch corrections claim application that never happened (and the notification says "approved and applied").

- `src/hooks/useCorrectionRequests.ts:159` — `const updateStatus = params.status === 'approved' ? 'applied' : params.status;` written at 161-170 *before* any apply.
- `:181-201` — apply branch guarded by `req.target_table === 'pto_requests'`; no other table handled.
- `:225-227` — employee notification text: "approved and applied".

### 8. No `(time_entry_id, seq)` uniqueness; client-side nextSeq; pairing CTE silently zeros on in/in — CONFIRMED

Only a *non-unique* index exists on `(time_entry_id, seq)`, every writer computes `nextSeq` by read-then-insert, and the recompute pairing CTE requires strict in-then-out at odd row numbers so an in/in sequence sums to 0 minutes with no signal.

- `supabase/migrations/20260217200601_...sql:105` — `CREATE INDEX idx_punches_entry` (non-unique); `20260707182446:226-230` added unique indexes to *other* tables, not punches. `punches.seq` even defaults to `0` (`20260217200601:82`).
- Client seq: `src/hooks/useTimeEntries.ts:152-160`; `src/hooks/usePunchEditor.ts:100-102`; `MissingShiftBanner.tsx:117-127`; the edge function does the same read-then-insert server-side (`process-location-event/index.ts:355-363`) — the entry-level 23505 retry (`useTimeEntries.ts:135`) covers entry races, nothing covers seq races.
- Pairing CTE: `20260707182446:194-207` — `WHERE a.punch_type = 'in' AND b.punch_type = 'out' AND a.rn % 2 = 1`; in/in pairs fail the filter → `COALESCE(SUM(...), 0)`. Also unguarded: an out earlier than its in produces a *negative* contribution — Phase 5's "negative pair duration" anomaly flag is the right home for surfacing this.

### 9. The editor hard-deletes punch rows — CONFIRMED

`useSavePunchEdits` calls `.delete()` on punches, destroying rows (FLSA-relevant records) with only the app-level audit row as residue.

- `src/hooks/usePunchEditor.ts:58` — `await supabase.from('punches').delete().eq('id', id);` (unchecked, audit inserted beforehand at 54).
- `punches.time_entry_id` FK is `ON DELETE CASCADE` (`20260217200601:81`), matching Phase 3's plan to leave the FK but make deletes unreachable.
- Also hard-deletes: `confirm-import/index.ts:164` on re-import (see adjustment #4).

### 10. Frontend timezone hardcoded; entry_date derived from the device clock — CONFIRMED

`time-utils.ts` pins `APP_TZ = 'America/New_York'` and `getToday()` reads the device clock, which `useClockAction` uses for `entry_date`, and the punch timestamp itself is the device clock's `new Date()` (as real UTC, minute-truncated).

- `src/lib/time-utils.ts:9` (constant), `:81-83` (`getToday()`), `:97-105` (`nowEasternIso()` → `nowUtcIso()` → `new Date()`).
- `src/hooks/useTimeEntries.ts:111,118,130` — `entry_date: today` and `punch_time: now`, both client-derived.
- Server-side `get_user_timezone` (`20260218192130:100-115`) resolves employees → schedule_versions → pto_settings → hardcoded `'America/New_York'`; there is no org-level timezone in the chain — exactly the Phase 6 plug-in point. The geo function also accepts a client-supplied timestamp within a −24h/+1h window (`process-location-event/index.ts:51-62`), i.e. even the "server" path currently trusts the device clock up to a day.

### 11. PTO accrual basis, cap default, and Sunday-fixed weeks — CONFIRMED

The accrual basis is `min(worked_hours_raw, worked_hours_cap_weekly) + pto_taken` with no 40-hour ceiling of its own; `worked_hours_cap_weekly` already defaults to 40 at both the DB and the auto-create layer (per-user rows may differ — verify live values during the Phase 7 staging probe); and the engine's weeks are hard-aligned to Sunday while Reports uses `payroll_settings.week_start_day` (default Monday — see adjustment #12).

- `src/hooks/usePtoEngine.ts:268` (`workedHoursCapped = Math.min(workedHoursRaw, Number(s.worked_hours_cap_weekly))`), `:279` (`basisHours = workedHoursCapped + ptoTaken`) — a 45-hour week with a 45+ cap would accrue on 45; Phase 5's `min(..., 40)` is the fix.
- Defaults: `supabase/migrations/20260218012304_...sql:7` (`DEFAULT 40`), `usePtoEngine.ts:187` (auto-create `worked_hours_cap_weekly: 40`).
- Weeks: `usePtoEngine.ts:239-256` (`while (firstSunday.getDay() !== 0)` — Sunday-fixed, Sun–Sat periods) vs `src/pages/Reports.tsx:209-218` (`payrollSettings?.week_start_day ?? 1`).

### 12. Reports has no overtime concept and no missing-time flags for the payroll run — CONFIRMED

The Reports page computes no weekly per-employee totals, has no 40-hour comparison anywhere, and its timesheet reports flag nothing about missing days, unpaired punches, or zero-minute anomalies.

- `src/pages/Reports.tsx` — full read: the only aggregate is one grand `totalMinutes` (237, rendered 633, CSV 364); no "overtime"/"OT" token exists in the file; CSV columns (343) and the on-screen table (651-657) carry late flags and edit flags only.
- Missing-time machinery that *does* exist is out of the payroll path: `useMissingShifts` is client-side, self-scoped, and gated to clocking employees (`src/hooks/useMissingShifts.ts:21-40`), and the separate `attendance_exceptions` report type (Reports.tsx:739-796) lists only already-recorded exceptions — the manager's payroll run itself computes nothing.
- Compounding gap for Phase 5: the org-wide report has no employee column at all (adjustment #11).

---

## Method

Verified against the working tree at `main` @ `3e76740` (branch base). RLS/trigger state was reconstructed by reading every migration touching `punches`, `time_entries`, and `audit_events` in timestamp order (policy creates/drops traced through `20260217200601` → `20260217234928` → `20260218191828` → `20260707182446` → `20260720144829` → `20260811180000` → `20260812142025`); frontend paths by reading the hooks/components cited above in full. Live database row values (e.g. per-user `worked_hours_cap_weekly`) cannot be read from the repo and are flagged for the Phase 7 staging probes.

No fixes were made in this phase.
