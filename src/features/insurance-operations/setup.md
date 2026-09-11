# Insurance operations — initial review build

This branch is a synthetic-review build, not a live calling release. No migration was applied to a connected database, no service was deployed, and no real call was placed. Claims is intentionally unavailable.

## Boundaries

The public export is `InsuranceWorkspace`. `/insurance-desk` preserves the manual reader; child tabs share one memory-only session. Only settings and reviewed, allowlisted generic plan versions enter Supabase. Existing FOF defaults remain estimates and are neither modified nor promoted into reviewed benefits. All reference queries include the office identity. Patient tasks never enter TanStack Query, browser storage, support capture, manual AI search, or a Supabase function.

Browser task state, imports, capabilities, events and print previews are transient. Refresh cannot reconstruct the worklist. Auth/office changes unmount it, deliberate clear discards it, and a navigation warning covers leaving the module. Token refresh and hidden-page events do not clear it. The sensitive-session signal contains a boolean only and suppresses support capture and remote manual search/AI while work is present. Browser print/save output is deliberately user-controlled and can persist outside the application.

`server/runtime.ts` targets a supervised, long-lived process with in-memory sessions, a server scheduler and a one-hour maximum session lifetime. It does not target serverless process-global memory. Capabilities bind to user and office. Authorization and settings are rechecked before dispatch. Expiry stops queued work and requests active-call cancellation; cancellation is best effort. A closed/discarded page cannot recover results. Machine sleep and loss of connectivity do not guarantee timely alerts. Production hosts must disable body/access/error payload logging, crash dumps, swap/core dumps, APM payload collection and durable queues, and review infrastructure retention. Memory expiry is not a claim about instantaneous physical erasure or vendor deletion.

## Synthetic review

Use existing Bun dependencies. Start separate terminals:

```sh
bun src/features/insurance-operations/server/synthetic-server.ts
bun run dev --host 127.0.0.1 --port 8080
```

Open `http://127.0.0.1:8080/scripts/insurance-operations/synthetic-harness.html`. This harness has no authenticated office data. Choose synthetic mode and load the two fixtures, review each row, Start selected, then Confirm Start. One breakdown completes from the reviewed synthetic catalog without calling the adapter; the combined request enters the local server, holds and returns unknown member answers. Background the page while it runs, return, review the partial status and print two reports. Refresh starts empty. The localhost endpoint accepts only the fixed synthetic identities and is not a patient relay.

The generic notification text and denied-permission behavior have focused tests. The CSV mapping/background-tab demonstration passed with no page errors, preserved leading zeros and produced two patient reports. Reproduce with `node scripts/insurance-operations/check-browser.mjs` while both local servers run; set `PLAYWRIGHT_MODULE` to an external Playwright entry point if needed. Output is written under `outputs/` in the working directory. The physical minimized-window automation attempt was unsuccessful and is not accepted as a passing test. Verify a truly minimized window, OS notification delivery/permission denial, sleep/reconnect and browser discard on supported office browsers before release. No unattended printing is performed.

## Live setup remains required

`RetellAdapter`, the bounded conversation contract, authenticated transport interface and office authorizer are preparatory server components. This branch does **not** provide a deployed production HTTP relay, configured Retell agent, authenticated tool endpoint or operational webhook ingress. The only executable HTTP host is synthetic. Do not point real patients at it.

A live deployment must mount the session transport endpoints behind TLS and an explicit origin allowlist, enforce bounded/strict request bodies, validate each Supabase bearer against the configured office and role, own the server scheduler, mount raw-body signed webhooks and authenticated structured-answer tools, and isolate each office's runtime. `office-authorization.ts` reads only non-patient configuration. Mounting code must use the same authority for every endpoint, must not trust browser settings/phone destinations, and must never log request bodies or vendor responses.

The reviewed processing path is browser → approved transient relay → Retell → the actually selected model/telephony services → payer. Supabase stores office configuration only. Before enabling, review applicable agreements and the actual path, deploy a pinned agent version implementing `conversation.ts`, verify payer IVR/DTMF/hold/human handoff and structured tool answers, configure approved caller/payer/fax destinations from canonical office references, verify billing versus rendering NPI/tax identifiers, and test cancellation and ambiguous-create reconciliation. No real payer workflow has been validated by this build.

Retell setup requires server-only API key, agent ID/version, approved caller/payer number, office fax, practice name, canonical credentials, and webhook URL. Its three approval flags default to blocking unless supplied explicitly. Live runtime construction additionally requires an actual conservative all-in cents-per-minute ceiling (fifth constructor argument); without it, cost reservation is infinite and dispatch remains blocked. Account for model, telephony, transfer and rounding charges before choosing that ceiling. Session reservations are conservative and are not a billing ledger or provider-enforced account spending cap.

Only after the production ingress and operational review exist should `VITE_INSURANCE_RELAY_ORIGIN` be set to that HTTPS origin. The frontend checks readiness mode; a build variable alone does not configure a service or approve processing. The office enabled toggle alone cannot enable the adapter.

Official Retell references checked September 11, 2026:

- [Create phone call](https://docs.retellai.com/api-references/create-phone-call): pinned outbound agent, per-call retention override, bounded duration. No guaranteed create idempotency was established, so an uncertain outcome remains ambiguous.
- [Stop call](https://docs.retellai.com/api-references/stop-call): cancellation must be reconciled, not assumed successful.
- [Secure webhooks](https://docs.retellai.com/features/secure-webhook): raw body plus timestamp HMAC, five-minute freshness, webhook-enabled key. Duplicate events are rejected in memory.
- [Data storage settings](https://docs.retellai.com/accounts/privacy-disable): `basic_attributes_only` and one-day retention are requested. This is not zero vendor retention; metadata and other service layers require separate review. Webhook payloads may still contain sensitive data. The adapter ignores transcripts and recordings.

## Verification and remaining release gates

- TypeScript passed; production bundle passed. Repository prebuild lint is configured non-blocking and reports existing issues outside this feature. Feature-only ESLint passed.
- Full suite before final additions: 141 files passed, three skipped; 1,736 tests passed, 53 skipped. Final focused suite: five files and 33 tests passed, including import, domain, runtime, alerts and print.
- Workflow safety and migration naming checks passed (two workflows, 175 migrations).
- The actual new migration passed 19 isolated PostgreSQL/PGlite schema, write-authorization and cross-office RLS checks. Reproduce with `bun scripts/insurance-operations/check-database.ts`; supply `PGLITE_MODULE` pointing at an externally installed PGlite module when it is not locally resolvable. PGlite is a test-only external tool, not an application dependency.
- Full Supabase migration replay, generated-type parity and release database gates have not run: Docker, Supabase CLI and PostgreSQL CLI are unavailable here. Additive types were synchronized manually. Do not substitute the isolated fixture checks for the repository's release gate.
- No edge function was edited. All-edge Deno and full authenticated-shell browser acceptance remain outstanding.

Keep this change in draft review until those release gates and the live integration acceptance work are complete. Some requested hardening remains future work: a catalog retirement control, broader import-format/browser acceptance, rendering-provider mapping ergonomics, and real payer/tool integration. Synthetic evidence does not establish live readiness or compliance.
