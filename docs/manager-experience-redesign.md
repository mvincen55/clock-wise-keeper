# Manager experience redesign

Status: design proposal (2026-09-21). Nothing in this document changes code by itself.
Companion: `docs/manager-experience-redesign/concepts.html` — interactive high-fidelity
concepts for every surface described here (open it in a browser; it runs on fixture data).

This is a product-architecture, information-architecture, interaction, and workflow
redesign of the manager experience. It is not a visual refresh. Every claim about the
current product below was verified against the code on `main` at the time of writing;
file references are given so the diagnosis can be checked.

---

## 0. The one-paragraph answer

A manager opens Purple Envelope and should see, in five seconds: *here is the office,
here are the few things that need me, everything else is okay.* Today that read is split
across two command centers (Home and Management), a dozen queues, and four renderings of
"who is here." The redesign gives every management fact **one place where it is managed**
and lets it **surface** anywhere: Home becomes the briefing, Management becomes the
workbench with four rooms (**Attention · People · Payroll · Office**), and every item in
every room deep-links into the same canonical editors the product already has. Nothing in
the attendance engine, schedules, PTO, approvals, reports, goals, checklists, FOF, Close
the Day, forms, training, employee records, settings, or permissions is rebuilt. What
changes is the experience architecture: which page owns what, how items are triaged, and
how the manager gets from a symptom to the fix and back.

---

## 1. Current-state diagnosis

### 1.1 Two command centers answer the same question

- **Home** (`src/components/dashboard/ManagerDashboard.tsx`) renders a pulse sentence, five
  fact tiles, three performance cards, "What I'd step into first", a consequence-ordered
  queue ("What needs your hands"), Close the Day status, a staffing roster, the office goal
  (a sprint), and the personal role lane. Below that, `src/pages/Dashboard.tsx` adds "The
  floor in detail" (messages closeout, doctor board, Today Focus, Rescope) and "My own
  work" (sprint card, accountability card, notes board), plus a missing-shift banner.
- **Management** (`src/pages/Management.tsx`) renders pending-approval counts, the
  accountability review queue, "Today's Team", practice vitals, and a ten-link
  Administration grid.

Both pages show approvals, staffing, vitals, and accountability. Home's queue row
"Records awaiting your review" links to `/management`, whose queue then links onward to
`/approvals`. The manager reads the same facts twice and still has to travel to a third
page to act. Management's own docblock says it "answers what needs management attention"
— in practice it is a directory with two live queues.

### 1.2 Attention is fragmented into per-type queues with different furniture

Every source of management attention has its own page, its own component, and often its
own deep-link vocabulary (survey of `src/lib/notification-routing.ts`, `src/hooks/useDeepLink.ts`):

| Source | Where the manager acts today | Reached from |
|---|---|---|
| PTO / correction / change requests | `/approvals`, three tabs, three components | Home row, Management card, bell |
| Accountability records | inline form on `/management` | Home row, bell |
| Checklist bypasses | **read-only** table at the bottom of `/team` | bell → `/team?bypass=`; Home row → `/checklists` (wrong page) |
| Policy acknowledgments | `/acknowledgments` | bell → `/acknowledgments`; Home row → `/playbook` (wrong page) |
| Missing / incomplete time | `/management/attendance` "Unreviewed items" | Home staffing row; Reports banner (no date or person) |
| Tardies | `/management/attendance` Tardies tab | nowhere else; never counted in approvals |
| Close the Day | `/deposit-log` | Home band; no notification type exists |
| Incident follow-up | `/incident-reports` | bell only; absent from Home and Management |
| Content awaiting approval | `/management/knowledge` | no notification, no queue, no count anywhere |
| Sprint verification | `SprintCard` on Home | bell → `/?sprint=`; "Office goal" band → `/goals`, which has no sprint UI |
| Training overdue (team) | `/training` Library card | Home row; bell routes to the manager's *own* tab |

Three follow-up types have **no manager action at all** (bypasses, nudges, knowledge
drafts). Two have contradictory destinations depending on whether you arrive from Home or
from the bell. The manager has to know where a feature lives before they can respond to it.

### 1.3 "Who is here?" is computed four ways and rendered three ways

- `attendance_day_status` (server), `src/lib/attendance-derive.ts` (fallback),
  `Timesheet.computeLateInfo` (client), and `src/components/dashboard/staffing.ts`
  (phase-aware) all decide absent/late/incomplete. `payroll-utils.detectDayIssue` adds a
  fifth notion of "missing".
- "Missing shift" has two non-equivalent definitions (`AttendanceWorkspace.isMissingShift`
  vs `useMissingShifts`).
