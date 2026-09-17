/**
 * Employee-scoped attendance derivation.
 *
 * `attendance_day_status` is written by a user-scoped recompute engine, so a
 * team member who has punch history but has not yet accepted an invite
 * (`employees.user_id IS NULL`) never gets rows. Employee identity is the
 * durable key, so this module derives the same day facts from records that are
 * already linked by `employee_id`: time entries + punches, the assigned
 * schedule, approved days off, and office closures.
 *
 * It is a read-only fallback. It never writes, never deletes, and stored
 * attendance rows always win for the dates they cover.
 */

export type DerivePunch = {
  punch_type: string;
  punch_time: string;
  voided_at?: string | null;
};

export type DeriveTimeEntry = {
  employee_id: string;
  entry_date: string;
  is_remote?: boolean | null;
  punches?: DerivePunch[] | null;
};

export type DeriveWeekday = {
  weekday: number;
  enabled: boolean;
  start_time: string | null;
  end_time: string | null;
  grace_minutes: number | null;
  threshold_minutes: number | null;
};

export type DeriveScheduleAssignment = {
  employee_id: string;
  effective_start: string;
  effective_end: string | null;
  weekdays: DeriveWeekday[];
};

export type DeriveDayOff = {
  employee_id: string;
  date_start: string;
  date_end: string;
  type: string;
};

export type DerivedAttendanceRow = {
  id: string;
  employee_id: string;
  user_id: string | null;
  entry_date: string;
  schedule_expected_start: string | null;
  schedule_expected_end: string | null;
  is_scheduled_day: boolean;
  office_closed: boolean;
  has_punches: boolean;
  is_remote: boolean;
  is_absent: boolean;
  is_incomplete: boolean;
  is_late: boolean;
  minutes_late: number;
  tardy_approval_status: string;
  tardy_reviewed: boolean;
  has_day_off: boolean;
  status_code: string;
  /** Marks a row computed in the client rather than read from the table. */
  derived: true;
};

export type DeriveInput = {
  employeeIds: string[];
  start: string;
  end: string;
  /** Today in the office timezone — future days are never called absent. */
  today: string;
  entries: DeriveTimeEntry[];
  assignments: DeriveScheduleAssignment[];
  daysOff: DeriveDayOff[];
  closureDates: Set<string>;
  /** Wall-clock minutes past midnight, in the office timezone. */
  wallMinutes: (iso: string) => number;
};

function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  let cursor = start;
  for (let i = 0; i < 800 && cursor <= end; i++) {
    out.push(cursor);
    const [y, m, d] = cursor.split('-').map(Number);
    const noon = new Date(Date.UTC(y, m - 1, d, 12));
    noon.setUTCDate(noon.getUTCDate() + 1);
    cursor = noon.toISOString().slice(0, 10);
  }
  return out;
}

function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

