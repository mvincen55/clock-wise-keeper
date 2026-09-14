# Employee handbook design

The handbook uses an opt-in warm-paper reading surface, deep purple accents, bold Archivo document titles, fine dividers, and a compact practice header. The existing uploaded reader remains the fallback until published policies are available. Policy titles and category assignments are not rewritten.

The uploaded reader retains nested contents, scroll tracking, full-text search, highlighting, editing permission checks, and its contextual assistant route. The published reader adds excerpts, literal match highlighting, a clear-search action, mobile contents, accessible current-policy state, and heading links. Unassigned policies appear directly in the contents without an invented category.

Terminology is Employee Handbook, Office Procedures, and Manage Policies & Procedures. The Practice Playbook hub retains its separate identity because it also contains operational tools.

## Illustration

`public/images/handbook/shared-table.jpg` is an original image generated with the built-in image generation tool, optimized to a 600 × 400 JPEG (approximately 32 KB). It is decorative, uses empty alt text, has explicit dimensions, and is omitted in print.

Generation prompt: “Create an original compact editorial illustration for the header of an employee handbook at an independent dental practice. A quiet tabletop still life: open handbook with blank pages, two simple chairs behind a communal table, a small leafy branch in a ceramic vessel. Architectural geometric shapes and elegant precise charcoal linework, sophisticated editorial print illustration. Warm off-white #faf8f4 background, deep purple #53406e selectively on book and one chair, pale sand accents. Landscape 3:2 composition, plenty of space around silhouette, no text, no lettering, no people, no teeth, no medical symbols, no gradients, no shadows. Must be legible displayed small at 150px wide.”

## Validation and limits

- Inspected the signed-in office handbook: it currently uses the uploaded reader with 40 sections.
- Reviewed both rendered paths on desktop and at 390px width. The uploaded preview used a local copy of the visible office text; the published preview used synthetic content. No office text was added to the repository.
- Checked nested section filtering, keyboard focus after navigation, current-section state, mobile contents, long content and titles, search excerpts and highlighting, and empty states.
- Applied the print rules in a local validation harness: all 432 uploaded content elements remain present; the reading pane expands to its full content height; navigation and imagery are hidden. Final physical pagination remains a browser/printer-specific check.
- Typecheck and changed-file ESLint pass; production build passes. The repository-wide lint report contains existing issues.
- Five new reader tests pass. With Node 25 experimental web storage disabled (`NODE_OPTIONS=--no-experimental-webstorage npm test`), 1,804 tests pass, 53 skip, and one unrelated appointment-workspace test times out. That same timeout is reproducible on the untouched base commit.
- Existing library, document formatting, policy workflow, and acknowledgment tests pass. Database hooks, policies, permissions, publishing RPCs, and acknowledgment data were not changed. No live edit, publication, or acknowledgment was submitted during validation.

## Management review

The existing uploaded handbook combines employment policies, patient policies, and office/clinical procedures. Some original uploaded tables and numbered processes are flattened in the extracted text. Separating this material into Employee Handbook and Office Procedures, repairing source extraction, and reconciling potentially inconsistent wording require management review. This change deliberately preserves the existing text and does not add process diagrams that could reinterpret it.

## Form readability follow-up

The uploaded Time Off Request Form now separates submission instructions from a single-column list of form fields. The original extracted field text remains available in an expandable section and expands automatically for matching searches. Stored source text is unchanged. Recognition is limited to a matching form heading and validated field boundaries; ambiguous sections retain normal rendering. The handbook uses Purple Envelope’s Archivo headings and monospaced labels instead of serif titles.

Recognized handbook section labels now link to existing PTO, Morning Huddle, Checklists, Incident Reports, and Broken Appointments routes. These navigation aids preserve the source submission requirements. No office-specific Google Drive URL is hardcoded into the shared reader. Standalone section numbers are visually joined to the following short colon-ended label while retaining both source anchors.
