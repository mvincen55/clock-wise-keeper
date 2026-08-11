# Monthly production target — implemented

Status: **implemented** (originally documented here as a proposal before any
schema change, per the Owner Home redesign brief).

## What shipped

`org_practice_settings.monthly_production_target_cents` (nullable bigint,
added by `supabase/migrations/20260811120000_office_performance_pulse.sql`)
alongside two siblings that keep the three office metrics strictly parallel
and strictly separate:

- `monthly_production_target_cents` + `production_visibility`
- `monthly_collections_target_cents` + `collections_visibility` (pre-existing)
- `monthly_new_patients_seen_target_count` + `new_patients_visibility`

All three targets are optional. Null/0 keeps the original behavior: factual
totals, no pace verdict, never a fake percentage. When a target is set,
`usePracticeVitals` exposes it and the shared pace layer
(`src/lib/metric-pace.ts`, consumed by `owner-pulse.ts`, `manager-pulse.ts`,
and `member-pulse.ts`) renders ahead / on pace / behind with the same ±2%
on-pace band collections always used — one formula for every dashboard.

## Invariants preserved from the original recommendation

- The production target is an org-configured setting — never hard-coded and
  **never derived from the collections goal**. Collections lag production by
  insurance timing; the two numbers answer different questions and each paces
  only against its own goal. The pairing is structural in
  `productionPace()` / `collectionsPace()`.
- Each metric's visibility is its own setting; `admin_only` hides a metric
  from regular members' Home (owners and managers always see all three).
  These are dashboard-display controls, not secrecy claims.
- The prior-month comparison ("Last month had reached about $X by this
  point") survives as a comparison when no production goal is set — it is
  never relabeled as a target.

## New-patient metrics that shipped with it

Close the Day records two separate aggregate counts on `deposit_logs`
(`new_patients_scheduled_count`, `new_patients_seen_count`), both nullable so
old records stay "not recorded". Only patients **seen** (completed first
visits) advance the new-patient goal; scheduled patients are a pipeline
indicator. The weekly pace shown in settings and dashboards is the calendar
approximation `monthly target ÷ (days in month ÷ 7)`, labeled as such —
Purple Envelope does not claim to know future working days.
