/**
 * Teardown for the Privacy View Capture.
 *
 * After processing — confirmed or cancelled, success or failure — everything
 * derived from the screenshot is destroyed: media tracks stopped, the canvas
 * cleared and shrunk, object URLs revoked, OCR word/line arrays emptied, and
 * worker references released. Component state must drop its reference right
 * after calling this; nothing screenshot-derived may survive.
 */
import { terminateOcr } from './ocr';
import type { CaptureFrame, OcrWord } from './types';

/** Blank and free one canvas. */
export function wipeCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Shrinking to 0×0 releases the backing store immediately in all engines.
  canvas.width = 0;
  canvas.height = 0;
}

/** Empty OCR arrays in place so no caller keeps readable text alive by alias. */
export function wipeOcrWords(words: OcrWord[]): void {
  for (const w of words) {
    w.text = '';
    w.confidence = 0;
    w.bbox.x0 = 0;
    w.bbox.y0 = 0;
    w.bbox.x1 = 0;
    w.bbox.y1 = 0;
  }
  words.length = 0;
}

/**
 * Destroy a capture frame and everything attached to it.
 * Safe to call more than once.
 */
export async function destroyCapture(
  frame: CaptureFrame | null | undefined,
  words?: OcrWord[]
): Promise<void> {
  if (frame) {
    for (const track of frame.tracks) {
      try {
        track.stop();
      } catch {
        // Already stopped.
      }
    }
    frame.tracks.length = 0;
    for (const url of frame.objectUrls) URL.revokeObjectURL(url);
    frame.objectUrls.length = 0;
    wipeCanvas(frame.canvas);
    frame.width = 0;
    frame.height = 0;
  }
  if (words) wipeOcrWords(words);
  await terminateOcr();
}
