/**
 * Print robustness — blank forms and org-branding states.
 *
 * Two production print rules proven here:
 *
 * 1. The office copy is NEVER silently dropped. A form printed with no
 *    procedure lines still produces the office-copy page, carrying an
 *    explicit "printed blank" note in place of the line table.
 *
 * 2. The patient sheet's DOM is independent of org branding. Whatever
 *    logo an org uploads (and whatever brand color BrandPrintStyle
 *    injects), the rendered sheet differs only in the logo <img src> —
 *    layout comes from CSS alone, so a branding change can never
 *    restructure the printed form.
 *
 * Pagination (the CSS side of the same guarantee) is covered by
 * scripts/print-layout-check.mjs, which prints the same fixtures through
 * real Chromium and fails on any sheet that exceeds one page.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import FofPrintSheet from '@/components/fof/FofPrintSheet';
import BrandPrintStyle from '@/components/BrandPrintStyle';
import {
  BLANK_AMOUNTS,
  BLANK_COMPUTATION,
  BLANK_PATIENT,
  LIVE_TEMPLATES,
  PRACTICE_DEFAULT_BRANDING,
  PRACTICE_LIVE_BRANDING,
} from './blank-form-fixtures';

// The office-copy page prints "Created by ... on <now>" — freeze it.
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 24, 14, 30, 0));
});
afterAll(() => {
  vi.useRealTimers();
});

function renderBlank(templateIndex: number, practice = PRACTICE_DEFAULT_BRANDING): string {
  return renderToStaticMarkup(
    <FofPrintSheet
      practice={practice}
      template={LIVE_TEMPLATES[templateIndex]}
      patient={BLANK_PATIENT}
      amounts={BLANK_AMOUNTS}
      computation={BLANK_COMPUTATION}
      officeLines={[]}
      createdBy="Megan Vincent"
      doctorName=""
    />
  );
}

describe('office copy is never silently dropped', () => {
  it('a blank form still prints the office-copy page, with an explicit note', () => {
    const html = renderBlank(0);
    expect(html).toContain('fof-office-page');
    expect(html).toContain('No procedure lines were entered');
    expect(html).toMatchSnapshot();
  });

  it('every live template prints exactly two sheets when blank', () => {
    for (let i = 0; i < LIVE_TEMPLATES.length; i++) {
      const html = renderBlank(i);
      const sheets = html.match(/class="fof-sheet/g) ?? [];
      expect(sheets, LIVE_TEMPLATES[i].name).toHaveLength(2);
      expect(html, LIVE_TEMPLATES[i].name).toContain('fof-office-page');
    }
  });

  it('undefined officeLines (older callers) also keeps the office copy', () => {
    const html = renderToStaticMarkup(
      <FofPrintSheet
        practice={PRACTICE_DEFAULT_BRANDING}
        template={LIVE_TEMPLATES[0]}
        patient={BLANK_PATIENT}
        amounts={BLANK_AMOUNTS}
        computation={BLANK_COMPUTATION}
      />
    );
    expect(html).toContain('fof-office-page');
    expect(html).toContain('No procedure lines were entered');
  });
});

describe('sheet DOM is independent of org branding', () => {
  it('live test branding differs from defaults only by the logo src', () => {
    const withDefaults = renderBlank(0, PRACTICE_DEFAULT_BRANDING);
    const withLive = renderBlank(0, PRACTICE_LIVE_BRANDING);
    expect(withLive).not.toBe(withDefaults);
    expect(
      withLive.split(PRACTICE_LIVE_BRANDING.logoUrl).join(PRACTICE_DEFAULT_BRANDING.logoUrl)
    ).toBe(withDefaults);
  });

  it('BrandPrintStyle stays a colors-only style sibling — no sheet markup', () => {
    const style = renderToStaticMarkup(
      <BrandPrintStyle branding={{ brandColor: '#ff0000', brandTint: '#f3f0f8' }} />
    );
    expect(style).toBe(
      '<style>.fof-sheet{--fof-navy:#ff0000;--fof-tint:#f3f0f8}\n' +
        '.dep-sheet{--dep-navy:#ff0000;--dep-tint:#f3f0f8}</style>'
    );
  });

  it('an org row with no uploaded logo omits the img and nothing else', () => {
    const noLogo = renderBlank(0, { ...PRACTICE_DEFAULT_BRANDING, logoUrl: '' });
    expect(noLogo).not.toContain('fof-logo');
    expect(noLogo).toContain('fof-office-page');
  });
});
