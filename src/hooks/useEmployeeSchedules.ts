import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { Tables } from '@/integrations/supabase/types';

export type EmployeeScheduleVersion = Tables<'schedule_versions'> & {
  weekdays: Tables<'schedule_weekdays'>[];
  /** Mirrors of the version's dates; empty for a version that never received one. */
  assignments: Tables<'schedule_assignments'>[];
};

/**
 * Every schedule version of an employee, newest first, with its weekday rules
 * and its assignment rows. The version is what attendance follows; the
 * assignment is the manager-facing handle that must mirror it. A version with
 * no assignment (left behind by an older self-service path) is still listed
 * so a manager can see it, correct it, or remove it, instead of colliding
 * with it invisibly.
 */
export function useEmployeeScheduleVersions(employeeId: string | undefined) {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['employee-schedule-versions', employeeId],
    enabled: !!employeeId && !!ctx?.org_id,
    queryFn: async (): Promise<EmployeeScheduleVersion[]> => {
      const { data, error } = await supabase
        .from('schedule_versions')
        .select('*, weekdays:schedule_weekdays(*), assignments:schedule_assignments(*)')
        .eq('employee_id', employeeId!)
        .eq('org_id', ctx!.org_id)
        .order('effective_start_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as EmployeeScheduleVersion[];
    },
  });
}

/**
 * Person-readable copy for the schedule RPCs' rejections. The RPCs already
 * raise plain sentences (an overlap names the other schedule's dates); this
 * covers what PostgREST and the constraints say in their own words.
 */
export function friendlyScheduleError(
  error: { code?: string | null; message?: string | null } | null | undefined,
  fallback = 'Something went wrong while saving the schedule.',
): string {
  if (!error) return fallback;
  if (error.code === '23P01') {
    return 'These dates overlap another schedule for this employee. Edit or remove that schedule first.';
  }
  if (error.code === 'PGRST202' || /could not find the function/i.test(error.message ?? '')) {
    return 'This correction needs a database update that has not been applied yet. Ask whoever deploys Purple Envelope to apply the latest migration, then try again.';
  }
  return error.message || fallback;
}

export function useEmployeeTardies(employeeId: string | undefined, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['employee-tardies', employeeId, startDate, endDate],
    enabled: !!employeeId,
    queryFn: async () => {
      let q = supabase
        .from('tardies')
        .select('*')
        .eq('employee_id', employeeId!)
        .order('entry_date', { ascending: false });
      if (startDate) q = q.gte('entry_date', startDate);
      if (endDate) q = q.lte('entry_date', endDate);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });
}

export function useEmployeeDaysOff(employeeId: string | undefined, startDate?: string, endDate?: string, typeFilter?: string) {
  return useQuery({
    queryKey: ['employee-days-off', employeeId, startDate, endDate, typeFilter],
    enabled: !!employeeId,
    queryFn: async () => {
      let q = supabase
        .from('days_off')
        .select('*')
        .eq('employee_id', employeeId!)
        .order('date_start', { ascending: false });
      if (startDate) q = q.gte('date_end', startDate);
      if (endDate) q = q.lte('date_start', endDate);
      if (typeFilter) q = q.eq('type', typeFilter as any);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });
}
