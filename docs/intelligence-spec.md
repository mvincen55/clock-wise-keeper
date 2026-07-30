# Office Intelligence — feature spec

Status (2026-07-30): Prompt 16 pending. This is the layer that makes the app feel
smart everywhere — proactive, grounded, learning — rather than smart only when
tapped. Builds on data that already exists; the first refinement-era build.

## Product decisions (the "why")

1. **Ambient, not on-demand.** Today's AI is summoned (Break it down, chat, draft).
   This layer speaks first: briefs at day-start, nudges at transition moments
   (clock-in, morning, clock-out, meeting), quiet otherwise.
2. **Receipts or silence.** Every claim cites real numbers ("collections 61% of
   target with 40% of the month left"). Generic filler is a bug. And the brief
   must sometimes say "nothing to report" — an AI that always has something to say
   trains people to stop reading.
3. **The dismissal loop IS the learning.** `acted_on` vs `dismissed` per nudge
   kind; repeatedly-dismissed kinds go quiet for 2 weeks. Without this, ambient
   becomes nagware.
4. **The office's language, not internet language.** assistant_memories + office
   docs + settings are authoritative — real names, real targets, real rules.
5. **Calm rationing.** Max ONE nudge per surface per day; a few per day
   office-wide. Everything fails open.
6. **The Huddle boundary is load-bearing.** The Morning Huddle agenda is
   deliberately storage-free (patient talk stays verbal). This layer may compute
   BUSINESS context above it (coverage, vitals, closures, countdowns) but must
   never store or compute anything patient-related.
7. **Suggestions propose, managers dispose.** Incident → training/checklist
   follow-through requires manager approval, never automatic.

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

## Known build risks

- **Nagware drift.** If the dismissal loop isn't real (kinds never go quiet), the
  layer becomes noise — test that dismissing a kind twice suppresses it.
- **Receipt honesty.** data_refs must contain the actual figures cited — a brief
  that says numbers it didn't compute is the trust-killer.
- **Huddle leakage.** The context block must source from business tables only;
  anything patient-adjacent violates the page's founding constraint.
- **office-insights must deploy** — probe per docs/runbook.md §1.
