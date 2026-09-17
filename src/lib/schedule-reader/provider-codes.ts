import type { OcrWord } from './types';

/**
 * Provider codes are the short identifiers a practice-management system prints
 * inside each appointment (DR02, HY16…). They are the one piece of schedule
 * text the reader is allowed to keep, and everything here works on them alone.
 *
 * Two ways to read them:
 *   1. the generic shape — a DR/HY/HYG prefix and a short numeric suffix, with
 *      the OCR confusions the digits attract (O→0, Z→2, I/L→1) corrected only
 *      in the suffix;
 *   2. the office's own vocabulary — the codes already saved on the provider
 *      registry (or confirmed in an earlier calibration). A token that is one
 *      OCR slip away from exactly one known code counts as that code, provided
 *      it still looks like a code and the same reading recurs.
 */

const PREFIX = /^(DR|HYG|HY)/;
const SUFFIX_CLASS = /^[0-9OZIL]{1,4}$/;
const KNOWN_CODE = /^(DR|HYG|HY)[0-9]{1,4}$/;

/** Suffix characters OCR trades for digits. Applied to the suffix only — "DR" must stay "DR". */
const SUFFIX_CONFUSABLES: Record<string, string> = { O: '0', Q: '0', I: '1', L: '1', '|': '1', Z: '2', S: '5', G: '6', B: '8' };

const stripEdges = (text: string) => text.trim().toUpperCase().replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, '');

export function providerCodeCandidate(text: string): string | null {
  const token = stripEdges(text);
  const match = token.match(/^(DR|HY|HYG)([0-9OZIL]{1,4})$/);
  if (!match || (!/\d/.test(match[2]) && !/^[OZ]{2}$/.test(match[2]))) return null;
  return match[1] + match[2].replace(/O/g, '0').replace(/Z/g, '2').replace(/[IL]/g, '1');
}

/** Codes an office has saved or confirmed, deduplicated and shaped like real codes. */
export function knownCodeVocabulary(codes: Array<string | null | undefined>): string[] {
  return [...new Set(codes.map(c => (c ?? '').trim().toUpperCase()).filter(c => KNOWN_CODE.test(c)))];
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = temp;
    }
  }
  return prev[b.length];
}

/**
 * Match one token against the office's vocabulary. Exact (after suffix
 * confusables) or a single edit away from exactly one known code — and only
 * for tokens that still look like a code, so "DRILL" never becomes DR11.
 */
export function matchKnownCode(text: string, known: string[]): { code: string; exact: boolean } | null {
  const token = stripEdges(text);
  if (token.length < 3 || token.length > 6 || known.length === 0) return null;
  const prefix = token.match(PREFIX)?.[1];
  const rawSuffix = prefix ? token.slice(prefix.length) : token;
  const codeLike = /\d/.test(rawSuffix) || (rawSuffix.length <= 2 && rawSuffix.length > 0 && [...rawSuffix].every(ch => ch in SUFFIX_CONFUSABLES));
  if (!codeLike) return null;
  const suffix = [...rawSuffix].map(ch => SUFFIX_CONFUSABLES[ch] ?? ch).join('');
  const normalized = (prefix ?? '') + suffix;
  if (known.includes(normalized)) return { code: normalized, exact: true };
  if (!prefix) return null;
  // A clean code that merely differs from a known one (DR03 beside DR02) is a
  // different provider, not a misread; only an unresolved character or a
  // dropped/extra digit may be bridged.
  const clean = /^\d+$/.test(suffix);
  const near = known.filter(code => editDistance(normalized, code) === 1 && (!clean || code.length !== normalized.length));
  return near.length === 1 ? { code: near[0], exact: false } : null;
}

/** OCR sometimes splits "DR02" into "DR" and "02"; rejoin neighbours on the same line. */
function rejoinSplitCodes(words: OcrWord[]): OcrWord[] {
  const joined: OcrWord[] = [];
  for (const first of words) {
    if (!/^(DR|HY|HYG)$/i.test(first.text.trim())) continue;
    const height = Math.max(1, first.bbox.y1 - first.bbox.y0);
    const second = words.find(w => w !== first && SUFFIX_CLASS.test(w.text.trim().toUpperCase())
      && w.bbox.x0 >= first.bbox.x1 - 2 && w.bbox.x0 - first.bbox.x1 < height * 1.5
      && Math.abs((w.bbox.y0 + w.bbox.y1) / 2 - (first.bbox.y0 + first.bbox.y1) / 2) < height);
    if (second) joined.push({ text: first.text.trim() + second.text.trim(), confidence: Math.min(first.confidence, second.confidence),
      bbox: { x0: first.bbox.x0, y0: Math.min(first.bbox.y0, second.bbox.y0), x1: second.bbox.x1, y1: Math.max(first.bbox.y1, second.bbox.y1) } });
  }
  return joined;
}

export interface CodeEvidence {
  code: string;
  /** Distinct places the code was read — one per appointment, never per duplicate reading. */
  count: number;
}

/**
 * Every code with enough evidence, strongest first. A code counts when one
 * clean high-confidence reading exists or the same reading recurs at
 * different positions; a lone weak or corrected reading never does.
 */
export function readProviderCodeEvidence(words: OcrWord[], known: string[] = []): CodeEvidence[] {
  const hits = new Map<string, { strong: boolean; ys: number[] }>();
  for (const word of [...words, ...rejoinSplitCodes(words)]) {
    if (word.confidence < 40) continue;
    const token = stripEdges(word.text);
    const generic = providerCodeCandidate(token);
    const vocabulary = matchKnownCode(token, known);
    const key = vocabulary?.code ?? generic;
    if (!key) continue;
    const hit = hits.get(key) ?? { strong: false, ys: [] };
    hit.strong ||= token === key && word.confidence >= 80;
    if (!hit.ys.some(y => Math.abs(y - word.bbox.y0) < 12)) hit.ys.push(word.bbox.y0);
    hits.set(key, hit);
  }
  return [...hits].filter(([, h]) => h.strong || h.ys.length >= 2).map(([code, h]) => ({ code, count: h.ys.length })).sort((a, b) => b.count - a.count);
}

/** OCR often reads DR02 as DRO2/DROZ. Correct only the numeric suffix, with repeated evidence. */
export function readProviderCodes(words: OcrWord[], known: string[] = []): string[] {
  return readProviderCodeEvidence(words, known).map(e => e.code);
}

/** The provider type a code's prefix implies, when the practice software follows the DR/HY convention. */
export function providerTypeForCode(code: string): 'doctor' | 'hygienist' | null {
  if (/^DR/.test(code)) return 'doctor';
  if (/^HYG?\d/.test(code)) return 'hygienist';
  return null;
}
