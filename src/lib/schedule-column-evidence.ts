import type { ReviewColumn } from '@/lib/schedule-provider-mapping';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * One plain line per column: what the reader found in the lane and why it
 * suggested what it did. Only provider codes and registry names ever appear
 * here — never any other text from the screenshot.
 */
export function columnEvidence(col: ReviewColumn, suggestedProviderId?: string, options: { remembers?: boolean } = {}): string {
  const s = col.suggestion;
  if (!s) return '';
  const codes = s.codes;
  const read = codes.length === 1
    ? `${codes[0].code} read in ${plural(codes[0].count, 'appointment')}`
    : codes.length > 1
      ? `Codes read here: ${codes.map(c => `${c.code} ×${c.count}`).join(', ')}`
      : 'No provider code could be read in this column';
  if (col.providerId && suggestedProviderId && col.providerId === suggestedProviderId && s.reason) return `${read}. Suggested because ${s.reason}.`;
  if (col.providerId) return `${read}.`;
  if (codes.length === 1) {
    return `${read}, but no provider has this code yet. Pick who ${codes[0].code} is${options.remembers ? ' — saving the layout records it as their schedule code' : ' for today'}.`;
  }
  if (codes.length > 1) {
    const dominant = codes[0].count >= 2 && codes[0].count >= 2 * codes[1].count;
    return `${read}. ${dominant ? `Mostly ${codes[0].code} — confirm whose time this lane counts as.` : 'A mixed lane — choose whose time this column counts as.'}`;
  }
  return `${read}.`;
}
