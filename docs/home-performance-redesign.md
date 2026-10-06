# Home performance redesign — source map and decisions

Status: built on branch `claude/clever-bell-5kjcj3`; revised on
`claude/sweet-cerf-l3m0cz` (office-day pacing, per-metric completeness,
observed vs estimate, the grouped Needs you queue and the member's own work —
`DESIGN_REVIEW.md`, pass 7). Home (`/`) is the briefing; Management stays the
workbench. This document is the map every chart and observation on Home was
built against, in the order the brief asked for: source first, then the
experience.

## September 30, 2026: approved preview implementation

This section supersedes the earlier layout descriptions below. The current
manager and owner dashboard uses `PracticePerformance` and `ChosenGoals`.

- The first control below the greeting is **This month / Year to date**.
  Managers start on the month, owners on YTD. Totals, targets, year comparison,
  chart, forecast and missed-appointment dates all follow that selection.
- Three compact cards show collections, production and new patients seen,
  subject to the existing visibility settings. Financial cards include both
  absolute and percent year-over-year changes, configured target progress,
  and average per office day with the prior year's average.
- The chart compares the same calendar dates in the current and previous two
  years. The month view shows running recorded totals; YTD shows monthly
  observations. Purple, teal and muted lilac distinguish the years. A dashed
  line shows the configured goal by office day, separately from actual data.
- The two outlook figures show projected finish and the amount needed per
  remaining office day. Missing records, unsealed closeouts, unconfirmed source
  dates or an unavailable office calendar withhold forecasts and growth claims.
  The annualized target remains the monthly goal multiplied by twelve and is
  labeled as such. It is not a separately configured annual goal.
- An office goal card and selected team member's goal card sit side by side
  below the chart. The person selector lives in the card header. These goals
  are not month-scoped: each runs until it is completed or changed (a goal
  completed in the last 30 days still shows, as completed), so they do not
  move when financial performance switches to YTD. A personal goal shows its
  optional target date, or the day it was set; an open office goal says it
  runs until it is reached. Personal progress measures completed goal steps,
  not inferred results against free-text targets. Members only receive their
  own goal.
- Owners have an “Across the years” comparison; managers have a two-row preview
  of the real Needs you queue with the rest expandable. Existing workflows,
  permissions and exact-record navigation stay in place.

The history adapter reads already imported reports. A full monthly total may
replace that month's daily sum, but never adds to it. Monthly reports do not
produce invented daily points or partial-month totals. This presentation update
does not import, overwrite or reclassify historical records.

Browser checks exercise all three roles with a 240px desktop navigation gutter,
tablet and phone widths, both period directions, selected-person goals, chart
metric selection, exact-value disclosure and dark mode. Fixtures contain only
synthetic data and the browser blocks external requests.

## 1. Sources (what exists, who can read it, what each row means)

| Source | Table / hook | Who reads it (RLS) | Date basis | What a row is | Nullable / "not recorded" |
|---|---|---|---|---|---|
| **Close the Day closeouts** | `deposit_logs` via `usePracticeVitals` (12 months through today, org-scoped) | every active member | `deposit_date` — the office day | one closeout per office day: production as entered at closeout, receipts by tender (cash, checks, cards, financing, other), new patients scheduled / seen, hygiene and doctor cancellations / no-shows, seal state | `production_cents` null = not entered; new-patient counts null = not answered; `missed_appointments_recorded = false` = counters are not observations; a day with no row = **not recorded**, never $0 |
| **Prepared report history** | `practice_report_imports` via `usePracticeReportImports` (new hook; same query the Report history page runs) | owners and managers only (`is_org_admin`) | **posting date** (`daily_financials_by_entry_date`) | one loaded package per date range: posted charges, recorded receipts, credit and charge adjustments per posting day; monthly rows carry `coverage` (full or partial month) | a package covers only its own range; two packages can overlap — precedence below |
| **Missed appointment postings** | `missed_appointment_events` via `useMissedAppointmentEvents` | every active member (read); admins write | `business_date` | one Dentrix 9100 (no-show) or 9101 (late cancellation) posting; department doctor / hygiene / other | `department = 'other'` is shown as **unassigned**, never folded into doctor or hygiene |
| **Targets and visibility** | `org_practice_settings` via `usePracticeSettings` | members read; admins write | month | monthly production / collections / new-patients-seen goals (0 = no goal) and per-metric visibility (`everyone` / `admin_only`) | no goal → "No goal set" with a setup action for admins, never an invented target |
| **Attention** | `useAttentionItems` → `deriveAttention` | owners and managers (empty for members) | now | open items in consequence order with age, deadline, waiting / parked state and the exact `/management?item=` destination | a degraded source is named, never read as "nothing" |
| **Office challenge** | `team_goals` via `useTeamGoals` → `buildGoalBrief` | whatever RLS lets the member see | sprint window | the primary live sprint | — |
| **Staffing** | `attendance_day_status` via `useOrgAttendanceSnapshot` → `staffing.ts` | admins | today | phase, exceptions | a closed office never produces exceptions; a late arrival that is in reads "In · late 12m", calm — routine, never an exception |
| **Office calendar** | `office_closures` + open Saturdays via `useOfficeDays` → `office-days.ts` (`isOfficeDay`, `countOfficeDays`) | every active member | office days | which calendar days the office works: Mon–Fri less closures, plus open Saturdays | the calendar is the pacing basis; when it has not loaded, pace falls back to calendar days and is labeled an estimate |
| **Late arrivals (own)** | `tardies` via `useTardies`, `escalation_policies` (`tardy_threshold`) via `useLateArrivalRule` → `late-arrivals.ts` | the person (RLS); admins for the team | entry date | one late arrival: acknowledged, excuse requested (pending / approved / declined), or unanswered; the rule is N unexcused in a window | an unanswered arrival is the person's item; a pending excuse waits on a manager; the count against the rule is a count, never a verdict |
| **Own work** | `checklist` gating, `acknowledgment_assignments`, `training_assignments`, `incident_reports` (attendance reports), `pto_requests`, `correction_requests`, office requests → `my-work.ts` | the person | now | what the person owes (now), what waits on someone else (waiting), and the single next move | a backup role adds nothing; a role covered today does |

