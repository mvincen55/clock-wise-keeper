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
root. All print sheets (FOF, Deposit Log, Incident Report, Goals Report) are covered
by print-invariant snapshot tests — run `npm run test` before merging.

## 8. Checklist data questions / building on checklists

Exact model in README §Checklist data model and migration
`20260723200000_checklists.sql`. The traps:

- `period_key` is **Eastern-local**, formats differ per cadence
  (`YYYY-MM-DD` / `week-YYYY-MM-DD` Monday / `YYYY-MM` / `YYYY`). Don't invent new
  formats; `useChecklists.ts` already computes them.
- `per_person = false` items are one shared checkbox — "did the team do X" ≠ "did
  this member do X". The bypass feature (clock-out gate) reasons about
  **per-person daily items for that member**, not shared items.
- Checklist titles are business data only — never patient info (migration header).

## 9. Clock-in/out, PTO, or schedule bugs

- Time data: `useTimeEntries`, `useWorkSchedule`, `useEmployeeSchedules`,
  `usePtoEngine` (accrual logic lives here — change it carefully, balances derive
  from it). Clock-out with the checklist gate: `useGuardedClockAction` wraps
  `useClockAction` and opens `ChecklistBypassDialog` first.
- Location-verified clock-in: `useGeoTracking` + `process-location-event` +
  `LocationStatusPanel`; zones are managed at `/work-zones`.
- Tardiness has its own objects (`useTardies`, `TardyReasonModal`) — don't fold it
  into punch editing.

## 10. AI features misbehaving

- Assistant taught something wrong → it should be held `pending` by the
  contradiction guard and surfaced on Assistant → Memory & Audit. If a contradicting
  "fact" went live, that guard failed — check `assistant_memories` statuses.
- Auditor re-reporting dismissed findings → fingerprints are stored; the dedupe is
  deliberate. Don't "fix" re-reports by deleting findings; fix the fingerprint.
- **HIPAA tripwire:** staff free text must never reach the AI gateway. The invariant
  is `safeProcedureLabel` (derived from CDT codes only, no overrides argument) and
  it's asserted in tests. If you're tempted to pass overrides into AI context, stop.

## 11. A page shows an OLD version after work shipped

Diagnosed 2026-07-30 (Goals page): the repo had the new code all along — the
"overwriting" was a serving problem, not a code problem. Check in this order:

1. **Verify what's actually committed** (GitHub → the page file). If the repo has
   the new code, the code was never the problem — stop looking at code.
2. **Was the site Published?** Lovable's preview reflects code; the live site
   (`purpleenvelope.app`) only updates on **Share → Publish**. During sprint
   sessions this is the usual cause.
3. **Stale client / PWA cache.** `vite.config.ts` ships
   `VitePWA({ selfDestroying: true })` — a replacement worker that unregisters the
   old one, clears caches, and reloads. A stale client **heals itself on its next
   visit after a publish**; if a device still shows old after that, clear site data
   once (browser settings → site data) and it will never recur.
4. **Lovable snapshot churn.** Multiple chat threads or checkpoint Restores commit
   older snapshots over newer code ("Work in progress" commits). Rules: ONE chat
   thread per feature sprint, never Restore mid-sprint. If code actually reverted,
   re-send the consolidation spec (for /goals: Prompt 10 in
   `docs/goals-and-bypass-spec.md`).

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
- [ ] "It looks old on my phone" → §11 BEFORE touching code.
