import type { EmployeeSnapshot } from '@/hooks/useOrgAttendanceSnapshot';
import { parseClockMinutes } from '@/components/dashboard/staffing';

export type SnapshotBucket = 'closed' | 'day_off' | 'callout' | 'unscheduled' | 'absent' | 'late' | 'incomplete' | 'clocked_in' | 'not_started';

/**
 * One bucket per person for today. Order matters: an absence beats a
 * tardy, a tardy beats an incomplete day, and any punches at all mean the
 * person is in — a late arrival is still an arrival. A recorded callout
 * carries the day-off flag but the engine still marks the day absent, so
 * it is its own bucket: an absence with a reason, never planned time off.
 */
export function statusBucket(s: EmployeeSnapshot, nowMinutes?: number): SnapshotBucket {
  if (s.office_closed) return 'closed';
  if (s.has_day_off) return s.is_absent ? 'callout' : 'day_off';
  if (!s.is_scheduled_day) return 'unscheduled';
  if (s.is_absent && !s.has_punches) {
    // The engine marks the day absent from the first minute; until the shift
    // has ended the person is not in yet, not absent (src/lib/attendance-day.ts).
    const end = parseClockMinutes(s.schedule_expected_end);
    if (nowMinutes !== undefined && end !== null && nowMinutes <= end) return 'not_started';
    return 'absent';
  }
  if (s.is_late) return 'late';
  if (s.is_incomplete) return 'incomplete';
  if (s.has_punches) return 'clocked_in';
  return 'not_started';
}

/**
 * The four numbers a manager glances at. "In" is everyone who has punched
 * today, late arrivals included; "Late" is the subset who arrived late;
 * "Not in" is everyone scheduled who has no punches yet, callouts included.
 */
export function snapshotCounts(snapshots: EmployeeSnapshot[], nowMinutes?: number) {
  const buckets = snapshots.map(s => statusBucket(s, nowMinutes));
  const count = (...b: SnapshotBucket[]) => buckets.filter(x => b.includes(x)).length;
  return {
    total: snapshots.length,
    in: count('clocked_in', 'late', 'incomplete'),
    late: count('late'),
    notIn: count('absent', 'callout', 'not_started'),
  };
}
