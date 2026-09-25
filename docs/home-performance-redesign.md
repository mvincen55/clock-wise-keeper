# Home performance redesign — source map and decisions

Status: built on branch `claude/clever-bell-5kjcj3`. Home (`/`) is the
briefing; Management stays the workbench. This document is the map every
chart and observation on Home was built against, in the order the brief asked
for: source first, then the experience.

## 1. Sources (what exists, who can read it, what each row means)

| Source | Table / hook | Who reads it (RLS) | Date basis | What a row is | Nullable / "not recorded" |
|---|---|---|---|---|---|
| **Close the Day closeouts** | `deposit_logs` via `usePracticeVitals` (12 months through today, org-scoped) | every active member | `deposit_date` — the office day | one closeout per office day: production as entered at closeout, receipts by tender (cash, checks, cards, financing, other), new patients scheduled / seen, hygiene and doctor cancellations / no-shows, seal state | `production_cents` null = not entered; new-patient counts null = not answered; `missed_appointments_recorded = false` = counters are not observations; a day with no row = **not recorded**, never $0 |
| **Prepared report history** | `practice_report_imports` via `usePracticeReportImports` (new hook; same query the Report history page runs) | owners and managers only (`is_org_admin`) | **posting date** (`daily_financials_by_entry_date`) | one loaded package per date range: posted charges, recorded receipts, credit and charge adjustments per posting day; monthly rows carry `coverage` (full or partial month) | a package covers only its own range; two packages can overlap — precedence below |
| **Missed appointment postings** | `missed_appointment_events` via `useMissedAppointmentEvents` | every active member (read); admins write | `business_date` | one Dentrix 9100 (no-show) or 9101 (late cancellation) posting; department doctor / hygiene / other | `department = 'other'` is shown as **unassigned**, never folded into doctor or hygiene |
| **Targets and visibility** | `org_practice_settings` via `usePracticeSettings` | members read; admins write | month | monthly production / collections / new-patients-seen goals (0 = no goal) and per-metric visibility (`everyone` / `admin_only`) | no goal → "No goal set" with a setup action for admins, never an invented target |
| **Attention** | `useAttentionItems` → `deriveAttention` | owners and managers (empty for members) | now | open items in consequence order with age, deadline, waiting / parked state and the exact `/management?item=` destination | a degraded source is named, never read as "nothing" |
| **Office challenge** | `team_goals` via `useTeamGoals` → `buildGoalBrief` | whatever RLS lets the member see | sprint window | the primary live sprint | — |
| **Staffing** | `attendance_day_status` via `useOrgAttendanceSnapshot` → `staffing.ts` | admins | today | phase, exceptions | a closed office never produces exceptions |

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
- **Pace** — `metricPace` (shared): target × calendar days elapsed ÷ days in
  month, ±2% on-pace band. Labeled "calendar-day pace" everywhere; the
  office's working-day calendar is not verified, so no working-day pace and no
  "you need $X per remaining day" projection is shown.
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
| Not recorded (no closeout row) | gap in the bars, "Not recorded" in the tooltip and the table; cumulative view steps flat across the gap and the coverage line counts it |
| Recorded zero (a closeout with $0 collected) | a real 0 bar with "Sealed" / "Saved, not sealed" status |
| Stale (last closeout days ago) | "Data through <date>" in the strip; the closeout-gap observation fires at 4+ days |
| Hidden by visibility | omitted from the member view entirely — no teaser |

## 5. Drilldowns (destinations that actually read the parameters)

| From | To | Filter handling |
|---|---|---|
| a closeout day in the chart or table | `/deposit-log?date=YYYY-MM-DD` | existing (`DepositLog` reads `date`) |
| a report-history day or the series | `/report-history?start=&end=&tab=daily` | new: picks the package covering the range, opens the tab, filters daily rows to the range with a visible "clear" chip |
| the missed-appointments trend | `/management/missed-appointments?start=&end=` | new: the page initializes its range from the query |
| Needs you rows | `/management?item=<kind>:<id>` | existing Attention deep link |
| goals with no target (admins) | `/management/office/settings#office-goals` | new anchor on the goals section of Practice settings |

