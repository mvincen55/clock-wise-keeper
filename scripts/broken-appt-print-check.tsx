/**
 * Broken Appointments print check — renders the shipped letters with
 * test data exactly as the page's print portal does (real index.css),
 * prints them through real Chromium, and FAILS unless:
 *
 *   - 9101A / 0002 / 9100A / 9106 / 9107-with-3-rows are each exactly ONE page,
 *   - 9107 with 12 canceled appointments is exactly TWO pages (letter +
 *     "Attached Appointment List" page) with the inline table replaced by
 *     the attachment note,
 *   - the OFFICE COPY documentation page prints LAST on its own page
 *     (letter + office copy = 2 pages; 9107-12-rows + office copy = 3),
 *     carries DO NOT GIVE TO PATIENT, and keeps incomplete actions visible,
 *   - Address Line 2 prints when present and leaves no gap when absent,
 *   - long names/addresses and a long checklist still fit their pages,
 *   - the shared-signature ink variant prints without a phantom page,
 *   - no letter carries an unresolved {{merge_field}}.
 *
 * Run:  npx vite-node scripts/broken-appt-print-check.tsx
 * Uses the same Chromium/Playwright setup as print-layout-check.mjs.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import BaLetterSheet from '@/components/broken-appts/BaLetterSheet';
import BaOfficeCopySheet, {
  type OfficeCopyChecklistRow,
} from '@/components/broken-appts/BaOfficeCopySheet';
import BrandPrintStyle from '@/components/BrandPrintStyle';
import { DEFAULT_BA_SETTINGS, DEFAULT_BA_TEMPLATES } from '@/lib/broken-appts/defaults';
import { completionStamp } from '@/lib/broken-appts/checklist';
import type { LetterSigner } from '@/lib/letters/types';
import type { BaCanceledAppt, BaPatientFields, Rung } from '@/lib/broken-appts/types';

const OUT = path.resolve(__dirname, '../.repro-ba');
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

const PATIENT: BaPatientFields = {
  firstName: 'Ann',
  lastName: 'Example',
  addressLine1: '12 Test Lane',
  addressLine2: '',
  city: 'Springvale',
  state: 'MA',
  zip: '02100',
  apptDateISO: '2026-08-10',
};

const LONG_PATIENT: BaPatientFields = {
  firstName: 'Alexandriana-Katherine',
  lastName: 'Vandermeer-Worthington y Fuentes de la Cruz III',
  addressLine1: '14789 Old Commonwealth Turnpike Extension, Northwest Corner',
  addressLine2: 'Building C, Suite 2200, Attention Residential Manager',
  city: 'South Attleborough-Seekonk Crossing',
  state: 'MA',
  zip: '02703-4471',
  apptDateISO: '2026-08-10',
};

// A 1×1 transparent PNG — enough for Chromium to lay the ink out for real.
const INK =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const SIGNER_INK: LetterSigner = {
  closing: 'Warm regards,',
  name: 'Megan Vincent',
  title: 'Office Manager',
  signatureDataUrl: INK,
};

const AT = new Date(2026, 7, 7, 10, 47);

const rows = (n: number): BaCanceledAppt[] =>
  Array.from({ length: n }, (_, i) => ({
    date: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`,
    time: '9:00 AM',
    provider: i % 2 ? 'Dr. Scott' : 'Hygiene — Kelly',
    visitType: i % 2 ? 'Crown prep and delivery' : 'Prophy + exam',
  }));

const checklistRows = (labels: string[], completed: number): OfficeCopyChecklistRow[] =>
  labels.map((label, i) => ({
    label,
    completion: i < completed ? completionStamp('MEG', AT) : null,
  }));

const RUNG3_CHECKLIST = ['Post 9101 + $75 fee', 'Post 0002 (letter sent)'];
const LONG_CHECKLIST = [
  'Post 9104b (late arrival)',
  'Post 9100 (auto-fee)',
  'Post 9107 (letter sent)',
  'Create unscheduled hygiene appointment',
  'Cancel remaining hygiene appointments',
  'Cancel remaining doctor appointments',
  'Add patient to the VIP text list',
  'Collect prepayment before doctor visits',
  'Verify card on file is current',
  'Update Pop-Up',
  'Call patient to explain the change',
  'Notify Office Manager',
];

const letters = DEFAULT_BA_TEMPLATES.filter(t => t.kind === 'letter');
const body = (code: string) => letters.find(l => l.code === code)!.body;

const officeCopy = (
  checklist: OfficeCopyChecklistRow[],
  opts: { rung?: Rung; patient?: BaPatientFields; startOnNewPage?: boolean } = {}
) => (
  <BaOfficeCopySheet
    patientName={`${(opts.patient ?? PATIENT).firstName} ${(opts.patient ?? PATIENT).lastName}`}
    apptDateMDY="8/10/2026"
    eventLabel="Late cancellation"
    rung={opts.rung ?? 3}
    eventCode="9101"
    workflowDateMDY="8/7/2026"
    staffCode="MEG"
    checklist={checklist}
    startOnNewPage={opts.startOnNewPage ?? true}
  />
);

interface Variant {
  name: string;
  element: React.ReactElement;
  expectedPages: number;
  expectAttachment: boolean;
  /** Substrings that must appear in the rendered document. */
  expectTexts?: string[];
  /** Substrings that must NOT appear. */
  rejectTexts?: string[];
}

