# Financial Options Form — payment-plan engine rebuild

> This inspection plan is superseded by `docs/fof-payment-policy.md` and the
> directly implemented payment engine. The replacement uses `payment_policy`
> on `fof_settings` and `payment_class` on `procedure_meta`; do not apply the
> superseded SQL drafts. Migrations remain pending review; do not deploy or
> apply production changes as part of this code-only task.

## What I verified (inspection only, nothing changed)

- This is the real application: `src/pages/FofBuilder.tsx` (2,538 lines) plus `src/lib/fof/*` and `src/components/fof/FofPrintSheet.tsx` all exist here. The git remote is the Lovable-hosted mirror of the GitHub project (the remote URL is the internal sync URL, not a `github.com/mvincen55/clock-wise-keeper` URL), so repo identity is confirmed by file contents, not by the remote string.
- Harelick's organization ID, read from the organization configuration table (no patient data): **852fc8e0-4071-499b-b655-f86d6f789cd5** ("HARELICK DENTAL ASSOCIATES, LLC"). It is the only organization present and already has a form-settings row.

## Root cause

The current schedule is not a policy engine at all. `buildVisitSchedule` in `src/lib/fof/visits.ts` spreads the patient's whole out-of-pocket across visits **in proportion to each visit's gross fees**, then applies a universal "collect the next visit one visit early" rule, halves the final visit, and folds any payment under $100 backwards. On top of that:

- Treatment classification lives in hardcoded CDT number ranges (`visitSegmentsForCode`, `suggestVisitStage`, `decideVisitPlan`), not in office settings.
- The $1,000 threshold (`DAY_OF_SERVICE_THRESHOLD_CENTS`) is applied to the **whole form**, not per treatment group, and Harelick's defaults are baked into `visits.ts` constants and migration defaults.
- Work-up is only a "due at this visit, don't prepay" flag; it still counts toward the form-wide threshold and the proportional allocation. `D6190` is not classified as work-up (`NO_PREPAY_CODES` contains only `D5982`).
- Implants, crowns, dentures and non-delivery treatment all end up in one blended schedule; there is no separate group threshold, no restorative booking milestone, and no per-row allocation record.
- `MIN_STANDALONE_PAYMENT_CENTS` moves money between milestones — the unconfirmed rule that must go for Harelick.

## Approach

Build a new, organization-driven engine beside the existing code and switch the builder onto it, rather than patching `buildVisitSchedule`.

1. **Policy configuration (new organization-scoped table `fof_payment_policy`)** — threshold cents + inclusive boundary, work-up code list and timing, per-treatment-class strategies above/below threshold, implant advance-payment exception, milestone set (including "first of impressions or try-in"), mixed-group combining behaviour, rounding target (last installment), and wording. Owner/manager write, member read, same policy shape as `procedure_meta`. Harelick's confirmed values are inserted **only for its verified organization ID**; the shipped table defaults stay neutral so no other office inherits them.
2. **Procedure classification** — extend `procedure_meta` with a treatment class (`work_up`, `implant_surgical`, `restorative_lab`, `denture_partial`, `other_no_delivery`, `zero_fee_marker`) and a work-up flag; CDT ranges become a *suggestion* only, editable per office and per plan. `D6190` seeds as work-up for Harelick.
3. **Engine (`src/lib/fof/payment-plan/`)** — four clean stages, integer cents throughout:
   - line responsibility (reuses the existing line-level insurance math in `insurance.ts`; no gross-fee proration),
   - appointments and treatment groups (related crowns prepped together share one group and one threshold),
   - policy application per group (thresholds, thirds/halves, implant exception, work-up excluded),
   - milestone merge: contributions land on stable milestone identities (`schedule`, `prep`, `surgery`, `impression_or_tryin`, `delivery`, `work_up`), and only milestones explicitly linked to the same real collection event combine. Each row keeps its component allocations. Balancing cents land on the last installment.
4. **Builder + print** — one shared schedule result feeds the editor, patient preview, office copy and print sheet. Staff can retype classification, grouping and milestones; manual amount/label overrides survive and any stale override is flagged instead of silently dropped. AI naming continues to touch labels only.
5. **Retire for Harelick** the "shift a full visit earlier" behaviour and the $100 folding rule.

## Tests

All 16 listed regression cases, including the approved $800 extraction + $2,000 crown case ($1,066.67 / $1,066.67 / $666.66) and the full self-pay fixture producing $1,896 / $1,604.50 / $1,604.50 / $1,022.67 / $1,022.67 / $1,022.66 = $8,173, plus a cross-office isolation test (two organizations, same procedures, different schedules). Existing FOF tests stay green; repository build and type checks run at the end.

## Open questions I will surface rather than guess

- Whether a global office discount or patient credit that has no defined allocation should block the schedule or be allocated by group share (the plan surfaces it for review; the office decides).
- Whether below-threshold "other" treatment should still print a single day-of-service row or no schedule at all when it is the only item.

## Not in scope

No production data changes, no deployment, no courtesy/insurance-policy changes, no patient-data persistence. The migration will be written but only applied with your approval.
