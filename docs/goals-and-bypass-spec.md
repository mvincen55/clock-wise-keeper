# Goals + Checklist-Bypass — feature specs (as prompted to Lovable)

Status: **being built in Lovable** (started 2026-07-30). This file preserves the exact
specs and the decisions behind them, so a future debugging session can tell intended
behavior from drift. Build order so far: Prompt 1 (Goals), Prompt 3 (redesign + AI
upgrades), Prompt 4 (brand pass) — sent. Prompt 2 (bypass, revised) and Prompt 5
(SMART goals) — pending.

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
8. **Polish never destroys the member's words:** Pathfinder's cleaned-up goal/task text
   is always shown with the original restorable underneath.
9. **Pathfinder threads are visible only to the goal's owner** — even for team goals.
   People ask coaching questions more honestly when it isn't effectively cc'ing the boss.
10. **SMART goals are coaching, never a gate** (Prompt 5): polish rewrites goals to be
    Specific/Measurable/Achievable/Relevant/Time-bound, chips teach the framework, but
    nothing ever blocks a save.

## Prompt 1 — Goals (sent)

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

## Prompt 2 — Checklist-bypass accountability loop (REVISED 2026-07-30 after schema + clock-out audit — pending)

Supersedes the original Prompt 2. Integration points verified against the codebase:
clock-out = `useClockAction()` in `src/hooks/useTimeEntries.ts` (writes `punches` +
`audit_events`); Eastern-local dates via `getToday()` in `src/lib/time-utils.ts`;
checklist gate must respect `per_person` / `cadence` / `audience` from migration
`20260723200000_checklists.sql`.

