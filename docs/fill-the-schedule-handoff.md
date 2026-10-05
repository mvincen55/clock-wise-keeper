# Fill the Schedule: implementation handoff

Status: approved design, not yet built. Read this whole file before touching
code. The design mockups are at the proposal page shared by the office manager
(Revision 2). Where this file and the mockups differ, this file wins.

## 0. Ground rules

- **Scoring rules do not change.** The campaign row, `fts_rate`, `fts_week_key`,
  prize tiers, clerical call gate, bonus linking, reversal order and the audit
  log stay as implemented in `supabase/migrations/20261005181000_fill_the_schedule.sql`.
  Anything below that reads like a rule change is a UI or data-plumbing change.
- **Two setup values are intentionally missing and must not be guessed:**
  `pts_chairside_card` (NULL) and the scoring group of 8 of the 14 participants
  (NULL). Surface them as red "Setup" markers; never default them.
- **No patient data, anywhere.** No free-text columns. No patient names,
  initials, chart numbers, clinical or appointment details, amounts or account
  information in any table, prompt, log or UI string. Employee names from the
  roster are fine.
- **Campaign facts (live DB, verified 2026-10-05):** `starts_on=2026-10-05`,
  `ends_on=2026-12-31`, `timezone=America/New_York`, status active. Tally keys:
  Oct 9, 16, 23, 30, Nov 6, 13, 20, 27, Dec 4, 11, 18, 25, Dec 31 (final,
  closes at midnight after Dec 31). October 2 must never appear as a tally.
  The page test fixture still uses `starts_on: '2026-10-01'`; move it to
  `2026-10-05` and drop the `tally_week: '2026-10-02'` fixture row.
- **Reuse, don't fork.** Scan imports call the same approval path as the app
  (`fts_verify`, `fts_award_bonus` semantics) so rates freeze the same way and
  `UNIQUE (campaign_id, request_key)` remains the single idempotency guard.
- Repo conventions: Vite + React + Tailwind, TanStack Query, Supabase RPC-only
  writes (tables are SELECT-only for `authenticated`), vitest. Run
  `npm run typecheck`, `npm run lint`, `npm test` before every push.

## 1. Files you will touch

| Area | Today | Plan |
| --- | --- | --- |
| Page | `src/pages/FillSchedule.tsx` (214 dense lines, 4 tabs) | Keep the route. Split into `src/features/fill-the-schedule/` components (list in §5). The page becomes a thin shell. |
| Hook | `src/hooks/useFillSchedule.ts` | Add `sheets`, `sheetRows` (manager only) to the `Ledger`. Keep the single-flight writer. |
| Lib | `src/lib/fill-the-schedule.ts` | Add types for sheets/rows, `pendingPoints()`, `entryKey()` helpers. `score()` unchanged. |
| Home | `src/pages/Dashboard.tsx`, `src/components/dashboard/kit.tsx` (`HomeHeader`), `src/components/FillScheduleCard.tsx` | New `FillScheduleStrip` rendered directly under `HomeHeader` in Owner/Manager/Member dashboards. Remove `<FillScheduleCard />` from Dashboard. Keep it on `src/pages/Workplace.tsx`. |
| Schema types | `src/integrations/supabase/pending-schema.ts` | Add new tables and RPC signatures. |
| DB | new migration `supabase/migrations/2026100600xxxx_fill_schedule_sheets.sql` | §3. |
| Edge | new `supabase/functions/fts-read-sheet/index.ts` | §4. Register in `supabase/functions/_shared/ai-allowlist.ts` if the gateway reader is chosen. |
| Tests | `src/test/fill-the-schedule-page.test.tsx`, new `src/test/fill-the-schedule-sheets.test.ts`, `supabase/tests/fill_the_schedule_probes.sql` | §7. |
| Docs | `docs/fill-the-schedule.md` | Update to match. |

## 2. Screens (behavioural spec)

### 2.1 Tabs

