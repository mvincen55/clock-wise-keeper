# Runbook — when a flow breaks

For whoever (human or AI) is debugging: read `README.md` first. This file is the
"symptom → where to look → how to verify" map. Every section ends with a probe you
can run from any shell. The anon key is public (in `.env`) — probing with it is safe
and changes nothing.

Supabase project: `lfiplzmxpmybtbzhmnkp` · Site: `https://purpleenvelope.app`

```bash
# Set once for all probes:
export SUPA="https://lfiplzmxpmybtbzhmnkp.supabase.co"
export ANON="<VITE_SUPABASE_PUBLISHABLE_KEY from .env>"
```

---

## 1. "Failed to send a request to the Edge Function" (any feature)

Nine times out of ten the function **isn't deployed** — code reached GitHub without
going through Lovable, and GitHub pushes do not deploy edge functions.

```bash
curl -s -w "\nHTTP %{http_code}\n" -X POST "$SUPA/functions/v1/<function-name>" \
  -H "apikey: $ANON" -H "Content-Type: application/json" -d '{}'
```

- `404 {"code":"NOT_FOUND","message":"Requested function was not found"}` → **not deployed.**
  Deploy it: prompt Lovable ("deploy the `<name>` edge function"), or paste
  `supabase/functions/<name>/index.ts` into a new function in the Supabase dashboard
  (match the `verify_jwt` value in `supabase/config.toml`), or
  `supabase functions deploy <name> --project-ref lfiplzmxpmybtbzhmnkp`.
