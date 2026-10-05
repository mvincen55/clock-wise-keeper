# Fill the Schedule, Q4 2026

Native Purple Envelope route: `/fill-the-schedule`. Protected by the existing
login, allowlist, office membership, and layout. Home has the campaign strip
directly under the greeting for owners, managers and members. Workplace keeps
its campaign card. Ordinary team sprints remain unchanged.

## Revision 2 workspace

The team has exactly two tabs: Record and My points. The manager has exactly
two: Review and Weekly scorecard. Point rules opens from the tab bar; manager
Settings opens from the gear. Record labels show the point values and whether
the action counts immediately or awaits verification. My points has separate
approved and awaiting tiles and lists. Pending amounts are never added to the
approved total.

Review holds reports, sheet upload and flagged rows. Verified bookings and
handoffs keep their attendance/prepayment controls on the original card, with
bonus date/time and an explicit verification. There is no entry-code dropdown.
The optional booked-by employee is a front-desk cross-check, not a second award.
Weekly scorecard puts the closing checklist before the full team table. Reviews
and huddles have explicit checked-this-tally markers, including weeks with none.

## Front-desk sheet and reader

Print blank sheet registers a unique code with twelve rows for the chosen
tally. Open/reprint keeps the original code; a second blank page gets a fresh
code. The protected route is `/fill-the-schedule/sheet/:sheetId`. Browser print
and the styled Excel download are landscape Letter with a one-page print area
and four corner registration squares. Staff columns hold date/time, credited
employee, optional booked-by, booking confirmation, actual prepayment and its
date/time, staff initials and optional app code. Shaded manager columns verify
handoff, prepayment and verification date. Calls, QR requests, posted reviews,
and huddles stay off this sheet.

The reader uses the existing, vendored Tesseract worker on the device, plus the
PDF.js compatibility worker for one-page PDFs. It normalizes all four form
corners before cropping cells. Employee matches must be exact and unique; an
ambiguous name or time goes to Review. Checkbox plus manager initials are
required for a verification mark. Long cross-out strokes are flagged. Raw OCR
text, image bytes and canvases never go to the database. Only allowlisted
roster IDs, dates, booleans, app references and field confidence are accepted.
Working copies are released before the release timestamp is recorded; the
original file on the user's computer is unchanged.

Automatic entry ships OFF. Synthetic browser checks are not a real handwriting
test. The campaign must pass at least 30 real rows from 3 staff, 95% field
accuracy, zero wrong-person matches and zero false verification marks before
`fts_validate_reader` may record validation. Manager Settings then allows the
flag to be enabled. Until then, scans go to Review for confirmation, and can
be saved as own pending reports or individually verified there. Never record
validation from synthetic results or simply raise field confidence to bypass it.

With the flag enabled, a clear, verified handoff awards 2 points through the
existing approval path; separately verified actual prepayment adds 2 through
the existing bonus path. An unclear prepayment never blocks a clear handoff.
A clear unverified handoff becomes an own pending report with zero points.
Sheet code, row and component produce stable request keys. Rescans add nothing;
changed rows preserve existing points until the manager keeps or replaces the
original with a reason. Exact app references link one original action; possible
matches without a code are flagged. Reversed/skipped rows cannot be resurrected
by rescanning. Corrections preserve source and superseded-entry history.

## Team records versus manager verifies

| Team records | Points | Verification |
| --- | --- | --- |
| Review requested and QR card handed out | 1 each | Honor-system running tally, immediately approved |
| Appointment booked from unscheduled treatment list | 1 | Manager verifies |
| Operative treatment booked before leaving and walked up front | 2 | Manager verifies |
| Card on file presented chairside on a case over $10,000 | Unset until manager confirms rate | Can report; cannot approve without rate |

| Manager records | Points | Requirement |
| --- | --- | --- |
| Documented unscheduled treatment calls | 1 each | Same-day MaxAssist note and phone code; weekly total replaces previous total |
| Posted Google review names employee | Doctor/hygienist 3, clerical 5, assistant 7 | Manager verifies, campaign scoring group confirmed |
| Booked appointment attended | +2 | Link to approved unscheduled-list booking |
| Prepayment | +2 | Link to approved booking or operative handoff; card on file is not prepayment |
| On time for huddle | 1 per date | Manager checklist; re-saving corrects date without duplicate points |