- Team members: `Record` · `My points`, plus an always-visible **Point rules**
  link in the tab bar that opens a slide-over (not a tab, not a route change).
- Owner/manager: `Review` · `Weekly scorecard`, same Point rules link, plus a
  gear that opens Settings (the current Settings panel; may stay a hidden tab
  state, it just has no tab button).
- No other tabs. Delete the "Manager verifies" eight-panel stack.

### 2.2 Record (team)

Four large buttons, each showing points and verification mode. Exact copy:

| Button | Points label | Sub-label |
| --- | --- | --- |
| Asked for a review and handed out the QR card | 1 point | Counts right away, honor system. Tap once per ask. N so far this tally. |
| Booked an appointment from the unscheduled treatment list | 1 point | Megan verifies. +2 more when the patient attends, added by Megan. |
| Scheduled operative treatment before the patient left, including the walk-up | 2 points | Megan verifies. +2 more when Megan verifies an actual prepayment. |
| Presented card on file chairside on a case over $10,000 | Points not set yet | Megan verifies. Reports are kept; points apply once the rate is set. |

- QR button writes immediately with `fts_record_own` (`qr_card`, quantity 1,
  stable `occurred_at` across retries, as today).
- The other three open a confirm panel: `When it happened` (datetime-local,
  default now, Eastern, min campaign start, max now), `Credit to` (self; the
  manager's version has a person picker), and for the handoff only an optional
  `Booked by at the front desk` (participant picker). Confirmation checkbox
  copy for the handoff: "The operative appointment was on the schedule before
  the patient left, and I did not also write this on the front-desk sheet."
- Staff never record prepayment or attendance. Text under the handoff form:
  "Prepayment is not yours to record. Megan adds the +2 after checking the
  office records."
- Use the manager's name from the roster for "Megan" strings (owner/manager
  display name); do not hardcode.

### 2.3 My points (team, own rows only)

- Three tiles: **Approved points** (this tally), **Reports awaiting
  verification** (count, with "N points if approved" computed from current
  rates; chairside with NULL rate contributes "rate not set"), **Quarter
  total** (approved only). Never sum approved and awaiting anywhere.
- Prize card: earned picks, progress to 20/30, provisional wording before the
  tally closes, clerical call-gate message as today.
- Office goal card: doctor open time for the selected tally or "not recorded".
- Two lists: **Approved** and **Awaiting verification**. Bonus rows render
  indented under their parent. Source shown as "Sent from the app" or
  "Front-desk sheet S-1016-A, row 4". Withdraw (own pending / own QR) stays.
- Tally selector stays in the page header.

### 2.4 Review (manager)

Order of sections, each hidden when empty:

1. **Setup bar** (red) when `pts_chairside_card IS NULL` or any active
   participant has `scoring_role IS NULL`. Links to Settings.
2. **Toolbar**: counts, `Upload a sheet`, `Print blank sheet`,
   `Record for a team member` (opens the Record confirm with a person picker,
   writes `fts_record_for`).
3. **Sheet rows that need your decision**: one card per `fts_sheet_rows` row
   with `handoff_state='flagged'` or `prepay_state='flagged'`. Shows sheet
   code, row number, reading, flag reason, and the resolution buttons for that
   reason (§4.4). No image.
4. **Awaiting your verification**: one card per pending activity (web or
   sheet). Buttons: `Verified on the schedule · N points` → `fts_verify(approve)`;
   `Reject…` → reason select → `fts_verify(reject, reason)`.
5. **Verified this tally**: approved bookings/handoffs for the selected tally
   (plus any approved entry that still has an available bonus, regardless of
   week). Buttons on the card: `Verify attendance · +2` (unscheduled_booking
   only), `Verify prepayment · +2` (booking or handoff), `Reverse…`. A bonus
   button opens a small panel asking for the date and time the bonus event
   happened (default now) and writes `fts_award_bonus(parent_id, type,
   occurred_at, request_key)`. Existing bonuses render as a sub-row with their
   own `Reverse…`. Buttons are hidden when a live bonus of that kind exists.
   Reverse of a parent stays blocked while a live bonus exists (existing rule).

