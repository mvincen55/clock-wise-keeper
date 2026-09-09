# Financial Options Form payment policy

## Problem and implementation

The legacy schedule prorated the patient portion by visit fees, moved the next
visit's full cost earlier, and folded small payments. Those rules cannot express
work-up, implant, restoration, denture, and mixed-treatment obligations correctly.

`src/lib/fof/payment-engine.ts` now allocates integer cents from each procedure's
patient responsibility to treatment groups and explicitly identified collection
events. Equal labels never merge events. `computeFof`, the editor, patient preview,
office copy, and print use the same result without splitting it a second time.
Unconfigured offices retain the legacy path.

This replaces the parallel `payment-plan/` implementation that landed on main
while this change was being developed. Its unused hooks, editor, test file, pending
SQL drafts, and `VisitPlan.amounts` extension are removed to leave one policy path.
No production schema from that implementation was present when checked read-only.

## Configuration and release order

Two additive migrations extend existing tables rather than creating new ones:

- `20260909220000_fof_payment_policy.sql`: nullable `fof_settings.payment_policy`
  JSON, validated strategy/threshold/rounding/label structure, and nullable
  `procedure_meta.payment_class` with an enum check.
- `20260909220100_harelick_payment_policy.sql`: targets only verified organization
  `852fc8e0-4071-499b-b655-f86d6f789cd5`. D0367, D0470, D6190 and this office's
  D5982 guide are work-up. Existing registry fields, fees and benefits are retained.

These migrations are prepared, not applied. Release the reviewed schema before
the application code, then validate the configured office in a nonproduction
environment. Neither migrations nor hosting were deployed by this branch.
The existing member-read and owner/manager-write RLS policies remain in force.
Client settings writes also enforce role and use the active organization ID last,
discarding any injected organization field.

Office settings expose inclusive OOP threshold, below/above strategies and shares,
implant advance exception, mixed grouping, first impressions/try-in selection,
rounding, milestone wording and procedure classifications. A new office receives
no Harelick defaults; managers must choose every strategy before saving a policy.
Harelick's explicit configuration uses $1,000 inclusive, nearest-cent earlier
payments with balancing in the last installment, work-up at work-up, implant
halves at booking/surgery, and the confirmed restorative/denture/other strategies.

## Staff workflow and unresolved input

The form uses existing per-line insurance and write-off results. Classifications
come from the office registry and can be adjusted in memory for the current form.
Unknown paid procedures require classification before printing. Related procedures
with an explicitly shared visit are grouped; staff can change their group names.
Different classes keep separate groups and can share actual collection events.

For the $800 extraction plus $2,000 crown example, give the groups the same
arrangement name and link both booking events and extraction treatment/crown prep
to their shared actual events. The schedule is $1,066.67, $1,066.67 and $666.66;
no extraction responsibility remains at crown delivery. Unrelated bookings stay
separate. Event order is editable; no calendar date is invented. A zero-fee line
can explicitly identify a restoration/denture delivery; post-ops create no payment.

Global discounts, credits or total/insurance overrides without line allocation
require staff to allocate the difference in the editor. The implementation does
not infer which group receives the adjustment or changes its threshold. A positive
allocated adjustment reduces responsibility; a negative adjustment increases it.
This is the remaining business input for plans with ambiguous adjustments.
Prior payments are explicit amounts per procedure, never inferred from visit age.

Amount and label overrides retain their event identity and calculation basis.
Changed or removed events, mismatched allocations, and stale overrides block print
until reviewed. Old index-based overrides remain available for review and transfer;
Reset all clears those old overrides. AI suggestions add labels only, preserve
staff wording, and use the existing code-based naming request. The new schedule,
appointment edits, amounts, adjustments, and prior payments are never persisted,
logged or added to network payloads.

## Confirmed fixture

Work-up $1,896; implant surgery group $3,209; restoration group $3,068;
zero-fee delivery marker $0. Full obligation: $8,173.

1. Work-up: $1,896.00.
2. Implant booking: $1,604.50.
3. Implant surgery: $1,604.50.
4. Restoration booking: $1,022.67.
5. Restoration prep/impression: $1,022.67.
6. Restoration delivery: $1,022.66.

Explicitly recording the work-up as paid leaves $6,277.00 scheduled, with
$1,896.00 separately reconciled as prior payments. Prepay is a separate alternative.

## Validation

Run the focused suite:

```sh
bunx vitest run src/test/fof-payment-engine.test.ts src/test/fof-payment-editor.test.tsx src/test/fof-payment-settings.test.tsx src/test/fof-compute.test.ts src/test/print-invariant.test.tsx src/test/print-robustness.test.tsx
bun run typecheck
bun run build
```

The suite covers all 16 requested scenarios plus tied appointment order, zero-fee
delivery linking, stale overrides, invalid cents, exact procedure reconciliation,
manual allocation changes, naming boundaries, and settings isolation. Local
focused result: 60 tests passed. Patient and office HTML were rendered from the
same synthetic fixture; long milestone labels were inspected in the local browser.
Legacy print snapshots are unchanged.

An additional isolated PostgreSQL probe executes the relevant original table/RLS
migrations and both new migrations against synthetic organizations and roles:

```sh
node scripts/verify-fof-payment-policy.mjs /path/to/pglite/dist/index.js
```

Install `@electric-sql/pglite` separately for that optional probe. It verifies
targeted seed isolation, malformed policy rejection, member reads, owner writes,
cross-office denial and employee write denial. It is not a replay of every
historical database migration and never connects to production.

Final full local suite: 1,558 passed, 53 skipped,
one pre-existing timeout in `broken-appt-workspace.test.tsx` (also reproduced before
these changes). An earlier run also hit a worker reporting timeout; the final
bounded-worker run did not. The initial repository-wide lint report contained
219 errors and 41 warnings; the changed TypeScript files have no lint
errors. Local dependencies were resolved with pnpm without changing the lockfile;
CI's frozen Bun install remains the authoritative locked-dependency check.
