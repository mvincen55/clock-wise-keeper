# Fill the Schedule, Q4 2026

Native Purple Envelope route: `/fill-the-schedule`. Protected by the existing
login, allowlist, office membership, and layout. Home and Workplace show a
campaign card only when that office has the campaign. Ordinary team sprints
remain unchanged.

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

- October 1 through December 31, 2026, America/New_York.
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
review text, reviewer identity, financial account information, uploads, or
free-text notes. Verify the original event in Dentrix, MaxAssist, or Google.
Random entry codes connect the anonymous action and its bonus here.

Request keys prevent repeated submissions on retry. Bonuses are unique per
origin and kind. Awarded rates are frozen. Staff can withdraw their own QR
entries or pending reports. Managers reverse approved records, reversing linked
bonuses first. Calls, huddles, hours, and received prize counts can be corrected;
all changes are audited. A correction never erases prizes already received;
the scorecard flags any discrepancy.

## Release verification

Install from the unchanged `bun.lock` in a fresh checkout. Run typecheck,
build, `fill-the-schedule.test.ts`, and `fill-the-schedule-page.test.tsx`.
The native PostgreSQL probe in `supabase/tests/fill_the_schedule_probes.sql`
is a live-release, rollback-only probe requiring an existing allowlisted
Harelick manager and member, and dates within this Q4 campaign. It is not a
fresh-database fixture and is intentionally not wired into migration replay.

Direct GitHub changes do not apply migrations. Apply the exact committed
`20261005181000_fill_the_schedule.sql` and
`20261005193000_fill_schedule_roster_roles.sql` in transactions and record their
versions in migration history before publishing the synced frontend. The roster
follow-up recognizes undated primary jobs, never permanent backup capabilities. No edge function
deployment is needed.
