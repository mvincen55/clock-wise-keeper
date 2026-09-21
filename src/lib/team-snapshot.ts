import type { EmployeeSnapshot } from '@/hooks/useOrgAttendanceSnapshot';

export type SnapshotBucket = 'closed' | 'day_off' | 'unscheduled' | 'absent' | 'late' | 'incomplete' | 'clocked_in' | 'not_started';

/**
 * One bucket per person for today. Order matters: an absence beats a
 * tardy, a tardy beats an incomplete day, and any punches at all mean the
 * person is in — a late arrival is still an arrival.
 */
export function statusBucket(s: EmployeeSnapshot): SnapshotBucket {
  if (s.office_closed) return 'closed';
  if (s.has_day_off) return 'day_off';
  if (!s.is_scheduled_day) return 'unscheduled';
  if (s.is_absent && !s.has_punches) return 'absent';
  if (s.is_late) return 'late';
  if (s.is_incomplete) return 'incomplete';
  if (s.has_punches) return 'clocked_in';
  return 'not_started';
}

/**
 * The four numbers a manager glances at. "In" is everyone who has punched
 * today, late arrivals included; "Late" is the subset who arrived late;
 * "Not in" is everyone scheduled who has no punches yet.
 */
export function snapshotCounts(snapshots: EmployeeSnapshot[]) {
  const buckets = snapshots.map(statusBucket);
  const count = (...b: SnapshotBucket[]) => buckets.filter(x => b.includes(x)).length;
  return {
    total: snapshots.length,
    in: count('clocked_in', 'late', 'incomplete'),
    late: count('late'),
    notIn: count('absent', 'not_started'),
  };
}
