# FOF layout and assistant privacy follow-up

Based on main c760d641 (including PR #165). Preserve the audit changes to
account isolation, complete screenshot imports, and navigation warnings.

Patient payment options use a compact prepay summary and a full-width schedule.
Treatment names appear once above their collection milestones. Related procedures
on the same tooth can span appointments within one payment group; explicit staff
grouping takes precedence. Surgery and restoration remain separate. Every charge,
allocation, and collection event remains accounted for by the existing cents engine.
Patient wording uses procedure/tooth information and can be corrected locally;
appointment numbers are not used as treatment names.

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
additional endpoint tests passed separately. Fresh CI must pass before merge.

Release: deploy `kimi-agent` with its shared modules from the merged revision,
then publish the frontend. No migrations are needed. PR #165's four endpoints
were already deployed separately; do not revert or redeploy older source.
