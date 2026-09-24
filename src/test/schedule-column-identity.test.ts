import { describe, expect, it } from 'vitest';
import { boxDepartment, chairDepartment, inferDepartment, looksLikeAppointment, providerCodeCandidate, readProviderCodes } from '@/lib/schedule-reader/provider-codes';
import { suggestColumnProvider, suggestDailyColumns } from '@/lib/schedule-reader/provider-mapping';
import { isNotesOnlyColumn } from '@/lib/schedule-reader/appointment-regions';
import { applyCompletedEvidence } from '@/lib/schedule-reader/completed-evidence';
import { providerColumn } from '@/lib/schedule-provider-mapping';
import type { Provider } from '@/lib/providers';
import type { LayoutColumn, OcrWord } from '@/lib/schedule-reader/types';

// A chair is whoever is working in it today. The reader tells that from the
// content of the column — the provider code, and when the engine misreads
// it, the shape of the appointment boxes and the work they describe —
// never from which chair it was yesterday.

describe('provider codes as the engine returns them', () => {
  it.each([
    ['DR05', 'DR05'], ['DR0S', 'DR05'], ['DROS', 'DR05'], ['DRO5', 'DR05'], ['HY1G', 'HY16'], ['HY16', 'HY16'], ['DRQ2', 'DR02'], ['(HY14)', 'HY14'], ['dr05.', 'DR05'],
  ])('reads %s as %s', (token, code) => expect(providerCodeCandidate(token)).toBe(code));
  it.each(['DRS', 'DRILL', 'DR', 'HYGIENE', 'DROSS', 'PROV1', 'HY'])('never turns %s into a code', token => expect(providerCodeCandidate(token)).toBeNull());
  it('accepts a misread code repeated in two boxes', () => {
    const word = (text: string, y: number): OcrWord => ({ text, confidence: 70, bbox: { x0: 10, x1: 40, y0: y, y1: y + 8 } });
    expect(readProviderCodes([word('DROS', 100), word('DR0S', 200)])).toEqual(['DR05']);
    expect(readProviderCodes([word('DROS', 100)])).toEqual([]);
  });
});

describe('what a box is', () => {
  it.each([
    'CrwnMod#15, CrwnMod#15, CrwnMod#26 Non DR05 0739',
    'SigInlyEnd#13 General DROS 0717',
    'P-Screen, ProphyAd General HY14 0104',
    'PerMaint General HY10 0277',
  ])('an appointment: %s', text => expect(looksLikeAppointment(text)).toBe(true));
  it.each([
    'HOLD - IN DOC CENTER', 'DO NOT BOOK - LUCY OUT', 'JB Out (In 930ish-1030ish)', 'SWE NOT COME IN 6/24/2026', 'CE 2026', 'Moved down 1 unit', 'No Doctor - Yom Kippur', 'Lunch', 'NP - JANE DOE',
  ])('not an appointment: %s', text => expect(looksLikeAppointment(text)).toBe(false));
  it('reads the department from the work', () => {
    expect(boxDepartment('CrwnMod#15, CrwnMod#15, CrwnMod#26 Non DR05 0739')).toBe('doctor');
    expect(boxDepartment('SigInlyEnd#13 General 0717')).toBe('doctor');
    expect(boxDepartment('PerMaint, Fl2nd, PostPSQ-E General HY10 0188')).toBe('hygiene'); // "Post" alone does not make it the doctor's
    expect(boxDepartment('EP, ProphyAd, PA1st, PAA General HY16 0279')).toBe('hygiene');
    expect(boxDepartment('HOLD - IN DOC CENTER')).toBeNull();
    expect(inferDepartment(['CrwnMod#15 Non 0739', 'HOLD - IN DOC CENTER', 'DeCrInl#3 General 0729'])).toBe('doctor');
    expect(inferDepartment(['ProphyAd General 0104', 'CrwnMod#15 Non 0739'])).toBeNull();
    expect(inferDepartment([])).toBeNull();
  });
  it('reads a conventional chair name as a hint', () => {
    expect(chairDepartment('DT-3')).toBe('doctor'); expect(chairDepartment('HT 1')).toBe('hygiene');
    expect(chairDepartment('DR02')).toBeNull(); expect(chairDepartment('Dr. Alpha')).toBeNull(); expect(chairDepartment('DT-3 extra')).toBeNull();
  });
});

const doctor: Provider = { id: 'doc', orgId: 'o', displayName: 'Dr. Alpha', providerType: 'doctor', employeeId: null, active: true, sortOrder: 0 };
const doctor2: Provider = { ...doctor, id: 'doc2', displayName: 'Dr. Bravo' };
const molly: Provider = { ...doctor, id: 'molly', displayName: 'Molly Hyg', providerType: 'hygienist', scheduleCode: 'HY16' };
const lucia: Provider = { ...doctor, id: 'lucia', displayName: 'Lucia Hyg', providerType: 'hygienist', scheduleCode: 'HY10' };
const W = 700, H = 400;
const col = (i: number): Pick<LayoutColumn, 'xStart' | 'xEnd'> => ({ xStart: i / 7, xEnd: (i + 1) / 7 });
const at = (i: number, y: number, text: string, confidence = 85): OcrWord => ({ text, confidence, bbox: { x0: i * 100 + 5, x1: i * 100 + 5 + Math.min(80, text.length * 7), y0: y, y1: y + 8 } });
/** A Dentrix-style box: procedures, type, code, number, on four short lines. */
const box = (i: number, y: number, procedures: string, code: string, num: string) => [at(i, y, procedures), at(i, y + 10, 'General'), at(i, y + 20, code, 70), at(i, y + 30, num)];

