# Confirmed audit fixes

Base and refreshed main: `24f7827e281b976819cb1976d0c17fb87d9108dd` (PR #164).
All five findings were present. No intervening main changes needed reconciliation.
README, runbook, and payment-policy instructions were read; the repository contains
no AGENTS.md files. No database schema changes are required by these fixes.

## Changes and regression evidence

1. **Staff identity and private caches.** The application now allocates a separate
   QueryClient per authenticated user, includes identity in every query hash, and
   cancels/clears the retired client. Its keyed subtree also clears component-held
   private results. Search, messages, receipts, attachments, employee details/time,
   and payroll have explicit user keys. The identity boundary covers remaining
   office caches without relying on an incomplete list of private query prefixes.
   Old requests and mutation callbacks retain only their retired client. Logout
   and privacy lock hide the workspace before awaiting the remote sign-out, and
   authorization generations discard stale allowlist/session results. Same-user
   token refresh keeps the client and mounted forms.
   Tests: `identity-query-privacy`, `message-search-identity`, and
   `auth-refocus-remount` cover same/cross-office switches, pending and failed
   requests, cancellation, external auth events, rapid switches, privacy lock,
   delayed approvals and same-user form/cache retention.

2. **Paid AI membership authorization.** `requireUser` verifies the token,
   calls the existing SECURITY DEFINER allowlist RPC, and resolves active membership
   using the verified user ID. Errors and missing rows deny access before the
   gateway. Its only consumers are `parse-treatment`, `consent-ai`, and
   `commitment-listen`; all spend AI credits. Invitation and onboarding functions
   do not use it and are unchanged. `paid-ai-authorization` executes the actual
   three handlers and real shared helper with mocked Supabase and gateways: missing
   or invalid tokens, nonmembers, revoked/inactive membership, removed approval,
   returned/thrown lookup failures, and authorized members. Rejections assert zero
   gateway calls.

3. **Complete screenshot imports.** The endpoint accepts only a complete, valid,
   nonempty array of at most 40 fully structured rows. Non-stop completion metadata,
   malformed/truncated JSON, invalid rows, and overflow return HTTP 422 with
   `INCOMPLETE_IMPORT`, actionable retry/batch instructions, and no partial rows.
   The UI requires an explicit `status: complete` before adding any lines. Existing
   fee-source resolution, ordering, and visit renumbering remain intact.
   `treatment-extraction` covers metadata, empty/malformed/truncated/over-limit
   results, separate fee columns, row order, visits, and retry. The actual builder
   test deliberately supplies partial rows with an incomplete status and verifies
   none enter the form; a subsequent complete retry succeeds.

4. **Personal MCP reports.** Both personal tools resolve the caller's active office
   and employee record and filter explicitly by office/employee; time entries also
   require the caller's user ID. PTO ownership uses employee_id, not created_by.
   The PTO selection now uses the actual hours_requested/note fields and accepts
   the old `canceled` spelling as an alias for the schema's `cancelled` value.
   No manager RLS permissions were narrowed. The shipped `mcp/index.ts` is the
   explicitly hand-owned authoritative implementation; historical src/lib/mcp
   files named in its banner do not exist. `mcp-personal-reports` runs the actual
   bundle against synthetic multi-employee, multi-office rows for employee,
   manager and owner roles, checks eight personal hours rather than sixteen, and
   tests membership/employee lookup failure and PTO creator/owner differences.

5. **FOF navigation.** The existing data-router useBlocker pattern presents Stay
   or Leave and erase. Form changes, uncommitted money inputs, payment-editor
   classifications/grouping/adjustments/prior payments/event links/overrides are
   included. Browser unload warnings remain. Clear form resets the warning.
   `fof-navigation-import` exercises real internal links, Back, both choices,
   clean/reset states, unload warnings, payment retention, and refresh.
   `fof-payment-editor` additionally tests every editor-state category's dirty/reset
   behavior. Patient values remain in memory; no persistence or telemetry was added.

## Existing timeout diagnosis

The unchanged named test passed in 331 ms after `bun install --frozen-lockfile`
(Vitest 3.2.4, Radix Select 2.2.5). Re-running it against the prior audit's unlocked
installation (Vitest 3.2.7, Radix Select 2.3.7, Testing Library React 16.3.3)
reproduced the 5-second timeout, with 26.46 seconds spent in the test.

The test previously searched the entire workspace for an option immediately after
opening the dropdown. Waiting for the listbox and querying the option within it
fixes the synchronization/query scope: the same assertion passed in 361 ms with
the newer stack, and in the complete frozen suite. This comparison establishes an
environment-sensitive test failure; it does not isolate one package version as
the sole cause. No production selection behavior, assertions, snapshots, dependency
versions, or timeouts were weakened/changed to hide it. README now requires the
frozen installation for regression work.

## Validation and limitations

- Windows, Node 24.19.0, Bun 1.4.2, frozen bun.lock; Vitest 3.2.4.
- `node node_modules/vitest/vitest.mjs run --maxWorkers=4`: **1,640 passed,
  53 skipped, zero failed** across 134 files (131 passed, 3 skipped).
- TypeScript application check passed. Local Vite production build passed.
- Deno 2.9.4 checked **all 35 edge entry points**, including the four affected
  deployments. Both committed lockfiles are unchanged. Deno's auto installer
  resolves a separate dependency graph; the Bun frozen installation was restored
  before the final frontend suite, matching the separation of CI jobs.
- Release structure: **171 migration filenames** and **2 workflow files** passed
  the repository checks. No migrations added or applied.
- Print/payment suites pass, including the six-payment **$8,173** fixture.
  Each touched snapshot was inspected: only checkout line-ending rewrites occurred;
  there are **no snapshot content changes** or generated OCR changes in the PR.
- The nonblocking repository lint report remains **218 errors and 42 warnings**;
  lint is not a clean gate. No dependency upgrades or broad lint cleanup are included.
- New authorization and MCP tests use synthetic records and mocked servers, not
  a database or production member account. No local isolated full database replay
  was run; the existing PR release workflow performs that independently.
- The existing suite's 20 unauthenticated endpoint probes and 2 anonymous
  security_events checks passed against the configured service. Those checks did
  not call a paid gateway and do **not** establish that these new membership guards
  are deployed. Skipped live/database tests are not security evidence.
- No real patient records or paid production AI were used. No deployment,
  production migration, or merge was performed.

## Deployment after review

1. Redeploy **parse-treatment**, **consent-ai**, **commitment-listen**, and **mcp**
   from this revision. The first three must include the updated shared helper;
   parse-treatment also needs the extraction validator.
2. Release the frontend after parse-treatment returns the new completeness status.
   Deploying the frontend first fails imports closed until the endpoint is updated.
3. This PR needs no schema changes. PR #164's prepared payment-policy migrations
   have their own release order in `docs/fof-payment-policy.md`; do not infer from
   these code/tests that those production migrations have been applied.
4. After deployment, separately verify authorized/unauthorized membership behavior
   and synthetic account switching in a controlled environment. Keep patient data
   out of test requests and gateways.
