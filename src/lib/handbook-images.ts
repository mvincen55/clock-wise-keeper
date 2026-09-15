/**
 * Handbook pictures — photos a manager adds to an office document from the
 * handbook editor (an instrument guide, a blank form, a call-light panel).
 *
 * Files live in the public `org-branding` bucket under
 * `<org_id>/handbook/<file-name>`, and the document points at them with a
 * markdown image line (`![caption](url)`) that doc-format renders as a
 * figure. Uploading a file with the same name replaces the picture wherever
 * it is used. Office pictures only — never patient photos.
 */

export const HANDBOOK_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const HANDBOOK_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

/** "Instrument Guide (2).JPEG" → "instrument-guide-2.jpg" — stable, URL-safe, and human-readable. */
export function handbookImageFileName(name: string): string {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const rawExt = dot > 0 ? name.slice(dot + 1).toLowerCase() : 'png';
  const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
  const slug =
    base
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'picture';
  return `${slug}.${ext}`;
}

/** Storage object path inside the `org-branding` bucket. */
export function handbookImagePath(orgId: string, fileName: string): string {
  return `${orgId}/handbook/${handbookImageFileName(fileName)}`;
}

/** Why a chosen file cannot be used, or null when it can. Mirrors the bucket's limits. */
export function handbookImageProblem(file: { size: number; type: string }): string | null {
  if (!HANDBOOK_IMAGE_TYPES.includes(file.type)) return 'Choose a PNG, JPEG, WebP, or SVG picture.';
  if (file.size > HANDBOOK_IMAGE_MAX_BYTES) return 'Pictures must be 2 MB or smaller.';
  return null;
}

/** A readable caption from the file name: "time-off-request-form.png" → "Time off request form". */
export function captionFromFileName(name: string): string {
  const words = handbookImageFileName(name).replace(/\.[a-z0-9]+$/, '').replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The markdown line doc-format turns into a figure. Square brackets would end the caption early. */
export function imageLine(caption: string, url: string): string {
  return `![${caption.replace(/[[\]]/g, '')}](${url})`;
}

export interface HeadingLine {
  /** Zero-based line index in the editor text. */
  line: number;
  level: number;
  title: string;
}

/** Markdown headings in editor text, in order — the "place after" choices. */
export function headingLines(text: string): HeadingLine[] {
  const out: HeadingLine[] = [];
  text.split('\n').forEach((raw, line) => {
    const match = /^(#{1,4})\s+(.+?)\s*$/.exec(raw);
    if (match) out.push({ line, level: match[1].length, title: match[2] });
  });
  return out;
}

export type ImagePlacement =
  | { kind: 'cursor'; at: number }
  | { kind: 'after-heading'; line: number }
  | { kind: 'end' };

export interface PlacedImage {
  text: string;
  /** Caret position just after the inserted line, so the editor can show it. */
  caret: number;
  /** The document already used this picture; the text was left alone. */
  alreadyPlaced: boolean;
}

/**
 * Insert an image line as its own paragraph. A cursor in the middle of a line
 * places the picture after that line rather than splitting the sentence, and
 * a picture the document already shows (same URL) is not added twice — the
 * upload simply replaced it.
 */
export function placeImageLine(
  text: string,
  image: { caption: string; url: string },
  placement: ImagePlacement
): PlacedImage {
  const line = imageLine(image.caption, image.url);
  const existing = text.indexOf(`](${image.url})`);
  if (existing !== -1) {
    return { text, caret: text.indexOf(')', existing) + 1, alreadyPlaced: true };
  }

  if (placement.kind === 'after-heading') {
    const lines = text.split('\n');
    const index = Math.max(0, Math.min(placement.line, lines.length - 1));
    const next = lines[index + 1];
    const insert = ['', line];
    if (next !== undefined && next.trim() !== '') insert.push('');
    lines.splice(index + 1, 0, ...insert);
    const joined = lines.join('\n');
    return { text: joined, caret: joined.indexOf(line) + line.length, alreadyPlaced: false };
  }

  let at = placement.kind === 'cursor' ? Math.max(0, Math.min(placement.at, text.length)) : text.length;
  if (placement.kind === 'cursor') {
    const eol = text.indexOf('\n', at);
    at = eol === -1 ? text.length : eol;
  }
  const before = text.slice(0, at);
  const after = text.slice(at);
  const lead = before === '' ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const trail = after === '' ? '\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const joined = before + lead + line + trail + after;
  return { text: joined, caret: (before + lead + line).length, alreadyPlaced: false };
}
