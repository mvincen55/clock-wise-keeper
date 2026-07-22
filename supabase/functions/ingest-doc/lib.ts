/**
 * Split extracted document text into overlapping chunks for full-text
 * search retrieval. Prefers paragraph boundaries, falls back to sentence
 * and hard splits for long unbroken text.
 */
export interface ChunkOptions {
  maxChars?: number;
  overlapChars?: number;
}

export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function chunkText(raw: string, options: ChunkOptions = {}): string[] {
  const maxChars = options.maxChars ?? 1800;
  const overlapChars = options.overlapChars ?? 200;
  const text = normalizeText(raw);
  if (!text) return [];
  if (text.length <= maxChars) return [text];

  // Break the text into units no longer than a chunk: paragraphs first,
  // then sentences, then hard character splits as a last resort.
  const unitCap = Math.max(1, maxChars - overlapChars - 2);
  const units: string[] = [];
  for (const paragraph of text.split('\n\n')) {
    if (paragraph.length <= unitCap) {
      units.push(paragraph);
      continue;
    }
    for (const sentence of paragraph.split(/(?<=[.!?])\s+/)) {
      if (sentence.length <= unitCap) {
        units.push(sentence);
        continue;
      }
      for (let i = 0; i < sentence.length; i += unitCap) {
        units.push(sentence.slice(i, i + unitCap));
      }
    }
  }

  const chunks: string[] = [];
  let current = '';
  for (const unit of units) {
    if (current && current.length + unit.length + 2 > maxChars) {
      chunks.push(current.trim());
      // Seed the next chunk with the tail of this one so answers spanning
      // a boundary still land inside one retrievable chunk.
      current = current.trim().slice(-overlapChars) + '\n';
    }
    current += unit + '\n\n';
  }
  const tail = current.trim();
  if (tail) chunks.push(tail);
  return chunks;
}
