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
import { createWorker, PSM, type Worker } from 'tesseract.js';
import { ScheduleReaderError, type OcrWord, type OcrBox } from './types';
import { detectAppointmentRegions } from './appointment-regions';

const ASSET_BASE = '/tesseract';

export interface OcrResult {
  regions?: OcrBox[];
  words: OcrWord[];
  /**
   * Time labels and minute marks read off the left rail in a separate,
   * upscaled pass. The rail's type is too small for the full-page read
   * ("7:00am" comes back as "oem"), so the strip is read at 3x as sparse
   * text, and only time-shaped tokens are kept. In frame coordinates.
   */
  railWords?: OcrWord[];
  /** Mean word confidence, 0–1. */
  confidence: number;
}

/** A token the rail pass keeps: an hour label, possibly with a stray bracket, or a minute mark. */
export const RAIL_TOKEN = /^[[|(]?\d{1,2}(?:[:.;]\d{2}\s*(?:am|pm)?|\d{2}\s*(?:am|pm)|\s*(?:am|pm))[\]|)]?$|^[:.]?\d{2}$/i;

/**
 * The strip the rail pass reads: from the left edge to just before the first
 * appointment box, capped at an eighth of the frame. Null when the frame is
 * too narrow to hold a rail.
 */
export function railCropBounds(width: number, height: number, regions: OcrBox[]): OcrBox | null {
  const firstBox = regions.length ? Math.min(...regions.map(b => b.x0)) : Infinity;
  const right = Math.floor(Math.min(width * 0.125, firstBox - 2));
  if (right < 24 || height < 24) return null;
  return { x0: 0, y0: 0, x1: right, y1: height };
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
    let raw: TesseractWordLike[] =
      (data as unknown as { words?: TesseractWordLike[] }).words ??
      collectWordsFromBlocks(data as unknown as { blocks?: unknown[] });
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const regions = context ? detectAppointmentRegions(context.getImageData(0,0,canvas.width,canvas.height)) : [];
    if (regions.length > 120) throw new ScheduleReaderError('LOW_CONFIDENCE');
    if (regions.length) {
      // Table lines confuse full-page segmentation. Read each appointment independently.
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      try {
        for (const box of regions) {
          const crop = document.createElement('canvas');
          const scaled = document.createElement('canvas');
          try {
            crop.width = box.x1-box.x0; crop.height = box.y1-box.y0;
            const pixels = context!.getImageData(box.x0,box.y0,crop.width,crop.height);
            const histogram = new Uint32Array(256);
            for (let i=0;i<pixels.data.length;i+=4) histogram[Math.round((pixels.data[i]+pixels.data[i+1]+pixels.data[i+2])/3)]++;
            let count=0, background=255;
            for(let v=0;v<256;v++) { count+=histogram[v]; if(count>=crop.width*crop.height*.9) {background=v;break;} }
            for(let i=0;i<pixels.data.length;i+=4) {
              const value=Math.min(255,Math.round((pixels.data[i]+pixels.data[i+1]+pixels.data[i+2])/3*255/Math.max(1,background)));
              pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;
            }
            crop.getContext('2d')!.putImageData(pixels,0,0);
            scaled.width=crop.width*3; scaled.height=crop.height*3;
            scaled.getContext('2d')!.drawImage(crop,0,0,scaled.width,scaled.height);
            const {data: detail}=await worker.recognize(scaled,{}, {blocks:true});
            const regionWords=collectWordsFromBlocks(detail as unknown as {blocks?:unknown[]});
            raw=raw.filter(w=>!w.bbox || !(w.bbox.x0>=box.x0 && w.bbox.x1<=box.x1 && w.bbox.y0>=box.y0 && w.bbox.y1<=box.y1));
            raw.push(...regionWords.map(w=>({...w,bbox:w.bbox?{x0:box.x0+w.bbox.x0/3,x1:box.x0+w.bbox.x1/3,y0:box.y0+w.bbox.y0/3,y1:box.y0+w.bbox.y1/3}:undefined})));
          } finally { crop.width=0; crop.height=0; scaled.width=0; scaled.height=0; }
        }
      } finally { await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO }); }
    }
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

    // The rail: the day's time labels, read at 3x as sparse text.
    const railWords: OcrWord[] = [];
    const rail = context ? railCropBounds(canvas.width, canvas.height, regions) : null;
    if (rail && context) {
      const crop = document.createElement('canvas');
      const scaled = document.createElement('canvas');
      try {
        crop.width = rail.x1 - rail.x0; crop.height = rail.y1 - rail.y0;
        crop.getContext('2d')!.putImageData(context.getImageData(rail.x0, rail.y0, crop.width, crop.height), 0, 0);
        scaled.width = crop.width * 3; scaled.height = crop.height * 3;
        scaled.getContext('2d')!.drawImage(crop, 0, 0, scaled.width, scaled.height);
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
        try {
          const { data: detail } = await worker.recognize(scaled, {}, { blocks: true });
          for (const w of collectWordsFromBlocks(detail as unknown as { blocks?: unknown[] })) {
            const text = typeof w.text === 'string' ? w.text.trim() : '';
            if (!w.bbox || !RAIL_TOKEN.test(text)) continue;
            railWords.push({
              text,
              bbox: { x0: rail.x0 + w.bbox.x0 / 3, x1: rail.x0 + w.bbox.x1 / 3, y0: rail.y0 + w.bbox.y0 / 3, y1: rail.y0 + w.bbox.y1 / 3 },
              confidence: typeof w.confidence === 'number' ? w.confidence : 0,
            });
          }
        } finally { await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO }); }
      } catch {
        // A failed rail read costs nothing but the rail: the day's bounds then
        // come from the last calibration or the providers' hours.
      } finally { crop.width = 0; crop.height = 0; scaled.width = 0; scaled.height = 0; }
    }
    return { words, regions, railWords, confidence: Math.min(1, Math.max(0, mean)) };
  } catch (err) {
    if (err instanceof ScheduleReaderError) throw err;
    throw new ScheduleReaderError('OCR_FAILED', {
      reason: err instanceof Error ? err.name : 'unknown',
    });
  }
}

