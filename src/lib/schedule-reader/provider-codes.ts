import type { OcrWord } from './types';

export function providerCodeCandidate(text: string): string | null {
  const token = text.trim().toUpperCase().replace(/^[(:]+|[):,;]+$/g,'');
  const match = token.match(/^(DR|HY|HYG)([0-9OZIL]{1,4})$/);
  if (!match || (!/\d/.test(match[2]) && !/^[OZ]{2}$/.test(match[2]))) return null;
  return match[1] + match[2].replace(/O/g,'0').replace(/Z/g,'2').replace(/[IL]/g,'1');
}

/** OCR often reads DR02 as DRO2/DROZ. Correct only the numeric suffix, with repeated evidence. */
export function readProviderCodes(words: OcrWord[]): string[] {
  const hits = new Map<string, { strong: boolean; ys: number[] }>();
  for (const word of words) {
    const token = word.text.trim().toUpperCase().replace(/^[(:]+|[):,;]+$/g,'');
    const key = providerCodeCandidate(token);
    if (!key || word.confidence < 40) continue;
    const hit = hits.get(key) ?? { strong: false, ys: [] };
    hit.strong ||= token === key && word.confidence >= 80;
    if (!hit.ys.some(y => Math.abs(y-word.bbox.y0)<12)) hit.ys.push(word.bbox.y0);
    hits.set(key,hit);
  }
  return [...hits].filter(([,h]) => h.strong || h.ys.length >= 2).map(([code])=>code);
}
