# Employee handbook reader

Both handbook paths use Purple Envelope's Archivo headings, purple accents, and the app's shared background/card tokens. The header has no decorative image. Uploaded documents remain the fallback when no published policy library is available.

The reader supports searchable content, nested contents, mobile navigation, accessible focus and current-section state, source-authored HTTP links, and semantic Markdown tables. Table headers repeat in print; rows keep their cells together. Ordinary prose is not interpreted as a table without an explicit Markdown separator. Tables retain column relationships when converted into policy drafts or legacy structured manuals.

Corrected source text appears once. There is no duplicate raw-text disclosure or hardcoded office-specific content in the application. Actual office source corrections belong in the office's document data, using its original Google Doc for table cells and numbered lists. Source links and historical fee dates stay with that office's content. Clinical photo examples remain in the source document.

Recognized section labels link to existing PTO, Morning Huddle, Checklists, Incident Reports, and Broken Appointments routes. These are navigation aids; they do not change office submission instructions. Standalone section numbers join short colon-ended headings while retaining their source anchors.

## Validation

Checked desktop and narrow-screen layouts, source table cell correspondence, numbered photo instructions, links, search, and duplicate-content removal. Typecheck, targeted tests, and build are run for each change. The initial PR also passed GitHub's full test-and-build workflow using the locked dependencies. Final physical printer pagination remains printer-dependent.

No publication rules, permissions, acknowledgments, or policy categories are changed by the reader. Local office-content fixtures and screenshots are excluded from the repository.
