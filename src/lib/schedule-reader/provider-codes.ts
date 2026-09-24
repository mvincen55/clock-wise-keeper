import type { OcrWord } from './types';

/**
 * A provider code as OCR returns it: DR/HY/HYG plus up to four characters the
 * engine may have misread — O or Q for 0, Z for 2, I or L for 1, S for 5, B
 * for 8, G for 6. A true digit must survive, or the suffix must be exactly
 * two look-alikes ("DROS" is DR05), so a word like "DRS" or "DRILL" is never
 * a code.
 */
export function providerCodeCandidate(text: string): string | null {
  const token = text.trim().toUpperCase().replace(/^[(:]+|[):,;.]+$/g,'');
  const match = token.match(/^(DR|HY|HYG)([0-9OQZILSBG]{1,4})$/);
  if (!match || (!/\d/.test(match[2]) && !/^[OQZILSBG]{2}$/.test(match[2]))) return null;
  return match[1] + match[2].replace(/[OQ]/g,'0').replace(/Z/g,'2').replace(/[IL]/g,'1').replace(/S/g,'5').replace(/B/g,'8').replace(/G/g,'6');
}

/** OCR often reads DR02 as DRO2/DROZ. Correct only the numeric suffix, with repeated evidence. */
export function readProviderCodes(words: OcrWord[]): string[] {
  const hits = new Map<string, { strong: boolean; ys: number[] }>();
  for (const word of words) {
    const token = word.text.trim().toUpperCase().replace(/^[(:]+|[):,;.]+$/g,'');
    const key = providerCodeCandidate(token);
    if (!key || word.confidence < 40) continue;
    const hit = hits.get(key) ?? { strong: false, ys: [] };
    hit.strong ||= token === key && word.confidence >= 80;
    if (!hit.ys.some(y => Math.abs(y-word.bbox.y0)<12)) hit.ys.push(word.bbox.y0);
    hits.set(key,hit);
  }
  return [...hits].filter(([,h]) => h.strong || h.ys.length >= 2).map(([code])=>code);
}

/**
 * A posted appointment box, as a privacy view prints it: a procedures line,
 * the appointment type, the provider code, and a four-digit number. The
 * number — never part of a date, a time, a tooth number or a range — tells an
 * appointment from a note even when the code is misread. A hold or a
 * do-not-book note is never an appointment, whatever else it carries.
 */
export function looksLikeAppointment(text: string): boolean {
  if (/\b(?:hold|holds|do not book|dnb)\b/i.test(text)) return false;
  if (text.trim().split(/\s+/).length < 3) return false;
  return /(?<![\d/:.#-])\b\d{4}\b(?![\d/:.-])/.test(text);
}

export type WorkDepartment = 'doctor' | 'hygiene';

// The work itself says whose chair it is. Procedure shorthand as practice
// software prints it, matched as substrings because it is CamelCase
// ("CrwnMod#15", "ProphyAd", "PerMaint", "TopFlride").
const DOCTOR_WORK = ['crwn', 'crown', 'inly', 'inlay', 'onlay', 'endo', 'rct', 'pulp', 'exo', 'extr', 'impl', 'compo', 'amal', 'fill', 'bridge', 'pontic', 'abut', 'veneer', 'dentur', 'partial', 'buildup', 'bldup', 'occl', 'deliv', 'seat', 'prep', 'nightg', 'ngrd', 'whiten', 'sig'];
const HYGIENE_WORK = ['prophy', 'perio', 'permain', 'srp', 'scal', 'fluor', 'flrid', 'fl1', 'fl2', 'flpc', 'xray', 'x-ray', 'bwx', 'fmx', 'pano', 'pa1', 'paa', 'screen', 'seal', 'sdf', 'arrest', 'debrid', 'recall'];
/** Every procedure word the reader knows, for anyone who needs to tell shorthand from prose. */
export const PROCEDURE_WORDS: readonly string[] = [...DOCTOR_WORK, ...HYGIENE_WORK];

/** Which department's work a box describes, or null when it names neither or both equally. */
export function boxDepartment(text: string): WorkDepartment | null {
  const lower = text.toLowerCase();
  const doctor = DOCTOR_WORK.filter(t => lower.includes(t)).length;
  const hygiene = HYGIENE_WORK.filter(t => lower.includes(t)).length;
  if (doctor === hygiene) return null;
  return doctor > hygiene ? 'doctor' : 'hygiene';
}

/**
 * The department a column is running today, from the procedures in its
 * boxes: each box votes, and a clear majority decides. Notes and holds vote
 * for nobody. Null when nothing in the column says.
 */
export function inferDepartment(boxTexts: string[]): WorkDepartment | null {
  let doctor = 0, hygiene = 0;
  for (const text of boxTexts) {
    const vote = boxDepartment(text);
    if (vote === 'doctor') doctor += 1;
    if (vote === 'hygiene') hygiene += 1;
  }
  if (doctor === hygiene) return null;
  return doctor > hygiene ? 'doctor' : 'hygiene';
}

/** A chair name that carries the department by convention: DT-3 (doctor), HT-1 (hygiene). */
export function chairDepartment(headerText: string): WorkDepartment | null {
  const m = headerText.trim().toUpperCase().match(/^(DT|HT)[\s-]?\d{1,2}$/);
  return m ? (m[1] === 'DT' ? 'doctor' : 'hygiene') : null;
}
