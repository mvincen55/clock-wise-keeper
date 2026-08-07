import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import BaLetterSheet, { INLINE_APPT_ROWS_MAX } from '@/components/broken-appts/BaLetterSheet';
import { DEFAULT_BA_SETTINGS, DEFAULT_BA_TEMPLATES } from '@/lib/broken-appts/defaults';
import type { BaCanceledAppt, BaPatientFields } from '@/lib/broken-appts/types';

// Renders all five shipped letters with test data and checks the Phase 3
// gates: merge fields resolve, the automatic-letter italic line and the
// enclosure footer appear on every letter, bold markers become <strong>,
// and a 12-row Rung 4 produces the attachment page instead of the inline
// table. Since the letterhead migration, every letter must also render on
// the ONE shared OfficeLetterheadSheet (.letter-sheet) — logo-only
// masthead, long-form dateline, practice identity in the footer.

const BRANDING = {
  displayName: 'Northfield Dental',
  legalName: 'Northfield Dental Group, LLC',
  addressLine1: '41 Northfield Avenue',
  addressLine2: 'Springvale, MA 02100',
  phone: '(555) 010-0142',
  website: 'northfielddental.example',
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

const render = (code: string, canceledAppts: BaCanceledAppt[] = []) =>
  renderToStaticMarkup(
    <BaLetterSheet
      branding={BRANDING}
      settings={SETTINGS}
      body={LETTERS.find(l => l.code === code)!.body}
      patient={PATIENT}
      canceledAppts={canceledAppts}
      todayISO="2026-08-03"
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
  it.each(['9101A', '0002', '9100A', '9106', '9107'])('%s resolves every merge field', code => {
    const html = render(code, code === '9107' ? APPT_ROWS(3) : []);
    expect(html).not.toContain('{{');
    expect(html).toContain('Dear Ann,');
    expect(html).toContain('8/10/2026'); // appt_date (body wording unchanged)
    expect(html).toContain('$75'); // fee_amount
    expect(html).toContain('(555) 010-0142'); // office_phone fallback from branding
  });

  it.each(['9101A', '0002', '9100A', '9106', '9107'])(
    '%s renders on the shared office letterhead',
    code => {
      const html = render(code, code === '9107' ? APPT_ROWS(3) : []);
      // The one canonical letter component, not a BA-specific layout.
      expect(html).toContain('class="letter-sheet"');
      // Long-form dateline owned by the letterhead.
      expect(html).toContain('August 3, 2026');
      // Practice identity lives in the shared footer, fed from branding.
      expect(html).toContain('letter-foot');
      expect(html).toContain('Northfield Dental Group, LLC');
      expect(html).toContain('41 Northfield Avenue');
    }
  );

  it.each(['9101A', '0002', '9100A', '9106', '9107'])(
    '%s carries the automatic-letter line and the enclosure footer',
    code => {
      const html = render(code, code === '9107' ? APPT_ROWS(3) : []);
      expect(html).toContain(
        'This letter is generated automatically by our scheduling system as part of our standard record-keeping for every patient.'
      );
      expect(html).toContain('Enclosure: Account Statement');
      expect(html).toContain('Megan Vincent');
      expect(html).toContain('Office Manager');
    }
  );

  it.each(['9101A', '0002', '9100A', '9106', '9107'])('%s renders bold runs, not ** markers', code => {
    const html = render(code, code === '9107' ? APPT_ROWS(3) : []);
    expect(html).toContain('<strong>');
    expect(html).not.toContain('**');
  });

  it('9107 with a few rows prints the table inline', () => {
    const html = render('9107', APPT_ROWS(3));
    expect(html).toContain('ba-appt-table');
    expect(html).not.toContain('A full appointment list is attached');
    expect(html).not.toContain('letter-attach-page');
  });

  it('9107 with 12 rows moves the table to the attachment page', () => {
    const rows = APPT_ROWS(12);
    expect(rows.length).toBeGreaterThan(INLINE_APPT_ROWS_MAX);
    const html = render('9107', rows);
    expect(html).toContain('A full appointment list is attached');
    expect(html).toContain('letter-attach-page');
    expect(html).toContain('Attached Appointment List');
    // Every canceled appointment is listed on the attachment.
    for (let i = 1; i <= 12; i++) expect(html).toContain(`9/${i}/2026`);
  });

  it('the prepay floor merges into 9107 from settings', () => {
    const html = render('9107', APPT_ROWS(2));
    expect(html).toContain('$150 or your estimated patient portion');
  });

  it('a blank signature name falls back to the practice name', () => {
    const html = renderToStaticMarkup(
      <BaLetterSheet
        branding={BRANDING}
        settings={{ ...SETTINGS, signatureName: '' }}
        body={LETTERS[0].body}
        patient={PATIENT}
        todayISO="2026-08-03"
      />
    );
    expect(html).toContain('Warm regards,');
    expect(html).toContain('Northfield Dental Group, LLC');
  });
});
