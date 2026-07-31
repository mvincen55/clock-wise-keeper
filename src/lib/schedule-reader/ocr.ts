/**
 * Local OCR for the Schedule Reader.
 *
 * Runs tesseract.js entirely against SAME-ORIGIN assets vendored into
 * `/tesseract/` by `scripts/vendor-tesseract.mjs`. There is no CDN fallback:
 * if the local assets are missing the reader stops with OCR_ASSETS_MISSING —
 * it never fetches engine files from a third party at runtime, and the image
 * itself never leaves this device under any circumstances.
 *
 * cacheMethod is 'none' so nothing (engine data included) is written to
 * IndexedDB — the pipeline leaves no browser persistence behind.
 */
import { createWorker, type Worker } from 'tesseract.js';
import { ScheduleReaderError, type OcrWord } from './types';

const ASSET_BASE = '/tesseract';

export interface OcrResult {
  words: OcrWord[];
  /** Mean word confidence, 0–1. */
  confidence: number;
}

interface TesseractWordLike {
  text?: string;
  confidence?: number;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
}

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      workerPath: `${ASSET_BASE}/worker.min.js`,
      corePath: ASSET_BASE,
      langPath: ASSET_BASE,
      gzip: true,
      cacheMethod: 'none',
      workerBlobURL: false,
    }).catch((err: unknown) => {
      workerPromise = null;
      // Engine assets absent or failed to initialize. Fail closed — no
      // remote fallback exists by design.
      throw new ScheduleReaderError('OCR_ASSETS_MISSING', {
        reason: err instanceof Error ? err.name : 'unknown',
      });
    });
  }
  return workerPromise;
}

/**
 * Recognize the words on a captured frame. Returns geometry + text that stay
 * in memory only; callers must clear the result via destroyCapture helpers
 * once metrics are extracted.
 */
export async function recognizeFrame(canvas: HTMLCanvasElement): Promise<OcrResult> {
  const worker = await getWorker();
  try {
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    const raw: TesseractWordLike[] =
      (data as unknown as { words?: TesseractWordLike[] }).words ??
      collectWordsFromBlocks(data as unknown as { blocks?: unknown[] });
    const words: OcrWord[] = raw
      .filter(w => w && w.bbox && typeof w.text === 'string' && w.text.trim().length > 0)
      .map(w => ({
        text: w.text!.trim(),
        bbox: { ...w.bbox! },
        confidence: typeof w.confidence === 'number' ? w.confidence : 0,
      }));
    const mean =
      words.length === 0
        ? 0
        : words.reduce((a, w) => a + w.confidence, 0) / words.length / 100;
    return { words, confidence: Math.min(1, Math.max(0, mean)) };
  } catch (err) {
    if (err instanceof ScheduleReaderError) throw err;
    throw new ScheduleReaderError('OCR_FAILED', {
      reason: err instanceof Error ? err.name : 'unknown',
    });
  }
}

/** tesseract.js v6+ nests words under blocks→paragraphs→lines. */
function collectWordsFromBlocks(data: { blocks?: unknown[] }): TesseractWordLike[] {
  const words: TesseractWordLike[] = [];
  type Line = { words?: TesseractWordLike[] };
  type Paragraph = { lines?: Line[] };
  type Block = { paragraphs?: Paragraph[] };
  for (const block of (data.blocks ?? []) as Block[]) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        for (const word of line.words ?? []) words.push(word);
      }
    }
  }
  return words;
}

/** Shut the OCR worker down and release its resources. */
export async function terminateOcr(): Promise<void> {
  if (!workerPromise) return;
  const p = workerPromise;
  workerPromise = null;
  try {
    const worker = await p;
    await worker.terminate();
  } catch {
    // Already failed to start — nothing to release.
  }
}
