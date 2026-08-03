# Dashboard + Practice Vitals — feature spec

Status (2026-07-30): Prompt 11 v3 sent (role-shaped redesign, `src/components/dashboard/`
exists) · Prompt 13 v2 in flight (deposit vitals) · Prompt 15 pending (Pulse orb,
texture, motivation layer).

## Product decisions (the "why")

1. **Role-shaped, not role-filtered.** Owner, manager, and team member get genuinely
   different layouts and priorities — not one page with cards hidden. Same design
   language and shared atoms (gauge, ring, timeline, avatar wall), different composition.
2. **Only real data.** Every widget runs on data that exists today (time, schedules,
   PTO, checklists, bypasses, goals, training, deposit log, notifications, calendar).
   Nothing stubbed for features that don't exist (see Deferred in README roadmap).
3. **Practice Pulse is transparent.** The orb (green/amber/red) always expands to
   show which signals drove its state. No black-box 0–100 score.
4. **Celebrations are seals, not confetti.** The on-brand moment is a purple
   wax-seal stamp (an envelope sealed = something accomplished): collections target
   hit (team-wide, monthly), goal completed, quiz/roleplay passed, update shared
   before the meeting. One second, quiet, earned.
5. **Gamification motivates, never exploits** (corrected 2026-07-30 — supersedes the
   earlier "no gamification" stance): rewards compute ONLY from verified system
   records; streaks PAUSE on approved days off/PTO/closures, never break; no public
   rankings — members compete with themselves. Explicitly excluded: attendance
   streaks (pressure to work sick), bypass-related rewards, anything self-reported.
6. **Texture with restraint.** Ambient breathing orb, animated rings, count-up
   numbers, hover lift, 150–200ms page transitions, subtle paper texture on elevated
   surfaces — and `prefers-reduced-motion` honored everywhere.
7. **Deposit vitals are department-split** (Prompt 13 v2): hygiene vs doctor
   cancellations + no-shows (they tell different stories — hygiene = recall/reminder,
   doctor = schedule management), entered via sliders (0–15, snap, calm→amber tint,
   tap-to-type overflow), same-day editable, audited edits after. Production is a
   separate number from collections — both tracked, neither replaces the other.

## Prompt 11 v3 — Role-shaped dashboard (sent)

> Redesign the Dashboard (/) as role-shaped front pages: one design language, genuinely different layouts per role — NOT the same page with cards hidden. Calm, modern, professional restraint (Linear/Notion feel), #53406e accent, whitespace, color only to carry meaning. Micro-visualizations instead of number rows: avatar wall with status dots for who's in, timeline with highlighted gaps for missing shifts, rings and gauges for progress. Every card tells a story — not "82%" but "Collections are 6% ahead of pace for the month."
>
> GROUND RULE — every widget must run on data that EXISTS today: time entries/punches, schedules, PTO balances/requests, days off, office closures + team_meeting calendar events, checklists + completions + checklist_bypasses, goals/goal_tasks/goal_updates, training modules/assignments/attempts, deposit log entries, notifications, org members/employees, OrgSnapshotPanel, useApprovalCounts, useUnresolvedBypasses. Do NOT build widgets for production, write-offs, procedure mix, chair utilization, lab cases, open positions, license tracking, announcements, shift swap, or weather — those need features that don't exist yet. Deferred, not stubbed.
>
> 1) PRACTICE PULSE (all roles, very top): a circular orb — green "Healthy" / amber "Watch" / red "Needs attention" — computed from real signals: missing shifts today, unresolved checklist bypasses, pending approvals, collections pace vs month-elapsed, shared-checklist completion. Slow subtle animation. Tapping expands to show exactly which signals drove the state — transparent, never a black box, no 0–100 score.
>
> 2) OWNER layout (NO clock card — owners don't punch; but add an org setting "owners clock in", default off):
> - Collections gauge: month-to-date computed live from the deposit log vs the monthly_collections_target setting, with an ahead/behind-pace story line.
> - Monthly collections trend mini-chart from deposit log history.
> - Payroll as % of collections (time entries × pay rates), with trend.
> - Staffing strip: avatar wall of who's in/out/missing today + upcoming PTO conflicts (overlapping approved PTO).
> - Needs attention (renders only when non-empty): pending approvals, new + aging unresolved bypasses, members with no goal this month.
> - Quick actions: Approvals, Reports, Team, Settings.
>
> 3) MANAGER layout (clock card only if hourly — same setting family):
> - Live office status: avatar wall + a timeline of today's punches and exceptions.
> - Today's checklist completion: shared items team-wide, plus per-person gaps.
> - Collections progress ring (same deposit-log data, smaller).
> - Needs attention: pending approvals, missing punches, members approaching overtime, new bypasses, members with no goal.
> - Quick actions: Approvals, Team, Training (assign), Reports.
>
> 4) TEAM MEMBER layout: MY DAY hero (clock + checklist chip + PTO chip), NEEDS ATTENTION member items (unresolved bypass reason, missing shifts, training due, unread notifications), PRACTICE GOAL card per the visibility setting, TODAY AT THE OFFICE (who's out, closures, next team meeting), MY MOMENTUM (compact goal card + training), MY NOTES (user_notes, strictly owner-only RLS), TIME DETAILS at the bottom.
>
> Shared atoms across all layouts (same gauge, ring, timeline, avatar wall components — differ by composition, not by codebase forks). Empty sections render nothing. Employees never see manager/owner content; the collections visibility setting is respected everywhere.

### Amendment (sent with 11 v3) — motivation layer rules

> Light motivational gamification is WELCOME on the team member dashboard — streaks, badges, milestone moments. Two inviolable rules: (1) rewards follow VERIFIED events only (checklist completions, punches, quiz passes, goal tasks) — never self-reported input; (2) streaks PAUSE on approved days off/PTO/closures, never break. Starting set: daily checklist streak; "shared before the meeting" badge; personal milestone moment on goal completion. No public rankings, no leaderboards.

## Prompt 13 v2 — Deposit Log practice vitals (in flight)

> Extend the Deposit Log to capture the day's practice vitals, and surface them in dashboards. Same conventions: org_id everywhere, RLS, Eastern-local dates.
>
> 1) DATA: per deposit log entry (org/day), add: production_amount (dollars, nullable), hygiene_cancellations int default 0, hygiene_no_shows int default 0, doctor_cancellations int default 0, doctor_no_shows int default 0. Production = what the practice produced that day; the deposit = what was collected. Both matter; neither replaces the other.
>
> 2) UI — VISUAL and fast, never a form people dread: a "Today's vitals" section on the deposit log: a production $ input, then four slider rows — Hygiene cancellations, Hygiene no-shows, Doctor cancellations, Doctor no-shows — each slider ranging 0–15, snapping to whole numbers, with the current value shown large beside it and the slider tint shifting from calm purple toward amber as the count climbs. One thumb-drag answers each question; nobody types. Add a small tap-to-type overflow for the rare bigger day.
>
> 3) CONSUME the data (wire in with the dashboard redesign — no other new surfaces):
> - Owner dashboard: a Production gauge beside Collections — month-to-date production vs month elapsed; once history exists, compare to last month ("production tracking 4% ahead of last month").
> - A schedule-disruption visual, NOT a table: this month's hygiene vs doctor cancels/no-shows as a small paired-bar or dot graphic so the pattern reads instantly.
> - Practice Pulse: a disruption spike today nudges the orb toward Watch.
> - Trends: monthly production and disruption mini-charts from deposit log history.
>
> 4) Editing rules: vitals editable same-day (part of closing out the day); after that, owner/manager edits write an audit_events entry following the existing pattern.