Manager can record reports on behalf of a roster member, including a person
without a login. No users are invited automatically. Confirmed primary operational job roles
may seed a scoring group, but permission roles never determine review points.
Unresolved groups remain unset and cannot earn prizes or posted-review points.

## Tally and prizes

- October 5 through December 31, 2026, America/New_York. The first tally
  closes Friday October 9 at noon Eastern; October 2 is not a campaign tally.
- Friday noon closes each tally. Friday noon and later roll to the next tally.
  The final partial tally closes at midnight after December 31.
- Pending, rejected, withdrawn, and reversed entries do not count.
- 20 points earns one prize pick; 30 earns two, maximum two weekly. A prize
  pick is one item from the prize bin. Clerical requires 10 documented calls
  in the same tally week. Highest eligible weekly total picks first; ties
  share priority. Picks are marked received only after tally close.
- Highest quarter total wins $100. Tied leaders are shown; no invented
  tiebreaker. Standings are manager-only.
- Doctor open time goal is under five hours weekly. Missing actual hours
  remain missing, never zero. The earlier approximate 20 hours is not seeded.

## Ledger and privacy

Campaign tables are scoped by office and campaign, all with RLS. Staff can
read their own ledger and shared office hours. Managers can see the roster,
verification queue, weekly standings, and audit history. Browser writes are
only through permission-checked, campaign-locked RPCs. The authenticated
Supabase client is reused through `pending-schema.ts`; no new client or
service-role credential is introduced.

No patient names, initials, identifiers, clinical details, contact information,
review text, reviewer identity, financial account information, image uploads,
or free-text notes. Verify the original event in Dentrix, MaxAssist, or Google.
Random entry codes connect anonymous paper and app reports; bonuses are linked
to the originating action in the manager's Review card.

Request keys prevent repeated submissions on retry. Bonuses are unique per
origin and kind. Awarded rates are frozen. Staff can withdraw their own QR
entries or pending reports. Managers reverse approved records, reversing linked
bonuses first. Calls, huddles, hours, and received prize counts can be corrected;
all changes are audited. A correction never erases prizes already received;
the scorecard flags any discrepancy.

## Release verification

Install with `bun install --frozen-lockfile` in a fresh checkout. `fflate` is
now a direct dependency at its already-locked version, preserving Excel styles,
print settings and registration squares during personalisation. Run typecheck,
build, `fill-the-schedule.test.ts`, `fill-the-schedule-page.test.tsx`, and
`fill-the-schedule-sheets.test.ts`. `scripts/fill-schedule-browser-check.mjs`
checks two-tab role navigation, desktop/phone layout, Excel download, one-page
PDFs at 67/100/125%, zero invented blank-row reports and a synthetic structured
read. The normal browser CI job runs it alongside the FOF/dashboard checks.
The native PostgreSQL probe in `supabase/tests/fill_the_schedule_probes.sql`
is a live-release, rollback-only probe requiring an existing allowlisted
Harelick manager and member, and dates within this Q4 campaign. It is not a
fresh-database fixture and is intentionally not wired into migration replay.
`supabase/tests/fill_schedule_sheet_probes.sql` is a second rollback-only live
probe for sheet permissions, independent 2+2 awards, rescans, changed readings,
app links, possible duplicates, reversals, validation gating and own pending
visibility. It creates an isolated probe campaign and must never be committed
as live office scores.

Direct GitHub changes do not apply migrations. Apply the exact committed
`20261005181000_fill_the_schedule.sql` and
`20261005193000_fill_schedule_roster_roles.sql`, and
`20261005200000_fill_schedule_start_oct5.sql`, followed by
`20261005213000_fill_schedule_sheets.sql` and
`20261005220000_fill_schedule_preserve_scan_flags.sql` in transactions and record their
versions in migration history before publishing the synced frontend. The roster
follow-up recognizes undated primary jobs, never permanent backup capabilities. No edge function
deployment is needed.