const letterVariant = (
  name: string,
  code: string,
  opts: {
    canceledAppts?: BaCanceledAppt[];
    patient?: BaPatientFields;
    signer?: LetterSigner;
    officeCopyRows?: OfficeCopyChecklistRow[];
  } = {}
) => ({
  name,
  code,
  element: (
    <BaLetterSheet
      branding={BRANDING}
      settings={DEFAULT_BA_SETTINGS}
      body={body(code)}
      patient={opts.patient ?? PATIENT}
      canceledAppts={opts.canceledAppts ?? []}
      todayISO="2026-08-03"
      signer={opts.signer}
      extraPages={
        opts.officeCopyRows ? officeCopy(opts.officeCopyRows, { patient: opts.patient }) : undefined
      }
    />
  ),
});

const VARIANTS: Variant[] = [
  // The five shipped letters, letter-only — the original single-page gates.
  { ...letterVariant('9101a', '9101A'), expectedPages: 1, expectAttachment: false },
  { ...letterVariant('0002', '0002'), expectedPages: 1, expectAttachment: false },
  { ...letterVariant('9100a', '9100A'), expectedPages: 1, expectAttachment: false },
  { ...letterVariant('9106', '9106'), expectedPages: 1, expectAttachment: false },
  {
    ...letterVariant('9107-3rows', '9107', { canceledAppts: rows(3) }),
    expectedPages: 1,
    expectAttachment: false,
  },
  {
    ...letterVariant('9107-12rows', '9107', { canceledAppts: rows(12) }),
    expectedPages: 2,
    expectAttachment: true,
  },

  // The full front-desk package: letter + OFFICE COPY page, printed last.
  {
    ...letterVariant('package-office-copy', '0002', {
      officeCopyRows: checklistRows(RUNG3_CHECKLIST, 1),
    }),
    expectedPages: 2,
    expectAttachment: false,
    expectTexts: [
      'OFFICE COPY',
      'DO NOT GIVE TO PATIENT',
      'Not completed at time of print',
      '08/07/2026',
      '10:47 AM',
      'MEG',
    ],
  },
  {
    ...letterVariant('package-9107-office-copy', '9107', {
      canceledAppts: rows(12),
      officeCopyRows: checklistRows(RUNG3_CHECKLIST, 2),
    }),
    expectedPages: 3,
    expectAttachment: true,
    expectTexts: ['OFFICE COPY', 'Attached Appointment List'],
    rejectTexts: ['Not completed at time of print'],
  },

  // Address Line 2 prints; long values wrap instead of overflowing.
  {
    ...letterVariant('addr-line2', '9100A', {
      patient: { ...PATIENT, addressLine2: 'Apt 3B' },
    }),
    expectedPages: 1,
    expectAttachment: false,
    expectTexts: ['Apt 3B'],
  },
  {
    ...letterVariant('long-everything', '9106', {
      patient: LONG_PATIENT,
      officeCopyRows: checklistRows(RUNG3_CHECKLIST, 0),
    }),
    expectedPages: 2,
    expectAttachment: false,
    expectTexts: ['Building C, Suite 2200'],
  },

  // Shared-signature ink must not add a phantom page (letter-ink rule).
  {
    ...letterVariant('signer-ink', '9101A', { signer: SIGNER_INK }),
    expectedPages: 1,
    expectAttachment: false,
  },

  // Office copy standalone (Rung 5 / reply-only): one page, office-only.
  {
    name: 'office-copy-alone',
    element: (
      <div className="letter-sheet">
        {officeCopy(checklistRows(['Update Pop-Up', 'Notify Office Manager'], 1), {
          rung: 5,
          startOnNewPage: false,
        })}
      </div>
    ),
    expectedPages: 1,
    expectAttachment: false,
    expectTexts: ['OFFICE COPY', 'DO NOT GIVE TO PATIENT', 'Not completed at time of print'],
  },

  // A long checklist keeps the office page intact (may spill to a 2nd
  // documentation page, never onto the letter).
  {
    ...letterVariant('long-checklist', '9107', {
      canceledAppts: rows(3),
      officeCopyRows: checklistRows(LONG_CHECKLIST, 5),
    }),
    expectedPages: 2,
    expectAttachment: false,
    expectTexts: ['Notify Office Manager', 'Not completed at time of print'],
  },
];