/** How much the ledger read enlarges the crop — Dentrix's ledger type is ~11px. */
export const LEDGER_SCALE = 3;

/**
 * Recognize a Dentrix ledger crop. The ledger's small, coloured type on
 * alternating grey rows misreads at native size ("94.00" → "9400", "DR02" →
 * "DROZ"), so the crop is read enlarged, flattened to its darkest channel (so
 * light-green and magenta text stay dark) and normalized against the row
 * background, as one uniform block. Word boxes come back in crop coordinates.
 */
export async function recognizeLedgerFrame(canvas: HTMLCanvasElement): Promise<OcrResult> {
  const worker = await getWorker();
  const scaled = document.createElement('canvas');
  try {
    scaled.width = canvas.width * LEDGER_SCALE;
    scaled.height = canvas.height * LEDGER_SCALE;
    const ctx = scaled.getContext('2d', { willReadFrequently: true })!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, scaled.width, scaled.height);
    const pixels = ctx.getImageData(0, 0, scaled.width, scaled.height);
    const histogram = new Uint32Array(256);
    const d = pixels.data;
    for (let i = 0; i < d.length; i += 4) histogram[Math.min(d[i], d[i + 1], d[i + 2])]++;
    let count = 0, background = 255;
    for (let v = 0; v < 256; v++) { count += histogram[v]; if (count >= (d.length / 4) * 0.5) { background = v; break; } }
    for (let i = 0; i < d.length; i += 4) {
      const value = Math.min(255, Math.round((Math.min(d[i], d[i + 1], d[i + 2]) * 255) / Math.max(1, background)));
      d[i] = d[i + 1] = d[i + 2] = value;
    }
    ctx.putImageData(pixels, 0, 0);

    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: '1' });
    let raw: TesseractWordLike[];
    try {
      const { data } = await worker.recognize(scaled, {}, { blocks: true });
      raw = collectWordsFromBlocks(data as unknown as { blocks?: unknown[] });
    } finally {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '0' });
    }
    const words: OcrWord[] = raw
      .filter(w => w && w.bbox && typeof w.text === 'string' && w.text.trim().length > 0)
      .map(w => ({
        text: w.text!.trim(),
        bbox: {
          x0: w.bbox!.x0 / LEDGER_SCALE,
          x1: w.bbox!.x1 / LEDGER_SCALE,
          y0: w.bbox!.y0 / LEDGER_SCALE,
          y1: w.bbox!.y1 / LEDGER_SCALE,
        },
        confidence: typeof w.confidence === 'number' ? w.confidence : 0,
      }));
    const mean = words.length === 0 ? 0 : words.reduce((a, w) => a + w.confidence, 0) / words.length / 100;
    return { words, confidence: Math.min(1, Math.max(0, mean)) };
  } catch (err) {
    if (err instanceof ScheduleReaderError) throw err;
    throw new ScheduleReaderError('OCR_FAILED', {
      reason: err instanceof Error ? err.name : 'unknown',
    });
  } finally {
    scaled.width = 0;
    scaled.height = 0;
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