- `OrgSnapshotPanel` ("Today's Team" on Management) and `ManagerDashboard` staffing read
  the same snapshot with different rules: the snapshot says *absent* at 7:00 AM for a
  person whose shift starts at 8:00; the dashboard says *Starts 8:00 AM*. Adjacent screens
  disagree.
- `attendance_exceptions` is user-scoped; there is no office-wide manager view, so the
  "Attendance Exceptions" report shows a manager their own exceptions only.

### 1.4 People management is scattered

Employee facts are managed from six or more places (`src/pages/Team.tsx`,
`src/components/TeamEmployeeCard.tsx`, `src/pages/EmployeeDetail.tsx`,
`src/components/attendance/AttendanceWorkspace.tsx`, `src/pages/OfficeCalendar.tsx`,
`src/pages/Settings.tsx`):

| Fact | Managed from |
|---|---|
| Work schedule | only the `ScheduleTab` inside `TeamEmployeeCard` on `/team`; `EmployeeDetail` has no schedule editor; legacy `work_schedule` is still read by Timesheet and `useMissingShifts` |
| Employment dates + PTO policy | the same `EmployeeSetupCard` hosted on both `/team` and `/team/:id` |
| Days off | six writers: Team Attendance, Office Calendar, missing-shift banner, PTO approval, PTO page, Employee Detail (read) |
| Roles / permissions | Settings → People, not the employee record |
| Worked-hour adjustments | created on `/team`, consumed silently in Reports totals |
| Bypass review | `/team`, under the roster |

`/team` is listed in Workplace ("employee and office life") but is manager-only, and it
mixes a directory (roster, invites, archived) with management records (attendance trend,
staff codes, bypasses). `EmployeeDetail` is a flat stack of nine cards with no hierarchy.

### 1.5 Payroll readiness is a warning banner, not a workflow

`src/pages/Reports.tsx` computes missing days and unpaired punches and shows a red banner
("N employees have missing or incomplete time") with a single plain link to
`/management/attendance` — no date, no person, so the attendance workspace's own deep-link
machinery goes unused. Pending corrections and PTO inside the period are not listed.
Tardies are never in the approval count. There is no "reviewed / ready" state for a
period. Report History is an unconnected system for externally prepared packages.

### 1.6 Configuration is a hub of hubs

`/settings` has four tabs; the Workflows tab is seven link-cards to other pages. Management
links to Settings, Reminders, Work Zones, Practice Setup, and Knowledge. Playbook carries
manager-only Form Templates and Fee Schedule doors. Surprises found in the survey:
`PtoPolicySettingsCard` sits in the org tab but writes a per-user row; office performance
targets live in `PracticeSettingsCard`; the *personal* reminder preference is listed on
Management as "Automated reminder rules"; two unrelated privacy timeouts live on two
unrelated pages; Practice Setup, Knowledge, and Acknowledgments are indexed only from
Management even though Settings claims to be the single index.

### 1.7 Vocabulary: four meanings of "goal"

`goals` (personal monthly), `team_goals` (called "sprint" in code and on the card,
"Office goal" on dashboards, "challenge" in the Workplace hub copy and the builder),
monthly production/collections/new-patient targets in `org_practice_settings`, and the
dashboard's `GoalBrief` (which is actually sprints). Three review verbs for three adjacent
loops: sprints are *verified*, records are *signed off*, bypasses are *resolved*.

### 1.8 Navigation drift

Desktop has six destinations; Insurance Benefits is top-level *and* a Playbook door.
Management sits in mobile "More". The Management badge is the approvals total; the Inbox
badge is nudges. The manager's most important number — everything waiting on me — does not
exist anywhere as one number.

### 1.9 What is already right (preserve)

Data honesty is genuinely good: missing closeouts are narrated, never rendered as `$0`;
each metric paces only against its own target; the intervention carries receipts; a closed
office invents no urgency; owners are excluded from staffing. Deep links exist and are
consumed correctly. The editorial dashboard kit (ruled rows, mono micro-labels, tone dots
with text labels) is the right visual language. The canonical editors — `PunchEditorModal`
through `save_punch_edits`, `AttendanceActions`, `PtoRequestQueue`, `CorrectionQueuePanel`,
`AccountabilityReviewQueue`'s countersign form, `TardyReviewModal`, `SprintVerifyDialog`,
`useReviewKnowledgeVersion` — all exist and are reused, not replaced, below.

---

## 2. Manager jobs-to-be-done

Design around the questions, not the modules.

