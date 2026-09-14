import { describe, it, expect } from 'vitest';
import { deriveAttendanceRows } from '@/lib/attendance-derive';
describe('grace period boundary', () => {
  it.each([[30, false], [31, true]])('08:%i with an 08:25 start and five minutes grace', (minute, late) => {
    const rows = deriveAttendanceRows({
      employeeIds: ['e'], start: '2026-09-07', end: '2026-09-07', today: '2026-09-07',
      entries: [{ employee_id: 'e', entry_date: '2026-09-07', punches: [{ punch_type: 'in', punch_time: 'clock-in' }] }],
      assignments: [{ employee_id: 'e', effective_start: '2026-01-01', effective_end: null,
        weekdays: [{ weekday: 1, enabled: true, start_time: '08:25', end_time: '17:00', grace_minutes: 5, threshold_minutes: 1 }] }],
      daysOff: [], closureDates: new Set(), wallMinutes: () => 8 * 60 + minute,
    });
    expect(rows[0].is_late).toBe(late);
  });
});