No entry-code dropdowns anywhere. Entry codes may appear as small grey
references only.

### 2.5 Weekly scorecard (manager; team sees own line + office goal)

- Header: tally selector, countdown to close, doctor open time, count of open
  checklist items.
- **Before Friday noon** checklist card (one line each, with an inline action):
  Review empty? · Documented calls (per clerical participant, "entered /
  not entered", `fts_set_weekly_calls`) · Huddles (dates saved this tally,
  `fts_save_huddle`) · Posted Google reviews (count this tally, `Award another`
  → person + datetime → `fts_award_review`) · Doctor open time
  (`fts_set_open_hours`) · Prize picks received (disabled until `tallyClosed`).
  Lines with missing data show an empty box; complete lines a green check.
- Table columns: Team member (name + scoring group or "No scoring group"),
  Approved, Awaiting (count), Calls (`n /10` for clerical), Huddles, Prize
  picks (earned, "picks first", gate messages), Received (select, after close,
  `fts_set_picks_received`), Quarter. Keep the overage warning
  ("Correction: N extra pick(s) already received") in red on the row.
- Grand prize line as today (leader(s), tie shown not broken).

### 2.6 Home strip

`FillScheduleStrip` directly under `HomeHeader` for all three dashboards,
above `PracticePerformance` / member sections. Team copy: `{approved} approved
· {awaiting} awaiting verification · Fill the Schedule · tally closes Fri
12:00` with buttons `Record` and `My points` (deep-link `#record` / `#points`).
Manager copy: `{pending + flagged} to review · Doctor open time this week:
{hours or not recorded}` with `Review` and `Weekly scorecard`. Render nothing
when the office has no campaign (same guard as the current card).

### 2.7 Printable sheet

Route `/fill-the-schedule/sheet/:sheetId` (manager only), rendered for
`@media print` using the existing print pattern in `src/index.css` (hide every
body child except the print root). `Print blank sheet` calls
`fts_print_sheet(campaign_id, week_key)` and opens the route.

Landscape letter, 12 rows. Header: title "Operative Treatment Scheduled Before
Leaving", office name, "Tally week ending Fri {date} · 12:00 noon", sheet code
in large monospace (`S-MMDD-X`, see §3), page 1 of 1, four instruction lines
(one row per visit; never write patient details; credit-to vs booked-by;
copy the app code if also tapped in the app).

Columns, left to right (white = team, shaded = manager):

1. Row (pre-printed 1–12)
2. Date
3. Time
4. Credit to (team member)
5. Booked by (optional)
6. Operative treatment scheduled before patient left ☐ Yes
7. Actual prepayment: ☐ None ☐ Yes: date ____ time ____ (sub-label "not card on file")
8. Staff initials
9. App code (if any)
10. *shaded* Handoff verified ☐ + initials
11. *shaded* Prepayment verified ☐ + initials
12. *shaded* Date verified

Footer: "Shaded columns are {manager}'s. Tick Handoff verified only after
seeing the operative appointment on the schedule. Tick Prepayment verified only
after seeing the actual payment in the office records. No tick, no points." plus
two boxes: "Scheduling report checked", "Sheet complete, ready to scan".

Not on the sheet: patient details, amounts, QR, calls, reviews, huddles, points.

## 3. Database migration

All new objects follow the existing pattern: RLS on, `REVOKE ALL` then
`GRANT SELECT` to `authenticated`, writes only through `SECURITY DEFINER`
RPCs that call `fts_actor` / `fts_require_admin`, every change logged with
`fts_log`.

### 3.1 `fts_activities` additions

