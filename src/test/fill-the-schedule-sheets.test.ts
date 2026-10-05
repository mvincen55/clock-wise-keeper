import { describe, expect, it } from 'vitest';
import { campaignWeeks, score, weekKey } from '@/lib/fill-the-schedule';
import { matchStaff, sheetTimestamp } from '@/features/fill-the-schedule/sheet-reader';
import { campaign, fixture } from './fixtures/fill-schedule';
import fs from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { personalizeSheetWorkbook } from '@/features/fill-the-schedule/sheet-workbook';

describe('paper event dates and credit', () => {
  it('requires AM/PM for ambiguous handwriting and rejects impossible dates rather than guessing', () => {
    expect(sheetTimestamp('10/13', '2:40p', campaign)).toBe('2026-10-13T18:40:00.000Z');
    expect(sheetTimestamp('10/13', '14:40', campaign)).toBe('2026-10-13T18:40:00.000Z');
    expect(sheetTimestamp('10/13', '2:40', campaign)).toBeNull();
    expect(sheetTimestamp('2/30', '2:40p', campaign)).toBeNull();
  });
  it('never guesses between employees sharing a first name and accepts exact unique roster matches', () => {
    const names = [{ id: 'a', display_name: 'Dana Jones', employment_status: 'active' }, { id: 'b', display_name: 'Dana Smith', employment_status: 'active' }, { id: 'c', display_name: 'Alize', employment_status: 'active' }];
    expect(matchStaff('Dana', names)).toBeNull(); expect(matchStaff('Dana Jones', names)).toBe('a'); expect(matchStaff('Alizé', names)).toBe('c'); expect(matchStaff('unrecognized text', names)).toBeNull();
  });
  it('has thirteen tallies beginning October 9, with no October 2', () => {
    const keys = campaignWeeks(campaign); expect(keys).toHaveLength(13); expect(keys[0]).toBe('2026-10-09'); expect(keys.at(-1)).toBe('2026-12-31'); expect(keys).not.toContain('2026-10-02');
  });
  it('worked example: Dana 17 to 21, independently approved 2 + 2 on October 13, one prize pick', () => {
    const d = fixture(); const p = d.participants[0]; const original = d.activities[0];
    d.activities = [{ ...original, id: 'earlier', activity_type: 'qr_card', quantity: 17, status: 'approved', awarded_points: 17, tally_week: '2026-10-16' },
      { ...original, id: 'handoff', activity_type: 'operative_handoff', occurred_at: '2026-10-13T18:40:00Z', tally_week: '2026-10-16', source: 'sheet', sheet_code: 'S-1016-A', sheet_row: 4, status: 'approved', awarded_points: 2 },
      { ...original, id: 'prepay', activity_type: 'prepay_bonus', parent_id: 'handoff', occurred_at: '2026-10-13T18:55:00Z', tally_week: '2026-10-16', status: 'approved', awarded_points: 2 }];
    expect(score(d, p, '2026-10-16')).toMatchObject({ points: 21, earned: 1 });
    d.activities[2].status = 'pending'; d.activities[2].awarded_points = null;
    expect(score(d, p, '2026-10-16')).toMatchObject({ points: 19, earned: 0 });
    d.activities[2].status = 'approved'; d.activities[2].awarded_points = 2; d.activities[2].occurred_at = '2026-10-20T18:55:00Z'; d.activities[2].tally_week = weekKey(d.activities[2].occurred_at, campaign);
    expect(score(d, p, '2026-10-16').points).toBe(19); expect(score(d, p, '2026-10-23').points).toBe(2);
  });
});

describe('the front-desk download', () => {
  it('uses the registered code and keeps the shaded manager columns, twelve rows, print area and corner squares', () => {
    const template = new Uint8Array(fs.readFileSync('src/features/fill-the-schedule/front-desk-template.xlsx'));
    const sheet = { ...fixture().sheets![0], sheet_code: 'S-1016-B', week_key: '2026-10-16' };
    const files = unzipSync(personalizeSheetWorkbook(template, sheet, campaign, 'Harelick & Associates'));
    const original = unzipSync(template);
    const form = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(form).toContain('S-1016-B'); expect(form).toContain('Harelick &amp; Associates');
    expect(form).toContain('Friday October 16, 2026'); expect(form).not.toContain('__SHEET_CODE__');
    expect(form).toContain('orientation="landscape"'); expect(form).toContain('fitToHeight="1"');
    expect(strFromU8(files['xl/workbook.xml'])).toContain("$A$1:$N$25");
    expect(files['xl/styles.xml']).toEqual(original['xl/styles.xml']);
    expect(files['xl/drawings/drawing1.xml']).toEqual(original['xl/drawings/drawing1.xml']);
    expect(strFromU8(files['xl/drawings/drawing1.xml']).match(/<xdr:oneCellAnchor>/g)).toHaveLength(4);
    expect(form.match(/<c r="B(?:1[0-9]|2[01])"/g)).toHaveLength(12);
  });
});
