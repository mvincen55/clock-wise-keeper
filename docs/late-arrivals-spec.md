# Late arrivals without the busywork

Status: **built** (migration `20260928120000_late_arrival_workflow.sql`; not yet
applied live at the time of writing — see Deployment).

## Purpose

A late arrival used to demand an explanation from the employee, open a
per-tardy follow-up item for a manager, and — three times over — a signed
accountability record from a daily scan. The office wanted fewer manager tasks
with the same clarity of record and a real, meaningful follow-through when a
pattern forms. This slice does that.

## The three answers to "you were late"

The attendance engine writes the fact (a `tardies` row: scheduled start, actual
start, minutes past the office grace period). The employee sees it on the
Timesheet and on Workplace → Attendance and answers it one of three ways:

| Answer | What is recorded | Who is involved |
|---|---|---|
| **Acknowledge as unexcused** | `acknowledged_at`, `acknowledged_by` (server-stamped) | nobody else |
| **Request excused** | a short explanation (`reason_text`), `excuse_requested_at`; the row reads *Excuse requested: pending review* | a manager decides |
| **Report incorrect time** | the existing correction request | a manager fixes the punches; a corrected time removes the late arrival |

Closing the prompt records nothing and erases nothing; the prompt comes back.

Acknowledgment and excuse status are separate columns. Acknowledgment is a
receipt, not a gate: an unacknowledged late arrival counts exactly like an
acknowledged one.

## Excuse requests

`request_tardy_excuse()` files the request; the row becomes a **Decide** item in
Attention at once (`excuse_request:<tardy id>`) and the office's managers are
notified. The item shows the person, the date, the scheduled and actual
arrival, the minutes late, and the explanation, with **Approve excuse** and
**Decline excuse**. `decide_tardy_excuse()` records the decision (excused =
`approved`, unexcused = `unapproved`), an optional note, who decided and when;
the employee is notified and the item leaves the queue because the record
changed. A manager can also decide any late arrival at any time from Team
Attendance. Nobody decides their own late arrival, whatever their role — the
function refuses the subject and the guard trigger refuses the edit.

Routine unexcused lateness creates no manager task at all.

## The rule

The office's existing late-arrival rule (`escalation_policies`, kind
`tardy_threshold`) holds the two numbers: **how many** unexcused late arrivals
within a **rolling window of days**. Default 3 in 30; both editable on Office
settings → Attendance; explained in the same words to employees (Attendance →
Late arrivals) and managers (the settings card). The grace period and the
schedules are untouched.

What counts (`late_arrival_counts()`, mirrored by `countsTowardThreshold` in
`src/lib/late-arrivals.ts`):

- minutes past grace on a trusted clock (`timezone_suspect = false`), not
  corrected away (`resolved = false`);
- not excused (`approval_status <> 'approved'`);
- not a pending request (`approval_status = 'unreviewed'` with
  `excuse_requested_at` set waits for the decision; a declined request counts
  from the decision).

Evaluation is automatic: a trigger on `tardies` runs
`evaluate_late_arrival_threshold()` for the person whenever a late arrival, a
decision, a request, or a correction lands; a trigger on the rule re-checks
everyone when the numbers change. Nothing depends on a button. The window
slides over the person's unconsumed qualifying dates (office-local entry
dates), so day 1 and day 30 share a 30-day window and day 1 and day 31 never
do.

## Crossing the rule

The first date whose trailing window meets the count opens **one** attendance
incident report in the existing `incident_reports` table (category
`attendance`, status **Meeting required**), visible at once to the team member
(their own record) and to the responsible managers (an Attention item, **Meet
with team member**, plus a notification). It carries the employee, the rule
that triggered it, the period, every qualifying late arrival with its date and
minutes (linked to the attendance records in `attendance_incident_events`),
the total occurrences and minutes, and a neutral summary. It documents the
threshold crossing; it imposes nothing.

A report about a manager or an owner is routed to an owner (the incident
countersign rule).

## Closing the report

`meeting_required → meeting_completed → awaiting_signatures → closed`