```sql
ALTER TABLE public.fts_activities
  ADD COLUMN source text NOT NULL DEFAULT 'web' CHECK (source IN ('web','sheet','manager')),
  ADD COLUMN sheet_id uuid NULL REFERENCES public.fts_sheets(id),
  ADD COLUMN sheet_row int NULL CHECK (sheet_row BETWEEN 1 AND 12),
  ADD COLUMN booked_by_employee_id uuid NULL REFERENCES public.employees(id),
  ADD COLUMN supersedes_id uuid NULL REFERENCES public.fts_activities(id),
  ADD CONSTRAINT fts_activities_sheet_pair CHECK ((sheet_id IS NULL) = (sheet_row IS NULL)),
  ADD CONSTRAINT fts_activities_booked_by_kind CHECK (booked_by_employee_id IS NULL OR activity_type = 'operative_handoff');
CREATE UNIQUE INDEX fts_activities_sheet_component_idx
  ON public.fts_activities (sheet_id, sheet_row, activity_type)
  WHERE sheet_id IS NOT NULL AND status IN ('pending','approved');
```

`booked_by_employee_id` is a cross-check only; it never scores. Set `source='manager'`
in `fts_record_for`, `fts_award_review`, `fts_award_bonus` (when called from
the UI), `'sheet'` from the import path.

### 3.2 `fts_sheets`

```sql
CREATE TABLE public.fts_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.fts_campaigns(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  sheet_code text NOT NULL,          -- 'S-1016-A'
  week_key date NOT NULL,            -- must be a valid tally key
  row_count int NOT NULL DEFAULT 12,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','void')),
  printed_by uuid NOT NULL,
  printed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, sheet_code)
);
```

Code format: `S-` + tally Friday as `MMDD` + `-` + next unused letter A..Z for
that week (then `AA`, `AB` if ever needed). Generated inside `fts_print_sheet`
under `FOR UPDATE` on the campaign row.

### 3.3 `fts_sheet_scans`

```sql
CREATE TABLE public.fts_sheet_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.fts_campaigns(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  sheet_id uuid NULL REFERENCES public.fts_sheets(id),   -- NULL when the code was unreadable
  uploaded_by uuid NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  reader text NOT NULL,                 -- engine/model identifier, e.g. 'gateway:gemini-3.1-pro' or 'local:tesseract-5'
  status text NOT NULL CHECK (status IN ('processed','sheet_unreadable','failed')),
  summary jsonb NOT NULL DEFAULT '{}',  -- {entered, already_in, awaiting, needs_review, skipped}
  image_deleted_at timestamptz NOT NULL -- asserted by the function; a scan row cannot exist without it
);
```

### 3.4 `fts_sheet_rows`

One row per (sheet, row number); upserted on every scan.

```sql
CREATE TABLE public.fts_sheet_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.fts_campaigns(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  sheet_id uuid NOT NULL REFERENCES public.fts_sheets(id) ON DELETE CASCADE,
  row_no int NOT NULL CHECK (row_no BETWEEN 1 AND 12),
  last_scan_id uuid NOT NULL REFERENCES public.fts_sheet_scans(id),
  reading jsonb NOT NULL,              -- §4.2 shape; no free text beyond the listed fields
  previous_reading jsonb NULL,         -- set when a later scan reads different values
  credit_employee_id uuid NULL REFERENCES public.employees(id),
  booked_by_employee_id uuid NULL REFERENCES public.employees(id),
  handoff_state text NOT NULL CHECK (handoff_state IN ('blank','entered','awaiting','flagged','linked','skipped')),
  prepay_state text NOT NULL CHECK (prepay_state IN ('none','entered','not_verified','flagged','skipped')),
  flags text[] NOT NULL DEFAULT '{}',  -- coded reasons, §4.4
  handoff_activity_id uuid NULL REFERENCES public.fts_activities(id),
  prepay_activity_id uuid NULL REFERENCES public.fts_activities(id),
  resolved_by uuid NULL, resolved_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sheet_id, row_no)
);
```

