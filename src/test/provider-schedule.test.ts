import { describe, expect, it } from 'vitest';
import { providerColumn, suggestColumnProvider, unplacedProviders } from '@/lib/schedule-provider-mapping';
import { parseWorkingSchedule, workingScheduleText } from '@/lib/provider-working-schedule';
import { applyProviderHours } from '@/lib/schedule-reader/provider-hours';
import { buildProviderMetrics } from '@/lib/schedule-reader/metrics-builder';
import { refereeMetrics, computeRollup } from '@/lib/schedule-reader/metrics-referee';
import type { Provider } from '@/lib/providers';
import type { LayoutColumn, OcrWord, ReducedRow, ClassifiedBlock } from '@/lib/schedule-reader/types';
const doctor: Provider = { id: 'p1', orgId: 'o1', displayName: 'Dr. Test', providerType: 'doctor', employeeId: 'e1', active: true, sortOrder: 0 };
const col: LayoutColumn = { xStart: .1, xEnd: .6, kind: 'provider', ...providerColumn(doctor), providerCode: 'DR02' };
const word = (text: string, confidence = 99, y = 10): OcrWord => ({ text, confidence, bbox: { x0: 20, x1: 40, y0: y, y1: y+5 } });
describe('Provider mapping', () => {
  it('fills type, department and employee identity from the selected registry entry', () => {
    expect(providerColumn(doctor)).toMatchObject({ providerId: 'p1', providerRole: 'dentist', department: 'doctor', employeeId: 'e1' });
    expect(providerColumn({ ...doctor, providerType: 'hygienist' })).toMatchObject({ providerRole: 'hygienist', department: 'hygiene' });
    expect(providerColumn({ ...doctor, providerType: 'assistant' })).toMatchObject({ providerRole: 'dental_assistant', department: 'other' });
  });
  it('recognizes DR02 but only suggests a previously confirmed provider', () => {
    const fresh = suggestColumnProvider([word('DR02')], col, 100, 100, [doctor], []);
    expect(fresh).toMatchObject({ providerCode: 'DR02', provider: undefined, notesOnly: false, codes: [{ code: 'DR02', count: 1 }] });
    // An unowned code still narrows the choice: the only doctor without a
    // schedule code is offered as a pick, with its reason — never filled in.
    expect(fresh.candidates).toEqual([{ providerId: 'p1', strength: 'likely', reason: expect.stringContaining('the only doctor without a schedule code yet') }]);
    const remembered = suggestColumnProvider([word('DR02')], col, 100, 100, [doctor], [col]);
    expect(remembered.provider).toEqual(doctor);
    expect(remembered.reason).toBe('DR02 was Dr. Test in the last calibration');
  });
  it('does not match ambiguous, inactive, low-confidence or body codes', () => {
    const other = { ...doctor, id: 'p2' };
    expect(suggestColumnProvider([word('DR02')], col, 100, 100, [doctor, other], [col, { ...col, providerId: 'p2' }]).provider).toBeUndefined();
    expect(suggestColumnProvider([word('DR02')], col, 100, 100, [{ ...doctor, active: false }], [col]).provider).toBeUndefined();
    expect(suggestColumnProvider([word('DR02', 60)], col, 100, 100, [doctor], [col]).provider).toBeUndefined();
    expect(suggestColumnProvider([word('DR02', 99, 80)], col, 100, 100, [doctor], [col]).provider).toBeUndefined();
  });
  it("reads the office's own codes through OCR slips and keeps distinct codes apart", () => {
    const molly: Provider = { ...doctor, id: 'molly', displayName: 'Molly', providerType: 'hygienist', scheduleCode: 'HY16' };
    // HY1G read twice is HY16 (G is how OCR misreads a 6) — Molly, with the reason spelled out.
    const slipped = suggestColumnProvider([word('HY1G', 70, 20), word('HY1G', 70, 40)], col, 100, 100, [molly], [], true);
    expect(slipped.provider).toEqual(molly);
    expect(slipped.providerCode).toBe('HY16');
    expect(slipped.reason).toBe("HY16 is Molly's schedule code");
    // A clean DR03 beside a registered DR02 is a different provider, not a misread.
    const scott: Provider = { ...doctor, id: 'scott', displayName: 'Dr. Scott', scheduleCode: 'DR02' };
    const other = suggestColumnProvider([word('DR03', 99, 10)], col, 100, 100, [scott], [], true);
    expect(other.providerCode).toBe('DR03');
    expect(other.provider).toBeUndefined();
    expect(other.candidates).toEqual([]);
  });
  it('offers the majority code of a mixed lane as a pick and never fills it in', () => {
    const scott: Provider = { ...doctor, id: 'scott', displayName: 'Dr. Scott', scheduleCode: 'DR02' };
    const molly: Provider = { ...doctor, id: 'molly', displayName: 'Molly', providerType: 'hygienist', scheduleCode: 'HY16' };
    const words = [word('DR02', 99, 20), word('DR02', 99, 40), word('DR02', 99, 60), word('DR02', 99, 80), word('HY16', 99, 50)];
    const mixed = suggestColumnProvider(words, col, 100, 100, [scott, molly], [], true);
    expect(mixed.provider).toBeUndefined();
    expect(mixed.providerCode).toBe('DR02');
    expect(mixed.codes).toEqual([{ code: 'DR02', count: 4 }, { code: 'HY16', count: 1 }]);
    expect(mixed.candidates).toEqual([
      { providerId: 'scott', strength: 'likely', reason: expect.stringContaining('mostly DR02') },
      { providerId: 'molly', strength: 'possible', reason: 'HY16 ×1 read here' },
    ]);
    // Without a clear majority nothing is preferred — both are equal picks.
    const even = suggestColumnProvider([word('DR02', 99, 20), word('DR02', 99, 40), word('HY16', 99, 60), word('HY16', 99, 80)], col, 100, 100, [scott, molly], [], true);
    expect(even.providerCode).toBeUndefined();
    expect(even.provider).toBeUndefined();
    expect(even.candidates.map(c => c.strength)).toEqual(['possible', 'possible']);
  });
  it('lists the active providers no column has claimed yet', () => {
    const scott: Provider = { ...doctor, id: 'scott', displayName: 'Dr. Scott' };
    const gone: Provider = { ...doctor, id: 'gone', displayName: 'Dr. Gone', active: false };
    const columns = [{ kind: 'provider' as const, providerId: 'p1' }, { kind: 'non_clinical' as const, providerId: 'scott' }];
    expect(unplacedProviders([doctor, scott, gone], columns).map(p => p.id)).toEqual(['scott']);
  });
});
describe('Reviewed weekly working schedules', () => {
  it('extracts only weekdays and times, including split shifts and off-days', () => {
    const periods = parseWorkingSchedule('Dr. Test\nMonday,8:00 AM,12:00 PM\nMonday,13:00,17:00\nTuesday,off');
    expect(periods).toEqual([{ weekday: 1, startMinutes: 480, endMinutes: 720 }, { weekday: 1, startMinutes: 780, endMinutes: 1020 }, { weekday: 2, startMinutes: 0, endMinutes: 0 }]);
    expect(workingScheduleText(periods)).not.toContain('Test');
  });
  it.each(['Monday,08:00,07:00', 'Monday,08:90,17:00', 'Monday,08:00,17:00\nMonday,off', 'Monday,08:00,17:00\nMonday,10:00,11:00', 'No usable rows'])('rejects invalid or ambiguous hours: %s', value => expect(() => parseWorkingSchedule(value)).toThrow());
  it('explains empty off-duty time without hiding appointments and still passes the referee', () => {
    const rows: ReducedRow[] = [{ category: 'open', scheduledColumns: 0 }, { category: 'scheduled', scheduledColumns: 1 }, { category: 'open', scheduledColumns: 0 }];
    const result = applyProviderHours(rows, [{ weekday: 1, startMinutes: 540, endMinutes: 600 }], '2026-06-08', 480, 30);
    expect(result.offDutyMinutes).toBe(30); expect(result.conflict).toBe(true);
    expect(result.rows.map(r => r.category)).toEqual(['blocked', 'scheduled', 'open']);
    const blocks: ClassifiedBlock[] = [{ code: 'PROVIDER_OFF', minutes: 30, providerLabel: 'Dr. Test', department: 'doctor', confidence: 1, userConfirmed: true }];
    const metrics = buildProviderMetrics({ providerLabel: 'Dr. Test', providerRole: 'dentist', department: 'doctor', employeeId: null, businessDate: '2026-06-08', rows: result.rows, minutesPerRow: 30, activeColumns: 1, blocks, supportStaffAssigned: null, ocrConfidence: 1, layoutConfidence: 1 });
    expect(metrics.trueOpenMinutes).toBe(30); expect(metrics.intentionalUnavailableMinutes).toBe(30);
    expect(refereeMetrics({ providers: [metrics], blocks, rollup: computeRollup([metrics]) }).ok).toBe(true);
  });
  it('does not infer availability on an unlisted weekday', () => {
    const rows: ReducedRow[] = [{ category: 'open', scheduledColumns: 0 }];
    expect(applyProviderHours(rows, [{ weekday: 2, startMinutes: 0, endMinutes: 0 }], '2026-06-08', 480, 10).rows).toBe(rows);
  });
});
