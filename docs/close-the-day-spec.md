# Close the Day + Schedule Intelligence — feature spec

Status (2026-07-31): Built. The Deposit Log page (`/deposit-log`) is now the
five-step Close the Day workflow; the deposit sheet itself (fields, totals,
print sheets, snapshots, audit trigger) is unchanged.

## The three intelligence layers (non-negotiable architecture)

1. **Schedule Reader** (`src/lib/schedule-reader/`) — converts a privacy-view
   schedule capture into sanitized operational metrics, entirely in the
   browser. Local OCR (tesseract.js against same-origin assets vendored by
   `scripts/vendor-tesseract.mjs` — no CDN at runtime, no external fallback:
   missing assets → `OCR_ASSETS_MISSING`, full stop). It gives no advice,
   stores nothing, and never uploads an image or raw text. Enforced by
   `src/test/schedule-reader-boundary.test.ts` — a static scan (no fetch/XHR/
   WebSocket/supabase/localStorage/IndexedDB/toBlob/toDataURL/redact-image in
   the directory) plus a runtime instrumented run that fails on any network
   call.
2. **Metrics Referee** (`metrics-referee.ts`) — deterministic code. Validates
   minute identities, duplicate counting, provider/department/practice
   rollups, confidence thresholds, classification codes, staffing ratios, and
   goal-progress math. No prose: it accepts, or returns exact error codes.
3. **Office Coach** — the existing office AI (`office-pulse`, job 4:
   `coachCloseDay`). Receives only referee-validated aggregates + existing
   non-patient operational data, through the existing `say()`/phi-scrub door.
   Hard rules in the prompt: never overbooking, never skipped lunches, never
   understaffing as a lever; a human "stretched/unsafe" answer outranks a
   healthy-looking schedule. Delivers at most one `close_day_insight` nudge
   per manager (surface `deposit`), dismissal-learning applies.

## Privacy boundary

- The feature is called **Privacy View Capture** — never "HIPAA compliant",
  "HIPAA safe", "guaranteed de-identified", or "PHI proof".
- The screenshot lives in one in-memory canvas. `destroy-capture.ts` stops
  tracks, clears + shrinks the canvas, revokes object URLs, wipes OCR arrays,
  and terminates the OCR worker on every exit path (confirm, cancel, error,
  unmount).
- A local privacy check (`privacy-detector.ts`) runs BEFORE any analysis.
  Likely patient identifiers (names, initials-with-context, phones, DOBs,
  emails, account/insurance numbers, long free text, clinical words,
  addresses) block processing. There is no redact-and-continue path.
  Violations are reported as kinds + counts only, never the text.
- Errors carry codes only (`CAPTURE_PERMISSION_DENIED`, `OCR_FAILED`,
  `PRIVACY_CHECK_FAILED`, `LAYOUT_NOT_RECOGNIZED`, `LOW_CONFIDENCE`,
  `METRIC_VALIDATION_FAILED`, …) — never screenshot content.
- `src/lib/redact-image.ts` (support-ticket redaction) is explicitly NOT
  reused here — it exposes rawText, masks the times schedule math needs, and
  returns the original file on OCR failure. The boundary test fails if the
  reader ever imports it.
- Mobile fallback (local file selection) is opt-in per office
  (`org_practice_settings.mobile_capture_enabled`) and the UI says plainly
  that Purple Envelope cannot delete the original from the phone's gallery.

## Open-time definitions (the metric vocabulary)

- **Gross available** — the provider's visible working window.
- **Intentional unavailable** — blocked time EXPLAINED by a classified
  operational code (lunch, meeting, provider off, equipment down…). Blocked
  time without an explanation is *unclassified*, and the closer resolves it —
  the pipeline never guesses.
- **Net bookable** = gross − intentional.
- **True open** = cancellation-created + no-show-created + other open.
  Minutes, not just counts — a 120-minute opening ≠ a 20-minute one.
- **Unclassified** — never counted as true open until confirmed.
- **Recovered** — only from visible evidence or manual confirmation; never
  inferred (the builder always emits null).
- Referee identity: `scheduled − overlap + trueOpen + unclassified = net`.

## Storage map (aggregates only, org_id + RLS everywhere)

- `deposit_logs` (existing; **is** the closeout record — `closeout_id` FKs
  point at it): + `sealed_at/by`, staffing reality (assessment / pressure /
  factors / note, note runs through phi-scrub client-side), capture status.
  Members update same-day; later edits admin-only (RLS) and audited
  (`log_day_close_change` trigger, `day_close_edit` events).
- `provider_day_metrics` — per provider per day aggregates (unique per
  closeout + label). Post-day updates audited (`schedule_metrics_edit`).
- `schedule_block_entries` — classification code + minutes + confidence +
  user_confirmed. Never the original wording.
- `schedule_layout_profiles` — sanitized calibration output (relative column
  geometry, provider labels, status colors, time grid). Never screenshots or
  OCR text.
- `schedule_staffing_rules` — configurable expectations; defaults are seeded
  for review, nothing staffing-related is hard-coded.
- `schedule_phrase_rules` — short generic phrases → codes; length + phone
  patterns constrained in the DB, sanitized again client-side.
- `employee_operational_roles` — work roles (dentist/hygienist/…), separate
  from permission roles; multiple per person. The inviting owner/manager
  answers these on the invite itself (name + email/username + role(s), stored
  on `org_invites`); `accept-invite` names the employee record and applies
  the roles pre-confirmed by the inviter. Onboarding never asks; managers
  edit from the Team page.

## The five steps

1. **Money** — the original deposit sheet, byte-for-byte print-invariant.
2. **Practice Vitals** — existing sliders; prefilled from confirmed schedule
   metrics when a capture ran, always correctable by the closer.
3. **Privacy View Capture** — instructions → double confirmation →
   `getDisplayMedia` one-frame grab (stream stopped immediately) → local
   pipeline → review table → destroy. The closer resolves unclassified
   blocks; low-confidence rows save as `user_confirmed`, unresolved ones flag
   `needs_manager_review`.
4. **Staffing Reality** — the human assessment. Never overwritten by the
   automated read; disagreement is signal, and the coach treats the human
   answer as the headline.
5. **Seal the Day** — summary (collections, production, open-time breakdown,
   highest strain, staffing read, low-confidence flags) + seal. Same-day
   edits stay open; later edits are owner/manager + audited. Managers can
   spin today's lost minutes into a measurable team goal (reuses
   `team_goals` sprints; the referee's `goalProgress` validates the spec).

## Setup (manager, on the Close the Day page)

Layout calibration wizard (PMS pick → capture → label columns → click status
colors → working-day grid), staffing expectations, phrase shorthand, mobile
fallback toggle.

## Known risks / follow-ups

- Deploy note: the migration plus the `office-pulse`, `send-org-invite`, and
  `accept-invite` changes ship outside Lovable — apply the migration and
  redeploy all three functions (README "How code changes ship").
- OCR assets must be vendored at build time (`predev`/`prebuild` run
  `scripts/vendor-tesseract.mjs`; `public/tesseract/` is gitignored).
- Existing members predate role-carrying invites, so they start with no
  operational role — managers backfill from the Team page.
- Color-legend matching assumes solid status blocks; offices with heavy
  gradients may see more unclassified time (which is safe — it is never
  counted as open).
