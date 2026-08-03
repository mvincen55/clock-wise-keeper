#!/usr/bin/env node
/**
 * Vendors the OCR engine into public/tesseract so the Schedule Reader runs
 * entirely against SAME-ORIGIN assets — no CDN at runtime, ever. The reader
 * fails closed (OCR_ASSETS_MISSING) instead of falling back to a remote host.
 *
 * Copies worker + wasm core from node_modules and fetches the English
 * traineddata once at build/dev time (build machines have network; user
 * browsers only ever talk to our own origin for these files).
 *
 * The vendored assets are COMMITTED so every build pipeline ships them —
 * Bun-based builds (Lovable) skip npm pre/post hooks, and a build without
 * these files deploys a reader that can only say OCR_ASSETS_MISSING. This
 * script runs inside `build`/`build:dev` (not just hooks) to refresh the
 * copies when tesseract.js versions bump; commit whatever it changes.
 */
import { createWriteStream } from 'node:fs';
import { access, copyFile, mkdir } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'tesseract');

const COPIES = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  // The worker picks the best variant for the browser at runtime; ship all
  // js loaders + wasm binaries it can ask for.
  ['node_modules/tesseract.js-core/tesseract-core.wasm.js', 'tesseract-core.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core.wasm', 'tesseract-core.wasm'],
  ['node_modules/tesseract.js-core/tesseract-core-simd.wasm.js', 'tesseract-core-simd.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd.wasm', 'tesseract-core-simd.wasm'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm', 'tesseract-core-lstm.wasm'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm', 'tesseract-core-simd-lstm.wasm'],
];

const TRAINEDDATA_URL =
  'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz';
const TRAINEDDATA_FILE = 'eng.traineddata.gz';

const exists = p => access(p).then(() => true, () => false);

async function main() {
  await mkdir(outDir, { recursive: true });

  for (const [src, dest] of COPIES) {
    const from = path.join(root, src);
    if (!(await exists(from))) {
      console.warn(`[vendor-tesseract] missing ${src} — run npm install first`);
      continue;
    }
    await copyFile(from, path.join(outDir, dest));
  }

  const dataPath = path.join(outDir, TRAINEDDATA_FILE);
  if (await exists(dataPath)) {
    console.log('[vendor-tesseract] traineddata already vendored');
    return;
  }
  try {
    const res = await fetch(TRAINEDDATA_URL);
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(dataPath));
    console.log('[vendor-tesseract] traineddata downloaded');
  } catch (err) {
    console.warn(
      `[vendor-tesseract] could not fetch traineddata (${err.message}). ` +
        'Schedule capture will report OCR_ASSETS_MISSING until this file exists.'
    );
  }
}

main();
