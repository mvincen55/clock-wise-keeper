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

1. ~~**Legacy repair tools are now dangerous.**~~ **RESOLVED 2026-07-20.** `TimezoneRepairTool`,
   `BulkRepairTool`, and `TimeFixModal` shifted punch times by fixed offsets assuming the DB held
   fake-UTC; the DB is now real UTC, so they would corrupt good data. `BulkRepairTool` and
   `TimezoneRepairTool` were orphaned (no route/import) and deleted. `TimeFixModal` and its two
   "Needs Time Fix" trigger buttons in Attendance were removed; the `timezone_suspect` signal now
   shows a static "⚠ Time Looks Off" badge, and correcting a genuinely-wrong punch goes through
   the punch editor (managers — correct ET↔UTC) or Request Correction (employees). A repo grep
   confirms no remaining fake-UTC writers.
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

---

# Employee-Experience Pass — 2026-07-20

After the hardening + integrity fixes above, a second sweep mapped **every employee-facing
write** against the live RLS policies to find flows that silently fail for a non-admin. The
lockdown made non-admin data append-only, but the UI still presented mutation controls that the
database rejected with **0 rows affected and no error** — the app popped "Saved!" while nothing
was written. For a payroll system of record, that's the most damaging class of bug.

Chosen model (your call): **employees self-serve low-risk workflow fields on their own rows;
punch times, totals, and approvals stay locked and flow through Request Correction.**

## Silent-failure bugs found & fixed

| Flow | Before | After |
|---|---|---|
| Timesheet → Remote toggle | UPDATE `time_entries` → 0 rows, toast lied | Narrow employee UPDATE policy + guard trigger; only `is_remote`/`entry_comment` writable, verified allowed |
| Timesheet → Daily comment | same | same |
| Timesheet → tardy "Add Reason" | recompute auto-creates the tardy row, so this was an UPDATE → 0 rows | Employee UPDATE policy limited to `reason_text` by guard trigger; auto-detect effect now only INSERTs when no row exists (no more throwing upserts) |
| Dashboard / Timesheet → "Edit Punches" | editing/deleting existing punches → 0 rows (only add worked) | Manager-only; employees get a **Request Correction** button instead |
| Missing Shift banner → resolve | `useResolveException` UPDATE → 0 rows, banner never cleared | Employee UPDATE policy on `attendance_exceptions` (status/reason/resolution only); verified resolves |
| Attendance → delete day off / review tardy | DELETE / UPDATE → 0 rows | Manager-only controls |
| Settings → payroll settings, closures | employee upserts silently failed | Manager-only; closures shown read-only to employees |

## Integrity tightening (so self-serve can't become a hole)

