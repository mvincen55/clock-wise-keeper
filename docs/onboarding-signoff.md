# Onboarding Sign-Off + PIN Attestation — build doc & runbook

New-hire onboarding as a permanent employment record: an org-configurable,
per-role checklist with dual sign-off (trainer + new hire) on every item,
attested with per-employee PINs verified server-side. **Employment data only —
no patient data anywhere in this module.** Unlike FOFs and letters, these
records PERSIST permanently by design (in scope for the no-PHI system).

Built in four independently shippable phases; each section below ends with
that phase's manual deploy steps (GitHub pushes deploy nothing — see README
"How code changes ship").

Existing machinery referenced (never duplicated):

| Need | Existing piece |
|---|---|
| Employee record | `employees` (+ `employees_id_org_unique` composite FK target) |
| Staff codes / initials | `employees.tag` via `useStaffCodes` + `src/lib/staff-code.ts` |
| Checklist system | `checklists` / `checklist_items` (one-off = `due_date` + `source`/`source_ref`) |
| Escalation engine | `escalation_policies` (member-visible thresholds) + engine scan pattern |
| HR file | `accountability_reports` — the "Permanent record" card on EmployeeDetail |
| Org settings | columns on `org_practice_settings` (defaults are the product) |
| Delegation | `employee_permissions` + `can_manage_permissions()` |
| Print branding | `useOrgBranding` → letterhead w/ logo + text fallback, `BrandPrintStyle` |
| Crypto | pgcrypto (bcrypt `crypt`/`gen_salt('bf', 10)`), the DB crypto layer already in use |

## Phase 1 — PIN attestation primitive (built)

A server-verified "this specific person confirms this specific action"
record, usable by any feature. Because offices run shared logins, the
signed-in session proves nothing about *who* is confirming — the PIN does.

**Schema** (`supabase/migrations/20260825120000_pin_attestation.sql`):

- `employee_pins` — beside the employee record: `pin_hash` (bcrypt via
  pgcrypto, never plaintext), `failed_attempts`, `locked_until`. The hash
  column is excluded from the authenticated SELECT grant, so no client can
  read it (a 4-8 digit PIN has little entropy; even its hash stays server
  side). No client write path: set/change only via `set_employee_pin`
  (SECURITY DEFINER — org admin for anyone, a member for their own record);
  `clear_employee_pin` is admin-only.
- `attestations` — employee id, action type, target reference
  (`related_table`/`related_id`, the shape notifications use), payload,
  server timestamp, verified flag. **No client insert path**: authenticated
  holds SELECT only (admins org-wide, members their own), and the single
  policy is the read policy. The `attest` edge function is the only writer.
- `org_practice_settings` gains `require_pin_on_signoff` (default **on**),
  `pin_lockout_attempts` (default 5), `pin_lockout_minutes` (default 15).
- `_verify_employee_pin_internal` (service_role only) does the bcrypt
  compare and enforces lockout atomically under a row lock.

**Edge function** `attest` (`verify_jwt = true` in `config.toml`): input =
employee id, PIN, action type, target reference. Derives the org from the
caller's active membership (never the client), requires the attested
employee to be active in that same org, verifies via the private RPC, and on
success writes the attestation row itself. Per-action side effects register
in the function's `APPLIERS` map and run server-side (Phase 3 adds the
onboarding sign-off applier). Refusals return structured codes: `wrong_pin`
(+ attempts_remaining), `locked` (+ locked_until), `no_pin`. The PIN is
never logged.

**UI**: Settings → My settings → "Your Sign-off PIN" (self-service, own
login); EmployeeDetail → "Sign-off PIN" (owner/manager set/reset/remove);
Settings → People & policies → "Sign-off PINs" (require toggle + lockout
numbers). When `require_pin_on_signoff` is off, consuming features fall back
to the editable-initials pattern and mark rows unverified (Phase 3).

**Tests**: `src/test/pin-attestation.test.ts` (pure helpers, migration
lockdown asserts, live-DB privilege + wrong-PIN/lockout/locked/correct-PIN
behavior probes when `PGHOST` is set), `attest` added to
`endpoint-auth-guard.test.ts`, and staging probes in
`supabase/tests/attest_probes.sql` (8 probes, single rolled-back
transaction — includes the client-write-rejection and non-admin-set-PIN
checks).

**Deploy (manual, in this order):**

1. Apply the migration:
   `supabase db push --project-ref lfiplzmxpmybtbzhmnkp` (or paste
   `20260825120000_pin_attestation.sql` in the SQL editor). **Staging
   first.** No destructive changes — additive only.
2. Deploy the function:
   `supabase functions deploy attest --project-ref lfiplzmxpmybtbzhmnkp`.
3. Verify: run `supabase/tests/attest_probes.sql` in the SQL editor (staging)
   and probe the endpoint per `docs/runbook.md` §1 — an anon-key POST to
   `/functions/v1/attest` must return 401, not NOT_FOUND.

## Phase 2 — Onboarding templates (built)

Owner/manager (plus delegated) builder for per-role onboarding checklists.
Typed authoring only — AI parse-a-document-into-a-template is a documented
future item.

