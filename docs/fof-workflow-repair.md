# FOF workflow repair — saved plans, stale values, naming, settings, imports

Audit snapshot: `5f68f9d` (main). Branch: `claude/zealous-galileo-3z9hpj`.
Live project: Supabase `lfiplzmxpmybtbzhmnkp`, published at https://purpleenvelope.app.

This note is the record of the Purple Envelope Financial Options Form (FOF) repair:
what was broken in the live app, what changed, which office policy the numbers follow,
how it was proven, and what a human still has to do to release it.

## Root causes found in the live app

1. **Saved plans and fee schedules were disconnected from the builder.**
   - `useFeeSchedules` seeded schedules from inside the *read* query. A staff member
     (role `employee`) hit the admin-only insert policy (`42501`) on first use and the
     query failed, so the builder had no fees at all.
   - The builder used a saved `insurance_plans` row only for the after-max default;
     percentages, deductible and annual maximum were typed by hand every time.
   - Nothing gated calculation or printing on loaded data: a loading or failed query
     produced an empty code map, a `$0.00` fee, a carrier fallback to the office fee and a
     blank practice header on the printed form.
   - Fee item reads were capped at 1,000 rows (the live office schedule has 1,174).
   - 507 CDT rows on the live office schedule carry a `$0` fee and 248 carrier rows are
     flagged `is_office_fee`; both were treated as real amounts (a free procedure, or a
     100 % write-off).
2. **Stale values survived a changed code or carrier.** Fee, description, allowable,
   insurance payment, downgrade, tooth and category kept the old code's values and
   overrides; a carrier change kept carrier-derived estimates.
3. **Automatic naming failed silently.** `name-visits` was marked as run before the
   response arrived, errors were swallowed, there was no retry, names were not applied on
   the payment-policy path, and the function picked the caller's first membership.
4. **Settings were decorative.** `day_of_service_threshold_cents`,
   `min_standalone_payment_cents` and `downgrade_default_on` did not change the
   calculation; a missing office policy fell back to the legacy visit schedule without
   saying so.
5. **Imports were not trustworthy.** The screenshot path sent the raw image to the
   `parse-treatment` vision endpoint first (a PMS screenshot can carry a patient name),
   discarded uncertain rows silently, and capped at 40 rows; fee imports wrote row by row
   with no preview counts, no rollback and a success toast before verification.
6. **Financial rules.** Insurance payment overrides were unbounded; a negative patient
   portion was clamped to `$0`; the prepay courtesy stacked on an office discount; the
   office copy printed the raw carrier map instead of the allowable actually used; a
   hand-typed global insurance total was not reconciled; connected consents printed the
   whole plan; the office copy could not be printed separately from the patient packet.

## What changed

### Builder and hooks (`src/`)
- `pages/FofBuilder.tsx` — rewritten around explicit state: readiness gating
  (`readinessIssues`, `readinessWarnings`), `resolveCodeFields` / `handleCodeChange` /
  `restoreOverrides`, `handleScheduleChange`, `applyPlanDefaults` / `handlePlanChange` /
  `confirmBenefits`, `inputErrors`, `reviewReasons` / `printBlocked`, `legacyPolicy`,
  `buildNamingRequest` / `applyNaming`, local import (`importScreenshot`,
  `importPastedText`, `commitImportedRows`), `officeLines` with basis labels and notes,
  `reconciliation`, print modes (`patient` / `office` / `both`), `handlePrint` never
  clears, `clearForm` bumps a reset key that drops in-flight async work.
- `hooks/useFeeSchedules.ts` — pure read (`useFeeSchedules`), explicit
  `useSeedFeeSchedules` (owner/manager), paged `fetchFeeScheduleItems` (1,000 per page),
  `useImportFeeScheduleItems` (dedupe, snapshot, 500-row chunks, compensating rollback,
  read-back verification, `FeeImportError` with `rolledBack` / `appliedRows`),
  `useInsurancePlans` / `useUpsertInsurancePlan` with validation and the per-plan
  `alternate_benefit_downgrade`.
- `hooks/useFofNaming.ts` — the naming state machine (`idle → waiting → working →
  done | retrying | error | unavailable`), `MAX_ATTEMPTS = 3`, `classifyNamingError`,
  stale-signature rejection, unmount guard, manual `retry`.
