import * as XLSX from 'xlsx';
import type { Task } from '../domain/workflow';
export const importFields = [
  'patientName',
  'memberId',
  'birthDate',
  'serviceDate',
  'groupRaw',
  'product',
  'subgroup',
  'network',
  'benefitYear',
] as const;
export type ImportField = (typeof importFields)[number];
export type LocalTable = {
  headers: string[];
  rows: string[][];
  warnings: string[];
};
export function readTable(text: string): LocalTable {
  // SheetJS string input must be raw: otherwise 000123 becomes 123.
  const book = XLSX.read(text, { type: 'string', raw: true });
  return fromSheet(book.Sheets[book.SheetNames[0]]);
}
function fromSheet(sheet: XLSX.WorkSheet): LocalTable {
  const grid = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  });
  if (grid.length < 2 || grid.length > 201)
    throw new Error('Use a header and 1–200 rows.');
  const headers = grid[0].map(String);
  if (headers.length > 40) throw new Error('Use at most 40 columns.');
  return {
    headers,
    rows: grid
      .slice(1)
      .map((row) => headers.map((_, i) => String(row[i] ?? ''))),
    warnings: [
      'Compare identifiers with the original source. Zeros already removed by a spreadsheet cannot be recovered. Dates must use YYYY-MM-DD.',
    ],
  };
}
export async function readLocalFile(
  file: File,
): Promise<LocalTable | { text: string }> {
  if (file.size > 10 * 1024 * 1024)
    throw new Error('Use a file smaller than 10 MB.');
  if (/\.(csv|tsv|txt)$/i.test(file.name)) return readTable(await file.text());
  if (/\.xlsx$/i.test(file.name)) {
    const book = XLSX.read(await file.arrayBuffer(), {
      type: 'array',
      cellText: true,
      cellDates: false,
    });
    return fromSheet(book.Sheets[book.SheetNames[0]]);
  }
  if (/\.pdf$/i.test(file.name)) {
    const { extractPdfText } = await import('@/lib/extract-pdf-text');
    const text = await extractPdfText(file);
    if (!text)
      throw new Error(
        'This PDF could not be read locally. Paste a table or enter rows manually.',
      );
    return { text };
  }
  if (file.type.startsWith('image/')) {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng', 1, {
      workerPath: '/tesseract/worker.min.js',
      corePath: '/tesseract',
      langPath: '/tesseract',
      gzip: true,
      cacheMethod: 'none',
      workerBlobURL: false,
    });
    try {
      return { text: (await worker.recognize(file)).data.text };
    } finally {
      await worker.terminate();
    }
  }
  throw new Error(
    'Use CSV, XLSX, a pasted table, PDF, image or manual entry. No remote parsing is used.',
  );
}
export function mapRow(
  task: Task,
  values: string[],
  mapping: Partial<Record<ImportField, number>>,
): Task {
  const next = structuredClone(task);
  for (const key of importFields) {
    const index = mapping[key];
    if (index === undefined || index < 0) continue;
    if (key in next.identity)
      next.identity[key as keyof Task['identity']] = (
        values[index] ?? ''
      ).trim();
    else
      next.planIdentity[key as Exclude<ImportField, keyof Task['identity']>] = (
        values[index] ?? ''
      ).trim();
  }
  next.reviewed = false;
  return next;
}
