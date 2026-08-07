import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import OfficeLetterheadSheet, {
  recipientLines,
  type LetterheadBranding,
} from '@/components/letterhead/OfficeLetterheadSheet';
import LetterBodyContent from '@/components/letterhead/LetterBodyContent';
import BaLetterSheet from '@/components/broken-appts/BaLetterSheet';
import { DEFAULT_BA_SETTINGS, DEFAULT_BA_TEMPLATES } from '@/lib/broken-appts/defaults';
import { buildNoteBody, NOTE_SALUTATION } from '@/lib/letters/note-wording';
import { DEFAULT_CORRESPONDENCE_SETTINGS, EMPTY_RECIPIENT } from '@/lib/letters/types';

/**
 * The canonical office letterhead (spec: one shared letterhead component).
 * These tests pin the structural contract every letter surface relies on:
 * branding-fed masthead and footer, collapsing recipient block, dateline,
 * signature ink vs typed fallback, and that BA letters and school/work
 * notes really do render on the same component.
 */

const BRANDING: LetterheadBranding = {
  displayName: 'Northfield Dental',
  legalName: 'Northfield Dental Group, LLC',
  addressLine1: '41 Northfield Avenue',
  addressLine2: 'Springvale, MA 02100',
  phone: '(555) 010-0142',
  website: 'northfielddental.example',
  logoUrl: 'https://cdn.example/logo.png',
};

const SIGNER = { closing: 'Warm regards,', name: 'Megan Vincent', title: 'Office Manager' };

const RECIPIENT = {
  name: 'Ann Example',
  addressLine1: '12 Test Lane',
  addressLine2: 'Apt 4B',
  city: 'Springvale',
  state: 'MA',
  zip: '02100',
};

function renderSheet(overrides: Partial<Parameters<typeof OfficeLetterheadSheet>[0]> = {}) {
  return renderToStaticMarkup(
    <OfficeLetterheadSheet
      branding={BRANDING}
      dateText="August 7, 2026"
      recipient={RECIPIENT}
      salutation="Dear Ann Example,"
      body={<LetterBodyContent markup="A short professional letter body." />}
      signer={SIGNER}
      {...overrides}
    />
  );
}

