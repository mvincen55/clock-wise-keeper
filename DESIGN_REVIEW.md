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

No changes to auth logic, allowlist, protected routes, `?next=`, role storage,
RLS, edge functions, or any product route.

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
