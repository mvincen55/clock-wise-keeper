import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { getToday } from '@/lib/time-utils';
import {
  currentScheduleByEmployee,
  type ScheduleWeekdayRow,
  type TeamSchedule,
  type WorkingPeriod,
} from '@/lib/provider-working-schedule';
import type { Provider } from '@/lib/providers';

export type ProviderHours = { periods: WorkingPeriod[]; source: string };

type VersionRow = {
  employee_id?: string | null;
  effective_start_date: string;
  effective_end_date: string | null;
  weekdays: ScheduleWeekdayRow[] | null;
};
type AssignmentRow = {
  employee_id: string;
  effective_start: string;
  effective_end: string | null;
  schedule_version: VersionRow | null;
};

/**
 * Weekly working hours the office already holds for each provider: the work
 * schedule saved in Team for the team member the provider is linked to.
 * Schedule Intelligence calibration starts from these instead of asking for
 * a file. Keyed by provider id; a provider with no linked team member or no
 * saved schedule is simply absent.
 */
export function useProviderWorkingHours(providers: Provider[] | undefined) {
  const { data: ctx } = useOrgContext();
  const linked = (providers ?? []).filter((p): p is Provider & { employeeId: string } => !!p.employeeId);
  const employeeIds = [...new Set(linked.map(p => p.employeeId))].sort();

  return useQuery({
    queryKey: ['provider-working-hours', ctx?.org_id, employeeIds],
    enabled: !!ctx?.org_id && employeeIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, ProviderHours>> => {
      const today = getToday();
      const [assignments, versions] = await Promise.all([
        supabase
          .from('schedule_assignments')
          .select(
            'employee_id, effective_start, effective_end, schedule_version:schedule_versions(effective_start_date, effective_end_date, weekdays:schedule_weekdays(weekday, enabled, start_time, end_time))'
          )
          .eq('org_id', ctx!.org_id)
          .in('employee_id', employeeIds),
        supabase
          .from('schedule_versions')
          .select('employee_id, effective_start_date, effective_end_date, weekdays:schedule_weekdays(weekday, enabled, start_time, end_time)')
          .eq('org_id', ctx!.org_id)
          .in('employee_id', employeeIds),
      ]);
      if (assignments.error) throw assignments.error;
      if (versions.error) throw versions.error;

      // Explicit assignments first, then schedules created directly for the
      // employee — the same precedence the server's get_schedule_for_date uses.
      const schedules: TeamSchedule[] = [];
      for (const a of (assignments.data ?? []) as unknown as AssignmentRow[]) {
        if (!a.schedule_version) continue;
        schedules.push({
          employeeId: a.employee_id,
          effectiveStart: a.effective_start,
          effectiveEnd: a.effective_end,
          weekdays: a.schedule_version.weekdays ?? [],
        });
      }
      for (const v of (versions.data ?? []) as unknown as VersionRow[]) {
        if (!v.employee_id) continue;
        schedules.push({
          employeeId: v.employee_id,
          effectiveStart: v.effective_start_date,
          effectiveEnd: v.effective_end_date,
          weekdays: v.weekdays ?? [],
        });
      }

      const byEmployee = currentScheduleByEmployee(schedules, today);
      const result: Record<string, ProviderHours> = {};
      for (const p of linked) {
        const periods = byEmployee.get(p.employeeId);
        if (periods) result[p.id] = { periods, source: `${p.displayName}'s work schedule in Team` };
      }
      return result;
    },
  });
}
