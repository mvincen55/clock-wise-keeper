# Manager experience redesign

Status: design proposal, round 2 (2026-09-21). Round 1 established the architecture; it is
frozen (see §0). Round 2 is a simplification and consistency pass on the same architecture.
Nothing in this document changes code by itself.
Companion: `docs/manager-experience-redesign/concepts.html` — interactive high-fidelity
concepts for every surface described here (open it in a browser; it runs on fixture data).

This is a product-architecture, information-architecture, interaction, and workflow
redesign of the manager experience. It is not a visual refresh. Every claim about the
current product below was verified against the code on `main` at the time of writing;
file references are given so the diagnosis can be checked.

---

## 0. The one-paragraph answer, and what is frozen

A manager opens Purple Envelope and should see, in five seconds: *here is the office,
here are the few things that need me, everything else is okay.* Today that read is split
across two command centers, a dozen queues, and four renderings of "who is here." The
redesign gives every management fact **one place where it is managed** and lets it
**surface** anywhere: Home is the briefing and only navigates; Management is the workbench
with four rooms (**Attention · People · Payroll · Office**) and is the only place actions
happen; every item deep-links into the editors the product already has; one derived state
powers every count. Nothing in the attendance engine, schedules, PTO, approvals, reports,
goals, checklists, FOF, Close the Day, forms, training, employee records, settings, or
permissions is rebuilt.

**Frozen after round 1**

1. Home briefs. Management acts. Consequential actions never happen on Home.
2. Management = Attention · People · Payroll · Office.
3. Five top-level destinations; Insurance Benefits under Practice Playbook.
4. Personal attendance stays in Workplace; Team Attendance stays in Management.
5. One canonical employee record.
6. Payroll Readiness exists, and fix-and-return is the product's rhythm.
7. Feature settings live with features; office settings live under Office.
8. One canonical owner per fact.

**Round 2 changes** (detail in §11): Home rows carry a single navigation action; busy Home
shows three items, exceptions only, two status lines, and the challenge only when
noteworthy; "Step into this first" is removed; Attention has a hard admission rule and a
flat consequence order; Inbox, Attention, and notifications get one sentence each; the
employee record has five sections; consequential actions confirm and reverse only as
audited actions; one derived state drives every count; a legibility pass on type, labels,
and targets.

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
*briefing*: it renders no forms and takes no consequential action. Every row carries exactly
one navigation action, **Review** for decisions and **Open** for fixes and follow-ups, and
both land on the exact Attention item in Management.

1. **One sentence of state**, built from recorded facts, each fact linked: *Open, 6 of 8 in.
   Ken W. isn't in yet. Saturday's closeout still needs its seal, and payroll hours are due
   Thursday.* The clock stays in the shell chip.
2. **Needs you** — the first three items of the Attention order (§5.2), then *n more waiting*.
   When the queue is empty: one line, *Nothing waiting · n parked until Friday.*
3. **Today** — exceptions only (not in yet, late, off), then one count line: *5 in · Sam K. at
   1:00 PM · People*. Never a roster. Phase-aware: before a shift starts nobody is absent.
4. **Two status lines** — last workday or yesterday (sealed by whom, or the open item), and
   pace in one clause with its day scope and a *Why?* that discloses the three numbers.
5. **Spotlight** — the running challenge appears only when it is newly launched, needs a
   decision, is nearing its deadline, hits a milestone, goes off track, or finishes.
   Otherwise it lives in Office → Goals & Challenges.
6. **Mine** — only items that need the manager personally (an acknowledgment to sign, a
   missing day of their own). Absent when there are none.
7. **Wrap-up state** — after close, Needs you becomes **Before you leave**: people still
   clocked in, the closeout step, and what carries into tomorrow. Unanswered doctor notes
   appear as an Inbox status line, not as an Attention item. When nothing needs attention it
   is one sentence.

Everything else that sat on the old Home (doctor board, Today Focus, Rescope, sprint card,
accountability card, notes board, performance cards, fact tiles) moves to its owner or is
folded into a status line.

### 3.4 Exact responsibility of Management (manager)

