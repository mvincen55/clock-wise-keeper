# Purple Envelope

Practice-operations software for small independent dental offices.
**"Only your business, never your patients."**

- **Live site:** https://purpleenvelope.app (legacy: https://timekeepers.me — still allowed for invite links)
- **Brand color:** `#53406e`
- **Repo name:** `clock-wise-keeper` — legacy name from the time-clock origin. The product is Purple Envelope; do not "fix" the repo name without coordinating a Lovable relink.
- **Supabase project ref:** `lfiplzmxpmybtbzhmnkp`
- **Built on Lovable.** Most commits come from the `lovable-dev` bot; Claude Code ships larger features via PRs; Kimi ships targeted fixes directly to `main`.

---

## For AI agents working on this repo

Read in this order before changing anything:

1. This README — product rules, app map, pipelines, landmines.
2. [`docs/runbook.md`](docs/runbook.md) — per-flow debugging directions and verification probes.
3. The relevant spec in `docs/` for planned/in-progress features.

Golden rules that must survive every change:

- **No patient data. Ever.** Not in tables, not in checklist titles, not in AI prompts. See the HIPAA boundary section.
- **`org_id` on every table, RLS on every table.** RLS is the *sole* security perimeter — the bundled anon key is public by design.
- **Org identity comes from `org_members` server-side, never from client input.**
- **Recipient emails are PII** — use the existing `maskEmail()` pattern in edge function logs.
- **Printing is snapshot-tested.** FOF, Deposit Log, and Incident Report sheets have print-invariant tests; run the suite before merging print changes.

---

## Product rules (non-negotiable)

1. **No patient data, ever.** Storing PHI would trigger HIPAA BAA obligations with every vendor in the pipeline. This is the product's founding constraint, not a preference.
2. **Everything is a setting.** Offices differ; behavior that could vary by office should be configurable rather than hard-coded.
3. **Defaults are the product.** A new office should get a sensible, working configuration out of the box.
4. **Invite-only access.** No public sign-up into an org. Access is gated by an allowlist (see Access model).

## The endgame (read before designing anything)

This app is a stepping stone. What's being built is **the operating system for independent dental offices** — the intelligence and operations layer that sits *beside* the practice-management system (Dentrix, Eaglesoft, Open Dental), never replacing it, never becoming clinical. The strategic frame is explicitly **anti-DSO**: DSOs win through operational consistency, pooled knowledge, and negotiating scale. Purple Envelope exists to give independent offices that same leverage **without** selling the practice — a collective of independents, not a platform extracting from them. We never sell to DSOs. Every design decision should be made with this destination in mind, because the current app's schemas, settings architecture, and org model are the foundation the rest gets built on.

### The layers this grows into

1. **Office brain (now).** The AI *is* that office. Its authoritative world is the office's own rules, policies, and vocabulary — external dental knowledge informs, office rules govern. Prompt architecture is layered: a **global Purple Envelope doctrine** (never invent office rules, surface conflicts instead of picking silently, humans approve, cite the office rule behind every suggestion), then an **office layer** (policies/brand — mostly *pointers into retrievable office knowledge*, not prose stuffed in the prompt, so reasoning stays traceable and tokens stay cheap), then a **per-user layer** (how this team member communicates and learns; updates rarely; visible to that person — no hidden dossiers, consistent with the communicated-expectations principle that governs escalation).
2. **Module library.** "Connectors" are mostly our own code shipped dark: the full catalog lives in the build, searching it and hitting "connect" flips an org flag and runs that module's setup. Visibility per module is a **list, not a boolean**: seen-by-all (default), selected-orgs, or private-to-one-org. Custom builds are paid; most requests should resolve as *settings* on existing features, then as *recombinations of existing primitives*, and only rarely as new code. Paid builds default into the shared catalog (priority, not ownership); private stays possible and priced higher. True external integrations remain the rare, expensive case.
3. **The collective pool (the moat).** Offices opt in (at onboarding, in the ToS) to share the **structural** — module usage patterns, settings shapes, contributed templates with branding stripped — never the brand, voice, or content that makes an office *theirs*. Contribution must be **exhaust from work offices already do**, never an extra task; access to network intelligence is reciprocal (contributors see the pool). Insurance intelligence has a stricter provenance rule: **only payer-issued documents** (PTEs, EOBs, denials, payer faxes/portal docs) feed the shared pool, keyed by carrier + group + plan year, date-stamped, aging visibly. Office-typed notes stay private tribal knowledge. **Fee schedules never cross office boundaries — ever.** That line is legal (antitrust), not stylistic.
4. **Claims-adjacent future.** Long-term: document ingestion → payer-pattern learning → claim-readiness → clearinghouse connectivity. All of it gated behind a future **BAA-enabled tier** that does not exist yet.

