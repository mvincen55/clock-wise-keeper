# Insurance operations — review and deployment

## Office workflow and AI instructions

Insurance Desk owns the Manuals, Benefits, Plan Library, Claims and Settings tabs. Manuals stays at its original route. The Workflows page links to the same Insurance Settings form. Claims is explicitly unavailable.

Settings defines what the AI obtains. The default breakdown checklist includes separate frequencies and age restrictions for BWX, FMX, Prophy, Perio, Exams, Fluoride and Sealants, plus downgrades, insurance versus office fee at maximum, rollover, waiting periods, out-of-network rules and unusual notes. Staff may deselect questions or use exact CDT scopes. Carrier presets override the office preset; each task retains its selected scope/version. The synthetic demonstration intentionally selects a smaller scope to prove the zero-call path.

The supplied Altus/DD RI office-fee instruction is shown in Settings. A manager maps the appropriate canonical carrier IDs and saves office billing rules for downgrades and maximum. Those rules are labeled office instructions on reports and are stripped from relay submissions. They are not inserted as payer answers or silently applied by a carrier-name guess. No production office configuration was changed.

Group identity and source review dates already belong to the plan snapshot. Reports label the latest answer/source timestamp as Updated. Unknown is distinct from no, completed phone calls may remain partial, and a fax promise is distinct from confirmed receipt. Unusual notes are asked only when selected, remain session-only, and cannot be published into the generic catalog.

## Data and module boundaries

The public export is `InsuranceWorkspace`; new domain, UI, adapters, relay and print implementation live in this namespace. Reference adapters use existing carrier directory, provider and branding records. Existing FOF estimates are unchanged and never promoted into verified benefits.

Only office settings and reviewed allowlisted generic rules enter Supabase. Imports, identities, member results, raw notes, call references and print views remain in the current browser/relay session. They do not enter browser storage, Supabase patient tables, query persistence, support capture, ordinary AI or manual remote search. The shared sensitive-session signal contains only a boolean. Internal tabs preserve task state; refresh, clear, auth/office changes and leaving the module discard it. Token refresh alone does not clear it.

The approved transient relay may hold patient processing state for at most one hour. It uses a long-lived process and server scheduler, not a serverless memory-survival assumption or foreground timer. Capabilities bind to user and office. Restart loses the queue; refresh does not reconstruct it. Expiry stops dispatch and requests cancellation; remote cancellation and unload delivery are best effort. A vendor request that returns after session release triggers cancellation of the returned call. An ambiguous creation is never blindly retried. Printed/saved files are deliberately user-controlled output outside the transient application boundary.

## Implemented live integration

- `relay.ts`: bounded JSON HTTP endpoints for authenticated readiness, open, start, events, pause/resume/cancel/retry/clear; origin checking; user/office capability isolation; no-store responses; transient result buffering; bounded connections; shutdown cleanup.
- `production.ts`: executable Bun host, validated deployment configuration, Supabase bearer/role authorization, canonical branding, payer telephone, billing NPI, rendering-provider NPI, tax ID and fax resolution at dispatch. Browser phone destinations are not accepted.
- `payer-router.ts` and `retell.ts`: per-payer pinned-agent dispatch, fixed caller/destination, ambiguous-create handling, status/cancel/reconciliation, signed raw-body webhook and custom-tool ingress, correlation, duplicate suppression and session release. Raw transcripts and recordings are ignored.
- `agent-template.ts`: concrete Retell LLM configuration with native DTMF and end-call tools plus signed structured-answer/state endpoints. Prompts constrain procedure distinctions, exact frequency windows, age boundaries, downgrade basis, rollover conditions, waiting periods and out-of-network rules. It stops for staff authentication and tool rejection.

The endpoints are implemented, but no production host, account, approved processing path, real payer configuration or live payer call has been supplied or deployed in this session. Agent behavior against real IVRs remains an operational acceptance test; the code and synthetic tests do not substitute for it.

## Deployment procedure (not executed)

1. Identify the approved persistent host and actual Retell/model/telephony services. Review agreements, retention, infrastructure logging and access. Disable request-body logging, APM payload capture, crash/core dumps, swap and durable queues. Terminate TLS at a covered reverse proxy; disable request/response buffering and body/access logging. Keep the app's existing service-worker behavior.
2. Copy `scripts/insurance-operations/relay.example.json` into the host's protected configuration mount and replace every placeholder. Set the actual conservative all-in rate; the example rate is not a quote. Keep readiness approval flags false until reviewed. Set `RETELL_API_KEY` using the host secret manager, never a browser build variable or committed file.
3. Generate the reviewable agent request body with `bun scripts/insurance-operations/print-agent-template.ts https://YOUR_APPROVED_RELAY APPROVED_MODEL`. Configure an agent with that LLM, the approved voice/telephony path, restricted retention and the `/webhooks/retell` callback. Custom functions use `/tools/retell`, signed wrapper payloads (`args_at_root: false`), and no request retries. Test it, publish a pinned version in the approved account, and enter its ID/version per payer in the relay configuration. No account/agent is created by the generator.
4. Confirm canonical Important Numbers mappings in Insurance Settings, including each payer telephone and each rendering provider. Numbers must be unambiguous international phone numbers; NPI/tax entries must contain only the expected identifier. Fill office branding. Set staff roles, scope, limits and office policies.
5. Run a supervised long-lived Bun process from the repository root: `INSURANCE_RELAY_CONFIG=/protected/relay.json bun src/features/insurance-operations/server/production.ts`. It binds loopback port 8789 by default. On Windows set that environment variable before the command. Use a service supervisor, not a transient browser terminal or serverless function. A separate approved proxy exposes the configured HTTPS origin.
6. Only after operational approval set `VITE_INSURANCE_RELAY_ORIGIN` to that origin for the app deployment. The browser requires authenticated readiness in live mode. The office enabled checkbox alone cannot enable calling. Never point patient data at the synthetic host.