Management is the **workbench**: the only place where management actions happen. It has
four rooms and no Administration grid.

| Room | Answers | Contains |
|---|---|---|
| **Attention** | What needs me, in order of consequence? | the one triaged queue (all sources), the action panel, parked items |
| **People** | Who is here, who is missing, who needs follow-up, what is this person's story? | Today · Everyone (roster) · Team Attendance · Patterns · person record |
| **Payroll** | Is payroll clean, and what do I fix first? | period readiness list → canonical fixes → Reports → Report history |
| **Office** | Periodic management of the office as a whole | policies & procedures · acknowledgments · training · goals & challenges · incidents · calendar & closures · practice setup · office settings |

There is no recommendation box above the queue: the queue is already in order, so the first
row is first. The sidebar item lands on Attention. Route map: `/management` → Attention;
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

### 3.7 Inbox, Attention, and notifications

Three sentences a manager never has to think about:

- **Inbox is communication from people.** Messages, and notes handed to a named person
  (the office-labeled tab; the product default is *Doctor notes*, not *Requests*).
- **Attention is operational work created by records and workflows.** Decisions, fixes,
  and rule-triggered follow-ups (§5.0).
- **Notifications are delivery, never a destination.** The bell lists deliveries; each
  opens an Attention item, an Inbox thread, or a record, and is marked read when that opens.

Consequences: **Nudges leave Inbox.** They are system-generated, so each renders on the
surface it concerns (the existing `surface` column) and the member's own Home counts them;
the Inbox badge becomes unread messages plus unanswered notes. **"Request" stops being a
category name.** PTO, correction, and change requests are Decide items in Attention; the
employee's own submissions stay *My requests* in Workplace; the doctor-notes tab drops the
word. The messages-closeout rule surfaces as a wrap-up status line on Home that links to
Inbox.

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
| Manager pages to check "what needs me" | Home, Management, Approvals (3 tabs), Team (bypasses), Acknowledgments, Knowledge, Incidents, Training, Deposit log, Goals/Home (sprints) | Home (summary, navigation only) and Attention (action) |
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

### 5.0 Admission rule (an invariant, not a guideline)

An item enters Attention only when one of these is true:

1. **The manager must make a decision** — a PTO, correction, or change request; a version in
   review; a challenge awaiting verification; an incident awaiting countersign.
2. **A business record is incorrect or incomplete and the manager can fix it** — a missing
   clock-out, a scheduled day with no time and no explanation, unpaired punches, time that
   looks off, an unsealed, missing, or flagged Close the Day record.
3. **A recorded office rule has reached the point where manager follow-up is required** — a
   record awaiting sign-off, a bypass reason owed past the office's window or a repeat inside
   it, an acknowledgment escalated to the manager by the ladder, training past its due date,
   an incident with follow-up due.

Never admitted: passive observations, weak patterns, FYIs, metrics, "approaching" states,
the existence of training, a metric behind pace. Pace is a status line on Home and Reports;
patterns are context in People → Patterns; overtime is *worth a look* in Payroll; nudges
belong to the member. If a future feature wants a row in Attention it must name which of
the three tests it passes and which record backs it.

### 5.1 One item shape

Every source is normalized into one view model (composed from existing hooks, no new
tables):

```
AttentionItem {
  id, kind,
  verb: 'decide' | 'fix' | 'follow_up',
  subject: { employeeId?, name } | { record },
  happened: string,               // "No clock-out on Fri Sep 18"
  when: ISO, age: string,
  deadline?: { label, date },     // "payroll Thu"; drives the order
  why: string,                    // the office rule that admitted it
  receipts: [{ label, value, source }],
  actions: [{ label, kind, primary }],   // exactly one primary
  recordHref: string,
  history?: string
}
```

### 5.2 Order: a flat list by consequence

One list, no group headers, no recommendation box. The order is:

1. items with a deadline, soonest first (payroll hours due, a record that escalates, tonight);
2. then decisions, then fixes, then follow-ups;
3. within each, oldest first.

The first row is therefore the first thing to do. Home renders the first three of the same
list. Filters narrow by verb; they never reorder.

