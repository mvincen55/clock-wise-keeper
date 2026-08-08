# Office Intelligence — feature spec

Status (2026-07-30): Prompts 16 + 19 v2 pending. This layer makes the app feel
smart everywhere — proactive, grounded, learning — rather than smart only when
tapped. Pairs with `docs/messaging-spec.md` (16 is the brain, 17 the voice).
Prompt 19 v2 supersedes v1 (sprint goals gained scoping + verification tiers).

## Product decisions (the "why")

1. **Ambient, not on-demand.** Today's AI is summoned (Break it down, chat, draft).
   This layer speaks first: briefs at day-start, nudges at transition moments
   (clock-in, morning, clock-out, meeting), quiet otherwise.
2. **Receipts or silence.** Every claim cites real numbers. Generic filler is a
   bug. The brief must sometimes say "nothing to report."
3. **The dismissal loop IS the learning.** `acted_on` vs `dismissed` per nudge
   kind; repeatedly-dismissed kinds go quiet for 2 weeks.
4. **The office's language, not internet language.** assistant_memories + office
   docs + settings are authoritative — real names, real targets, real rules.
5. **Calm rationing.** Max ONE nudge per surface/person per day. Fail-open always.
6. **The Huddle boundary is load-bearing** — no patient-related storage or
   computation anywhere near the huddle page.
7. **Suggestions propose, managers dispose.** Incident follow-through, sprint
   suggestions, and document-verdict overrides all keep humans senior.
8. **THE OFFICE AI DOCTRINE applies to every AI surface** (goal-assistant,
   training-builder, training-roleplay, office-insights, AI channel): the mission
   in every system prompt is "make this office excellent within the owner's
   vision, rules, policies, and actual structure." It encourages and reminds
   EVERYONE — owners and managers included — with "might not be a bad idea to…"
   framing. Never pushy, never shaming, receipts cited, quiet when there's nothing.
9. **Sprint goals are scoped and tier-verified (19 v2):**
   - Scope: whole team / department (clinical·clerical via employees.team) /
     individual. Visibility follows scope (department goals → that department +
     admins; individual → that member + admins).
   - Verification is a per-sprint setting because stakes differ: HONOR (pizza
     tier — auto-declares) · MANAGER_APPROVAL (one-tap recorded decision,
     verified_by/at) · DOCUMENT (upload the outside report — e.g. the recall
     export — the STRONG model reads it, extracts the metric, compares to
     target, and renders a verdict WITH RECEIPTS: the number found + where).
   - The verifier can OVERRIDE a document verdict with a required reason —
     humans outrank the document reader.
   - Verifier = manager; if no manager exists → owner; if the manager is the one
     being verified → owner. Nobody grades their own homework.
   - The AI runs the lifecycle: announce on create (manager never says it out
     loud), mid-period progress nudges, verification push at period end
     ("upload the recall report to verify"), final declaration (seal on a win).

## Prompt 16 — Office Intelligence layer (pending)

