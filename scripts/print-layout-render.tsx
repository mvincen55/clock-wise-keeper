/**
 * Print layout check, step 1 of 2 — render the FOF print portal exactly
 * as FofBuilder does, for a matrix of real-world states:
 *
 *   - each live template as a BLANK form (the fragile sparse/roomy path
 *     that once pushed the signature block onto a second page),
 *   - default branding (wide logo), test branding (near-square uploaded
 *     logo + red accent via BrandPrintStyle), and no logo at all,
 *   - one filled dense-path form.
 *
 * Writes standalone HTML pages (real index.css + a Tailwind-preflight
 * stand-in) into .repro/ for scripts/print-layout-check.mjs to print
 * through Chromium and measure.
 *
 * Run:  npx vite-node scripts/print-layout-render.tsx
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import FofPrintSheet from '@/components/fof/FofPrintSheet';
import BrandPrintStyle from '@/components/BrandPrintStyle';
import {
  BLANK_AMOUNTS,
  BLANK_COMPUTATION,
  BLANK_PATIENT,
  LIVE_TEMPLATES,
  PRACTICE_DEFAULT_BRANDING,
} from '@/test/blank-form-fixtures';
import type { FofAmounts, FofComputation, FofPracticeInfo, FofTemplate } from '@/lib/fof/types';

const OUT = path.resolve(__dirname, '../.repro');
fs.mkdirSync(OUT, { recursive: true });

const css = fs
  .readFileSync(path.resolve(__dirname, '../src/index.css'), 'utf8')
  .replace(/@tailwind [^;]+;/g, '')
  .replace(/@apply [^;]+;/g, '');

// The app ships Tailwind preflight; the parts that affect print layout.
const preflight =
  '*,::before,::after{box-sizing:border-box;border-width:0;border-style:solid}' +
  'body{margin:0;line-height:inherit}h1,h2,h3,h4,p{margin:0}' +
  'table{border-collapse:collapse}img{display:block;max-width:100%;height:auto}';

/** Minimal solid-gray PNG of the given pixel size (aspect is what matters). */
function syntheticPng(width: number, height: number): string {
  const crcTable: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width, 0x88)]);
  const idat = zlib.deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

// Same aspect ratios as the office's real logos: the original wide
// artwork (848x271) and the uploaded near-square test logo (1024x950).
const wideLogo = syntheticPng(848, 271);
const squareLogo = syntheticPng(1024, 950);

const LIVE_BRAND = { brandColor: '#ff0000', brandTint: '#f3f0f8' };

// Filled dense-path content (long treatment + both appended footnotes).
const FILLED_PATIENT = {
  patientName: 'Reference Patient',
  dateISO: '2026-07-24',
  treatment:
    'Dr. Scott will prepare tooth #14 for a porcelain crown, place a composite filling on tooth #19, and use a surgical guide on implant surgery day, designed to help rebuild a strong, functional bite.',
};
const FILLED_TEMPLATE: FofTemplate = {
  ...LIVE_TEMPLATES[2], // Out-of-Network Insurance
  footnotes: [
    'Your dental plan applies an "alternate benefit" to tooth-colored (composite) fillings on back teeth: insurance pays as if a silver (amalgam) filling were placed. You still receive the tooth-colored filling; the difference up to our standard fee is included in your portion.',
    "Because this treatment continues into your next insurance benefit year, part of the estimate is paid from next year's renewed benefits: your annual maximum starts over for the visits after renewal, and your deductible applies again. If your coverage changes at renewal, this estimate may change as well.",
  ],
};
const FILLED_AMOUNTS: FofAmounts = {
  ...BLANK_AMOUNTS,
  totalCents: 412_500,
  insuranceEstimateCents: 98_500,
};
const FILLED_COMPUTATION: FofComputation = {
  ...BLANK_COMPUTATION,
  computed: {
    patientPortionCents: 314_000,
    discountCents: 31_400,
    prepayTotalCents: 282_600,
    installmentsCents: [94_000, 110_000, 110_000],
  },
  effective: {
    patientPortionCents: 314_000,
    discountCents: 31_400,
    prepayTotalCents: 282_600,
    installmentsCents: [94_000, 110_000, 110_000],
  },
};
const FILLED_LINES = [
  {
    code: 'D2740', tooth: '14', visit: '2', category: 'Major',
    description: 'Crown - porcelain/ceramic', entryDate: '',
    officeFeeCents: 165_000, allowableCents: 120_000, insPaysCents: 60_000, writeOffCents: 0,
  },
  {
    code: 'D2392', tooth: '19', visit: '1', category: 'Basic',
    description: 'Resin composite - 2 surfaces, posterior', entryDate: '',
    officeFeeCents: 32_500, allowableCents: 21_500, insPaysCents: 17_200, writeOffCents: 0,
  },
  {
    code: 'D5982', tooth: '', visit: '3', category: 'No Coverage',
    description: 'Surgical stent', entryDate: '',
    officeFeeCents: 45_000, allowableCents: null, insPaysCents: 0, writeOffCents: 0,
  },
  {
    code: 'D6010', tooth: '30', visit: '3', category: 'Major',
    description: 'Surgical placement of implant body', entryDate: '',
    officeFeeCents: 170_000, allowableCents: 140_000, insPaysCents: 21_300, writeOffCents: 0,
  },
];

interface Variant {
  name: string;
  logoUrl: string;
  brand?: { brandColor: string; brandTint: string };
  template: FofTemplate;
  filled?: boolean;
  extreme?: boolean;
}

