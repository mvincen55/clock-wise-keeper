/**
 * Office letterhead print check — renders every correspondence variant
 * exactly as the pages' print portals do (real index.css), prints them
 * through real Chromium, and FAILS unless:
 *
 *   - each variant produces its expected PDF page count,
 *   - one-page letters keep a safety margin from the page boundary,
 *   - the practice-identity footer renders exactly once, below the content
 *     (never overlapped), on every variant,
 *   - no variant carries an unresolved {{merge_field}}.
 *
 * Variants: generic one-page letter, long-but-one-page letter, multi-page
 * letter, school note, work note, with/without Address Line 2,
 * with/without a signature image, long office name/footer.
 *
 * Run:  npx vite-node scripts/letter-print-check.tsx
 * Uses the same Chromium/Playwright setup as print-layout-check.mjs.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import OfficeLetterheadSheet from '@/components/letterhead/OfficeLetterheadSheet';
import LetterBodyContent from '@/components/letterhead/LetterBodyContent';
import BrandPrintStyle from '@/components/BrandPrintStyle';
import { buildNoteBody, NOTE_SALUTATION } from '@/lib/letters/note-wording';
import { formatLetterDate } from '@/lib/letters/letter-body';
import type { NoteFields } from '@/lib/letters/types';

const OUT = path.resolve(__dirname, '../.repro-letter');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const css = fs
  .readFileSync(path.resolve(__dirname, '../src/index.css'), 'utf8')
  .replace(/@tailwind [^;]+;/g, '')
  .replace(/@apply [^;]+;/g, '');

const preflight =
  '*,::before,::after{box-sizing:border-box;border-width:0;border-style:solid}' +
  'body{margin:0;line-height:inherit}h1,h2,h3,h4,p{margin:0}' +
  'table{border-collapse:collapse}img{display:block;max-width:100%;height:auto}';

const BRANDING = {
  displayName: 'Northfield Dental',
  legalName: 'Northfield Dental Group, LLC',
  addressLine1: '41 Northfield Avenue',
  addressLine2: 'Springvale, MA 02100',
  phone: '(555) 010-0142',
  website: 'northfielddental.example',
  logoUrl: '',
  brandColor: '#53406e',
  brandTint: '#f3f0f8',
};

const LONG_BRANDING = {
  ...BRANDING,
  legalName:
    'The Greater Northfield Family & Cosmetic Dental Associates of Springvale County, Professional LLC',
  addressLine1: '12345 Extraordinarily Long Boulevard of the Chestnut Grove Extension, Building C, Suite 400',
  website: 'thegreaternorthfieldfamilydentalassociates.example/contact-and-directions',
};

const RECIPIENT = {
  name: 'Ann Example',
  addressLine1: '12 Test Lane',
  addressLine2: 'Apt 4B',
  city: 'Springvale',
  state: 'MA',
  zip: '02100',
};

// 1x1 black PNG — enough for Chromium to lay out real ink dimensions.
const SIGNATURE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const SIGNER = { closing: 'Warm regards,', name: 'Megan Vincent', title: 'Office Manager' };

const SHORT_BODY = [
  'Thank you for your continued trust in our office. This letter confirms the records discussed on the phone earlier this week.',
  'Please reach out if anything needs a second look — we are happy to help.',
].join('\n\n');

const LONG_ONE_PAGE_BODY = Array.from({ length: 6 }, (_, i) =>
  `Paragraph ${i + 1}: our office maintains complete and accurate treatment records, and copies are released to the address on file after a signed request is received. Processing typically takes three to five business days.`,
).join('\n\n');

const MULTI_PAGE_BODY = Array.from({ length: 30 }, (_, i) =>
  `Section ${i + 1}. This portion of the correspondence continues onto additional pages so the letterhead's page behavior can be verified end to end: content must flow, nothing may be clipped, and the identity footer must follow the letter's final page without overlapping any body text.`,
).join('\n\n');

const noteFields = (noteFor: NoteFields['noteFor']): NoteFields => ({
  noteFor,
  patientName: 'Ann Example',
  dateSeenISO: '2026-08-07',
  excusedFromISO: '2026-08-07',
  excusedThroughISO: noteFor === 'work' ? '2026-08-09' : '',
  returnDateISO: '2026-08-10',
  restrictions: noteFor === 'school' ? 'No physical education for 48 hours.' : '',
});

const NOTE_SETTINGS = { schoolNoteWording: '', workNoteWording: '' };

interface Variant {
  name: string;
  branding: typeof BRANDING;
  sheet: React.ReactElement;
  expectedPages: number;
}

const letter = (
  branding: typeof BRANDING,
  props: Partial<React.ComponentProps<typeof OfficeLetterheadSheet>> & { body: React.ReactNode },
) => (
  <OfficeLetterheadSheet
    branding={branding}
    dateText={formatLetterDate('2026-08-07')}
    signer={SIGNER}
    {...props}
  />
);

const VARIANTS: Variant[] = [
  {
    name: 'generic-one-page',
    branding: BRANDING,
    expectedPages: 1,
    sheet: letter(BRANDING, {
      recipient: RECIPIENT,
      salutation: 'Dear Ann Example,',
      subject: 'Your records request',
      body: <LetterBodyContent markup={SHORT_BODY} />,
    }),
  },
  {
    name: 'long-one-page',
    branding: BRANDING,
    expectedPages: 1,
    sheet: letter(BRANDING, {
      recipient: RECIPIENT,
      salutation: 'Dear Ann Example,',
      body: <LetterBodyContent markup={LONG_ONE_PAGE_BODY} />,
    }),
  },
  {
    name: 'multi-page',
    branding: BRANDING,
    expectedPages: 3,
    sheet: letter(BRANDING, {
      recipient: RECIPIENT,
      salutation: 'Dear Ann Example,',
      body: <LetterBodyContent markup={MULTI_PAGE_BODY} />,
    }),
  },
  {
    name: 'school-note',
    branding: BRANDING,
    expectedPages: 1,
    sheet: letter(BRANDING, {
      salutation: NOTE_SALUTATION,
      body: <LetterBodyContent markup={buildNoteBody(noteFields('school'), NOTE_SETTINGS)} />,
    }),
  },
  {
    name: 'work-note',
    branding: BRANDING,
    expectedPages: 1,
    sheet: letter(BRANDING, {
      salutation: NOTE_SALUTATION,
      body: <LetterBodyContent markup={buildNoteBody(noteFields('work'), NOTE_SETTINGS)} />,
    }),
  },
  {
    name: 'no-address-line-2',
    branding: BRANDING,
    expectedPages: 1,
    sheet: letter(BRANDING, {
      recipient: { ...RECIPIENT, addressLine2: '' },
      salutation: 'Dear Ann Example,',
      body: <LetterBodyContent markup={SHORT_BODY} />,
    }),
  },
  {
    name: 'with-signature-ink',
    branding: BRANDING,
    expectedPages: 1,
    sheet: letter(BRANDING, {
      recipient: RECIPIENT,
      salutation: 'Dear Ann Example,',
      body: <LetterBodyContent markup={SHORT_BODY} />,
      signer: { ...SIGNER, signatureDataUrl: SIGNATURE_PNG },
    }),
  },
  {
    name: 'long-office-name',
    branding: LONG_BRANDING,
    expectedPages: 1,
    sheet: letter(LONG_BRANDING, {
      recipient: RECIPIENT,
      salutation: 'Dear Ann Example,',
      body: <LetterBodyContent markup={SHORT_BODY} />,
    }),
  },
];

for (const v of VARIANTS) {
  const markup = renderToStaticMarkup(
    <>
      <BrandPrintStyle branding={v.branding} />
      <div className="letter-print-root">{v.sheet}</div>
    </>,
  );
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${preflight}</style><style>${css}</style></head><body>${markup}</body></html>`;
  fs.writeFileSync(path.join(OUT, `${v.name}.html`), html);
}

async function loadChromium() {
  for (const spec of ['playwright', 'playwright-core', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
    try {
      return (await import(/* @vite-ignore */ spec)).chromium;
    } catch {
      /* try next */
    }
  }
  throw new Error('playwright not found — npm i -D playwright (or install globally)');
}