### 5.3 Quiet intelligence rules

- An item exists only when a real record exists. Zero items is one sentence, not rows of
  zeros.
- Every item answers: what happened, who or what, how old or urgent, why the system
  surfaced it (the rule), what I can do, where the record lives.
- "Why am I seeing this?" names the office rule and the recorded items it read, in the
  office's words (punches, schedule, Close the Day), never table names.
- Patterns appear as *context on an item* and only when they cross the office's own
  configured threshold; they never create an item by themselves.
- **Park** (follow-ups) and **Snooze** (wrap-up items) keep the item counted and resurface it
  on the stated day. Decide and Fix items cannot be parked.
- Language is factual and never shaming.

### 5.4 Consequential actions: confirm, then audited reversal

Approving PTO writes the ledger and notifies a person; sealing a day locks a record; signing
off closes a chain; saving punches edits payroll data. These are not UI events.

- **Confirm first.** One sentence states the consequence (*This writes the PTO ledger, puts
  the days on the calendar, and notifies Jo.*), then one button. Declines and unapprovals
  carry the required reason in the same step.
- **Reverse as an audited action, where the system supports one.** After the fact, the
  panel offers *Reverse decision* (cancel an approval as a new ledger transaction), *Unseal*
  (the existing audited unseal), *Edit the day again* (a new audited punch edit), *Withdraw
  approval* (a version returns to review). Each is its own confirmed, audited write. A closed
  accountability record offers no reversal; the panel says so.
- **Undo only for UI state.** Park and Snooze keep a ten-second undo. Nothing else does.

### 5.5 One derived state

A single function derives the ordered item list, the counts by verb, the payroll-blocking
subset, and the parked set. Everything reads it: the Management badge, Home's three rows and
*n more*, the Attention filters, the Payroll heading, rows, and button, the People open-item
chips, the mobile tab badge. Resolving an item anywhere changes all of them at once. No
surface computes its own count.

### 5.6 Deep links and return

Every row and every notification opens the exact item at `/management?item=<kind>:<id>`.
The panel's *Open the record* uses the feature's existing deep link
(`/management/attendance?employee=&date=`, `/deposit-log?date=&step=`,
`/incident-reports?report=`, `/training?assignment=`, `/acknowledgments?assignment=`,
`/management/knowledge?version=`). Editor-backed actions open the canonical editor with
`?return=` and show a return pill; saving returns with the row resolved and an audit line.

---

## 6. Manager journey — a realistic Monday

| Time | What happens | Where | What the manager does |
|---|---|---|---|
| 7:52 | Opens the app on her phone in the parking lot. Clocks in from the sticky bar. | Home (mobile) | Reads the state line: *Opening · 5 of 8 in · Close the Day not started · payroll Thu.* Sees **Needs you (9)** with the top three. |
| 7:58 | Ken W. is not in yet (starts 8:00). | Home → Today's team | Nothing to do yet; the row says *starts 8:00*, not *absent*. |
| 8:15 | Ken arrives at 8:14. The row flips to *In · late 14 min · unreviewed*. | Home → Open → Attention item | Reviews the tardy with Ken's reason and confirms. Context line: *3rd late arrival in 14 days; the office threshold is 3, so a record has opened.* |
| 8:20 | Jo B.'s PTO request (Oct 1–2). | Attention → Decide | Panel shows the balance (48h → 32h), who else is off those days (nobody), the coverage. **Approve** → confirm → *Approved 8:21 AM · Jo notified*. If she changes her mind later, *Reverse decision* records a cancellation on the ledger. |
| 10:40 | Bell: a correction request from Marcus (forgot to clock out at lunch Friday). | Notification → item panel | **Review** opens the punch editor with the requested punches. Approve and save. The Payroll readiness row for that day disappears because it was the same item. |
| 12:30 | Owner asks "are we on pace?" | Home → status line → Why? | *Collections $8,600 behind September's pace; production and new patients on pace (through Fri Sep 18 closeout).* The three numbers and their sources are one click down. |
| 2:10 | Priya's Friday bypass reason is three days overdue. | Attention → Follow up | The item exists because the office rule tripped (reason owed past one working day), not because a pattern looked interesting. She adds a note to Priya's record: *talked 2:10; sterilization backlog on Fridays; adjusting the list.* |
| 3:00 | Ken's accountability record (late arrivals) needs her sign-off by Wednesday. | Attention → Follow up | Reads his note, documents the conversation, types her name, signs off. The record closes; a closed record cannot be reopened. |
| 4:30 | Payroll is Thursday. | Management → Payroll | *Not ready — 2 records:* Alice N., Thu Sep 17, scheduled with no time; Priya S., Fri Sep 18, no clock-out. **Record what happened** → Team Attendance day row → Callout (Alice texted). Return pill → back to Payroll. **Fix the day** → punch editor → out 5:03 PM (from the kiosk photo). Back to Payroll: *Ready — 9 people, 84 shifts, 0 open records.* |
| 5:15 | Wrapping up. | Home (wrap-up state) | *Before you leave:* Sam K. still clocked in (scheduled to 5:00); Close the Day at step 3 → she continues and seals. A status line says two doctor notes still need a reply in Inbox. *Carrying into tomorrow: 2 parked follow-ups.* Tomorrow: *8 scheduled · nobody off.* |

