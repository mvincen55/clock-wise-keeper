import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import BaLetterSheet, { INLINE_APPT_ROWS_MAX } from '@/components/broken-appts/BaLetterSheet';
import { DEFAULT_BA_SETTINGS, DEFAULT_BA_TEMPLATES } from '@/lib/broken-appts/defaults';
import { formatMoney, mergeFields } from '@/lib/broken-appts/outputs';
import type { BaCanceledAppt, BaPatientFields } from '@/lib/broken-appts/types';

// Renders all five shipped letters with test data and checks the Phase 3
// gates: merge fields resolve (including the card-state snippets), the
// automatic-letter italic line and the enclosure footer appear on every
// letter, bold markers become <strong>, a 12-row Rung 4 produces the
// attachment page instead of the inline table, and the letterhead holds up
// with and without an org logo.

const BRANDING = {
  displayName: 'Northfield Dental',
  legalName: 'Northfield Dental Group, LLC',
  addressLine1: '41 Northfield Avenue',
  addressLine2: 'Springvale, MA 02100',
  phone: '(555) 010-0142',
  logoUrl: '',
};

const SETTINGS = { ...DEFAULT_BA_SETTINGS, signatureName: 'Megan Vincent' };

const PATIENT: BaPatientFields = {
  firstName: 'Ann',
  lastName: 'Example',
  addressLine1: '12 Test Lane',
  city: 'Springvale',
  state: 'MA',
  zip: '02100',
  apptDateISO: '2026-08-10',
};

const LETTERS = DEFAULT_BA_TEMPLATES.filter(t => t.kind === 'letter');
const LETTER_CODES = ['0001', '0002', '0003', '0004', '0005'];

const snippet = (code: string) =>
  mergeFields(DEFAULT_BA_TEMPLATES.find(t => t.kind === 'snippet' && t.code === code)!.body, {
    fee_amount: formatMoney(SETTINGS.feeAmount),
  });

// The card-state fields each letter needs, resolved as the page resolves
// them (defaults: no card yet at Rung 2–3, posted at Rung 3, charged at 4).
const DEFAULT_EXTRAS: Record<string, Record<string, string>> = {
  '0001': {},
  '0002': { card_sentence: snippet('card_needed') },
  '0003': { card_sentence: snippet('card_needed') },
  '0004': { transaction_snippet: snippet('txn_posted') },
  '0005': { transaction_snippet: snippet('txn_charged') },
};

const render = (
  code: string,
  canceledAppts: BaCanceledAppt[] = [],
  extraFields: Record<string, string> = DEFAULT_EXTRAS[code],
  logoUrl = ''
) =>
  renderToStaticMarkup(
    <BaLetterSheet
      branding={{ ...BRANDING, logoUrl }}
      settings={SETTINGS}
      body={LETTERS.find(l => l.code === code)!.body}
      patient={PATIENT}
      canceledAppts={canceledAppts}
      todayMDY="8/3/2026"
      extraFields={extraFields}
    />
  );

const APPT_ROWS = (n: number): BaCanceledAppt[] =>
  Array.from({ length: n }, (_, i) => ({
    date: `2026-09-${String(i + 1).padStart(2, '0')}`,
    time: '9:00 AM',
    provider: i % 2 ? 'Dr. Scott' : 'Hygiene — Kelly',
    visitType: i % 2 ? 'Crown prep' : 'Prophy',
  }));

describe('BaLetterSheet — the five shipped letters', () => {
  it('ships exactly the five 0001–0005 letters', () => {
    expect(LETTERS.map(l => l.code).sort()).toEqual(LETTER_CODES);
  });

  it.each(LETTER_CODES)('%s resolves every merge field', code => {
    const html = render(code, code === '0005' ? APPT_ROWS(3) : []);
    expect(html).not.toContain('{{');
    expect(html).toContain('Dear Ann,');
    expect(html).toContain('8/10/2026'); // appt_date
    expect(html).toContain('$75'); // fee_amount
    expect(html).toContain('(555) 010-0142'); // office_phone fallback from branding
  });

  it.each(LETTER_CODES)(
    '%s carries the automatic-letter line and the enclosure footer',
    code => {
      const html = render(code, code === '0005' ? APPT_ROWS(3) : []);
      expect(html).toContain(
        'This letter is generated automatically by our scheduling system as part of our standard record-keeping for every patient.'
      );
      expect(html).toContain('Enclosure: Account Statement');
      expect(html).toContain('Megan Vincent');
      expect(html).toContain('Office Manager');
    }
  );

  it.each(LETTER_CODES)('%s renders bold runs, not ** markers', code => {
    const html = render(code, code === '0005' ? APPT_ROWS(3) : []);
    expect(html).toContain('<strong>');
    expect(html).not.toContain('**');
  });

  it('0002 swaps the card sentence per the card state', () => {
    expect(render('0002')).toContain('a credit card on file will be required');
    expect(render('0002', [], { card_sentence: snippet('card_have') })).toContain(
      'we already have a card on file, so nothing more is needed there'
    );
  });

  it('0004 with a successful charge reads "charged to the card we have on file"', () => {
    const html = render('0004', [], { transaction_snippet: snippet('txn_charged') });
    expect(html).toContain('Because this has happened again,');
    expect(html).toContain('charged to the card we have on file');
  });

  it('a failed card puts the 7-business-day sentence in the letter', () => {
    const html = render('0005', APPT_ROWS(3), {
      transaction_snippet: snippet('txn_posted_card_failed'),
    });
    expect(html).toContain('unable to be processed');
    expect(html).toContain('7 business days');
    expect(html).not.toContain('charged to the card');
  });

  it('0005 with a few rows prints the table inline', () => {
    const html = render('0005', APPT_ROWS(3));
    expect(html).toContain('ba-appt-table');
    expect(html).not.toContain('A full appointment list is attached');
    expect(html).not.toContain('ba-attach-page');
  });

  it('0005 with 12 rows moves the table to the attachment page', () => {
    const rows = APPT_ROWS(12);
    expect(rows.length).toBeGreaterThan(INLINE_APPT_ROWS_MAX);
    const html = render('0005', rows);
    expect(html).toContain('A full appointment list is attached');
    expect(html).toContain('ba-attach-page');
    expect(html).toContain('Attached Appointment List');
    // Every canceled appointment is listed on the attachment.
    for (let i = 1; i <= 12; i++) expect(html).toContain(`9/${i}/2026`);
  });

  it('the prepay floor merges into 0005 from settings', () => {
    const html = render('0005', APPT_ROWS(2));
    expect(html).toContain('$150 or your estimated patient portion');
  });

  it.each(LETTER_CODES)('%s letterhead renders the org logo when one exists — and not otherwise', code => {
    const rows = code === '0005' ? APPT_ROWS(3) : [];
    const withLogo = render(code, rows, DEFAULT_EXTRAS[code], 'https://example.test/logo.png');
    expect(withLogo).toContain('ba-logo');
    expect(withLogo).toContain('https://example.test/logo.png');
    const withoutLogo = render(code, rows);
    expect(withoutLogo).not.toContain('ba-logo');
    expect(withoutLogo).toContain('Northfield Dental Group, LLC');
  });

  it('a blank signature name falls back to the practice name', () => {
    const html = renderToStaticMarkup(
      <BaLetterSheet
        branding={BRANDING}
        settings={{ ...SETTINGS, signatureName: '' }}
        body={LETTERS[0].body}
        patient={PATIENT}
        todayMDY="8/3/2026"
      />
    );
    expect(html).toContain('Warm regards,');
    expect(html).toContain('Northfield Dental Group, LLC');
  });
});
