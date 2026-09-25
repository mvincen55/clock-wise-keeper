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

## Setup (owner or manager, Settings → Schedule Intelligence)

The unconfigured Schedule step links directly to Schedule Intelligence setup. Pending edits save before navigation; a failed save keeps the closer on the day. The selected date and Schedule step are retained in the return URL. Members must ask an owner or manager to configure it.

Schedule capture is optional: Next step proceeds to Staffing without changing capture status. A day without a capture can still be sealed once the other required answers are saved. Practice Vitals asks for completed first visits, not new-patient appointments scheduled; historical scheduled counts remain preserved.

Layout calibration wizard (capture → confirm providers → check what was read
and save), staffing expectations, phrase shorthand, mobile fallback toggle.

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

## Focused settings and provider schedules

Schedule setup uses `/settings/schedule-intelligence`; FOF policy and procedure settings use `/fof/settings`, broken-appointment policy uses `/broken-appointments/settings`, and deposit wording uses `/settings/deposits`. The Workflows tab links to these pages. Provider registry and office closures live in Office settings. Broken-appointment notice calculations automatically exclude shared full-day office closures; legacy excluded dates remain effective until removed.

Calibration selects active registry providers and derives their type and department. High-confidence header codes such as DR02 reuse a previously confirmed provider mapping. Unknown or ambiguous codes require selection; they never guess a doctor. A registry provider whose schedule code equals exactly one active team member's staff code is that team member: the link is made by the database when either code is set, so a doctor added to Team as DR05 files their captures, observed hours and analyst context under their own record without a second pick. A team member who never punches (the doctors) is marked off the time clock on their Team card, so a schedule day with no punches is never read as an absence anywhere.

Calibration asks only for what it cannot work out. The practice software comes from Practice settings and is shown, not asked, once set there. The working day is read from the screenshot's own time rail — labels printed as `8:00`, `8:00 AM`, `8:00am`, `8 AM`, or `8a`, read per line so a meridiem the OCR split off is rejoined, with one label clearly off the fitted rail (a misread digit) dropped rather than allowed to bend the fit — and otherwise kept from the last calibration or taken from the providers' earliest start and latest end. Each linked provider's weekly hours come from the work schedule saved in Team. The last step is a one-glance summary with a single Save: the working day, its source, and each provider's hours on one line each. Day bounds, grid rows, and hours are editable behind an Adjust control; hours the office already holds need no confirmation click, only edits and attached files do. A provider with no saved hours is noted (off-duty time will read as open) but never required. The lunch/admin block-style setting is no longer asked — nothing in the reader consumes it — and is carried over from the last layout.

