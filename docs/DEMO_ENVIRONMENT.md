# Demo / Sales Environment — Recommended Design

**Status: design only.** Nothing in this document is implemented yet, and no
demo fixtures exist in production code paths. This is deliberate: seeding a
realistic office touches auth, service-role tooling, and scheduled jobs, so it
deserves its own isolated change with its own review — not a rider on a
dashboard correction pass.

## Goals

- Demo Purple Envelope as a realistic, *established* dental office: several
  staff roles, weeks of attendance history, a sprint in progress, goals,
  acknowledgments, management decisions, completed wins, inbox examples,
  accountability examples.
- Zero contact with customer data. No fake rows in real orgs, ever.
- No PHI anywhere (the product stores none by design; the demo must not
  invent any either — fictional staff only, no patient records).
- Dashboard components must never silently fall back to demo values.

## Recommended architecture: a flagged demo org in the production stack

Create one dedicated org (e.g. **"Lakeside Dental (Demo)"**) in the normal
production database, plus:

1. **`orgs.is_demo boolean not null default false`** — the single source of
   truth. Nothing else in the schema changes. RLS already isolates orgs, so a
   demo org can no more leak into a customer org than any other org can.
2. **Demo member accounts** — real auth users with strong random passwords
   (owner, manager, 4–6 team members with operational roles: front desk,
   hygienist, dental assistant, office manager). Held by the sales team; never
   shared with customers as writable logins. If prospects need hands-on access,
   mint a fresh throwaway demo org per prospect (see §Reset).
3. **A `seed-demo-org` Edge Function (service role)** that:
   - refuses to run unless the target org has `is_demo = true` — this is the
     hard safety interlock, checked server-side;
   - generates the fictional dataset *relative to today* (attendance history
     for the trailing 6 weeks, a sprint ending next week, a goal mid-month,
     two pending approvals, one accountability record at manager review, a few
     inbox notes), writing through the same tables the product already uses so
     every surface renders from real records;
   - is idempotent: it wipes and re-seeds only rows belonging to the demo org.
4. **A nightly schedule** (Supabase cron → the same function) so the demo
   office never goes stale: "yesterday" always has punches, the sprint is
   always in flight, the trend always has history. A demo you don't maintain
   decays into exactly the empty states we designed onboarding for.

### Why not a separate Supabase project?

A second project would also work and gives the strongest isolation, but it
doubles migration upkeep (every schema change must be applied twice or the
demo drifts) and requires a second deployment target for edge functions. The
flagged-org design gets equivalent *data* isolation from RLS that already
exists, keeps one migration history, and the `is_demo` interlock keeps the
seeder pointed only at demo orgs. If the company later sells into markets
where "demo data in the production database" is a procurement objection,
promote the same seeder to a dedicated project — the function is org-scoped,
so it ports unchanged.

### What stays forbidden

- No `is_demo` branches inside dashboard components or hooks. The demo org
  renders through exactly the production code path; if a surface looks empty
  in the demo, the fix is better seed data or a better empty state — never a
  hardcoded fallback.
- The `/design-review` fixture surface (static view-model fixtures, refuses to
  render on production hosts) remains a design tool, not a sales demo, and its
  fixtures must stay un-importable from authenticated code.
- No fictional *patients*, appointments, balances, or clinical anything. The
  seeded office is staff-operations only, same as the product.

## Reset / per-prospect sandboxes (later, optional)

If sales wants prospects to click around themselves: add a small internal tool
that clones the demo org (`create org with is_demo = true` + run seeder),
hands out one throwaway login, and archives the org after N days. Same
interlock, same seeder, no new surface area in the product.

## Implementation checklist (for the future PR)

- [ ] Migration: `orgs.is_demo` + comment.
- [ ] `supabase/functions/seed-demo-org` with the `is_demo` interlock and
      deterministic fictional roster (obviously fictional names).
- [ ] Cron schedule for the nightly refresh.
- [ ] A test asserting the seeder refuses non-demo orgs.
- [ ] A grep-style test asserting no `is_demo` reads exist under
      `src/components/` or `src/hooks/` (no silent demo fallbacks).
