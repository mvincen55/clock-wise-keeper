# FOF layout and assistant privacy follow-up

Based on main c760d641 (including PR #165). Preserve the audit changes to
account isolation, complete screenshot imports, and navigation warnings.

Patient payment options use a compact prepay summary and a full-width schedule.
Treatment names appear once beside their collection milestones, using names such as
"Implant Crown #5" and "Implant Surgery #2 and #7" from the actual treatment fields.
Related procedures
on the same tooth can span appointments within one payment group; explicit staff
grouping takes precedence. Surgery and restoration remain separate. Every charge,
allocation, and collection event remains accounted for by the existing cents engine.
Patient wording uses procedure/tooth information and can be corrected locally;
appointment numbers are not used as treatment names.
Separate active groups with identical patient-facing names require correction
before printing. The editor supports distinct treatment/tooth labels or combining
procedures into one confirmed course; it does not invent missing tooth information.

Patient pages are measured in the browser at print width. A single page is tried
at each supported spacing/layout before considering two pages. Two-page plans split
only between treatment groups, repeat the office/patient header, and keep the total,
terms and signatures together on the final page. The Office Copy is separate.
An excessive plan that cannot fit two readable pages requires layout review;
the Print action does not print a clipped or incomplete payment schedule.
The presentation stays in memory, follows nested edits, and discards stale content
in hidden print portals. It adds no storage or network calls.

Patient names remain browser-memory-only. The assistant uses the current name
locally to reject accidental mentions, clears conversation on patient/office changes,
and discards late replies for the previous conversation. Form context is not sent
to the assistant; the server ignores it from older clients too. Identifier checks
are defense in depth, not a HIPAA de-identification certification. No BAA is in place.

FOF Training defaults off and requires an owner or manager to turn it on. All
knowledge-write tools enforce that permission at execution, including forced tool
calls. Detected patient-specific rules are rejected. Dynamic system text is scrubbed
and gateway error bodies are not logged. General policy/code questions still work.

Automatic AI drafting from code-bank notes and live patient-specific FOF/insurance
Q&A are not part of this release. Experimental draft code was excluded. No storage
adapter, migration, patient record, fee schedule, or office policy is changed.

Validation: application TypeScript, production build, changed Deno endpoint check,
FOF grouping/layout/browser-privacy tests, and actual endpoint tests for role,
Training, context exclusion, and forced writes. Combined local suite: 1,652 passed,
53 skipped, one unchanged Broken Appointments provider-dropdown timeout; eight
additional endpoint tests passed separately. The first PR revision passed both fresh
CI and the database/edge release gate. The final layout revision adds seven page
composition regressions. Chromium PDF checks cover one-page short/standard plans,
two-page plans with 8 and 16 independent groups and long treatment wording, and an
oversized 32-group plan that requests review. Fresh CI must pass before merge.

Release: deploy `kimi-agent` with its shared modules from the merged revision,
then publish the frontend. No migrations are needed. PR #165's four endpoints
were already deployed separately; do not revert or redeploy older source.
