import type {
  ConsentBlock,
  ConsentBundle,
  ConsentForm,
  ConsentTemplateContent,
} from './types';

/**
 * Error prevention for the Forms & Consents module. Pure functions over
 * template content so the builder, library, and bundle editor can all show
 * the same warnings — and the tests can pin them down.
 */

export interface TemplateWarning {
  code:
    | 'no_signature'
    | 'no_consent_statement'
    | 'financial_without_cost'
    | 'needs_review'
    | 'unpublished_changes'
    | 'no_procedures'
    | 'page_overflow'
    | 'empty_form';
  message: string;
  severity: 'warning' | 'info';
}

const CONSENT_CATEGORIES = new Set([
  'general_consent', 'surgical_consent', 'restorative', 'endodontic',
  'periodontal', 'implant', 'orthodontic', 'sedation',
]);

/** Categories where a missing procedure link is expected, not a gap. */
const PROCEDURE_FREE_CATEGORIES = new Set(['office_policy', 'financial', 'other']);

export function templateWarnings(
  form: Pick<ConsentForm, 'category' | 'isFinancial' | 'needsReview' | 'status' | 'procedureCodes' | 'currentVersion'> & { hasDraft?: boolean },
  content: ConsentTemplateContent | null,
): TemplateWarning[] {
  const warnings: TemplateWarning[] = [];
  const blocks = content?.blocks ?? [];

  if (blocks.length === 0) {
    warnings.push({ code: 'empty_form', severity: 'warning', message: 'This form has no content yet.' });
    return warnings;
  }

  const hasSignature = blocks.some(b => b.type === 'signature');
  if (!hasSignature) {
    warnings.push({
      code: 'no_signature',
      severity: 'warning',
      message: 'No signature line — the printed form cannot be signed.',
    });
  }

  if (CONSENT_CATEGORIES.has(form.category)) {
    const hasStatement = blocks.some(b => b.type === 'section' && b.kind === 'consent_statement');
    if (!hasStatement) {
      warnings.push({
        code: 'no_consent_statement',
        severity: 'warning',
        message: 'No consent statement section — add one before using this form clinically.',
      });
    }
  }

  if (form.isFinancial && !blocks.some(b => b.type === 'cost')) {
    warnings.push({
      code: 'financial_without_cost',
      severity: 'warning',
      message: 'Financial form without a treatment cost field.',
    });
  }

  if (form.needsReview) {
    warnings.push({
      code: 'needs_review',
      severity: 'warning',
      message: 'Converted by AI and not yet reviewed — review before publishing.',
    });
  }

  if (form.status === 'published' && form.hasDraft) {
    warnings.push({
      code: 'unpublished_changes',
      severity: 'info',
      message: 'Has unpublished changes — the printed form still uses the last published version.',
    });
  }

  if (form.procedureCodes.length === 0 && !PROCEDURE_FREE_CATEGORIES.has(form.category)) {
    warnings.push({
      code: 'no_procedures',
      severity: 'info',
      message: 'Not connected to any procedure — it will not be recommended automatically.',
    });
  }

  const overflow = pagesLikelyToOverflow(blocks);
  if (overflow.length > 0) {
    warnings.push({
      code: 'page_overflow',
      severity: 'warning',
      message: `Page ${overflow.join(' and ')} likely runs past 8.5 × 11 — add a page break or shorten the content.`,
    });
  }

  return warnings;
}

/** Case-insensitive duplicate names across the active library. */
export function duplicateFormNames(forms: Pick<ConsentForm, 'name' | 'status'>[]): Set<string> {
  const seen = new Map<string, number>();
  for (const form of forms) {
    if (form.status === 'archived') continue;
    const key = form.name.trim().toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return new Set(
    [...seen.entries()].filter(([, count]) => count > 1).map(([name]) => name),
  );
}

export interface BundleWarning {
  code: 'archived_form' | 'unpublished_form' | 'missing_form' | 'no_required';
  message: string;
}

export function bundleWarnings(
  bundle: ConsentBundle,
  formsById: Map<string, ConsentForm>,
): BundleWarning[] {
  const warnings: BundleWarning[] = [];
  for (const item of bundle.items) {
    const form = formsById.get(item.formId);
    if (!form) {
      warnings.push({ code: 'missing_form', message: 'A form in this bundle no longer exists.' });
      continue;
    }
    if (form.status === 'archived') {
      warnings.push({ code: 'archived_form', message: `“${form.name}” is archived but still in this bundle.` });
    } else if (form.currentVersion === 0) {
      warnings.push({ code: 'unpublished_form', message: `“${form.name}” has never been published — it prints from its draft.` });
    }
  }
  if (bundle.items.length > 0 && !bundle.items.some(i => i.requirement === 'required')) {
    warnings.push({ code: 'no_required', message: 'This bundle has no required forms.' });
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Print fit estimation
// ---------------------------------------------------------------------------

/**
 * Rough lines-per-page model for the printed sheet (7.5in × 10in at ~10pt):
 * enough to warn before a signature block lands off the page, without
 * pretending to be a layout engine. The print CSS still keeps signature
 * areas and headings unsplit; this catches the "way too much on one page"
 * case ahead of time.
 */
const LINES_PER_PAGE = 54;
const CHARS_PER_LINE = 92;

export function estimateBlockLines(block: ConsentBlock): number {
  const textLines = (text: string | undefined) =>
    text ? Math.max(1, Math.ceil(text.length / CHARS_PER_LINE)) : 0;
  switch (block.type) {
    case 'title': return 3;
    case 'section': return 2 + textLines(block.body);
    case 'instruction': return 1 + textLines(block.body);
    case 'paragraph': return 0.5 + textLines(block.body);
    case 'bullets':
    case 'medications':
      return (block.items ?? []).reduce((sum, item) => sum + textLines(item), 1);
    case 'checkbox': return 1 + textLines(block.label);
    case 'yesno': return 2;
    case 'short_answer':
    case 'date':
    case 'tooth_numbers':
    case 'procedure':
    case 'provider':
    case 'patient_name':
    case 'cost':
      return 2;
    case 'long_answer': return 4;
    case 'initials': return 2;
    case 'signature': return 4;
    case 'logo': return 4;
    case 'divider': return 1;
    case 'page_break': return 0;
    default: return 1;
  }
}

/** Split blocks into explicit pages at page_break markers. */
export function splitIntoPages(blocks: ConsentBlock[]): ConsentBlock[][] {
  const pages: ConsentBlock[][] = [[]];
  for (const block of blocks) {
    if (block.type === 'page_break') {
      pages.push([]);
    } else {
      pages[pages.length - 1].push(block);
    }
  }
  return pages.filter((page, i) => page.length > 0 || i === 0);
}

/** 1-based page numbers whose estimated content exceeds one sheet. */
export function pagesLikelyToOverflow(blocks: ConsentBlock[]): number[] {
  // The letterhead costs ~6 lines on page 1; footers cost ~2 on every page.
  return splitIntoPages(blocks)
    .map((page, i) => {
      const chrome = i === 0 ? 8 : 2;
      const lines = page.reduce((sum, b) => sum + estimateBlockLines(b), chrome);
      return { page: i + 1, lines };
    })
    .filter(p => p.lines > LINES_PER_PAGE)
    .map(p => p.page);
}
