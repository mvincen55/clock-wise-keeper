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
- [ ] Form recreation: offices upload their existing photocopied paper forms; AI rebuilds them cleaner and better laid out using the office's own logo and information. Reformat and clean up layout only — never rewrite legal or consent language. Overlaps the existing Consent Forms scope (templates persist, filled forms never do).
- [ ] Office content engine: generate the things offices otherwise overpay a marketing company for, grounded in that office's own voice and policies — new patient welcome letters, post-op instructions, financial policy explanations, job postings, responses to reviews. Same machinery as the training modules.
- [ ] Website copy audit: upload a link, AI reports what's weak and hands back rewritten copy the office can give to whoever maintains their site. Words only — no hosting, no DNS, no deployment.
- [ ] Training modules save to the office's shared library, never attached to an individual's record. The manager/AI conversation that generated a module is never persisted. Modules must read as generic training a stranger could use.
- [ ] Escalation: build the two tracks as separate records, not one record with a status field. Track 1 is the employee's threshold (their own business, visible to them). Track 2 is the manager failing to act within the agreed window (a management matter between manager and owner, never surfaced to the employee).
- [ ] Employee sees the date their threshold was flagged, so a delayed conversation never arrives out of nowhere. They do not see the manager's timer.
- [ ] Owner's escalation notification must read as a management item about the manager, not as an attendance report — otherwise the owner bypasses the manager and hollows out their authority.
- [ ] Close the loop upward: when an item sits unactioned with the owner, the manager can see it. Accountability shouldn't stop at the person who bought the software.

## Business

- [ ] Update the Purple Envelope marketing site with current positioning. Headline: run like a DSO without selling your practice. Subhead: communicating without having to remember to communicate.
- [ ] Yankee Dental Congress 2027 (Jan 28-30, Boston) — decision gate. Call MDS re: exhibit space deadline and deposit terms. Buy the booth only if 5 paying offices are signed by November; otherwise attend as a walker and target 2028.
- [ ] Pricing: flat per-office tiered by headcount, annual prepay discount, setup fee.
- [ ] Training billing: included monthly allowance in the base plus overage, never per-use. Per-use billing puts a toll booth in front of the feature at the exact moment it's needed.
- [ ] Measure real generation cost before pricing the allowance — generate ten real training programs and read the actual bill.
- [ ] Introductory pricing must be time-boxed in writing and the post-intro number said out loud at signup. Never let "intro" drift into "grandfathered forever" for the first customers.
- [ ] Positioning for the office manager, not just the doctor: "gives your office manager the follow-through system they've never had." The OM is usually the evaluator and champion; a pitch that reads as replacing them creates an opponent.

## Infrastructure

- [ ] Verify the GitHub repo can be cloned and run locally, independent of Lovable.
- [ ] Weekly pg_dump to storage outside Supabase, so a backup survives loss of the Supabase account itself.
- [ ] Status page and a stated support window before offices depend on this for payroll.

## Principles

- The AI is that office. It is trained on that office's own material and how that doctor thinks — never pooled across offices. Onboarding is showing it, then teaching it.
- Use retrieval over that office's own documents, not per-office fine-tuning. It is cheaper, maintainable across many offices, and it lets us say truthfully that an office's data is never used to train a model.
- Encode their process. The AI never tells an office the way they've been doing things is wrong.
- Improvement suggestions come from that office's own data ("your Tuesday closeout gets skipped 60% of the time"), never from outside best practice.
- The system never implements something illegal (e.g. auto-deducting a break that wasn't taken). That is the line — we do not police what happens off-system, and we do not lecture.
- Defaults are the product. Users will not configure it.
- Notification restraint is a feature. Too many and they ignore all of them.
- Anything requiring consistent manual upkeep will fail, because upkeep is the thing the buyer can't do.

## Someday

- [ ] Full website generation and deployment. Parked — the value customers pay for is the deploying, not the writing, and taking that on means owning hosting, DNS, state dental board advertising rules, and a public support surface.
