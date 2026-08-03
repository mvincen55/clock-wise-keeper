/**
 * PDF bridge for the manual parser and the source-page viewer.
 *
 * Extraction happens here on the device with pdfjs — the same library the
 * support-desk PDF peek uses — so a carrier manual never has to survive a
 * lossy AI transcription to become readable. Each text item keeps its
 * position and font size; the pure parser (src/lib/manual-parse) turns
 * that layout into sections and typed chunks.
 */
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfPageText, PdfTextItem } from '@/lib/manual-parse';

// Bundled worker — nothing fetched from a CDN (same setup as
// extract-pdf-text.ts; assigning twice is harmless).
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

/** Manuals are long; cap pages defensively rather than hanging the tab. */
const MAX_PAGES = 400;

export async function loadPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  // Copy: pdfjs transfers the buffer to its worker, which would detach a
  // caller-owned ArrayBuffer they may still need (e.g. for upload).
  return pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
}

/**
 * Extract positioned text for every page. Coordinates are converted to a
 * top-left origin (pdfjs uses bottom-left) so "top of page" sorts first.
 */
export async function extractPdfPages(doc: PDFDocumentProxy): Promise<PdfPageText[]> {
  const pages: PdfPageText[] = [];
  const pageCount = Math.min(doc.numPages, MAX_PAGES);
  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items: PdfTextItem[] = [];
    for (const item of content.items) {
      if (!('str' in item) || item.str.trim() === '') continue;
      const transform = item.transform as number[];
      const fontSize = Math.hypot(transform[2], transform[3]) || Math.abs(transform[3]) || 10;
      items.push({
        str: item.str,
        x: transform[4],
        // transform[5] is the baseline from the bottom; flip to top-origin
        // and step up by the glyph height so y is roughly the line's top.
        y: viewport.height - transform[5] - fontSize,
        width: item.width,
        fontSize,
        fontName: item.fontName,
      });
    }
    pages.push({ pageNumber: i, width: viewport.width, height: viewport.height, items });
    page.cleanup();
  }
  return pages;
}

/** Tear down a loaded document (worker resources included). */
export function destroyPdf(doc: PDFDocumentProxy): void {
  void doc.loadingTask.destroy();
}

/** Read a File/Blob and extract its pages in one step. */
export async function extractPagesFromFile(file: Blob): Promise<PdfPageText[]> {
  const buffer = await file.arrayBuffer();
  const doc = await loadPdf(buffer);
  try {
    return await extractPdfPages(doc);
  } finally {
    destroyPdf(doc);
  }
}

/**
 * Render one page into a canvas for the source-page viewer. The backing
 * store is scaled for device pixels (baked into the viewport scale, the
 * approach pdfjs v6 expects); the returned CSS size keeps the on-screen
 * dimensions stable so the page stays sharp when zoomed.
 */
export async function renderPdfPageToCanvas(
  doc: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number
): Promise<{ width: number; height: number }> {
  const page = await doc.getPage(Math.min(Math.max(1, pageNumber), doc.numPages));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: scale * dpr });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvas, viewport }).promise;
  return { width: viewport.width / dpr, height: viewport.height / dpr };
}
