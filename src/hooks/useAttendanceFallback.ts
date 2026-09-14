import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { easternWallMinutes, getToday } from '@/lib/time-utils';
import {
  deriveAttendanceRows,
  type DerivedAttendanceRow,
  type DeriveScheduleAssignment,
} from '@/lib/attendance-derive';

type Range = { start: string; end: string };

/**
 * Derives attendance for employees that have no `attendance_day_status` rows
 * (typically pending members with no login). Everything is fetched by
 * `employee_id`, so login identity is never required.
 */
async function fetchDerived(orgId: string, employeeIds: string[], range: Range): Promise<DerivedAttendanceRow[]> {
  if (!employeeIds.length) return [];

  const [entriesRes, assignmentsRes, versionsRes, daysOffRes, closuresRes] = await Promise.all([
    supabase
      .from('time_entries')
      .select('employee_id, entry_date, is_remote, punches(punch_type, punch_time, voided_at)')
      .in('employee_id', employeeIds)
      .gte('entry_date', range.start)
      .lte('entry_date', range.end),
    supabase
      .from('schedule_assignments')
      .select('employee_id, effective_start, effective_end, schedule_version:schedule_versions(weekdays:schedule_weekdays(weekday, enabled, start_time, end_time, grace_minutes, threshold_minutes))')
      .eq('org_id', orgId)
      .in('employee_id', employeeIds),
    supabase
      .from('schedule_versions')
      .select('employee_id, effective_start_date, effective_end_date, weekdays:schedule_weekdays(weekday, enabled, start_time, end_time, grace_minutes, threshold_minutes)')
      .eq('org_id', orgId)
      .in('employee_id', employeeIds),
    supabase
      .from('days_off')
      .select('employee_id, date_start, date_end, type')
      .in('employee_id', employeeIds)
      .lte('date_start', range.end)
      .gte('date_end', range.start),
    supabase
      .from('office_closures')
      .select('closure_date')
      .eq('org_id', orgId)
      .gte('closure_date', range.start)
      .lte('closure_date', range.end),
  ]);

  const assignments: DeriveScheduleAssignment[] = (assignmentsRes.data || []).map((a: any) => ({
    employee_id: a.employee_id,
    effective_start: a.effective_start,
    effective_end: a.effective_end,
    weekdays: a.schedule_version?.weekdays || [],
  }));

  // Legacy versions without an assignment row still describe the shift.
  const covered = new Set(assignments.map(a => a.employee_id));
  for (const v of (versionsRes.data || []) as any[]) {
    if (!v.employee_id || covered.has(v.employee_id)) continue;
    assignments.push({
      employee_id: v.employee_id,
      effective_start: v.effective_start_date,
      effective_end: v.effective_end_date,
      weekdays: v.weekdays || [],
    });
  }

  return deriveAttendanceRows({
    employeeIds,
    start: range.start,
    end: range.end,
    today: getToday(),
    entries: (entriesRes.data || []) as any[],
    assignments,
    daysOff: (daysOffRes.data || []) as any[],
    closureDates: new Set((closuresRes.data || []).map((c: any) => c.closure_date as string)),
    wallMinutes: easternWallMinutes,
  });
}

/** Derived attendance for a single employee. Enabled only when asked for. */
export function useDerivedEmployeeAttendance(employeeId: string | undefined, range: Range, enabled: boolean) {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['derived-attendance', ctx?.org_id, employeeId, range.start, range.end],
    enabled: !!ctx?.org_id && !!employeeId && enabled,
    queryFn: () => fetchDerived(ctx!.org_id, [employeeId!], range),
  });
}

/** Derived attendance for a set of employees — used by the Team summary. */
export function useDerivedOrgAttendance(employeeIds: string[], range: Range) {
  const { data: ctx } = useOrgContext();
  const key = [...employeeIds].sort().join(',');
  return useQuery({
    queryKey: ['derived-attendance-org', ctx?.org_id, key, range.start, range.end],
    enabled: !!ctx?.org_id && employeeIds.length > 0,
    queryFn: () => fetchDerived(ctx!.org_id, employeeIds, range),
  });
}