> Build the checklist-bypass accountability loop on top of the existing checklists and time clock. Conventions: org_id on every table, RLS on everything, roles owner/manager/employee, audit_events for anything notable (follow the useClockAction pattern), Eastern-local dates via src/lib/time-utils (getToday()).
>
> WHAT COUNTS AS "INCOMPLETE" — be exact:
> - Only checklist_items with cadence='daily' AND is_active=true AND per_person=true, on checklists the member can see (audience='all', plus 'manager' lists if the member is an owner/manager).
> - An item is complete for today iff a checklist_completions row exists for (item_id, period_key = today's daily key in the exact format useChecklists.ts computes, completed_by = this user).
> - Shared items (per_person=false) NEVER gate clock-out — but the dialog mentions how many are still open team-wide, as information only.
> - If the member has zero gating items, clock-out is never interrupted.
>
> NEW TABLE checklist_bypasses: id, org_id, user_id, employee_id, checklist_date (text, the Eastern-local day), bypassed_at, incomplete_count int, reason nullable, reason_submitted_at nullable, escalation_level int default 1, resolved bool default false, resolved_at nullable. UNIQUE(user_id, checklist_date) — at most one bypass row per member per day. RLS: members read their own rows and may update ONLY reason / reason_submitted_at / resolved / resolved_at on their own unresolved rows; org admins read all rows in their org; nobody deletes; admins can never edit a member's reason.
>
> NEW EDGE FUNCTION checklist-bypass (add [functions.checklist-bypass] verify_jwt = true to supabase/config.toml, and deploy it):
> Called when "Bypass & clock out" is confirmed, with the optional quick-note reason. Server-side with the service role:
> 1. Re-verify the member's incomplete gating items for today — never trust the client count. If nothing is actually incomplete, return { recorded: false } and write nothing.
> 2. Insert the checklist_bypasses row idempotently (ON CONFLICT user_id+checklist_date DO NOTHING). escalation_level = 1 + the count of that member's unresolved rows from PRIOR days.
> 3. Write an audit_events row (event_type 'checklist_bypass', details: incomplete_count, escalation_level) following the existing useClockAction pattern.
> 4. Notify every active owner and manager in the org BOTH ways: (a) insert into the existing notifications system (the one NotificationBell reads); (b) email via the enqueue_email RPC on the transactional_emails queue — insert email_send_log (template_name 'checklist_bypass', status 'pending') BEFORE enqueueing, resolve recipient emails server-side, mask addresses in function logs per the existing maskEmail pattern. Content: "[Name] bypassed their checklist on [date] with [N] item(s) incomplete. Reason: [note, or 'not given yet']." When escalation_level > 1, state this is their [n]th clock-out with an unanswered checklist bypass.
> 5. Return { recorded: true, escalation_level }.
>
> CLOCK-OUT UX — integration point: wrap useClockAction in src/hooks/useTimeEntries.ts, intercepting action 'clock_out' BEFORE the punch is written:
> - If the member has incomplete gating items, show a dialog FIRST: N items incomplete, the notice "Your manager and the doctor will be notified that you bypassed your checklist," an optional "Add a quick note" field, the informational line about open shared items if any, and two buttons: "Go back and finish" (primary — closes dialog, no punch) and "Bypass & clock out" (destructive).
> - On bypass: call the checklist-bypass function, then write the clock-out punch REGARDLESS of the function's result — never trap someone at the office. If it returns escalation_level > 1, show the firmer toast: "This is your [n]th clock-out with an unanswered checklist bypass. Your manager and the doctor have been notified again — this needs an answer."
>
> FOLLOW-UP UNTIL ANSWERED — NEVER block clock-in:
> - New hook useUnresolvedBypasses() reading the member's unresolved checklist_bypasses.
> - AppLayout renders a persistent banner on every page while any exist: "You bypassed your checklist on [date] — add your reason." It opens a reason dialog (textarea → RLS update setting reason, reason_submitted_at, resolved, resolved_at).
> - After their next clock-in with unresolved bypasses, show that same dialog once as a dismissible modal.
> - Reason submission is a direct client update via RLS — no function needed.
>
> MANAGER VIEW: a "Checklist bypasses" section on the Team page, admins only: member, date, incomplete count, escalation level, reason status, and the reason once given. Strictly read-only.
>
> Tone: the first bypass is matter-of-fact; escalations are firm; nothing is ever shaming.

## Prompt 3 — Goals redesign + smarter Pathfinder (sent)

> Redesign the Goals page (/goals). Keep ALL existing functionality, tables, and data — this is a UX/visual overhaul plus three AI upgrades. Brand accent is Purple Envelope purple #53406e (replace the orange accents on this page). Professional, calm, encouraging — no gamification, no confetti.
>
> VISUAL HIERARCHY + PROGRESS METERS:
> 1. Every goal card gets a real progress visual instead of bare text: a meter/bar showing tasks done out of total ("3 of 8 steps"), and beneath it a thin line showing how much of the month has elapsed — so anyone can see at a glance whether the work is ahead of or behind the calendar. Purple for completed work; if the tasks-done percentage badly trails the month-elapsed percentage, the meter shifts to amber. Gentle, never alarming.
> 2. Exactly ONE obvious primary action per card state: no goal yet → "Set this month's goal"; goal without a plan → "Break it down"; unaccepted plan → "Accept plan"; plan accepted → "Share an update". Everything else is a small ghost button.
> 3. Kill the "0 of 0 steps done" state — with no accepted plan, show "No plan yet" plus the Break it down action. On team cards, "No update yet" becomes a subtle muted caption, not body text.
> 4. Task titles must NEVER truncate to a few characters. On mobile each task row stacks: full wrapping title on top, date below, checklist toggle and delete aligned right. Compact single-line rows only on desktop.
> 5. Consistent status color language everywhere (cards, badges, meeting view): On track = green, At risk = amber, Done = purple. My goal card is visually elevated at the top; team cards are quieter.
>
> AI UPGRADES (extend the existing goal-assistant edge function, same AI plumbing):
> 6. New mode "polish_goal": when a member submits a goal, rewrite their raw words into a clear, professional one-sentence goal statement before saving — fix grammar, casing, vagueness — while preserving their intent. Show the polished sentence in an editable field with a small "your words: …" line they can restore from. Save what they confirm. Apply the same cleanup to task titles in "breakdown" mode so every task is a short imperative sentence.
> 7. New mode "chat" + new table goal_messages (id, org_id, goal_id, author 'member' | 'pathfinder', content, created_at; RLS: only the goal's owner can read or write it): every goal gets a persistent Pathfinder conversation. The goal card gets a "Talk to Pathfinder" expandable thread showing the full history; the member can ask anything about the goal and Pathfinder answers using the goal, its tasks, its updates, and the whole thread as context — it remembers everything ever said about this goal across sessions.
> 8. Extend "draft_update" mode to also read the goal's Pathfinder thread when drafting meeting updates.
>
> Do not change the goals / goal_tasks / goal_updates schemas beyond adding goal_messages. Team/private visibility rules stay exactly as they are.

## Prompt 4 — Global brand pass (sent)

> Global rebrand pass, purely visual — no functionality changes. The product is Purple Envelope, not TimeVault. Replace the TimeVault name and orange clock mark in the app header/layout with "Purple Envelope" and a simple purple envelope mark. Switch the app's primary accent color from orange to #53406e everywhere it appears: buttons, links, active nav states, toggles, focus rings, badges — keeping text contrast accessible. Also update the PWA manifest name/theme color and any remaining "TimeVault"/"TimeKeeper" strings in nav labels and page titles. Leave printed-form footers alone for now; that's a separate pass.

## Prompt 5 — SMART goals backbone (pending)

> Make SMART goals the backbone of the Goals feature — as coaching, never as a gate. SMART = Specific, Measurable, Achievable, Relevant, Time-bound. Keep the encouraging tone; nobody should ever see a red error or be blocked from saving.
>
> GOAL CREATION:
> 1. Under the goal input, show a small one-line hint: "Great goals are SMART: specific, measurable, achievable, relevant to your role, and bound to this month."
> 2. Upgrade the "polish_goal" mode of goal-assistant: the polished goal statement it returns must be a genuine SMART goal for a one-month horizon — if the member's raw words lack a measure, infer a reasonable one from the goal and their role (e.g. "work on explaining treatment to patients" → "Use the teach-back method at every treatment presentation this month and ask a teammate for feedback at least 4 times") — while preserving their intent. The polished version stays editable with the original words restorable, exactly as it works now.
> 3. After polishing, show a compact SMART summary as five small labeled chips (S/M/A/R/T), each with a few words on how the polished goal satisfies it (e.g. M: "4 feedback asks"). This teaches the framework quietly. If an element is genuinely missing, that chip says so gently ("add a number to make this measurable") — but the member can still save.
>
> PATHFINDER BREAKDOWN + CHAT:
> 4. In "breakdown" mode, the 4–8 tasks must ladder up to the goal's measurable target — completing the plan achieves the measure by month end. Include the target in the function input.
> 5. In "chat" mode, when a member asks for help shaping or adjusting their goal, coach toward SMART naturally in conversation.
>
> MEETING UPDATES:
> 6. In "draft_update" mode, frame the draft against the goal's measurable target where one exists ("Target: X · So far: Y") using goal_tasks progress and the thread. The team card + meeting view show the target line under the goal title when the goal has one.
>
> Store the measurable target as a new nullable text column goals.smart_target (filled from the polished goal; editable). No other schema changes.

## Known build risks (check these when testing)

- **Bypass depends on clock-out knowing checklist state.** Integration point is
  `useClockAction` (Prompt 2 names it). Only **per-person, daily-cadence** items gate
  clock-out (see `docs/runbook.md` §8 for the `period_key` traps).
- **Goal-linked checklist items gate too.** "Add to my checklist" creates real
  checklist items; if they're per-person daily, they join the clock-out gate. That's
  intended — accepted plan tasks are commitments — but verify it doesn't surprise.
- **Pathfinder schedule-awareness** is the most likely part to come back shallow —
  test with a member who has approved PTO and confirm suggested due dates dodge it.
- **New edge functions must actually deploy.** goal-assistant (Prompt 1) and
  checklist-bypass (Prompt 2) — probe per `docs/runbook.md` §1 if the UI toasts
  "Failed to send a request to the Edge Function."