The reader takes lunch, open time, and who is out from the grid itself. The built-in lexicon reads how offices actually write it: `No Doctor - Yom Kippur`, `no dr today`, `Dr out`, and `time off` are the provider off; `Dr out early` and `dr out at 3` stay out-early; a team member named by initials or a first name — `JB Out (In 930ish-1030ish)`, `GC OFF`, `Megan out` — is a staffing limitation; `Do NOT Book` (with or without a trailing remark) is a chair-level block. Outreach and movement notes — `HCU - SENT`, `<sent blast`, `Moved down 1 unit` — and anything about a patient (`pt out`) never become blocks. A provider-wide block read in one chair (off, out early, starts late, lunch, meeting, training, admin, office closed) makes those rows unavailable in every chair that provider runs, so a "No Doctor" day with a note in a second chair never becomes a day of open time; a chair-level block (a hold, equipment down, a staffing limit, an emergency reserve) leaves the other chairs as they read. A visible appointment in another chair is evidence and is never overridden. On a posted grid, an unbooked slot the practice software paints a pale tint (Dentrix shades a free slot inside the provider's hours this way) counts as open time alongside blank blue grid; a neutral light gray, which some software uses for unavailable time, and anything drawn on the slot stay for review. Lane omission keeps the stricter blank-blue test, so a chair tinted all day is a provider with nothing booked, not an empty lane. The time rail's minute marks (`:10`, `:20`, with or without the colon) join the rail fit once the hour labels anchor it, and their smallest gap sets the grid's row size when it is 5, 10, or 15 minutes; sparser marks leave the default. The rail's type is too small for the full-page read (on a real Dentrix capture the engine returned one usable hour label and "oem", "EE", "Zit" for the rest), so `recognizeFrame` reads the left strip — up to the first appointment box, capped at an eighth of the frame — a second time at 3x as sparse text, keeps only time-shaped tokens (`railWords`, in frame coordinates), and the rail reader takes both reads, drops duplicates, strips stray brackets, and fits the line robustly: a median-of-slopes (Theil–Sen) line first, because misreads come in clusters (an "8:00am" read as "3:00am" drags every minute mark hung on it, and a least-squares fit tilts through the cluster), then every minute mark is re-hung on the hour that line predicts, so a missing or misread hour label costs nothing, and the final least-squares fit uses only labels and marks within 20 minutes of the robust line. Verified against the engine's actual output for that capture: hour labels at 9, 1, 2 and 3 o'clock plus every minute mark at 93–96 confidence.

The grid's own colors are the office's record of the day's hours. Dentrix paints an unbooked slot inside a provider's hours pale, and leaves the blank blue grid where the provider is closed: before the first patient, at lunch, after the last. A frame that paints its slots this way reads blank blue as closed time, off duty and confirmed by the office's own setting, never as open, and saved working hours are not applied over it; the observed day then runs from the first bookable row to the last. A frame with no tinted slot anywhere keeps blank grid as open time and the saved hours. The cell reader ignores the grid's own lines in any gray, a full-width row of one shade, but a neutral fill or a stray mark keeps a cell for review, and a row a box covers by less than half belongs to the rest of the row, not the box. A note printed in its own box is as long as the box, so a thirty-minute hold beside an hour of closed grid is thirty minutes. A one-line note bar is a note whatever it says ("Aware Early", "<-- CAN NOT COME IN EARLIER"), so a column of bars is notes only without a keyword; a box too short to print its number still reads as an appointment when it prints its type (General, Primary, Non, PostOp). The lexicon knows "not here", "no pts", a first name out after a dash ("DO NOT BOOK - LUCY OUT"), and "NP" on its own as a slot held for a new patient.

A chair is whoever is working in it today, read from the column's content every capture and never remembered from an earlier day, because the schedule is not the same each time. The provider code comes first, read leniently (the engine's "DR0S", "DROS" and "DRQ5" are all DR05, with a digit surviving or exactly two look-alike letters, and repeated evidence across boxes). When no code is readable, the shape of a posted appointment box — procedures, type, code, a four-digit number that is never part of a date, time, tooth number or range — still marks it as an appointment, so it is never filed as a note and still counts as a completed visit in the column's metrics. Then the work itself says which department is running the chair: crowns, inlays, endo, extractions, implants and deliveries are the doctor's; prophies, perio maintenance, fluoride, x-rays and screenings are hygiene's; each box votes and a clear majority decides, with the chair's conventional name (DT-3, HT-1) as the hint when the boxes name no procedure. When the registry has exactly one active provider of that kind, the column is theirs; with two, the closer chooses. A code alone never names a doctor (an unregistered DR02 still asks once), and every suggestion is confirmed in the daily review.

The privacy gate also catches a new-patient note that names the patient in capitals ("NP - FIRST LAST"), which the Title-case name check missed; a team member's name in that position passes.

The gate reads each appointment box as its own text. Grouped across the whole frame, six chairs' boxes at one height read as a single line, so a wide schedule's top row counted as a sixteen-word note and an "NP" beside the next chair's procedures looked like a named new patient; neither is what the rules look for. A "Word, Word" pair inside the software's procedure shorthand ("EP, P-Screen, ProphyAd", which the 3x box read can return as "Screen, Prophypdd") is the list's shape, not a patient name: a pair in a list of three or more items, or on a line carrying procedure vocabulary or an exam code, is shorthand. A name on its own line in an unblinded box has neither and still stops the capture, as do a phone number, a date of birth, and the other rules, which are unchanged. A refused capture now says what it looked like, by kind and count only ("name-shaped text ×4, a long free-text note"); the matched text never leaves the detector, and the kinds are enough to tell a privacy view that is off from a reader that misread.

A column whose boxes are all notes needs no click: when appointment boxes elsewhere on the same grid carry provider codes, a box with no code and no hold or early-arrival wording is a note whatever it says ("NO MORE CROWNS FOR RNH", "Moved down 1 unit"), and such columns are excluded by default with Restore available. When no code is visible anywhere, only positive note wording counts, because the absence of a code alone proves nothing. The phrase-shorthand section in setup is collapsed and marked rarely needed: the built-in lexicon covers the usual notes.

