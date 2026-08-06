# Forms & Consents — compatibility adapter retirement checklist

The PR 1A/1B foundations introduced canonical sources with temporary
compatibility adapters so nothing broke mid-migration. Each adapter below may
be retired **only when every listed reader/writer has moved to the canonical
source and tests prove the old field is no longer required**. Never leave two
editable sources of truth — every adapter here is one-way (canonical → cache).

## 1. `fof_settings.doctor_names` (derived cache)
- Canonical source: `org_providers` (trigger `org_providers_sync_doctor_names`
  keeps the array in sync; `sync_fof_doctor_names` upserts the settings row).
- Remaining readers: FOF builder doctor dropdown (`useFofSettings` /
  `useDoctorNamesFromRegistry`), Broken Appointments (`doctor_name` free pick),
  FofPolicySettingsCard (read-only display).
- Retire when: FOF and Broken Appointments read `org_providers` directly
  (`useActiveProviders`). Then drop the trigger and the column.
- Note: the Complete Forms packet already reads the registry directly (Phase 3).

## 2. `fof_code_names.patient_name` (derived cache)
- Canonical source: `procedure_meta.patient_name` (trigger
  `procedure_meta_sync_code_name` mirrors insert/rename/clear/delete).
- Remaining readers: FOF print naming (`useCodeNames`), consent conversion
  keyword matching.
- Writers: none — `useUpsertCodeName` and `useUpsertProcedurePatientName` both
  write `procedure_meta` only.
- Retire when: `useCodeNames` reads `procedure_meta` (map code → patient_name).
  Then drop the trigger and the table.

## 3. `profiles.initials` (deprecated column)
- Canonical source: `employees.tag` staff codes (manager-assigned, permanently
  reserved via `employee_tags` + `register_employee_tag`).
- The app no longer writes initials anywhere; the PR 1A backfill consumed any
  valid values. Remaining reader: Broken Appointments initials stamping
  (`useMyProfile.initials` fallback → shared staff-code helper migration
  pending).
- Retire when: Broken Appointments stamps via `useMyStaffCode`. Then drop the
  column (keep the COMMENT documenting the deprecation until then).

## 4. Old quantity logic
- Canonical source: `src/lib/procedures.ts::computeQuantity` +
  `validateProcedureMeta` (mirrored by the `procedure_meta_enforce_integrity`
  DB trigger).
- The consent packet (Phase 5) uses it exclusively. FOF's own visit math is a
  separate, pre-existing system and out of scope until FOF migrates onto
  `procedure_meta` (same PR that retires #2).

## 5. Staff-code fallbacks
- One helper only: `src/lib/staff-code.ts` (`staffCodeLabel` /
  `attributionLabel` — "Unassigned" when no code, never name/email/initials).
- Consent version history uses it (Phase 3). Audit before each retirement PR:
  `grep -rn "initials" src/` must show no new attribution fallbacks.

## Retirement order recommendation
1. FOF reads → `org_providers` + `procedure_meta` (retires #1 and #2 together).
2. Broken Appointments initials → staff codes (retires #3).
3. Drop triggers/columns/table in one final additive-then-destructive migration
   pair, with a from-zero replay run and production backup point first.
