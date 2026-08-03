/**
 * Error prevention for Forms & Consents: the warnings the builder, library,
 * and bundle editor all share, plus the page-fit estimator behind the
 * "likely to print incorrectly" warning.
 */
import { describe, it, expect } from 'vitest';
import {
  bundleWarnings, duplicateFormNames, pagesLikelyToOverflow, splitIntoPages, templateWarnings,
} from '@/lib/consents/validation';
import { makeBlock, type ConsentBundle, type ConsentForm } from '@/lib/consents/types';

const baseForm = {
  category: 'surgical_consent' as const,
  isFinancial: false,
  needsReview: false,
  status: 'published' as const,
  procedureCodes: ['D7140'],
  currentVersion: 2,
  hasDraft: false,
};

const solidContent = {
  blocks: [
    makeBlock('title', { label: 'Extraction Consent' }),
    makeBlock('section', { label: 'Consent', kind: 'consent_statement' }),
    makeBlock('signature', { role: 'patient' }),
  ],
};

describe('templateWarnings', () => {
  it('passes a well-formed consent silently', () => {
    expect(templateWarnings(baseForm, solidContent)).toEqual([]);
  });

  it('flags a missing signature and missing consent statement', () => {
    const codes = templateWarnings(baseForm, { blocks: [makeBlock('paragraph', { body: 'text' })] })
      .map(w => w.code);
    expect(codes).toContain('no_signature');
    expect(codes).toContain('no_consent_statement');
  });

  it('flags a financial form without a cost field', () => {
    const codes = templateWarnings(
      { ...baseForm, category: 'financial', isFinancial: true },
      solidContent,
    ).map(w => w.code);
    expect(codes).toContain('financial_without_cost');
  });

  it('flags unreviewed AI conversions and unpublished changes', () => {
    const codes = templateWarnings(
      { ...baseForm, needsReview: true, hasDraft: true },
      solidContent,
    ).map(w => w.code);
    expect(codes).toContain('needs_review');
    expect(codes).toContain('unpublished_changes');
  });

  it('flags a clinical form with no linked procedure, but not policies', () => {
    expect(
      templateWarnings({ ...baseForm, procedureCodes: [] as string[] }, solidContent).map(w => w.code),
    ).toContain('no_procedures');
    expect(
      templateWarnings(
        { ...baseForm, category: 'office_policy' as const, procedureCodes: [] as string[] },
        { blocks: [makeBlock('title', { label: 'Policy' }), makeBlock('signature', { role: 'patient' })] },
      ).map(w => w.code),
    ).not.toContain('no_procedures');
  });

  it('flags an empty form', () => {
    expect(templateWarnings(baseForm, { blocks: [] }).map(w => w.code)).toEqual(['empty_form']);
  });
});

describe('duplicateFormNames', () => {
  it('is case-insensitive and ignores archived forms', () => {
    const dupes = duplicateFormNames([
      { name: 'Crown Consent', status: 'published' },
      { name: 'crown consent ', status: 'draft' },
      { name: 'Implant Consent', status: 'published' },
      { name: 'Implant Consent', status: 'archived' },
    ] as Pick<ConsentForm, 'name' | 'status'>[]);
    expect(dupes.has('crown consent')).toBe(true);
    expect(dupes.has('implant consent')).toBe(false);
  });
});

describe('bundleWarnings', () => {
  const formsById = new Map<string, ConsentForm>([
    ['ok', { id: 'ok', name: 'Good Form', status: 'published', currentVersion: 1 } as ConsentForm],
    ['archived', { id: 'archived', name: 'Old Form', status: 'archived', currentVersion: 1 } as ConsentForm],
    ['draft', { id: 'draft', name: 'Draft Form', status: 'draft', currentVersion: 0 } as ConsentForm],
  ]);

  const bundle = (items: { formId: string; requirement: string }[]): ConsentBundle =>
    ({ items: items.map((i, n) => ({ id: String(n), bundleId: 'b', sortOrder: n, conditionLabel: '', ...i })) } as ConsentBundle);

  it('flags archived, unpublished, and missing forms plus no-required bundles', () => {
    const codes = bundleWarnings(
      bundle([
        { formId: 'archived', requirement: 'optional' },
        { formId: 'draft', requirement: 'optional' },
        { formId: 'gone', requirement: 'optional' },
      ]),
      formsById,
    ).map(w => w.code);
    expect(codes).toContain('archived_form');
    expect(codes).toContain('unpublished_form');
    expect(codes).toContain('missing_form');
    expect(codes).toContain('no_required');
  });

  it('passes a healthy bundle', () => {
    expect(bundleWarnings(bundle([{ formId: 'ok', requirement: 'required' }]), formsById)).toEqual([]);
  });
});

describe('page fit', () => {
  it('splits explicit page breaks into pages', () => {
    const pages = splitIntoPages([
      makeBlock('title', { label: 'A' }),
      makeBlock('page_break'),
      makeBlock('paragraph', { body: 'B' }),
    ]);
    expect(pages).toHaveLength(2);
    expect(pages[0][0].label).toBe('A');
    expect(pages[1][0].body).toBe('B');
  });

  it('warns when one page carries far too much content', () => {
    const crowded = Array.from({ length: 40 }, (_, i) =>
      makeBlock('paragraph', { body: `Paragraph ${i} — ${'long clinical wording '.repeat(12)}` }),
    );
    expect(pagesLikelyToOverflow(crowded)).toEqual([1]);
    // The same content split across pages passes.
    const paged = crowded.flatMap((block, i) =>
      i > 0 && i % 10 === 0 ? [makeBlock('page_break'), block] : [block],
    );
    expect(pagesLikelyToOverflow(paged)).toEqual([]);
  });
});
