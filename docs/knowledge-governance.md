# Governed Knowledge Architecture

## Purpose

Purple Envelope separates uploaded source documents from the office's canonical Policy Handbook and Practice Playbook.

An uploaded PDF, Word export, or pasted manual may be incomplete, outdated, duplicated, or internally inconsistent. It can be evidence for a policy or procedure, but it is not automatically the office's published truth.

## Core concepts

### Source evidence

Existing `office_docs` and `office_doc_chunks` remain the source-document and search layer. They support extraction, source review, and AI grounding.

### Canonical knowledge

`knowledge_items` identifies a policy or procedure. Each item has one or more `knowledge_versions` containing version-owned metadata and structured `knowledge_blocks`.

A policy publishes to the Office Handbook. A procedure publishes to the Practice Playbook.

### Workflow

A version moves through this controlled lifecycle:

1. `draft`
2. `in_review`
3. `approved`
4. `published`
5. `superseded` or `retired`

The author cannot approve their own version. Publishing is separate from approval so an approved change is never made visible accidentally.

Reviewed and published versions are immutable. A future change creates a new revision copied from the latest published version.

## Security model

- Every knowledge row is organization-scoped.
- Authenticated clients have read access through RLS.
- Authenticated clients do not have direct insert, update, or delete access to governed tables.
- All authoring, review, and publication writes use guarded `SECURITY DEFINER` RPCs.
- RPCs verify the caller's active organization membership and role.
- A workflow trigger rejects forged approved or published rows even if a future grant is accidentally added.
- Employees can read only the current published version targeted to their role.
- Owners and managers can read drafts, review versions, evidence, and approval history.
- Anonymous users have no knowledge-table access.

## Tenant and location boundaries

Creation requires an explicit organization ID from the active application context and verifies membership in that organization. It never selects an arbitrary first membership.

The initial product experience remains single-location. Organization-scoped data and consistent foreign keys preserve a clean path for small owner-led multi-location groups without exposing DSO complexity in the UI.

## Structured blocks

Supported block types:

- Heading
- Paragraph
- Bulleted list
- Numbered list
- Callout
- Procedure steps
- Table
- Script
- Checklist
- Image note
- Divider

Structured blocks keep procedures scannable and allow future targeted features such as acknowledgments, training links, print layouts, and AI citations without reparsing one large markdown document.

## Application surfaces

### Management Knowledge Workspace

Route: `/management/knowledge`

Owners and managers can:

- initialize dental-specific Handbook and Playbook categories
- create policy or procedure drafts
- target published visibility by role
- edit structured blocks
- submit a draft for review
- approve or request changes
- publish approved versions
- create a new revision from a published version

### Office Handbook

Route: `/handbook`

Once an office publishes governed policies, the Handbook displays the canonical published copy. Until then, the existing uploaded-document reader remains as a migration-safe fallback.

### Office Procedures

Route: `/playbook/procedures`

Published procedures appear as the office's searchable procedure library. The Practice Playbook home continues to link to live tools such as checklists, closeout, forms, and the Insurance Desk.

## Migration and deployment sequence

1. Review and merge the code and migrations.
2. Apply the migrations in timestamp order.
3. Regenerate Supabase TypeScript types.
4. Remove `src/integrations/supabase/knowledge-client.ts`, which is a temporary isolated type bridge for unapplied migrations.
5. Run typecheck, tests, build, and the repository RLS verification script.
6. Test the full author-review-publish flow with separate users.
7. Confirm employee-role visibility before publishing the application.

No automatic conversion of existing office documents occurs in this foundation. Migration into canonical knowledge must be reviewable and human-confirmed.

## Verified branch state

At branch head `e6ebdaa95681cc284cf386cadc9bb5576c34a771`:

- TypeScript typecheck: 0 errors
- Test suite: 60 files, 764 tests, 0 failures
- Production build: successful
- ESLint on all new knowledge paths: 0 errors, 0 warnings
- Independent read-only RLS and migration audit: no merge blocker remaining