describe('OfficeLetterheadSheet — canonical structure', () => {
  it('masthead carries the configured logo only — identity text lives in the footer', () => {
    const html = renderSheet();
    expect(html).toContain('letter-masthead');
    expect(html).toContain('https://cdn.example/logo.png');
    // No second office-name block beside the logo.
    expect(html).not.toContain('letter-masthead-name');
    // Identity prints once, in the footer, from canonical branding.
    expect(html).toContain('letter-foot');
    expect(html).toContain('Northfield Dental Group, LLC');
    expect(html).toContain('41 Northfield Avenue');
    expect(html).toContain('(555) 010-0142');
    expect(html).toContain('northfielddental.example');
  });

  it('a logo-less office prints its name in the masthead instead', () => {
    const html = renderSheet({ branding: { ...BRANDING, logoUrl: '' } });
    expect(html).toContain('letter-masthead-name');
    expect(html).not.toContain('<img class="letter-logo"');
  });

  it('the dateline is its own right-aligned block with the long-form date', () => {
    const html = renderSheet();
    expect(html).toContain('<div class="letter-dateline">August 7, 2026</div>');
  });

  it('address line 2 disappears completely when blank — no empty row', () => {
    const withLine2 = recipientLines(RECIPIENT);
    expect(withLine2).toEqual(['Ann Example', '12 Test Lane', 'Apt 4B', 'Springvale, MA 02100']);
    const withoutLine2 = recipientLines({ ...RECIPIENT, addressLine2: '' });
    expect(withoutLine2).toEqual(['Ann Example', '12 Test Lane', 'Springvale, MA 02100']);

    const html = renderSheet({ recipient: { ...RECIPIENT, addressLine2: '' } });
    expect(html).not.toContain('Apt 4B');
    // Exactly three recipient lines rendered.
    const block = html.match(/letter-recipient[^>]*>([\s\S]*?)<\/div>\s*<p class="letter-salutation"/);
    expect(block).toBeTruthy();
    expect((block![1].match(/<div>/g) ?? []).length).toBe(3);
  });

  it('an all-blank recipient renders no recipient block at all', () => {
    const html = renderSheet({ recipient: { ...EMPTY_RECIPIENT } });
    expect(html).not.toContain('letter-recipient');
  });

  it('the subject renders as a RE: line only when provided', () => {
    expect(renderSheet()).not.toContain('letter-subject');
    expect(renderSheet({ subject: 'Records transfer' })).toContain('RE: Records transfer');
  });

  it('a stored signature renders as bounded ink above the typed name', () => {
    const html = renderSheet({
      signer: { ...SIGNER, signatureDataUrl: 'data:image/png;base64,SIG' },
    });
    expect(html).toContain('letter-ink');
    expect(html).toContain('data:image/png;base64,SIG');
    expect(html).toContain('Megan Vincent');
    expect(html).toContain('Office Manager');
    // With ink there is no hand-signing gap modifier.
    expect(html).not.toContain('letter-signer-name--typed');
  });

  it('no signature = clean typed-name fallback with a hand-signing gap', () => {
    const html = renderSheet();
    expect(html).not.toContain('letter-ink');
    expect(html).toContain('letter-signer-name--typed');
    expect(html).toContain('Warm regards,');
  });

  it('a blank signer name falls back to the practice name', () => {
    const html = renderSheet({ signer: { ...SIGNER, name: '' } });
    expect(html).toContain('Northfield Dental Group, LLC');
  });

  it('long recipient names and addresses render without truncation', () => {
    const long = {
      name: 'Bartholomew Maximilian Featherstonehaugh-Cholmondeley III, Esq.',
      addressLine1: '12345 Extraordinarily Long Boulevard of the Chestnut Grove Extension',
      addressLine2: 'Building C, Suite 40021, Attn: Records Department, Second Floor',
      city: 'Lake Chargoggagoggmanchauggagoggchaubunagungamaugg',
      state: 'MA',
      zip: '02100-4444',
    };
    const html = renderSheet({ recipient: long });
    expect(html).toContain(long.name);
    expect(html).toContain(long.addressLine1);
    expect(html).toContain(long.addressLine2);
  });

  it('sheet DOM is independent of branding except the logo src', () => {
    const a = renderSheet();
    const b = renderSheet({ branding: { ...BRANDING, logoUrl: 'https://cdn.example/other.png' } });
    expect(b.split('https://cdn.example/other.png').join('https://cdn.example/logo.png')).toBe(a);
  });
});

describe('one shared letterhead across the product', () => {
  it('a Broken Appointment letter renders on .letter-sheet', () => {
    const letter = DEFAULT_BA_TEMPLATES.find(t => t.kind === 'letter')!;
    const html = renderToStaticMarkup(
      <BaLetterSheet
        branding={BRANDING}
        settings={DEFAULT_BA_SETTINGS}
        body={letter.body}
        patient={{
          firstName: 'Ann', lastName: 'Example', addressLine1: '12 Test Lane',
          addressLine2: '', city: 'Springvale', state: 'MA', zip: '02100',
          apptDateISO: '2026-08-10',
        }}
        todayISO="2026-08-07"
      />
    );
    expect(html).toContain('class="letter-sheet"');
    expect(html).toContain('letter-foot');
  });

  it('a school/work note renders on the same .letter-sheet with the same footer', () => {
    const body = buildNoteBody(
      {
        noteFor: 'school', patientName: 'Ann Example', dateSeenISO: '2026-08-07',
        excusedFromISO: '', excusedThroughISO: '', returnDateISO: '2026-08-08', restrictions: '',
      },
      DEFAULT_CORRESPONDENCE_SETTINGS,
    );
    const html = renderToStaticMarkup(
      <OfficeLetterheadSheet
        branding={BRANDING}
        dateText="August 7, 2026"
        salutation={NOTE_SALUTATION}
        body={<LetterBodyContent markup={body} />}
        signer={SIGNER}
      />
    );
    expect(html).toContain('class="letter-sheet"');
    expect(html).toContain('To Whom It May Concern:');
    expect(html).toContain('letter-foot');
    expect(html).toContain('Northfield Dental Group, LLC');
  });
});
