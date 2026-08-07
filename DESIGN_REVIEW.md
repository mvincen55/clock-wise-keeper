# Design review — second pass (editorial redesign)

TEMPORARY review artifact. Delete this file, `src/pages/DesignReview.tsx` and the
`/design-review` route in `src/App.tsx` when the review is signed off.

## Version

- Redesign version: **v2 — editorial second pass**
- HEAD at capture time: `2d357a7de474201e34aba0012f0f9893d2d25085`
  (the v2 changes below are committed on top of it by this turn; the new SHA is
  the latest commit in project history once this turn is saved)
- Preview route index: `/design-review` (blocked on production hostnames)
- Production was **not** published.

## What changed visually

| Surface | Before | After |
| --- | --- | --- |
| Type | Fraunces serif display | Archivo heavy grotesque, tight tracking, oversized scale |
| Corners | Rounded 8–999px | Sharp 0–2px everywhere on marketing |
| Home | Two-column SaaS hero + card grids | Full-width oversized headline, purple envelope field, ruled numbered index bands |
| Login | Card + soft brand panel | Purple/paper split with envelope mark and "for independent dental offices" |
| Start | White card form | Purple masthead + ruled intake sheet with underline fields |
| Security | Six-card grid | Three evidence sections: verified now / explicit boundary / not yet, as ruled rows |

