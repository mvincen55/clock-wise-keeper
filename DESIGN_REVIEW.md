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