for (const v of VARIANTS) {
  const markup = renderToStaticMarkup(
    <>
      <BrandPrintStyle branding={BRANDING} />
      <div className="letter-print-root">{v.element}</div>
    </>
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

const chromium = await loadChromium();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
});
const page = await browser.newPage({ viewport: { width: 720, height: 1200 } });

let failures = 0;
for (const v of VARIANTS) {
  await page.goto('file://' + path.join(OUT, `${v.name}.html`));
  await page.emulateMedia({ media: 'print' });
  const info = await page.evaluate(() => {
    const letter = document.querySelector('.letter-sheet');
    return {
      text: letter?.textContent ?? '',
      hasAttachment: !!document.querySelector('.letter-attach-page'),
      hasInlineNote: (letter?.textContent ?? '').includes('A full appointment list is attached'),
    };
  });
  const pdf = await page.pdf({ format: 'Letter', printBackground: true, preferCSSPageSize: true });
  const pages = pdfPageCount(pdf);

  const problems: string[] = [];
  if (pages !== v.expectedPages)
    problems.push(`expected ${v.expectedPages} PDF page(s), got ${pages}`);
  if (info.hasAttachment !== v.expectAttachment)
    problems.push(
      v.expectAttachment ? 'attachment page missing' : 'unexpected attachment page'
    );
  if (v.expectAttachment && !info.hasInlineNote)
    problems.push('letter body missing the "full appointment list is attached" note');
  if (info.text.includes('{{')) problems.push('unresolved merge field in rendered letter');
  for (const t of v.expectTexts ?? []) {
    if (!info.text.includes(t)) problems.push(`missing expected text: ${t}`);
  }
  for (const t of v.rejectTexts ?? []) {
    if (info.text.includes(t)) problems.push(`unexpected text present: ${t}`);
  }

  if (problems.length) {
    failures++;
    console.error(`FAIL ${v.name}`);
    for (const p of problems) console.error(`  - ${p}`);
  } else {
    console.log(`ok   ${v.name} (pages=${pages})`);
  }
}
await browser.close();

if (failures) {
  console.error(`\n${failures} letter variant(s) failed the print check`);
  process.exit(1);
}
console.log(`\nall ${VARIANTS.length} letter variants print as expected`);
