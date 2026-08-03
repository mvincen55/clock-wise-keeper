/**
 * Print layout check, step 2 of 2 — print every page rendered by
 * scripts/print-layout-render.tsx through real Chromium and FAIL unless,
 * for every variant:
 *
 *   - the PDF is exactly 2 pages (patient page + office copy),
 *   - the patient sheet fits its 10in printable box (960px @ 96dpi),
 *   - the patient sheet's NATURAL content height (min-height released)
 *     is at most 945px, keeping ~1.5% slack for machine font-metric
 *     differences — the signature block carries page-break-inside:
 *     avoid, so any overflow throws it alone onto a second page,
 *   - the office-copy page is present (never silently dropped).
 *
 * Run:  node scripts/print-layout-check.mjs
 * Needs a Playwright install (local dep or global); the browser path
 * can be overridden with CHROMIUM_PATH.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PAGE_PX = 960; // 10in printable height at 96dpi
const NATURAL_MAX_PX = 945; // slack for cross-machine font metrics

async function loadChromium() {
  for (const spec of ['playwright', 'playwright-core', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
    try {
      return (await import(spec)).chromium;
    } catch {
      /* try next */
    }
  }
  throw new Error('playwright not found — npm i -D playwright (or install globally)');
}

function pdfPageCount(buf) {
  const s = buf.toString('latin1');
  const m = s.match(/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/);
  return m ? Number(m[1]) : (s.match(/\/Type\s*\/Page[^s]/g) || []).length;
}

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.repro');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html')).sort();
if (files.length === 0) {
  console.error('no rendered pages — run: npx vite-node scripts/print-layout-render.tsx');
  process.exit(1);
}

const chromium = await loadChromium();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
});
// 720px viewport = the 7.5in printable width at 96dpi, so measured
// line-wrapping matches the paper.
const page = await browser.newPage({ viewport: { width: 720, height: 1200 } });

let failures = 0;
for (const f of files) {
  await page.goto('file://' + path.join(dir, f));
  await page.emulateMedia({ media: 'print' });
  const info = await page.evaluate(() => {
    const sheets = [...document.querySelectorAll('.fof-sheet')];
    const patient = sheets[0];
    const fitted = patient ? patient.getBoundingClientRect().height : 0;
    let natural = 0;
    if (patient) {
      const prev = patient.style.minHeight;
      patient.style.minHeight = '0';
      natural = patient.getBoundingClientRect().height;
      patient.style.minHeight = prev;
    }
    return {
      sheetCount: sheets.length,
      officeCopy: !!document.querySelector('.fof-office-page'),
      fitted: Math.round(fitted * 100) / 100,
      natural: Math.round(natural * 100) / 100,
    };
  });
  const pdf = await page.pdf({ format: 'Letter', printBackground: true, preferCSSPageSize: true });
  const pages = pdfPageCount(pdf);

  const problems = [];
  if (pages !== 2) problems.push(`expected 2 PDF pages (patient + office copy), got ${pages}`);
  if (!info.officeCopy) problems.push('office-copy page missing');
  if (info.sheetCount !== 2) problems.push(`expected 2 sheets, got ${info.sheetCount}`);
  if (info.fitted > PAGE_PX + 0.5)
    problems.push(`patient sheet overflows its page: ${info.fitted}px > ${PAGE_PX}px`);
  if (info.natural > NATURAL_MAX_PX)
    problems.push(`patient sheet too close to the page boundary: natural ${info.natural}px > ${NATURAL_MAX_PX}px`);

  if (problems.length) {
    failures++;
    console.error(`FAIL ${f}`);
    for (const p of problems) console.error(`  - ${p}`);
  } else {
    console.log(`ok   ${f} (pages=${pages}, natural=${info.natural}px)`);
  }
}
await browser.close();

if (failures) {
  console.error(`\n${failures} variant(s) failed the print layout check`);
  process.exit(1);
}
console.log(`\nall ${files.length} variants fit: one patient page + one office copy`);
