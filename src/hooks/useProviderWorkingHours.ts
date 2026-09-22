import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { formatDate, getToday } from '@/lib/time-utils';
import {
  currentScheduleByEmployee,
  observedHoursByWeekday,
  type ObservedDay,
  type ObservedHours,
  type ScheduleWeekdayRow,
  type TeamSchedule,
  type WorkingPeriod,
} from '@/lib/provider-working-schedule';
import type { Provider } from '@/lib/providers';

export type ProviderHours = {
  periods: WorkingPeriod[];
  source: string;
  /** What the office's own captures have shown for this provider, when there are enough of them. */
  observed?: ObservedHours;
};

/** How far back captures count toward learned hours. */
const OBSERVED_DAYS_BACK = 120;

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

type ObservedRow = {
  employee_id: string | null;
  business_date: string;
  review_status: string;
  first_patient_minute: number | null;
  last_patient_minute: number | null;
  available_start_minute: number | null;
  available_end_minute: number | null;
};

/**
 * Weekly working hours the office already holds for each provider: the work
 * schedule saved in Team for the team member the provider is linked to, and
 * otherwise the hours the office's own schedule captures have shown over the
 * last few months. Schedule Intelligence calibration starts from these
 * instead of asking for a file. Keyed by provider id; a provider with no
 * linked team member, or with neither a saved schedule nor enough captures,
 * is simply absent.
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
      const back = new Date(`${today}T12:00:00Z`);
      back.setUTCDate(back.getUTCDate() - OBSERVED_DAYS_BACK);
      const [assignments, versions, captured] = await Promise.all([
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
        // Reviewed captures only: a day still flagged for review has not
        // earned a place in anyone's hours.
        supabase
          .from('provider_day_metrics')
          .select('employee_id, business_date, review_status, first_patient_minute, last_patient_minute, available_start_minute, available_end_minute')
          .eq('org_id', ctx!.org_id)
          .in('employee_id', employeeIds)
          .in('review_status', ['auto_accepted', 'user_confirmed'])
          .gte('business_date', back.toISOString().slice(0, 10))
          .order('business_date', { ascending: false })
          .limit(600),
      ]);
      if (assignments.error) throw assignments.error;
      if (versions.error) throw versions.error;
      if (captured.error) throw captured.error;

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

      const capturedByEmployee = new Map<string, ObservedDay[]>();
      for (const row of (captured.data ?? []) as unknown as ObservedRow[]) {
        if (!row.employee_id) continue;
        capturedByEmployee.set(row.employee_id, [...(capturedByEmployee.get(row.employee_id) ?? []), {
          businessDate: row.business_date,
          availableStartMinute: row.available_start_minute,
          availableEndMinute: row.available_end_minute,
          firstPatientMinute: row.first_patient_minute,
          lastPatientMinute: row.last_patient_minute,
        }]);
      }

      const result: Record<string, ProviderHours> = {};
      for (const p of linked) {
        const team = byEmployee.get(p.employeeId);
        const observed = observedHoursByWeekday(capturedByEmployee.get(p.employeeId) ?? []) ?? undefined;
        if (team) result[p.id] = { periods: team, source: `${p.displayName}'s work schedule in Team`, observed };
        else if (observed) result[p.id] = { periods: observed.periods, source: `${observed.days} captured days since ${formatDate(observed.since)}`, observed };
      }
      return result;
    },
  });
}