## Prompt 15 — Practice Pulse orb + texture + motivation layer (pending)

> Three things: the Practice Pulse orb, a site-wide texture/movement pass, and a motivation layer in the right places. Professional and calm throughout — the app should feel like it's breathing, never like a video game.
>
> 1) PRACTICE PULSE (dashboard, all roles, very top — if it exists from the redesign, upgrade it to this):
> - A circular orb showing office health right now: green Healthy / amber Watch / red Needs attention, computed from real signals only: missing shifts today, unresolved checklist bypasses, pending approvals, collections pace vs month elapsed, shared-checklist completion, and today's schedule-disruption spike (cancels/no-shows from deposit vitals).
> - Slow ambient breathing animation; smooth color transitions, never flashing. Tapping expands to show exactly which signals drove the state — transparent, no black box, no numeric score.
> - Celebration rule: when the practice hits the monthly collections target, the orb takes a brief "sealed" state — a one-second purple wax-seal stamp moment, once per month, visible to every role. An envelope getting sealed — on brand, quiet, earned.
>
> 2) TEXTURE + MOVEMENT across the whole app (restraint is the rule):
> - Progress rings and meters animate on load (goals, collections, training).
> - Dashboard metric numbers count up instead of appearing static.
> - Cards get a subtle hover lift; primary buttons a soft press response.
> - Fast fade/slide page transitions (150–200ms, nothing showy).
> - A very subtle paper/envelope texture treatment on elevated surfaces (header, hero cards) — felt, not seen.
> - Honor prefers-reduced-motion: all of this goes minimal when the OS asks.
>
> 3) MOTIVATION LAYER (house rules are inviolable: rewards compute from VERIFIED system events only — never self-reported input; streaks PAUSE on approved days off, PTO, and closures, never break; no public rankings or leaderboards anywhere; members compete with themselves):
> - Checklist streak on the member dashboard: consecutive days with all per-person daily items done, showing a "paused (PTO)" indicator instead of resetting on approved time off.
> - Milestone seals: completing a monthly goal, passing a module quiz or roleplay, sharing a goal update before the team meeting — each earns a small wax-seal badge on the member's own view. Private by default.
> - Training momentum: a personal "modules completed" count with forward framing ("2 away from your best month") — never comparison framing.
> - Deposit close-out streak for whoever runs the deposit log: consecutive business days the log was closed out. Verified from deposit log rows.
> - Goal completion: marking a goal complete plays the one-second seal animation, then back to calm.

## Known build risks

- **Pulse signal honesty.** The orb must compute from live queries, never cached
  snapshots — a green orb over a red reality is worse than no orb.
- **Reduced-motion compliance** is the first thing sprint-code skips; check it.
- **Streak pause logic** depends on reading approved days-off/PTO/closures
  correctly — test a streak across a PTO day explicitly.
- **Vitals slider overflow** (tap-to-type) — big days must not be clamped to 15.
