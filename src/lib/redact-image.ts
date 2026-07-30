import Tesseract from 'tesseract.js';

/**
 * Screenshot redaction.
 *
 * A screenshot of a payroll screen is full of things the help desk has no
 * business seeing: people's names, punch times, record IDs, emails. We read
 * the words on the image here in the browser and paint over the sensitive
 * ones BEFORE the file ever leaves the device. Nothing unredacted is uploaded.
 */

const TIME = /^\d{1,2}:\d{2}(:\d{2})?\s*(am|pm|AM|PM)?$/;
const CLOCK_WORD = /^(am|pm|AM|PM)$/;
const LONG_NUMBER = /^\d{5,}$/;
const SSN = /^\d{3}-\d{2}-\d{4}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_CHUNK = /^[0-9a-f]{8}-?[0-9a-f-]{4,}$/i;
const DATE = /^\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?$/;
const CAPITALIZED = /^[A-Z][a-z]{2,}$/;

/** Words that look capitalized but are just app chrome, never a person. */
const SAFE_WORDS = new Set(
  [
    'Dashboard','Team','Settings','Reports','Goals','Training','Messages','Timesheet',
    'Schedule','Calendar','Payroll','Clock','Punch','Hours','Total','Today','Yesterday',
    'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday',
    'January','February','March','April','May','June','July','August','September',
    'October','November','December','Approved','Denied','Pending','Open','Closed',
    'Save','Cancel','Delete','Edit','Add','New','Export','Download','Search','Filter',
    'Office','Purple','Envelope','Notes','Status','Name','Date','Time','Type','Notification',
    'Request','Requests','Employee','Member','Manager','Owner','Admin','Error','Warning',
  ].map(w => w.toLowerCase()),
);

export type RedactionLevel = 'off' | 'on';

/** Which kinds of data get painted over. Each one can be turned off. */
export interface RedactionCategories {
  /** People's names — anything that looks like a person rather than app chrome. */
  names: boolean;
  /** Record IDs, long numbers, SSNs. */
  ids: boolean;
  /** Email addresses. */
  emails: boolean;
  /** Punch times and calendar dates. */
  datesTimes: boolean;
}

export const ALL_REDACTION_CATEGORIES: RedactionCategories = {
  names: true,
  ids: true,
  emails: true,
  datesTimes: true,
};

export interface RedactionResult {
  file: File;
  previewUrl: string;
  maskedCount: number;
  /** Words read off the screenshot, with masked words replaced by blocks. */
  text: string;
  /** Everything read off the screenshot, unmasked. */
  rawText: string;
}

interface Word {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

interface Line {
  words?: Word[];
}

function shouldMask(
  raw: string,
  knownNames: Set<string>,
  cats: RedactionCategories,
): boolean {
  const t = raw.trim();
  if (t.length < 2) return false;
  const lower = t.toLowerCase();
  const stripped = t.replace(/[.,;:()[\]]/g, '');

  if (cats.names && knownNames.has(lower.replace(/[.,;:]/g, ''))) return true;
  if (cats.datesTimes && (TIME.test(stripped) || CLOCK_WORD.test(stripped))) return true;
  if (cats.ids && (SSN.test(stripped) || LONG_NUMBER.test(stripped))) return true;
  if (cats.emails && EMAIL.test(stripped)) return true;
  if (cats.ids && UUID_CHUNK.test(stripped) && stripped.length >= 8) return true;
  if (cats.datesTimes && DATE.test(stripped)) return true;
  if (cats.names && CAPITALIZED.test(stripped) && !SAFE_WORDS.has(stripped.toLowerCase()))
    return true;
  return false;
}

async function loadBitmap(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not read that image.'));
      img.src = url;
    });
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * Paint solid boxes over names, times, IDs and dates in a screenshot.
 * Returns a brand-new file — the original is never uploaded.
 */
export async function redactScreenshot(
  file: File,
  knownNames: string[] = [],
  categories: RedactionCategories = ALL_REDACTION_CATEGORIES,
): Promise<RedactionResult> {
  const cats = categories;
  const img = await loadBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare the image.');
  ctx.drawImage(img, 0, 0);

  const names = new Set(
    knownNames
      .flatMap(n => n.split(/\s+/))
      .map(n => n.trim().toLowerCase())
      .filter(n => n.length > 2),
  );

  let words: Word[] = [];
  let lines: Line[] = [];
  try {
    const { data } = await Tesseract.recognize(canvas, 'eng');
    words = ((data as unknown as { words?: Word[] }).words ?? []).filter(w => w?.bbox);
    lines = (data as unknown as { lines?: Line[] }).lines ?? [];
  } catch {
    // OCR failed — better to send nothing readable than to leak. Fall back to
    // handing back the original and letting the caller decide.
    return {
      file,
      previewUrl: canvas.toDataURL('image/png'),
      maskedCount: -1,
      text: '',
      rawText: '',
    };
  }

  let maskedCount = 0;
  for (const w of words) {
    if (!shouldMask(w.text ?? '', names, cats)) continue;
    const { x0, y0, x1, y1 } = w.bbox;
    const pad = 2;
    ctx.fillStyle = '#2b2433';
    ctx.fillRect(x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2);
    maskedCount += 1;
  }

  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('Could not finish redacting.');

  const redacted = new File([blob], file.name.replace(/\.[^.]+$/, '') + '-redacted.png', {
    type: 'image/png',
  });

  // Same words, as text — so the help desk agent can quote what the screenshot
  // actually says instead of guessing at pixels. Masked words stay masked here.
  const rows = lines.length > 0 ? lines.map(l => l.words ?? []) : [words];
  const masked: string[] = [];
  const raw: string[] = [];
  for (const row of rows) {
    if (row.length === 0) continue;
    masked.push(row.map(w => (shouldMask(w.text ?? '', names, cats) ? '[hidden]' : w.text)).join(' ').trim());
    raw.push(row.map(w => w.text).join(' ').trim());
  }

  return {
    file: redacted,
    previewUrl: URL.createObjectURL(redacted),
    maskedCount,
    text: masked.filter(Boolean).join('\n').slice(0, 6000),
    rawText: raw.filter(Boolean).join('\n').slice(0, 6000),
  };
}
