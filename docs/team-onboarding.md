# Team Onboarding — build spec (v1)

Status (2026-07-30): Prompt 20 pending. Supersedes the earlier feature-list draft —
this is now the build document. Onboarding starts right after invite acceptance
(send-org-invite / accept-invite are live) and gates the app until complete.

## Product decisions (the "why")

1. **Privacy terms first, in plain language, signed.** The promise: PE never
   shares private data (messages, AI conversations, quiz answers, work-style
   answers, sticky notes) with owner/manager — and the company doesn't read it
   either. The disclosure: system integrity monitoring ONLY (never message
   content), elevated flags notify owner AND manager — **unless the flagged
   person is a manager, then owner only** — and a human reviews before anything
   happens. Typed-name acknowledgment, versioned (re-sign on change).
2. **Work-style questions stay stealth.** Framed as "help the office get to know
   you" — never linked to goals/training/AI in any copy. Answers feed Pathfinder
   and learning-style adaptation silently (goals spec decision 5, training spec
   decision 10).
3. **Employee tags, not codes, not full names.** 2–4 chars, default = first +
   last initial, manager-editable, **unique across current AND archived
   employees forever** (reports must never confuse two people). Tags appear on
   reports/print/exports; in-app UI and the AI use first names.
4. **Onboarding gates the app.** Incomplete → redirected to /onboarding.
   Managers see status only (done/not + who signed terms), never private content.
5. **First goal as the finale** — the member leaves onboarding having already
   touched the culture loop.

## Prompt 20 — Team onboarding v1 (pending)

> Build team-member onboarding v1: the flow a new member completes after accepting their invite, before the app opens fully. Store completions; managers can see status (done/not), never the private answers' content beyond what's designed to be visible.
>
> 1) PRIVACY & TERMS (the first screen, must be acknowledged to continue):
> - Plain-language terms, short enough to actually read:
>   a) YOUR PRIVACY: Purple Envelope never shares your private data (messages, AI conversations, quiz answers, work-style answers, sticky notes) with your owner or manager — and as a company, we don't read it either.
>   b) WHAT THE SYSTEM WATCHES: system security and data-integrity events only — sign-in attempts, tamper signals, AI misuse attempts, and record-level anomalies (like deposit logs being changed after close-out). It never reads your messages. When the system flags something serious, it emails and notifies the owner AND manager — unless the flagged person IS a manager, then it notifies only the owner. Flags are reviewed by a human before anything happens.
>   c) ACKNOWLEDGMENT: the member types their full name to sign "I've read and understand this" — stored in policy_acknowledgments (id, org_id, user_id, document 'privacy_terms_v1', signed_name, signed_at). RLS: member reads own; admins see WHO has signed (compliance), which is all they need.
> - If the terms text ever changes (version bump), existing members re-acknowledge on next login.
>
> 2) WORK-STYLE QUESTIONS (next screen, ~5 quick friendly questions — the stealth profile): framed as "help the office get to know you" — NEVER mention goals, training adaptation, or AI. Saved to work_style_profiles.
>
> 3) BASICS: preferred first name (used everywhere in-app and by the AI), team assignment (clinical / clerical — feeds announcements), and their EMPLOYEE TAG: a 2–4 character short code shown on reports and printed sheets instead of full names. Default suggestion = first name + last initial ("Megan V" → "MV"); owner/manager can edit anyone's tag. Must be unique across ALL employees current AND archived (never reused — check the full history). In-app UI and the AI keep using first names normally; tags appear on reports, print sheets, and exports.
>
> 4) FIRST GOAL (finale): the normal set-a-goal flow with Pathfinder polish, framed as "one thing you want to get better at this month."
>
> Route /onboarding: members with incomplete onboarding are redirected there after login until done (they can always see the privacy terms again from Settings).

## Candidates for v2 (not in v1)

- Policy manual acknowledgment beyond the privacy terms (Policy Manual page exists).
- Training-checklist assignment per role.
- Role-based default checklists (clerical/clinical starter sets).
- Office/org onboarding spec (settings catalog from the schema) — the OWNER-side
  onboarding, separate from this member-side flow.
