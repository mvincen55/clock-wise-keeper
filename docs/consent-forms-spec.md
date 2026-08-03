# Forms & Consents — architecture and privacy design

**Status: built** (branch `claude/purple-envelope-consent-forms-5dvry5`). Consent forms and the
financial-form workflow for dental offices: upload → convert → review → publish → bundle →
complete → print → clear.

## The founding constraint, applied here

Purple Envelope stores the business, never the patient. This module handles the most
patient-adjacent flow in the product, so the boundary is architectural, not procedural:

- **Stored:** templates (the office's own wording as typed blocks), published version history,
  bundles, office rules, and a template-activity audit trail.
- **Never stored:** patient names, tooth numbers, surfaces, diagnoses, signatures, balances,
  answers, or completed packets. The Complete Forms workflow keeps every typed value in
  `CompleteForms.tsx` component state (`PacketFill`). There is no save, no autosave, no draft
  table, no browser storage — enforced by the source-scan test in
  `src/test/consent-packet.test.ts`.
- **Clearing:** after "Yes, clear patient information" on the print step; on the office's
  configurable inactivity timeout (with a warning first, both settings in `consent_settings`);
  on manual clear; on refresh/close (memory-only + a `beforeunload` warning); on leaving the
  route (unmount).

## Data model (`supabase/migrations/20260803230000_consent_forms.sql`)

| Table | Holds | Writes |
|---|---|---|
| `consent_forms` | Template metadata + `published_content` + working `draft_content` | admins; team per `consent_team_can()` or per-form `editable_by='everyone'` |
| `consent_form_versions` | Immutable published snapshots (`UNIQUE(form_id, version)`) | insert-only; publishing never overwrites a prior version |
| `consent_bundles` / `consent_bundle_items` | Treatment bundles; item `requirement` ∈ required/recommended/optional/conditional + `condition_label` | admins or team with the bundles permission |
| `consent_settings` | One row per org: permissions, signature rules, privacy timeout, financial form choice | admins |
| `consent_audit_log` | Template activity + de-identified fee overrides (code + amounts) | members append, admins read; append-only |

`consent_team_can(org_id, perm)` is the SECURITY DEFINER helper RLS uses so the office's
permission toggles actually govern writes at the database layer. `consent_bundle_used()` bumps
the bundle popularity counter without granting Team members bundle-write access.

## Template model (`src/lib/consents/`)

Templates are `{ blocks: ConsentBlock[] }` — 21 block types (content, fields, signatures,
layout) rendered by **one master print layout** (`ConsentPrintSheet` + `.cf-sheet` CSS in
`index.css`). Offices edit content, not page design. Section blocks carry a structured `kind`
(risks, alternatives, consent statement…) so validation and AI review reason about meaning,
not wording. `page_break` blocks give offices explicit control; `pagesLikelyToOverflow()` warns
in the builder before a page prints wrong.

Signature/cost facts are derived from content on publish (`deriveSignatureFacts`) and
denormalized onto `consent_forms` for library filtering and the workflow's signature summary.
Per-form `hygienist_may_complete` plus org-level witness/guardian rules mean no signature
policy is hard-coded.

## Upload & conversion

Extraction is fully client-side (`src/lib/consents/extract.ts`): pdfjs text layer with local
OCR fallback (vendored tesseract — same assets as the Schedule Reader), images via OCR, DOCX
via a minimal zip reader + `DecompressionStream` (no new dependency). Only extracted **text**
of a **blank master form** (confirmed by checkbox) reaches `consent-ai`; the review screen
shows original and conversion side by side with Approve / Edit / Re-run / Save draft / Cancel.
Nothing is auto-published. When `consent-ai` is unreachable, `heuristicConvert()` produces a
reviewable draft locally and says so.

## AI boundary

`consent-ai` (verify_jwt = true, `requireUser`) is registered in
`_shared/ai-allowlist.ts` with handler **scrub**: every outbound message passes
`scrubMessages()`, so a filled form uploaded by mistake has person-level spans redacted at the
wire (`src/test/phi-gateway-guard.test.ts` enforces registration; `ai-gateway-boundary.test.ts`
enforces the scrub call). Drafting assists return suggestions the manager applies explicitly —
AI never overwrites office-approved language. The Complete Forms workflow sends **nothing**
to AI.

## Printing

`.consent-print-root` follows the house rule (hide every `<body>` child except the print root —
Radix portals). Sheets are 7.5 in × min 10 in letter pages (`@page consent`, 0.5 in margins),
brand-tinted via `BrandPrintStyle` (`--cf-navy`/`--cf-tint`), grayscale-safe, with page
numbers, version + published date in the footer, and `break-inside: avoid` on signature areas
and headed sections. Print-invariant snapshots live in `src/test/consent-print.test.tsx`.

## Demo content

`demo-content.ts` ships 13 templates (general, extraction, bone graft, SRP, sonic, root canal,
crown, implant, sedation, denture, financial agreement, post-op, medications) and the 5
bundles from the brief. Installed per-org by a manager ("Install samples" on the hub), flagged
`is_sample`, and banner-labeled on screen and on paper until reviewed. Integrity is pinned by
`src/test/consent-demo-content.test.ts`.

## Ship checklist (outside Lovable)

1. Apply `20260803230000_consent_forms.sql` (new tables — additive only).
2. Deploy `consent-ai` (`supabase functions deploy consent-ai --project-ref lfiplzmxpmybtbzhmnkp`).
   Until deployed, upload conversion falls back to the local engine and AI assist explains
   itself — nothing else in the module depends on the function.
3. `src/integrations/supabase/types.ts` was hand-advanced for the `structured_manual_parsing`
   migration (it had lagged, breaking typecheck); the next Lovable regeneration will overwrite
   it with identical truth plus the consent tables, after which the narrow cast in
   `src/lib/consents/db.ts` is redundant but harmless.
