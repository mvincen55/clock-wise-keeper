import { formatClock } from '@/lib/time-utils';

export type WorkingPeriod = { weekday: number; startMinutes: number; endMinutes: number };
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const time = (raw: string): number | null => {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!m) return null;
  let hour = Number(m[1]); const minute = Number(m[2]);
  if (minute > 59 || hour > 23 || (m[3] && (hour < 1 || hour > 12))) return null;
  if (m[3]) hour = hour % 12 + (m[3].toLowerCase() === 'pm' ? 12 : 0);
  return hour * 60 + minute;
};

/** Extract only weekday/time pairs. The original document is never retained. */
export function parseWorkingSchedule(text: string): WorkingPeriod[] {
  const result: WorkingPeriod[] = [];
  for (const line of text.split(/\r?\n/)) {
    const day = line.match(/^\s*(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sun|Mon|Tue|Wed|Thu|Fri|Sat)\b/i);
    if (!day) continue;
    const weekday = WEEKDAYS.findIndex(d => d.toLowerCase().startsWith(day[1].toLowerCase()));
    if (/\b(closed|off)\b/i.test(line)) { result.push({ weekday, startMinutes: 0, endMinutes: 0 }); continue; }
    const tokens = line.match(/\d{1,2}:\d{2}(?:\s*[ap]m)?/gi) ?? [];
    if (tokens.length !== 2) throw new Error('Each weekday row needs one start and end time, such as Monday,08:00,17:00. Use separate rows for split shifts.');
    const startMinutes = time(tokens[0]); const endMinutes = time(tokens[1]);
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) throw new Error('Check the working hours. Use 24-hour times or include AM/PM; overnight shifts are not supported.');
    result.push({ weekday, startMinutes, endMinutes });
  }
  if (!result.length) throw new Error('No weekday and time rows were found. Use Monday,08:00,17:00 or Monday,off.');
  for (const a of result) for (const b of result) {
    if (a === b || a.weekday !== b.weekday) continue;
    if (a.startMinutes === a.endMinutes || b.startMinutes === b.endMinutes || Math.max(a.startMinutes, b.startMinutes) < Math.min(a.endMinutes, b.endMinutes)) throw new Error('A weekday has overlapping hours or both working hours and an off-day. Correct it before saving.');
  }
  return result.sort((a,b) => a.weekday-b.weekday || a.startMinutes-b.startMinutes);
}
export const workingTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** One weekday row of a saved work schedule (schedule_weekdays). */
export type ScheduleWeekdayRow = { weekday: number; enabled: boolean; start_time: string; end_time: string };

/** A work schedule the office already saved for a team member, with its effective window. */
export type TeamSchedule = {
  employeeId: string;
  effectiveStart: string;
  effectiveEnd: string | null;
  weekdays: ScheduleWeekdayRow[];
};

/**
 * A saved work schedule (Team → schedules) as calibration working periods.
 * Disabled weekdays become explicit off-days; rows with unusable times are
 * skipped rather than guessed.
 */
export function periodsFromWeekdays(rows: ScheduleWeekdayRow[]): WorkingPeriod[] {
  const periods: WorkingPeriod[] = [];
  for (const row of rows) {
    if (typeof row.weekday !== 'number' || row.weekday < 0 || row.weekday > 6) continue;
    if (!row.enabled) { periods.push({ weekday: row.weekday, startMinutes: 0, endMinutes: 0 }); continue; }
    const startMinutes = time(String(row.start_time).slice(0, 5));
    const endMinutes = time(String(row.end_time).slice(0, 5));
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) continue;
    periods.push({ weekday: row.weekday, startMinutes, endMinutes });
  }
  return periods.sort((a, b) => a.weekday - b.weekday || a.startMinutes - b.startMinutes);
}

/**
 * The schedule in force today for each team member: the latest one that has
 * started and not ended. Ties keep the first schedule given, so callers list
 * explicit assignments before direct versions (the same order the server's
 * get_schedule_for_date uses).
 */
export function currentScheduleByEmployee(schedules: TeamSchedule[], today: string): Map<string, WorkingPeriod[]> {
  const chosen = new Map<string, TeamSchedule>();
  for (const s of schedules) {
    if (s.effectiveStart > today || (s.effectiveEnd && s.effectiveEnd < today)) continue;
    const prior = chosen.get(s.employeeId);
    if (!prior || s.effectiveStart > prior.effectiveStart) chosen.set(s.employeeId, s);
  }
  const result = new Map<string, WorkingPeriod[]>();
  for (const [employeeId, s] of chosen) {
    const periods = periodsFromWeekdays(s.weekdays);
    if (periods.length) result.set(employeeId, periods);
  }
  return result;
}

/**
 * Working hours as one readable line — "Mon 8:25 AM–5:00 PM · Tue off" —
 * for a glance-and-confirm summary. Split shifts list every range; unlisted
 * weekdays are left out because they are unknown, not off.
 */
export function describeWorkingHours(periods: WorkingPeriod[]): string {
  const byDay = new Map<number, WorkingPeriod[]>();
  for (const p of [...periods].sort((a, b) => a.weekday - b.weekday || a.startMinutes - b.startMinutes)) {
    byDay.set(p.weekday, [...(byDay.get(p.weekday) ?? []), p]);
  }
  const clock = (minutes: number) => formatClock(workingTime(minutes));
  return [...byDay]
    .map(([weekday, ps]) => `${WEEKDAYS[weekday].slice(0, 3)} ${
      ps.some(p => p.endMinutes === p.startMinutes) ? 'off' : ps.map(p => `${clock(p.startMinutes)}–${clock(p.endMinutes)}`).join(', ')
    }`)
    .join(' · ');
}

export function workingScheduleText(periods: WorkingPeriod[]): string {
  return periods.map(p => `${WEEKDAYS[p.weekday]},${p.endMinutes === p.startMinutes ? 'off' : `${workingTime(p.startMinutes)},${workingTime(p.endMinutes)}`}`).join('\n');
}
