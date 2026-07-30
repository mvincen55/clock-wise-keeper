import * as pdfjs from 'pdfjs-dist';

/**
 * Pull the text out of an attached PDF right here on the device, so the help
 * desk agent can quote the actual wording instead of guessing from a filename.
 * Only the first few pages — a support attachment is never a novel.
 */

// Worker is bundled by Vite; keeping it local means nothing is fetched from a CDN.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const MAX_PAGES = 8;
const MAX_CHARS = 6000;

export async function extractPdfText(file: File): Promise<string> {
  try {
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    const pages = Math.min(doc.numPages, MAX_PAGES);
    const out: string[] = [];

    for (let i = 1; i <= pages; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const line = content.items
        .map(item => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (line) out.push(`Page ${i}: ${line}`);
      if (out.join('\n').length > MAX_CHARS) break;
    }

    await doc.destroy();
    return out.join('\n').slice(0, MAX_CHARS);
  } catch {
    // A scanned or locked PDF simply gives us nothing to quote — that's fine.
    return '';
  }
}