At no point does she open a hub to find a feature. She never sees the same item in two
places with two different actions.

---

## 7. High-fidelity concepts (round 2)

The concept file (`docs/manager-experience-redesign/concepts.html`) renders each surface
below with fixture data and three scenarios (quiet Tuesday · busy Monday · wrap-up), a
working attention panel with confirmation and editor steps, audited reversals, the
correct-and-return flow, the five-section employee record, and phone frames. Every count on
every screen reads one derived state. Summaries:

### 7.1 Manager Home
Masthead, one sentence of state (each fact linked), *Needs you* with the top three items and
one navigation action each, *Today* with exceptions and a count line, two status lines, the
challenge only when noteworthy, *Mine* only when needed. Wrap-up state after close. Quiet
state is a sentence and four lines.

### 7.2 Management → Attention
Room switcher with the one count. Filters by verb (they never reorder), a parked count, and
the order rule stated in one line. A flat list of rows: verb, who, what, age or deadline.
Selecting a row opens the panel: what happened, why (the rule), deadline, one primary action
and its secondaries, *Based on these recorded items*, *Open the record*, history.
Consequential actions show a one-sentence confirmation; editor-backed actions open the
canonical editor in place with a return pill; resolved items collapse into *Done today* with
an audited reversal where one exists. Park and Snooze keep a ten-second undo.

### 7.3 Management → People
Segments: Today · Everyone · Team Attendance · Patterns. *Today* is the single live roster
(phase-aware, exceptions first, *Open* on rows that have an item). *Everyone* is the roster
with role, today's status, open items, last 30 days, and schedule summary. *Patterns* is
context against the office's thresholds; it never creates an item by itself.

### 7.4 Person (employee record): five sections
Stable header, an at-a-glance strip (this period's hours, last 30 days, PTO balance, open
items), then **Overview · Time · Record · Development · Profile**. Time holds attendance,
schedule, and time off as in-page blocks with a jump strip, so the schedule editor stays
canonical without a first-level tab. Record holds accountability records, incidents,
bypasses, adjustments, and manager notes. Development holds the month's goal, training, and
the challenge tally. Profile holds employment, contact, role, permissions, operational roles,
staff code.

### 7.5 Team Attendance
The existing workspace, unchanged in capability. Two additions: it honors `?return=` with a
return pill, and its "needs attention" count is the same Attention items filtered to this
view, so "missing" has one definition.

### 7.6 Payroll readiness
Period picker with pay date and hours-due date. *Not ready yet — n records* (from the derived
state) with person · date · what's wrong · the exact fix. *Worth a look* (overtime,
adjustments; never blocking). Period summary. The heading, rows, and *Prepare payroll
report · n open records* button all read the same count. After a fix, the row reads *Fixed ·
8:34 AM* with an audited reversal. Ready state is one line and one button.