### What this means for code written today

- **Today's no-PHI rule stands absolute** — but don't architect as if it's permanent. Patient-enabled capabilities belong behind feature flags in a separable lane; a schema or service choice that would *foreclose* a future BAA tier is a bug against the vision.
- **Everything org-scoped, everything a setting.** If an office could reasonably want it different, it's configurable — and most settings should surface through onboarding, not a settings page.
- **Design new features as catalog modules** (flag-gated, setup-on-enable, seed-on-first-visit) even while there's one org. The check-request pattern — message + dismiss-with-status + reason-required + a typed field — is the model: new tools are recombinations of proven primitives.
- **Schema choices should anticipate the pool.** Anything insurance-shaped gets provenance (source document type + date) and carrier/group/plan-year keying from day one, even when it's private-only.
- **AI features must show their work** — which office rule, which document, which approval produced a suggestion. Trust is the product; traceability is how trust is enforced in code.
- **The office's identity is sacred.** Branding, vocabulary, tone, patient-facing names: per-office, never pooled, never overwritten by a "better" default.

## HIPAA boundary (how the rule is enforced in code)

The FOF (fee form) prints patient-facing documents, and AI features read office knowledge — so the boundary is enforced architecturally:

- Staff-authored free text (e.g. `fof_code_names` overrides — "Name patients see") flows into printed forms and the builder, but **never** into `safeProcedureLabel`, which is derived from CDT codes alone. That guarantees typed text cannot reach an AI gateway the practice has no BAA with.
- This is asserted in tests, including that `safeProcedureLabel` takes no overrides argument so none can be threaded in later.
- AI code knowledge has exactly two legitimate homes: the **office schedule** (true for every patient) and a **carrier schedule** (applies only when billing that insurance). Both are loaded and labelled so a Delta Dental rule never reaches a BCBS patient.
- Checklist/task content is business-operations data only (enforced by convention, documented in the checklists migration header).

## Stack

- **Frontend:** React 18 + Vite + TypeScript + Tailwind + shadcn/ui, TanStack Query, React Router (`BrowserRouter` in `App.tsx` — do not add a second router).
- **Backend:** Supabase (Postgres, Auth, RLS, Edge Functions on Deno, pgmq queues). ~60 tables, 200+ RLS policies as of 2026-07.
- **Email:** Lovable email infra — React Email templates → `enqueue_email` RPC → pgmq queues → `process-email-queue` dispatcher. See Email system.
- **AI:** `fof-assistant` / `kimi-agent` edge functions (Kimi K3 office agent) + `assistant-auditor` second-model verification.
- **Mobile:** Capacitor + `vite-plugin-pwa`.
- **Tests:** vitest (248+ as of 2026-07), including print-invariant snapshot tests.

## How code changes ship (read before pushing)

| Route | What happens | Watch out for |
|---|---|---|
| **Lovable prompt** | Commits to `main`, **deploys edge functions**, **applies migrations**, updates preview | Less deterministic; verify what it actually changed |
| **Direct GitHub push** (CLI, MCP, web editor) | Code lands on `main` and syncs into Lovable's editor | **Edge functions are NOT deployed. Migrations are NOT applied.** You must deploy/apply manually |
| **Claude Code PR** | Merge applies code; migration notes are in the commit message | Same manual-deploy caveat as direct pushes unless the author verified live |

**The #1 operational landmine:** a new edge function pushed outside Lovable returns
`{"code":"NOT_FOUND","message":"Requested function was not found"}` at runtime, surfacing in the UI as
"Failed to send a request to the Edge Function." Fix by deploying it (Lovable prompt, dashboard paste, or `supabase functions deploy <name> --project-ref lfiplzmxpmybtbzhmnkp`). Full probe procedure in `docs/runbook.md`.

Manual steps that only exist in dashboards (no code representation): Supabase Auth signup toggle, Site URL + redirect URLs, sender-domain DNS verification in Lovable email settings, the `process-email-queue` cron schedule, the auth hook pointing at `auth-email-hook`.