Brand spine ("independent dental offices", "no DSOs", "You shouldn't need thirty
locations to run a tight ship") is now in the header rule and the first band
below the hero.

## Files changed

- `src/index.css` — Archivo/Inter, `pe-display`, `pe-blueprint`, `pe-row`, sharp-corner tokens
- `tailwind.config.ts` — display font family
- `src/marketing/EnvelopeMark.tsx` — new sharp Y-fold mark
- `src/marketing/primitives.tsx` — `BandHead`, `Btn`, `Shell`, `Reveal`
- `src/marketing/MarketingLayout.tsx` — ruled nav + editorial footer
- `src/marketing/RoleSelector.tsx` — tab strip + ruled rows
- `src/pages/marketing/Home.tsx` — recomposed
- `src/pages/marketing/Start.tsx` — intake sheet on the real `submit-lead` backend
- `src/pages/marketing/Security.tsx` — evidence-led recomposition
- `src/pages/Auth.tsx` — split-screen sign-in + real Supabase password reset
- `src/pages/DesignReview.tsx` — new, preview-only
- `src/App.tsx` — `/design-review` route only

Existing product plumbing (auth, allowlist, protected routes, `?next=`, role
storage, RLS, product routes) is preserved. The public inquiry infrastructure
(`submit-lead` edge function + `marketing_leads` table) was **added** by the
earlier hardening pass and is retained — see the corrective pass below.

## Evidence (captured from the running build)

Screenshots are attached to this conversation and stored under
`design-review/` in the documents artifacts:

`home-desktop.png`, `home-mobile.png`, `login-desktop.png`, `login-mobile.png`,
`login-forgot-mobile.png`, `start-desktop.png`, `start-mobile.png`,
`security-desktop.png`, `security-mobile.png`, `design-review-desktop.png`,
`design-review-mobile.png`

## Verification run

| Check | Result |
| --- | --- |
| TypeScript (`tsgo -p tsconfig.app.json`) | clean |
| Production build (`npm run build`) | built in 24s, no errors |
| Test suite (`vitest run`) | 1026 passed / 1 failed — `goal-events-rls` only, it shells out to `psql` which is unavailable in this sandbox; unrelated to the redesign |
| Horizontal overflow at 1440px and 390px on `/`, `/login`, `/start`, `/security`, `/design-review` | none |
| Forgot password (mobile 390px) | toggles to reset view, "Send reset link" present, "Back to sign in" returns |
| Protected route | `/training` → `/login?next=%2Ftraining` |
| `/start` validation | required-field errors render inline, submit blocked |
| Direct navigation to each route | renders (SPA fallback handled by Lovable hosting) |

## Preview freshness note

The stale project screenshot and the auth-bridge redirect on the `id-preview`
URL are Lovable platform-side artifacts, not project configuration — there is no
`_redirects`/hosting config in this repo that affects them, and the app itself
has no gate on `/`, `/login`, `/start` or `/security` (verified above by loading
each route unauthenticated). Forcing a rebuild from the newest commit is what
refreshes them; if the id-preview still shows a login bridge, that is Lovable
preview visibility, and the same build is reproducible locally with
`npm run dev`.

---

## Pass 3 — authenticated role dashboards

`/` (Home) is now three purpose-built role experiences instead of one card stack.

### Files added
- `src/components/dashboard/types.ts` — role view models (pure data contracts)
- `src/components/dashboard/kit.tsx` — editorial dashboard primitives (ruled rows, figure strip, hard progress bars, roster lines, masthead)
- `src/components/dashboard/useDashboardView.ts` — composes EXISTING hooks into the three view models (no new queries, tables, or rules)
- `src/components/dashboard/OwnerDashboard.tsx` — practice command center
- `src/components/dashboard/ManagerDashboard.tsx` — live operational cockpit
- `src/components/dashboard/MemberDashboard.tsx` — personal launchpad
- `src/components/dashboard/fixtures.ts` — design-review-only fixtures (obviously fictional names)
- `src/pages/DesignReviewDashboard.tsx` — preview route, production-host blocked

### Files changed
- `src/pages/Dashboard.tsx` — role routing + retained working surfaces
- `src/pages/DesignReview.tsx` — added role dashboard preview index
- `src/App.tsx` — `/design-review/dashboard/:role`

### Widgets backed by real existing sources
| Widget | Source hook |
| --- | --- |
| On the floor / roster / timeline | `useOrgAttendanceSnapshot` (`attendance_day_status`) |
| Approvals (PTO / corrections / changes) | `useApprovalCounts` |
| Records at owner/manager review, open records | `useOrgAccountabilityReports`, `useMyAccountabilityReports` |
| Policy acknowledgments overdue / unsigned | `useKnowledgeAcknowledgmentRoster`, `useMyKnowledgeAcknowledgments` |
| Goals / sprints progress | `useTeamGoals` |
| Collections pace + disruptions | `usePracticeVitals` (`deposit_logs`), only when a target is set and visibility allows |
| Open office notes | `useOfficeNudges` |
| Bypass reasons owed | `useUnresolvedBypasses` |
| Training open | `useTrainingAssignments` |
| Missing time (14 days) | `useMissingShifts` |
| PTO balance / tier | `useCurrentPtoBalance` |
| Day streak | `useMomentum` |
| Today's recorded time | `useTodayEntry` + `getRunningMinutes` |

### Intentionally omitted — data does not exist
Patient counts, scheduling/production/utilization, hygiene reappointment, revenue forecasting, write-offs, payroll cost, per-person "health scores", AR/collections aging. No invented metric appears anywhere.

### Role rules honoured
- Owners see no clock control (`roleClocksIn` already excludes owners; no clock card was added for anyone).
- Owner surface carries decisions/exceptions only — no manager task noise, no personal member widgets.
- Member surface renders only the member's own data plus permitted office context.
- Deep links `/?record=` and `/?sprint=` still resolve to `MyAccountabilityCard` / `SprintCard`.

### Verification
- Typecheck clean; production build succeeded (23.93s).
- Tests: 1026/1027 pass (the single failure is the pre-existing `psql` shell-out test that cannot run in this sandbox).
- No horizontal overflow at 1440px, 834px, or 390px for all three roles.
- No production publish performed.

### Screenshots
`design-review/{owner,manager,team}-{desktop,tablet,mobile}.png`

## Pass 4 — dual-axis personalization (permission tier × operational role)

Home is now composed from two independent dimensions. Permission tier sets the
dashboard **mission**; operational role(s) set the daily **work**. They are never
conflated, and a secondary role never widens permission.

### Files added
- `src/hooks/useMyOperationalRoles.ts` — resolves the signed-in user's primary/secondary operational roles from the existing `employee_operational_roles` table (including the `starts_on`/`ends_on` window, so "covering today" is real)
- `src/components/dashboard/opRoles.ts` — role module registry: label, mission, and shortcuts, each filtered by `minTier`
- `src/components/dashboard/charts.tsx` — hand-rolled SVG trend/completion visuals, sharp-cornered, each labelled with the question it answers
- `src/components/dashboard/scenarios.ts` — the design-review matrix (labels, data sources, omissions)

### Files changed
- `src/hooks/useOperationalRoles.ts` — added the existing `starts_on` / `ends_on` columns to the type and select
- `src/components/dashboard/types.ts` — `PermissionTier`, `RoleContext`, `RoleLane`, `Series`, `Shortcut`
- `src/components/dashboard/useDashboardView.ts` — builds role context, lanes, and the two chart series; fixed member time links to `/timesheet`
- `src/components/dashboard/kit.tsx` — `ViewContext`, `Lane`, `Lanes`, `ShortcutList`
- `src/components/dashboard/{Owner,Manager,Member}Dashboard.tsx` — render the chart and lanes
- `src/components/dashboard/fixtures.ts` — seven review compositions
- `src/pages/DesignReviewDashboard.tsx` — per-scenario labels, data-source table, omission list
- `src/pages/DesignReview.tsx` — index driven by the scenario matrix

### Primary + backup behaviour
- The primary role sets the lane emphasis and appears first, full width.
- Backup roles render a compact, clearly labelled **Also covering** lane, indented under a rule, with at most four shortcuts.
- A backup lane elevates time-sensitive items **only** when the assignment window covers today; otherwise it is marked `Backup — not assigned today` and stays quiet.
- The "My view: … / Also covering: …" line is a label, not a switch. It grants nothing; every shortcut is tier-filtered and every destination is still route- and RLS-guarded.
- No lane repeats a line already shown in the user's own open-items list.

### Charts (both from records the app already writes)
| Chart | Question | Source |
| --- | --- | --- |
| Arrivals, last 14 days | Are people getting here on time? | `attendance_day_status` via `useOrgAttendanceSnapshot` history |
| My recorded time, last 7 days | How is my week tracking? | own `time_entries`, self-scoped by RLS |

Every chart links into the workflow that resolves it. No decorative analytics, no
production/collections/patient/utilisation series — that data does not exist here.

### Review matrix — `/design-review`
| Scenario | Tier | Primary | Backup |
| --- | --- | --- | --- |
| `owner` | Owner | Dentist | — |
| `manager` | Manager | Office manager | — |
| `manager-front-desk` | Manager | Front desk | Office manager (covering today) |
| `front-desk` | Team member | Front desk | — |
| `hygienist` | Team member | Hygienist | — |
| `dental-assistant` | Team member | Dental assistant | — |
| `front-desk-backup-assistant` | Team member | Front desk | Dental assistant (covering today) |

Each preview page prints its own tier/primary/backup labels, the real hook behind
every widget, and what was deliberately omitted. Fixtures only: no session, no
permissions, no queries, and the route returns 404 on production hosts.

### Verification
- Typecheck clean.
- Tests: 1026/1027 (the single failure is the pre-existing `psql` shell-out test that cannot run in this sandbox).
- No horizontal overflow at 1440px, 834px, or 390px for all seven compositions.
- No production publish performed.

### Screenshots
`design-review/<scenario>-{desktop,tablet,mobile}.png` — 21 captures, seven scenarios × three widths.

---

## Pass 5 — Team Moments (lightweight positive recognition)

Authenticated-only feature. Preview evidence only; **not published to production**.

### What was added
- `supabase/migrations/*` — `team_moments`, `org_moment_settings`, `moment_prefs` with grants, RLS, and two guard triggers.
- `src/components/moments/reactions.ts` — closed positive reaction set + pure rules (validation, reveal planning, announcements, replay safety).
- `src/hooks/useTeamMoments.ts` — pending / history / send / mark-revealed / prefs. Kept separate from `useNotifications`.
- `src/components/moments/MomentEnvelope.tsx` — the Y-fold envelope opening.
- `src/components/moments/TeamMomentsReveal.tsx` — anchored reveal surface + live orchestrator.
- `src/components/moments/SendMomentDialog.tsx` — send / received / preferences.
- `src/components/AppLayout.tsx` — mounted the entry point (desktop + mobile headers) and the reveal.
- `src/index.css` — `.pe-moment-flap`, `.pe-moment-rise`, reduced-motion overrides.
- `src/pages/DesignReviewMoments.tsx` + routes in `src/App.tsx`, linked from `/design-review`.
- Tests: `src/test/team-moments.test.ts` (17), `src/test/team-moments-rls.test.ts` (12).

### Boundaries enforced in the database, not just the UI
| Rule | Where |
| --- | --- |
| Positive reactions only | CHECK constraint on `reaction` |
| Sender always named, never yourself | insert policy + two CHECK constraints |
| Same office only, both sides active | insert policy checks both employee rows against the row's `org_id` |
| Only recipient and sender can read | select policy — no `is_org_admin` hatch |
| Wording immutable after sending | `team_moments_guard_update` |
| Reveal write-once (idempotent across devices) | `team_moments_guard_update` keeps the first timestamp |
| Anti-spam (per hour, per pair per day) | `team_moments_before_insert` |
| Office switch, message toggle, expiry, retention | `org_moment_settings` |
| Personal mute / opt-out | `moment_prefs`, private to each person |
| No delete path | no delete policy |

### Screenshots (`design-review/`)
`moments-index-{desktop,mobile}.png`, `moments-single-{desktop,mobile}.png`,
`moments-multiple-{desktop,mobile}.png`, `moments-reduced-motion-{desktop,mobile}.png`,
`moments-muted-{desktop,mobile}.png` — desktop 1440×1000, mobile 390×844.

### Review routes
`/design-review/moments` · `/design-review/moments/single` · `/multiple` · `/reduced-motion` · `/muted`

### Deliberately not built
No leaderboard, score, streak, ranking, or "received fewer" analytics. No manager browse of moment text. No use of moments for corrective feedback, acknowledgments, or accountability escalation.

---

## Pass 5 — corrective pass (correctness + preservation, no redesign)

Base commit corrected: `b0743a7fe9df4c90b2c541bb095f54109e7bceb1`.
Final commit SHA: the commit created when this turn is saved (latest in project
history; `git log -1` at HEAD). Visual direction unchanged.

### 1. Restored deleted lead backend source

Recovered byte-for-byte from history (`git show 20134ac:<path>`), not rewritten:

- `supabase/functions/submit-lead/index.ts` — restored
- `supabase/migrations/20260807174927_7ecd8c33-5513-4b65-a5ce-ba095f988843.sql` — restored

Migration order verified: the file sorts after `20260807120000_letterhead_correspondence.sql`
and before `20260807193843_*.sql`, which is its original position in the chain.
`node scripts/verify-migration-files.mjs` → "Migration filename check passed for 153 migration(s)."

Preserved properties (all re-verified against the restored source and the live database):

| Property | Evidence |
| --- | --- |
| Service-role-only write path | function reads `SUPABASE_SERVICE_ROLE_KEY`; migration grants only `service_role`; policy `Service role manages marketing leads` is `TO service_role` |
| No public read | no `anon`/`authenticated` grant exists (`information_schema.role_table_grants` shows none); anon REST read of `marketing_leads` returns no rows |
| Input validation | name ≥ 2 chars, email regex; live 400 response returned both field errors |
| Honeypot | `body.company_website` → silent `{"ok":true}`, no row written (verified live, 200) |
| Per-email rate limit | 3/day — live attempts 1–3 accepted, attempt 4 returned 429 with the polite message (test rows deleted afterwards) |
| Per-IP rate limit | 5/hour, same code path, indexed by `idx_marketing_leads_ip_recent` |
| IP hashing | SHA-256 truncated to 32 chars; raw IP never stored |
| Configured notification destination | `LEAD_NOTIFICATION_EMAIL` secret only; with none set the lead is still stored and nothing is sent to an invented inbox |
| Safe notification content | all interpolated values pass through `escapeHtml` |

Client/function contract mismatch fixed: `src/pages/marketing/Start.tsx` posted
the honeypot as `website`; the function reads `company_website`. The client now
sends `company_website` (the hidden field itself is unchanged, so the honeypot
is not weakened).

New regression guard: `src/test/marketing-leads-backend.test.ts` (15 assertions)
fails if the function or migration is deleted again, if a grant to `anon`/
`authenticated` appears, if validation/honeypot/rate-limit/IP-hashing code is
removed, or if the client payload drifts from the function contract.

### 2. Security-claim evidence matrix (after correction)

| Public claim (current copy) | Enforcement | Verdict |
| --- | --- | --- |
| "Office data is isolated by row-level security … directly through an office column, or relationally through the employee record on some older tables" | `pg_policies` across public tables; legacy indirection also disclosed under LIMITS | Narrowed from "Every operational table is org-scoped" |
| "Access is invitation-only" | `public.is_allowed_user`, `allowed_users` policy, `src/hooks/useAuth.tsx` denial state | Kept |
| "Roles are enforced in the database" | security-definer `is_org_owner` / `is_org_admin` / `is_org_member` used inside policies | Kept ("never the control" → "not the control") |
| "A time correction preserves the original punch" (was: "punches are immutable") | policy `Org admin punches` is `FOR ALL`, so a privileged admin **can** update/delete rows; trigger `trg_audit_punch_change` (UPDATE, DELETE → `log_punch_change()`) records the change | **Corrected** — absolute removed, audited-privileged-change stated |
| "Published policy versions and acknowledgments are frozen" | `guard_knowledge_history_delete`, `guard_knowledge_version_workflow` | "immutable" → "frozen / guards reject edits" |
| "A record cannot be signed off by the person it is about" (was: "Nobody can review or approve their own record") | `countersign_accountability_report` and `countersign_incident_report` raise `A record cannot be signed off by the person it is about` | **Narrowed** to what the functions prove |
| "Private notes and direct messages are scoped to their participants" | `user_notes`: only `Notes are visible only to their author`; `messages`: only `Read messages in your conversations` (no admin read policy) | Kept — verified no owner/admin read hatch |
| "Integrity monitoring reads system signals, not message content" | `security_events` policies (`Admins read integrity events that are not about them`); no policy or job reads `messages.body` | Kept |
| "Free text sent to a model is classified and scrubbed first" (was: "Every model call uses the shared scrubber") | `supabase/functions/_shared/ai-allowlist.ts` + `phi-scrub.ts`, enforced by `src/test/phi-gateway-guard.test.ts` and `src/test/ai-gateway-boundary.test.ts` | **Narrowed** — allowlist classification for all callers, scrubbing for free-text surfaces |
| Home: "Private coaching and training conversations are not browsable by owners or managers" | contradicted by `training_attempts` policy `Org admins read attempt metadata` | **Removed** — Home now states admins can see attempts today and points to the security page |
| "Office forms are documents, not a patient database" | forms/consents stored as documents; no patient-record modelling or indexing | Kept as a boundary, not a compliance claim |
| Certifications / audits / BAA | none claimed anywhere | Unchanged |

### 3. Type tuning

Smallest marketing label/running-head sizes raised one step: `10px → 11px`,
`10.5px → 11.5px` across `src/marketing/*` and `src/pages/marketing/*`.
Miniature product mockups in `ProductVisuals.tsx` keep their smaller caption
scale on purpose. No other type, spacing or layout changed.

### 4. Files changed in this pass

- `supabase/functions/submit-lead/index.ts` (restored)
- `supabase/migrations/20260807174927_7ecd8c33-5513-4b65-a5ce-ba095f988843.sql` (restored)
- `src/pages/marketing/Start.tsx` — honeypot field name + type sizes
- `src/pages/marketing/Security.tsx` — claim corrections + type sizes
- `src/pages/marketing/Home.tsx` — training-privacy copy correction + type sizes
- `src/marketing/MarketingLayout.tsx`, `src/marketing/primitives.tsx`, `src/marketing/RoleSelector.tsx`, `src/pages/marketing/{About,Features,ForDental,Pricing}.tsx` — type sizes only
- `src/test/marketing-leads-backend.test.ts` (new)
- `DESIGN_REVIEW.md`

No authenticated-app plumbing changed in this pass (no edits under
`src/hooks`, `src/components/dashboard`, `src/pages/Dashboard.tsx`, routing,
or any other edge function).

### 5. Verification run

| Check | Result |
| --- | --- |
| Typecheck (`tsgo -p tsconfig.app.json`) | clean |
| Production build (`npm run build`) | built in 21.3s, no errors |
| Full test suite (`vitest run`) | 1070 passed / 1 failed — `goal-events-rls` only, pre-existing: it shells to `psql` under a sandbox role that cannot execute `is_org_member` |
| Migration order (`scripts/verify-migration-files.mjs`) | passed, 153 migrations |
| `marketing_leads` grants/RLS | no anon/authenticated grants; service-role-only policy; anon REST read returns nothing |
| `submit-lead` live behaviour | success 200 + id, validation 400 with field errors, honeypot 200 with no row, rate limit 429 on 4th same-email send |
| Routes at 1440px and 390px (`/`, `/login`, `/start`, `/security`, `/design-review`) | all render directly, correct H1s, no route-level console errors (only a pre-existing React `forwardRef` dev warning) |
| `/design-review` | still blocked on production hostnames, still absent from navigation and the footer |
| Review artifacts | fixtures are obviously fictional; no real employee, patient or office data in screenshots |
| Production publish | **not** published |

## Final corrective pass — delivery, retention, dashboard editing

- Atomic delivery: `TeamMomentsReveal` now renders only the batch returned by
  `claim_team_moments` (SECURITY DEFINER, `FOR UPDATE SKIP LOCKED`, 2-minute
  claim lease, office-membership checked) and confirms presentation with
  `open_team_moments` after paint.
  Guarantee, stated exactly: at most one device shows a moment at a time; if a
  device disappears before confirming, the lease expires and the moment
  returns. Not "exactly once" — never silently lost.
- Preferences are per office: `moment_prefs` PRIMARY KEY (org_id, user_id);
  every query key, read and upsert conflict target includes the active office.
- Retention: `cleanup_team_moments` (service_role only, nightly cron
  `team-moments-retention` at 03:20) deletes moments past the office's
  `history_retention_days`, default 180, floor 30. Message text is never read.
- Function execute grants tightened: claim/open = authenticated + service_role;
  cleanup = service_role only.
- Backup vs covering: `isCoveringOn` requires an explicit `starts_on`; undated
  secondary roles read as "Backup" only.
- Dashboard below the fold recomposed by tier (Owner: records & decisions;
  Manager: floor detail + own work; Team member: my work). No generic "Detail"
  band, no duplicated status rows. `?record` and `?sprint` deep links force
  their card in and scroll to it.
- Verification: typecheck clean, production build clean, 1097/1097 tests pass
  (86 files) including new `operational-coverage` and `team-moments-delivery`
  database suites. Production was NOT published.