Nothing on Home names a patient. No source above holds one.

## 2. Precedence rules (explicit, tested)

**Production / collections chart and strip.** One source per view, never a
blended total:

1. If the selected period has at least one closeout day, the view reads
   **Close the Day** (production entered at closeout; receipts by deposit date).
2. Otherwise, if a loaded report package covers any day of the period, the
   view reads **Report history** and the series are labeled **Posted charges**
   and **Receipts (posting date)** — different definitions, different names.
3. Otherwise the chart is an empty state that names the missing input and
   links to Close the Day and Report history.

When both sources cover the period the reader can switch views; the current
source and date basis are printed under the chart. A day covered by two
loaded packages takes the most recently imported package (`imported_at`
descending) — the other is ignored for that day, never added.

**Missed appointments.** Dentrix postings win when any posting falls in the
period; otherwise the closeout counters (only days where
`missed_appointments_recorded` is true); otherwise "not recorded". Doctor,
hygiene and unassigned stay separate categories.

**New patients seen.** Always from closeouts (completed first visits). Report
history carries "new patients of record" per period, which is not the same
count, so it is not shown as a daily series.

## 3. Definitions the surfaces print

- **Production (Close the Day)** — the production figure entered for the
  office day. Procedure-date basis as entered; not posting-date charges.
- **Collections (Close the Day)** — receipts recorded at closeout by deposit
  date. Receipts can pay older balances: production minus collections is not
  unpaid treatment, and receipts ÷ this period's production is not a
  collection rate. The chart never draws that difference.
- **Posted charges / Receipts (report history)** — posting-date figures from
  the loaded package. Refunds are already inside charge adjustments; the
  office fee comparison difference is not a write-off. Neither is charted.