## Application map (every route)

All routes except `/auth`, `/accept-invite`, `/privacy`, and `/.lovable/oauth/consent` are behind `ProtectedRoute`, which requires an authenticated user **and** allowlist membership (`isAllowed`), wrapping pages in `AppLayout` (nav + `NotificationBell`).

### Destinations (the navigation — see `docs/product-blueprint.md` §4)

Navigation is a compact destination list; every feature below keeps its own route and is reached through a destination hub. The clock lives in the global time control (`GlobalTimeControl`): a header chip on desktop, a sticky bar above the bottom nav on mobile.

| Route | Page | What it does |
|---|---|---|
| `/` | Dashboard (Home) | Role-personalized launchpad: attention items, spotlight, restrained progress summary |
| `/workplace` | Workplace | Hub: time, attendance, PTO, calendar, policies, goals, training, team |
| `/playbook` | Playbook | Hub: huddle, checklists, close the day, incidents, FOF, Ask AI |
| `/inbox/:tab` | InboxPage | Unified Inbox: Messages, Doctor Requests, Nudges (legacy `/messages`, `/requests`, `/nudges` redirect here) |
| `/management` | Management | Manager/owner command center: approvals, snapshots, vitals, admin links |
| `/help` | Help | Help & support surface |

### Time & attendance
| Route | Page | What it does |
|---|---|---|
| `/timesheet` | Timesheet | Clock in/out, punch history, manager punch editing (`PunchEditorModal`), tardy reasons (`TardyReasonModal`, `TardyReviewModal`) |
| `/work-zones` | WorkZones | Geofenced zones for location-verified clock-in (`useGeoTracking`, `LocationStatusPanel`, `process-location-event`) |
| `/reports` | Reports | Payroll/attendance reporting; export via `export-report` |

### Time off
| Route | Page | What it does |
|---|---|---|
| `/days-off` | DaysOff | Days-off requests and calendar |
| `/pto` | PTO | PTO balances and accrual engine (`usePtoEngine`), requests (`PtoRequestModal`), corrections (`PtoCorrectionModal`) |
| `/my-requests` | MyRequests | Employee's own request history |
| `/approvals` | ApprovalQueue | Manager queue for PTO / corrections / change requests (`useApprovalCounts` badges nav) |

### Team & org
| Route | Page | What it does |
|---|---|---|
| `/team` | Team | Roster (`TeamEmployeeCard`), invites (`InviteEmployeeModal`), archived members |
| `/team/:employeeId` | EmployeeDetail | Per-employee detail: schedules, time, PTO |
| `/org-setup` | OrgSetup | First-run org configuration |
| `/settings` | Settings | Org settings, payroll settings, deposit settings, **WipeDataTool** (destructive — owner-only) |

### Office operations
| Route | Page | What it does |
|---|---|---|
| `/office-calendar` | OfficeCalendar | Shared calendar, office closures (`useOfficeClosures`), Google Calendar events (`google-calendar-events`) |
| `/checklists` | Checklists | Recurring office checklists — see Checklist data model |
| `/deposit-log` | DepositLog | **Close the Day**: the deposit log + branded print sheet, grown into the five-step closeout (money, vitals, local-only Privacy View Capture, staffing reality, seal) — see `docs/close-the-day-spec.md` |
| `/incident-reports` | IncidentReports | Incident reports with signature/review workflow + print sheet |
| `/important-numbers` | ImportantNumbers | Office contact directory with tabs |
| `/handbook` | OfficeHandbook | Office Handbook reader (Workplace policies + HR) over the shared `DocumentLibraryReader`; `/policy-manual` redirects here |
| `/insurance-desk` | InsuranceDesk | Insurance Desk reader (carrier manuals, Practice Playbook) over the same `DocumentLibraryReader` (`ingest-doc` indexes uploads) |
| `/morning-huddle` | MorningHuddle | Early stub — intended home for daily team huddle |

### Money & forms (FOF)
| Route | Page | What it does |
|---|---|---|
| `/fof` | FofBuilder | Fee Options Form builder — patient-facing financial option forms (largest page, ~113KB) |
| `/fof/templates` | FofTemplates | Saved FOF templates |
| `/fof/fees` | FofFees | Fee schedule management: office + carrier schedules, imports, per-code patient-facing names |

