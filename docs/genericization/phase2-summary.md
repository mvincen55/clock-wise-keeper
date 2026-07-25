# Genericization Phase 2 — Summary

Phase 2 is complete and stopped, per the brief. Six PRs, stacked in
merge order (each applied live as it was built; the app has been
running against the new rows throughout):

| PR | Bucket | What moved from code to rows |
|---|---|---|
| #77 | 2a Money thresholds | `day_of_service_threshold_cents` ($1,000, bounds $0–$5,000), `min_standalone_payment_cents` ($100, bounds $0–$1,000), `downgrade_default_on` (off) → `fof_settings`, CHECK-bounded |
| #78 | 2b Discount rules & code lists | `fof_discount_rules` (senior 10%/$1,000, courtesy 5%, membership 10%+5%), `fof_code_rules` (never-covered ×4, no-prepay ×1, membership-included ×15). Templates now reference rules |
| #79 | 2c Vocabulary & print snapshots | `membership_plan_name` ("Illumitrac"), `doctor_names` (×5), `deposit_logs.print_snapshot` captured at save time |
| #80 | Prompt split | `POLICY_SUMMARY` generated per request from live rows; office voice (Delivery vocabulary, no-surfaces) → 3 seeded `fof_ai_guidance` rows; carrier examples genericized; capability text points to the real settings cards |
| #81 | Display naming & registry | `feature_display_name` / `print_form_title` (Harelick: "Financial Options Form"; new orgs: "Treatment Estimator"/"Treatment Estimate"); `src/lib/settings-registry.ts` with grouped metadata; sectioned settings UI |
| #82 | PTO tiers (last, per review) | `pto_accrual_tiers` (4 tiers, rate/cap CHECK-bounded); pure `computePtoLedger` under a 16-week ledger snapshot invariant captured pre-refactor |

**Invariants:** the print snapshot tests (FOF patient+office copy,
Deposit Log both copies) passed byte-for-byte through every PR; the new
PTO ledger snapshot passed unchanged through the tiers refactor.
178/178 tests green at the tip. Shipped defaults are Harelick's proven
values everywhere; every dollar-moving value is CHECK-bounded
server-side.

## Judgment calls the inventory didn't pre-answer

1. **"Courtesy" identified as the under-65 prepay-in-full 5%** (2b).
   The brief named senior/membership/courtesy; the only unnamed program
   in the actual math was the under-65 prepay credit, so that's the
   courtesy rule.
2. **`fof_templates.membership_discount_percent` becomes an opt-in
   flag** (>0 = membership template); the rate lives on the membership
   rule. Column not renamed to avoid schema churn — candidate cleanup.
3. **The senior threshold is its own bounded value** on the senior
   rule, separate from the 2a day-of-service threshold. Same $1,000
   today, independently configurable — they answer different questions
   (discount eligibility vs. payment scheduling).
4. **Code-list fallback semantics**: an org with zero code rows uses
   shipped defaults; an org with any rows owns its lists (an emptied
   list stays empty rather than resurrecting defaults).
5. **No new feature toggles in 2c.** The audit's toggle candidates were
   already per-template flags; the brief said keep 2c minimal, so the
   Feature Toggles registry group ships as an empty placeholder.
6. **Deposit print snapshots also capture branding** (legal name,
   logo), not just wording — a reprint after a rebrand shows the
   document as issued. Snapshot addressability is by column (three real
   positions), not a speculative per-copy/position grid.
7. **Office-copy compact naming derives from the print title's
   initials** ("Financial Options Form" → "FOF Detail"). This is what
   keeps Harelick's print byte-identical while a new org gets "TE
   Detail"; a poor-initials title would need a future explicit
   short-name setting.
8. **Template seed texts interpolate the org's print title at seed
   time** (validity/prepay notes, signature intro) — same pattern as the
   contact note. The template *editor's* new-template defaults still
   carry the shipped texts; minor, noted for the onboarding flow.
9. **The membership "+5% is a 65+ courtesy" gate** now keys off the
   senior rule's enabled flag: disabling the senior program also stops
   the membership senior extra. Matches the chart's intent; flagging in
   case the office thinks of them as independent.
10. **PTO "today" stays browser-local** (as the original engine
    behaved), passed explicitly into the pure function for determinism.

## Proposed settings layout (not built — per instruction)

The registry now carries group/label/description for every setting, and
cards render under registry-driven section headers — but they're spread
across three pages (Templates, Fee Schedules, Deposit Log) for
historical reasons. Proposal:

- **A dedicated `/settings` page** (manager-only), rendering the six
  registry groups in onboarding order as an anchored, scrollable
  sectioned page (or side-tabbed on desktop): Identity & Branding →
  Documents & Wording → Money & Thresholds → Discounts & Rules → Time
  Off Policy → Feature Toggles. Each section hosts the existing cards
  unchanged — the components are already group-tagged, so the move is
  mechanical.
- The current in-context cards stay where staff use them (code rules on
  Fee Schedules, deposit wording on Deposit Log) as **links** to the
  settings section rather than duplicate editors, once the page exists.
- **Onboarding reuses the same page in "wizard" mode**: the registry
  supplies order, labels, descriptions, and types; a form-mode walks
  sections sequentially; the AI-interview mode asks for the same keys
  conversationally and writes through the same bounded mutations.
  Nothing about the registry needs to change to support either.

## Explicitly left for Phase 3 (capability contract)

- Registry entries gain the assistant-writable tier markings; server
  validation of assistant writes against registry bounds.
- `fee_schedule_items.notes` surfaced inline in the builder (the one
  Phase 3 UI item in the brief).
- Candidate cleanups parked: deprecated identity columns on
  `fof_settings`, `membership_discount_percent` rename,
  `illumitrac_cents` column comment.
