/**
 * Broken Appointments print check — renders the four shipped letters with
 * test data exactly as the page's print portal does (real index.css),
 * prints them through real Chromium, and FAILS unless:
 *
 *   - 9101A / 9100A / 9106 / 9107-with-3-rows are each exactly ONE page,
 *   - 9107 with 12 canceled appointments is exactly TWO pages (letter +
 *     "Attached Appointment List" page) with the inline table replaced by
 *     the attachment note,
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
import BrandPrintStyle from '@/components/BrandPrintStyle';
import { DEFAULT_BA_SETTINGS, DEFAULT_BA_TEMPLATES } from '@/lib/broken-appts/defaults';
import type { BaCanceledAppt, BaPatientFields } from '@/lib/broken-appts/types';

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
  logoUrl: '',
  brandColor: '#53406e',
  brandTint: '#f3f0f8',
};

const PATIENT: BaPatientFields = {
  firstName: 'Ann',
  lastName: 'Example',
  addressLine1: '12 Test Lane',
  city: 'Springvale',
  state: 'MA',
  zip: '02100',
  apptDateISO: '2026-08-10',
};

const rows = (n: number): BaCanceledAppt[] =>
  Array.from({ length: n }, (_, i) => ({
    date: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`,
    time: '9:00 AM',
    provider: i % 2 ? 'Dr. Scott' : 'Hygiene — Kelly',
    visitType: i % 2 ? 'Crown prep and delivery' : 'Prophy + exam',
  }));

const letters = DEFAULT_BA_TEMPLATES.filter(t => t.kind === 'letter');
const body = (code: string) => letters.find(l => l.code === code)!.body;

interface Variant {
  name: string;
  code: string;
  canceledAppts: BaCanceledAppt[];
  expectedPages: number;
  expectAttachment: boolean;
}

const VARIANTS: Variant[] = [
  { name: '9101a', code: '9101A', canceledAppts: [], expectedPages: 1, expectAttachment: false },
  { name: '9100a', code: '9100A', canceledAppts: [], expectedPages: 1, expectAttachment: false },
  { name: '9106', code: '9106', canceledAppts: [], expectedPages: 1, expectAttachment: false },
  { name: '9107-3rows', code: '9107', canceledAppts: rows(3), expectedPages: 1, expectAttachment: false },
  { name: '9107-12rows', code: '9107', canceledAppts: rows(12), expectedPages: 2, expectAttachment: true },
];

for (const v of VARIANTS) {
  const markup = renderToStaticMarkup(
    <>
      <BrandPrintStyle branding={BRANDING} />
      <div className="ba-print-root">
        <BaLetterSheet
          branding={BRANDING}
          settings={DEFAULT_BA_SETTINGS}
          body={body(v.code)}
          patient={PATIENT}
          canceledAppts={v.canceledAppts}
          todayMDY="8/3/2026"
        />
      </div>
    </>
  );
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${preflight}</style><style>${css}</style></head><body>${markup}</body></html>`;
  fs.writeFileSync(path.join(OUT, `${v.name}.html`), html);
}
fs.writeFileSync(path.join(OUT, 'variants.json'), JSON.stringify(VARIANTS, null, 2));

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
    const letter = document.querySelector('.ba-letter');
    return {
      text: letter?.textContent ?? '',
      hasAttachment: !!document.querySelector('.ba-attach-page'),
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