- `401` → deployed, JWT rejected (expected for `verify_jwt = true` functions called
  without a session — that means it's alive).
- `400`/`403` with a JSON error message → deployed and executing; read the message.

## 2. Invite email never arrives

Walk the pipeline in order — each step has exactly one place it can die:

1. **Did the invite row get created?** If the inviter saw a warning toast
   ("share the link manually"), the invite exists but email prep/enqueue failed —
   the response still contains `link`; use it, then debug email.
2. **`email_send_log`** (Supabase dashboard → Table Editor): find the row by
   `recipient_email`.
   - No row → `send-org-invite` died before logging (see §1, check function logs).
   - `pending` for a long time → dispatcher problem (§3).
   - `failed` / `rate_limited` / `dlq` / `suppressed` → read `error_message`;
     `suppressed` means the address unsubscribed or was suppressed — remove from
     the suppression list only with the recipient's request.
   - `sent` → email left us; check spam, then sender-domain reputation.
3. **Function logs** (dashboard → Edge Functions → `send-org-invite` → Logs):
   recipient addresses are masked (`j***@gmail.com`) on purpose — correlate via
   `email_send_log`, not by grepping for the full address.
4. **Known-good end-to-end test:** invite a Gmail alias (`you+test@gmail.com`),
   accept in an incognito window.

## 3. NO email of any kind sends (invites, password resets, everything)

The whole system shares two single points of failure:

1. **Is the `process-email-queue` cron running?** Dashboard → Edge Functions →
   `process-email-queue` / project cron. If the schedule is gone, recreate it.
   Queues accumulate silently while it's down — after restart, watch
   `email_send_log` for the backlog to drain.
2. **Is the sender domain verified?** `notify.purpleenvelope.app` needs SPF + DKIM
   records from Lovable's email settings, and the domain must show verified there.
   DNS changes or a lapsed verification silently break sending.

Also check: dispatcher logs (dashboard → `process-email-queue` → Logs) for
`sendLovableEmail` errors, and the DLQ for repeated failures against one message.

## 4. Signup confirmation / password reset emails don't arrive

These go through the **auth pipeline**, not `send-org-invite`:

Supabase Auth → auth hook → `auth-email-hook` (renders template, enqueues to
`auth_emails`) → `process-email-queue`.

1. Dashboard → Authentication → check the **Send email hook** still points at
   `auth-email-hook`.
2. `auth-email-hook` logs: `Invalid webhook signature` means `LOVABLE_API_KEY`
   drifted — re-set the function secret.
3. Then §3 (cron + sender domain) — the auth queue shares both.
4. Template previews: `POST $SUPA/functions/v1/auth-email-hook/preview` with
   `Authorization: Bearer $LOVABLE_API_KEY` and `{"type": "recovery"}`.

## 5. A real person can't get in / gets signed out immediately

The allowlist gate: `useAuth` calls `is_allowed_user()` and signs out anyone not in
`allowed_users`. This is *intended* — Supabase signup is open at the instance level.

- Invited user bounced on first login → check `allowed_users` has their email
  **lowercased**. `send-org-invite` and `accept-invite` both insert it; if a row is
  missing (older invite, manual account), insert it from the dashboard.
- **Never** "fix" this by disabling the allowlist check — that opens the app to
  anyone who registers.

## 6. 500 errors mentioning `allowed_users` / `infinite recursion` (42P17)

Known open bug: an RLS policy on `allowed_users` references `allowed_users`
recursively. The app is unaffected (it goes through the SECURITY DEFINER
`is_allowed_user()`), but direct queries with a user role can 500.
Fix direction: replace the self-referencing policy with one that calls a SECURITY
DEFINER helper (same pattern as `is_org_member`). Test by selecting from
`allowed_users` as an authenticated non-service user.

## 7. Printed output from a dialog shows the dialog itself

Radix portals dialogs/popovers to `<body>` as **siblings** of `#root`. Print CSS that
only hides `#root` will print the dialog (this was the incident-report bug,
`225b37f`). The rule: under `@media print`, hide every body child except the print
root. All three print sheets (FOF, Deposit Log, Incident Report) are covered by
print-invariant snapshot tests — run `npm run test` before merging.

## 8. Checklist data questions / building on checklists

Exact model in README §Checklist data model and migration
`20260723200000_checklists.sql`. The traps:

- `period_key` is **Eastern-local**, formats differ per cadence
  (`YYYY-MM-DD` / `week-YYYY-MM-DD` Monday / `YYYY-MM` / `YYYY`). Don't invent new
  formats; `useChecklists.ts` already computes them.
- `per_person = false` items are one shared checkbox — "did the team do X" ≠ "did
  this member do X". The planned bypass feature (clock-out gate) must reason about
  **per-person daily items for that member**, not shared items.
- Checklist titles are business data only — never patient info (migration header).

## 9. Clock-in/out, PTO, or schedule bugs

- Time data: `useTimeEntries`, `useWorkSchedule`, `useEmployeeSchedules`,
  `usePtoEngine` (accrual logic lives here — change it carefully, balances derive
  from it).
- Location-verified clock-in: `useGeoTracking` + `process-location-event` +
  `LocationStatusPanel`; zones are managed at `/work-zones`.
- Late arrivals have their own objects (`useTardies`, `LateArrivalPrompt`,
  `LateArrivalReviewModal`, `src/lib/late-arrivals.ts`) — don't fold them into
  punch editing. See §11 for the threshold and the attendance report.
- Someone reads as absent who never punches (a doctor on Team for the schedule
  reader): their roster record should say so. Owners are off the clock by role
  (`roleClocksIn`); anyone else by `employees.clocks_in = false`, set from the
  card's "Time clock and PTO" block (`set_employee_work_arrangement`, audited).
  Every attendance surface filters on both through `src/lib/clocking.ts`; the
  Reports Analyst skips their attendance days but keeps their schedule captures.
  `employees.pto_eligible = false` hides PTO for them the same way.
- A treating provider whose schedule code (DR05) equals exactly one active team
  member's staff code is linked to that member by the database
  (`employee_for_schedule_code`, triggers on `org_providers.schedule_code` and
  `employees.tag`), so captures file under the right person without a second
  pick in the registry. An explicit "Not linked" holds until either code changes.
- Employee schedules: a version (`schedule_versions` + `schedule_weekdays`) is what
  attendance follows; its assignment (`schedule_assignments`) must mirror the
  version's dates. New schedules go through `create_employee_schedule`, in-place
  corrections through `correct_employee_schedule` (one transaction: version,
  weekdays, assignment, `schedule_correction_log`; an overlap is refused before any
  write and names the other schedule's dates; a drifted or missing assignment is
  repaired). The Team page lists versions, including one without an assignment, so
  nothing collides invisibly. Probes: `supabase/tests/employee_schedule_probes.sql`.

## 10. AI features misbehaving

- **Record analyst shows zero:** its `preview` action on `reports-analyst` returns
  evidence version 2, included counts by source, and coverage warnings without
  making an AI call. The analyst reads attendance days (time rows enriched with
  attendance status), days off, attendance exceptions, office checklist
  completions/bypasses, and formal accountability reports. A zero formal-report
  count does not imply zero attendance. Check the date/source filters. The
  default range is the last 30 calendar days; clear or widen it for older data.
  Employee detail retains the selected employee boundary. Personal checklist
  items/lists are excluded. Source errors must surface as errors, never as zero.
  Deploy both `reports-analyst` and its `_shared/analyst-evidence.ts` dependency
  before publishing the frontend. Since 2026-09-22 the evidence also reads
  `punches`, `provider_day_metrics` (the schedule beside the clock: first
  patient, last patient left, a provider's own column), and the practice time
  zone; the four observed-day columns come from migration
  `20260922180000_provider_observed_day.sql`, which must be applied before a
  capture is saved with the new frontend.
  `analyst-evidence.test.ts`, `reports-analyst-edge.test.ts`, and
  `reports-analyst.test.tsx` cover authorization, source scoping,
  day-off context, period overlap, citation preservation, and loading/error states.

- Assistant taught something wrong → it should be held `pending` by the
  contradiction guard and surfaced on Assistant → Memory & Audit. If a contradicting
  "fact" went live, that guard failed — check `assistant_memories` statuses.
- Auditor re-reporting dismissed findings → fingerprints are stored; the dedupe is
  deliberate. Don't "fix" re-reports by deleting findings; fix the fingerprint.
- **HIPAA tripwire:** staff free text must never reach the AI gateway. The invariant
  is `safeProcedureLabel` (derived from CDT codes only, no overrides argument) and
  it's asserted in tests. If you're tempted to pass overrides into AI context, stop.

## 11. Late arrivals, excuse requests, and attendance incident reports

Design: README §Late arrivals and `docs/late-arrivals-spec.md`. Everything is
in the database (`20260928120000_late_arrival_workflow.sql`); the app only
calls functions and reads rows.

- **The prompt keeps coming back / "nothing to acknowledge":** the prompt
  shows only for a live, undecided, unrequested, unacknowledged row
  (`awaitsEmployeeAnswer`). Check the `tardies` row: `acknowledged_at`,
  `excuse_requested_at`, `approval_status`, `resolved`, `timezone_suspect`.
- **An excuse request did not reach the manager:** the queue is derived from
  `tardies` where `approval_status = 'unreviewed' AND excuse_requested_at IS
  NOT NULL` (Attention kind `excuse_request`); the managers' notifications
  are `tardy_excuse_requested`. A request on a day a correction has since
  made on time is `resolved` and is not an item.
- **"You cannot decide your own late arrival" / 42501:** intended — nobody
  decides their own row, whatever their role. Another admin decides it.
- **No report opened after three late arrivals:** run the predicate on the
  rows — `SELECT entry_date, public.late_arrival_counts(t) FROM public.tardies t
  WHERE user_id = '<uid>'` — then check `attendance_incident_events` for dates
  already linked (a linked date never counts again) and legacy
  `accountability_reports.facts->'events'` for the same dates. The rule row:
  `SELECT * FROM public.escalation_policies WHERE kind = 'tardy_threshold'`
  (`is_active`, count, window). Evaluation runs from the trigger on
  `tardies`; `SELECT public.evaluate_late_arrival_threshold('<org>', '<uid>')`
  as postgres re-runs it by hand and is idempotent.
- **A second report for the same dates:** cannot happen while one is open
  (partial unique index on open attendance reports per employee; later
  arrivals attach as `follow_up`). After closure, only a fresh set of
  unlinked dates inside the window opens the next one.
- **Signing refused:** the meeting must be on record first
  (`meeting_recorded_at`); the subject signs as employee, an owner/manager
  countersigns (an owner for a manager's report); a closed report signs
  nothing. Amendments (`incident_report_amendments`) clear both signatures.
- **Direct UPDATE/DELETE on an attendance report is refused:** by design;
  use `record_attendance_meeting`, `comment_attendance_report`, and the sign
  functions.
- **Probes:** `supabase/tests/late_arrival_probes.sql` in a disposable
  database (the release gate replays it on every migration change).

---

## Change-checklist for any agent editing this repo

- [ ] New table → `org_id` + RLS policies using `is_org_member` / `is_org_admin`.
- [ ] New edge function → `[functions.<name>]` entry in `supabase/config.toml`,
      and it must actually be **deployed** (§1) before you tell the user it works.
- [ ] New email → enqueue via `enqueue_email` RPC (never send inline), log to
      `email_send_log` first, mask addresses in logs.
- [ ] Anything printable → run the snapshot tests.
- [ ] Anything AI → re-read README §HIPAA boundary.
- [ ] Org scoping → derive from `org_members` server-side; never trust
      client-supplied `org_id`.
