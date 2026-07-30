# Goals + Checklist-Bypass — feature specs (as prompted to Lovable)

Status: **being built in Lovable** (started 2026-07-30). This file preserves the exact
specs and the decisions behind them, so a future debugging session can tell intended
behavior from drift. Built in two prompts, Goals first, bypass second.

## Product decisions (the "why")

1. **Members pick their own monthly goal — no approval step.** Accountability comes
   from visibility: the whole team sees it at the next team meeting, so nobody picks
   anything silly. Approval would just be more work for the manager/owner.
2. **Two goal types:** `team` (default; visible to everyone; discussed at meetings) and
   `private` (member + managers/owners only; set together in a sit-down; optional —
   not everyone will have one).
3. **AI helper is named "Pathfinder"** (light branding in the panel header only; the
   button says "Break it down"). Tone is self-improvement/culture — **no rankings,
   leaderboards, or gamification.**
4. **Pathfinder is schedule-aware:** suggested due dates avoid the member's approved
   time off, office closures, and go lighter on short-staffed days (teammates' PTO).
5. **Work-style questions are deliberately separated from Goals UI.** They'll be asked
   in *onboarding* (see `docs/team-onboarding.md`) framed as get-to-know-you culture
   questions. Members must not learn the answers shape their AI plans — visible
   connection invites gaming (answering to minimize work). Goals ships the
   `work_style_profiles` table empty; Pathfinder reads it if present, never mentions it.
6. **Meeting updates are AI-drafted, human-approved:** the draft assembles what the
   member actually completed (goal tasks + linked checklist items) since the last
   update plus the member's quick notes; the member edits before submitting.
7. **Bypass loop philosophy:** never block clock-in (nobody should answer questions
   off the clock), never hard-block clock-out (emergencies are real) — but bypassing
   always notifies manager AND owner (in-app + email), an unanswered bypass nags
   persistently, and repeat clock-outs escalate the wording and re-notify.

## Prompt 1 — Goals (as given to Lovable)

> Build a "Goals" feature. Context: multi-tenant practice-ops app — org_id on every table, RLS on everything, roles owner/manager/employee, React + shadcn/ui + React Router. Follow existing code patterns. This feature is about self-improvement and team culture, NOT competition — keep the tone encouraging, never gamified or ranked.
>
> New page at /goals ("Goals"), added to the main nav.
>
> NEW TABLES (org_id + RLS per existing patterns):
> - goals: id, org_id, user_id, title, description, month (text e.g. "2026-08"), visibility (team | private), status (active | completed | archived), created_by, created_at, updated_at
> - goal_tasks: id, org_id, goal_id, title, due_date, done bool, done_at nullable, sort_order
> - goal_updates: id, org_id, goal_id, author_id, status (on_track | at_risk | done), content text, auto_drafted bool, created_at
> - work_style_profiles: id, org_id, user_id unique, answers jsonb, updated_at
>   (NOTE: this table is populated later by a separate onboarding flow — do NOT build any UI for answering or editing these questions in the Goals feature.)
>
> GOAL CREATION — member picks their OWN goal, no approval step:
> 1. If the logged-in member has no active team-visibility goal for the current month, the top of the page prompts them to set one (title + description). It goes active immediately. Accountability comes from visibility: the UI makes clear "the whole team will see this at the next team meeting."
> 2. Goals default to visibility = team. The member can instead mark a goal private, and managers/owners can create a private goal WITH a member (e.g. from a sit-down conversation). Private goals are visible only to that member + managers/owners (enforce in RLS) and never appear in the team grid or meeting view. Nobody is required to have a private goal — it's just an option.
>
> PATHFINDER BREAKDOWN (AI, context-aware):
> 3. On any of my active goals, a "Break it down" button (brand the panel header "Pathfinder" only) calls a new edge function goal-assistant (mode = "breakdown"), using the same AI plumbing as fof-assistant. Pass it: goal title + description, AND real schedule context from the existing data: the member's upcoming approved time off this month, teammates' approved time off (so it knows short-staffed days), and office closures from the office calendar. If a work_style_profiles row exists for the member, include it too; otherwise proceed without it. IMPORTANT: never reveal in any UI copy or AI output that work-style answers influenced the plan — no "based on your answers…" phrasing anywhere. The function returns 4–8 concrete action tasks with realistic due dates spread across the month that AVOID their days off and office closures and go lighter on short-staffed days. Show tasks in an editable list (rename, delete, move dates) → "Accept plan" saves to goal_tasks. Each accepted task gets an "Add to my checklist" toggle that creates an item in the existing checklist system for that member on that due date.
>
> MEETING UPDATES — a small form, AI pre-fills it:
> 4. "Share an update" on my goal opens a short form. On open, call goal-assistant (mode = "draft_update"): it looks at what the member has actually done since their last update (goal_tasks completed, linked checklist items checked off) plus anything the member types into a "quick notes" box, and drafts a polished 3–5 sentence update for the team plus a suggested status (On track / At risk / Done). The member edits freely, then submits → goal_updates (auto_drafted = true if they kept the AI draft substantially).
>
> TEAM VIEW + MEETING VIEW:
> 5. Top of /goals: card grid, one card per active team member, showing current-month TEAM goal, tasks done/total, and latest update. "No goal set yet" cards are clearly marked. No rankings, no leaderboards.
> 6. A "Meeting view" toggle: one clean screen listing every member's latest update for the current month (goal title, status, update text, tasks done/total) — this is what the team reads together at the meeting. Private goals are excluded.
> 7. Progress = tasks done/total only. Only the goal's owner can add updates or check off tasks. Everyone can view team goals; private goals follow the visibility rule above.

## Prompt 2 — Checklist-bypass accountability loop (as given to Lovable)

> Build a checklist-bypass accountability loop on top of the existing daily checklist and time clock. Same conventions: org_id everywhere, RLS, roles owner/manager/employee.
>
> New table checklist_bypasses: id, org_id, user_id, bypassed_at, checklist_date, reason nullable, reason_submitted_at nullable, escalation_level int default 1, resolved bool default false. RLS matching existing patterns.
>
> 1. Clock-out: if the member has ANY incomplete items on their daily checklist, show a dialog before clock-out completes: how many items are incomplete, and the notice "Your manager and the doctor will be notified that you bypassed your checklist." Buttons: "Go back and finish" (primary) and "Bypass & clock out" (destructive). Include an optional text field "Add a quick note (optional)". On bypass: complete the clock-out, insert a checklist_bypasses row, and notify ALL managers and owners two ways — in-app notification (existing notification system) AND email via the existing transactional email queue (enqueue_email RPC, label checklist_bypass): "[Name] bypassed their checklist on [date] with [N] items incomplete. Reason: [reason, or 'not given yet']."
>
> 2. Follow-up until answered — NEVER block clock-in:
>    a. While any bypass row has no reason, after the member's next clock-in show a dismissible modal asking "You bypassed your checklist on [date] — what happened?" AND keep a persistent banner visible on every page until they submit a reason.
>    b. If the member clocks out again while any bypass is still unanswered, increment escalation_level, use noticeably firmer copy: "This is your [n]th clock-out with an unanswered checklist bypass. Your manager and the doctor have been notified again — this needs an answer." Re-notify managers/owners by both channels.
>    c. When they submit a reason, mark the row resolved and clear the banner/modal.
>
> 3. Manager/owner view: add a "Bypasses" section in whichever fits best (Team page or Approval Queue) listing bypass events with date, member, incomplete count, escalation level, and the reason once given. Managers can view but never edit the reason.

## Known build risks (check these when testing)

- **Bypass depends on clock-out knowing checklist state.** Today nothing links the
  time clock to `checklist_completions` — if Lovable reports they're disconnected,
  that link is the real work. Only **per-person, daily-cadence** items should gate
  clock-out (see `docs/runbook.md` §8 for the `period_key` traps).
- **Pathfinder schedule-awareness** is the most likely part to come back shallow —
  test with a member who has approved PTO and confirm suggested due dates dodge it.
- "Add to my checklist" must write into the real checklist model
  (`checklist_items`/`checklist_completions`), not a parallel task list.