### Letters & Notes (office correspondence)
| Route | Page | What it does |
|---|---|---|
| `/letters` | LettersHub | Office-correspondence hub: write, school/work notes, saved letters, my signature, settings |
| `/letters/write` | WriteLetter | One-off letter on the canonical letterhead: composer + live preview, print without saving; save WORDING (with `{{placeholders}}`) to the library behind a PII scan + confirmation |
| `/letters/school-work-note` | SchoolWorkNote | Front-desk excuse note (School/Work). **No save button by design** — temporary values → print → clear |
| `/letters/library` | SavedLetters | Reusable office letters (use/edit/duplicate/archive); team writes gated by `correspondence_team_can()` RLS |
| `/letters/signature` | MySignaturePage | Self-service stored signature: draw / upload / **Create one for me** (generated from your own name); `allow_office_use` consent flag |
| `/letters/settings` | CorrespondenceSettingsPage | Manager settings: default closing, office signer, note wording, team library toggle, letterhead preview |

**One letterhead:** every printed letter (Broken Appointment letters included) renders through `OfficeLetterheadSheet` (`.letter-sheet` CSS, `.letter-print-root` portal). Practice identity comes only from `org_branding`. Print checks: `scripts/letter-print-check.tsx`, `scripts/broken-appt-print-check.tsx`, `scripts/signature-generate-check.mjs`.

### Broken Appointments (`/broken-appointments`)
Decision-first front-desk workspace (no wizard): what happened + was there enough notice (+ history) → the rung, code, and instructions appear immediately; mailing info, Dentrix copy blocks, an interactive ledger checklist (stamped `CODE • MM/DD/YYYY • h:mm AM`, canonical staff codes from `employees.tag`), and the shared-letterhead letter preview all live on one continuous page. The business-hours calculator is optional. Printing appends an **OFFICE COPY — Broken Appointment Documentation** page (never for the patient) recording completed/incomplete actions. The PMS-aware capture assistant (`PmsCaptureDialog`, first profile: Dentrix via `src/lib/pms.ts`) reads the Address panel / Appointments table from a screen share or pasted screenshot with the local tesseract OCR stack — frames, crops, and OCR text live in memory only and are wiped on every exit path (`broken-appt-capture-privacy.test.ts`). The office's PMS is the canonical `org_practice_settings.pms_system` setting.

### Forms & Consents (`docs/consent-forms-spec.md`)
| Route | Page | What it does |
|---|---|---|
| `/consents` | ConsentsHub | Forms & Consents home: section doors, housekeeping widgets, sample-library install |
| `/consents/library` | ConsentLibrary | Searchable template library: filters, preview, duplicate, archive, print blank, upload & AI-convert |
| `/consents/builder/:formId?` | ConsentBuilder | Drag-drop block builder on one master print layout; drafts, publish with change notes, version history/compare/restore, AI drafting help (review-gated) |
| `/consents/bundles` | ConsentBundles | Treatment bundles: required/recommended/optional/conditional forms in default print order |
| `/consents/complete` | CompleteForms | Guided 6-step packet workflow (Treatment → Forms → Patient Details → Financial → Review → Print). **Patient values live in component memory only** and clear after printing, on leave, and on the office's inactivity timeout |
| `/consents/settings` | ConsentSettings | Team permissions, signature rules, privacy timeout, financial-form choice, template audit trail |

### AI
| Route | Page | What it does |
|---|---|---|
| `/assistant` | Assistant | FOF Assistant chat (teach it office knowledge), **Memory & Audit** tab for conflicts and auditor findings |

### Auth & public
| Route | Page | What it does |
|---|---|---|
| `/auth` | Auth | Sign in / sign up (branded Purple Envelope) |
| `/privacy` | Privacy | Public Privacy & Terms (same document acknowledged in onboarding) |
| `/accept-invite` | AcceptInvite | Public. Token-lookup → sign up or sign in → accept |
| `/.lovable/oauth/consent` | OAuthConsent | Lovable OAuth consent screen |

## Access & security model