- `lib/fof/provenance.ts` (`ValueSource`, `feeSourceFor`), `lib/fof/plan-hydration.ts`
  (`plansForSchedule`, `planDefaults`, `GENERIC_PLAN_DEFAULTS`, `downgradeDefault`,
  `parsePercentInput`), `lib/fof/insurance.ts` (`allowedBasis`, `benefitBasisCents`,
  bounded overrides with `overrideBounded`, `insurancePaysOverrideException`),
  `lib/fof/compute.ts` + `types.ts` (`imbalanceCents`, office-line `allowableBasis`,
  `feeSource`, `notes`), `lib/fof/visits.ts` (`VisitScheduleOptions`; the tiny-payment
  fold now targets the nearest earlier non-zero payment — a real rounding bug),
  `lib/fof/ai.ts` (`isVettedProcedureCode`, `safeProcedureLabel` returns `null` for
  anything unvetted, `safeToothSuffix`, `buildNameVisitsPayload`),
  `lib/fof/local-treatment-import.ts` (same-origin Tesseract only, confidence and issue
  flags per row, `REVIEW_ROW_LIMIT = 40`, `MAX_ROWS = 200`, `parseTreatmentText`).
- `components/fof/TreatmentImportReview.tsx` (new review screen),
  `components/fof/InsurancePlansCard.tsx` (new plans editor on `/fof/fees`),
  `components/fof/FeeImportDialog.tsx` (all worksheets, counts, reset per import,
  verified-only toast), `components/fof/FofPrintSheet.tsx` (print modes, basis labels,
  notes rows, reconciliation section, benefits note), `pages/FofFees.tsx` (seed CTA,
  error + retry, Active switch, plans card), `components/consents/ConsentPrintSheet.tsx`
  (`coveredProcedures`: a connected consent shows only its covered procedures at the
  final overridden amounts), `index.css` (office-copy pagination rules).

### Edge functions (`supabase/functions`)
- `name-visits/index.ts` — body parsed once; `orgId` must be a UUID; a multi-office
  caller without `orgId` gets `400 { code: 'OFFICE_REQUIRED' }` (the first membership
  is never assumed); non-members get `403`; wording rules and code notes are loaded for
  that office only (`_shared/procedure-notes.ts` takes `orgId` and filters active
  schedules).
- `parse-treatment/` and `_shared/treatment-extraction.ts` are removed, with their
  `config.toml` block, allowlist entry and tests. Nothing else imported them.
- `fof-office-guidance` and `kimi-agent` are unchanged in behaviour; they share
  `_shared/procedure-notes.ts` and `_shared/ai-allowlist.ts`, so they are redeployed with
  the same revision.

### Database
- `supabase/migrations/20260930150000_insurance_plan_alternate_benefit.sql` adds
  `insurance_plans.alternate_benefit_downgrade boolean` (nullable, `IF NOT EXISTS`).
  `src/integrations/supabase/pending-schema.ts` carries the column until the generated
  types catch up. The column was applied to the live database on 2026-09-29 through the
  Lovable database query tool; the migration file is idempotent, so the normal migration
  run is a no-op for it.

## Policies the numbers follow

- **Harelick payment policy** (`fof_settings.payment_policy`, `harelickPolicyTemplate`):
  work-up paid in full at the work-up visit; implant halves at scheduling and surgery;
  implant abutment/crown as its own restorative phase; crowns, bridges and restorations
  ≥ $1,000 in thirds (scheduling / prep / delivery), < $1,000 halves (prep / delivery);
  dentures ≥ $1,000 in thirds (scheduling / impressions–try-in / delivery), < $1,000
  halves; everything else ≥ $1,000 halves (scheduling / treatment), < $1,000 on the
  treatment day; exactly $1,000 takes the higher tier; same-event amounts combine. The
  live office row already carried this policy (threshold 100000 inclusive, nearest-last
  rounding, explicit arrangement, implant advance). It was not replaced.
- **Line-level insurance.** Payable basis = carrier contracted rate (in-network with a
  real, non-zero, non-office-fee row) or the current office fee (no rate, `$0` rate,
  office-fee row, downgrade, after-max, uncovered) — the office copy prints which. The
  deductible applies to the first covered lines in order, waived for preventive care
  when the plan says so; the remaining annual maximum caps every estimate; work-up is
  never covered. A typed insurance payment is bounded to the payable basis and the
  remaining maximum unless staff record an exception on that line (the note prints on
  the office copy).
- **Courtesies.** One discount at a time: an office discount switches the prepay courtesy
  off unless a manager turns stacking on for that form. Membership, senior and family
  discounts keep the existing discount rules.
- **Balances.** Credits and discounts larger than the balance are a visible imbalance
  that blocks printing; nothing is clamped to `$0`. Installments are split to the cent
  with the remainder on the last visit, and the schedule always sums exactly.