- **Guard triggers** on `time_entries`, `tardies`, `attendance_exceptions`: for a non-admin
  `authenticated` caller, any change to a payroll-relevant column (totals, minutes-late,
  approval status, dates, identity) raises an exception. Admin and SECURITY-DEFINER recompute
  bypass via a `current_user <> 'authenticated'` check — verified the recompute trigger still
  owns `total_minutes` (test #2).
- **Attendance-computation inputs made read-only for employees**: `work_schedule`,
  `schedule_versions`, `schedule_weekdays`, `office_closures`, `payroll_settings`,
  `payroll_summaries` — an employee can no longer alter the schedule/closure/settings their own
  tardiness and absences are judged against. (Previously these had `Own ... ALL` policies.)
- **Office closures now apply org-wide** in `recompute_attendance_range` (STEP 2): a closure an
  admin creates for the practice counts for every employee, so staff no longer need a personal
  copy of the holiday list — and can't, since writes are now admin-only. Employees get org-wide
  **read**.
- **`org_members` admin visibility**: employees can see active owner/manager rows so the
  correction/PTO/change-request flows can look up who to notify. Without this the notify step
  found no managers and silently sent nothing.

All schema changes applied live via the Lovable MCP and mirrored in
`supabase/migrations/20260720144829_*.sql`.

## Live verification (disposable employee account, then removed)

**`scripts/verify-employee-flows.ts` — 20/20 PASS** through the real API:
clock in/out; trigger-owned `total_minutes`; remote toggle; daily comment; missing-shift
create+resolve; tardy reason; submit correction request; notify admin; read org-wide closure —
all allowed. Change `total_minutes` / reduce `minutes_late` / self-approve tardy / write
schedule / write closure / write payroll settings / forge payroll summary — all blocked.

**`scripts/verify-rls.ts` re-run — 14/14 PASS**: the append-only guarantees from the first pass
still hold (punch UPDATE/DELETE dead, cross-employee isolation intact); `time_entries` UPDATE now
returns the guard-trigger error instead of 0 rows, which is the intended tightening.

DB row counts confirmed back to baseline after cleanup; only the real owner's data remains.

## Files changed in this pass

- `supabase/migrations/20260720144829_*.sql` — employee UPDATE policies + guard triggers,
  read-only attendance inputs, org-wide closures in recompute, org-admin visibility
- `src/pages/Dashboard.tsx` — employees get Request Correction (not punch edit); schedule link manager-only
- `src/pages/Timesheet.tsx` — punch editor manager-only; tardy auto-detect only INSERTs
- `src/pages/DaysOff.tsx` — delete-day-off & tardy-review manager-only; Eastern time display fix
- `src/pages/Settings.tsx` — payroll settings & closure management manager-only, read-only calendar for employees
- `scripts/verify-employee-flows.ts` — repeatable employee-experience test

Verification: `npx vitest run` (29/29), `npx tsc -p tsconfig.app.json --noEmit` (clean),
`npx vite build` (succeeds).

---

# FOF / Email / Docs Pass — 2026-07-23

Adversarial review of the July 22–23 push — the FOF builder + fee schedules, the office
knowledge base + Ask AI, the email infrastructure, and the new AI edge functions — before
regular front-desk use. Focus areas: the **HIPAA boundary** (no BAA — patient data must never
leave the browser), **money math**, **RLS on the new tables**, and the **new edge functions**.
Unlike the earlier passes, no SQL was run against the live DB from this session: every schema
fix is a migration in this commit (`20260723170000_fof_security_review.sql`) and takes effect
when this branch merges and Lovable applies it.

## Verdict

The FOF money engine held up — every adversarial case tried against `compute`/`insurance`/
`discounts`/`visits` matched the documented policy, and the printed sheet is pure props→JSX
with exactly one network call on the page. The gaps were around the edges: **one real
HIPAA-boundary hole** (staff-typed text could reach the AI provider despite a commit claiming
otherwise), an effectively **unauthenticated AI relay**, **two RLS posture deviations**, and
**three email-pipeline defects** — including the suppression list never being consulted before
a send. All fixed in this commit; structural items that need a deliberate decision are flagged
as open items.

## Findings & fixes

| # | Severity | Gap found | Fix applied |
|---|---|---|---|
| F1 | High | **Staff-typed text reached the AI (HIPAA).** `FofBuilder.aiNamePayments` sent `l.description` (typed text, *preferred* over the friendly CDT name) as the `procedures` payload, and custom codes leaked typed descriptions into the "auto" slot labels too. Commit `85543bc` ("AI never sees typed text") had only fixed the *label-override* vector. A description like "Crown for Jane D…" would have gone to the non-BAA Gemini gateway. | AI payload is now built by `src/lib/fof/ai.ts` **from CDT codes only** (friendly name, else the bare code; code-less lines dropped) — de-identified by construction, with no description input to leak. Slot labels are rebuilt from parallel code-derived `safeLabel`s (same schedule structure, safe wording). Regression-tested in `src/test/fof-ai.test.ts` |
| F2 | High | **`name-visits` was an authenticated-by-omission AI relay.** Absent from `config.toml` (implicit `verify_jwt`), zero in-code auth, no org check, unbounded caller-controlled prompt strings — any valid JWT (including the anon key) could drain AI credits and push arbitrary text to the gateway. | `getUser()` + active `org_members` check (same posture as `ask-docs`/`ingest-doc`), explicit `verify_jwt = true` in `config.toml`, every input normalized and hard-capped (12 slots/visits, 12 procedures/visit, 80 chars per label) |
| F3 | Med | **`fof_settings` / `fof_templates` were member-writable** while every other config table is member-read/admin-write: any employee could change the practice identity and the discount rules (percentages, membership/senior flags) their FOFs compute from. | Policies switched to `is_org_admin` manage + member read (migration). `FofTemplates` page is read-only for employees; `useFofTemplates`/`useFofSettings` no longer attempt first-use seeding as an employee (in-memory factory defaults instead — no silent failures, no broken builder) |
| F4 | Med | **4 email queue RPCs are SECURITY DEFINER with no pinned `search_path`** (`enqueue_email`, `read_email_batch`, `delete_email`, `move_to_dlq`) — violates the established posture. Mitigated in practice: calls are schema-qualified and EXECUTE is service_role-only. | `ALTER FUNCTION … SET search_path = public` for all four (migration) |
| F5 | Med | **Suppression list never consulted.** `suppressed_emails` is written (append-only, well-designed) but the send path never read it — bounced/complained/unsubscribed recipients kept receiving mail. | `process-email-queue` checks suppression (case-insensitive) before every send; suppressed sends are logged with status `suppressed` and dropped from the queue |
| F6 | Med | **The queue processor's service-role gate decoded JWT claims without verifying the signature** — safe only while `verify_jwt=true` holds; one config regression away from a forged `role:service_role` bypass into full service-role queue processing. | In-code gate now does a constant-time (SHA-256) comparison of the bearer token against the service-role key itself — no trust in unverified claims |
| F7 | Med | *(discovered)* **`email_send_log`'s CHECK constraint rejected `rate_limited`**, the status the processor logs on 429s — the insert failed silently and rate-limited attempts were never recorded. | Constraint widened to include `rate_limited` (migration) |
| F8 | Low | **Cross-org schedule references possible.** RLS on `fee_schedule_items`/`insurance_plans` checks only the row's own `org_id`; an admin knowing another org's schedule UUID could attach rows to it. No data disclosure, but unenforced org consistency. | Composite FKs `(schedule_id/fee_schedule_id, org_id) → fee_schedules(id, org_id)` (migration; `SET NULL` scoped to the pointer column) |
| F9 | Low | **`ingest-doc` decoded unbounded base64 before its 8 MB check** (memory exhaustion before the guard fires); several 5xx responses returned raw Postgres/storage error text. | `content-length` + base64 string-length guards *before* decode; internal 5xx details moved to logs, generic messages returned (`ask-docs` catch too — 4xx messages stay specific) |
| F10 | Low | **A table-of-allowance pay schedule could make `workup` covered.** `fixedPayCents` bypassed the category percentage, so a carrier schedule listing D0367 would pay on a work-up line, contradicting "never insurance-covered". | `estimateInsurance` excludes `workup` from coverage unconditionally; tested both ways |
| F11 | Info | `auth-email-hook` logged full recipient addresses on every auth event; the Ask AI chat gave no hint that questions leave the building. | Log lines mask the address (`j***@domain`); chat panel now says answers come from an external AI service — never include a patient's name or details |

## Verified good (on the record)

- **RLS**: every new table (`fof_*`, `fee_*`, `insurance_plans`, `office_doc*`, email tables) has
  RLS enabled with org-scoped policies — no `USING (true)`, no policy-less lockouts, no grants to
  anon/authenticated. `is_org_member`/`is_org_admin` remain SECURITY DEFINER with pinned path.
- **`search_office_doc_chunks`** is SECURITY INVOKER + pinned path with parameterized
  `websearch_to_tsquery` — caller RLS applies to full-text search; no cross-org read, no injection.
- **`office-docs` bucket** is private and org-foldered (admin write / member read, UUID-cast
  folder check fails closed). `ingest-doc` derives `org_id` server-side, requires owner/manager,
  and sanitizes filenames against traversal.
- **`ask-docs`** runs under the caller's JWT via the anon key — RLS scopes retrieval; no client
  `org_id` is trusted anywhere in the new functions.
- **Email infra**: queue RPCs EXECUTE-locked to service_role; suppression table append-only;
  duplicate-send guard backed by the partial unique index; webhook signature + timestamp
  verification precedes any service-role write; React Email escaping blocks HTML/URL injection
  in templates.
- **MCP function**: OAuth issuer/audience pinned, per-tool auth checks, publishable key + user
  token so RLS scopes every read; read-only tools, no PHI.
- **Money math** (now 144 tests): the Illumitrac senior prepay is a true 15% off one base;
  `splitCents` (remainder-last, office convention) and `splitCentsWeighted` (remainder-first,
  front-loaded) always sum exactly; `buildVisitSchedule` sums exactly to the portion in every
  branch — workup-first visits, due-at-visit scaling under partial insurance, single-visit
  half/half — and every visit is fully paid before it happens; benefit-year renewal switches at
  the flagged visit and year-1 lines can't borrow ahead.
- **Print path**: `FofPrintSheet` is pure props → JSX (no hooks/fetching); printing is
  `window.print()` straight to the OS dialog; FOF toasts carry no patient data; the fee import
  parses spreadsheets entirely in the browser.

## Open items (non-blocking, flagged)

1. **One secret spans trust boundaries.** `LOVABLE_API_KEY` authenticates the AI gateway, the
   outbound email sends, the auth-email webhook *signature*, and the hook's preview endpoint. A
   leak from any of five functions would let an attacker forge auth-email webhooks — phishing
   from the practice's real sending domain. Recommend a dedicated webhook secret (env-preferred
   lookup); needs a Supabase secret set deliberately, so not changed in this commit.