- **Invite-only.** Supabase instance-level sign-up is **enabled** (required so invitees can create accounts); the app stays closed because `useAuth` runs `is_allowed_user()` (SECURITY DEFINER RPC) on every session and immediately signs out anyone not in `allowed_users`.
- **`allowed_users` is seeded two ways:** `send-org-invite` inserts the email at invite time (so the account can sign in the moment it's created), and `accept-invite` inserts on acceptance (belt-and-braces).
- **Roles:** `org_members.role` ∈ `owner | manager | employee`, `status = active`. "Admins" in RLS policy names = owner + manager.
- **RLS helpers** (SECURITY DEFINER): `is_org_member(org_id)`, `is_org_admin(org_id)`, `is_allowed_user()`. Use them in new policies — do not write recursive policies that query the protected table itself.
- **The anon key in `.env` is public by design** (it ships to every browser). Security = RLS, not key secrecy.

## The invite pipeline (end to end)

1. **UI:** `InviteEmployeeModal` → `supabase.functions.invoke('send-org-invite', { email, role, origin })`.
2. **`send-org-invite`** (`verify_jwt = true`):
   - Validates email + role (`employee|manager` only — owners are never created by invite).
   - Authenticates the caller's JWT; authorizes via `org_members` (active owner/manager). **Org is derived from the caller's membership — never from the client.**
   - Reuses a live pending invite for the same org+email (unexpired, unaccepted) instead of stacking duplicates; otherwise inserts into `org_invites` (7-day expiry, token generated DB-side).
   - Pre-seeds `allowed_users` (skip if present).
   - Ensures an `email_unsubscribe_tokens` row for the recipient.
   - Logs `email_send_log` (status `pending`) **before** enqueueing, then `enqueue_email` RPC → `transactional_emails` queue with an `idempotency_key`.
   - **Graceful degradation:** if token/email prep or enqueue fails, it still returns 200 with `{ success: true, emailed: false, link, warning }` so the manager can share the link manually. The UI has a copy-link fallback for this.
   - Sender: `Purple Envelope <noreply@purpleenvelope.app>`; `sender_domain: notify.purpleenvelope.app`; link host allowlist in `ALLOWED_ORIGINS` (purpleenvelope.app, www, timekeepers.me, www, localhost:5173/8080), fallback `https://purpleenvelope.app`.
3. **`process-email-queue`** (cron) sends it — see Email system.
4. **Acceptance:** `/accept-invite?token=…` → `accept-invite` function (`verify_jwt = false` — the token IS the secret; lookup mode needs no auth). Accept mode verifies email match + expiry, creates the `org_members` row, links/creates the `employees` row, inserts `allowed_users`, marks `accepted_at`.

History worth knowing: Lovable commits `075b18c` (invite email/link flow), `4e8cb2c` (auto-accept bug), `266b5f0` (pending invite state) fixed real bugs in this flow — read them before redesigning it.

## The email system

Two pgmq queues, one dispatcher:

| Piece | Role |
|---|---|
| `auth-email-hook` | Supabase **auth webhook** (signature-verified via `LOVABLE_API_KEY`). Renders React Email templates from `supabase/functions/_shared/email-templates/` (signup, invite, magiclink, recovery, email_change, reauthentication), logs pending, enqueues to **`auth_emails`**. Also serves `/preview` (Bearer `LOVABLE_API_KEY`) for template previews |
| `send-org-invite` and future transactional senders | Enqueue to **`transactional_emails`** |
| `process-email-queue` | **Cron-driven dispatcher** (service-role bearer only, `verify_jwt = true`). Dequeues both queues, calls `sendLovableEmail`, updates `email_send_log` |
| `email_send_log` | Statuses: `pending → sent | failed | rate_limited | dlq | suppressed`. First stop for any "email didn't arrive" report |
| `email_unsubscribe_tokens` + suppression list | Unsubscribe handling; suppressed addresses are never sent |

Dispatcher behavior: `MAX_RETRIES = 5`, message TTL, rate-limit aware, dead-letters to DLQ after retries exhaust.

**Constants (both `auth-email-hook` and `send-org-invite` agree):** `SITE_NAME = "Purple Envelope"`, `FROM_DOMAIN = "purpleenvelope.app"` (visible From: `Purple Envelope <noreply@purpleenvelope.app>`), `SENDER_DOMAIN = "notify.purpleenvelope.app"` (must be DNS-verified — SPF/DKIM — in Lovable email settings or nothing sends), `ROOT_DOMAIN = "purpleenvelope.app"`.

**Hard dependency:** if the `process-email-queue` cron is not running, *no email of any kind sends*. Queue entries just accumulate.

## Checklist data model (exact — the end-of-shift gate builds on this)

Migration `20260723200000_checklists.sql`:

- `checklists` — named lists; `audience` ∈ `all | manager` (manager lists are admin-only via RLS).
- `checklist_items` — `cadence` ∈ `daily | weekly | monthly | yearly`; `per_person` (true = every teammate gets their own checkbox; false = one shared box, app records who checked it); `is_active`.
- `checklist_completions` — one row per completion keyed by **`period_key`** (Eastern-local): `YYYY-MM-DD` daily, `week-YYYY-MM-DD` (Monday) weekly, `YYYY-MM` monthly, `YYYY` yearly. `UNIQUE(item_id, period_key, completed_by)`.
- Policies: members read; admins manage; you can only check/uncheck your own box (admins can clear anyone's for mistake-fixing).
- Hook: `useChecklists.ts`. The clock connection is the **end-of-shift gate** (`docs/goals-and-bypass-spec.md` Prompt 2): `useGuardedClockAction` intercepts an explicit **End shift** while daily per-person items are open (rule in `src/lib/checklist-gating.ts`, mirrored byte-for-byte in `supabase/functions/_shared/` and re-verified server-side by `checklist-bypass`, which records the bypass and notifies manager + owner).

## Clock semantics — a break is not the end of the day

Migration `20260812190000_punch_semantic_kinds.sql`: `punches.punch_kind` ∈ `clock_in | break_start | break_end | shift_end` (NULL = no stated intent: pre-migration rows, imports, GPS auto-punches, manual corrections). `punch_type` (`in`/`out`) stays the mechanical pairing the hours math runs on; `punch_kind` is what the member **said** they were doing — the UI offers **Break** and **End shift** as separate actions, and the meaning is never inferred from time of day, schedule, hours worked, or punch count.

Rules (`src/lib/clock-status.ts`, tested in `src/test/clock-semantics.test.ts` + `src/test/guarded-clock-action.test.tsx`):

- Only `shift_end` runs checklist enforcement (`shouldInterceptForChecklist`). A break never opens the bypass dialog, never records a `checklist_bypasses` row, never notifies anyone, and leaves checklist progress untouched.
- The first `in` of a day is `clock_in`; any later `in` is `break_end` — structural, never time-based.
- `finalClockOutAt` is the only sanctioned meaning of "gone for the day" (a `break_start` never counts; an unknown-kind `out` counts only while it is the day's last punch). `useMessagesCloseout` uses it so notes that land during lunch stay owed.
- GPS auto-punches carry no kind — presence, never intent — and never trigger (or dodge) enforcement.

## AI features

- **FOF Assistant** (`/assistant` + `fof-assistant`, `kimi-agent`, `mcp` functions): chat that staff teach office knowledge to. Memory in `assistant_memories`.
- **Contradiction guard:** a new "fact" that contradicts existing knowledge is saved `pending` (kept out of every prompt) and the assistant states both versions and asks an owner/manager which is right. Every write is re-checked by a separate cheap model — a model that was just persuaded of something is a poor judge of contradiction. The checker **fails open** so a checker outage can never block teaching.
- **`assistant-auditor`** (second AI, never talks to staff): verifies consistency and filing — contradicting standing facts, code notes in the wrong home, code knowledge stuck as chat memory. Findings are **fingerprinted** so re-runs never re-report open/dismissed items, and it **proposes** fixes rather than applying them. Surfaced on Assistant → Memory & Audit tab.
- **Code notes** (`save_code_note` tool): two homes (office schedule vs carrier schedule — see HIPAA boundary). The tool **refuses to create a missing fee row** — an invented fee could reach a patient's form.
- **Docs Q&A:** `ingest-doc` / `ask-docs` for policy manual / office documents.

## FOF (fee forms) domain

- Fee schedules: office schedule + per-carrier schedules (`useFeeSchedules`); imports via `parse-pdf` / `confirm-import`. CDT codes are canonical — the Altus incident (migration `20260729190000`) is the cautionary tale: a numeric spreadsheet column stripped the `D` prefix from 693 codes, silently breaking carrier matching *and* creating false collisions with custom numeric office codes. The importer now zero-pads and offers to restore the `D` (default on).
- `fof_code_names`: per-CODE patient-facing name overrides (staff free text — printed but never sent to AI; see HIPAA boundary). Members read everything, edit nothing; the code dialog opens read-only ("View only") for employees.
- Printed FOF, Deposit Log, and Incident Report sheets share letterhead/branding via `BrandPrintStyle` + `ScaledPrintPreview`.

## Printing (house rules)

- Print from a dialog requires hiding **every `<body>` child except the print root** — Radix portals dialogs as *siblings* of `#root`, so hiding only `#root` prints the dialog. This was the incident-report print bug (`225b37f`); don't regress it.
- Print-invariant snapshot tests cover FOF, Deposit Log, Incident Report — printed output must not drift.
- **Letters are one component.** Anything that prints as an office letter goes through `OfficeLetterheadSheet` + the `.letter-print-root` portal — never a per-feature letterhead. Signature images inside the letter must stay `display: inline-block` (a block-level replaced element makes Chromium's print fragmentation emit a phantom trailing page — see `scripts/letter-print-check.tsx`).

## Database conventions

- Migrations in `supabase/migrations/` (timestamped; a few semantically named from 2026-07-22 onward). The repo's migration history *is* the schema documentation — read it before writing SQL.
- `update_updated_at_column()` trigger maintains `updated_at` on tables that have it.
- Core early tables (Feb 2026 migrations): orgs, org_members, employees, allowed_users, time entries, schedules, PTO, notifications.

## Edge functions (JWT gating per `supabase/config.toml`)

`verify_jwt = true` means the gateway requires a valid user JWT: `send-org-invite`, `process-email-queue`, `fof-assistant`, `kimi-agent`, `assistant-auditor`, `name-visits`, `consent-ai`.
`verify_jwt = false` does **not** mean unauthenticated — each does its own verification (webhook signature, service-role bearer, invite-token-as-secret): `accept-invite`, `auth-email-hook`, `ask-docs`, `ingest-doc`, `confirm-import`, `export-report`, `mcp`, `parse-pdf`, `process-location-event`, `parse-treatment`.
**Adding a function? Add its `[functions.<name>]` block to `config.toml` in the same commit, or the gateway default may not match the function's own auth model.**

## Known issues & landmines

1. **`allowed_users` RLS infinite recursion (42P17).** A policy on `allowed_users` queries `allowed_users`. The app works because access goes through the SECURITY DEFINER `is_allowed_user()` bypass, but any *direct* table access (dashboard query with user role, future policy joining it) can 500. Fix: rewrite the policy to use a SECURITY DEFINER helper. Identified 2026-07, not yet fixed.
2. **Rebrand incomplete.** Auth page, `index.html`, and email sender say Purple Envelope; nav labels, PWA manifest, printed-form footers, and email template internals may still say TimeVault/TimeKeeper. Sweep pending.
3. **`SAMPLE_PROJECT_URL` in `auth-email-hook` still points at `clock-wise-keeper.lovable.app`** — preview-mode sample data only, harmless, but looks wrong.
4. **Dashboard-only state** (signup toggle, Site URL, cron, DNS) drifts silently — re-verify after any auth/email incident. See `docs/runbook.md`.
5. **MorningHuddle is a stub.** Don't assume huddle features exist.

## Roadmap / specs in `docs/`

- [`docs/close-the-day-spec.md`](docs/close-the-day-spec.md) — Close the Day + Schedule Intelligence: the three-layer architecture (local-only Schedule Reader / deterministic Metrics Referee / Office Coach), the Privacy View Capture boundary, and the metric vocabulary. **Built.** OCR assets are vendored at build time (`scripts/vendor-tesseract.mjs`, `public/tesseract/` gitignored).
- [`docs/goals-and-bypass-spec.md`](docs/goals-and-bypass-spec.md) — Goals page ("Pathfinder" AI breakdown, team + private goals, AI-drafted meeting updates) and the checklist-bypass accountability loop. **Being built in Lovable now.**
- [`docs/team-onboarding.md`](docs/team-onboarding.md) — Team onboarding feature list (next major build after Goals), including the stealth work-style questions that feed Pathfinder.

## Local development

```sh
npm i
npm run dev      # vite, localhost:5173 (in the invite ALLOWED_ORIGINS)
npm run test     # vitest
```

Environment: committed `.env` holds the public Supabase URL + anon key (public by design — RLS is the perimeter). Edge-function secrets (`SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY`) live only in Supabase.
