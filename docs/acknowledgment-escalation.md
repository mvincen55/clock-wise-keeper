# Schedule-Aware Acknowledgment Escalation

## Purpose

This slice makes exact-version acknowledgments operational without turning Purple Envelope into a punishment or surveillance system.

A delay is not automatically noncompliance. The system distinguishes:

- work that is truly overdue,
- work that is blocked by a named person or dependency,
- a limited reasoned snooze,
- a clarification question waiting on leadership,
- and time when the assigned person was not expected to work.

Acknowledgment still means only: **the assigned person received and read the exact published version**. It does not prove agreement, comprehension, misconduct, or discipline.

## Working-day clock

Routine deadlines and reminder gaps are calculated for the assigned user, not from generic calendar days.

Resolution order:

1. Active organization membership
2. Office closure
3. Approved or recorded day off, including unscheduled call-out or medical leave
4. Assigned schedule version for that date
5. Legacy personal work schedule
6. Transparent Monday–Friday, 9:00–5:00 fallback when leadership has no schedule entered

Routine delivery also requires:

- the recipient to be inside their scheduled work window, and
- the office quiet-hours rule to allow delivery.

The fallback is intentionally explicit. Missing schedule data must not silently exempt owners or managers from accountability.

## Escalation ladder

Default sequence:

1. Assignment notification when the exact version is published
2. In-app due reminder when the working-day deadline passes
3. Email reminder after the configured number of additional working days
4. Manager in-app and email follow-up
5. Owner in-app and email review

Each stage is idempotent and writes an immutable escalation receipt.

The hourly worker does not mean hourly messages. It checks eligibility hourly and acts only when the next stage is due and the intended recipient is working.

## Explicit pause states

### Blocked

The assigned person must provide a reason and may identify an active office member who is blocking progress. Routine escalation pauses. The subject, management, and named dependency can see the factual block.

### Snoozed

A snooze:

- requires a reason,
- is limited by office settings,
- is measured in working days,
- is visible in the receipt,
- and cannot be stacked on an active block or unanswered question.

### Clarification question

The assigned person can ask a question before signing or sign while submitting the question. When configured, routine escalation pauses until a different owner or manager answers. The answer becomes part of the receipt. The original acknowledgment remains valid because it records receipt and reading, not agreement.

## Escalation receipt

The receipt records factual events such as:

- assigned,
- exact version opened,
- block added or cleared,
- snooze used,
- question asked or answered,
- working-day deadline passed,
- in-app reminder,
- email queued,
- manager escalation,
- owner escalation,
- acknowledgment,
- waiver or reactivation.

Authenticated team members can read their own receipt. Owners and managers can read operational status and receipts for the organization. Nobody can sign for another person.

## Urgency classes

This acknowledgment workflow is a **routine accountability class**. It respects work schedules and quiet hours.

Safety, cash-integrity, compliance, or serious workplace events remain a separate **immediate class** in Purple Envelope's incident and accountability systems. They do not wait behind the routine acknowledgment ladder. The product does not let an ordinary policy author relabel a routine acknowledgment as an emergency simply to bypass boundaries.

SMS is intentionally not part of this slice. Notification event logic remains channel-independent so SMS or native push can be added later without rewriting escalation state.

## Security boundaries

- Direct authenticated writes to acknowledgment assignments, events, and settings remain blocked.
- Self-service actions bind to `auth.uid()`.
- A different owner or manager must answer a subject's question.
- Internal work-calendar helpers are service-role only.
- The escalation endpoint requires the exact service-role bearer.
- Email uses the existing transactional queue and provider idempotency key.
- Pending/sent email logs prevent duplicate queueing; failed queue attempts remain retryable.
- Escalation events use unique organization-scoped keys.
- RLS prevents cross-organization access.

## Deployment order

This branch is stacked on the exact-version acknowledgment PR.

1. Merge and apply the knowledge-governance migrations.
2. Merge and apply exact-version acknowledgment migrations.
3. Apply escalation migrations in timestamp order:
   - `20260804050000_acknowledgment_escalation.sql`
   - `20260804050100_acknowledgment_escalation_fixes.sql`
   - `20260804050200_schedule_acknowledgment_escalation.sql`
4. Deploy `acknowledgment-escalation`.
5. Regenerate Supabase types and remove the temporary acknowledgment type bridge.
6. Confirm the service-role vault secret exists for cron authentication.
7. Verify the hourly cron job and transactional email processor.
8. Test as owner, manager, employee, absent employee, role-changed member, and reactivated member.

No migration, deployment, or cron change is applied to production by this branch alone.

## Manual acceptance scenarios

1. Publish an acknowledgment-required policy on Friday to an employee off Monday. Confirm Monday is not consumed and the deadline follows the employee's next working days.
2. Record an unscheduled call-out. Confirm no routine notice is sent during the call-out date.
3. Mark an assignment blocked and name a manager. Confirm routine escalation pauses and the manager sees the reason.
4. Clear the block. Confirm the ladder resumes from a working-day boundary.
5. Use the maximum allowed snoozes. Confirm another snooze is rejected.
6. Ask a question. Confirm a different manager or owner can answer and the subject cannot answer their own question.
7. Sign while asking a question. Confirm the signature is recorded and the question remains open.
8. Let an assignment advance through in-app, email, manager, and owner stages. Confirm one receipt event per stage and no duplicate email queueing.
9. Change the member role out of the required audience. Confirm the unsigned assignment is waived.
10. Reactivate an eligible member. Confirm signed history is preserved and only an unsigned waived assignment can reactivate.