`reading.credit_raw` and `reading.booked_by_raw` (max 40 chars each) are the
only transcribed handwriting kept, and only while a name flag is open; the
resolve RPC nulls them. Everything else in `reading` is dates, times, booleans,
an 8-char app code and per-field confidences.

### 3.5 Campaign flag

```sql
ALTER TABLE public.fts_campaigns ADD COLUMN auto_import_enabled boolean NOT NULL DEFAULT false;
```

While false, every row is routed to Review (`handoff_state='flagged'`,
flag `auto_import_off`) with no entries created. See §6 for the gate.

### 3.6 RPCs

All manager-only unless noted. Signatures are the contract; bodies follow the
existing style (actor check, `FOR UPDATE`, `fts_log`).

- `fts_print_sheet(p_campaign_id uuid, p_week_key date) RETURNS fts_sheets`
  — validates `p_week_key` with `fts_require_week`, allocates the code, logs.
- `fts_void_sheet(p_sheet_id uuid) RETURNS fts_sheets` — only if no row has
  produced an activity.
- `fts_record_own` / `fts_record_for` — add `p_booked_by uuid DEFAULT NULL`;
  accept only for `operative_handoff`; must be an active participant; set
  `source`.
- `fts_apply_sheet_scan(p_campaign_id uuid, p_sheet_code text, p_reader text, p_rows jsonb) RETURNS jsonb`
  — the whole decision table of §4.3 in one transaction. Called by the edge
  function with the uploading manager's JWT (user-scoped client, so
  `auth.uid()` is the manager and RLS/`fts_require_admin` apply). Inserts the
  `fts_sheet_scans` row first (`image_deleted_at` is passed in; the function
  must have deleted the image before calling). Returns the summary.
- `fts_resolve_sheet_row(p_row_id uuid, p_action text, p_employee_id uuid DEFAULT NULL, p_link_activity_id uuid DEFAULT NULL, p_occurred_at timestamptz DEFAULT NULL, p_prepay_at timestamptz DEFAULT NULL, p_reason text DEFAULT NULL) RETURNS fts_sheet_rows`
  with actions: `enter` (create handoff/prepay per the row's marks after the
  manager supplied the missing piece), `link` (attach to `p_link_activity_id`
  and verify it if the handoff box is ticked), `enter_both`, `skip`,
  `replace` (reverse the existing activity with `p_reason`, create the
  corrected one with `supersedes_id`), `verify_prepay` (create the prepay bonus
  with `p_prepay_at`), `no_prepay`.
- Existing `fts_verify`, `fts_award_bonus`, `fts_reverse` are reused unchanged
  by the UI. When `fts_reverse` reverses an activity that came from a sheet
  row, also set that row's state to `skipped` with flag `reversed`.

Request keys for sheet components (deterministic, no extension needed):

```sql
md5(sheet_id::text || ':' || row_no || ':handoff')::uuid
md5(sheet_id::text || ':' || row_no || ':prepay')::uuid
```

`UNIQUE (campaign_id, request_key)` then guarantees a rescan cannot insert a
second entry for the same component.

## 4. Edge function `fts-read-sheet`

### 4.1 Contract

- `POST` multipart or JSON `{ campaign_id, image_base64, mime }`; JPEG, PNG or
  single-page PDF; ≤ 8 MB after the browser downsizes to ≤ 2000 px long edge.
- Auth: forward the user's JWT; create a user-scoped Supabase client; call a
  small `fts_require_manager(p_campaign_id)` RPC before anything else.
- Never write the image to storage. Hold it in memory, read it, drop the
  reference. If an intermediate bucket is unavoidable for size, delete the
  object before calling `fts_apply_sheet_scan` and pass the deletion time;
  failure to delete is a hard error that aborts the import.
- Return the summary from `fts_apply_sheet_scan` plus `scan_id`.

### 4.2 Reading shape (strict JSON, validated server-side)