describe('whose chair it is today', () => {
  const header = [at(2, 5, 'DT-3', 95), at(4, 5, 'HT-1', 95), at(3, 5, 'DT-4', 95)];
  const dt3 = [...box(2, 100, 'CrwnMod#15, CrwnMod#26', 'DROS', '0739'), ...box(2, 200, 'SigInlyEnd#13', 'DR0S', '0717'), ...box(2, 300, 'DeCrInl#3', 'DRQ5', '0729')];
  const ht1 = [...box(4, 100, 'P-Screen, ProphyAd', 'HY16', '0129'), ...box(4, 200, 'PerMaint', 'HY16', '0133')];
  const dt4 = [at(3, 150, 'HOLD - IN DOC CENTER')];
  const words = [...header, ...dt3, ...ht1, ...dt4];
  it('the doctor, from three boxes whose code the engine misread three ways', () => {
    const s = suggestColumnProvider(words, col(2), W, H, [doctor, molly, lucia], [], true);
    expect(s.providerCode).toBe('DR05');
    expect(s.department).toBe('doctor');
    // The code is read but not registered: the work still names the only doctor.
    expect(s.provider).toEqual(doctor);
  });
  it('the hygienist, from her registered code', () => {
    expect(suggestColumnProvider(words, col(4), W, H, [doctor, molly, lucia], [], true).provider).toEqual(molly);
  });
  it('a hold-only chair named DT-4 leans on the chair name, still for review', () => {
    const s = suggestColumnProvider(words, col(3), W, H, [doctor, molly, lucia], [], true);
    expect(s.providerCode).toBeUndefined();
    expect(s.department).toBe('doctor');
    expect(s.provider).toEqual(doctor);
  });
  it('asks when two doctors are active, and never guesses from a code alone', () => {
    expect(suggestColumnProvider(words, col(2), W, H, [doctor, doctor2, molly], [], true).provider).toBeUndefined();
    const codeOnly = [at(2, 100, 'DR02', 99)];
    expect(suggestColumnProvider(codeOnly, col(2), W, H, [doctor], [], true).provider).toBeUndefined();
  });
  it('is read afresh each day: a chair used by hygiene today is hygiene today', () => {
    const yesterday: LayoutColumn[] = [{ ...col(2), kind: 'provider', ...providerColumn(doctor), providerCode: 'DR05' }];
    const today = [...header, ...box(2, 100, 'ProphyAd, MultiXray', 'HY10', '0207'), ...box(2, 200, 'PerMaint, Fl2nd', 'HY10', '0298')];
    const regions = [{ x0: 205, y0: 98, x1: 295, y1: 140 }, { x0: 205, y0: 198, x1: 295, y1: 240 }];
    const suggested = suggestDailyColumns(today, yesterday, W, H, [doctor, molly, lucia], regions);
    expect(suggested[0].providerId).toBe('lucia');
  });
});

describe('an appointment whose code was misread is still an appointment', () => {
  const regions = [{ x0: 205, y0: 98, x1: 295, y1: 140 }, { x0: 205, y0: 198, x1: 295, y1: 240 }, { x0: 405, y0: 98, x1: 495, y1: 140 }];
  const words = [...box(2, 100, 'CrwnMod#15, CrwnMod#26', 'DRXX', '0739'), ...box(2, 200, 'SigInlyEnd#13', 'ORO5', '0717'), ...box(4, 100, 'ProphyAd', 'HY16', '0129')];
  it('keeps the column clinical although codes are visible elsewhere on the grid', () => {
    expect(isNotesOnlyColumn(words, regions, col(2), W)).toBe(false);
    // Codes count as visible once they repeat across boxes; then a code-less, number-less box is a note.
    expect(isNotesOnlyColumn([at(3, 150, 'NO MORE CROWNS FOR RNH'), ...box(4, 100, 'ProphyAd', 'HY16', '0129'), ...box(4, 200, 'PerMaint', 'HY16', '0133')], [{ x0: 305, y0: 148, x1: 395, y1: 165 }, regions[2], { x0: 405, y0: 198, x1: 495, y1: 240 }], col(3), W)).toBe(true);
  });
  it('counts as a completed visit in the column\'s metrics', () => {
    const column: LayoutColumn & { pxStart: number; pxEnd: number } = { ...col(2), pxStart: 200, pxEnd: 300, kind: 'provider', ...providerColumn(doctor), providerCode: 'DR05' };
    const rows = [{ yTop: 100, yBottom: 140 }, { yTop: 200, yBottom: 240 }, { yTop: 300, yBottom: 340 }];
    expect(applyCompletedEvidence(['completed', 'completed', 'completed'], rows, regions, words, column, [])).toEqual(['completed', 'completed', null]);
  });
});