// Extreme dense-path case modeled on a real large treatment plan: a
// long multi-procedure narrative, an appended footnote, both payment
// options, custom installment labels, and a 14-line office copy with
// the Entry Date column active (PMS screenshot import).
const EXTREME_TEMPLATE: FofTemplate = {
  ...LIVE_TEMPLATES[0], // Self-Pay
  discountPercent: 5,
  footnotes: [
    'Provisional (temporary) restorations and dentures are included with the final prosthesis fee; adjustments to the partial denture are included for six months after delivery.',
  ],
};
const EXTREME_PATIENT = {
  patientName: 'Layout Stress Case',
  dateISO: '2026-07-27',
  treatment:
    'Dr. Scott will extract tooth #24, place composite fillings on teeth #22, #26, and #27, complete provisional splinting on teeth #23 and #26, and fabricate a lower partial denture replacing teeth #19 and #30, including bite rims, wax try-in, framework try-in, and delivery visits, designed to help rebuild a strong, functional bite you can rely on for years to come.',
};
const EXTREME_AMOUNTS: FofAmounts = { ...BLANK_AMOUNTS, totalCents: 615_700 };
const EXTREME_COMPUTATION: FofComputation = {
  ...BLANK_COMPUTATION,
  computed: {
    patientPortionCents: 615_700,
    discountCents: 30_785,
    prepayTotalCents: 584_915,
    installmentsCents: [285_300, 165_200, 165_200],
  },
  effective: {
    patientPortionCents: 615_700,
    discountCents: 30_785,
    prepayTotalCents: 584_915,
    installmentsCents: [285_300, 165_200, 165_200],
  },
  installmentLabels: ['Upon Scheduling', 'At the Extraction Visit', 'On Partial Delivery'],
};
const EXTREME_LINES = [
  ['D2331', '22', '1', 'Basic', 'Composite Filling', 30_300],
  ['D4320', '23', '1', 'Basic', 'Provisional Splinting', 85_900],
  ['D7140', '24', '1', 'Basic', 'Tooth Extraction', 0],
  ['D2331', '26', '1', 'Basic', 'Composite Filling', 30_300],
  ['D4320', '26', '1', 'Basic', 'Provisional Splinting', 85_900],
  ['D2330', '27', '1', 'Basic', 'Composite Filling', 22_600],
  ['D2331', '27', '1', 'Basic', 'Composite Filling', 30_300],
  ['5005', '', '2', 'No Coverage', 'PrtDntCzn', 39_500],
  ['5011', '', '2', 'No Coverage', 'DentLab', 41_700],
  ['D5214', '19+30', '2', 'Major', 'Lower Partial Denture', 249_200],
  ['5001', '19+31', '2', 'No Coverage', 'Fimp Dent', 0],
  ['5002', '19+31', '3', 'No Coverage', 'BiteRims', 0],
  ['5004', '21', '3', 'No Coverage', 'PFrTryin', 0],
  ['5008', '19+31', '5', 'No Coverage', 'Dent Del', 0],
].map(([code, tooth, visit, category, description, fee]) => ({
  code: code as string,
  tooth: tooth as string,
  visit: visit as string,
  category: category as string,
  description: description as string,
  entryDate: '6/30/2026',
  officeFeeCents: fee as number,
  allowableCents: null,
  insPaysCents: 0,
  writeOffCents: 0,
}));

const variants: Variant[] = [
  ...LIVE_TEMPLATES.flatMap(t => [
    { name: `blank-${t.id}-default-brand`, logoUrl: wideLogo, template: t },
    { name: `blank-${t.id}-test-brand`, logoUrl: squareLogo, brand: LIVE_BRAND, template: t },
  ]),
  { name: 'blank-self-pay-no-logo', logoUrl: '', template: LIVE_TEMPLATES[0] },
  { name: 'filled-oon-default-brand', logoUrl: wideLogo, template: FILLED_TEMPLATE, filled: true },
  {
    name: 'filled-extreme-test-brand',
    logoUrl: squareLogo,
    brand: LIVE_BRAND,
    template: EXTREME_TEMPLATE,
    filled: true,
    extreme: true,
  },
];

for (const v of variants) {
  const practice: FofPracticeInfo = { ...PRACTICE_DEFAULT_BRANDING, logoUrl: v.logoUrl };
  const sheet = (
    <FofPrintSheet
      practice={practice}
      template={v.template}
      patient={v.extreme ? EXTREME_PATIENT : v.filled ? FILLED_PATIENT : BLANK_PATIENT}
      amounts={v.extreme ? EXTREME_AMOUNTS : v.filled ? FILLED_AMOUNTS : BLANK_AMOUNTS}
      computation={v.extreme ? EXTREME_COMPUTATION : v.filled ? FILLED_COMPUTATION : BLANK_COMPUTATION}
      officeLines={v.extreme ? EXTREME_LINES : v.filled ? FILLED_LINES : []}
      createdBy="Megan Vincent"
      doctorName={v.filled ? 'Dr. Scott' : ''}
      importedFromScreenshot={v.extreme}
    />
  );
  const body = renderToStaticMarkup(
    <>
      {v.brand && <BrandPrintStyle branding={v.brand} />}
      <div id="root" />
      <div className="fof-print-root">{sheet}</div>
    </>
  );
  fs.writeFileSync(
    path.join(OUT, `${v.name}.html`),
    `<!doctype html><html><head><meta charset="utf-8"><style>${preflight}</style><style>${css}</style></head><body>${body}</body></html>`
  );
  console.log('wrote', `${v.name}.html`);
}
