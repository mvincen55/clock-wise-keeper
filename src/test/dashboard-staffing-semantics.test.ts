import { describe, expect, it } from 'vitest';
import type { EmployeeSnapshot } from '@/hooks/useOrgAttendanceSnapshot';
import {
  attendanceReview,
  excludeNonClocking,
  formatClockLabel,
  isClockedInNow,
  isExpectedNow,
  officeStatus,
  parseClockMinutes,
  personStatusAt,
  staffingSummary,
} from '@/components/dashboard/staffing';
import { readout } from '@/components/dashboard/charts';
import type { Series } from '@/components/dashboard/types';

/**
 * Regression coverage for the Owner Home correction pass:
 *  - owners never read as absent/out because they do not clock,
 *  - a closed office never invents staffing exceptions,
 *  - "on the floor" derives from the actual shift interval, never from
 *    "scheduled sometime today",
 *  - no denominator renders no-data, a real zero renders 0%.
 */

function snap(overrides: Partial<EmployeeSnapshot> = {}): EmployeeSnapshot {
  return {
    employee_id: 'e1',
    user_id: 'u1',
    display_name: 'Dana R.',
    status_code: 'ok',
    is_late: false,
    is_absent: false,
    is_incomplete: false,
    has_punches: false,
    is_remote: false,
    minutes_late: 0,
    has_day_off: false,
    office_closed: false,
    is_scheduled_day: false,
    schedule_expected_start: null,
    schedule_expected_end: null,
    tardy_approval_status: null,
    ...overrides,
  };
}

/** A person scheduled 8:30–17:00 who never punched — the DB marks is_absent
 *  the moment there are no punches, regardless of the hour. */
const scheduledNoPunch = snap({
  is_scheduled_day: true,
  is_absent: true,
  schedule_expected_start: '08:30:00',
  schedule_expected_end: '17:00:00',
});

const at = (h: number, m = 0) => new Date(2026, 2, 6, h, m); // Fri Mar 6, 2026, local

describe('time parsing', () => {
  it('parses schedule times and formats labels', () => {
    expect(parseClockMinutes('08:30:00')).toBe(510);
    expect(parseClockMinutes(null)).toBeNull();
    expect(formatClockLabel('08:30:00')).toBe('8:30 AM');
    expect(formatClockLabel('17:00:00')).toBe('5:00 PM');
  });
});

describe('owner exclusion (owners never clock)', () => {
  const owner = { user_id: 'owner-1', name: 'Dr. Megan' };
  const staffer = { user_id: 'u2', name: 'Dana' };
  const unlinked = { user_id: null, name: 'Invited, no account yet' };

  it('removes owner rows at the data boundary, keeps everyone else', () => {
    const rows = excludeNonClocking([owner, staffer, unlinked], new Set(['owner-1']));
    expect(rows.map(r => r.name)).toEqual(['Dana', 'Invited, no account yet']);
  });

  it('an owner therefore can never appear absent, out, or as an exception', () => {
    const ownerRow = snap({ user_id: 'owner-1', is_scheduled_day: true, is_absent: true });
    const rows = excludeNonClocking([ownerRow], new Set(['owner-1']));
    expect(rows).toHaveLength(0);
    const summary = staffingSummary(rows, at(22, 32));
    expect(summary.reviewCount).toBe(0);
    expect(summary.rows).toHaveLength(0);
  });
});

describe('"on the floor" is never derived from "scheduled sometime today"', () => {
  it('at 10:32 PM a person scheduled 8:30–5:00 is NOT expected now', () => {
    expect(isExpectedNow(scheduledNoPunch, 22 * 60 + 32)).toBe(false);
  });

  it('at 10:00 AM the same person IS expected now', () => {
    expect(isExpectedNow(scheduledNoPunch, 10 * 60)).toBe(true);
  });

  it('an open punch pair means clocked in right now; a closed day does not', () => {
    expect(isClockedInNow(snap({ has_punches: true, is_incomplete: true }))).toBe(true);
    expect(isClockedInNow(snap({ has_punches: true, is_incomplete: false }))).toBe(false);
    expect(isClockedInNow(snap({ has_punches: false }))).toBe(false);
  });
});

