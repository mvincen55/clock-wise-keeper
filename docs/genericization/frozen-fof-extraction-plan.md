# Frozen FOF — Extraction Plan (scope only, nothing built)

A standalone, frozen copy of the Financial Options Form as it existed
**before the genericization refactor**, gifted to the practice: no AI
anywhere, its own site, its own Supabase under the practice's own
account, **zero shared infrastructure with the product and zero
recurring cost to the product's owner, ever**. This document is the
Phase-0-style plan; decisions the owner must make are collected at the
end.

## 1. Fork point

**`a9b5da8`** — the last pre-Phase-1 code state on `main` (merge of
PR #74). Verified to still contain the bundled `harelick-logo.png`, the
hardcoded practice identity, and all pre-refactor behavior. (`b40738e`
adds only the Phase 0 audit doc; the frozen copy shouldn't carry
genericization docs, so `a9b5da8` is the cleaner base.)

Fork method — **recommend a fresh single-commit repository** ("Initial
import from clock-wise-keeper @ a9b5da8"), not a fork with history:

- The git history contains the deposit account number and other
  office-specific values in many commits; a frozen gift has no need to
  carry them (the deposit log isn't even in the frozen scope).
- A frozen artifact has no use for history; the source SHA in the
  commit message preserves provenance.

## 2. What stays (the FOF core and what it drags along)

| Layer | Kept |
|---|---|
| Pages | `FofBuilder`, `FofTemplates`, `FofFees`, `Auth`, `NotFound` |
| FOF components | `FofPrintSheet`, `FofTemplateEditor`, `FeeImportDialog` (XLSX import — no AI) |
| FOF lib | `src/lib/fof/*` (compute, insurance, visits, discounts, cdt, money, defaults, types) — minus `ai.ts` |
| Print system | `.fof-*` rules in `index.css`, print portal mechanism, `harelick-logo.png` |
| Auth & org | `useAuth` (as of a9b5da8, with the 2-email client allowlist — see Decision D3), `useOrgContext`, `allowed_users` model |
| Data hooks | `useFofTemplates`, `useFeeSchedules`, `useFofBundles` |
| UI kit | `src/components/ui/*` (shadcn), `AppLayout` **stripped to the FOF nav items only** |
| DB tables | `orgs`, `org_members`, `allowed_users`, `fee_schedules`, `fee_schedule_items`, `insurance_plans`, `fof_settings`, `fof_templates`, `fof_bundles` + the RLS helper functions (`is_org_member`, `is_org_admin`, `is_allowed_user`) |

## 3. What is removed entirely

**Every model-dependent feature, with its UI affordances:**

| Removed | What replaces it |
|---|---|
| `name-visits` edge fn + "AI name payments" / auto-polish | Payment names remain plain editable text inputs (they already are — the override fields stay; the AI autofill button goes) |
| AI treatment summary autofill | The treatment text box is already a manual textarea; it simply never autofills |
| `fof-assistant` edge fn + `FofAssistantWidget` + `fof_ai_guidance` table | Removed; no replacement |
| `parse-treatment` (PMS-screenshot import — AI vision) | Screenshot import button removed; codes are typed or XLSX-imported |
| `ask-docs`, `ingest-doc`, Policy Manual, office docs storage | Removed |
| `mcp` edge fn + `src/lib/mcp` | Removed |

**Every non-FOF feature** (they're not part of the gift and each drags
infrastructure): time tracking/timesheets/punches/imports (`parse-pdf`,
`confirm-import`, `process-location-event`, `export-report`), PTO,
days-off/approvals/team/reports, Deposit Log, checklists, important
numbers, morning huddle, office calendar (`google-calendar-events`),
email infra (`auth-email-hook`, `process-email-queue`, email tables) —
Supabase's built-in auth emails replace the custom hook. Invites
(`accept-invite`) go with it; users are added by inserting into
`allowed_users` + creating the auth user in the Supabase dashboard
(Decision D3).

Result: **zero edge functions**, zero storage buckets, zero external
API keys. The app is a static Vite bundle talking to Supabase
PostgREST/auth only.

## 4. Deployment

- **Supabase**: a new project in the practice's own Supabase
  organization, on the **free tier**. Footprint is trivial (a few
  hundred rows, no storage, no functions). Free-tier caveat: projects
  **pause after ~7 days without traffic** and need a one-click restore
  in the dashboard. Weekly use keeps it awake (Decision D4).
- **Hosting**: static site (Vite build) on the practice's own account
  with any free static host — Netlify, Vercel, or Cloudflare Pages.
  Recommend Cloudflare Pages (no sleep, generous free tier, simple
  custom-domain flow) (Decision D5).
- **Build/deploy flow**: since it's frozen, one manual build and
  drag-and-drop upload is enough; no CI, no connected repo required
  (connecting the repo for one-click redeploys is optional).
- **Repo**: private repo under the practice's (or a personal) GitHub —
  archived (read-only) after the initial import, with a README stating
  it's frozen and what SHA it came from.

## 5. Data seeding

One-time copy from the live product database into the new Supabase (a
SQL dump of just the kept tables' rows for the Harelick org, with new
UUIDs optional): fee schedules + items, insurance plans, FOF templates,
FOF settings, bundles, `allowed_users`, the org + membership rows.
Captured **at gift time** — after that the two systems intentionally
diverge; there is no sync (that's what frozen means).

## 6. Zero-cost / zero-tie guarantees

- Practice's own Supabase org, own hosting account, own (optional)
  domain — nothing bills the product owner.
- No Lovable project, no AI gateway keys, no shared secrets: every
  external dependency of the fork is npm packages at build time.
- The only shared thing is git ancestry.

## 7. Decisions needed (before Monday)

- **D1 — Fork method**: fresh single-commit repo (recommended, keeps
  the account number and office history out) vs. full history fork.
- **D2 — Screenshot import**: confirm dropping the PMS-screenshot
  import entirely (it is AI-vision; without it, codes come from typing
  or XLSX import). Alternative — keep the button but have it error —
  not recommended.
- **D3 — Auth/user model**: keep the a9b5da8 model (2-email client
  allowlist + `allowed_users`) as-is, or take the Phase 1 allowlist fix
  (server-side check only) as the **one** cherry-picked change so
  additional staff can be added without code edits? Cherry-picking one
  commit slightly bends "frozen" but removes the only code-edit-required
  admin task. Recommend cherry-picking it.
- **D4 — Supabase tier**: free (pauses after ~7 idle days, manual
  restore) vs. Pro (~$25/mo **paid by the practice**) for no pausing +
  backups. Recommend starting free; upgrade is a click if pausing
  annoys them.
- **D5 — Host + domain**: which static host, and whether it gets a
  custom domain (e.g. `fof.drharelick.com`, DNS managed by the
  practice) or the host's free subdomain.
- **D6 — Who administers**: which practice person owns the Supabase +
  hosting accounts and gets the (documented, one-page) runbook for
  restoring a paused project and adding a user.
- **D7 — Gift timing / data snapshot date**: the fee schedules and
  templates are copied once; pick the date (presumably right before
  handoff so it matches the live product's current configuration).

## 8. Execution outline (once decisions land — est. one focused session)

1. Fresh repo from `a9b5da8` (per D1), README + frozen notice.
2. Delete removed pages/functions/hooks; strip nav; remove AI buttons
   and the assistant widget; drop unused deps (`@lovable.dev/*`, xlsx
   stays).
3. Collapse migrations to one schema file covering only the kept
   tables + RLS, verified against the kept code paths.
4. New Supabase project (practice account) → apply schema → seed data
   dump; configure auth (email/password, no signups).
5. `npm run build` → deploy to the chosen host; smoke-test: sign in,
   build an FOF from a template, print both copies, XLSX fee import.
6. Print comparison against the live product's output for the same
   inputs (the pre-Phase-1 code IS the reference implementation, so
   this is a sanity check, not an invariant).
7. Archive the repo; hand over the runbook.