| Moment | The manager is asking | Today's surfaces | Redesign owner |
|---|---|---|---|
| **Morning** (7:45–8:15) | Is the office operating normally? Who is expected, who is missing? Did yesterday close? What decisions wait on me? Anything unusual? Also: clock myself in. | Home command center + Management Today's Team + Team Attendance | **Home** (briefing) → Attention / People for action; clock in the shell chip |
| **During the day** | Someone is late/absent — what now? A request arrived — decide it. A record needs my sign-off. Someone skipped a checklist. Is the day on pace? | Approvals, Management, Team, Checklists, bell | **Attention** (one queue, inline action); People → Today |
| **People management** | Is a pattern developing? What is this person's history? Change a schedule, record a day off, note a conversation. | Team, Employee Detail, Team Attendance, Settings | **People** → person record (sections), Team Attendance, Patterns |
| **Approvals** | What is waiting on me, how old is it, what happens if I say yes? | Approvals (3 tabs) | **Attention → Decide** |
| **Payroll** (biweekly) | Is payroll clean? Which records make it questionable? Fix them, then export. | Reports banner → Team Attendance | **Payroll** readiness → canonical fix → return → Reports |
| **Operational follow-up** | Bypass reasons, incident follow-up, overdue acknowledgments, training past due, content in review. | six pages | **Attention → Follow up**, with the record living in its feature |
| **End of day** | What is unresolved? Did Close the Day happen? Anyone still clocked in? What carries into tomorrow? | Home band + deposit log | **Home** wrap-up state ("Before you leave") |
| **Periodic** (weekly/monthly) | Publish a policy, assign training, set the month's challenge, review incidents, adjust office settings. | Management grid, Settings, feature admin | **Office** (index with one live fact per area) |

---

## 3. Proposed information architecture

### 3.1 Desktop destinations (five)

```
Home                 the briefing — state of the office and what needs me (role-shaped)
Workplace            my time · my attendance · PTO · my requests · office calendar
                     · handbook · goals · training · directory
Practice Playbook    procedures · morning huddle · checklists · Close the Day · incidents
                     · broken appointments · letters · forms & consents · FOF
                     · account balance · important numbers · insurance benefits · Ask AI
Inbox                messages · requests · nudges
Management  (mgr)    Attention · People · Payroll · Office
```

Insurance Benefits returns to Practice Playbook → Reference. It keeps its route and its
whole workspace; it loses a top-level slot it never needed. Settings, help, privacy lock,
and sign-out stay in the account menu.

**Badge rule:** Management carries one number — open Attention items. Inbox carries unread
messages and open nudges. Nothing else has a badge.

### 3.2 Mobile

Bottom navigation is role-shaped, not shrunken:

```
Manager:   Home · Workplace · Playbook · Inbox · Manage (badge)
Member:    Home · Workplace · Playbook · Inbox
```

Account, settings, help, privacy lock, and sign-out move under the office mark / avatar in
the mobile header (the "More" sheet goes away). On mobile, **Manage** opens Attention;
People, Payroll, and Office are one row of segments above it. Every item opens a bottom
sheet with its evidence and one primary action. A notification deep-links straight to that
sheet.

### 3.3 Exact responsibility of Home (manager)

Home answers **"How is the office right now, and what needs me?"** in one screen. It is a
*briefing*: it renders no forms, and every row is a deep link into the canonical place.

1. **State line** — phase, headcount, closeout, next payroll deadline. (`staffing.ts`
   phase; `closeDayStatus`; `usePayrollSettings`.)
2. **Needs you** — the top five Attention items, same rows and same inline primary actions
   as the Attention room, grouped by verb (Decide · Fix · Follow up). "+ n more" opens
   Attention. When the queue is empty this is one line: *Nothing needs you.*
3. **Today's team** — exceptions first (not in yet, late, off), then "n in" folded.
   Phase-aware: before open it lists expected arrivals; after close it is one sentence.
4. **Yesterday** — one line. *Closed and sealed at 5:41 PM by Dana R.* or the open item.
5. **On pace** — one sentence naming which target is off, with the day scope stated
   ("through Sat Sep 19 closeout"); numbers behind a disclosure. Rendered only when targets
   are configured.
6. **This month's challenge** — one compact line when one is running.
7. **Mine** — the manager's own open items (missing day, acknowledgment, goal), the clock
   status as a line (the shell chip remains the control), and a link to notes.
8. **Wrap-up state** — after close, "Needs you" becomes **Before you leave**: people still
   clocked in, Close the Day step, unanswered requests, and what will carry into tomorrow.
   It is not a ritual: when nothing needs attention, it is one sentence.