> Build the Office Intelligence layer: AI that is proactive across the app, grounded in the office's own data, and learns from how people respond. House rules: every claim cites the real data behind it; office rules are authoritative (assistant_memories + office docs); NO patient data anywhere; calm colleague tone; at most ONE nudge per surface per day; everything fails open.
>
> NEW TABLE office_nudges: id, org_id, user_id nullable (null = office-wide or role-targeted), surface text ('dashboard'|'clock'|'checklists'|'goals'|'training'|'huddle'|'deposit'), kind text, content text, data_refs jsonb (the numbers it cites), status ('new'|'shown'|'acted_on'|'dismissed'), created_at, resolved_at. org_id + RLS: members read/update only their own and office-wide nudges; admins read all.
>
> NEW EDGE FUNCTION office-insights (verify_jwt = true, add to supabase/config.toml), two jobs:
>
> 1) THE OFFICE BRIEF (dashboard, above everything except Practice Pulse; regenerates on first visit of the day): 2–3 sentences synthesized from live numbers, per role. Member: team coverage today, their checklist count, their next goal task + due date, collections pace. Owner/manager adds: pending approvals, yesterday's production/collections/disruption vitals, aging bypasses. Cite ACTUAL numbers and use the office's real names, targets, and rules — the world the owner built should be audible. Generic filler is a bug.
>
> 2) PROACTIVE NUDGES (computed, deduped, a few per day max office-wide): goal stall (no task checked in 7+ days → nudge the goal's owner), checklist timing pattern ("closing items usually wrap by 5:40 — it's 5:50"), early-month no-goal nudge, PTO conflict prediction (overlapping requests, before approval), deposit anomaly (production 30%+ under the trailing average for that weekday), incident follow-through (new incident report → suggest to a MANAGER: assign a related module or add a checklist item — manager approves, never automatic), training recommendation tied to the member's active goal.
> LEARNING LOOP: acted_on vs dismissed is recorded per nudge kind; kinds repeatedly dismissed go quiet for that member/office for 2 weeks. This is how the system learns what lands.
>
> SURFACES:
> - Dashboard: Office Brief card; nudges appear in Needs attention.
> - Morning Huddle: keep the existing verbal agenda EXACTLY as is (patient talk stays in the room — do not store or compute anything patient-related) and add a computed "Office context" block above it: who's out today, yesterday's vitals, closures + team meetings this week, days until the next team meeting. Business data only.
> - Clock: after clock-in, one contextual line when there's something worth saying ("Sarah's out — her shared items are open"); silent otherwise.
> - Checklists: the timing-pattern nudge as a quiet line when relevant.
> - Goals: stall nudge on the goal card.
> - Training: goal-linked module recommendation under My Training when relevant.
>
> When finished: deploy office-insights and confirm it responds.

## Prompt 19 v2 — Reminder hooks + scoped/verified sprint goals + AI doctrine (pending)

> Two additions: AI-triggered reminders, and team sprint goals the office AI runs — scoped and verified. Apply the OFFICE AI DOCTRINE to every AI surface (goal-assistant, training-builder, training-roleplay, office-insights, the AI channel): the mission is "make this office excellent within the owner's vision, rules, policies, and actual structure." It encourages and reminds EVERYONE including owners/managers — never pushy, never shaming, receipts cited, quiet when there's nothing.
>
> 1) REMINDER HOOKS (scheduled AI follow-ups):
> - New table reminder_hooks: id, org_id, user_id, kind ('goal_task_due' | 'training_due' | 'plan_stall' | 'checklist_gap' | 'sprint_progress' | 'follow_up' | 'sprint_verify'), ref_id nullable, fire_at, status ('pending' | 'sent' | 'cancelled'), created_at. org_id + RLS (member reads own).
> - A scheduled job (extend office-insights or training-reminders) fires due hooks and delivers them as AI-channel messages (or notifications until messaging ships): goal task due, training due, plan stalling, committed follow-ups, sprint progress, and verification pushes. Max one reminder per person per day, dismissal-learning, fail-open.
>
> 2) TEAM SPRINT GOALS — scoped and verified:
> - New table team_goals: id, org_id, title, metric text (what's counted), target_count int, period ('week' | 'month'), starts_on, ends_on, reward text (pizza, gift card, bonus — free text), progress int default 0, scope ('team' | 'department' | 'individual'), scope_department nullable ('clinical' | 'clerical'), scope_user_id nullable, verification ('honor' | 'manager_approval' | 'document') default 'honor', status ('active' | 'pending_verification' | 'won' | 'missed' | 'cancelled'), created_by, ai_suggested bool default false, verified_by nullable, verified_at nullable, verification_note nullable, created_at. org_id + RLS: team-scope readable by all; department-scope by that department + admins; individual-scope by that member + admins. Members can only increment progress on honor-verification goals in their scope.
> - SCOPES: the whole team, one department (clinical/clerical via employees.team), or a single person (an individual bonus goal).
> - VERIFICATION FLOW: when the period ends OR the target is reached, status → 'pending_verification' and the AI pushes the verifier — the manager; if no manager exists, the owner — via whichever method the sprint was set up with:
>   a) HONOR: no verification — the result declares automatically (pizza-tier goals).
>   b) MANAGER_APPROVAL: one-tap electronic approve/decline with an optional note. Not a signature — a recorded decision (verified_by, verified_at).
>   c) DOCUMENT: the AI asks the verifier to upload the outside report (e.g. the recall export from the office's external system — PDF, screenshot, or phone photo). The STRONG model reads the document, extracts the relevant metric (how many calls were actually made), compares it to the target, and renders a verdict WITH RECEIPTS: the number it found and where in the document it found it. Supported → 'won', reward declared, celebration seal. Not supported → 'missed', showing the document's numbers plainly.
> - The verifier can OVERRIDE the AI's document verdict with a required reason — humans outrank the document reader, and the override is recorded.
> - THE AI RUNS IT END TO END: announces the sprint when created (the manager never says a word out loud), mid-period progress nudges with real numbers, the verification push at the end ("upload the recall report to verify"), and the final declaration.
> - AI SUGGESTS SPRINTS: weekly, one dismissible suggestion to each manager based on office data ("the recall list is long — might not be a bad idea to run a calls sprint verified against the outside report"), marked ai_suggested when accepted.

## Sprint Builder v3 — the Intelligent Sprint Builder (shipped 2026-08-08)

Upgrades "Start a sprint" from a blank form into an AI-assisted builder. The
manual path is untouched — AI is assistance, not a requirement.

- **Position-first flow.** The dialog opens on "Who do you want to challenge?"
  — Whole team, each operational role actually configured in the office
  (from `employee_operational_roles`, with head counts), the two departments,
  or one person. Sprints gained a fourth scope: `role` + `scope_role`
  (migration `20260808120000`), with RLS via `my_operational_roles()` and
  audience fan-out in office-pulse honouring coverage windows.
- **`sprint-architect` edge function** (verify_jwt, owner/manager only,
  allowlisted `scrub`). Action `ideas` returns 3-5 suggestion cards
  (title, goal, what-counts, target, period, verification, reward, one-line
  "why", category) grounded in: computed office signals, weekly closeout
  rollups, schedule utilization, sprint history (with outcomes), and the
  office's recorded rules (practice settings, broken-appt policy, assistant
  memories, published knowledge). Action `rewards` returns small practical
  reward ideas sized to the group.