2. **Ask AI invites patient-scenario questions** and forwards them (plus chat history) verbatim
   to the non-BAA provider. The new UI reminder mitigates; a server-side identifier scrub — or a
   BAA — is the real fix if usage grows.
3. **`parse-pdf` sends employee time data** (names, hours) to the same non-BAA provider and
   stores the model output. Employee PII, not PHI; core to the import feature; stated here so
   it's a decision, not an accident.
4. `ingest-doc` resolves membership with `.limit(1)` — a multi-org admin ingests into an
   arbitrary org. Harmless for a single-org practice; fix before ever adding a second org.
5. The email **cron job + vault secret + `net.http_post`** are applied out-of-band via the
   Management API and can't be reviewed from the repo — verify them against the live DB in the
   next Lovable session.
6. **Deployed code lags this branch**: the live functions and DB run pre-review code until merge,
   when Lovable applies `20260723170000_*` and redeploys. Smoke-test after merge: one AI naming
   call as an employee, one doc upload, one auth email to a suppressed address.

## Files changed in this pass

- `src/lib/fof/ai.ts` *(new)* — de-identified name-visits payload builder
- `src/pages/FofBuilder.tsx` — AI call rebuilt on codes + safeLabels; visitWork carries safe labels
- `src/lib/fof/insurance.ts` — workup never covered, fixed-pay included
- `src/pages/FofTemplates.tsx` — manager-only editing, read-only for employees
- `src/hooks/useFofTemplates.ts` — admin-only seeding with in-memory defaults for employees
- `src/pages/Assistant.tsx` — external-AI reminder under the chat input
- `supabase/functions/name-visits/index.ts` — auth + membership + input caps
- `supabase/functions/process-email-queue/index.ts` — suppression check, key-match service gate
- `supabase/functions/auth-email-hook/index.ts` — masked recipient logs
- `supabase/functions/ingest-doc/index.ts` — pre-decode size guards, generic 5xx
- `supabase/functions/ask-docs/index.ts` — generic 5xx
- `supabase/config.toml` — `name-visits` declared `verify_jwt = true`
- `supabase/migrations/20260723170000_fof_security_review.sql` — F3/F4/F7/F8
- `src/test/fof-ai.test.ts` *(new)*, `src/test/fof-insurance.test.ts`, `src/test/fof-visits.test.ts` — 8 new tests

Verification: `npx vitest run` (144/144), `npx tsc -p tsconfig.app.json --noEmit` (clean),
`npx vite build` (succeeds).