Everything below the fold today (doctor board, Today Focus, Rescope, sprint card,
accountability card, notes board) either moves to its owner (doctor board is owner-only
already; Today Focus and Rescope become the "My list" drawer inside Workplace; sprints move
to Office → Goals & Challenges; the accountability card stays only for the manager's *own*
record) or becomes a line in **Mine**.

### 3.4 Exact responsibility of Management (manager)

Management is the **workbench**: the only place where management actions happen. It has
four rooms and no Administration grid.

| Room | Answers | Contains |
|---|---|---|
| **Attention** | What needs me, in order of consequence? | the one triaged queue (all sources), the action panel, parked items |
| **People** | Who is here, who is missing, who needs follow-up, what is this person's story? | Today · Everyone (roster) · Team Attendance · Patterns · person record |
| **Payroll** | Is payroll clean, and what do I fix first? | period readiness list → canonical fixes → Reports → Report history |
| **Office** | Periodic management of the office as a whole | policies & procedures · acknowledgments · training · goals & challenges · incidents · calendar & closures · practice setup · office settings |

The sidebar item lands on Attention. Route map: `/management` → Attention;
`/management/people`, `/management/people/:employeeId`, `/management/attendance`
(unchanged), `/management/payroll`, `/management/office`. Legacy routes redirect:
`/approvals` → `/management?kind=decide`, `/team` → `/management/people`,
`/team/:id` → `/management/people/:id`, `/reports` stays (the engine) but is reached
through Payroll, `/acknowledgments` → `/management/office/acknowledgments`.

### 3.5 Workplace

Employee and office life, for everyone including managers. Gains a **Directory** (names,
roles, contact per permission, who is out this week from approved PTO and closures, work
anniversaries). Loses Team. Keeps the recent decision: **Workplace → Attendance is my own
attendance** (`AttendanceWorkspace mode="personal"`), for managers too. Goals here means
*my goal* and the team meeting view; challenges are visible here to tally, not to create.

### 3.6 Practice Playbook

Unchanged in scope, plus Insurance Benefits returns to Reference. Close the Day stays here
(operational work); its status surfaces on Home and in Attention and deep-links to the
exact step. Checklists stay here (completion is operational work); bypass *follow-up* is
in Attention and bypass *history* is on the person's record.

### 3.7 Inbox

Unchanged: messages, requests (office notes), nudges. The messages-closeout check becomes a
wrap-up line on Home rather than a card of its own.

### 3.8 Settings and utilities

Three kinds, three homes:

| Kind | Home | Examples |
|---|---|---|
| Feature-local | a gear on the feature page | FOF policy/templates/fees; forms & consents; letters; broken appointments; Close the Day (deposit print + schedule intelligence); insurance; checklist templates; messaging labels on Inbox; work zones from the clock chip |
| Office-wide | Management → Office → **Office settings** (one page, sections with anchors, no tabs of link cards) | identity & brand, hours & closures, timezone, payroll settings, PTO policy (org), attendance grace, escalation chains, roles & permissions, providers, messaging |
| Personal | account menu → **My settings** | signature, initials (read), reminders, auto-lock, privacy record |

`/settings` becomes My settings; `/settings/office|people|workflows` redirect to Office
settings; the seven Workflows link-cards are deleted because each target already has a
feature home. `PtoPolicySettingsCard` must be re-scoped to the org before it is shown under
Office settings (today it writes a per-user row).

### 3.9 Navigation tax, before and after

| | Before | After |
|---|---|---|
| Top-level destinations (desktop) | 6 | 5 |
| Manager pages to check "what needs me" | Home, Management, Approvals (3 tabs), Team (bypasses), Acknowledgments, Knowledge, Incidents, Training, Deposit log, Goals/Home (sprints) | Home (summary) and Attention (action) |
| Clicks from a notification to the action | 2–3 (page → tab → card → dialog) | 1 (item panel opens) |
| Renderings of "who is here" | 3 | 1 (People → Today; Home summarizes it) |
| Places that host the same employee setup card | 2 | 1 |
| Settings hubs | Settings (4 tabs incl. 7 link cards), Management grid, Playbook doors | one office-settings page, gears on features, one personal page |

---

## 4. Canonical ownership map

A fact may surface in many places; it is **managed** in exactly one. "Surfaces" lists the
places it may appear as a row or a line, each deep-linking to the owner.