describe('closed office produces no live staffing claims and no exceptions', () => {
  it('after close: phase is after_close and no expected/present numbers exist', () => {
    const summary = staffingSummary([{ ...scheduledNoPunch, has_punches: true, is_absent: false }], at(22, 32));
    expect(summary.office.phase).toBe('after_close');
    expect(summary.office.headline).toBe('Closed for the day');
    expect(summary.expectedNow).toBeNull();
    expect(summary.presentNow).toBeNull();
    expect(summary.rows).toHaveLength(0);
    expect(summary.reviewCount).toBe(0);
  });

  it('normal off-hours (everyone worked, clocked out) is not an exception', () => {
    const worked = snap({
      is_scheduled_day: true,
      has_punches: true,
      is_incomplete: false,
      schedule_expected_start: '08:30:00',
      schedule_expected_end: '17:00:00',
    });
    const { count } = attendanceReview([worked, { ...worked, employee_id: 'e2' }], at(22, 32));
    expect(count).toBe(0);
  });

  it('an org closure day reads as closed_today with zero exceptions', () => {
    const closed = snap({ office_closed: true, is_scheduled_day: true });
    const summary = staffingSummary([closed], at(10, 0));
    expect(summary.office.phase).toBe('closed_today');
    expect(summary.reviewCount).toBe(0);
    expect(summary.rows).toHaveLength(0);
  });

  it('a genuinely missed scheduled day IS still an exception after the shift ends', () => {
    const { count, detail } = attendanceReview([scheduledNoPunch], at(22, 32));
    expect(count).toBe(1);
    expect(detail).toContain('no-punch');
  });

  it('before the shift starts, a missing punch is NOT yet an exception', () => {
    const { count } = attendanceReview([scheduledNoPunch], at(7, 0));
    expect(count).toBe(0);
  });
});

describe('phase-aware person status (nobody is "Out" for being off-shift)', () => {
  it('after close with punches: "Done for the day", calm', () => {
    const p = personStatusAt(
      snap({ is_scheduled_day: true, has_punches: true, schedule_expected_start: '08:30:00', schedule_expected_end: '17:00:00' }),
      at(22, 32),
    );
    expect(p.status).toBe('Done for the day');
    expect(p.tone).toBe('calm');
  });

  it('before their start: "Starts 8:30 AM", calm — never "Out"', () => {
    const p = personStatusAt(scheduledNoPunch, at(7, 45));
    expect(p.status).toBe('Starts 8:30 AM');
    expect(p.tone).toBe('calm');
  });

  it('mid-shift with no punch: "Not in yet", attention', () => {
    const p = personStatusAt(scheduledNoPunch, at(10, 0));
    expect(p.status).toBe('Not in yet');
    expect(p.tone).toBe('attention');
  });

  it('clocked in mid-shift reads as In (late arrivals stay flagged)', () => {
    const inNow = snap({
      is_scheduled_day: true, has_punches: true, is_incomplete: true,
      schedule_expected_start: '08:30:00', schedule_expected_end: '17:00:00',
    });
    expect(personStatusAt(inNow, at(10, 0)).status).toBe('In');
    const late = personStatusAt({ ...inNow, is_late: true, minutes_late: 12 }, at(10, 0));
    expect(late.status).toBe('In · late 12m');
    expect(late.tone).toBe('attention');
  });

  it('no status ever says the bare word "Out"', () => {
    const cases = [
      personStatusAt(scheduledNoPunch, at(7, 0)),
      personStatusAt(scheduledNoPunch, at(12, 0)),
      personStatusAt(scheduledNoPunch, at(23, 0)),
      personStatusAt(snap(), at(12, 0)),
    ];
    for (const c of cases) expect(c.status).not.toBe('Out');
  });
});

describe('manager/team live behavior stays intact while the office is open', () => {
  it('open phase still counts present, expected, and not-in-yet', () => {
    const inNow = snap({
      employee_id: 'a', is_scheduled_day: true, has_punches: true, is_incomplete: true,
      schedule_expected_start: '08:30:00', schedule_expected_end: '17:00:00',
    });
    const missing = { ...scheduledNoPunch, employee_id: 'b' };
    const summary = staffingSummary([inNow, missing], at(10, 0));
    expect(summary.office.phase).toBe('open');
    expect(summary.expectedNow).toBe(2);
    expect(summary.presentNow).toBe(1);
    expect(summary.missingNow).toBe(1);
    expect(summary.rows).toHaveLength(2);
  });

  it('unknown shift times fall back to day-level language, not live claims', () => {
    const noTimes = snap({ is_scheduled_day: true });
    const summary = staffingSummary([noTimes], at(10, 0));
    expect(summary.office.phase).toBe('unknown_hours');
    expect(summary.expectedNow).toBeNull();
    expect(summary.scheduledToday).toBe(1);
  });

  it('no schedule at all reads as no_schedule, never 0/0 on the floor', () => {
    expect(officeStatus([], at(10, 0)).phase).toBe('no_schedule');
    expect(officeStatus([snap()], at(10, 0)).phase).toBe('no_schedule');
  });
});

describe('zero vs no-data in the trend readout', () => {
  const series = (points: Series['points']): Series => ({
    id: 'arrivals', title: 't', question: 'q', caption: 'c', format: 'percent', points,
  });

  it('no denominator renders no-data ("—"), never 0%', () => {
    expect(readout(series([{ x: 'M', value: 0, of: 0 }]))).toBe('—');
    expect(readout(series([]))).toBe('—');
  });

  it('a genuine denominator with zero on-time renders a real 0%', () => {
    expect(readout(series([{ x: 'M', value: 0, of: 4 }]))).toBe('0%');
  });

  it('a normal ratio still computes', () => {
    expect(readout(series([{ x: 'M', value: 3, of: 4 }]))).toBe('75%');
  });
});