/** Minutes past midnight for a "HH:MM[:SS]" schedule time. */
function scheduleMinutes(value: string | null): number | null {
  if (!value) return null;
  const [h, m] = value.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function activePunches(entry: DeriveTimeEntry | undefined): DerivePunch[] {
  return (entry?.punches || []).filter(p => !p.voided_at);
}

/**
 * Derives one attendance row per meaningful day: a scheduled day, a day with
 * punches, or a day covered by time off. Unscheduled days with no punches are
 * skipped so nothing invents a tardy or an absence where no shift existed.
 */
export function deriveAttendanceRows(input: DeriveInput): DerivedAttendanceRow[] {
  const { employeeIds, start, end, today, entries, assignments, daysOff, closureDates, wallMinutes } = input;
  const dates = eachDate(start, end);
  const rows: DerivedAttendanceRow[] = [];

  const entryIndex = new Map<string, DeriveTimeEntry>();
  for (const e of entries) entryIndex.set(`${e.employee_id}|${e.entry_date}`, e);

  for (const employeeId of employeeIds) {
    const empAssignments = assignments.filter(a => a.employee_id === employeeId);
    const empDaysOff = daysOff.filter(d => d.employee_id === employeeId);

    for (const date of dates) {
      const entry = entryIndex.get(`${employeeId}|${date}`);
      const punches = activePunches(entry);
      const hasPunches = punches.length > 0;

      const assignment = empAssignments.find(
        a => a.effective_start <= date && (!a.effective_end || a.effective_end >= date)
      );
      const weekday = assignment?.weekdays?.find(w => w.weekday === weekdayOf(date));
      const isScheduledDay = !!weekday?.enabled;

      const coveringOff = empDaysOff.find(d => d.date_start <= date && d.date_end >= date);
      const officeClosed = closureDates.has(date) || coveringOff?.type === 'office_closed';
      const hasDayOff = !!coveringOff && coveringOff.type !== 'office_closed';

      if (!isScheduledDay && !hasPunches && !coveringOff) continue;

      const expectedStart = isScheduledDay ? weekday?.start_time ?? null : null;
      const expectedEnd = isScheduledDay ? weekday?.end_time ?? null : null;

      let isLate = false;
      let minutesLate = 0;
      const startMinutes = scheduleMinutes(expectedStart);
      const firstIn = punches
        .filter(p => p.punch_type === 'in')
        .map(p => wallMinutes(p.punch_time))
        .sort((a, b) => a - b)[0];

      if (isScheduledDay && !officeClosed && !hasDayOff && startMinutes != null && firstIn != null) {
        const grace = weekday?.grace_minutes ?? 0;
        const threshold = Math.max(1, weekday?.threshold_minutes ?? 1);
        const over = firstIn - (startMinutes + grace);
        if (over >= threshold) {
          isLate = true;
          minutesLate = over;
        }
      }

      const isAbsent = isScheduledDay && !officeClosed && !hasDayOff && !hasPunches && date <= today;
      const ins = punches.filter(p => p.punch_type === 'in').length;
      const outs = punches.filter(p => p.punch_type === 'out').length;
      const isIncomplete = hasPunches && ins !== outs && date < today;

      let statusCode = 'ok';
      if (officeClosed) statusCode = 'closure';
      else if (hasDayOff) statusCode = 'day_off';
      else if (isAbsent) statusCode = 'absent';
      else if (isLate) statusCode = 'late';
      else if (isIncomplete) statusCode = 'incomplete';
      else if (!isScheduledDay && hasPunches) statusCode = 'ok';
      else if (!isScheduledDay) statusCode = 'unscheduled';
      else if (entry?.is_remote) statusCode = 'remote_ok';

      rows.push({
        id: `derived:${employeeId}:${date}`,
        employee_id: employeeId,
        user_id: null,
        entry_date: date,
        schedule_expected_start: expectedStart,
        schedule_expected_end: expectedEnd,
        is_scheduled_day: isScheduledDay,
        office_closed: officeClosed,
        has_punches: hasPunches,
        is_remote: !!entry?.is_remote,
        is_absent: isAbsent,
        is_incomplete: isIncomplete,
        is_late: isLate,
        minutes_late: minutesLate,
        tardy_approval_status: 'none',
        tardy_reviewed: false,
        has_day_off: hasDayOff,
        status_code: statusCode,
        derived: true,
      });
    }
  }

  return rows.sort((a, b) => (a.entry_date < b.entry_date ? 1 : a.entry_date > b.entry_date ? -1 : 0));
}

/** Late days pulled out of derived rows, shaped for the Tardies list. */
export function derivedTardies(rows: DerivedAttendanceRow[]) {
  return rows
    .filter(r => r.is_late)
    .map(r => ({
      id: r.id,
      entry_date: r.entry_date,
      minutes_late: r.minutes_late,
      expected_start_time: r.schedule_expected_start,
      approval_status: 'pending',
      reason_text: null as string | null,
      derived: true as const,
    }));
}
