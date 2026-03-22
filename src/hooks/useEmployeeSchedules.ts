import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';

export function useEmployeeScheduleAssignments(employeeId: string | undefined) {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['employee-schedule-assignments', employeeId],
    enabled: !!employeeId && !!ctx?.org_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schedule_assignments')
        .select('*, schedule_version:schedule_versions(*, weekdays:schedule_weekdays(*))')
        .eq('employee_id', employeeId!)
        .eq('org_id', ctx!.org_id)
        .order('effective_start', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
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

export function useEmployeeDaysOff(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['employee-days-off', employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('days_off')
        .select('*')
        .eq('employee_id', employeeId!)
        .order('date_start', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });
}