- **Signals are code, not vibes.** `_shared/sprint-signals.ts` (unit-tested)
  rolls `deposit_logs` into weeks and detects: disruptions rising across
  consecutive weeks, improvement that slipped back, sustained staffing
  strain, and sustained open schedule time from `provider_day_metrics`.
  Thin data yields silence; one bad week is never a pattern.
- **Sprint vs. intervention.** Signals carry a `watch`/`concern` level. A
  `concern` renders as a separate ⚠️ "noticed something" banner (review /
  build a sprint around it / not now) — serious problems are surfaced to the
  manager, not gamified by default. Structurally enforced: the model cannot
  return a concern unless the deterministic layer found one.
- **Office rules are hard boundaries.** The prompt's charter: recorded
  policies outrank any metric; no treatment pressure, no out-of-role work,
  no schedule manipulation, no skipped documentation; attribution care (a
  metric in a role's column ≠ that role caused it); only the three real
  verification methods may be suggested; every "why" must trace to a
  provided fact. Manager direction ("Anything you want to work on?") is
  honoured but never overrides the charter, and passes the jailbreak guard.
- **Learning from outcomes.** `team_goals.category` records what an
  AI-built sprint was about; history (target vs. progress vs. status, with
  categories and scopes) feeds every future generation so goals aren't
  repeated blindly — revisits must explain themselves ("improved in May,
  slipping again"). Shuffle ("Show me different ideas") excludes titles
  already shown this session.

## Known build risks

- **Nagware drift.** If the dismissal loop isn't real (kinds never go quiet), the
  layer becomes noise — test that dismissing a kind twice suppresses it.
- **Receipt honesty.** data_refs must contain the actual figures cited; the
  document verdict must name where in the document the number came from.
- **Document parsing brittleness.** Outside reports vary — if the AI can't find
  the metric, it must say so and ask for a clearer export rather than guess
  (a guessed verdict is worse than none).
- **Scope visibility leaks.** Department/individual sprints must not leak into
  other members' dashboards — probe RLS as a member outside the scope.
- **Huddle leakage.** Context block sources from business tables only.
- **Reminder delivery before messaging ships.** reminder_hooks degrade to plain
  notifications if the AI channel doesn't exist yet.
- **office-insights must deploy** — probe per docs/runbook.md §1.
