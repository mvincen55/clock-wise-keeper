// Captures the role-dashboard design-review scenarios at desktop, tablet,
// and phone widths. Fixture data only (obviously fictional names, no
// session, no queries). Run with a dev server up:
//   npx vite --port 5173 --host 127.0.0.1 &
//   node scripts/design-review-capture.mjs [base] [slug ...]
// Uses the globally installed Playwright and the preinstalled Chromium.
// Each capture reports page errors, horizontal overflow, and the smallest
// rendered font size on the page (the readability floor).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] || 'http://127.0.0.1:5173';
const slugs = process.argv.slice(3).length
  ? process.argv.slice(3)
  : [
      'owner', 'owner-clear', 'owner-closed', 'owner-incomplete', 'owner-partial', 'owner-off-calendar', 'owner-new',
      'manager', 'manager-clear', 'manager-attendance', 'manager-closed', 'manager-off-pace', 'manager-new', 'manager-front-desk',
      'front-desk', 'hygienist', 'dental-assistant', 'member-late-arrival', 'member-hidden-financials', 'member-clear', 'member-new',
      'front-desk-backup-assistant', 'front-desk-backup-only',
    ];
const sizes = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'mobile', width: 390, height: 844 },
];
const only = process.env.SIZES ? process.env.SIZES.split(',') : null;
mkdirSync('design-review', { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
let failures = 0;
for (const slug of slugs) {
  for (const size of sizes) {
    if (only && !only.includes(size.name)) continue;
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // Resource loads (fonts, the Supabase client's first probe) depend on the
    // sandbox's network; only page and script errors count against a capture.
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    await page.goto(`${base}/design-review/dashboard/${slug}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const { overflow, minFont } = await page.evaluate(() => {
      const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth;
      let minFont = Infinity;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const root = document.querySelector('[data-review-root]') ?? document.body;
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent || !node.textContent.trim() || !root.contains(node)) continue;
        const el = node.parentElement;
        if (!el || el.closest('[data-review-notes], svg, .sr-only')) continue;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const size = parseFloat(style.fontSize);
        if (size > 0) minFont = Math.min(minFont, size);
      }
      return { overflow, minFont };
    });
    const file = `design-review/${slug}-${size.name}.png`;
    await page.screenshot({ path: file, fullPage: true });
    const status = errors.length || overflow ? 'FAIL' : 'ok';
    if (status === 'FAIL') failures += 1;
    console.log(`${status} ${file}${overflow ? ' (horizontal overflow)' : ''} · smallest text ${Number.isFinite(minFont) ? `${minFont}px` : 'n/a'}${errors.length ? ` errors: ${errors.join(' | ')}` : ''}`);
    await page.close();
  }
}
await browser.close();
process.exit(failures ? 1 : 0);
