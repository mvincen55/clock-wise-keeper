# Time Keeper — Roadmap

Running list of future product and business work. Not tracked in the app database; this file is the list.

## Before first paying customer

- [ ] Independent third-party security review of multi-tenant isolation (RLS policies across all tables). Highest-priority spend.
- [ ] Enable point-in-time recovery on Supabase before any outside office holds data here.
- [ ] Separate staging from production so schema changes are never tested against the live office database.
- [ ] Stripe Checkout + subscription status field on the org record.
- [ ] Internal "create org" provisioning flow so onboarding a new office takes minutes, not a day.
- [ ] Terms of Service, including what happens to an office's data if they cancel (export on exit).
- [ ] Tech E&O + cyber liability insurance.

## Product

- [ ] One-off / ad-hoc task type in the checklist model. Every checklist_item currently requires a recurring cadence (daily/weekly/monthly/yearly). There is no way to represent a single task that happens once and is done.
- [ ] Escalation engine: threshold trigger -> auto-generated manager task -> HR record -> notify doctor if it sits unresolved. Depends on the one-off task type above.
- [ ] Self-serve signup for new offices. Not before roughly customer 12 — hand-provision until then and learn what breaks.

## Business

- [ ] Update the Purple Envelope marketing site with current positioning. Headline: run like a DSO without selling your practice. Subhead: communicating without having to remember to communicate.
- [ ] Yankee Dental Congress 2027 (Jan 28-30, Boston) — decision gate. Call MDS re: exhibit space deadline and deposit terms. Buy the booth only if 5 paying offices are signed by November; otherwise attend as a walker and target 2028.
- [ ] Pricing: flat per-office tiered by headcount, annual prepay discount, setup fee.

## Infrastructure

- [ ] Verify the GitHub repo can be cloned and run locally, independent of Lovable.
- [ ] Weekly pg_dump to storage outside Supabase, so a backup survives loss of the Supabase account itself.
- [ ] Status page and a stated support window before offices depend on this for payroll.