function pdfPageCount(buf: Buffer): number {
  const s = buf.toString('latin1');
  const m = s.match(/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/);
  return m ? Number(m[1]) : (s.match(/\/Type\s*\/Page[^s]/g) || []).length;
}

const PAGE_PX = 960; // 10in printable height at 96dpi
const NATURAL_MAX_PX = 945; // slack for cross-machine font metrics

const chromium = await loadChromium();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
});
// 720px viewport = the 7.5in printable width at 96dpi.
const page = await browser.newPage({ viewport: { width: 720, height: 1200 } });

let failures = 0;
for (const v of VARIANTS) {
  await page.goto('file://' + path.join(OUT, `${v.name}.html`));
  await page.emulateMedia({ media: 'print' });
  const info = await page.evaluate(() => {
    const sheet = document.querySelector('.letter-sheet') as HTMLElement | null;
    const feet = [...document.querySelectorAll('.letter-foot')];
    const foot = feet[0] as HTMLElement | undefined;
    let natural = 0;
    if (sheet) {
      const prev = sheet.style.minHeight;
      sheet.style.minHeight = '0';
      natural = sheet.getBoundingClientRect().height;
      sheet.style.minHeight = prev;
    }
    // The footer must sit below every piece of letter content.
    let contentBottom = 0;
    for (const el of document.querySelectorAll(
      '.letter-body, .letter-closing, .letter-enclosure, .letter-recipient, .letter-salutation',
    )) {
      contentBottom = Math.max(contentBottom, el.getBoundingClientRect().bottom);
    }
    return {
      text: sheet?.textContent ?? '',
      footCount: feet.length,
      footTop: foot ? foot.getBoundingClientRect().top : -1,
      footText: foot?.textContent ?? '',
      contentBottom,
      natural: Math.round(natural * 100) / 100,
    };
  });
  const pdf = await page.pdf({ format: 'Letter', printBackground: true, preferCSSPageSize: true });
  const pages = pdfPageCount(pdf);

  const problems: string[] = [];
  if (pages !== v.expectedPages) problems.push(`expected ${v.expectedPages} PDF page(s), got ${pages}`);
  if (info.footCount !== 1) problems.push(`expected exactly one identity footer, got ${info.footCount}`);
  if (!info.footText.includes(v.branding.legalName))
    problems.push('footer is missing the practice legal name');
  if (!info.footText.includes(v.branding.phone)) problems.push('footer is missing the office phone');
  if (info.footTop < info.contentBottom - 0.5)
    problems.push(
      `letter content overlaps the footer (content bottom ${info.contentBottom}px > footer top ${info.footTop}px)`,
    );
  if (v.expectedPages === 1 && info.natural > NATURAL_MAX_PX)
    problems.push(`one-page letter too close to the boundary: natural ${info.natural}px > ${NATURAL_MAX_PX}px`);
  if (v.expectedPages === 1 && info.natural > PAGE_PX)
    problems.push(`one-page letter overflows its page: ${info.natural}px > ${PAGE_PX}px`);
  if (info.text.includes('{{')) problems.push('unresolved merge field in rendered letter');

  if (problems.length) {
    failures++;
    console.error(`FAIL ${v.name}`);
    for (const p of problems) console.error(`  - ${p}`);
  } else {
    console.log(`ok   ${v.name} (pages=${pages}, natural=${info.natural}px)`);
  }
}
await browser.close();

if (failures) {
  console.error(`\n${failures} letterhead variant(s) failed the print check`);
  process.exit(1);
}
console.log(`\nall ${VARIANTS.length} letterhead variants print as expected`);
