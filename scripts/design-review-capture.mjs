// Captures the role-dashboard design-review scenarios at desktop and phone
// widths. Fixture data only (obviously fictional names, no session, no
// queries). Run with a dev server up:
//   npx vite --port 5173 --host 127.0.0.1 &
//   node scripts/design-review-capture.mjs [base] [slug ...]
// Uses the globally installed Playwright and the preinstalled Chromium.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] || 'http://127.0.0.1:5173';
const slugs = process.argv.slice(3).length
  ? process.argv.slice(3)
  : ['owner', 'owner-closed', 'owner-new', 'owner-incomplete', 'manager', 'manager-closed', 'manager-off-pace', 'manager-new', 'hygienist', 'member-hidden-financials', 'member-new'];
const sizes = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
];
mkdirSync('design-review', { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let failures = 0;
for (const slug of slugs) {
  for (const size of sizes) {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // Resource loads (fonts, the Supabase client's first probe) depend on the
    // sandbox's network; only page and script errors count against a capture.
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    await page.goto(`${base}/design-review/dashboard/${slug}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    const file = `design-review/${slug}-${size.name}.png`;
    await page.screenshot({ path: file, fullPage: true });
    const status = errors.length || overflow ? 'FAIL' : 'ok';
    if (status === 'FAIL') failures += 1;
    console.log(`${status} ${file}${overflow ? ' (horizontal overflow)' : ''}${errors.length ? ` errors: ${errors.join(' | ')}` : ''}`);
    await page.close();
  }
}
await browser.close();
process.exit(failures ? 1 : 0);
