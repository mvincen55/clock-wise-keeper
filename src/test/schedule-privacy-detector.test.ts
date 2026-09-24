import { describe, expect, it } from 'vitest';
import { buildKnownNames, checkPrivacy } from '@/lib/schedule-reader/privacy-detector';
import type { OcrWord } from '@/lib/schedule-reader/types';

// The privacy gate: if the screenshot looks like it carries patient
// identifiers, processing stops. The detector reports KINDS and COUNTS only —
// never the matched text.

let nextY = 0;
function line(text: string): OcrWord[] {
  nextY += 40;
  let x = 10;
  return text.split(/\s+/).map(word => {
    const w: OcrWord = {
      text: word,
      bbox: { x0: x, y0: nextY, x1: x + word.length * 12, y1: nextY + 20 },
      confidence: 90,
    };
    x += word.length * 12 + 10;
    return w;
  });
}

const none = buildKnownNames([]);

describe('privacy detector', () => {
  it('passes a clean privacy-view schedule', () => {
    const words = [
      ...line('8:00 Dr. Column Hygiene'),
      ...line('9:00 Crown Prep'),
      ...line('LUNCH'),
    ];
    const result = checkPrivacy(words, buildKnownNames(['Dr. Column']));
    expect(result.passed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('flags phone numbers', () => {
    const result = checkPrivacy(line('call 617-555-0142 to confirm'), none);
    expect(result.passed).toBe(false);
    expect(result.violations.some(v => v.kind === 'phone_number')).toBe(true);
  });

  it('flags dates of birth', () => {
    const result = checkPrivacy(line('DOB 04/12/1988'), none);
    expect(result.passed).toBe(false);
    expect(result.violations.some(v => v.kind === 'date_of_birth')).toBe(true);
  });

  it('flags email addresses and account numbers', () => {
    expect(
      checkPrivacy(line('someone@example.com'), none).violations.some(
        v => v.kind === 'email_address'
      )
    ).toBe(true);
    expect(
      checkPrivacy(line('acct # 4432219'), none).violations.some(
        v => v.kind === 'account_number'
      )
    ).toBe(true);
  });

  it('flags insurance identifiers and clinical narrative', () => {
    expect(
      checkPrivacy(line('policy # AB44X9921'), none).violations.some(
        v => v.kind === 'insurance_identifier'
      )
    ).toBe(true);
    expect(
      checkPrivacy(line('premedicate before visit'), none).violations.some(
        v => v.kind === 'clinical_narrative'
      )
    ).toBe(true);
  });

  it('flags name-shaped text but allows known staff names', () => {
    const flagged = checkPrivacy(line('Doe, Jane 9:00'), none);
    expect(flagged.violations.some(v => v.kind === 'full_name')).toBe(true);
  });

  it('flags long free-text notes', () => {
    const result = checkPrivacy(
      line('please note this person prefers the back room and wants us to go over the full plan again after the visit'),
      none
    );
    expect(result.violations.some(v => v.kind === 'long_free_text')).toBe(true);
  });

  it('never includes the matched text in its result', () => {
    const result = checkPrivacy(line('call 617-555-0142 now'), none);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('617');
    expect(serialized).not.toContain('0142');
    // Only kinds and counts.
    for (const v of result.violations) {
      expect(Object.keys(v).sort()).toEqual(['count', 'kind']);
    }
  });
});

describe('a new-patient note that names the patient', () => {
  it('is caught in any case, unless the name is a team member', () => {
    expect(checkPrivacy(line('NP - JANE DOE'), none).violations).toContainEqual({ kind: 'full_name', count: 1 });
    expect(checkPrivacy(line('New Patient: Jane Doe'), none).passed).toBe(false);
    expect(checkPrivacy(line('NP - MOLLY SMITH'), buildKnownNames(['Molly Smith'])).passed).toBe(true);
    expect(checkPrivacy(line('NP exam, ProphyAd'), none).passed).toBe(true);
  });
});

/**
 * The gate reads each appointment box as its own text, and knows the
 * practice software's procedure shorthand from a name.
 *
 * Reproduced on a real privacy-view capture: the per-box 3x read turned
 * "EP, P-Screen, ProphyAd" into "Screen, Prophypdd" — a "Doe, Jane" shape —
 * four times over, and lines grouped across all six chairs made the top row
 * a sixteen-word "note". Nothing in that capture identified a patient.
 */
type Box = { x0: number; y0: number; x1: number; y1: number };
let boxCount = 0;
/** A box of text lines at a given column; returns its words and its region. */
function box(column: number, lines: string[], y = 100): { words: OcrWord[]; region: Box } {
  boxCount += 1;
  const x0 = column * 240 + 5;
  // Wide enough for its longest line: a box's text sits inside the box.
  const widest = Math.max(...lines.map(text => text.split(/\s+/).reduce((w, word) => w + word.length * 6 + 5, 4)));
  const region: Box = { x0, y0: y, x1: x0 + Math.max(230, widest + 4), y1: y + 14 * lines.length + 10 };
  const words: OcrWord[] = [];
  lines.forEach((text, row) => {
    let x = x0 + 4;
    for (const word of text.split(/\s+/)) {
      words.push({ text: word, bbox: { x0: x, y0: y + 4 + row * 14, x1: x + word.length * 6, y1: y + 14 + row * 14 }, confidence: 80 });
      x += word.length * 6 + 5;
    }
  });
  return { words, region };
}
const gate = (boxes: { words: OcrWord[]; region: Box }[], names: string[] = []) =>
  checkPrivacy(boxes.flatMap(b => b.words), buildKnownNames(names), boxes.map(b => b.region));

describe('the gate on a privacy-view schedule read box by box', () => {
  it('passes the real garbled read that tripped it: procedure lists are shorthand, not names', () => {
    const boxes = [
      box(0, ['BeEvalPOn'], 130), box(1, ['Carturbdedit18, Cardrbdedl 9, Cardrbd edd 23, rT', 'DR05', '0739'], 130),
      box(4, ['P-Screen, Prophypéad', 'General', 'HY16', '0129'], 130), box(5, ['DO WAT BOOK, - HYG OUT'], 130),
      box(1, ['1 SralmpEndt 3', 'General', 'DR05', '02717'], 210), box(2, ['HCU - 1M DOC CENTER'], 210),
      box(4, ['EP, P-Screen, Prophypdd', 'General', 'HY16', '0145'], 210), box(5, ['EP, Prophydd, ultiray', 'General', 'HY10', '0257'], 210),
      box(4, ['EP. Prophpdd, PAT st, Pd,', 'General', 'HY16', '0278'], 365), box(5, ['Lunch approved by lab'], 365),
      box(1, ['1 Eee RezCmP1:831', 'Primary'], 521), box(4, ['EL. Fi, Prophwdd', 'General', 'HY16', '0309'], 521),
      box(5, ['EF, P-Screen, Perbd aint', 'General', 'HY10', '0176'], 521), box(6, ['fumare Earlu'], 521),
    ];
    const result = gate(boxes);
    expect(result.violations).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it('a comma pair is a name only outside a procedure list', () => {
    expect(gate([box(0, ['EP, P-Screen, ProphyAd'])]).passed).toBe(true);
    expect(gate([box(0, ['P-Screen, Prophypdd'])]).passed).toBe(true);
    expect(gate([box(0, ['EL. Fi, Prophwdd'])]).passed).toBe(true);
    expect(gate([box(0, ['Doe, Jane'])]).violations).toEqual([{ kind: 'full_name', count: 1 }]);
    expect(gate([box(0, ['Doe, Jane', 'Prophy, BWX', '0739'])]).violations).toEqual([{ kind: 'full_name', count: 1 }]);
  });

  it('six chairs at one height are six texts, not one long note', () => {
    const row = [0, 1, 2, 3, 4, 5].map(c => box(c, ['EP, ProphyAd, PA1st, PAA, FMX, BWX, SRP', 'General']));
    expect(gate(row).passed).toBe(true);
    // Read without its boxes, the same row is a forty-word line — the old failure.
    expect(checkPrivacy(row.flatMap(b => b.words), buildKnownNames([])).violations.some(v => v.kind === 'long_free_text')).toBe(true);
    expect(gate([box(0, ['patient said she prefers mornings and asked us to call her sister first when the office reschedules again'])]).violations).toEqual([{ kind: 'long_free_text', count: 1 }]);
  });

  it('"NP" in its own box is not a new-patient name; a named new patient still is', () => {
    expect(gate([box(0, ['NP']), box(1, ['EL, FMX, ProphyAd', 'General', 'HY16'])]).passed).toBe(true);
    expect(gate([box(0, ['NP - JANE DOE'])]).violations).toEqual([{ kind: 'full_name', count: 1 }]);
  });

  it('an unblinded box still stops the capture on every rule', () => {
    const result = gate([box(0, ['Doe, Jane', 'EP, ProphyAd', '617-555-0142', 'DOB 04/12/1988'])]);
    expect(result.passed).toBe(false);
    expect(result.violations.map(v => v.kind).sort()).toEqual(['date_of_birth', 'full_name', 'phone_number']);
    expect(boxCount).toBeGreaterThan(0);
  });
});
