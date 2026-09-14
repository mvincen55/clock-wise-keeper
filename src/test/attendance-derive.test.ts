import { describe, it, expect } from 'vitest';
import { deriveAttendanceRows, derivedTardies, type DeriveInput } from '@/lib/attendance-derive';

// A pending team member: employees.user_id IS NULL, so the user-scoped
// attendance engine never produced rows for them. Everything below is keyed by
// employee_id only.
const EMP = '4a4431e9-f14c-5433-9311-158228544c15';

/** Wall-clock minutes for a fixed-offset test timestamp. */
const wallMinutes = (iso: string) => {
  const [, time] = iso.split('T');
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

const weekdays = [0, 1, 2, 3, 4, 5, 6].map(weekday => ({
  weekday,
  enabled: weekday >= 1 && weekday <= 5, // Mon–Fri
  start_time: '08:00',
  end_time: '17:00',
  grace_minutes: 5,
  threshold_minutes: 1,
}));

function baseInput(overrides: Partial<DeriveInput> = {}): DeriveInput {
  return {
    employeeIds: [EMP],
    start: '2026-09-07', // Monday
    end: '2026-09-13', // Sunday
    today: '2026-09-13',
    entries: [],
    assignments: [
      { employee_id: EMP, effective_start: '2026-01-01', effective_end: null, weekdays },
    ],
    daysOff: [],
    closureDates: new Set<string>(),
    wallMinutes,
    ...overrides,
  };
}

const entry = (date: string, punches: [string, string][], is_remote = false) => ({
  employee_id: EMP,
  entry_date: date,
  is_remote,
  punches: punches.map(([punch_type, punch_time]) => ({ punch_type, punch_time })),
});

describe('deriveAttendanceRows — pending employee (no login)', () => {
  it('shows attendance from punches linked only by employee_id', () => {
    const rows = deriveAttendanceRows(baseInput({
      entries: [entry('2026-09-07', [['in', '2026-09-07T07:58'], ['out', '2026-09-07T17:02']])],
    }));
    const monday = rows.find(r => r.entry_date === '2026-09-07')!;
    expect(monday.has_punches).toBe(true);
    expect(monday.is_late).toBe(false);
    expect(monday.is_absent).toBe(false);
    expect(monday.status_code).toBe('ok');
  });

  it('flags a late arrival past the grace window and derives a tardy', () => {
    const rows = deriveAttendanceRows(baseInput({
      entries: [entry('2026-09-08', [['in', '2026-09-08T08:22'], ['out', '2026-09-08T17:00']])],
    }));
    const tuesday = rows.find(r => r.entry_date === '2026-09-08')!;
    expect(tuesday.is_late).toBe(true);
    expect(tuesday.minutes_late).toBe(17); // 08:22 vs 08:00 + 5 min grace
    expect(tuesday.status_code).toBe('late');

    const tardies = derivedTardies(rows);
    expect(tardies).toHaveLength(1);
    expect(tardies[0].entry_date).toBe('2026-09-08');
  });

  it('does not flag an arrival inside the grace window', () => {
    const rows = deriveAttendanceRows(baseInput({
      entries: [entry('2026-09-08', [['in', '2026-09-08T08:04']])],
    }));
    expect(rows.find(r => r.entry_date === '2026-09-08')!.is_late).toBe(false);
  });

  it('never invents a tardy or absence on an unscheduled day', () => {
    const rows = deriveAttendanceRows(baseInput());
    expect(rows.find(r => r.entry_date === '2026-09-12')).toBeUndefined(); // Saturday
    expect(rows.find(r => r.entry_date === '2026-09-13')).toBeUndefined(); // Sunday
    expect(derivedTardies(rows)).toHaveLength(0);
  });

  it('counts a punch on an unscheduled day as worked, not late', () => {
    const rows = deriveAttendanceRows(baseInput({
      entries: [entry('2026-09-12', [['in', '2026-09-12T10:30'], ['out', '2026-09-12T14:00']])],
    }));
    const saturday = rows.find(r => r.entry_date === '2026-09-12')!;
    expect(saturday.is_scheduled_day).toBe(false);
    expect(saturday.is_late).toBe(false);
    expect(saturday.has_punches).toBe(true);
  });

  it('respects approved time off instead of marking absent', () => {
    const rows = deriveAttendanceRows(baseInput({
      daysOff: [{ employee_id: EMP, date_start: '2026-09-09', date_end: '2026-09-10', type: 'scheduled_with_notice' }],
    }));
    for (const date of ['2026-09-09', '2026-09-10']) {
      const row = rows.find(r => r.entry_date === date)!;
      expect(row.has_day_off).toBe(true);
      expect(row.is_absent).toBe(false);
      expect(row.status_code).toBe('day_off');
    }
  });

  it('respects office closures', () => {
    const rows = deriveAttendanceRows(baseInput({ closureDates: new Set(['2026-09-07']) }));
    const monday = rows.find(r => r.entry_date === '2026-09-07')!;
    expect(monday.office_closed).toBe(true);
    expect(monday.is_absent).toBe(false);
    expect(monday.status_code).toBe('closure');
  });

  it('marks a missed scheduled workday absent, but never a future day', () => {
    const rows = deriveAttendanceRows(baseInput({ today: '2026-09-09' }));
    expect(rows.find(r => r.entry_date === '2026-09-07')!.is_absent).toBe(true);
    expect(rows.find(r => r.entry_date === '2026-09-10')!.is_absent).toBe(false);
  });

  it('flags an unbalanced past day as incomplete', () => {
    const rows = deriveAttendanceRows(baseInput({
      entries: [entry('2026-09-07', [['in', '2026-09-07T08:00']])],
    }));
    const monday = rows.find(r => r.entry_date === '2026-09-07')!;
    expect(monday.is_incomplete).toBe(true);
    expect(monday.status_code).toBe('incomplete');
  });

  it('ignores voided punches', () => {
    const rows = deriveAttendanceRows(baseInput({
      today: '2026-09-09',
      entries: [{
        employee_id: EMP,
        entry_date: '2026-09-07',
        is_remote: false,
        punches: [{ punch_type: 'in', punch_time: '2026-09-07T08:30', voided_at: '2026-09-08T00:00:00Z' }],
      }],
    }));
    const monday = rows.find(r => r.entry_date === '2026-09-07')!;
    expect(monday.has_punches).toBe(false);
    expect(monday.is_late).toBe(false);
    expect(monday.is_absent).toBe(true);
  });

  it('returns rows newest first', () => {
    const rows = deriveAttendanceRows(baseInput());
    expect(rows[0].entry_date).toBe('2026-09-11');
  });
});
