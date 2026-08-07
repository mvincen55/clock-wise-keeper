/**
 * "Create one for me" render check — bundles the signature generator,
 * runs it in real Chromium against the vendored fonts, and FAILS unless:
 *
 *   - every bundled signature font loads,
 *   - every generated option renders with real ink (not blank, not a
 *     fallback-font sliver),
 *   - options within a set differ from each other pixel-wise,
 *   - regenerating with a new seed changes the set.
 *
 * Also writes a montage PNG (.repro-signatures/options.png) for a human
 * look at signature quality.
 *
 * Run:  node scripts/signature-generate-check.mjs [--name "Full Name"]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, '.repro-signatures');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const nameArg = process.argv.indexOf('--name');
const NAME = nameArg !== -1 ? process.argv[nameArg + 1] : 'Megan Vincent';

// Bundle the generator for the browser.
const bundle = path.join(OUT, 'signature-generate.iife.js');
execFileSync('npx', [
  'esbuild', 'src/lib/letters/signature-generate.ts',
  '--bundle', '--format=iife', '--global-name=SigGen', `--outfile=${bundle}`,
], { cwd: root, stdio: 'inherit' });

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

const chromium = await loadChromium();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
});
const page = await browser.newPage();
fs.writeFileSync(path.join(OUT, 'blank.html'), '<!doctype html><html><body></body></html>');
await page.goto('file://' + path.join(OUT, 'blank.html'));
await page.addScriptTag({ path: bundle });

const result = await page.evaluate(
  async ({ name, fontsBase }) => {
    // Point the font manifest at the vendored files on disk.
    for (const f of SigGen.SIGNATURE_FONTS) f.url = fontsBase + f.url;

    const inkPixels = canvas => {
      const ctx = canvas.getContext('2d');
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let n = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 16) n++;
      return n;
    };

    const renderSet = async seed => {
      const set = [];
      for (const option of SigGen.generateSignatureOptions(name, seed, 6)) {
        const canvas = await SigGen.renderSignatureOption(option);
        set.push({
          fontKey: option.fontKey,
          text: option.text,
          ink: canvas ? inkPixels(canvas) : 0,
          dataUrl: canvas ? canvas.toDataURL('image/png') : null,
        });
      }
      return set;
    };

    const setA = await renderSet(1234);
    const setB = await renderSet(5678);

    // Montage for human review.
    const montage = document.createElement('canvas');
    montage.width = 900;
    montage.height = 270 * setA.length;
    const mctx = montage.getContext('2d');
    mctx.fillStyle = '#ffffff';
    mctx.fillRect(0, 0, montage.width, montage.height);
    let y = 0;
    for (const opt of setA) {
      if (opt.dataUrl) {
        const img = new Image();
        await new Promise(res => { img.onload = res; img.src = opt.dataUrl; });
        mctx.drawImage(img, 0, y);
      }
      mctx.strokeStyle = '#ddd';
      mctx.strokeRect(0, y, montage.width, 260);
      y += 270;
    }

    return {
      setA: setA.map(({ dataUrl, ...rest }) => rest),
      distinctA: new Set(setA.map(o => o.dataUrl)).size,
      abDiffer: JSON.stringify(setA.map(o => o.dataUrl)) !== JSON.stringify(setB.map(o => o.dataUrl)),
      montage: montage.toDataURL('image/png'),
    };
  },
  { name: NAME, fontsBase: 'file://' + path.join(root, 'public') },
);

fs.writeFileSync(
  path.join(OUT, 'options.png'),
  Buffer.from(result.montage.split(',')[1], 'base64'),
);

let failures = 0;
for (const opt of result.setA) {
  // A blank canvas is ~0; a name in a loaded handwriting face at 44-60px
  // lays down thousands of ink pixels.
  if (opt.ink < 2000) {
    failures++;
    console.error(`FAIL ${opt.fontKey}: only ${opt.ink} ink pixels for "${opt.text}"`);
  } else {
    console.log(`ok   ${opt.fontKey} — "${opt.text}" (${opt.ink} ink px)`);
  }
}
if (result.distinctA !== result.setA.length) {
  failures++;
  console.error(`FAIL options are not pixel-distinct (${result.distinctA}/${result.setA.length})`);
}
if (!result.abDiffer) {
  failures++;
  console.error('FAIL regenerating with a new seed produced the identical set');
}

await browser.close();

if (failures) {
  console.error(`\n${failures} signature-generation check(s) failed`);
  process.exit(1);
}
console.log(`\nall generated-signature checks passed — montage at .repro-signatures/options.png`);
