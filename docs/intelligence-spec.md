# Office Intelligence — feature spec

Status (2026-07-30): Prompts 16 + 19 v3 + 21 + 23 + 22 pending. This layer makes
the app feel smart everywhere — proactive, grounded, learning. Pairs with
`docs/messaging-spec.md` (16 is the brain, 17 the voice; 23 is the privacy
foundation and should land BEFORE 17). Order note: 23 → 17 → 22.

## Product decisions (the "why")

1. **Ambient, not on-demand.** This layer speaks first: briefs at day-start,
   nudges at transition moments, quiet otherwise.
2. **Receipts or silence.** Every claim cites real numbers. Generic filler is a
   bug. The brief must sometimes say "nothing to report."
3. **The dismissal loop IS the learning** — and the accessibility feature: it
   learns WHEN each person actually responds.
4. **The office's language, not internet language.** assistant_memories + office
   docs + settings are authoritative.
5. **Calm rationing.** Max ONE nudge per surface/person per day. Fail-open always.
6. **The Huddle boundary is load-bearing** — no patient-related storage or
   computation anywhere near the huddle page.
7. **Suggestions propose, managers dispose.** Humans stay senior.
8. **THE OFFICE AI DOCTRINE, sharpened:** every system prompt's mission —
   "make THIS office the best dental office it can be, within the owner's vision,
   rules, policies, and actual structure." Parochial by design: it only cares
   about this office. Motivating, never obnoxious, genuinely good for the team
   member — INCLUDING the owner/manager — or it's management-by-robot.
9. **Sprint goals are scoped and tier-verified; proof is process-and-discard.**
10. **(folded into 9)**
11. **THE EXECUTIVE CO-PILOT: the AI carries the remembering** — design for the
    executive-function pattern, never label any person. One-tap capture,
    just-in-time reminders, tiny first steps, shame-free deferral, quiet as a
    feature.
12. **TRANSCRIPTS ARE TRANSIENT; LEARNINGS ARE DISTILLED (Prompt 23).** Roleplay
    transcripts are process-and-discard: score + brief feedback retained, raw
    transcript never persisted ANYWHERE (same rule as verification proof). No
    massive context windows — AI context comes from `ai_member_memory` (curated
    notes: preferences, patterns, strengths) + current records. Members can read,
    edit, and delete their own memory notes ("what the office remembers about
    you"); NO admin read. The AI never records anything it wouldn't say to the
    member's face; deleting a note stops that kind of tracking.
13. **THE PROCESS & MANAGEMENT ADVISOR (Prompt 22)** is the doctrine applied to
    operations: weekly, 2–4 concrete, receipt-cited suggestions from the office's
    own data (vitals, checklists, attendance, training, sprints, goal patterns) +
    one streamline spotlight for the manager personally. About systems, never
    character judgments. Dismissible, one-tap actionable.

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

## Prompt 19 v3 — Reminder hooks + scoped/verified/archived sprint goals + AI doctrine (pending)

> Two additions: AI-triggered reminders, and team sprint goals the office AI runs — scoped, verified, and archived. Apply the OFFICE AI DOCTRINE to every AI surface (goal-assistant, training-builder, training-roleplay, office-insights, the AI channel): the mission is "make this office excellent within the owner's vision, rules, policies, and actual structure." It encourages and reminds EVERYONE including owners/managers — never pushy, never shaming, receipts cited, quiet when there's nothing.
>
> 1) REMINDER HOOKS (scheduled AI follow-ups):
> - New table reminder_hooks: id, org_id, user_id, kind ('goal_task_due' | 'training_due' | 'plan_stall' | 'checklist_gap' | 'sprint_progress' | 'follow_up' | 'sprint_verify'), ref_id nullable, fire_at, status ('pending' | 'sent' | 'cancelled'), created_at. org_id + RLS (member reads own).
> - A scheduled job (extend office-insights or training-reminders) fires due hooks and delivers them as AI-channel messages (or notifications until messaging ships): goal task due, training due, plan stalling, committed follow-ups, sprint progress, and verification pushes. Max one reminder per person per day, dismissal-learning, fail-open.
>
> 2) TEAM SPRINT GOALS — scoped, verified, and archived:
> - Org setting sprint_verification_default ('honor' | 'manager_approval' | 'document') in Settings — the office picks its house default; each sprint can still override it.
> - team_goals table: id, org_id, title, metric text, target_count int, period ('week'|'month'), starts_on, ends_on, reward text, progress int default 0, scope ('team'|'department'|'individual'), scope_department nullable, scope_user_id nullable, verification (defaults from the org setting, overridable per sprint), status ('active'|'pending_verification'|'won'|'missed'|'cancelled'), created_by, ai_suggested bool, verified_by nullable, verified_at nullable, verification_note nullable, created_at. org_id + RLS by scope (team → all; department → that department + admins; individual → that member + admins). Members increment progress only on honor goals in their scope.
> - PROOF INPUT — verifier's choice: upload the outside report (PDF, screenshot, phone photo) OR copy-paste the report text straight in. The STRONG model reads either, extracts the metric, compares to target, verdict WITH RECEIPTS (the number + where it came from). If it can't find the metric, verdict 'unclear' and it asks for a clearer export — never guesses.
> - PROOF HANDLING (hard privacy rule): proof is processed TRANSIENTLY — read, metric extracted, then discarded; never written to a table or storage. Outside reports can contain patient names, and Purple Envelope never stores patient data. The archive keeps everything about the verdict, nothing about the patients.
> - VERIFICATION ARCHIVE — new table sprint_verifications: id, org_id, team_goal_id, method, verifier_id, extracted_metric, source_description text (e.g. "pasted recall export, 2 pages"), ai_summary text (2–3 sentences: what the proof showed and how the verdict was reached), verdict ('supported'|'unsupported'|'unclear'), overridden bool, override_reason nullable, created_at. RLS: owners/managers read; written only by the verification flow.
> - SPRINT HISTORY + REPORTS: a Sprint history view — past sprints with title, period, scope, outcome, reward, verifier, and the AI summary — plus inclusion in Reports exports so the owner can pull the full record anytime.
> - The verifier can OVERRIDE with a required reason (recorded).
> - THE AI RUNS IT END TO END: announces on create, mid-period progress nudges, the verification push ("upload or paste the recall report to verify"), and the final declaration (seal on a win).
> - AI SUGGESTS one sprint weekly per manager (dismissible, ai_suggested).