**Schema** (`supabase/migrations/20260825130000_onboarding_templates.sql`):
`onboarding_templates` (name, free-text `role_label` — never an enum,
`is_active`), `onboarding_template_sections`, `onboarding_template_items`
(title + optional `detail` sub-note + `sort_order`), all org_id + RLS.
Members read; writes require `can_manage_onboarding()` = org admin OR the
new `manage_onboarding` key in the existing `employee_permissions` grants
(owner-controlled delegation via `can_manage_permissions`, exactly like
`manage_office_goals`). The permission CHECK constraint is re-declared with
the full key list; `src/lib/permissions.ts` carries the registry entry.

**UI**: `/new-hires/templates` (library: create, duplicate-as-starting-
point, seed-on-first-visit) and `/new-hires/templates/:templateId` (editor:
sections/items CRUD, up/down reorder that renumbers cleanly, active toggle,
delete with the "instances keep their snapshot" note). Linked from
Management. Reordering logic is pure (`src/lib/onboarding-order.ts`).

**Print**: `OnboardingTemplatePrintSheet` renders the BLANK checklist on the
org letterhead — same asset path as the FOF print (`useOrgBranding.logoUrl`,
practice-name text fallback), `BrandPrintStyle` accent, `.onb-sheet` CSS,
`.onboarding-print-root` portal added to the hide-everything-else print
rules.

**Seed**: ONE generic dental front-desk template
(`src/lib/onboarding-template-defaults.ts` — paperwork / safety / policies /
systems / core training / daily duties / reviews), seeded client-side on
first visit to an EMPTY library only (server-side count re-check guards the
race), fully editable afterward.

**Tests**: `src/test/onboarding-templates.test.ts` (reorder integrity, seed
idempotency + genericness, migration RLS asserts, live org-isolation
probes), `src/test/onboarding-print.test.tsx` (print snapshot + logo/text
fallback), `employee-permissions.test.ts` updated for the new key.

**Deploy (manual, in this order):**

1. Apply migration `20260825130000_onboarding_templates.sql`
   (`supabase db push --project-ref lfiplzmxpmybtbzhmnkp` or SQL editor).
   **Staging first.** Additive only (the permission CHECK is re-created with
   a superset list — existing grant rows all remain valid).
2. No new edge function in this phase — nothing to deploy.
3. Verify: as an owner, open Management → New-Hire Onboarding; an empty org
   library seeds the starter template; Print blank shows the letterhead
   (logo or practice-name fallback).

## Phase 3 — Instances and dual sign-off (built)

**Schema** (`supabase/migrations/20260825140000_onboarding_instances.sql`):
`onboarding_instances` (employee, template provenance ref + SNAPSHOT of
name/role, status, started/completed) and `onboarding_instance_items` (one
row per item, values copied from the template at start; trainer slot +
trainee slot, each with initials, signed_at, and an attestation reference).
An item's `completed_at` is stamped ONLY when both slots are signed — the
both-signatures rule lives in the SQL, not the UI.

**Write model = snapshot immutability**: clients hold SELECT only on both
tables (org-member read — the shared-terminal flow means any signed-in
member session must render an instance). Writes:

- `start_onboarding_instance(employee, template)` — SECURITY DEFINER RPC,
  `can_manage_onboarding()` gated: validates active template with items,
  refuses a duplicate active instance, copies the snapshot in one
  transaction, notifies the hire when they have a login.
- PIN path: the `attest` function's `onboarding_item_signoff` applier calls
  `_apply_onboarding_signoff_internal` (service_role only), which decides
  the SIDE server-side — the attesting employee IS the instance's employee →
  trainee slot, anyone else → trainer slot — stamps the staff code
  (`employees.tag`) as initials, links the attestation, and refuses
  double-signing. Order-agnostic by construction.
- Fallback path (`require_pin_on_signoff` off):
  `record_onboarding_signoff_fallback` RPC — member-gated, refuses outright
  while PINs are required, validates 2-8 char initials, never writes an
  attestation reference, so the record reads "initials only — unverified".

**UI**: `/new-hires` (managers/owners: all instances with progress + Start
dialog; members: their own), `/new-hires/:instanceId` (sections, per-side
status chips, tap-to-sign → `SignoffDialog` with two order-agnostic panels;
PIN entry or prefilled-editable initials per the org setting), Print record
via `OnboardingRecordPrintSheet` (initials, verification status, dates;
unsigned slots print blank rules). Linked from Management and Workplace →
Growth.

**Tests**: `src/test/onboarding-instances.test.ts` (both-signatures rule,
unverified labeling, snapshot immutability grants/policy asserts, applier
side-decision asserts, live end-to-end probe: start → both PIN sign-offs →
completion stamps), record-sheet snapshot in `onboarding-print.test.tsx`.

**Deploy (manual, in this order):**

1. Apply migration `20260825140000_onboarding_instances.sql` (staging
   first; additive only — requires Phase 1 + 2 migrations already applied).
2. Redeploy the updated function:
   `supabase functions deploy attest --project-ref lfiplzmxpmybtbzhmnkp`
   (it now carries the onboarding applier).
3. Verify: start an onboarding from the starter template, sign one item
   from both sides with two PINs on one screen, confirm the item flips to
   Done only after the second PIN, and Print record shows both slots as
   "PIN verified".

## Documented future items (not built)

- Linking checklist items to training modules with pass gates (shared
  training pipeline plan).
- AI parsing of an office's uploaded onboarding document into a template.
- Per-person logins graduating from employee PINs.