Every capture also records where each provider's day actually sat on the grid — `first_patient_minute`, `last_patient_minute`, `available_start_minute`, `available_end_minute` on `provider_day_metrics` (migration `20260922180000_provider_observed_day.sql`; minutes from midnight office time; aggregates only). The office's hours are learned from these instead of asked for: for a provider with no work schedule in Team, calibration fills each weekday that has at least two reviewed captures in the last 120 days with the median observed availability (lower median start, upper median end — real observed values), labeled "N captured days since <date>"; weekdays with too few captures stay unknown, never off. When Team hours exist they stay authoritative, and the summary shows "Captures show …" beside them when the two differ, as information, not a flag.

The Reports Analyst reads the schedule beside the clock. Each attendance day carries the person's clock (first in, last out, in the office's time zone) and, when the office captured its schedule that day, the office's first patient and last patient to leave plus the person's own column when they are a provider; each provider-day is also its own "Schedule captures" record. The analyst's rules treat time before the first patient or after the last patient left as ordinary opening and closing work unless an included office rule says otherwise — it explains a day ("the last patient left at 5:00, she clocked out at 6:02") and only a repeated, sizable gap is worth a look. Deploy `reports-analyst` with `_shared/analyst-evidence.ts` for the analyst part; the capture and calibration parts ship with the frontend.

Each selected provider can also import weekly hours from CSV, text, or an image, then review and confirm the normalized weekday/time rows. Image reading runs locally. Original files are not retained; only reviewed hours are saved with the layout. PDFs and arbitrary calendar formats are not supported. Unlisted weekdays remain unknown. Confirmed off-duty time is blocked rather than counted as open; actual appointments outside confirmed hours remain in the metrics and trigger review.

Daily captures now reread column assignments and require a date-specific review before computing metrics. Readable unique staff names, confirmed provider codes, and explicit Notes/Memo headers suggest assignments. An unreadable header remains unassigned rather than inheriting a prior provider or notes designation. One provider may occupy several columns. Reviewed assignments apply only to the captured day; the reusable calibration is unchanged. The privacy gate runs before review, and cancel/navigation destroys the capture without saving metrics. This supports provider assignments that change between days; providers mixed within one column on the same day still need a different capture layout. Notes-only detection relies on explicit header text, not guesses about appointment prose.

For neutral appointment boxes on blue-grid schedules, the local reader now segments occupied boxes, normalizes contrast, and reads each region at 3x scale. Repeated provider-code evidence can resolve numeric-suffix OCR confusions such as DRO2/DROZ to DR02; duplicate readings at the same position do not count as independent evidence. Occupied column bounds replace header guesses when region/code evidence is sufficient, so blank lanes are not offered as providers. Notes-only suggestions require positive note wording in every detected block; ambiguous blocks remain for review. Other color themes retain the existing OCR/layout fallback. Detected codes still require a confirmed code-to-registry-name association; saving calibration retains that association.

Verification on the supplied full-size schedule crop: the original whole-image reader recovered no provider codes. The revised production OCR/mapping modules, executed locally with a native canvas adapter, recovered DR02 and HY11, four occupied column groups, and the evidenced left notes column. The source image and raw text are not committed or uploaded. This verifies recognition, not full-day timing or acceptance by the separate privacy gate.

Provider schedule codes are now stored on `org_providers.schedule_code` and editable in Settings → Office → Providers. They are optional, validated, and unique within an office. Registry codes take precedence over legacy layout aliases, so the first calibration can resolve providers before any layout is saved. Inactive roster matches are not reassigned through stale aliases. Apply migration `20260911210000_provider_schedule_codes.sql` before deploying this reader version; the production migration was applied before release.

Posted end-of-day screenshots can calibrate Completed + Open without a Scheduled color. When an appointment and an operational note share the completed color, the reader requires region/provider evidence for completion, classifies known operational notes separately, and leaves ambiguous blocks unclassified. Gray by itself never proves completion. If cancellation/no-show colors are not both available, the review labels those counts not distinguishable, flags review, and does not prefill Practice Vitals from zero visible events.

Empty-column filtering no longer falls back to all saved lanes when only one occupied lane is detected. A positively blank blue grid is omitted; any gray/green block or dark text keeps the lane for review. Recognized notes-only lanes are collapsed. Calibration and daily review provide reversible Exclude/Restore controls, so an extra empty/non-clinical lane never needs a fabricated provider. Early-arrival and hold lanes reserve time and must remain; absence of a provider code alone never proves a lane empty.

Posted end-of-day setup proceeds directly from provider review to working hours, with no color selection. New profiles store captureMode: posted and an empty legend. The reader uses appointment-region/provider-code evidence and explicit operational notes; uncertain content remains unclassified. Only verified blank grid becomes open time. Existing legacy color profiles remain readable, and posted captures never infer missing cancellation/no-show history.
