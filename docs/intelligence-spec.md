# Office Intelligence — feature spec

Status (2026-07-30): Prompts 16 + 19 v3 + 21 pending. This layer makes the app feel
smart everywhere — proactive, grounded, learning — rather than smart only when
tapped. Pairs with `docs/messaging-spec.md` (16 is the brain, 17 the voice).
19 v3 supersedes v2 (paste-in proof, office verification default, process-and-discard).
21 adds the Executive Co-Pilot.

## Product decisions (the "why")

1. **Ambient, not on-demand.** This layer speaks first: briefs at day-start,
   nudges at transition moments, quiet otherwise.
2. **Receipts or silence.** Every claim cites real numbers. Generic filler is a
   bug. The brief must sometimes say "nothing to report."
3. **The dismissal loop IS the learning.** `acted_on` vs `dismissed` per nudge
   kind; repeatedly-dismissed kinds go quiet for 2 weeks. Also the accessibility
   feature: it learns WHEN each person actually responds.
4. **The office's language, not internet language.** assistant_memories + office
   docs + settings are authoritative — real names, real targets, real rules.
5. **Calm rationing.** Max ONE nudge per surface/person per day. Fail-open always.
6. **The Huddle boundary is load-bearing** — no patient-related storage or
   computation anywhere near the huddle page.
7. **Suggestions propose, managers dispose.** Humans stay senior: incident
   follow-through, sprint suggestions, document-verdict overrides.
8. **THE OFFICE AI DOCTRINE applies to every AI surface:** "make this office
   excellent within the owner's vision, rules, policies, and actual structure."
   Encourages EVERYONE — owners included — "might not be a bad idea to…" framing.
   Never pushy, never shaming, receipts cited, quiet when there's nothing.
9. **Sprint goals are scoped and tier-verified:** team / department / individual;
   HONOR · MANAGER_APPROVAL · DOCUMENT verification. Verifier = manager → owner
   fallback; nobody grades their own homework.
10. **Verification is office-configurable AND proof is process-and-discard:**
    org setting `sprint_verification_default`; proof uploaded OR pasted; read,
    metric extracted, DISCARDED — never persisted (outside reports can contain
    patient names; PE never stores patient data). Archive keeps the verdict,
    never the proof.
11. **THE EXECUTIVE CO-PILOT (Prompt 21): the AI carries the remembering.**
    Design for the executive-function pattern, never label any person — nothing
    in product or docs names a condition. Principles: capture is one tap, never
    typing; reminders land at the moment of action, not in a pile; the first step
    is always tiny; follow-ups are kind and shame-free (deferral is one tap, no
    commentary); quiet is a feature — alarm fatigue is the #1 failure mode. The
    stealth work-style profile tunes reminder style per person without anyone
    self-identifying anything.

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

## Known build risks

- **PHI leak via proof upload.** The single most important rule in this file:
  verification proof must never be persisted. No storage upload, no table insert,
  no log line carrying raw proof.
- **ALARM FATIGUE (Prompt 21's #1 failure mode).** The co-pilot dies if it pings
  too much: max one capture offer per conversation turn, one Today Focus card,
  follow-ups only at action moments. Test a heavy day and count the pings.
- **Nagware drift.** Dismissed kinds must actually go quiet — test the 2-week
  suppression.
- **Receipt honesty.** data_refs holds the actual figures; document verdicts name
  where numbers came from; 'unclear' instead of guesses.
- **Scope visibility leaks.** Department/individual sprints must not leak into
  other members' dashboards — probe RLS as a member outside the scope.
- **Huddle leakage.** Context block sources from business tables only.
- **Reminder delivery before messaging ships.** reminder_hooks degrade to plain
  notifications if the AI channel doesn't exist yet.
- **office-insights must deploy** — probe per docs/runbook.md §1.