1. A manager (never the subject) records the meeting: date, a brief
   discussion summary, agreed next steps. The team member is asked to read and
   sign.
2. The team member may add their own comment at any time before closure.
3. Both sign, in either order, through the existing incident sign functions
   (refused before the meeting is on record). Signer identity and timestamps
   are server-stamped; nobody signs for anyone else; nothing signs
   automatically. The employee's signature confirms the discussion and receipt,
   not agreement with every statement.
4. The second signature closes the report (`closed_at`).

Each person sees what is still outstanding and which steps are theirs. The
report stays open and visible until every step is done.

Signed content is preserved: recording the meeting again, or changing the
comment after a signature, is an amendment (`incident_report_amendments`: who,
when, why, before and after) that clears both signatures so they are given
again over the amended wording. Direct edits and deletes of an attendance
report are refused; nobody files one by hand.

## No duplicate work

- One report per crossing: a date linked to a report never counts again
  (`UNIQUE (user_id, entry_date)` on the link table).
- While a report is open, later qualifying arrivals attach to it as follow-ups
  — no second report, no repeated alert, no change to the signed facts.
- After closure, a new report needs a fresh qualifying set inside the window.
- Events already covered by a legacy accountability record never open a second
  workflow, and the `accountability-engine` scan no longer opens late-arrival
  records (open legacy records still finish through `sweep`).
- The old per-tardy Attention items and the mandatory reason prompt are gone
  from every surface.

## Corrections

The engine keeps an acknowledged, requested, or decided late arrival that a
correction made on time and marks it `resolved`; an untouched one is withdrawn.
Neither counts.

## Enabling without a backlog

The migration adds columns, backfills history in place (an explanation waiting
on a manager becomes a pending request; a decision stays a decision), seeds the
rule for every office, and creates the triggers — it evaluates nobody, so no
incidents appear from historical data. Reports open only as new records land.

## Deployment (GitHub merges deploy nothing in this repo)

1. Apply `20260928120000_late_arrival_workflow.sql`.
2. Deploy `accountability-engine` (it no longer opens late-arrival records)
   and `_shared/office-knowledge.ts` consumers (`kimi-agent`, `office-ai-chat`)
   if the office AI should describe the new rule.
3. Publish the frontend. Until Lovable regenerates
   `src/integrations/supabase/types.ts` from the live database, the new
   columns, tables, and functions are declared in
   `src/integrations/supabase/pending-schema.ts`; delete those entries once the
   types are regenerated.
4. The release gate replays `supabase/tests/late_arrival_probes.sql`; it can
   also be run by hand in the SQL editor (one transaction, rolled back).

## Manual acceptance scenarios

1. Arrive late once. Confirm the Timesheet offers acknowledge / request
   excused / report incorrect time, that closing the prompt changes nothing,
   and that acknowledging needs no reason and creates no manager item.
2. Request an excuse. Confirm the Attention Decide item appears at once with
   the date, times, minutes, and explanation; approve it and confirm the
   employee is told, the item leaves, and the arrival reads Excused.
3. Decline a different request. Confirm it reads Unexcused and counts.
4. Reach the office rule (three unexcused inside the window, one of them
   unacknowledged). Confirm one report opens with status Meeting required,
   visible to the team member and in the manager's Attention as Meet with team
   member, with every date and the totals.
5. Arrive late again while it is open. Confirm it attaches as a follow-up and
   no second report or alert appears.
6. Try to sign before the meeting is recorded (both people). Confirm both are
   refused. Record the meeting as a manager; confirm the subject cannot.
7. Add a team member comment; sign as each person; confirm the second
   signature closes the report and both stamps show who and when.
8. Amend the meeting record. Confirm the amendment is logged and both
   signatures must be given again.
9. After closure, arrive late once. Confirm no new report; a fresh set of three
   opens the next one without the old dates.
10. Correct a late clock-in to on time. Confirm the late arrival no longer
    counts (kept as resolved if it had been acknowledged or requested).
11. Change the rule to 2 in 14. Confirm the explanation updates for employees
    and that anyone already over the new rule gets one report.
