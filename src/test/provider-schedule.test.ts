import { describe, expect, it } from 'vitest';
import { providerColumn, suggestColumnProvider } from '@/lib/schedule-provider-mapping';
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
    expect(suggestColumnProvider([word('DR02')], col, 100, 100, [doctor], [])).toEqual({ providerCode: 'DR02', provider: undefined, notesOnly: false });
    expect(suggestColumnProvider([word('DR02')], col, 100, 100, [doctor], [col]).provider).toEqual(doctor);
  });
  it('does not match ambiguous, inactive, low-confidence or body codes', () => {
    const other = { ...doctor, id: 'p2' };
    expect(suggestColumnProvider([word('DR02')], col, 100, 100, [doctor, other], [col, { ...col, providerId: 'p2' }]).provider).toBeUndefined();
    expect(suggestColumnProvider([word('DR02')], col, 100, 100, [{ ...doctor, active: false }], [col]).provider).toBeUndefined();
    expect(suggestColumnProvider([word('DR02', 60)], col, 100, 100, [doctor], [col]).provider).toBeUndefined();
    expect(suggestColumnProvider([word('DR02', 99, 80)], col, 100, 100, [doctor], [col]).provider).toBeUndefined();
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

