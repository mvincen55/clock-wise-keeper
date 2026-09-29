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
 *   - the office-copy page is present (never silently dropped),
 *   - a long plan (long-*.html) paginates its office copy over as many
 *     Letter pages as it needs: the table header repeats on every office
 *     page, no row is split across pages, and the last line is printed.
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

async function pdfPageTexts(buf) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(buf), disableFontFace: true, verbosity: 0 }).promise;
  const texts = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    texts.push(content.items.map(item => item.str).join(' '));
  }
  return texts;
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
  const isLong = f.startsWith('long-');

  const problems = [];
  if (isLong) {
    // The office copy of a long plan legitimately runs past one page; what
    // must hold is that nothing is lost or torn across a page boundary.
    if (pages < 3) problems.push(`expected a multi-page office copy for a long plan, got ${pages} page(s)`);
    const texts = await pdfPageTexts(pdf);
    const officePages = texts.slice(1);
    const rowCount = await page.evaluate(() => document.querySelectorAll('.fof-office-page tbody tr:not(.fof-office-line-notes)').length);
    const printedRows = officePages.reduce((n, t) => n + (t.match(/\bD\d{4}\b/g) ?? []).length, 0);
    if (printedRows < rowCount) problems.push(`office copy printed ${printedRows} code cells for ${rowCount} rows — rows were dropped`);
    if (!officePages.at(-1).includes('D9999') && !officePages.at(-2)?.includes('D9999')) problems.push('the last office line (D9999) is missing from the office copy');
    // The table header is printed in small caps, so match it case-insensitively.
    const headerPages = officePages.filter(t => /CODE\s+TH\s+VISIT\s+CATEGORY/i.test(t)).length;
    const tablePages = officePages.filter(t => /\bD\d{4}\b/.test(t)).length;
    if (headerPages < tablePages) problems.push(`office table header repeats on ${headerPages} of ${tablePages} table pages`);
    // A row torn across pages leaves a page that ends with a code but no amount after it.
    for (const [i, t] of officePages.entries()) {
      const tail = t.trim().slice(-120);
      if (/\bD\d{4}\b[^$]*$/.test(tail) && !/\$[\d,]+\.\d{2}\s*$/.test(tail) && !tail.includes('not for distribution') && !tail.endsWith('—')) {
        problems.push(`office page ${i + 2} ends mid-row: "…${tail.slice(-60)}"`);
      }
    }
  } else if (pages !== 2) problems.push(`expected 2 PDF pages (patient + office copy), got ${pages}`);
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
console.log(`\nall ${files.length} variants fit: one patient page + a complete office copy (long plans paginate)`);
