# Gmail Integration — feature spec

Status (2026-07-30): Prompt 24 pending. Extends the existing Google OAuth
(google-calendar-events) with Gmail scopes. Feeds the Executive Co-Pilot
(`docs/intelligence-spec.md` Prompt 21): email is the highest-value capture source.

## Product decisions (the "why")

1. **Drafts, never sends.** The AI prepares replies in Gmail's Drafts folder; a
   human always sends. This rail never moves.
2. **Email content is transient.** Read to organize/extract, never persisted in
   PE — references by message ID only (same rule as roleplay transcripts and
   verification proof). PE stores: connection tokens, action log entries,
   confirmed checklist items.
3. **Patient-safe extraction.** Checklist items from email are generic
   ("return this morning's call") + a Gmail deep link. Patient names/content
   NEVER enter checklist items or any PE table (checklist items are business
   data only — existing rule).
4. **Tiered autonomy, per-user setting:** Review everything (default) →
   Auto-organize low-risk (labels/archive) → Auto-organize + auto-draft.
   Reversible over destructive: archive, never delete.
5. **Every action logged and undoable** ("what the AI did in my inbox") —
   un-archive, remove label, delete draft where Gmail allows.
6. **Connections are strictly personal.** email_connections is RLS-locked to the
   owning user — not owners, not managers. Disconnect removes tokens and stops
   all processing.

## Prompt 24 — Gmail integration (pending)

> Build Gmail integration: connect a member's Gmail and let the office AI organize it, draft replies, unsubscribe from junk, and turn actionable emails into checklist items. House rules: process email content TRANSIENTLY (never persist email bodies in PE — reference by message ID only), drafts never auto-send (a human always sends), reversible over destructive (archive, never delete), and every AI action is logged and undoable.
>
> 1) CONNECTION: extend the existing Google OAuth (used for google-calendar-events) with Gmail scopes (gmail.modify + gmail.compose). New table email_connections: id, org_id, user_id, provider 'gmail', account_email, refresh_token (encrypted), status, created_at. org_id + RLS: strictly the owning user — not even owners/managers see another member's connection. Disconnect removes tokens and stops all processing.
>
> 2) EMAIL TRIAGE — new edge function email-triage (verify_jwt = true, add to supabase/config.toml):
> - Reads the recent inbox via the Gmail API and produces a Triage Review for the member:
>   a) ORGANIZE: proposed actions — archive newsletters/notifications, label by category (vendors, labs, insurance, personal), star what needs attention. One tap approves a batch.
>   b) DRAFTS: proposed replies created in Gmail's Drafts folder (NEVER sent — the member reviews and sends in Gmail). Each proposal shows the AI's one-line reasoning.
>   c) UNSUBSCRIBE: recurring junk/newsletters get an "unsubscribe?" proposal; once confirmed for a sender, future handling from that sender is automatic (per-sender setting).
> - Autonomy tiers as per-user settings: Review everything (default) → Auto-organize low-risk (labels/archive only) → Auto-organize + auto-draft. Runs on a schedule and on demand ("triage my inbox").
>
> 3) EMAIL → CHECKLIST (Executive Co-Pilot hook): when an incoming email implies an action, propose a checklist item via the existing one-tap capture — patient-safe generic wording ONLY ("return this morning's call", "approve the supplier invoice") with a reference link that opens the email in Gmail. NEVER copy patient names or email content into checklist items or any PE table. Confirmed items land in the real checklist system (per_person, right day) and follow the clock-out gate.
>
> 4) ACTION LOG + UNDO: every AI email action writes an entry (action, message reference, timestamp, undoable) visible to the member ("what the AI did in my inbox"), with undo where Gmail allows (un-archive, remove label, delete draft).

## Operational reality (not code)

- **Google OAuth verification.** gmail.* scopes are RESTRICTED: the Google OAuth
  app works with test users unverified, but production use requires Google's app
  verification (restricted scopes can require a security assessment). Owner task
  in Google Cloud Console — refinement-pass list, next to the allowed_users fix.

## Known build risks

- **Content persistence.** No email bodies in tables, storage, or function logs —
  probe logs after a triage run.
- **Auto-send drift.** Any code path that sends instead of drafting is a
  critical bug — grep for send endpoints before shipping.
- **Token storage.** refresh_token must be encrypted at rest; never logged.
- **Scope creep.** gmail.modify + gmail.compose only — do not request broader
  scopes (each added scope worsens the Google review).
- **PHI via email.** Extraction must never copy patient-identifying content into
  checklist items — same boundary as the checklist migration header.