## 6. Roles

- **Owner** — summary sentence, performance strip, chart beside goals and
  observations, Needs you (top three Attention items), the challenge once,
  missed-appointment trend, staffing exceptions.
- **Manager** — the state sentence, the same strip / chart / goals /
  observations, quick tools (Create FOF, Fee schedules, Close the Day, Report
  history), Needs you, Today, Mine (the manager's own commitments), the
  challenge when noteworthy, the missed-appointment trend, and the manager's
  own accountability record below (deep link `?record=` preserved).
- **Team member** — My next move, a lighter office scoreboard (only metrics
  whose visibility is `everyone`), the shared challenge, my open work, role
  lanes, time and PTO utilities. No Attention, no observations about staff, no
  report history, no rankings.

One calculation layer (`metric-pace`, `performance-series`, `goal-progress`,
`home-insights`) feeds all three; the role only changes emphasis and access.

## 7. Deliberately not shown

Chair utilization, treatment acceptance, payroll cost, revenue-loss
estimates, collection rate, per-patient anything, per-person rankings,
working-day pace, projections from partial months.

## 8. Verification (this branch, run in the review sandbox)

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit -p tsconfig.app.json` | clean |
| Unit and component tests | `npx vitest run` | 2398 passed, 53 skipped, **1 failed**: `fof-builder-grouping.test.tsx` "groups untyped lines by their suggested visit" — a 5 s timeout on the FOF builder that fails on `main` in this sandbox too (baseline run: 2319 passed, the same single failure) and passes when the file runs alone (7 of 7); unrelated to Home |
| Lint | `npx eslint .` | 210 errors / 51 warnings repo-wide, every one pre-existing (edge functions, `tailwind.config.ts`, older pages). Zero errors in the files this branch adds; every file it modifies has the same error count before and after (checked per file against `HEAD`) |
| Production build | `npx vite build` | built in 55 s (the existing chunk-size warning only) |
| Rendered review | `node scripts/design-review-capture.mjs` against `npx vite` | 16 scenarios × 2 widths, no page errors, no horizontal overflow — `design-review/*-{desktop,mobile}.png` |

New test files and what they pin:

| File | Pins |
|---|---|
| `performance-series.test.ts` | period presets and partial flags; comparable prior spans; source precedence and the report-history fallback as a separate view; missing vs zero (null gaps, recorded $0, not-in-package); cumulative over recorded days; date-range filtering; weekly buckets; per-recorded-day comparisons and when they are withheld; the coverage line; overlapping packages never double-count; the opening preset |
| `missed-trend.test.ts` | postings-first precedence, closeout counts only on recorded days, unassigned kept apart, bucket granularity, gaps as gaps, comparison rules |
| `goal-progress.test.ts` | each metric against its own target, no cross-wiring, no goal / no data / over-goal states, the calendar-day label |
| `home-insights.test.ts` | data sufficiency first, collections vs the same days last month (per recorded day, both directions, withheld when thin), behind pace, goal reached, cancellations rising / falling, work waiting (manager only), the three-item cap, the steady case |
| `home-performance.test.ts` | rows from another office never build a view; members never receive report history or postings; meters follow visibility |
| `performance-chart.test.tsx` | the period row scopes strip and chart; series switches; cumulative view; the table twin with links; the `0` baseline; drilldown destinations; the missed tile and trend hand over the period; report history as a separate view; loading and error states; no source switch for members; partial labels |
| `home-drilldown-destinations.test.tsx` | Missed appointments seeds its range from the query; Report history opens the covering package on the requested tab, narrowed to the range, and widens again on the same package |

Existing dashboard tests (`owner-home`, `manager-home`, `member-home`,
`dashboard-empty-states`) were rewritten for the new composition; the intentional
changes are listed in `DESIGN_REVIEW.md` (pass 6).
