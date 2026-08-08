/**
 * Print-invariant coverage for the ACCOUNT BALANCE EXPLANATION sheet: the
 * synthetic $639 golden case must render the exact calculation, patient-safe
 * wording only, and the org's branding — never internal mechanics.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AccountBalancePrintSheet, {
  type AbxPracticeInfo,
} from '@/components/account-balance/AccountBalancePrintSheet';
import { buildPatientExplanation } from '@/lib/account-balance/explanation';
import { buildSmartReview } from '@/lib/account-balance/questions';
import { findBalanceEpisode, reconcileLedger } from '@/lib/account-balance/reconcile';
import { goldenAnswers, goldenRows } from './account-balance-fixture';

const PRACTICE: AbxPracticeInfo = {
  practiceName: 'Reference Dental PC',
  addressLine1: '12 Main St',
  addressLine2: 'Springfield MA 01101',
  phone: '(555) 555-0100',
  website: 'referencedental.example',
  logoUrl: '',
};

function goldenMarkup(): string {
  const rows = goldenRows();
  const answers = goldenAnswers();
  const reconciliation = reconcileLedger(rows);
  const episode = findBalanceEpisode(rows, reconciliation);
  const { internalBlocks, waiverLinks } = buildSmartReview({
    rows, reconciliation, episode, answers, patientNameConflict: false,
  });
  const explanation = buildPatientExplanation({
    rows, reconciliation, episode, answers, internalBlocks, waiverLinks,
    patientName: 'Taylor Sample',
  });
  expect(explanation).not.toBeNull();
  return renderToStaticMarkup(
    <AccountBalancePrintSheet practice={PRACTICE} explanation={explanation!} />
  );
}

describe('AccountBalancePrintSheet — golden $639 case', () => {
  it('renders the correct current balance and calculation', () => {
    const html = goldenMarkup();
    // Hero + calculation total both show $639.00.
    expect(html.match(/\$639\.00/g)!.length).toBeGreaterThanOrEqual(2);
    // The calculation lines: $363 visit + $276 filling.
    expect(html).toContain('$363.00');
    expect(html).toContain('$276.00');
    // The filling card: $395 charge minus the confirmed $119 copay.
    expect(html).toContain('$395.00');
    expect(html).toContain('-$119.00');
    expect(html).toContain('Estimated copay/deductible collected');
  });

  it('renders patient-friendly wording, dates, and identity', () => {
    const html = goldenMarkup();
    expect(html).toContain('Account Balance Explanation');
    expect(html).toContain('Taylor Sample');
    expect(html).toContain('Routine dental exam');
    expect(html).toContain('Adult cleaning');
    expect(html).toContain('Bitewing X-rays, 4 images');
    expect(html).toContain('3-surface tooth-colored filling, tooth #29');
    expect(html).toContain('February 12, 2026');
    expect(html).toContain('Insurance applied');
    expect(html).toContain('$0.00');
    expect(html).toContain('Altus coverage was not active');
  });

  it('shows the waived cancellation fee as $0 due', () => {
    const html = goldenMarkup();
    expect(html).toContain('Other account activity');
    expect(html).toContain('Late cancellation fee');
    expect(html).toContain('$75.00');
    expect(html).toContain('-$75.00');
    expect(html).toContain('Amount contributing to current balance');
  });

  it('never exposes internal Dentrix noise, mechanics, or unsafe words', () => {
    const html = goldenMarkup();
    expect(html).not.toContain('Prod Adj');
    expect(html).not.toContain('Provider Payment Adj');
    expect(html).not.toMatch(/write-?off/i);
    expect(html).not.toMatch(/denied/i);
    expect(html).not.toContain('UNKNOWN');
    expect(html).not.toMatch(/confiden/i);
    expect(html).not.toMatch(/reconcil/i);
    expect(html).not.toContain('classification');
  });

  it('prints the organization identity from props — nothing hard-coded', () => {
    const html = goldenMarkup();
    expect(html).toContain('Reference Dental PC');
    expect(html).toContain('12 Main St');
    expect(html).toContain('(555) 555-0100');
    expect(html).toContain('referencedental.example');
    expect(html).not.toMatch(/harelick/i);
  });

  it('renders inside the .abx-sheet print layout with unsplittable cards', () => {
    const html = goldenMarkup();
    expect(html).toContain('class="abx-sheet"');
    expect(html).toContain('abx-card');
    expect(html).toContain('abx-hero');
    expect(html).toContain('abx-calc');
  });
});
