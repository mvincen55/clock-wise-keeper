/** Real desktop/mobile, PDF, workbook and reader checks. Synthetic data only.
 * Real handwriting must still pass the campaign validation gate separately. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { unzipSync, strFromU8 } from 'fflate';

const root = process.cwd(), output = path.resolve('.repro/fill-schedule-browser');
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/.repro/fill-schedule-browser/entry.tsx"></script></body></html>');
await fs.writeFile(path.join(output, 'hook.ts'), `
import { fixture } from '@/test/fixtures/fill-schedule';
export function useFillSchedule() { return { data: fixture(), ctx: { employee_id: 'staff', org_id: 'org', org_name: 'Harelick Dental Associates LLC' }, manager: new URLSearchParams(location.search).get('role') !== 'staff', isLoading: false, error: null, contextLoading: false, contextError: null, refetch: async () => {} }; }
export function useFillScheduleWrite() { return { write: async () => true, busy: false, error: '', message: '', resultRef: { current: null } }; }
`);
await fs.writeFile(path.join(output, 'entry.tsx'), `
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import FillSchedule from '@/pages/FillSchedule';
import SheetPrint from '@/features/fill-the-schedule/SheetPrint';
import { readLocalSheet } from '@/features/fill-the-schedule/sheet-reader';
import { fixture } from '@/test/fixtures/fill-schedule';
import '@/index.css';
const mode = new URLSearchParams(location.search).get('mode');
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={[mode === 'print' ? '/fill-the-schedule/sheet/sheet' : '/fill-the-schedule']}><Routes><Route path="/fill-the-schedule" element={<FillSchedule />} /><Route path="/fill-the-schedule/sheet/:sheetId" element={<SheetPrint />} /></Routes></MemoryRouter>);
Object.assign(window, { q4Read: async (bytes: number[]) => { const d = fixture(); return await readLocalSheet(new File([new Uint8Array(bytes)], 'synthetic.pdf', { type: 'application/pdf' }), d, d.sheets![0], () => {}); } });
`);
const spec = process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright';
const { chromium } = await import(spec);
const server = await createServer({ configFile: false, root,
  resolve: { alias: { '@/hooks/useFillSchedule': path.join(output, 'hook.ts'), '@': path.join(root, 'src') } }, esbuild: { jsx: 'automatic' },
  server: { host: '127.0.0.1', port: 0, fs: { allow: [root, await fs.realpath(path.join(root, 'node_modules'))] } },
});
await server.listen(); const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
let browser;
try {
  browser = await chromium.launch({ args: ['--no-sandbox'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  const context = await browser.newContext();
  const external = [];
  await context.route('**/*', route => { const url = route.request().url(); if (url.startsWith(origin)) return route.continue(); external.push(url); return route.abort(); });
  const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
  for (const role of ['staff', 'manager']) {
    await page.goto(`${origin}/.repro/fill-schedule-browser/index.html?role=${role}`);
    await page.getByRole('heading', { name: 'Fill the Schedule', exact: true }).waitFor();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      const tabs = role === 'staff' ? ['Record', 'My points'] : ['Review', 'Weekly scorecard'];
      await page.getByRole('tab', { name: tabs[0], exact: true }).waitFor();
      assert.equal(await page.getByRole('tab').count(), 2);
      for (const tab of tabs) {
        await page.getByRole('tab', { name: tab, exact: true }).click();
        const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
        assert.ok(size.scroll <= size.width + 1, `${role}/${tab}/${width} horizontal overflow`);
        if (role === 'manager' && tab === 'Review') { const badge = await page.locator('article').getByText('Awaiting verification', { exact: true }).first().boundingBox(); assert.ok(badge && badge.height < 40, 'Status badge must not stretch to the card height'); }
        await page.screenshot({ path: path.join(output, `${role}-${tab.replaceAll(' ', '-')}-${width}.png`), fullPage: true });
      }
      await page.getByRole('button', { name: 'Point rules', exact: true }).click();
      await page.screenshot({ path: path.join(output, `${role}-rules-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Close', exact: true }).click();
    }
  }
  await page.goto(`${origin}/.repro/fill-schedule-browser/index.html?role=manager&mode=print`);
  await page.getByRole('button', { name: 'Print this sheet', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  external.length = 0; // Existing public font styling is outside the local reader.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: path.join(output, 'sheet-preview.png'), fullPage: true });
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download spreadsheet' }).click();
  const download = await downloadEvent; await download.saveAs(path.join(output, 'Front_Desk_S-1009-A.xlsx'));
  const files = unzipSync(new Uint8Array(await fs.readFile(path.join(output, 'Front_Desk_S-1009-A.xlsx'))));
  const form = strFromU8(files['xl/worksheets/sheet1.xml']);
  assert.ok(form.includes('S-1009-A') && !form.includes('__SHEET_CODE__'));
  assert.match(form, /orientation="landscape"/);
  for (const zoom of [1, .67, 1.25]) {
    await page.evaluate(z => { document.documentElement.style.zoom = String(z); }, zoom);
    const bytes = await page.pdf({ path: path.join(output, `sheet-${zoom}.pdf`), preferCSSPageSize: true, printBackground: true });
    // The reader rejects multi-page PDFs, missing corners and mismatched codes.
    // Blank pages must never manufacture reports or checkmarks.
    const blank = await page.evaluate(bytes => window.q4Read(bytes), [...bytes]);
    assert.deepEqual(blank.rows, [], `Blank printed sheet at zoom ${zoom} must produce zero rows`);
  }
  await page.evaluate(() => {
    document.documentElement.style.zoom = '1';
    for (const form of document.querySelectorAll('.fts-sheet-page')) {
      const cells = form.querySelector('tbody tr').cells;
      cells[1].textContent = '10/5'; cells[2].textContent = '10:00am'; cells[3].textContent = 'Test Assistant';
      for (const col of [5, 9, 10]) cells[col].querySelector('.fts-check').style.background = 'black';
      cells[6].querySelector('.fts-check.fts-yes').style.background = 'black';
      cells[6].querySelector('.fts-pay-time').textContent = '10/5 10:15am';
      for (const col of [9, 10]) {
        const initials = document.createElement('span'); initials.textContent = 'MG'; initials.style.cssText = 'position:absolute;left:52px;top:4px;font-size:12px;'; cells[col].append(initials);
      }
    }
  });
  const filledBytes = await page.pdf({ path: path.join(output, 'synthetic-filled.pdf'), preferCSSPageSize: true, printBackground: true });
  const filled = await page.evaluate(bytes => window.q4Read(bytes), [...filledBytes]);
  assert.equal(filled.rows.length, 1, 'Only the filled row is read');
  assert.equal(filled.rows[0].credit_employee_id, 'staff');
  assert.equal(filled.rows[0].occurred_at, '2026-10-05T14:00:00.000Z');
  assert.equal(filled.rows[0].staff_confirmed, true);
  assert.equal(filled.rows[0].handoff_verified, true);
  assert.equal(filled.rows[0].prepay_verified, true);
  assert.equal(filled.rows[0].prepay_at, '2026-10-05T14:15:00.000Z');
  assert.equal(filled.rows[0].crossed_out, false);
  assert.ok(filled.rows[0].confidence.handoff_verified < .85, 'Synthetic rows do not bypass real handwriting validation');
  await page.evaluate(() => { for (const form of document.querySelectorAll('.fts-sheet-page')) { const stroke = document.createElement('span'); stroke.style.cssText = 'position:absolute;left:53px;top:233px;width:302px;height:2px;background:black;'; form.append(stroke); } });
  const crossedBytes = await page.pdf({ path: path.join(output, 'synthetic-crossed.pdf'), preferCSSPageSize: true, printBackground: true });
  const crossed = await page.evaluate(bytes => window.q4Read(bytes), [...crossedBytes]);
  assert.equal(crossed.rows[0].crossed_out, true, 'A crossed-out row goes to review');
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  console.log('PASS: two tabs, desktop/phone layouts, rules, workbook download, one-page PDFs at 67/100/125%, zero blank-sheet reports, structured local read, cross-out flag and validation gate. No external requests during sheet reading.');
} finally { await browser?.close(); await server.close(); }
