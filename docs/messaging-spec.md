# Messaging + Office AI Channel — feature spec

Status (2026-07-30): Prompts 17 + 18 pending. Pairs with `docs/intelligence-spec.md`
(Prompt 16): 16 is the brain, 17 is the voice — office-insights delivers through
the AI conversation instead of only cards. Takes "announcements system" OFF the
deferred list.

Update (2026-08-11): the AI channel's minimal reply path now exists — the
`office-ai-chat` edge function answers the member's latest message with office
memories as grounding and writes the reply as sender_kind 'pathfinder' (service
role; member RLS still only writes 'member'). The Messages page and the new
chat surfaces invoke it after each send in an 'ai' conversation. Also shipped:
realtime corner popups for incoming messages (in-app toast + desktop
notification when the tab is hidden, driven by the notify_new_message
notification rows), and a Google Chat-style dock (`ChatDock`) pinned to the
bottom of every desktop page. The Inbox's requests tab now uses the office's
configured `requests_label` (default renamed 'Doctor Requests' → 'Requests' —
requests can go to any teammate, not only the doctor).

Update (2026-08-12): reading a conversation now also retires its bell
notifications. Marking a thread read used to advance only last_read_at, so the
per-message rows notify_new_message writes stayed unread in the bell after the
messages had been seen in the chat. The shared `useThreadReadMarker` hook (the
one open-thread contract for the Messages page and the dock) marks the
conversation read whenever the thread, or any bell row pointing at it, is
unread — and `useMarkConversationRead` settles both stores in one pass.

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
   always sealed.
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
7. **The secrecy promise has exactly two exceptions, both written down**
   (Prompt 18): (a) a recipient's own report of a specific message; (b) security
   telemetry — attack patterns and record-level anomalies, METADATA never
   content. Message bodies are never scanned for "suspicious meaning." The
   policy manual states the integrity monitoring plainly.

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

## Prompt 18 — Integrity & Safety layer (pending)

> Build an Integrity & Safety layer: the system watches its own behavior and attack patterns — NEVER message content. Conventions: org_id everywhere, RLS, fail-open, fingerprinted dedupe (same pattern as assistant-auditor / training-auditor).
>
> NEW TABLE security_events: id, org_id, actor_user_id nullable, kind ('auth_abuse' | 'function_abuse' | 'ai_jailbreak' | 'time_anomaly' | 'deposit_discrepancy' | 'destructive_action'), detail jsonb, severity ('watch' | 'elevated'), status ('open' | 'reviewed' | 'dismissed'), fingerprint, created_at, reviewed_by nullable. RLS: owners/managers read and update; the actor can NEVER see their own events (no tip-offs). Member clients cannot insert — events are written only by edge functions with the service role.
>
> DETECTORS (system signals only):
> 1. AI jailbreak/injection — goal-assistant, training-builder, training-roleplay, and office-insights detect instruction-override attempts: "ignore previous instructions", requests for other employees' data, attempts to inject patient data, attempts to make the AI contradict office rules or reveal its system prompt. On detection: the AI refuses politely and says nothing about the flag, and a security_event (kind 'ai_jailbreak') is logged with the ATTACK SIGNATURE (the pattern matched), never the conversation content.
> 2. Time anomalies — GPS patterns that look spoofed (impossible consecutive locations, teleporting), punch edit sprees, repeated checklist-bypass farming patterns.
> 3. Deposit discrepancies — vitals or deposit edits after day-close (already audit-logged; now they also raise a security_event).
> 4. Destructive actions — WipeDataTool runs, mass deletes, after-hours admin changes.
> 5. Auth abuse — repeated failed logins, repeated allowlist-bounced signups (someone probing the closed door).
>
> ELEVATION: severity 'elevated' → in-app alert + email to all owners (managers optional via a setting) via the transactional email queue (log email_send_log first, mask addresses in logs). A new "Integrity" review section for owners/managers (Settings or Team — pick the better fit) listing events with status, one-tap reviewed/dismissed. Fingerprints prevent re-reporting open/dismissed events.
>
> THE BOUNDARY, enforced in code and stated in the UI's privacy copy: private conversations and AI-channel content are NEVER scanned for "suspicious meaning." The secrecy promise stands. What the system monitors is system integrity: attack patterns, tamper signals, and anomalous record-level behavior. Add one honest line to the policy manual: "Purple Envelope monitors system security and data-integrity events (sign-in attempts, tamper signals, AI misuse attempts). It never reads your messages."

## Known build risks

- **RLS is the whole promise.** A messaging system where a manager can
  accidentally read DMs is worse than none — the participant-only probe is
  mandatory before telling anyone it works.
- **Actor blind-spot.** If an actor can query security_events for themselves,
  the layer trains evasion — probe as the flagged user too.
- **False-positive calibration.** Anomaly detectors that cry wolf teach owners
  to dismiss everything; severity must start conservative ('watch' default,
  'elevated' only on strong signals).
- **AI channel without 16.** If office-insights isn't built yet, the AI channel
  needs a minimal reply path (answer with employee + office context) so it isn't
  an empty thread — sequence 16 first or build both together.
- **Unread math.** last_read_at per participant is the only read state — no
  per-message read receipts in v1.
- **employees.team backfill.** Existing employees start unset → 'all' only;
  manager sets teams from the Team page.
