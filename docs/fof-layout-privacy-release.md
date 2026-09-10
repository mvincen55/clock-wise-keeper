# FOF layout and assistant privacy follow-up

Follow-up to main f036e24e (PR #166). Preserve the prior audit changes to
account isolation, reviewed screenshot imports, and navigation warnings.

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

Office-wide AI guidance now reads the selected practice's active office code-bank
notes and standing wording rules. Requests accept only the office ID, never the
current plan or a patient-selected subset of codes. Drafts cite real code-bank rows;
wording/grouping is applied locally, and conflicts with saved payment classifications
require a staff decision before printing. Shared guidance does not change fee or
collection rules. Refreshing guidance preserves explicit edits to the current form.

The Current form channel answers supported total/payment/grouping/insurance/code-note
questions directly from the live browser calculation. It is intentionally local,
with no model request, chat persistence or live carrier eligibility lookup. Unsupported
questions say what can be answered. General Office knowledge uses the remote model,
with separate history; only that channel supports explicitly enabled Training.

Screenshot OCR now uses same-origin Tesseract assets in the browser, with no remote
fallback. Staff compare the extracted rows with the local screenshot before import.
Ambiguous codes, teeth or money stop the whole import. Fee and Office columns remain
distinct; the existing office-fee precedence still applies. Names/form changes and
reset invalidate pending imports. The retired parse-treatment endpoint returns 410
without reading or forwarding an image, and name-visits rejects legacy patient plans.

Validation: application TypeScript, production build, changed Deno endpoint check,
FOF grouping/layout/browser-privacy tests, and actual endpoint tests for role,
Training, context exclusion, forced writes, and the office-only guidance contract.
Combined local suite: 1,698 passed, 53 skipped, one unchanged Broken Appointments
provider-dropdown timeout (also present in the baseline). Actual browser OCR was
verified with synthetic treatment rows while external requests were blocked.
Chromium PDF checks cover one-page short/standard plans,
two-page plans with 8 and 16 independent groups and long treatment wording, and an
oversized 32-group plan that requests review. Fresh CI must pass before merge.

Release: deploy `fof-office-guidance`, `name-visits`, `parse-treatment`, and
`kimi-agent` with their shared modules from the merged revision, then publish the
frontend. No migrations are needed. Use the existing practice logo configuration.