## Prompt 21 — Executive Co-Pilot (pending)

> Build the Executive Co-Pilot: the AI carries the remembering so people don't have to. Bake in these design principles: capture is one tap and never typing; reminders arrive at the moment of action, not in a pile; the first step is always tiny; follow-ups are kind and shame-free; quiet is a feature — too many pings and the whole system gets ignored (dismissal-learning applies everywhere).
>
> 1) ONE-TAP CAPTURE → CHECKLIST: any AI surface (the AI channel, office brief, nudges, sprint flow, goal breakdown, training follow-ups) can propose a checklist item ("want this on your list?"). One tap confirms → it becomes a REAL item in the existing checklist system (per_person, dated for the right day). Nothing is ever added without the member confirming. Confirmed items behave exactly like manual ones — including the clock-out gate.
>
> 2) COMMITMENT LISTENING: in the AI channel, when the member says or implies they'll do something ("I'll call the lab tomorrow", "remind me to run the report"), the AI offers to capture it — drafted item, right day, one tap. If they decline, it drops it and never re-asks about that item.
>
> 3) TODAY FOCUS: on the member dashboard, ONE spotlight card — "your next thing" — the single most important open item right now (a confirmed checklist item, a due goal task, a due training module), with the tiniest possible first step spelled out ("Pull up Weave → export today's list"). One thing at a time; everything else stays one tap away.
>
> 4) THE GENTLE CHASE: open confirmed items get kind follow-ups at action moments — at clock-in ("3 things on your list today, first one's quick"), midday if untouched, and pre-clock-out via the existing gate. Wording is always on the member's side ("hold this for tomorrow?" — deferral is one tap, never shamed, and the AI adjusts the day without commentary).
>
> 5) RESCOPE, DON'T PILE UP: if items keep slipping, the AI offers to shrink or reschedule the plan ("this week's been heavy — move these two to Monday?") instead of letting a backlog rot in place.

