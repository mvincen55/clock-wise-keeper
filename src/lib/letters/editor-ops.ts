/**
 * Pure textarea transforms behind the letter body editor's toolbar.
 * Everything is (value, selection) in → (value, selection) out, so the
 * formatting behavior is testable without a DOM.
 */

export interface EditRange {
  value: string;
  start: number;
  end: number;
}

/** Wrap the selection in a run marker (** or _). No selection: insert a pair. */
export function wrapSelection(r: EditRange, marker: '**' | '_'): EditRange {
  const selected = r.value.slice(r.start, r.end);
  const before = r.value.slice(0, r.start);
  const after = r.value.slice(r.end);

  // Already wrapped: unwrap instead of stacking markers.
  if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= marker.length * 2) {
    const inner = selected.slice(marker.length, selected.length - marker.length);
    return { value: before + inner + after, start: r.start, end: r.start + inner.length };
  }
  const next = before + marker + selected + marker + after;
  return {
    value: next,
    start: r.start + marker.length,
    end: r.end + marker.length,
  };
}

/** The full lines covered by the selection. */
function lineSpan(r: EditRange): { from: number; to: number } {
  const from = r.value.lastIndexOf('\n', Math.max(0, r.start - 1)) + 1;
  const lineEnd = r.value.indexOf('\n', r.end);
  return { from, to: lineEnd === -1 ? r.value.length : lineEnd };
}

const UL_PREFIX = /^- /;
const OL_PREFIX = /^\d+\. /;

/** Toggle bullet/numbered prefixes on every selected line. */
export function toggleList(r: EditRange, kind: 'ul' | 'ol'): EditRange {
  const { from, to } = lineSpan(r);
  const block = r.value.slice(from, to);
  const lines = block.split('\n');
  const pattern = kind === 'ul' ? UL_PREFIX : OL_PREFIX;
  const allPrefixed = lines.every(l => l.trim() === '' || pattern.test(l));

  const next = lines
    .map((line, i) => {
      if (line.trim() === '') return line;
      const stripped = line.replace(UL_PREFIX, '').replace(OL_PREFIX, '');
      if (allPrefixed) return stripped;
      return kind === 'ul' ? `- ${stripped}` : `${i + 1}. ${stripped}`;
    })
    .join('\n');

  const value = r.value.slice(0, from) + next + r.value.slice(to);
  return { value, start: from, end: from + next.length };
}

const ALIGN_PREFIX = /^::(center|right)\s*/;

/** Toggle a paragraph alignment directive on the selection's paragraph. */
export function toggleAlign(r: EditRange, align: 'center' | 'right'): EditRange {
  // The paragraph = the blank-line-delimited block around the selection.
  let from = r.value.lastIndexOf('\n\n', Math.max(0, r.start - 1));
  from = from === -1 ? 0 : from + 2;
  let to = r.value.indexOf('\n\n', r.start);
  if (to === -1) to = r.value.length;

  const block = r.value.slice(from, to);
  const match = ALIGN_PREFIX.exec(block);
  let next: string;
  if (match && match[1] === align) {
    next = block.slice(match[0].length); // toggle off
  } else {
    next = `::${align} ${block.replace(ALIGN_PREFIX, '')}`;
  }
  const value = r.value.slice(0, from) + next + r.value.slice(to);
  return { value, start: from, end: from + next.length };
}

/** Insert text at the cursor (placeholder chips). */
export function insertText(r: EditRange, text: string): EditRange {
  const value = r.value.slice(0, r.start) + text + r.value.slice(r.end);
  const caret = r.start + text.length;
  return { value, start: caret, end: caret };
}
