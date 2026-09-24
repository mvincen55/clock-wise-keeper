/**
 * Who the office holds to the time clock.
 *
 * Two kinds of team member never punch: owners (a property of the role,
 * `roleClocksIn`) and people the roster marks `clocks_in = false` — a doctor
 * added to Team with a schedule code so the posted schedule reads against
 * them. Owners are known by user id (the membership), roster exceptions by
 * employee id (they usually have no login), so every attendance surface
 * excludes both, at the data boundary, before any attendance math sees them.
 */

export type ClockingEmployee = { id: string; user_id?: string | null; clocks_in?: boolean | null };

/** True when this roster record is held to the clock. */
export function employeeClocksIn(employee: ClockingEmployee, ownerUserIds: ReadonlySet<string>): boolean {
  if (employee.clocks_in === false) return false;
  return !employee.user_id || !ownerUserIds.has(employee.user_id);
}

/** Employee ids that never clock: roster exceptions plus the owners' own records. */
export function nonClockingEmployeeIds(employees: ClockingEmployee[], ownerUserIds: ReadonlySet<string> = new Set()): Set<string> {
  return new Set(employees.filter(e => !employeeClocksIn(e, ownerUserIds)).map(e => e.id));
}

/** True when an attendance-shaped row belongs to someone who clocks. */
export function rowClocksIn(
  row: { employee_id?: string | null; user_id?: string | null },
  ownerUserIds: ReadonlySet<string>,
  nonClockingIds: ReadonlySet<string> = new Set(),
): boolean {
  if (row.user_id && ownerUserIds.has(row.user_id)) return false;
  if (row.employee_id && nonClockingIds.has(row.employee_id)) return false;
  return true;
}