```json
{
  "sheet_code": {"value": "S-1016-A", "confidence": 0.98},
  "rows": [{
    "row_no": 4,
    "date": {"value": "10/13", "confidence": 0.97},
    "time": {"value": "2:40p", "confidence": 0.94},
    "credit_raw": {"value": "Dana", "confidence": 0.96},
    "booked_by_raw": {"value": "Priya", "confidence": 0.9},
    "operative_scheduled": {"value": true, "confidence": 0.99},
    "prepay_none": {"value": false, "confidence": 0.98},
    "prepay_yes": {"value": true, "confidence": 0.97},
    "prepay_date": {"value": "10/13", "confidence": 0.95},
    "prepay_time": {"value": "2:55p", "confidence": 0.6},
    "staff_initials_present": {"value": true, "confidence": 0.9},
    "app_code": {"value": null, "confidence": 1},
    "mgr_handoff_verified": {"value": true, "confidence": 0.99},
    "mgr_handoff_initials_present": {"value": true, "confidence": 0.95},
    "mgr_prepay_verified": {"value": true, "confidence": 0.99},
    "mgr_prepay_initials_present": {"value": true, "confidence": 0.95},
    "crossed_out": {"value": false, "confidence": 0.99},
    "blank": false
  }]
}
```

Reader instructions (whichever engine): output only these fields; a field
that cannot be read gets `value: null` and low confidence; never transcribe any
other text on the page; names are staff first names or initials; the reader
decides nothing about points.

### 4.3 Decision table (implemented in `fts_apply_sheet_scan`)

Confidence threshold `T = 0.85` (constant, tune with the handwriting test).
Dates resolve to the campaign year; date+time combine to an Eastern timestamp
via the same logic as `officeTimestamp`; the tally week is `fts_week_key`.

Handoff component, evaluated first:

| Condition | Result |
| --- | --- |
| `blank` | nothing |
| row already has `handoff_activity_id` and reading equals `previous_reading` on the handoff fields | `already_in`; additionally, if `mgr_handoff_verified` is now true and the activity is pending, call verify (approve). |
| row already has `handoff_activity_id` and the handoff fields differ | `flagged: row_changed`; store `previous_reading`; nothing else changes |
| `crossed_out` | `flagged: crossed_out` |
| any of date/time/credit_raw/operative_scheduled below `T` or null | `flagged: unreadable` |
| `operative_scheduled` false | `flagged: not_confirmed_by_staff` |
| timestamp outside campaign or > now | `flagged: outside_campaign` |
| `credit_raw` matches 0 active participants | `flagged: no_match` |
| matches ≥ 2 | `flagged: ambiguous_name` (store candidate ids) |
| `app_code` present and matches an activity of this person, type `operative_handoff`, status pending or approved | `linked`: set sheet_id/row on that activity; if `mgr_handoff_verified` && initials → approve it (if pending). |
| `app_code` present but no match | `flagged: code_not_found` |
| no code, and the person has a live `operative_handoff` on the same office day not from this sheet row | `flagged: possible_duplicate` (store candidate activity id) |
| `auto_import_enabled` false | `flagged: auto_import_off` |
| `mgr_handoff_verified` && `mgr_handoff_initials_present` (both ≥ T) | insert `operative_handoff` approved, points = `fts_rate`, `source='sheet'`, `booked_by_employee_id` when matched uniquely (else NULL, never flagged on booked-by alone) → `entered` |
| otherwise | insert `operative_handoff` pending → `awaiting` |

Prepayment component, evaluated only when the handoff is `entered`, `linked`
to an approved activity, or already approved:

