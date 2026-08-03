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