- **Plan defaults are estimates.** Saved-plan and generic defaults are labelled
  "unverified estimate"; staff confirm the patient's remaining deductible and maximum
  before printing, and the office copy records the source (saved plan / patient / generic).

## Privacy boundary

- Patient name, narrative, amounts and imported rows stay in React state. Nothing is
  written to Supabase tables or storage, browser storage, URLs, logs or analytics; there
  is no auto-save, auto-email or chart integration.
- Screenshots are read on the device (`/tesseract/` vendored assets, same origin) and
  reviewed before import; there is no vision endpoint and no network fallback.
- `name-visits` receives vetted procedure codes, code-derived names, validated tooth
  tokens, visit order, the configured doctor name and the selected office id only.
  `safeProcedureLabel` allowlists CDT (`D####` + optional suffix) and office codes and
  validates tooth tokens; typed names, narratives, amounts and malformed codes never
  pass through (`src/test/fof-ai.test.ts`).
- The FOF patient-context gate stays disabled under the existing no-BAA setup.

## Verification

Commands and results on this branch (2026-09-29):

| Check | Command | Result |
| --- | --- | --- |
| Types | `bun run typecheck` | clean |
| Unit + integration | `bunx vitest run` | 247 files, 2,571 tests passed, 53 skipped |
| Lint (changed files) | `bunx eslint <changed files>` | 0 errors (pre-existing fast-refresh / hook-dependency warnings only) |
| Build | `bun run build` | built in 36 s |
| Print layout | `npx vite-node scripts/print-layout-render.tsx && node scripts/print-layout-check.mjs` | 14 variants: 13 one-page forms + office copy, long plan paginates to 3 pages with the header repeated and no dropped or torn row |

Regression tests added or rewritten for the seams:
`fof-builder-seams.test.tsx` (23: saved-plan hydration and confirmation, fees that load
after a code was typed, failed and inactive schedules, changed codes and carriers with
restore, provenance chips, bounded overrides, imbalance, single courtesy, naming after
the quiet period / failure / retry / stale / policy path, print modes, storage and request
privacy, legacy-policy banner), `fof-naming-hook.test.tsx` (8), `fof-fee-import.test.tsx`
(8: seed permissions, counts, rollback, verification), `fof-plan-hydration.test.ts`,
`fof-harelick-examples.test.ts` (15: both sides of $1,000, work-up + implant + crown,
mixed events, exact cents), `fof-insurance.test.ts` (42), `fof-local-import.test.ts` (9),
`fof-navigation-import.test.tsx` (7), `fof-office-guidance-edge.test.ts` (19 incl.
multi-office scoping), `fof-ai.test.ts`, `consent-print.test.tsx` (20).

### Signed-in browser run (synthetic office)

See the "End-to-end evidence" section at the bottom of this file; it is filled in from
`.repro/e2e/run.mjs` (Chromium via Playwright against the production build served
locally and the live Supabase project, signed in as a synthetic manager of a synthetic
office; no real patient data).

## Release order

1. Merge this branch into `main` (Lovable syncs `main`).
2. In Lovable, deploy `name-visits`, `fof-office-guidance` and `kimi-agent` (they share
   `_shared/procedure-notes.ts` and `_shared/ai-allowlist.ts`) and delete the deployed
   `parse-treatment` function. Direct pushes do not deploy functions.
3. Run migrations (the `alternate_benefit_downgrade` column is already live; the file is
   a no-op there).
4. Publish the frontend.
5. Verify: `/fof/fees` lists the live schedules with their counts and the saved plan;
   `/fof` blocks printing until fees, practice identity and policy are loaded; the
   naming status shows a final state; a 404 or missing secret on `name-visits` shows the
   "unavailable" state with a Retry, never a blank label.

## Human decisions

- Whether the 507 `$0` CDT rows on the live office schedule should be given fees or
  removed: the builder now treats them as "no fee on file" (review error), not free.
- Whether the `E2E Synthetic Test Office` rows (org `e2e00000-0000-4000-8000-000000000001`)
  should be kept for future verification; they are removed once the run is recorded
  below, and the SQL to recreate them is in the session record.
- Benefits confirmation is a per-form checkbox action; if the office prefers a softer
  reminder instead of a print block, change `readinessIssues` in `FofBuilder.tsx`.

## End-to-end evidence

Signed-in run on 2026-09-29 (`.repro/e2e/run.mjs`, Chromium 141 through Playwright,
the production bundle from this branch served locally, the **live** Supabase project
`lfiplzmxpmybtbzhmnkp` with its currently deployed edge functions). The run signs in as
the manager of a synthetic office and uses synthetic data only; every network request
the browser made was recorded and swept for the patient name, the narrative marker and
the typed amounts.