| Condition | Result |
| --- | --- |
| `prepay_none` true (≥ T) and `prepay_yes` false | `none` |
| both boxes unreadable or both ticked | `flagged: prepay_unreadable` |
| `prepay_yes` and `mgr_prepay_verified` && initials (≥ T) and `prepay_date`/`prepay_time` ≥ T, timestamp ≥ handoff timestamp and in window | insert `prepay_bonus` approved, parent = handoff activity → `entered` |
| `prepay_yes` and manager verified but date or time unclear | `flagged: prepay_unclear` (handoff keeps its points) |
| `prepay_yes` and manager box empty | `not_verified` (no entry; the Verify prepayment button on the card remains) |
| a live `prepay_bonus` already exists on the parent | `already_in` |

When the handoff is `awaiting` or flagged, the prepayment is recorded in the
row reading and re-evaluated by `fts_resolve_sheet_row` after the handoff is
resolved. A prepayment never blocks a handoff.

### 4.4 Flag codes and the Review buttons they get

| Flag | Buttons |
| --- | --- |
| `ambiguous_name` | one button per candidate ("Samira · 2 + 2"), Skip row |
| `no_match` | person picker → Enter, Skip row |
| `unreadable` | editable date/time fields → Enter (state per the manager boxes), Skip row |
| `not_confirmed_by_staff` | Enter anyway, Skip row |
| `outside_campaign`, `crossed_out` | Skip row (Enter anyway allowed for `crossed_out` only) |
| `code_not_found` | Enter as new, Skip row |
| `possible_duplicate` | Same action · verify the app entry (link), Two different actions · enter both, Skip row |
| `row_changed` | Keep original, Replace (reason select), Skip |
| `prepay_unreadable`, `prepay_unclear` | date/time fields → Verify prepayment · +2, No prepayment |
| `auto_import_off` | Enter (per marks), Skip row |

Every resolution writes `resolved_by/resolved_at`, nulls `credit_raw` and
`booked_by_raw`, and logs to `fts_audit`.

## 5. Front-end components

`src/features/fill-the-schedule/`

- `FillScheduleShell.tsx` — header (title, tally selector), tab bar per role,
  Point rules link, Settings gear, writer status line. Hash deep links
  `#record`, `#points`, `#review`, `#scorecard`.
- `RecordTab.tsx` — four `ActionButton`s + `RecordConfirm` (datetime, credit
  to, booked by, confirmation checkbox). Props: `forEmployeeId?` for the
  manager's on-behalf use.
- `MyPointsTab.tsx` — tiles, prize card, goal card, Approved and Awaiting
  lists, withdraw.
- `ReviewTab.tsx` — `SetupBar`, `ReviewToolbar` (`SheetUpload`,
  `PrintSheetButton`, record-for), `SheetRowCard` (per flag), `EntryCard`
  (pending/approved with verify / reject / bonus / reverse actions and bonus
  sub-rows), `BonusPanel` (datetime + confirm).
- `ScorecardTab.tsx` — `WeeklyCloseChecklist` (calls, huddles, reviews,
  hours, picks) + `ScorecardTable` + grand prize line.
- `RulesDrawer.tsx` — the full rules table, prize rules, 13 tally dates,
  who-records-what; Setup marker for the chairside rate.
