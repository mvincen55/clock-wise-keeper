# Accountability Escalation — feature spec

Status (2026-07-30): Prompt 25 pending. Builds ON TOP of existing tardy tracking
(`useTardies`, `TardyReviewModal`) — adds the threshold engine, the signed record,
and the escalation chain. Ordering note: Prompt 17 (messaging) shipped BEFORE
Prompt 23 — 23 is now a retrofit hardening pass over what 17 built (by design,
same content).

## Product decisions (the "why")

1. **The record is neutral.** An accountability report is documentation, not
   discipline: "3 tardies in 30 days: 6, 12, and 4 minutes" + the member's reason
   + signatures. School, traffic, life — anyone looking back a year later knows
   what it was. Zero judgment language, ever.
2. **Two-hop visibility.** The member sees hop one (their review goes to the
   manager — transparent). They NEVER see hop two (manager → owner). To the
   member nothing changes on escalation; to the owner it's a separate
   "why is this sitting here" issue. Keeps the member-manager relationship clean
   while making the chain un-stallable.
3. **Everything is a setting.** Thresholds, windows, review due days, escalation
   target and timing, on/off per kind — per office, with the chain displayed
   plainly ("member → manager review (3 days) → owner if idle (2 days)").
4. **The chain is generic.** Tardies are the seed policy; the same engine
   carries bypass-unresolved, checklist gaps, and goal stalls without new plumbing.
5. **Signatures are acknowledgments, not confessions.** Typed-name sign-off (same
   pattern as the privacy terms): "this is what happened." The member's reason is
   theirs — managers document the conversation, never edit the reason.
6. **The AI documents, never characterizes.** It drafts neutral summaries with
   real numbers, reminds the current holder before escalation, delivers the
   escalation notice. No judgment, no personality verdicts.

## Prompt 25 — Accountability Escalation system (pending)

> Build the Accountability Escalation system: configurable chains that turn tracked patterns into neutral, signed records — and push them up the chain when they stall. Tone throughout: documentation, not punishment ("sometimes it's school, sometimes it's traffic — the record just says what happened").
>
> 1) ESCALATION POLICIES (org settings): new table escalation_policies: id, org_id, kind ('tardy_threshold' | 'bypass_unresolved' | 'checklist_gap' | 'goal_stall'), threshold_count int, threshold_window_days int, reviewer_role ('manager' | 'owner') default 'manager', review_due_days int default 3, escalate_to ('owner' | null) default 'owner', escalate_after_days int default 2, is_active bool. org_id + RLS: admins manage. Seed one default: 3 tardies in 30 days → manager review, escalate to owner after 2 idle days.
>
> 2) ACCOUNTABILITY REPORTS: new table accountability_reports: id, org_id, kind, subject_user_id, period_start, period_end, summary text (AI-drafted, neutral, real numbers — "3 tardies in 30 days: 6, 12, and 4 minutes"), status ('awaiting_member' | 'awaiting_manager' | 'awaiting_owner' | 'closed'), member_reason nullable, member_signed_name nullable, member_signed_at nullable, manager_note nullable, manager_signed_name nullable, manager_signed_at nullable, reviewer_user_id nullable, escalated_at nullable, closed_at nullable, created_at. org_id + RLS: the subject reads and writes ONLY their own reason and signature; managers/owners read all in their org; the escalation state (awaiting_owner, escalated_at) is NEVER visible to the subject.
>
> 3) THE FLOW (tardies are the example; the engine is generic):
> - Threshold hit → report auto-created with the neutral summary → the MEMBER is asked for their reason (free text) plus a typed-name sign-off — framed as record-keeping, not discipline. The member CAN see the review goes to the manager; the first hop is transparent.
> - The MANAGER gets the review task (AI channel + notification) with review_due_days to document the conversation (manager_note) and countersign.
> - If the manager stalls past escalate_after_days → status 'awaiting_owner' and the OWNER is notified ("this review has sat N days — needs a look"). This hop is INVISIBLE to the member — to them, nothing changed.
> - Closed reports join the permanent record: Reports page + EmployeeDetail history — the facts, the reason, the signatures.
>
> 4) AI ROLE: drafts the neutral summaries (real numbers, zero judgment language), reminds the current holder before escalation ("needs your sign-off by Friday — then it moves up"), and delivers the escalation notice to the owner. It documents; it never characterizes.
>
> 5) SETTINGS UI: policies editable per office — thresholds, windows, due days, escalation target, on/off per kind — and each policy displays its chain plainly ("member → manager review (3 days) → owner if idle (2 days)") so the people in charge can see the rules the system plays by.

## Known build risks

- **The hop-2 leak.** If escalation state ever renders for the subject (status
  enum leak, email to the wrong person, AI channel mention), the design's core
  trust breaks — probe as the subject user and check every notification path.
- **Neutral-tone drift.** Summaries must contain numbers, not adjectives —
  review the first generated reports for judgment language.
- **Reason integrity.** The member's reason must be uneditable by admins —
  managers document via manager_note only.
- **Threshold timing.** Window math must be Eastern-local and rolling (not
  calendar month) — test a threshold crossing mid-window.