## Prompt 23 — AI privacy architecture (pending — send BEFORE Prompt 17)

> Harden the AI privacy architecture: transcripts are transient, learnings are distilled, and members can see what the office AI holds about them.
>
> 1) ROLEPLAY TRANSCRIPTS — PROCESS-AND-DISCARD (this REPLACES transcript retention): when a training roleplay ends, the strong model scores it and writes a short feedback summary (rubric lines + what to try next). training_attempts stores score, passed, and the brief feedback text ONLY. The raw transcript is never persisted — not in answers jsonb, not in logs, nowhere. Quiz answers stay as they are (member-only).
>
> 2) DISTILLED MEMBER MEMORY (replaces massive context windows): new table ai_member_memory: id, org_id, user_id, note text, kind ('preference' | 'pattern' | 'strength' | 'watch_out'), created_at, updated_at. org_id + RLS: the MEMBER can read, edit, and delete their own notes (surface it as "what the office remembers about you" — transparency builds trust); NO admin read — not owners, not managers. Written only by AI edge functions with the service role.
> - After conversations and activity, the AI distills durable useful facts — "prefers written instructions", "does her best focused work before lunch", "hates surprise schedule changes", "improving at insurance explanations" — and reads THESE (not raw history) for context going forward.
> - The AI must never record anything it wouldn't say to the member's face. If the member deletes a note, the AI stops tracking that kind of thing.
>
> 3) CONTEXT BUDGET: AI functions build context from ai_member_memory + current records (goals, tasks, training state, office rules) — NOT from replaying conversation history. Small, curated, current.

## Prompt 22 — Process & Management Advisor (pending)

> Build the Process & Management Advisor for owners/managers — the office AI as an operations consultant that only cares about THIS office, under the Office AI Doctrine: motivating, never obnoxious, genuinely good for the manager too.
>
> 1) WEEKLY OPERATIONS REVIEW (or on-demand "Review my week"): the strong model analyzes the office's own data — deposit vitals trends (production, collections, hygiene vs doctor disruption), checklist completion patterns, attendance/tardy patterns, bypasses, training completion, sprint results, goal stall patterns — and produces 2–4 CONCRETE suggestions, each with receipts ("hygiene no-shows cluster on Mondays — 6 of 8 this month — might not be a bad idea to move recall reminders to Sunday evening").
>
> 2) MANAGEMENT COACHING, grounded: suggestions about running the team from actual patterns ("her goals stall at week 3 — a shorter sprint might fit better than monthly goals") — kind about every team member, never character judgments, always about systems not people.
>
> 3) STREAMLINE SPOTLIGHT: one recurring "this process could be tighter" observation per review — something the manager spends effort on that the data says could be simpler (batching approvals, checklist items that keep clustering on one person, steps nobody owns).
>
> 4) Delivery: a Manager Brief in the AI channel (dashboard card until messaging ships), weekly, dismissible — feeds the dismissal loop. Every suggestion one-tap actionable where possible ("make it a sprint goal", "assign the module", "reassign the item").

## Known build risks

- **PHI/sensitive-data persistence.** Two hard rules now: verification proof AND
  roleplay transcripts are process-and-discard. No storage, no table insert, no
  log line carrying raw content. Probe function logs for leaks.
- **Memory overreach.** ai_member_memory notes must be things the AI would say to
  the member's face — review the first week of distilled notes manually; anything
  creepy or clinical is a bug, not a feature.
- **ALARM FATIGUE.** Max one capture offer per turn, one Today Focus card,
  follow-ups only at action moments. Test a heavy day and count the pings.
- **Nagware drift.** Dismissed kinds must actually go quiet — test suppression.
- **Receipt honesty.** data_refs holds actual figures; verdicts name sources;
  'unclear' instead of guesses.
- **Scope visibility leaks.** Department/individual sprints must not leak — probe
  RLS as a member outside the scope.
- **Advisor harshness.** Management suggestions about a team member must read as
  system observations, never character judgments — tone-check before shipping.
- **Huddle leakage.** Context block sources from business tables only.
- **Reminder delivery before messaging ships.** reminder_hooks degrade to plain
  notifications if the AI channel doesn't exist yet.
- **office-insights must deploy** — probe per docs/runbook.md §1.
