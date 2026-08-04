/**
 * Broken Appointments print check — renders the shipped letters with test
 * data exactly as the page's print portal does (real index.css), prints
 * them through real Chromium, and FAILS unless:
 *
 *   - 0001 / 0002 / 0003 / 0004 / 0005-with-3-rows (including the
 *     failed-card 0005 variant) are each exactly ONE page,
 *   - 0005 with 12 canceled appointments is exactly TWO pages (letter +
 *     "Attached Appointment List" page) with the inline table replaced by
 *     the attachment note,
 *   - every letter passes both with an org logo and with none (text-only
 *     letterhead fallback),
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
import { formatMoney, mergeFields } from '@/lib/broken-appts/outputs';
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

// A wide-ish inline SVG stand-in for an uploaded org logo (data URI so the
// check needs no network).
const TEST_LOGO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80">' +
      '<rect width="240" height="80" rx="8" fill="#53406e"/>' +
      '<text x="120" y="50" font-family="Helvetica" font-size="28" fill="white" text-anchor="middle">LOGO</text>' +
      '</svg>'
  );

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

// Card-state snippets resolve exactly as the page resolves them.
const snippetFields = { fee_amount: formatMoney(DEFAULT_BA_SETTINGS.feeAmount) };
const snippet = (code: string) =>
  mergeFields(DEFAULT_BA_TEMPLATES.find(t => t.kind === 'snippet' && t.code === code)!.body, snippetFields);

interface Variant {
  name: string;
  code: string;
  canceledAppts: BaCanceledAppt[];
  extraFields: Record<string, string>;
  expectedPages: number;
  expectAttachment: boolean;
}

const BASE_VARIANTS: Omit<Variant, 'name'>[] = [
  { code: '0001', canceledAppts: [], extraFields: {}, expectedPages: 1, expectAttachment: false },
  {
    code: '0002',
    canceledAppts: [],
    extraFields: { card_sentence: snippet('card_needed') },
    expectedPages: 1,
    expectAttachment: false,
  },
  {
    code: '0003',
    canceledAppts: [],
    extraFields: { card_sentence: snippet('card_have') },
    expectedPages: 1,
    expectAttachment: false,
  },
  {
    code: '0004',
    canceledAppts: [],
    extraFields: { transaction_snippet: snippet('txn_posted') },
    expectedPages: 1,
    expectAttachment: false,
  },
  {
    code: '0005',
    canceledAppts: rows(3),
    extraFields: { transaction_snippet: snippet('txn_charged') },
    expectedPages: 1,
    expectAttachment: false,
  },
  {
    code: '0005',
    canceledAppts: rows(3),
    extraFields: { transaction_snippet: snippet('txn_posted_card_failed') },
    expectedPages: 1,
    expectAttachment: false,
  },
  {
    code: '0005',
    canceledAppts: rows(12),
    extraFields: { transaction_snippet: snippet('txn_charged') },
    expectedPages: 2,
    expectAttachment: true,
  },
];

// Every variant prints once with the test logo and once without — the
// letterhead must hold up (and stay one page) both ways.
const VARIANTS: (Variant & { logo: boolean })[] = BASE_VARIANTS.flatMap((v, i) =>
  [false, true].map(logo => ({
    ...v,
    name: `${v.code}-${i}${v.expectAttachment ? '-12rows' : ''}${logo ? '-logo' : ''}`,
    logo,
  }))
);

for (const v of VARIANTS) {
  const markup = renderToStaticMarkup(
    <>
      <BrandPrintStyle branding={BRANDING} />
      <div className="ba-print-root">
        <BaLetterSheet
          branding={{ ...BRANDING, logoUrl: v.logo ? TEST_LOGO : '' }}
          settings={DEFAULT_BA_SETTINGS}
          body={body(v.code)}
          patient={PATIENT}
          canceledAppts={v.canceledAppts}
          todayMDY="8/3/2026"
          extraFields={v.extraFields}
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
    const logo = document.querySelector<HTMLImageElement>('.ba-logo');
    return {
      text: letter?.textContent ?? '',
      hasAttachment: !!document.querySelector('.ba-attach-page'),
      hasInlineNote: (letter?.textContent ?? '').includes('A full appointment list is attached'),
      hasLogo: !!logo,
      logoLoaded: !!logo && logo.complete && logo.naturalWidth > 0,
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
  if (v.logo && !info.logoLoaded) problems.push('org logo missing or failed to load');
  if (!v.logo && info.hasLogo) problems.push('logo img rendered with no logo configured');

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