The relay authorizes with a public Supabase key plus the staff bearer; it needs no service-role key. Only non-patient identity/configuration/reference requests reach Supabase. Account tokens remain in memory. Auth expiration pauses dispatch until same-session authorization can be renewed. Global cost reservations are conservative session estimates, not a vendor-enforced account billing cap.

## Synthetic reproduction and evidence

Start `bun src/features/insurance-operations/server/synthetic-server.ts` and `bun run dev --host 127.0.0.1 --port 8080`. Open `http://127.0.0.1:8080/scripts/insurance-operations/synthetic-harness.html`. Use synthetic mode, import the two fixtures (or load them), review each, start, review and print, then refresh. The localhost server accepts only fixed synthetic identities and never dials a phone.

`check-browser.mjs` demonstrates CSV mapping with leading zeros, a cached zero-call breakdown, a call-needed task, background-tab execution, partial results, two reports and refresh clearing. `check-desktop.mjs` opens an isolated Edge window, grants notifications only in that temporary browser context, removes Playwright background-throttling overrides, minimizes the actual window through Edge's native window-state protocol, and verifies it stays minimized from start to completion. It records native Notification `show` events with generic text and no body. Native Windows capture failed on this host, so no screenshot of the OS toast was claimed. The test records `document.visibilityState` separately; this automated host reports visible even while the native window state is minimized. Sleep/discard delivery is not guaranteed.

Run either browser check with Node while both local servers run. Set `PLAYWRIGHT_MODULE` to an external installed Playwright entry point if needed; Playwright is not an application dependency. Review artifacts are written to `outputs/` beneath the command's working directory.

## Release checks

The existing full CI and Database/edge release gate passed on rebased commit `1e9ecb7` in PR #174, including replay from zero and scheduled-job/permission probes. The final branch adds insurance-specific real-auth RLS tests to `scripts/verify-release-db.sql` and checks its table/RPC declarations against fresh local Supabase generation. Check the PR's latest commit statuses before release.

Local focused tests cover domain matching, imports, alerts/print, runtime limits, HTTP owner/capability isolation, duplicate launches, signed tool correlation and catalog exclusion of unusual notes. All 36 existing edge entry points passed Deno 2.9.4. The separate PGlite test passed 19 checks against the actual new migration; it supplements, rather than replaces, full replay. Reproduce with `PGLITE_MODULE` pointing at an external PGlite entry point and `bun scripts/insurance-operations/check-database.ts`.

Shared integration files: `src/App.tsx`, `src/pages/InsuranceDesk.tsx`, `src/pages/Settings.tsx`, `src/components/SupportWidget.tsx`, `src/components/insurance/InsuranceManualReader.tsx`, additive `src/integrations/supabase/types.ts`, and new `src/lib/sensitive-session.ts`. Release coverage also extends `scripts/verify-release-db.sql` and `.github/workflows/database-replay.yml`; workflows still have read-only repository permissions and perform no deployment. The newer main-branch Workflows layout and Close the Day changes were preserved during rebase. No dependency or lockfile change is required.

## Verified API references

Checked September 11, 2026 against official Retell documentation and official `retell-sdk` 5.66.1 type declarations:

- [Create phone call](https://docs.retellai.com/api-references/create-phone-call)
- [Stop call](https://docs.retellai.com/api-references/stop-call)
- [Secure webhooks](https://docs.retellai.com/features/secure-webhook)
- [Custom functions](https://docs.retellai.com/build/single-multi-prompt/custom-function)
- [DTMF tool](https://docs.retellai.com/build/single-multi-prompt/press-digit)
- [Create Retell LLM](https://docs.retellai.com/api-references/create-retell-llm)
- [Data storage settings](https://docs.retellai.com/accounts/privacy-disable)

`basic_attributes_only` plus one-day retention is requested. This is not zero vendor retention. Metadata, model/telephony processing and infrastructure retention still require approval. No real-call readiness or legal compliance is inferred from a mock or native-browser test.
