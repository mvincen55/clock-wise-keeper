/** Responsive dashboard and interaction checks using synthetic records only. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const output = path.resolve('.repro/dashboard-browser');
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/dashboard-browser-fixture.tsx"></script></body></html>');
const spec = process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright';
const { chromium } = await import(spec);
const server = await createServer({ configFile: false, root: process.cwd(), resolve: { alias: { '@': path.resolve('src') } }, esbuild: { jsx: 'automatic' }, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
let browser;
try {
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const context = await browser.newContext();
  await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  for (const role of ['manager', 'owner', 'member']) {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto(`${origin}/.repro/dashboard-browser/index.html?role=${role}`);
    await page.getByRole('heading', { name: 'Goals we’re working toward' }).waitFor();
    if (role !== 'member') {
      assert.equal(await page.getByRole('button', { name: role === 'owner' ? 'Year to date' : 'This month', pressed: true }).count(), 1);
      await page.getByRole('button', { name: 'Year to date' }).click();
      assert.equal(await page.getByText('Monthly totals · same dates across three years').count(), 1);
      await page.getByRole('button', { name: 'Production', exact: true }).click();
      assert.equal(await page.getByRole('region', { name: 'Production over time' }).count(), 1);
      await page.getByRole('button', { name: 'Collections', exact: true }).click();
      await page.getByRole('combobox', { name: 'Team member' }).selectOption('u-priya');
      assert.equal(await page.getByRole('heading', { name: 'Build confidence with treatment conversations' }).count(), 1);
      assert.equal(await page.getByRole('region', { name: 'Team today' }).count(), 1);
      await page.getByText('View chart data', { exact: true }).click();
      assert.ok(await page.getByRole('table').isVisible());
      await page.getByText('View chart data', { exact: true }).click();
      if (role === 'manager') await page.getByRole('button', { name: 'This month' }).click();
    } else {
      assert.equal(await page.getByRole('combobox', { name: 'Team member' }).count(), 0);
      assert.equal(await page.getByRole('heading', { name: 'Make every handoff clear' }).count(), 1);
      assert.equal(await page.getByText('Our office goals this month', { exact: true }).count(), 1);
    }
    for (const width of [1440, 850, 390]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth }));
      await page.screenshot({ path: path.join(output, `${role}-${width}.png`), fullPage: true });
      if (size.scroll > size.viewport + 1) console.log('Overflow elements', JSON.stringify(await page.locator('body *').evaluateAll(els => els.filter(el => el.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(el).display !== 'none').slice(0, 20).map(el => ({ tag: el.tagName, class: el.className?.baseVal ?? el.className, width: el.getBoundingClientRect().width, right: el.getBoundingClientRect().right })))));
      assert.ok(size.scroll <= size.viewport + 1, `${role} overflows at ${width}: ${JSON.stringify(size)}`);
      assert.doesNotMatch(await page.locator('body').innerText(), /Office day \d+\.\d+/);

    }
  }
  assert.deepEqual(errors, []);
  console.log('Dashboard browser checks passed: three roles at desktop, tablet and phone widths; month/YTD, metric, member selection and chart table.');
} finally { await browser?.close(); await server.close(); }