- `SettingsPanel.tsx` — move the current `Settings` component as is; add the
  red Setup markers and the `auto_import_enabled` toggle (owner/manager; the
  toggle's help text names the §6 gate).
- `SheetPrint.tsx` — the printable page (§2.7).
- `FillScheduleStrip.tsx` — Home strip (§2.6).

Keep `Panel`, `Field`, `TimeField`, `TeamSelect`, `Status` helpers; move them
to `ui.tsx` in the feature folder. Keep every existing accessibility attribute
(`role="tablist"`, `aria-selected`, `role="alert"` on errors). Minimum tap
target 44 px as today.

## 6. Rollout gate for automatic entry

1. Ship everything with `auto_import_enabled=false`. Scanning works; every row
   lands in Review with flag `auto_import_off`; the manager enters rows with
   one click each. This alone removes the entry-code workflow.
2. Choose the reader. Candidates: (a) `src/lib/schedule-reader/ocr.ts`
   (tesseract.js, on-device, nothing leaves the browser; expect weak
   handwriting accuracy), (b) the Lovable gateway vision model used in
   `supabase/functions/sprint-verify/index.ts` (register `fts-read-sheet` in
   `_shared/ai-allowlist.ts` as `handler: "consented"`, reason: "Front-desk
   sheet is designed to carry no patient data; image is read once and
   deleted; only form fields are extracted." The `phi-gateway-guard` test will
   fail until this entry exists.) Option (b) is expected to win on
   handwriting; option (a) can run first as a pre-check for the sheet code.
3. Handwriting test, on the real printed form, filled by at least three
   different staff members: 30 rows, all 12 fields each. Pass criteria:
   ≥ 95% of fields correct at the chosen threshold, 0 wrong-person matches, 0
   false "manager verified" ticks. Record the result in
   `docs/fill-the-schedule.md`.
4. Only then flip `auto_import_enabled` for the campaign. Keep the toggle
   visible in Settings so the manager can turn it off at any time.

## 7. Tests

Unit (`src/test/fill-the-schedule-sheets.test.ts`):
- `entryKey(sheetId, rowNo, component)` is stable; rescans produce the same
  key.
- The decision table in §4.3 as a pure function over a reading fixture:
  entered / awaiting / each flag; unclear prepay never blocks the handoff;
  prepay before handoff timestamp is flagged; bonus week follows the prepay
  time (Oct 20 prepay on an Oct 13 handoff → tally Oct 23).
- `campaignWeeks` with `starts_on=2026-10-05` returns 13 keys starting Oct 9
  and ending Dec 31; never contains Oct 2.

Page (`src/test/fill-the-schedule-page.test.tsx`, fixture moved to Oct 5):
- Team sees exactly `Record`, `My points`, the Point rules link; no Review,
  no Scorecard, no Settings gear; never another person's rows.
- Each Record button shows its points label and verification sub-label; the
  chairside button says "Points not set yet" while the rate is NULL.
- Approved and Awaiting tiles never sum.
- Manager Review: pending card approves via `fts_verify`; approved booking card
  offers `Verify attendance · +2` and `Verify prepayment · +2` and writes
  `fts_award_bonus` with the chosen datetime; buttons disappear once a bonus
  exists.
- Scorecard: checklist line for calls shows "1 of 3 clerical entered"; picks
  select disabled before close; overage warning rendered.
- Home strip renders under the header for member and manager views; the old
  bottom card is gone from Dashboard and still present on Workplace.

SQL probes (`supabase/tests/fill_the_schedule_probes.sql`, rollback-only as
today): print a sheet → code format; apply a scan twice → second call reports
`already_in` and inserts nothing; changed row → `row_changed` flag;
`app_code` link approves the pending web entry; `fts_reverse` of a sheet-sourced
handoff marks the row `skipped`; `image_deleted_at` NOT NULL enforced.

Keep the worked example from the proposal as a named end-to-end test:
handoff Oct 13 14:40 + prepay Oct 13 14:55 on sheet S-1016-A row 4, both
manager boxes ticked → two approved activities (2 and +2), tally Oct 16, Dana
17 → 21 approved, one prize pick.

## 8. Order of work

1. Migration (§3) + `pending-schema.ts` types + SQL probes.
2. Lib helpers + page split into the two-tab structure, Review entry cards with
   bonus buttons, scorecard with checklist, Home strip, Rules drawer. This is
   the user-visible reorganization and can ship on its own.
3. Printable sheet + `fts_print_sheet`.
4. `fts-read-sheet` + `fts_apply_sheet_scan` + `SheetRowCard` resolutions, with
   `auto_import_enabled=false`.
5. Handwriting test; flip the flag only on a pass.

Each step: typecheck, lint, tests green, docs updated, pushed to
`claude/keen-hypatia-cqfffg`. Do not apply migrations from a GitHub push; they
are applied by the project owner as described in `docs/fill-the-schedule.md`.