### 7.7 Office
An index list, one live fact per area, no cards. The challenge lives here when it is not
noteworthy enough for Home.

### 7.8 Mobile
Home: the sentence, the top three items with one navigation action each, today's exceptions
and a count, two status lines; wrap-up after close. Manage: Attention as a flat list with
verb filters; an item opens a bottom sheet with its evidence, one primary action, and the
same confirmation step as desktop. Larger targets (40px buttons), less per row.

---

## 8. Interaction model

**The benchmark rhythm:** state → exception → exact action → canonical editor → return →
resolved. Payroll Readiness runs on it, and so does everything else: Attention (row → panel
→ editor → resolved), People → Today (exception → item), Close the Day follow-up (unsealed
day → seal step → sealed), policy review (version in review → review view → approved),
bypass follow-up (rule tripped → reasons → note on the record), incidents (awaiting
countersign → countersign → closed). No screen states a problem without the exact action
beside it.

| Pattern | Behavior |
|---|---|
| **Home only navigates** | One action per row, Review or Open, landing on the exact Attention item. Home never approves, declines, seals, signs, or edits. |
| **Attention triage** | Row → panel → primary action → confirmation (or the canonical editor with a return pill) → resolved row under *Done today*, with an audited reversal where one exists. Keyboard: arrows move, Enter opens, Escape cancels a step. |
| **Confirm and reverse, don't undo** | Consequential actions confirm in one sentence. Reversal is a separate audited action offered only where the system supports one. Ten-second undo applies to Park and Snooze only. |
| **One derived state** | Badge, Home, Attention counts, Payroll heading/rows/button, People chips, and the mobile badge all read one model. |
| **Deep linking and return** | Every row and notification opens the exact item. Editors honor `?return=`; saving returns with the row resolved and an audit line. |
| **Progressive disclosure** | Row: verb, one line, age. Panel: what, why (the rule), deadline, action, receipts, history. Record: everything. |
| **Empty / quiet state** | Home: a sentence and four lines. Attention: *Nothing waiting · n parked until Friday.* Payroll: *Ready.* No filler cards, no zero rows, no permanent challenge real estate. |
| **Office doing well vs. several issues** | Same components; what changes is the count and the number of rows. Color only on tone dots and the one number that matters. Motion limited to the row collapse and the return pill; reduced motion honored. |
| **Data honesty** | Missing data is narrated, never zero. Pace states its day scope. Every rule-derived or AI-derived line has receipts. No office-health score. |

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
- `deriveAttention()` — one pure function from the existing hooks' data (`useApprovalCounts`'
  three sources, `useOrgAccountabilityReports`, `useOrgBypasses`,
  `useKnowledgeAcknowledgmentRoster`, `useTrainingAssignments`, `useOrgAttendanceSnapshot` +
  `staffing.ts`, `useDepositLog`, incident hooks, knowledge workspace `needs_action`,
  `useTeamGoals` pending verification) to `{ items (ordered per §5.2), counts, payrollBlocking,
  parked }`. Everything reads it; Home renders `items.slice(0, 3)`. The admission rule (§5.0)
  lives here as code, with a test per kind naming the record and the rule that admits it.
- `AttentionRow` / `AttentionPanel` — one row component, one panel that mounts the existing
  editor for the item's kind, with a confirmation step for consequential kinds and reversal
  actions wired to the existing audited paths (unseal, punch edit) or the new ones below.
- `ManagementShell` with the four rooms; `PeopleToday` (replaces `OrgSnapshotPanel` and the
  Home staffing band, built on `staffing.ts`), `PeopleRoster` (from `Team.tsx` minus
  bypasses/trend/staff codes), `PersonRecord` (from `EmployeeDetail.tsx` + `ScheduleTab` +
  permissions), `PayrollReadiness` (from `Reports.tsx` flag logic + in-period pending
  requests, with `?return=`), `OfficeIndex`, `OfficeSettings` (the cards from
  `Settings.tsx` office/people tabs), `MySettings` (the `me` tab), `Directory`.
