import * as pdfjs from 'pdfjs-dist';
import { createWorker, type Worker } from 'tesseract.js';

/**
 * Client-side text extraction for uploaded office forms (PDF, Word, image,
 * or plain text). Everything runs in the browser: pdfjs and the vendored
 * tesseract engine (same assets as the Schedule Reader — no CDN, no upload
 * of the file itself). Only the extracted TEXT goes to the conversion step,
 * and only when the manager confirms the upload is a blank master form.
 */

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const MAX_PAGES = 20;
const MAX_CHARS = 40_000;
const OCR_ASSET_BASE = '/tesseract';

export interface ExtractedDoc {
  text: string;
  pageCount: number;
  /** 'text' = digital text layer; 'ocr' = scanned, read locally. */
  method: 'text' | 'ocr' | 'docx' | 'plain';
  warning?: string;
}

let ocrWorkerPromise: Promise<Worker> | null = null;

async function getOcrWorker(): Promise<Worker> {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = createWorker('eng', 1, {
      workerPath: `${OCR_ASSET_BASE}/worker.min.js`,
      corePath: OCR_ASSET_BASE,
      langPath: OCR_ASSET_BASE,
      gzip: true,
      cacheMethod: 'none',
      workerBlobURL: false,
    }).catch((err: unknown) => {
      ocrWorkerPromise = null;
      throw new Error(
        `Local OCR engine unavailable (${err instanceof Error ? err.name : 'unknown'}). ` +
          'Scanned documents need the vendored OCR assets; try a text PDF instead.',
      );
    });
  }
  return ocrWorkerPromise;
}

async function ocrCanvas(canvas: HTMLCanvasElement): Promise<string> {
  const worker = await getOcrWorker();
  const { data } = await worker.recognize(canvas);
  return (data?.text ?? '').trim();
}

async function extractPdf(file: File, onProgress?: (msg: string) => void): Promise<ExtractedDoc> {
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages = Math.min(doc.numPages, MAX_PAGES);
  const out: string[] = [];
  let usedOcr = false;

  for (let i = 1; i <= pages; i += 1) {
    onProgress?.(`Reading page ${i} of ${pages}…`);
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Join items line-by-line using Y positions so headings keep their rows.
    const rows = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const y = Math.round((item.transform?.[5] ?? 0) / 4) * 4;
      const x = item.transform?.[4] ?? 0;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push({ x, str: item.str });
    }
    let pageText = [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, items]) => items.sort((a, b) => a.x - b.x).map(i => i.str).join(' '))
      .join('\n');

    // A page with almost no text layer is a scan — OCR it locally.
    if (pageText.replace(/\s/g, '').length < 40) {
      onProgress?.(`Page ${i} looks scanned — reading it locally…`);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        const ocrText = await ocrCanvas(canvas);
        if (ocrText.length > pageText.length) {
          pageText = ocrText;
          usedOcr = true;
        }
      }
    }
    if (pageText.trim()) out.push(pageText.trim());
    if (out.join('\n\n').length > MAX_CHARS) break;
  }
  doc.cleanup();

  const text = out.join('\n\n').slice(0, MAX_CHARS);
  return {
    text,
    pageCount: doc.numPages,
    method: usedOcr ? 'ocr' : 'text',
    warning: doc.numPages > MAX_PAGES ? `Only the first ${MAX_PAGES} pages were read.` : undefined,
  };
}

async function extractImage(file: File, onProgress?: (msg: string) => void): Promise<ExtractedDoc> {
  onProgress?.('Reading the image locally…');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not read the image file.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    // Upscale small photos so OCR has enough pixels to work with.
    const scale = Math.min(3, Math.max(1, 1800 / Math.max(img.width, 1)));
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
    const text = await ocrCanvas(canvas);
    return { text: text.slice(0, MAX_CHARS), pageCount: 1, method: 'ocr' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------------------------------------------------------------------------
// DOCX: a .docx is a ZIP with the text in word/document.xml. A minimal ZIP
// central-directory reader plus the browser's DecompressionStream covers it
// without adding a dependency.
// ---------------------------------------------------------------------------

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZipEntry(buf: ArrayBuffer, entryName: string): Promise<Uint8Array | null> {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  // Find End Of Central Directory (signature 0x06054b50), scanning backwards.
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65558); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();

  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) return null;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLen));

    if (name === entryName) {
      // Local header: sizes of name/extra can differ from the central copy.
      const localNameLen = view.getUint16(localOffset + 26, true);
      const localExtraLen = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      const data = bytes.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return new Uint8Array(data);
      if (method === 8) return inflateRaw(new Uint8Array(data));
      return null;
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

function docxXmlToText(xml: string): string {
  return xml
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#8217;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractDocx(file: File): Promise<ExtractedDoc> {
  const buf = await file.arrayBuffer();
  const entry = await readZipEntry(buf, 'word/document.xml');
  if (!entry) {
    throw new Error(
      'Could not read this Word document. Legacy .doc files are not supported — save it as .docx or export a PDF.',
    );
  }
  const text = docxXmlToText(new TextDecoder().decode(entry));
  return { text: text.slice(0, MAX_CHARS), pageCount: 1, method: 'docx' };
}

/** Extract text from an uploaded form, choosing the reader by file type. */
export async function extractFormText(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<ExtractedDoc> {
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) {
    return extractPdf(file, onProgress);
  }
  if (file.type.startsWith('image/')) {
    return extractImage(file, onProgress);
  }
  if (name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return extractDocx(file);
  }
  if (name.endsWith('.doc')) {
    throw new Error('Legacy .doc files are not supported — save the form as .docx or export a PDF.');
  }
  if (file.type.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md')) {
    const text = (await file.text()).slice(0, MAX_CHARS);
    return { text, pageCount: 1, method: 'plain' };
  }
  throw new Error('Unsupported file type. Upload a PDF, Word (.docx), image, or text file.');
}