- **Pace** — `goalMeters` over `metricPace` (shared): target × office days
  elapsed ÷ office days in the month, ±2% on-pace band. The office days come
  from the office calendar (`countOfficeDays`: Mon–Fri less closures, plus open
  Saturdays); today counts as elapsed only once its closeout is recorded. The
  basis is printed with every verdict ("office day 5 of 22"). When the calendar
  has not loaded, the meter falls back to calendar days and says so ("Below
  calendar pace (estimate)"). No "you need $X per remaining day" projection is
  shown.
- **Completeness** — every money figure carries the number of office days
  recorded against the office days expected through its cutoff. Only
  closeouts that fall on office days count toward "recorded": a closeout on
  a day the office calendar does not list (an unmarked Saturday, a listed
  closure) stays in the totals but never stands in for a missing office day,
  and the label names it ("18 of 19 office days recorded · through Sep 25 ·
  6 recorded outside the office calendar") so the calendar gap is visible. Cutoff is
  yesterday until today's closeout exists, then today. `complete` (every
  expected day recorded), `partial` (N office days not recorded — the label
  names N and links Close the Day to complete the records), `unknown` (no
  calendar). A partial month never earns a "behind" verdict: the meter reads
  "Partial data" and pace is not judged. A whole month covered by a loaded
  report package uses the package's monthly summary as the authoritative total
  ("Complete month · report package summary") rather than summing its days.
- **Partial periods** — This week, This month and Last 3 months are partial
  and say so ("through Sep 24"). Comparisons use the same elapsed span of the
  prior period (days 1–24 of last month against days 1–24 of this month), and
  only when both sides have enough recorded days (3 for a week, 5 otherwise)
  and coverage within 30% of each other. Otherwise the comparison is withheld
  and the reason is stated.

## 4. Missing vs zero

| State | How it renders |
|---|---|
| Loading | "Reading…" with the frame held; no zeros |
| Failed | "Could not read closeouts" + retry-by-refresh copy; the chart never falls back to another source silently |
| Not recorded (no closeout row) | gap in the bars, "Not recorded" in the tooltip and the table; cumulative view steps flat across the gap and the coverage line counts it as an office day not recorded (a closure or weekend is not a gap) |
| Partial period (office days missing) | "Partial data · N office days not recorded" on the tile, "N of M office days recorded · through <cutoff> · k not sealed" in the information control, the meter's verdict withheld; the fix is a link to Close the Day |
| Complete month from a report package | the package's monthly summary is the total; the information control says so |
| Recorded zero (a closeout with $0 collected) | a real 0 bar with "Sealed" / "Saved, not sealed" status |
| Stale (last closeout days ago) | "through <date>" in the strip and the information control; the closeout-gap observation fires at 4+ office days |
| Hidden by visibility | omitted from the member view entirely — no teaser |

## 5. Drilldowns (destinations that actually read the parameters)

| From | To | Filter handling |
|---|---|---|
| a closeout day in the chart or table | `/deposit-log?date=YYYY-MM-DD` | existing (`DepositLog` reads `date`) |
| a report-history day or the series | `/report-history?start=&end=&tab=daily` | new: picks the package covering the range, opens the tab, filters daily rows to the range with a visible "clear" chip |
| the missed-appointments trend | `/management/missed-appointments?start=&end=` | new: the page initializes its range from the query |
| Needs you rows | `/management?item=<kind>:<id>` | existing Attention deep link |
| a Needs you group ("Open all") | `/management?kind=<kind>` | new: the Attention room filters to that kind and says so ("Showing: Closeouts to seal · 3", "Show everything") |
| a member's own row | the exact record: `/days-off?tardy=<id>`, `/incident-reports?report=<id>`, `/?record=<id>`, `/management/office/acknowledgments?assignment=<id>`, `/training?assignment=<id>&tab=mine`, `/checklists`, `/inbox/requests`, `/my-requests` | existing pages; every href is pinned by `my-work.test.ts` |
| goals with no target (admins) | `/management/office/settings#office-goals` | new anchor on the goals section of Practice settings |

## 6. Roles

Every role reads the same order: what needs my action → status → trends →
tools. An admin Home opens on a board (`SummaryPanel`): the office state,
everyone on the roster as a chip — hover or focus shows the person's
schedule for today (the shift, remote, minutes late), a click opens their
record in People — at most three genuine priorities, then the month: the
production and collections meters on the office-day pace and the office
challenge with its state, above the fold. Under the board the page is two
columns that flow independently (`HomeColumns`): the main column holds the
queue and, directly beneath it, the period filters, the strip and the chart;
the sidebar holds Today (exceptions and one count line, never the roster),
the latest closeout with its state, and the cancellation trend scoped to the
same period row, and stays in view while the main column scrolls. Worth a
look runs at full width under both columns. Under `lg` the columns dissolve
into one, actions first. Closeout completeness is not tracked on Home as a
strip: an office day with no closeout reaches the board as a priority line
(when it is the gap since the last closeout) and as the meters' partial-data
label with the fix, and the queue carries "Close the Day is behind".

- **Owner** — header (state chip, role context, Close the Day, Attention · n),
  the board ("Right now": headline, the roster chips, the priorities: a
  degraded source, someone absent after their shift, no closeout on record,
  an office day since the last closeout with none of its own, payroll due
  within a week, the inbox; then "This month": the two meters and the
  challenge), Needs you (unique actionable items, repeated kinds folded into
  expandable groups that still open each record, waiting and parked apart)
  with Mine (the owner's own items) beneath, the performance block; in the
  sidebar Today (attendance facts to review, exceptions, the count line), the
  latest closeout's facts, the cancellation trend; Worth a look; one tools
  area.
- **Manager** — the same board and columns, with a daily brief; routine
  lateness never headlines: attendance reaches the queue only as an excuse
  request (decide) or an attendance report (meet and sign). After close the
  board reads "Wrap-up" and Needs you becomes Before you leave. The manager's
  own accountability record stays below (deep link `?record=` preserved).
- **Team member** — My next move, My work (now / waiting on someone else),
  For my role, the office goal, My time & PTO with the late-arrival standing
  line ("2 of 3 unexcused late arrivals in the last 30 days · 1 excuse request
  pending", a count against the office rule, never a verdict), Our office
  pulse (only metrics whose visibility is `everyone`) with the shared goal
  meters, tools. No roster, no Attention, no observations about staff, no
  report history, no rankings.
- **Tools** — one area for every role: the assigned role first, roles covered
  today, management (members only through a grant, and only the granted
  tools), backup roles ("Backup — can cover, not assigned today") behind "More
  tools · n", then everyone's essentials. A destination appears once.

One calculation layer (`metric-pace`, `performance-series`, `goal-progress`,
`home-insights`) feeds all three; the role only changes emphasis and access.

## 7. Deliberately not shown

Chair utilization, treatment acceptance, payroll cost, revenue-loss
estimates, collection rate, per-patient anything, per-person rankings,
projections from partial months, a "behind" verdict on partial data, routine
late arrivals as manager alerts.

## 8. Verification (pass 7, run in the review sandbox)

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit -p tsconfig.app.json` | clean (app and tests) |
| Unit and component tests | `npx vitest run` | 2519 passed, 53 skipped, 0 failed (246 files, after merging main) |
| Lint | `npx eslint <the 52 changed files>` | 0 errors, 9 warnings — every warning is `react-refresh/only-export-components` on the kit's style tokens and the chart files; the count across the changed files equals `HEAD` (two token exports added to the kit, one pre-existing warning removed from `NeedsYou.tsx` and one from `useDashboardView.ts`) |
| Production build | `npx vite build` | built (the existing chunk-size warning only) |
| Rendered review | `node scripts/design-review-capture.mjs` against `npx vite` | 20 scenarios × 3 widths (1440×1000, 834×1112, 390×844): 60 of 60 captured, no page errors, no horizontal overflow, smallest rendered text 12.5px (the review notes; the dashboard itself is 13px and up) — `design-review/*-{desktop,tablet,mobile}.png` |

Test files and what they pin (this pass and pass 6):

| File | Pins |
|---|---|
| `attention-groups.test.ts` | repeated kinds fold into one group at two or more, singletons stay rows, order is preserved, the count is the unique items, group destinations are `/management?kind=` |
| `my-work.test.ts` | the member's own items in priority order (attendance report, time record, incident signature, late arrival, reply, bypass, acknowledgment, training, checklist, missing day), waiting items apart (PTO, correction, excuse), every href to the exact record, a backup role adds nothing |
| `performance-completeness.test.ts` | office-day counting around closures and open Saturdays, the cutoff rule (yesterday until today is recorded), partial vs complete vs unknown, the authoritative monthly total from a report package, the coverage label |
| `home-tools.test.ts` | tools order (assigned → covering today → management → backup → everyone), one destination once, members reach management tools only through a grant and only the granted ones, the backup note |
| `goal-progress.test.ts` | each metric against its own target; office-day basis and its label; partial data withholds "behind"; the calendar-day fallback is an estimate; reached / ahead / on pace; no goal / no data |
| `home-insights.test.ts` | data sufficiency first; no meter verdicts; collections per recorded day vs the same days last month, both directions, withheld when thin; cancellations rising / falling; records incomplete; the calendar estimate note; observed vs estimate; the three-item cap |
| `home-brief.test.ts` | the summary's headline and its at-most-three priorities (degraded source, absent after shift, no closeout on record, payroll within a week, inbox before close); routine rows never exceptions; the wrap-up state |
| `performance-series.test.ts` | period presets and partial flags; comparable prior spans; source precedence and the report-history fallback as a separate view; missing vs zero; cumulative over recorded days; weekly buckets; overlapping packages never double-count |
| `missed-trend.test.ts` | postings-first precedence, closeout counts only on recorded days, unassigned kept apart, bucket granularity, gaps as gaps, comparison rules |
| `home-performance.test.ts` | rows from another office never build a view; members never receive report history or postings; meters follow visibility |
| `performance-chart.test.tsx` | the period row scopes strip and chart; series switches; cumulative view; the table twin with links; the `0` baseline; drilldown destinations; office-day coverage labels; loading and error states; no source switch for members |
| `home-drilldown-destinations.test.tsx` | Missed appointments seeds its range from the query; Report history opens the covering package on the requested tab, narrowed to the range |
| `owner-home`, `manager-home`, `member-home` (`.test.tsx`) | the composition per role: hierarchy, header, summary, the grouped queue and its count, Today, status, meters, Worth a look, the challenge, lanes, tools, after-close, brand-new office, hidden financials, backup vs covering |

The intentional test changes are listed in `DESIGN_REVIEW.md` (pass 7).