| Area | Managed in (canonical) | Editor reused | Surfaces on |
|---|---|---|---|
| Attendance (office-wide) | Management → People → **Team Attendance** (`/management/attendance`, `AttendanceWorkspace mode="team"`) | `AttendanceActions`, `PunchEditorModal`, `TardyReviewModal`, Add Day Off | Home today's team, Attention (Fix), Payroll readiness, person record |
| Attendance (my own) | Workplace → **Attendance** (`/days-off`, personal mode) | same editors, own rows | Home → Mine, Timesheet |
| Punches / time corrections | **the punch editor** (`save_punch_edits`), opened from Team Attendance, Timesheet, or an Attention item | `PunchEditorModal` | Attention, Payroll, person record |
| Missing shifts / exceptions | Team Attendance day row (one definition: scheduled day past end + buffer with no time, no day off, no closure, no resolved exception); `attendance_exceptions` becomes org-readable for managers | `AttendanceActions` (day off / callout / closed / ignore with reason) | Home, Attention (Fix), Payroll |
| Tardies | Team Attendance → Tardies | `TardyReviewModal` | Attention (Follow up) when unreviewed, person record |
| PTO requests | **Attention → Decide** (the decision) ; balances and policy on the person record → Time off | `PtoRequestQueue` / `useReviewPtoRequest` | Home, Payroll (in-period), person record, employee's PTO page |
| Correction / change requests | **Attention → Decide** | `CorrectionQueuePanel`, `useReviewChangeRequest` | Home, Payroll, person record |
| Employee schedules | person record → **Schedule** (the only editor; moved from `TeamEmployeeCard`) | `ScheduleTab` | Team Attendance (read), Office Calendar (read), Payroll (read) |
| Employee records | Management → People → **person** (`/management/people/:id`) | `EditEmployeeDialog`, `EmployeeSetupCard`, permissions card (moved here), operational roles editor, staff code | Directory (community view), Attention subject links |
| Approvals as a concept | dissolved into **Attention → Decide** | — | badge count |
| Checklists (completion, templates) | Practice Playbook → **Checklists** | existing | Home member view |
| Checklist bypasses | **Attention → Follow up** (open ones, grouped by person) ; history on person record → Record | new: a manager "seen" note (small addition, see §9) | Home, person record |
| Goals (personal) | Workplace → **Goals** (owner edits; manager's private-goal dialog stays here) | existing | person record → Growth (read) |
| Targets (office numbers) | Office → Office settings → **Targets** | `PracticeSettingsCard` | Home "On pace", Reports |
| Challenges (sprints) | Office → **Goals & Challenges** (create, cancel, verify) | `SprintBuilderDialog`, `SprintVerifyDialog` | Home "This month's challenge", Workplace → Goals (tally), Attention (verification) |
| Training | Office → **Training** (library, drafts, assignment) | existing | Attention (overdue, drafts to review), person record → Growth |
| Reports / payroll | Management → **Payroll** (readiness) → **Reports** (engine, unchanged) → Report history | `Reports.tsx`, `ReportHistory.tsx` | Home state line (deadline), Attention (Fix items carry the period) |
| Close the Day | Practice Playbook → **Close the Day** | existing five steps | Home yesterday/wrap-up, Attention (unsealed, gap, needs review), Reports |
| Policies & procedures | Office → **Policies & Procedures** (knowledge workspace) | existing | Attention (in review), handbook (published) |
| Acknowledgments | Office → **Acknowledgments** (roster, receipts, questions) | existing | Attention (escalated to manager), person record |
| FOF | Practice Playbook → **FOF**; its settings behind the FOF gear | existing | — |
| Insurance | Practice Playbook → **Insurance Benefits**; settings behind its gear | existing | — |
| Forms / letters | Practice Playbook; settings behind their gears | existing | — |
| Incidents | Office → **Incidents** (log, review, countersign); filed from the person record too | existing | Attention (countersign, follow-up due), person record → Record |
| Office settings | Office → **Office settings** | existing cards | — |
| Personal settings | account menu → **My settings** | existing cards | — |

---

## 5. The unified attention model

### 5.1 One item shape

Every source is normalized into one view model (composed from existing hooks, no new
tables):

```
AttentionItem {
  id, kind,                       // 'pto_request' | 'correction' | 'change_request' | 'content_review'
                                  // | 'challenge_verify' | 'missing_clock_out' | 'missing_day'
                                  // | 'unpaired_punches' | 'time_suspect' | 'close_day' | 'tardy_unreviewed'
                                  // | 'bypass' | 'record_signoff' | 'ack_escalated' | 'training_overdue'
                                  // | 'incident_countersign' | 'incident_followup' | 'wrapup_clocked_in'
  verb: 'decide' | 'fix' | 'follow_up',
  subject: { employeeId?, name } | { record },
  happened: string,               // "No clock-out on Fri Sep 18"
  when: ISO, age: string,         // "3 days"
  deadline?: { label, date },     // "payroll Thu"
  why: string,                    // the rule: "scheduled day ended 60+ min ago with an open punch pair"
  receipts: [{ label, value, source }],   // "punches · in 7:58 AM (kiosk)"
  primary: { label, run },        // exactly one
  secondary?: [{ label, run }],
  recordHref: string,             // where the underlying record lives
  history?: string                // "1 similar item in 90 days"
}
```

### 5.2 Ordering by consequence

1. A human said the day was unsafe or understaffed (existing rule, kept first).
2. **Decide** — someone is waiting on an answer: requests, content in review, challenge
   verification, incident countersign. Sorted by age.
3. **Fix** — the record of truth is wrong or incomplete: missing clock-outs, scheduled days
   with no time, unpaired punches, time that looks off, Close the Day unsealed/behind/needs
   review. Sorted by deadline (payroll) then age.
4. **Follow up** — records and patterns that need a person: records awaiting sign-off,
   escalated acknowledgments, repeated bypasses, training overdue, incident follow-up due.

The existing `buildInterventionQueue` order is preserved inside these groups; the change
is that every source is present and every row can be acted on where it is shown.

### 5.3 Quiet intelligence rules

- An item exists only when a real record exists. Zero items is one sentence, not rows of
  zeros.
- Every item answers: what happened, who or what, how old or urgent, why the system
  surfaced it, what I can do, where the record lives.
- "Why am I seeing this?" is always available and names the office rule and the recorded
  items it read. Sources are named the way the office knows them ("punches", "schedule",
  "Close the Day"), never table names.
- Patterns ("3 late arrivals in 14 days") appear as *context on an item*, never as a
  separate alert, and only when they cross the office's own configured threshold.
- **Park** is allowed for Follow-up items only ("Park until Friday"); parked items stay
  counted and resurface. Decide and Fix items cannot be parked.
- Language is factual and never shaming: "no clock-out recorded", "reason owed", "record
  awaiting sign-off".

### 5.4 Deep links

Every notification and every surface row links to `/management?item=<kind>:<id>`, which
opens the item's panel directly. The panel's "Open the record" link uses the feature's
existing deep link (`/management/attendance?employee=&date=`, `/deposit-log?date=&step=`,
`/incident-reports?report=`, `/training?assignment=`, `/acknowledgments?assignment=`,
`/management/knowledge?version=`). Editors accept `?return=` and show a return pill after
saving.

---

## 6. Manager journey — a realistic Monday

| Time | What happens | Where | What the manager does |
|---|---|---|---|
| 7:52 | Opens the app on her phone in the parking lot. Clocks in from the sticky bar. | Home (mobile) | Reads the state line: *Opening · 5 of 8 in · Close the Day not started · payroll Thu.* Sees **Needs you (9)** with the top three. |
| 7:58 | Ken W. is not in yet (starts 8:00). | Home → Today's team | Nothing to do yet; the row says *starts 8:00*, not *absent*. |
| 8:15 | Ken arrives at 8:14. The row flips to *In · late 14 min · unreviewed*. | Home | She taps it → Attention item (Follow up): tardy with Ken's reason ("train"). Marks it reviewed with one tap. Context line: *3rd late arrival in 14 days — office threshold is 3; a record has opened.* |
| 8:20 | Jo B.'s PTO request (Oct 2–3). | Attention → Decide | Panel shows balance (32h), who else is off those days (nobody), the schedule impact. **Approve**. Row collapses with *Approved · undo*. |
| 10:40 | Bell: a correction request from Marcus (forgot to clock out Friday). | Notification → item panel | **Approve** opens the punch editor (existing behavior) for Fri Sep 18; she adds the 12:02 out. Saves. Item closes; the Payroll readiness row for that day is gone. |
| 12:30 | Owner asks "are we on pace?" | Home → On pace | *Collections $5,516 behind September's pace; production and new patients on pace (through Sat Sep 19 closeout).* Expands "Why?" → the receipts. |
| 2:10 | Notices Priya bypassed her checklist twice this week. | Attention → Follow up | Panel groups both bypasses, shows the one reason given and the one owed, and the last 90 days (one other). She adds a note to Priya's record: *talked 2:10 — sterilization backlog on Fridays; adjusting the list.* |
| 3:00 | Ken's accountability record (late arrivals) needs her sign-off by Wednesday. | Attention → Follow up | Reads his note, documents the conversation, signs off. |
| 4:30 | Payroll is Thursday. | Management → Payroll | *Not ready — 2 records:* Alice N., Thu Sep 17, scheduled with no time; Priya S., Fri Sep 18, no clock-out. **Record what happened** → Team Attendance day row → Callout (Alice texted). Return pill → back to Payroll. **Fix the day** → punch editor → out 5:03 PM (from the kiosk photo). Back to Payroll: *Ready — 9 people, 84 shifts, 0 open records.* |
| 5:15 | Wrapping up. | Home (wrap-up state) | *Before you leave:* Sam K. still clocked in (scheduled to 5:00) → she checks, he is finishing a case; Close the Day at step 3 → she finishes and seals; 2 doctor requests unanswered → Inbox. *Carrying into tomorrow: 2 parked follow-ups.* Tomorrow line: *Tue · 7 scheduled · Jo B. off.* |

At no point does she open a hub to find a feature. She never sees the same item in two
places with two different actions.

---

## 7. High-fidelity concepts

The concept file (`docs/manager-experience-redesign/concepts.html`) renders each surface
below with fixture data and three scenarios (quiet Tuesday · busy Monday · wrap-up), a
working attention panel, the correct-and-return flow, the employee record sections, and
phone frames. Summaries:

### 7.1 Manager Home
Masthead (office · role · date · time; the clock chip is in the shell header). State line.
*Needs you* (grouped rows with inline primary action, capped at five). *Today's team*
(exceptions, then folded "n in"). *Yesterday* (one line). *On pace* (one sentence,
disclosure for numbers). *This month's challenge* (one line). *Mine* (lines). Wrap-up
state after close. Quiet state collapses to roughly six lines.

### 7.2 Management → Attention
Header with room switcher and count. Filters by verb, a "Parked" count, and sort by
consequence. Ruled rows grouped by verb. Selecting a row opens the panel (desktop: right
column; mobile: bottom sheet) with what happened, why, deadline, receipts, one primary
action, secondary actions, "Open the record", and history. Acting collapses the row with a
ten-second undo and moves focus to the next row.

### 7.3 Management → People
Segments: Today · Everyone · Team Attendance · Patterns. *Today* is the single live roster
(phase-aware, exceptions first). *Everyone* is the roster with role, today's status, open
items, last 30 days, and schedule summary; Invite and Archived live here. *Patterns* is the
attendance trend and repeat counts against the office's thresholds — factual, no rankings.

### 7.4 Person (employee record)
Stable header (name, role, since, status, actions), an at-a-glance strip (this period's
hours, last 30 days, PTO balance, open items), then sections: Overview · Time & attendance
· Time off · Schedule · Record · Growth · Profile. Overview holds the person's open items,
a 14-day strip, and manager notes. Each section is the canonical view; edits invoke the
canonical editors. Back returns to the roster with scroll position kept.

### 7.5 Team Attendance
The existing workspace, unchanged in capability. Two additions: it honors `?return=` with a
return pill, and its "Unreviewed items" card becomes a filtered view of the same Attention
items (one definition of missing).

### 7.6 Payroll readiness
Period picker with pay date and hours-due date. *Not ready yet — n records* list (person ·
date · what's wrong · fix) and *Worth a look* (overtime, adjustments; never blocking).
Period summary. Prepare report (Reports engine) and Report history. After a fix, the row
reads *Fixed 2 min ago by you*. Ready state is one line and one button.

### 7.7 Office
An index list, one live fact per area, no cards: Policies & Procedures (n in review),
Acknowledgments (n unsigned · n overdue), Training (n open · n drafts), Goals & Challenges
(n of m set a goal · challenge running), Incidents (n open · n awaiting countersign),
Calendar & closures (next closure), Practice Setup, Office settings.

### 7.8 Mobile
Home: state line, *Needs you* (top three, tap → sheet), *Today* exceptions, wrap-up after
close. Manage: Attention list with verb segments; item sheet with evidence and one
action; People → Today and person overview; Payroll readiness list (fixes open the editor
sheet). No performance strip, no notes, no roster tables on phones.

---

## 8. Interaction model

| Pattern | Behavior |
|---|---|
| **Attention triage** | Row → panel → act → row collapses with *Done · undo* (10 s) → focus moves to the next row. Keyboard: ↑↓ move, Enter opens, A/D approve/decline where applicable. |
| **Deep linking** | Every row and notification opens the exact item panel. Panels link to the underlying record with the feature's existing deep link. Editors honor `?return=`. |
| **Progressive disclosure** | Row: one line + primary action. Panel: what/why/deadline/receipts/history. Record: everything. "Why am I seeing this?" is a disclosure on the panel, never a tooltip. |
| **Correct and return** | Payroll row → editor (Team Attendance) with a return pill at the top → save → pill returns to Payroll with the row updated and an audit line. The same pattern serves Attention → editor → Attention. |
| **Empty / quiet state** | Home collapses to state line + *Nothing needs you* + one-line sections. Attention reads *Nothing waiting · n parked until Friday.* Payroll reads *Ready.* No cards appear to fill space. |
| **Office doing well** | Same components, fewer rows. The tone is calm: no green everywhere, one success line where a decision was resolved. |
| **Office with several issues** | Same components, grouped by verb, the first item proposed as *step into this first* with receipts. Color appears only on tone dots and the one number that matters. Motion is limited to the row collapse and the return pill. |
| **Data honesty** | Missing data is narrated ("not recorded"), never zero. Pace lines state the day scope. Every AI or rule-derived line has receipts. No office-health score. |

---

## 9. What this changes in code (for planning, not a build spec)

Reorganize, connect, simplify. No engine is rebuilt.

**Reused as-is:** `AttendanceWorkspace`, `AttendanceActions`, `PunchEditorModal`,
`PtoRequestQueue`, `CorrectionQueuePanel`, change-request review, `AccountabilityReviewQueue`
countersign form, `TardyReviewModal`, `SprintBuilderDialog`/`SprintVerifyDialog`,
`KnowledgeWorkspace`, `KnowledgeAcknowledgments`, `Training`, `IncidentReports`,
`DepositLog`, `Reports`, `ReportHistory`, `ScheduleTab`, `EmployeeSetupCard`,
`EditEmployeeDialog`, permissions card, the dashboard kit, `staffing.ts`, `manager-pulse.ts`,
`notification-routing.ts`, `useDeepLink.ts`.

**New composition (no new tables):**
- `useAttentionItems()` — composes `useApprovalCounts`' three sources, `useOrgAccountabilityReports`,
  `useOrgBypasses`, `useKnowledgeAcknowledgmentRoster`, `useTrainingAssignments`,
  `useOrgAttendanceSnapshot` + `staffing.ts`, `useDepositLog`, incident hooks, knowledge
  workspace `needs_action`, `useTeamGoals` (pending verification) into `AttentionItem[]`,
  ordered per §5.2. Home renders `.slice(0, 5)`.
- `AttentionRow` / `AttentionPanel` — one row component, one panel that mounts the existing
  editor for the item's kind.
- `ManagementShell` with the four rooms; `PeopleToday` (replaces `OrgSnapshotPanel` and the
  Home staffing band, built on `staffing.ts`), `PeopleRoster` (from `Team.tsx` minus
  bypasses/trend/staff codes), `PersonRecord` (from `EmployeeDetail.tsx` + `ScheduleTab` +
  permissions), `PayrollReadiness` (from `Reports.tsx` flag logic + in-period pending
  requests, with `?return=`), `OfficeIndex`, `OfficeSettings` (the cards from
  `Settings.tsx` office/people tabs), `MySettings` (the `me` tab), `Directory`.
- Route redirects listed in §3.4 and §3.8; `?return=` support in `AttendanceWorkspace`,
  `PunchEditorModal` host pages, and `DepositLog`.

**Small additions that the design depends on (each is one column or one policy):**
1. Managers can read the office's `attendance_exceptions` (today user-scoped).
2. A manager note on a bypass group ("seen", optional text) — or reuse `audit_events`
   with a `bypass_note` type; no new table.
3. Notification types for `knowledge_version_in_review` and `close_day_unsealed` so the
   bell agrees with Attention.
4. `PtoPolicySettingsCard` re-scoped to the org before it appears under Office settings.
5. Optional: a `payroll_periods` "reviewed by / at" mark. Valuable, but the readiness flow
   works without it.

**Vocabulary changes (UI strings only; tables keep their names):** *sprint* → *challenge*;
*Office goal* → *This month's challenge*; office performance goals → *Targets*; *Approval
Queue* → *Attention*; *Today's Team* → *Today*; *Team* (manager) → *People*; *Team* (everyone)
→ *Directory*.

**Tests to update:** `src/test/settings-organization.test.ts` (four-tab structure),
notification routing inventory (new types and the `?item=` destination), dashboard
fixtures/scenarios for the new Home composition.

---

## 10. Design principles this proposal is held to

- A manager thinks in questions, not modules. Every screen opens with the answer.
- One canonical place to manage each fact; surface anywhere, deep-link always.
- Quiet when things are fine. No card exists to fill space; no zero is an alert.
- Consequence orders everything: people waiting, then the record of truth, then follow-through.
- Data honesty: missing is *missing*, pace states its scope, every derived line has receipts.
- The office's identity leads; Purple Envelope signs the footer.
- Reorganize, connect, simplify. Rebuild nothing that works.