- Route redirects listed in §3.4 and §3.8; `?return=` support in `AttendanceWorkspace`,
  `PunchEditorModal` host pages, `DepositLog`, and `KnowledgeWorkspace`.
- Nudges render on their surface via the existing `surface` column; the Inbox tab and its
  badge go; the member's Home counts open nudges.

**Small additions that the design depends on (each is one column or one policy):**
1. Managers can read the office's `attendance_exceptions` (today user-scoped).
2. A manager note on a bypass group ("seen", optional text) — or reuse `audit_events`
   with a `bypass_note` type; no new table.
3. Notification types for `knowledge_version_in_review` and `close_day_unsealed` so the
   bell agrees with Attention.
4. `PtoPolicySettingsCard` re-scoped to the org before it appears under Office settings.
5. Audited reversal paths where they do not exist yet: cancel an approved PTO request as a
   ledger transaction (partly exists through corrections), withdraw a version approval.
6. Optional: a `payroll_periods` "reviewed by / at" mark. Valuable, but the readiness flow
   works without it.

**Vocabulary changes (UI strings only; tables keep their names):** *sprint* → *challenge*;
*Office goal* → *This month's challenge*; office performance goals → *Targets*; *Approval
Queue* → *Attention*; *Today's Team* → *Today*; *Team* (manager) → *People*; *Team* (everyone)
→ *Directory*; *Requests* (Inbox tab) → *Doctor notes* (office-labeled); *Nudges* (Inbox tab)
→ rendered on their own surfaces.

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

---

## 11. Round 2 — what changed and why

Review of round 1 accepted the architecture and found that the concepts violated it in
places. Each point below names the violation and the fix now in the concepts and this
document.

| # | Round-1 problem | Round-2 fix |
|---|---|---|
| 1 | Home said "briefing" but carried Approve, Sign off, Seal, Fix the day, Record what happened. | Home rows carry one navigation action, Review or Open, landing on the exact Attention item. No consequential action exists on Home (§3.3). |
| 2 | Busy Home was an operational report: five items, an expandable roster, pace cards, a permanent challenge band, a Mine strip. | Three items, exceptions plus a count line, two status lines, the challenge only when noteworthy, Mine only when needed (§3.3). |
| 3 | "Step into this first" restated the first row of an already-ordered list. | Removed. Attention is a flat list by consequence; the first row is first (§5.2). |
| 4 | Attention's sources were listed without a rule, inviting it to become Management 2.0. | A hard admission rule with three tests and an explicit never-admitted list (§5.0). Pace, patterns, overtime, and nudges are excluded by name. |
| 5 | Inbox (messages, requests, nudges), Attention, and the bell overlapped; "request" meant four things. | Inbox is communication from people; Attention is record-generated work; notifications are delivery. Nudges leave Inbox; the doctor-notes tab drops "request" (§3.7). |
| 6 | The employee record had seven first-level sections. | Five: Overview · Time · Record · Development · Profile, with Time holding attendance, schedule, and time off as in-page blocks (§7.4). |
| 7 | A ten-second Undo after PTO approval, sign-off, and content approval implied casual reversal of audited writes. | Consequential actions confirm first; reversal is a separate audited action offered only where supported; undo remains for Park and Snooze only (§5.4). |
| 8 | The Payroll prototype showed "1 record" in the heading and "3 open records" on the button after fixes: two sources of truth. | One derived state drives every count, heading, row, button, and badge, across Home, Attention, Payroll, People, and mobile (§5.5). Verified in the concept: fixing an item in Attention updates Payroll and the badge together. |
| 9 | Heavy reliance on 10px uppercase monospace labels; small secondary text; small targets. | Band titles and group labels are sentence-case body text; secondary text is 13.5px; buttons are 34px on desktop and 40px on phones; monospace uppercase survives only for datelines and chrome; more space between groups. |
| 10 | Fix-and-return was described but only shown for Payroll. | Shown for Attention (punch editor, day explanation, seal, sign-off, version review) and Close the Day, with return pills and resolved rows; named as the product's benchmark rhythm (§8). |