Synthetic office (created through the public sign-up API plus SQL, removed at the end):
`E2E Synthetic Test Office` (org `e2e00000-0000-4000-8000-000000000001`), one manager
account, onboarding marked complete, a branding row for the header, and copies of the
live office's data: the 1,174-row office schedule, the Delta and BCBS carrier schedules,
one saved plan (`E2E DD MA 100/80/50`), five templates, 24 payment classifications,
discount and code rules and the wording guidance, plus an empty `E2E Import Target`
carrier and an inactive `E2E Retired Carrier`. Patient name used: `Synthetic Patient
Zeta`. No real patient information was involved.

Result: 16 steps, 0 failed (44 checks). In order:

- **Fees page.** All schedules listed with their counts; the 1,174-code office schedule
  reports every row (the read paged past 1,000); the retired carrier is marked
  "Inactive — not offered on forms"; the saved plan is listed.
- **Fee import.** A 7-row CSV (a duplicate code, a blank-code row, an unknown code, a
  `$0` fee) previewed as "5 valid · 1 skipped · 1 duplicate (last row wins) · not on the
  office schedule" before anything was written; the toast read "Imported 5 codes into E2E
  Import Target (5 new, 0 updated) — verified on the schedule"; the row showed "5 codes";
  the database holds exactly those five rows with the last duplicate's fee.
- **Builder.** `D2740` typed while the schedule was still loading resolved to the office
  fee (`$1,569.00`, "office" chip) 55 ms after the items arrived; `ZZZ1` stayed
  unmatched with no fee. Choosing `E2E Delta Dental MA` hydrated `$50.00` / `$1,500.00`
  and 100/80/50 with "plan default" chips and the "unverified estimate" wording; Print
  stayed disabled until "Confirm benefits as entered".
- **Overrides and changes.** Typing `$9,999.00` as the insurance payment produced the
  bounded note ("the plan can pay at most …"). Changing `D2740` → `D2750` re-evaluated
  the fee (`$1,569.00` → `$1,710.00`), switched the allowable to the carrier rate,
  dropped the override and noted "Code changed from D2740: cleared insurance payment
  $100.00"; Restore put it back on purpose. Changing the carrier to `E2E BCBS MA`
  re-hydrated generic defaults and asked for confirmation again.
- **Naming (live `name-visits`).** Status reached "done"; the single request carried
  `slots`, `visits`, `wantTreatment`, `doctorName`, `orgId` only, with visits such as
  `["CT Scan"]`, `["Dental Implant (tooth #30)"]`, `["Crown (tooth #3)"]` — no name, no
  amount. The deployed function is the pre-release version, which ignores `orgId`.
- **Local imports.** The synthetic screenshot produced "Review 4 extracted procedures —
  read on this device"; low-confidence and unreadable-fee rows were flagged and had to be
  acknowledged; no request at all left the browser during the read; the reviewed rows
  were added (3 → 7 lines). Pasted text produced its own review and was added.
- **Printing.** "Patient form only" printed one Letter page carrying the name and no
  office copy; "Patient form + office copy" printed three pages (patient page, then the
  office copy with the basis of every allowable and the codes); "Office copy only"
  printed two pages with no patient page. Printing left the form intact; Clear emptied
  it; a refresh started blank.
- **Privacy.** Hosts contacted: the Supabase project and Google Fonts (the app's fonts).
  Edge functions called: `fof-office-guidance` (`orgId` only) and `name-visits`.
  `parse-treatment` was never called; nothing was written to Supabase storage; the only
  table write was the fee import; browser storage held only the auth session and a
  support-redaction flag. Database sweep after the run: no table in `public` or
  `storage` contains the patient name or the narrative marker; no storage object was
  created.

Two live findings came out of the run and are fixed on this branch: names applied by
automatic naming were stored as payment overrides and blocked printing after any later
plan change (commit "Let suggested payment names follow the plan"); and a brand-new
office without a branding row is correctly blocked from printing a blank header (the
banner names the fix).

Not covered by the browser run: a staff-role (employee) account's first use in the live
app (unit-tested only), a phone-width viewport, keyboard-only navigation (unit tests
drive the selects from the keyboard), and visual inspection of the PDFs (their text was
inspected with pdf.js). Artifacts (PDFs, screenshots, `requests.json`, `console.log`,
`summary.json`) are under the ignored `.repro/e2e/out/` directory of the session.
