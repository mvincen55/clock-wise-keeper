# Messaging + Office AI Channel — feature spec

Status (2026-07-30): Prompt 17 pending. Pairs with `docs/intelligence-spec.md`
(Prompt 16): 16 is the brain, 17 is the voice — office-insights delivers through
the AI conversation instead of only cards. Takes "announcements system" OFF the
deferred list (this is the real version).

## Product decisions (the "why")

1. **One messaging system, three kinds of conversations.** Member DMs/groups,
   manager announcements, and the office AI channel all live in the same
   conversations/participants/messages model — the AI is a first-class
   participant (sender_kind 'pathfinder'), which is exactly "messages them like a
   human would."
2. **Privacy is absolute, by RLS.** Only participants read a conversation — no
   admin override, owners included. AI conversations are strictly employee + AI.
   This is the product promise and the UI says so.
3. **One safety valve, recipient-controlled.** Any recipient can report a
   specific message to the owner; only that message, visibly marked. Default
   always sealed. (Owner decision whether to keep the valve.)
4. **The AI speaks the employee's language.** Messages are written to the
   individual: name, goal, checklist patterns, work-style profile (STEALTH —
   never revealed), office rules as the world. Receipts required; max 1
   proactive AI message/day unless replied to; dismissal learning carries over
   from office-insights.
5. **Announcements need one new field:** employees.team ('clinical'|'clerical'),
   editable from Team page; unset members receive 'all' only. Same field later
   sharpens training audience tags.
6. **In-app only.** New messages badge the existing notification system +
   Messages nav badge; no email for messages.

## Prompt 17 — Messaging + announcements + AI channel (pending)

> Build team messaging with announcements and a private office-AI channel. Conventions: org_id everywhere, RLS, roles owner/manager/employee. PRIVACY IS THE FEATURE: conversations are secret — only participants can ever read them. Not managers, not owners, nobody. Say so in the UI ("Messages stay between the people in them").
>
> NEW TABLES (org_id + RLS):
> - conversations: id, org_id, type ('dm' | 'group' | 'announcement' | 'ai'), title nullable, audience nullable ('all' | 'clinical' | 'clerical' — announcements only), created_by, created_at
> - conversation_participants: id, org_id, conversation_id, user_id, last_read_at nullable
> - messages: id, org_id, conversation_id, sender_id nullable (null = the office AI), sender_kind ('member' | 'pathfinder' | 'system'), content text, created_at
> RLS: participants read/write only conversations they belong to. Announcements readable by everyone in the target audience, writable by owners/managers only. AI conversations are strictly the employee + the AI — no one else, owners included. NO admin override anywhere — secrecy is the product promise.
>
> 1) MEMBER MESSAGING (/messages, added to nav):
> - DM any teammate; small group chats; conversation list with unread badges (from last_read_at). Fast, mobile-first, send on enter. New message → in-app notification via the existing system (bell badge + Messages nav badge).
>
> 2) ANNOUNCEMENTS (owners/managers):
> - "New announcement" → audience: Entire team / Clinical only / Clerical only. Appears as a read-only announcement conversation with a megaphone marker. Requires a team field on employees ('clinical' | 'clerical') — add it to employee records (editable from the Team page); members with no team set receive 'all' announcements only.
>
> 3) THE OFFICE AI CHANNEL:
> - Every employee automatically has one private conversation with the office AI (sender_kind 'pathfinder') — the office talking to them like a person would. Wire office-insights to deliver briefs and nudges HERE as messages, written to the individual: their name, their goal, their checklist pattern, their work-style profile (stealth — never reveal it), and the office's rules as the world it lives in. The member can reply, and it answers with full context of that employee — goals, training, recent activity, office rules. This is the conversational front door; per-goal Pathfinder threads stay as they are.
> - AI messages follow the office-insights rules: receipts (cite real numbers), max 1 proactive message per day unless replied to, dismissal learning, fail-open, calm colleague tone. No patient data, ever.
>
> 4) SAFETY VALVE: any recipient can ⋯ a message → "Report to owner" — only then is that specific message shared with the owner, visibly marked as reported. Default is always private.
>
> When finished: confirm the messages, conversations, and participants tables all enforce participant-only reads in the dashboard (RLS probe as a second user).

## Known build risks

- **RLS is the whole promise.** A messaging system where a manager can
  accidentally read DMs is worse than none — the participant-only probe is
  mandatory before telling anyone it works.
- **AI channel without 16.** If office-insights isn't built yet, the AI channel
  needs a minimal reply path (answer with employee + office context) so it isn't
  an empty thread — sequence 16 first or build both together.
- **Unread math.** last_read_at per participant is the only read state — no
  per-message read receipts in v1.
- **employees.team backfill.** Existing employees start unset → 'all' only;
  manager sets teams from the Team page.
