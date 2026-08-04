# Guided Practice Setup

## Purpose

Practice Setup helps an independent dental office turn its existing manuals, loose files, and inherited documents into an organized Policy Handbook and Practice Playbook.

It is deliberately not an automatic policy publisher. Uploaded documents are source material. They may be outdated, duplicated, filed in the wrong place, or contain several unrelated topics. Purple Envelope may suggest and structure the work, but an owner or manager must decide what each source actually is.

## Route

`/practice-setup`

Owners and managers reach it from the Management hub.

## Workflow

### 1. Scan existing sources

Practice Setup inventories the office's current `office_docs` and records a stable setup source for each one.

It suggests one of five actions:

- Handbook policy
- Playbook procedure
- Source reference only
- Exclude from setup
- Needs a human decision

Suggestions use the source's existing library placement, collection, title, and extracted character count. Suggestions are not decisions.

### 2. Surface cleanup findings

The scan flags:

- possible duplicate titles
- likely library-placement mismatches
- documents with no readable extracted text
- large mixed manuals that should be broken into focused items

Resolved and dismissed findings remain history. A later scan may open a new finding if the underlying condition still exists.

### 3. Human-confirm the destination

An owner or manager selects the real action and, for policies or procedures, the destination category.

A policy must use a Handbook category. A procedure must use a Playbook category. The database enforces that boundary.

### 4. Create a governed draft

A confirmed policy or procedure can be converted into an editable governed draft.

The conversion:

- reads the already-extracted source chunks
- removes chunk overlap
- maps headings, paragraphs, lists, and steps into structured knowledge blocks
- creates a source-evidence citation back to the original document
- leaves the new version in `draft`

It does not approve or publish the content. The normal second-person review, approval, and publication workflow still applies.

Large sources above 120,000 characters or conversions above 180 blocks are rejected on both the client and database. They must be split into focused office knowledge instead of becoming one giant manual entry.

## Source deletion behavior

Running Practice Setup does not make every uploaded document permanent.

- An unconverted scanned source may still be deleted. Its setup inventory row follows the deletion.
- A source cited by a governed draft or published version is protected by the knowledge-evidence foreign key and cannot be silently removed.
- The document database record is deleted before its storage object. A protected database deletion fails before storage is touched.
- Storage cleanup failure after a successful database deletion is returned as a cleanup warning rather than pretending the document record still exists.

## Security model

- Setup tables are organization-scoped and protected by RLS.
- Authenticated clients receive SELECT access only.
- All setup writes use guarded `SECURITY DEFINER` RPCs.
- Every RPC verifies that the caller is an active owner or manager in the exact organization being changed.
- Converted item and version IDs are tied together with a composite foreign key.
- Cross-organization source, category, item, version, finding, or session references are blocked.
- No setup action can create an approved or published knowledge version.

## Tables

- `practice_setup_sessions`
- `practice_setup_sources`
- `practice_setup_findings`
- `practice_setup_finding_sources`

## RPCs

- `initialize_practice_setup(p_org_id)`
- `confirm_practice_setup_source(p_source_id, p_action, p_category_id)`
- `convert_practice_setup_source(p_source_id, p_title, p_summary, p_blocks)`
- `resolve_practice_setup_finding(p_finding_id, p_status)`

## Deployment sequence

1. Merge and apply the complete governed-knowledge migration stack first.
2. Apply Practice Setup migrations in timestamp order.
3. Regenerate Supabase TypeScript types.
4. Remove the temporary `practice-setup-client.ts` bridge after generated types include the new schema.
5. Run frozen install, typecheck, tests, build, lint, and RLS verification.
6. Test with separate owner, manager, and employee users.
7. Confirm that source conversion creates only a draft and that employee users cannot see it.
8. Confirm that deleting an unconverted source succeeds and deleting a cited source fails without removing storage.

No production migration or deployment occurred while this branch was built.

## Verified branch state

At executable branch head `bff0e51574d2c91c815671597c1c3ad13862405e`:

- Frozen install: passed
- TypeScript typecheck: 0 errors
- Test suite: 61 files, 773 tests, 0 failures
- Production build: successful, with existing chunk-size warnings only
- ESLint on Practice Setup and touched integration paths: 0 errors, 0 warnings
- SQL/RLS audit: no merge blocker
